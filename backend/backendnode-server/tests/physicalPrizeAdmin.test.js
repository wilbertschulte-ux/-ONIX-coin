const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

process.env.NODE_ENV = 'test';
process.env.BOT_TOKEN = process.env.BOT_TOKEN || 'physical-prize-admin-test-token';

const PhysicalPrizeRequest = require('../models/PhysicalPrizeRequest');
const FortuneWheelProgress = require('../models/FortuneWheelProgress');
const {
  PHYSICAL_PRIZE_STATUSES,
  buildAdminPhysicalPrizeFilter,
  normalizeAdminPhysicalPrizeListQuery,
  parseCancellationReasons,
  serializeAdminPhysicalPrizeRequest,
  validateColorCorrection,
  validateStatusTransition,
} = require('../physicalPrizeAdmin');
const { serializePhysicalPrizeRequest } = require('../fortuneWheel');
const router = require('../routes/coinRoutes');

const listRoute = router.stack.find((layer) => layer.route?.path === '/admin-physical-prizes' && layer.route?.methods?.get);
const statusRoute = router.stack.find((layer) => layer.route?.path === '/admin-physical-prizes/:requestId/status' && layer.route?.methods?.post);
const colorRoute = router.stack.find((layer) => layer.route?.path === '/admin-physical-prizes/:requestId/color' && layer.route?.methods?.post);
assert.ok(listRoute && statusRoute && colorRoute);

const {
  getAdminAuditActor,
  performAdminPhysicalPrizeColorCorrection,
  performAdminPhysicalPrizeStatusUpdate,
} = router.__physicalPrizeAdminTestUtils;

const originalAdminId = process.env.ADMIN_TELEGRAM_ID;
const originalCancellationReasons = process.env.FORTUNE_WHEEL_CANCELLATION_REASONS;

test.afterEach(() => {
  if (originalAdminId === undefined) delete process.env.ADMIN_TELEGRAM_ID;
  else process.env.ADMIN_TELEGRAM_ID = originalAdminId;
  if (originalCancellationReasons === undefined) delete process.env.FORTUNE_WHEEL_CANCELLATION_REASONS;
  else process.env.FORTUNE_WHEEL_CANCELLATION_REASONS = originalCancellationReasons;
});

function baseRequest(overrides = {}) {
  return {
    _id: 'request-object-id',
    requestId: 'request-1',
    campaignKey: 'fortune-wheel-v1',
    telegramId: '9001',
    fortuneWheelProgressId: 'wheel-progress-1',
    telegramUsernameSnapshot: 'winner',
    prizeCode: 'iphone_duo',
    color: 'gold',
    status: 'pending',
    statusHistory: [{ action: 'created', status: 'pending', color: 'gold', changedAt: new Date(), changedBy: 'player' }],
    createdAt: new Date('2026-10-24T10:00:00Z'),
    updatedAt: new Date('2026-10-24T10:00:00Z'),
    __v: 0,
    ...overrides,
  };
}

function createSignedInitData(telegramId) {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: `physical-prize-${telegramId}`,
    user: JSON.stringify({ id: Number(telegramId), first_name: 'Admin' }),
  });
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN).digest();
  params.set('hash', crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex'));
  return params.toString();
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

async function invokeRoute(route, req) {
  const response = createResponse();
  await route.route.stack[0].handle(req, response);
  return response;
}

test('model and server expose the exact physical prize lifecycle and useful indexes', () => {
  assert.deepEqual(PHYSICAL_PRIZE_STATUSES, ['pending', 'approved', 'preparing', 'shipped', 'delivered', 'cancelled']);
  assert.deepEqual(PhysicalPrizeRequest.schema.path('status').enumValues, PHYSICAL_PRIZE_STATUSES);
  const indexes = PhysicalPrizeRequest.schema.indexes();
  assert.ok(indexes.some(([fields, options]) => fields.requestId === 1 && options.unique));
  assert.ok(indexes.some(([fields]) => fields.status === 1 && fields.createdAt === -1 && fields._id === -1));
  assert.ok(indexes.some(([fields]) => fields.telegramId === 1 && fields.createdAt === -1));
});

test('list query validates filters, bounds pagination and escapes search input', () => {
  const normalized = normalizeAdminPhysicalPrizeListQuery({ status: 'pending', search: '$where.*', sort: 'oldest', page: '2', limit: '500' });
  assert.equal(normalized.ok, true);
  assert.equal(normalized.page, 2);
  assert.equal(normalized.limit, 50);
  const filter = buildAdminPhysicalPrizeFilter(normalized);
  assert.equal(filter.status, 'pending');
  assert.equal(filter.$or.length, 2);
  assert.equal(filter.$or[0].requestId.flags, '');
  assert.equal(filter.$or[0].requestId.test('$where.*'), true);
  assert.equal(filter.$or[0].requestId.test('anything'), false);
  assert.equal(normalizeAdminPhysicalPrizeListQuery({ status: 'forged' }).ok, false);
  assert.equal(normalizeAdminPhysicalPrizeListQuery({ sort: 'random' }).ok, false);
});

test('status transitions are ordered and cancellation fails closed without configured reason and resolution', () => {
  const request = baseRequest();
  const common = { request, expectedVersion: 0, idempotencyKey: 'status-change-0001', reason: 'Verified eligibility' };
  assert.equal(validateStatusTransition({ ...common, nextStatus: 'approved' }).ok, true);
  assert.equal(validateStatusTransition({ ...common, nextStatus: 'shipped' }).code, 'INVALID_PHYSICAL_PRIZE_TRANSITION');
  assert.equal(validateStatusTransition({ ...common, nextStatus: 'cancelled' }).code, 'CANCELLATION_REASON_NOT_ALLOWED');
  assert.equal(validateStatusTransition({ ...common, nextStatus: 'cancelled', reasonCode: 'documented', resolution: 'replacement remains pending', cancellationReasons: ['documented'] }).ok, true);
  const approved = baseRequest({ status: 'approved' });
  assert.equal(validateStatusTransition({ ...common, request: approved, nextStatus: 'cancelled', reasonCode: 'documented', resolution: 'x', cancellationReasons: ['documented'] }).code, 'INVALID_PHYSICAL_PRIZE_TRANSITION');
});

test('cancellation reason configuration accepts only safe explicit codes', () => {
  assert.deepEqual(parseCancellationReasons({}), []);
  assert.deepEqual(parseCancellationReasons({ FORTUNE_WHEEL_CANCELLATION_REASONS: 'document_missing, bad value,$where,document_missing' }), ['document_missing']);
});

test('color correction requires allowlisted changed color, reason and an unshipped request', () => {
  const request = baseRequest();
  const input = { request, color: 'midnight', reason: 'Player support correction', expectedVersion: 0, idempotencyKey: 'color-change-0001', allowedColors: ['gold', 'midnight'] };
  assert.equal(validateColorCorrection(input).ok, true);
  assert.equal(validateColorCorrection({ ...input, color: 'invented' }).code, 'INVALID_IPHONE_COLOR');
  assert.equal(validateColorCorrection({ ...input, color: 'gold' }).code, 'PHYSICAL_PRIZE_COLOR_UNCHANGED');
  assert.equal(validateColorCorrection({ ...input, request: baseRequest({ status: 'shipped' }) }).code, 'PHYSICAL_PRIZE_COLOR_LOCKED');
});

test('admin serializer provides full audit data while preserving transition policy', () => {
  const serialized = serializeAdminPhysicalPrizeRequest(baseRequest(), { cancellationReasons: [] });
  assert.deepEqual(serialized.allowedTransitions, ['approved']);
  assert.equal(serialized.statusHistory[0].changedBy, 'player');
  assert.equal(serialized.telegramUsername, 'winner');
  assert.equal(serialized.version, 0);
});

test('ordinary and mismatched Telegram users cannot list or mutate physical prize requests', async () => {
  process.env.ADMIN_TELEGRAM_ID = '9000';
  const ordinaryInitData = createSignedInitData('9001');
  const request = {
    query: { telegramId: '9001' }, body: { telegramId: '9001' }, params: { requestId: 'request-1' },
    get(name) { return name.toLowerCase() === 'x-telegram-init-data' ? ordinaryInitData : ''; },
  };
  assert.equal((await invokeRoute(listRoute, request)).statusCode, 403);
  assert.equal((await invokeRoute(statusRoute, request)).statusCode, 403);
  assert.equal((await invokeRoute(colorRoute, request)).statusCode, 403);
});

test('audit actor trusts a signed Telegram identity only when it matches the configured administrator', () => {
  process.env.ADMIN_TELEGRAM_ID = '9000';
  const adminInitData = createSignedInitData('9000');
  const ordinaryInitData = createSignedInitData('9001');
  assert.equal(getAdminAuditActor({ get: () => adminInitData }), 'telegram:9000');
  assert.equal(getAdminAuditActor({ get: () => ordinaryInitData }), 'admin-secret');
  assert.equal(getAdminAuditActor({ get: () => '' }), 'admin-secret');
});

test('signed administrator can list filtered requests with server pagination', async () => {
  const originalFind = PhysicalPrizeRequest.find;
  const originalCountDocuments = PhysicalPrizeRequest.countDocuments;
  process.env.ADMIN_TELEGRAM_ID = '9000';
  const requestDocument = baseRequest();
  let observedFilter = null;
  let observedSort = null;
  let observedSkip = null;
  let observedLimit = null;
  PhysicalPrizeRequest.find = (filter) => {
    observedFilter = filter;
    return {
      sort(value) { observedSort = value; return this; },
      skip(value) { observedSkip = value; return this; },
      limit(value) { observedLimit = value; return this; },
      lean: async () => [requestDocument],
    };
  };
  PhysicalPrizeRequest.countDocuments = async () => 45;
  try {
    const initData = createSignedInitData('9000');
    const req = {
      query: { telegramId: '9000', status: 'pending', search: 'request', sort: 'oldest', page: '2', limit: '20' },
      get(name) { return name.toLowerCase() === 'x-telegram-init-data' ? initData : ''; },
    };
    const response = await invokeRoute(listRoute, req);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.requests.length, 1);
    assert.equal(response.body.pagination.totalPages, 3);
    assert.equal(response.body.pagination.hasPrevPage, true);
    assert.equal(response.body.pagination.hasNextPage, true);
    assert.equal(observedFilter.status, 'pending');
    assert.equal(observedFilter.$or[0].requestId.test('request-1'), true);
    assert.deepEqual(observedSort, { createdAt: 1, _id: 1 });
    assert.equal(observedSkip, 20);
    assert.equal(observedLimit, 20);
  } finally {
    PhysicalPrizeRequest.find = originalFind;
    PhysicalPrizeRequest.countDocuments = originalCountDocuments;
  }
});

test('player status serialization never exposes administrative audit reasons or actors', () => {
  const request = baseRequest({
    statusHistory: [{
      action: 'status_changed', status: 'approved', changedAt: new Date(), changedBy: 'telegram:9000',
      comment: 'internal verification note', resolution: 'internal resolution', operationKey: 'private-operation',
    }],
  });
  const safe = serializePhysicalPrizeRequest(request);
  assert.deepEqual(Object.keys(safe.statusHistory[0]).sort(), ['changedAt', 'status']);
  assert.equal(JSON.stringify(safe).includes('internal verification note'), false);
  assert.equal(JSON.stringify(safe).includes('telegram:9000'), false);
});

test('status update appends immutable audit history and an identical replay is idempotent', async () => {
  const originalFindOne = PhysicalPrizeRequest.findOne;
  const originalFindOneAndUpdate = PhysicalPrizeRequest.findOneAndUpdate;
  const request = baseRequest();
  PhysicalPrizeRequest.findOne = () => ({ session: async () => request });
  PhysicalPrizeRequest.findOneAndUpdate = async (filter, update) => {
    assert.equal(filter.__v, 0);
    request.status = update.$set.status;
    request.reviewedBy = update.$set.reviewedBy;
    request.statusHistory.push(update.$push.statusHistory);
    request.__v += update.$inc.__v;
    return request;
  };
  try {
    const payload = { nextStatus: 'approved', reason: 'Identity verified', expectedVersion: 0, idempotencyKey: 'status-change-0001' };
    const first = await performAdminPhysicalPrizeStatusUpdate({ requestId: request.requestId, payload, actor: 'telegram:9000', session: {}, cancellationReasons: [] });
    assert.equal(first.status, 'success');
    assert.equal(first.idempotent, false);
    assert.equal(request.statusHistory.at(-1).previousStatus, 'pending');
    assert.equal(request.statusHistory.at(-1).changedBy, 'telegram:9000');
    const replay = await performAdminPhysicalPrizeStatusUpdate({ requestId: request.requestId, payload, actor: 'telegram:9000', session: {}, cancellationReasons: [] });
    assert.equal(replay.status, 'success');
    assert.equal(replay.idempotent, true);
    assert.equal(request.statusHistory.length, 2);
  } finally {
    PhysicalPrizeRequest.findOne = originalFindOne;
    PhysicalPrizeRequest.findOneAndUpdate = originalFindOneAndUpdate;
  }
});

test('delivered transition fulfills the linked reservation in the same transaction session', async () => {
  const originalFindOne = PhysicalPrizeRequest.findOne;
  const originalFindOneAndUpdate = PhysicalPrizeRequest.findOneAndUpdate;
  const originalProgressFindOneAndUpdate = FortuneWheelProgress.findOneAndUpdate;
  const request = baseRequest({ status: 'shipped', __v: 4 });
  const session = { id: 'delivery-session' };
  let progressMutation = null;
  PhysicalPrizeRequest.findOne = () => ({ session: async (observedSession) => {
    assert.equal(observedSession, session);
    return request;
  } });
  PhysicalPrizeRequest.findOneAndUpdate = async (_filter, update, options) => {
    assert.equal(options.session, session);
    request.status = update.$set.status;
    request.statusHistory.push(update.$push.statusHistory);
    request.__v += update.$inc.__v;
    return request;
  };
  FortuneWheelProgress.findOneAndUpdate = async (filter, update, options) => {
    progressMutation = { filter, update, options };
    return { _id: request.fortuneWheelProgressId, physicalPrizeReservation: { status: 'fulfilled' } };
  };
  try {
    const result = await performAdminPhysicalPrizeStatusUpdate({
      requestId: request.requestId,
      payload: {
        nextStatus: 'delivered',
        reason: 'Carrier delivery confirmed',
        expectedVersion: 4,
        idempotencyKey: 'status-delivered-0001',
      },
      actor: 'telegram:9000',
      session,
      cancellationReasons: [],
    });
    assert.equal(result.status, 'success');
    assert.equal(request.status, 'delivered');
    assert.deepEqual(progressMutation.filter, {
      _id: 'wheel-progress-1',
      campaignKey: 'fortune-wheel-v1',
      telegramId: '9001',
      'physicalPrizeReservation.status': { $in: ['reserved', 'fulfilled'] },
    });
    assert.deepEqual(progressMutation.update, {
      $set: { 'physicalPrizeReservation.status': 'fulfilled' },
    });
    assert.equal(progressMutation.options.session, session);
    assert.equal(progressMutation.options.runValidators, true);
  } finally {
    PhysicalPrizeRequest.findOne = originalFindOne;
    PhysicalPrizeRequest.findOneAndUpdate = originalFindOneAndUpdate;
    FortuneWheelProgress.findOneAndUpdate = originalProgressFindOneAndUpdate;
  }
});

test('delivered transition fails closed when its linked reservation cannot be fulfilled', async () => {
  const originalFindOne = PhysicalPrizeRequest.findOne;
  const originalFindOneAndUpdate = PhysicalPrizeRequest.findOneAndUpdate;
  const originalProgressFindOneAndUpdate = FortuneWheelProgress.findOneAndUpdate;
  const request = baseRequest({ status: 'shipped', __v: 2 });
  const session = { id: 'delivery-session' };
  PhysicalPrizeRequest.findOne = () => ({ session: async () => request });
  PhysicalPrizeRequest.findOneAndUpdate = async (_filter, update) => ({
    ...request,
    status: update.$set.status,
    __v: 3,
  });
  FortuneWheelProgress.findOneAndUpdate = async () => null;
  try {
    await assert.rejects(
      performAdminPhysicalPrizeStatusUpdate({
        requestId: request.requestId,
        payload: {
          nextStatus: 'delivered',
          reason: 'Carrier delivery confirmed',
          expectedVersion: 2,
          idempotencyKey: 'status-delivered-0002',
        },
        actor: 'telegram:9000',
        session,
        cancellationReasons: [],
      }),
      /reservation is missing/
    );
  } finally {
    PhysicalPrizeRequest.findOne = originalFindOne;
    PhysicalPrizeRequest.findOneAndUpdate = originalFindOneAndUpdate;
    FortuneWheelProgress.findOneAndUpdate = originalProgressFindOneAndUpdate;
  }
});

test('missing operation key is rejected before idempotency history lookup', async () => {
  const originalFindOne = PhysicalPrizeRequest.findOne;
  const originalFindOneAndUpdate = PhysicalPrizeRequest.findOneAndUpdate;
  const request = baseRequest();
  let wrote = false;
  PhysicalPrizeRequest.findOne = () => ({ session: async () => request });
  PhysicalPrizeRequest.findOneAndUpdate = async () => {
    wrote = true;
    return request;
  };
  try {
    const statusResult = await performAdminPhysicalPrizeStatusUpdate({
      requestId: request.requestId,
      payload: { nextStatus: 'approved', reason: 'Verified', expectedVersion: 0 },
      actor: 'telegram:9000', session: {}, cancellationReasons: [],
    });
    const colorResult = await performAdminPhysicalPrizeColorCorrection({
      requestId: request.requestId,
      payload: { color: 'midnight', reason: 'Support correction', expectedVersion: 0 },
      actor: 'telegram:9000', session: {}, allowedColors: ['gold', 'midnight'],
    });
    assert.equal(statusResult.status, 'invalid');
    assert.equal(statusResult.code, 'INVALID_IDEMPOTENCY_KEY');
    assert.equal(colorResult.status, 'invalid');
    assert.equal(colorResult.code, 'INVALID_IDEMPOTENCY_KEY');
    assert.equal(wrote, false);
  } finally {
    PhysicalPrizeRequest.findOne = originalFindOne;
    PhysicalPrizeRequest.findOneAndUpdate = originalFindOneAndUpdate;
  }
});

test('optimistic version check blocks a concurrent second administrative operation', async () => {
  const originalFindOne = PhysicalPrizeRequest.findOne;
  const originalFindOneAndUpdate = PhysicalPrizeRequest.findOneAndUpdate;
  const request = baseRequest();
  PhysicalPrizeRequest.findOne = () => ({ session: async () => ({ ...request, statusHistory: [...request.statusHistory] }) });
  let committed = false;
  PhysicalPrizeRequest.findOneAndUpdate = async (filter, update) => {
    if (committed || filter.__v !== request.__v) return null;
    committed = true;
    request.status = update.$set.status;
    request.statusHistory.push(update.$push.statusHistory);
    request.__v += 1;
    return request;
  };
  try {
    const calls = ['status-change-0001', 'status-change-0002'].map((idempotencyKey) =>
      performAdminPhysicalPrizeStatusUpdate({
        requestId: request.requestId,
        payload: { nextStatus: 'approved', reason: 'Verified', expectedVersion: 0, idempotencyKey },
        actor: 'telegram:9000', session: {}, cancellationReasons: [],
      })
    );
    const results = await Promise.all(calls);
    assert.equal(results.filter((result) => result.status === 'success').length, 1);
    assert.equal(results.filter((result) => result.status === 'version_conflict').length, 1);
    assert.equal(request.statusHistory.length, 2);
  } finally {
    PhysicalPrizeRequest.findOne = originalFindOne;
    PhysicalPrizeRequest.findOneAndUpdate = originalFindOneAndUpdate;
  }
});

test('color correction changes one field and records old/new color in audit history', async () => {
  const originalFindOne = PhysicalPrizeRequest.findOne;
  const originalFindOneAndUpdate = PhysicalPrizeRequest.findOneAndUpdate;
  const request = baseRequest();
  PhysicalPrizeRequest.findOne = () => ({ session: async () => request });
  PhysicalPrizeRequest.findOneAndUpdate = async (_filter, update) => {
    request.color = update.$set.color;
    request.statusHistory.push(update.$push.statusHistory);
    request.__v += 1;
    return request;
  };
  try {
    const result = await performAdminPhysicalPrizeColorCorrection({
      requestId: request.requestId,
      payload: { color: 'midnight', reason: 'Support correction', expectedVersion: 0, idempotencyKey: 'color-change-0001' },
      actor: 'telegram:9000', session: {}, allowedColors: ['gold', 'midnight'],
    });
    assert.equal(result.status, 'success');
    assert.equal(request.color, 'midnight');
    assert.equal(request.statusHistory.at(-1).action, 'color_corrected');
    assert.equal(request.statusHistory.at(-1).previousColor, 'gold');
  } finally {
    PhysicalPrizeRequest.findOne = originalFindOne;
    PhysicalPrizeRequest.findOneAndUpdate = originalFindOneAndUpdate;
  }
});
