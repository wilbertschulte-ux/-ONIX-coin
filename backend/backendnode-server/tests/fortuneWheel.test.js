const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

process.env.NODE_ENV = 'test';
const TEST_BOT_TOKEN = 'isolated-fortune-wheel-test-token';
process.env.BOT_TOKEN = TEST_BOT_TOKEN;

const FortuneWheelProgress = require('../models/FortuneWheelProgress');
const PhysicalPrizeRequest = require('../models/PhysicalPrizeRequest');
const User = require('../models/User');
const {
  FORTUNE_WHEEL_REWARDS,
  buildFortuneWheelStatus,
  evaluateFortuneWheelEligibility,
  evaluatePhysicalPrizeCompletionEligibility,
  getConfiguredReservationSlot,
  getFortuneWheelCampaignConfig,
  reserveFortuneWheelEntry,
  serializePhysicalPrizeRequest,
  validateIphoneColorRequest,
  validateSpinRequest,
} = require('../fortuneWheel');
const router = require('../routes/coinRoutes');

const statusRoute = router.stack.find(
  (layer) => layer.route?.path === '/fortune-wheel/status' && layer.route?.methods?.get
);
assert.ok(statusRoute, 'GET /fortune-wheel/status route is registered');
const spinRoute = router.stack.find(
  (layer) => layer.route?.path === '/fortune-wheel/spin' && layer.route?.methods?.post
);
assert.ok(spinRoute, 'POST /fortune-wheel/spin route is registered');
const { performFortuneWheelSpin } = router.__fortuneWheelTestUtils;
const iphoneColorRoute = router.stack.find(
  (layer) => layer.route?.path === '/fortune-wheel/iphone-color' && layer.route?.methods?.post
);
assert.ok(iphoneColorRoute, 'POST /fortune-wheel/iphone-color route is registered');
const { performIphoneColorSelection } = router.__fortuneWheelTestUtils;

const campaignEnvironmentKeys = [
  'FORTUNE_WHEEL_ENABLED',
  'FORTUNE_WHEEL_CAMPAIGN_APPROVED',
  'FORTUNE_WHEEL_CAMPAIGN_KEY',
  'FORTUNE_WHEEL_PHYSICAL_PRIZE_CAPACITY',
  'FORTUNE_WHEEL_ELIGIBLE_TELEGRAM_IDS',
  'FORTUNE_WHEEL_IPHONE_COLORS',
  'FORTUNE_WHEEL_STARTS_AT',
  'FORTUNE_WHEEL_ENDS_AT',
];
const originalCampaignEnvironment = Object.fromEntries(
  campaignEnvironmentKeys.map((key) => [key, process.env[key]])
);

test.afterEach(() => {
  for (const key of campaignEnvironmentKeys) delete process.env[key];
});

test.after(() => {
  for (const [key, value] of Object.entries(originalCampaignEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function createSignedInitData(telegramId) {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: `fortune-wheel-${telegramId}`,
    user: JSON.stringify({ id: Number(telegramId), first_name: 'Wheel' }),
  });
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(TEST_BOT_TOKEN)
    .digest();
  const hash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');
  params.set('hash', hash);
  return params.toString();
}

function createRequest(initData = '') {
  return {
    body: {},
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    get(name) {
      return name.toLowerCase() === 'x-telegram-init-data' ? initData : '';
    },
  };
}

function createResponse() {
  const listeners = new Map();
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      for (const listener of listeners.get('finish') || []) listener();
      return this;
    },
    once(event, callback) {
      const current = listeners.get(event) || [];
      current.push(callback);
      listeners.set(event, current);
      return this;
    },
  };
}

async function invokeStatusRoute(req) {
  const res = createResponse();
  const stack = statusRoute.route.stack;

  async function dispatch(index) {
    const layer = stack[index];
    if (!layer) return undefined;
    return layer.handle(req, res, () => dispatch(index + 1));
  }

  await dispatch(0);
  return res;
}

async function invokeSpinRoute(req) {
  const res = createResponse();
  const stack = spinRoute.route.stack;
  async function dispatch(index) {
    const layer = stack[index];
    if (!layer) return undefined;
    return layer.handle(req, res, () => dispatch(index + 1));
  }
  await dispatch(0);
  return res;
}

async function invokeIphoneColorRoute(req) {
  const res = createResponse();
  const stack = iphoneColorRoute.route.stack;
  async function dispatch(index) {
    const layer = stack[index];
    if (!layer) return undefined;
    return layer.handle(req, res, () => dispatch(index + 1));
  }
  await dispatch(0);
  return res;
}

function queryResult(value) {
  return {
    select() {
      return this;
    },
    lean() {
      return Promise.resolve(value);
    },
    session() {
      return this;
    },
    then(resolve, reject) {
      return Promise.resolve(value).then(resolve, reject);
    },
  };
}

test('reward map is fixed, ordered and guaranteed', () => {
  assert.deepEqual(FORTUNE_WHEEL_REWARDS, [
    { spin: 1, type: 'onix', amount: 50000 },
    { spin: 2, type: 'onix', amount: 250000 },
    { spin: 3, type: 'physical_prize', prizeCode: 'iphone_duo' },
  ]);
  assert.equal(Object.isFrozen(FORTUNE_WHEEL_REWARDS), true);
  assert.equal(FORTUNE_WHEEL_REWARDS.every(Object.isFrozen), true);
});

test('campaign fails closed while parameters are unapproved', () => {
  const config = getFortuneWheelCampaignConfig({});
  assert.equal(config.enabled, false);
  assert.equal(config.approved, false);
  assert.equal(config.physicalPrizeCapacity, 0);
  assert.equal(config.eligibleTelegramIds.size, 0);
  assert.deepEqual(config.iphoneColors, []);

  assert.deepEqual(
    evaluateFortuneWheelEligibility({
      telegramId: '9001',
      user: { telegramId: '9001', isFrozen: false },
      progress: null,
      config,
    }),
    { eligible: false, admitted: false, code: 'CAMPAIGN_DISABLED' }
  );
});

test('only explicitly allowlisted users with reserved capacity and colors can enter', () => {
  const config = getFortuneWheelCampaignConfig({
    FORTUNE_WHEEL_ENABLED: 'true',
    FORTUNE_WHEEL_CAMPAIGN_APPROVED: 'true',
    FORTUNE_WHEEL_PHYSICAL_PRIZE_CAPACITY: '2',
    FORTUNE_WHEEL_ELIGIBLE_TELEGRAM_IDS: '9001,9002,invalid-id',
    FORTUNE_WHEEL_IPHONE_COLORS: 'midnight,gold',
  });

  assert.equal(evaluateFortuneWheelEligibility({
    telegramId: '9001',
    user: { telegramId: '9001', isFrozen: false },
    progress: null,
    config,
  }).code, 'RESERVATION_AVAILABLE');
  assert.equal(evaluateFortuneWheelEligibility({
    telegramId: '9999',
    user: { telegramId: '9999', isFrozen: false },
    progress: null,
    config,
  }).code, 'NOT_OFFICIALLY_ELIGIBLE');
  assert.equal(getConfiguredReservationSlot(config, '9001'), 1);
  assert.equal(getConfiguredReservationSlot(config, '9002'), 2);
});

function unlockedPhysicalPrizeProgress() {
  return {
    completedSpins: 3,
    claims: [{
      spin: 3,
      rewardType: 'physical_prize',
      prizeCode: 'iphone_duo',
      amount: 0,
      idempotencyKey: 'wheel:9001:spin:3',
      claimedAt: new Date('2026-10-24T10:02:00Z'),
    }],
    physicalPrizeReservation: {
      slot: 1,
      reservedAt: new Date('2026-10-24T10:00:00Z'),
      status: 'reserved',
    },
    iphoneUnlockedAt: new Date('2026-10-24T10:02:00Z'),
    physicalPrizeRequestId: null,
  };
}

test('closed campaign blocks spins but preserves completion of an already unlocked physical prize', () => {
  const user = { telegramId: '9001', isFrozen: false };
  const progress = unlockedPhysicalPrizeProgress();
  const cases = [
    {
      expectedCode: 'CAMPAIGN_DISABLED',
      config: getFortuneWheelCampaignConfig({
        FORTUNE_WHEEL_ENABLED: 'false',
        FORTUNE_WHEEL_CAMPAIGN_APPROVED: 'true',
        FORTUNE_WHEEL_IPHONE_COLORS: 'midnight,gold',
      }),
      now: new Date('2026-10-24T10:04:00Z'),
    },
    {
      expectedCode: 'CAMPAIGN_NOT_APPROVED',
      config: getFortuneWheelCampaignConfig({
        FORTUNE_WHEEL_ENABLED: 'true',
        FORTUNE_WHEEL_CAMPAIGN_APPROVED: 'false',
        FORTUNE_WHEEL_IPHONE_COLORS: 'midnight,gold',
      }),
      now: new Date('2026-10-24T10:04:00Z'),
    },
    {
      expectedCode: 'CAMPAIGN_ENDED',
      config: getFortuneWheelCampaignConfig({
        FORTUNE_WHEEL_ENABLED: 'true',
        FORTUNE_WHEEL_CAMPAIGN_APPROVED: 'true',
        FORTUNE_WHEEL_STARTS_AT: '2026-10-01T00:00:00Z',
        FORTUNE_WHEEL_ENDS_AT: '2026-10-20T00:00:00Z',
        FORTUNE_WHEEL_IPHONE_COLORS: 'midnight,gold',
      }),
      now: new Date('2026-10-24T10:04:00Z'),
    },
  ];

  for (const scenario of cases) {
    const spinEligibility = evaluateFortuneWheelEligibility({
      telegramId: user.telegramId,
      user,
      progress,
      config: scenario.config,
      now: scenario.now,
    });
    assert.equal(spinEligibility.eligible, false);
    assert.equal(spinEligibility.code, scenario.expectedCode);
    assert.deepEqual(
      evaluatePhysicalPrizeCompletionEligibility({ user, progress, config: scenario.config }),
      { eligible: true, code: 'PHYSICAL_PRIZE_COMPLETION_AVAILABLE' }
    );
  }
});

test('closed campaign status exposes an existing entitlement and request without reopening spins', () => {
  const user = { telegramId: '9001', isFrozen: false };
  const progress = unlockedPhysicalPrizeProgress();
  const config = getFortuneWheelCampaignConfig({
    FORTUNE_WHEEL_ENABLED: 'false',
    FORTUNE_WHEEL_CAMPAIGN_APPROVED: 'false',
    FORTUNE_WHEEL_IPHONE_COLORS: 'midnight,gold',
  });
  const selectable = buildFortuneWheelStatus({ user, progress, config });
  assert.equal(selectable.enabled, false);
  assert.equal(selectable.eligibility.eligible, false);
  assert.equal(selectable.nextSpin, null);
  assert.equal(selectable.physicalPrize.canSelectColor, true);
  assert.deepEqual(selectable.physicalPrize.colors, ['midnight', 'gold']);

  const request = {
    requestId: 'request-public-id',
    campaignKey: config.campaignKey,
    prizeCode: 'iphone_duo',
    color: 'gold',
    status: 'approved',
    createdAt: new Date('2026-10-24T10:03:00Z'),
    statusHistory: [],
  };
  const persisted = buildFortuneWheelStatus({
    user,
    progress: { ...progress, physicalPrizeRequestId: 'request-object-id' },
    physicalPrizeRequest: request,
    config,
  });
  assert.equal(persisted.physicalPrize.canSelectColor, false);
  assert.equal(persisted.physicalPrize.request.requestId, 'request-public-id');
  assert.equal(persisted.physicalPrize.request.status, 'approved');
});

test('official allowlist order cannot admit more users than reserved capacity', () => {
  const config = getFortuneWheelCampaignConfig({
    FORTUNE_WHEEL_ENABLED: 'true',
    FORTUNE_WHEEL_CAMPAIGN_APPROVED: 'true',
    FORTUNE_WHEEL_PHYSICAL_PRIZE_CAPACITY: '1',
    FORTUNE_WHEEL_ELIGIBLE_TELEGRAM_IDS: '9001,9002',
    FORTUNE_WHEEL_IPHONE_COLORS: 'midnight',
  });

  assert.equal(evaluateFortuneWheelEligibility({
    telegramId: '9002',
    user: { telegramId: '9002', isFrozen: false },
    progress: null,
    config,
  }).code, 'NO_PHYSICAL_PRIZE_CAPACITY');
  assert.equal(getConfiguredReservationSlot(config, '9002'), null);
});

test('FortuneWheelProgress enforces unique player progress and reservation slots', () => {
  const indexes = FortuneWheelProgress.schema.indexes();
  assert.ok(indexes.some(([keys, options]) =>
    keys.campaignKey === 1 && keys.telegramId === 1 && options.unique === true
  ));
  assert.ok(indexes.some(([keys, options]) =>
    keys.campaignKey === 1 && keys['physicalPrizeReservation.slot'] === 1 && options.unique === true
  ));
});

test('FortuneWheelProgress rejects duplicate claim entries in one player document', () => {
  const progress = new FortuneWheelProgress({
    campaignKey: 'fortune-wheel-v1',
    telegramId: '9001',
    completedSpins: 2,
    physicalPrizeReservation: {
      slot: 1,
      reservedAt: new Date(),
      status: 'reserved',
    },
    claims: [
      { spin: 1, rewardType: 'onix', amount: 50000, idempotencyKey: 'spin-key-0001', claimedAt: new Date() },
      { spin: 1, rewardType: 'onix', amount: 50000, idempotencyKey: 'spin-key-0002', claimedAt: new Date() },
    ],
  });

  const validationError = progress.validateSync();
  assert.match(validationError?.errors?.claims?.message || '', /unique spins/);
});

test('PhysicalPrizeRequest enforces one request per progress and prize', () => {
  const indexes = PhysicalPrizeRequest.schema.indexes();
  assert.ok(indexes.some(([keys, options]) =>
    keys.requestId === 1 && options.unique === true
  ));
  assert.ok(indexes.some(([keys, options]) =>
    keys.fortuneWheelProgressId === 1 && options.unique === true
  ));
  assert.ok(indexes.some(([keys, options]) =>
    keys.campaignKey === 1 && keys.telegramId === 1 && keys.prizeCode === 1 && options.unique === true
  ));
  assert.ok(indexes.some(([keys, options]) =>
    keys.campaignKey === 1 && keys.telegramId === 1 && keys.idempotencyKey === 1 && options.unique === true
  ));
});

test('status endpoint rejects missing and invalid Telegram initData', async () => {
  const missing = await invokeStatusRoute(createRequest());
  assert.equal(missing.statusCode, 401);

  const invalid = await invokeStatusRoute(createRequest('auth_date=1&hash=invalid'));
  assert.equal(invalid.statusCode, 401);
});

test('status endpoint derives identity from signed Telegram data and stays read-only', async () => {
  const originalUserFindOne = User.findOne;
  const originalProgressFindOne = FortuneWheelProgress.findOne;
  const originalProgressCreate = FortuneWheelProgress.create;
  let userFilter = null;
  let progressFilter = null;
  let createCalls = 0;

  User.findOne = (filter) => {
    userFilter = filter;
    return queryResult({ telegramId: '9001', isFrozen: false });
  };
  FortuneWheelProgress.findOne = (filter) => {
    progressFilter = filter;
    return queryResult(null);
  };
  FortuneWheelProgress.create = async () => {
    createCalls += 1;
    throw new Error('status must not create progress');
  };

  try {
    const response = await invokeStatusRoute(createRequest(createSignedInitData('9001')));
    assert.equal(response.statusCode, 200);
    assert.deepEqual(userFilter, { telegramId: '9001' });
    assert.equal(progressFilter.telegramId, '9001');
    assert.equal(response.body.guaranteed, true);
    assert.equal(response.body.enabled, false);
    assert.equal(response.body.eligibility.code, 'CAMPAIGN_DISABLED');
    assert.equal(response.body.nextSpin, 1);
    assert.equal(createCalls, 0);
  } finally {
    User.findOne = originalUserFindOne;
    FortuneWheelProgress.findOne = originalProgressFindOne;
    FortuneWheelProgress.create = originalProgressCreate;
  }
});

test('status maps persisted progress without mutating it', () => {
  const progress = {
    completedSpins: 2,
    claims: [],
    physicalPrizeReservation: { slot: 1, status: 'reserved' },
    iphoneUnlockedAt: null,
    physicalPrizeRequestId: null,
  };
  const config = getFortuneWheelCampaignConfig({
    FORTUNE_WHEEL_ENABLED: 'true',
    FORTUNE_WHEEL_CAMPAIGN_APPROVED: 'true',
    FORTUNE_WHEEL_PHYSICAL_PRIZE_CAPACITY: '1',
    FORTUNE_WHEEL_ELIGIBLE_TELEGRAM_IDS: '9001',
    FORTUNE_WHEEL_IPHONE_COLORS: 'midnight,gold',
  });

  const status = buildFortuneWheelStatus({
    user: { telegramId: '9001', isFrozen: false },
    progress,
    config,
  });

  assert.equal(status.completedSpins, 2);
  assert.equal(status.nextSpin, 3);
  assert.deepEqual(status.rewards.map((reward) => reward.status), [
    'claimed',
    'claimed',
    'available',
  ]);
  assert.equal(status.physicalPrize.reserved, true);
  assert.deepEqual(status.physicalPrize.colors, []);
  assert.equal(progress.completedSpins, 2);
});

test('status endpoint keeps a signed player request visible after campaign closure', async () => {
  const originalUserFindOne = User.findOne;
  const originalProgressFindOne = FortuneWheelProgress.findOne;
  const originalRequestFindOne = PhysicalPrizeRequest.findOne;
  let requestFilter = null;
  process.env.FORTUNE_WHEEL_ENABLED = 'false';
  process.env.FORTUNE_WHEEL_CAMPAIGN_APPROVED = 'false';
  process.env.FORTUNE_WHEEL_PHYSICAL_PRIZE_CAPACITY = '1';
  process.env.FORTUNE_WHEEL_ELIGIBLE_TELEGRAM_IDS = '9001';
  process.env.FORTUNE_WHEEL_IPHONE_COLORS = 'midnight,gold';
  User.findOne = () => queryResult({ telegramId: '9001', isFrozen: false });
  FortuneWheelProgress.findOne = () => queryResult({
    _id: 'progress-1',
    telegramId: '9001',
    completedSpins: 3,
    physicalPrizeReservation: { slot: 1 },
    iphoneUnlockedAt: new Date('2026-10-24T10:02:00Z'),
    physicalPrizeRequestId: 'request-object-id',
  });
  PhysicalPrizeRequest.findOne = (filter) => {
    requestFilter = filter;
    return queryResult({
      requestId: 'request-public-id',
      campaignKey: 'fortune-wheel-v1',
      telegramId: '9001',
      prizeCode: 'iphone_duo',
      color: 'gold',
      status: 'pending',
      createdAt: new Date('2026-10-24T10:03:00Z'),
      statusHistory: [{ status: 'pending', changedAt: new Date('2026-10-24T10:03:00Z'), changedBy: 'player' }],
    });
  };
  try {
    const response = await invokeStatusRoute(createRequest(createSignedInitData('9001')));
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.enabled, false);
    assert.equal(response.body.eligibility.code, 'CAMPAIGN_DISABLED');
    assert.equal(requestFilter.telegramId, '9001');
    assert.equal(response.body.physicalPrize.requestCreated, true);
    assert.equal(response.body.physicalPrize.selectionLocked, true);
    assert.equal(response.body.physicalPrize.request.color, 'gold');
    assert.equal('telegramId' in response.body.physicalPrize.request, false);
    assert.equal('changedBy' in response.body.physicalPrize.request.statusHistory[0], false);
  } finally {
    User.findOne = originalUserFindOne;
    FortuneWheelProgress.findOne = originalProgressFindOne;
    PhysicalPrizeRequest.findOne = originalRequestFindOne;
  }
});

test('reservation requires a session and atomically claims one configured slot', async () => {
  const config = getFortuneWheelCampaignConfig({
    FORTUNE_WHEEL_ENABLED: 'true',
    FORTUNE_WHEEL_CAMPAIGN_APPROVED: 'true',
    FORTUNE_WHEEL_PHYSICAL_PRIZE_CAPACITY: '1',
    FORTUNE_WHEEL_ELIGIBLE_TELEGRAM_IDS: '9001',
    FORTUNE_WHEEL_IPHONE_COLORS: 'midnight',
  });
  const user = { telegramId: '9001', isFrozen: false };

  await assert.rejects(
    reserveFortuneWheelEntry({ user, config }),
    /requires a MongoDB session/
  );

  const calls = [];
  const ProgressModel = {
    findOne() {
      return queryResult(null);
    },
    findOneAndUpdate(filter, update, options) {
      calls.push({ filter, update, options });
      return queryResult({
        value: { ...update.$setOnInsert, _id: 'progress-1' },
        lastErrorObject: { updatedExisting: false },
      });
    },
  };
  const session = { id: 'session-1' };
  const result = await reserveFortuneWheelEntry({
    user,
    session,
    config,
    now: new Date('2026-10-24T00:00:00.000Z'),
    ProgressModel,
  });

  assert.equal(result.created, true);
  assert.equal(result.progress.physicalPrizeReservation.slot, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.session, session);
  assert.equal(calls[0].options.upsert, true);
  assert.equal(calls[0].update.$setOnInsert.physicalPrizeReservation.slot, 1);
});

test('FW-3 exposes spin and color selection without an address/order endpoint', () => {
  const routePaths = router.stack
    .map((layer) => layer.route?.path)
    .filter(Boolean);
  assert.equal(routePaths.includes('/fortune-wheel/spin'), true);
  assert.equal(routePaths.includes('/fortune-wheel/iphone-color'), true);
  assert.equal(routePaths.includes('/fortune-wheel/shipping-address'), false);
});

test('spin input requires an ordered expectedSpin and bounded idempotency key', () => {
  assert.deepEqual(validateSpinRequest({ expectedSpin: 1, idempotencyKey: 'wheel:9001:spin:1' }), {
    ok: true,
    expectedSpin: 1,
    idempotencyKey: 'wheel:9001:spin:1',
  });
  assert.equal(validateSpinRequest({ expectedSpin: 0, idempotencyKey: 'wheel:9001:spin:1' }).code, 'INVALID_EXPECTED_SPIN');
  assert.equal(validateSpinRequest({ expectedSpin: 1, idempotencyKey: '$where' }).code, 'INVALID_IDEMPOTENCY_KEY');
  assert.equal(validateSpinRequest({ expectedSpin: 1, idempotencyKey: 'x'.repeat(129) }).code, 'INVALID_IDEMPOTENCY_KEY');
});

test('spin endpoint rejects missing Telegram initData before any mutation', async () => {
  const request = createRequest();
  request.body = { expectedSpin: 1, idempotencyKey: 'wheel:9001:spin:1' };
  const response = await invokeSpinRoute(request);
  assert.equal(response.statusCode, 401);
});

function createSpinHarness() {
  const originalUserFindOne = User.findOne;
  const originalProgressFindOne = FortuneWheelProgress.findOne;
  const originalProgressFindOneAndUpdate = FortuneWheelProgress.findOneAndUpdate;
  const user = new User({
    telegramId: '9001',
    username: 'wheel-user',
    balance: 100,
    totalEarned: 0,
    weeklyEarned: 0,
    weeklyEarnedWeek: '',
    totalTaps: 0,
    claimedRankBonuses: [
      'bronze_1', 'bronze_2', 'bronze_3', 'silver_1', 'silver_2', 'silver_3',
      'gold_1', 'gold_2', 'gold_3', 'platinum', 'diamond', 'master', 'legend',
    ],
    completedAchievements: [
      'first_tap', 'taps_100', 'taps_1000', 'first_upgrade', 'miner_level_5',
      'first_boost', 'first_offline_claim', 'first_friend', 'taps_10000', 'weekly_100k',
      'all_perks', 'rank_gold', 'rank_diamond', 'friends_5', 'streak_7', 'taps_50000',
      'taps_100000', 'earned_1m', 'friends_10', 'upgrade_master', 'boost_master', 'offline_master',
    ],
    transactions: [],
    securityLogs: [],
  });
  let progress = null;
  let saveCalls = 0;
  user.save = async ({ session } = {}) => {
    assert.ok(session, 'reward save must use the transaction session');
    saveCalls += 1;
    return user;
  };
  User.findOne = () => queryResult(user);
  FortuneWheelProgress.findOne = () => queryResult(progress);
  FortuneWheelProgress.findOneAndUpdate = (filter, update, options) => {
    if (update.$setOnInsert) {
      if (!progress) progress = { _id: 'wheel-progress-1', ...structuredClone(update.$setOnInsert) };
      return queryResult({
        value: progress,
        lastErrorObject: { updatedExisting: true },
      });
    }
    const claimSpinTaken = progress.claims.some((claim) => Number(claim.spin) === Number(filter['claims.spin']?.$ne));
    const claimKeyTaken = progress.claims.some((claim) => String(claim.idempotencyKey) === String(filter['claims.idempotencyKey']?.$ne));
    if (
      Number(progress.completedSpins) !== Number(filter.completedSpins) ||
      claimSpinTaken ||
      claimKeyTaken
    ) return queryResult(null);
    progress.completedSpins += update.$inc.completedSpins;
    progress.claims.push(structuredClone(update.$push.claims));
    if (update.$set) Object.assign(progress, structuredClone(update.$set));
    assert.equal(options.session.id, 'spin-session');
    return queryResult(progress);
  };
  return {
    user,
    get progress() { return progress; },
    get saveCalls() { return saveCalls; },
    restore() {
      User.findOne = originalUserFindOne;
      FortuneWheelProgress.findOne = originalProgressFindOne;
      FortuneWheelProgress.findOneAndUpdate = originalProgressFindOneAndUpdate;
    },
  };
}

function enabledCampaign() {
  return getFortuneWheelCampaignConfig({
    FORTUNE_WHEEL_ENABLED: 'true',
    FORTUNE_WHEEL_CAMPAIGN_APPROVED: 'true',
    FORTUNE_WHEEL_PHYSICAL_PRIZE_CAPACITY: '1',
    FORTUNE_WHEEL_ELIGIBLE_TELEGRAM_IDS: '9001',
    FORTUNE_WHEEL_IPHONE_COLORS: 'midnight,gold',
  });
}

test('three spins follow the fixed rewards and spin three only unlocks the iPhone right', async () => {
  const harness = createSpinHarness();
  const session = { id: 'spin-session' };
  try {
    const first = await performFortuneWheelSpin({
      telegramId: '9001', expectedSpin: 1, idempotencyKey: 'wheel:9001:spin:1',
      config: enabledCampaign(), session, now: new Date('2026-10-24T10:00:00Z'),
    });
    assert.equal(first.status, 'success');
    assert.equal(first.claim.amount, 50000);
    assert.equal(harness.user.balance, 50100);
    assert.equal(harness.user.totalEarned, 50000);
    assert.equal(harness.user.weeklyEarned, 50000);

    const second = await performFortuneWheelSpin({
      telegramId: '9001', expectedSpin: 2, idempotencyKey: 'wheel:9001:spin:2',
      config: enabledCampaign(), session, now: new Date('2026-10-24T10:01:00Z'),
    });
    assert.equal(second.claim.amount, 250000);
    assert.equal(harness.user.balance, 300100);
    assert.equal(harness.user.totalEarned, 300000);
    assert.equal(harness.user.weeklyEarned, 300000);
    assert.equal(harness.user.transactions.filter((item) => item.type === 'income_fortune_wheel').length, 2);

    const balanceBeforePhysicalPrize = harness.user.balance;
    const third = await performFortuneWheelSpin({
      telegramId: '9001', expectedSpin: 3, idempotencyKey: 'wheel:9001:spin:3',
      config: enabledCampaign(), session, now: new Date('2026-10-24T10:02:00Z'),
    });
    assert.equal(third.claim.rewardType, 'physical_prize');
    assert.equal(third.claim.prizeCode, 'iphone_duo');
    assert.equal(third.claim.amount, 0);
    assert.equal(harness.user.balance, balanceBeforePhysicalPrize);
    assert.ok(harness.progress.iphoneUnlockedAt);
    assert.equal(harness.progress.physicalPrizeRequestId, undefined);
    assert.equal(harness.saveCalls, 2);
  } finally {
    harness.restore();
  }
});

test('same idempotency key replays safely and another key cannot claim the same spin', async () => {
  const harness = createSpinHarness();
  const session = { id: 'spin-session' };
  try {
    const request = {
      telegramId: '9001', expectedSpin: 1, idempotencyKey: 'wheel:9001:spin:1',
      config: enabledCampaign(), session,
    };
    const first = await performFortuneWheelSpin(request);
    const balanceAfterFirst = harness.user.balance;
    const retry = await performFortuneWheelSpin(request);
    const duplicate = await performFortuneWheelSpin({ ...request, idempotencyKey: 'wheel:9001:duplicate' });
    const reusedForAnotherSpin = await performFortuneWheelSpin({ ...request, expectedSpin: 2 });
    assert.equal(first.idempotent, false);
    assert.equal(retry.idempotent, true);
    assert.equal(duplicate.status, 'already_claimed');
    assert.equal(reusedForAnotherSpin.status, 'idempotency_conflict');
    assert.equal(harness.user.balance, balanceAfterFirst);
    assert.equal(harness.user.transactions.filter((item) => item.type === 'income_fortune_wheel').length, 1);
    assert.equal(harness.progress.claims.length, 1);
  } finally {
    harness.restore();
  }
});

test('parallel different-key calls cannot pay the same spin twice', async () => {
  const harness = createSpinHarness();
  try {
    const base = {
      telegramId: '9001', expectedSpin: 1,
      config: enabledCampaign(), session: { id: 'spin-session' },
    };
    const results = await Promise.all([
      performFortuneWheelSpin({ ...base, idempotencyKey: 'wheel:9001:parallel:a' }),
      performFortuneWheelSpin({ ...base, idempotencyKey: 'wheel:9001:parallel:b' }),
    ]);
    assert.equal(results.filter((result) => result.status === 'success').length, 1);
    assert.equal(results.filter((result) => result.status !== 'success').length, 1);
    assert.equal(harness.user.transactions.filter((item) => item.type === 'income_fortune_wheel').length, 1);
    assert.equal(harness.user.balance, 50100);
    assert.equal(harness.progress.claims.length, 1);
  } finally {
    harness.restore();
  }
});

test('spin sequence cannot be skipped and client supplied reward fields are ignored', async () => {
  const harness = createSpinHarness();
  try {
    const skipped = await performFortuneWheelSpin({
      telegramId: '9001', expectedSpin: 2, idempotencyKey: 'wheel:9001:spin:2',
      amount: 999999999, rewardType: 'onix', config: enabledCampaign(), session: { id: 'spin-session' },
    });
    assert.equal(skipped.status, 'out_of_sequence');
    assert.equal(harness.user.balance, 100);
    assert.equal(harness.progress, null);
  } finally {
    harness.restore();
  }
});

test('parallel same-key calls result in one payout and one idempotent replay or conflict', async () => {
  const harness = createSpinHarness();
  try {
    const input = {
      telegramId: '9001', expectedSpin: 1, idempotencyKey: 'wheel:9001:parallel',
      config: enabledCampaign(), session: { id: 'spin-session' },
    };
    const results = await Promise.all([
      performFortuneWheelSpin(input),
      performFortuneWheelSpin(input),
    ]);
    assert.equal(results.filter((result) => result.status === 'success').length >= 1, true);
    assert.equal(harness.user.transactions.filter((item) => item.type === 'income_fortune_wheel').length, 1);
    assert.equal(harness.user.balance, 50100);
    assert.equal(harness.progress.claims.length, 1);
  } finally {
    harness.restore();
  }
});

function createColorHarness({ frozen = false, completedSpins = 3, failCreate = false } = {}) {
  const originalUserFindOne = User.findOne;
  const originalProgressFindOne = FortuneWheelProgress.findOne;
  const originalProgressFindOneAndUpdate = FortuneWheelProgress.findOneAndUpdate;
  const originalRequestFindOne = PhysicalPrizeRequest.findOne;
  const originalRequestCreate = PhysicalPrizeRequest.create;
  const user = new User({
    telegramId: '9001',
    username: 'wheel-user',
    telegramUsername: 'wheel_user',
    firstName: 'Wheel',
    lastName: 'Winner',
    isFrozen: frozen,
  });
  const progress = {
    _id: 'wheel-progress-1',
    campaignKey: 'fortune-wheel-v1',
    telegramId: '9001',
    completedSpins,
    claims: completedSpins >= 3
      ? [{
          spin: 3,
          rewardType: 'physical_prize',
          prizeCode: 'iphone_duo',
          amount: 0,
          idempotencyKey: 'wheel:9001:spin:3',
          claimedAt: new Date('2026-10-24T10:02:00Z'),
        }]
      : [],
    physicalPrizeReservation: {
      slot: 1,
      reservedAt: new Date('2026-10-24T10:00:00Z'),
      status: 'reserved',
    },
    iphoneUnlockedAt: completedSpins >= 3 ? new Date('2026-10-24T10:02:00Z') : null,
    physicalPrizeRequestId: null,
  };
  let request = null;
  let createCalls = 0;
  const requestFilters = [];

  User.findOne = (filter) => queryResult(String(filter.telegramId) === '9001' ? user : null);
  FortuneWheelProgress.findOne = (filter) => queryResult(
    String(filter.telegramId) === '9001' ? progress : null
  );
  FortuneWheelProgress.findOneAndUpdate = (filter, update, options) => {
    if (
      String(filter.telegramId) !== '9001' ||
      progress.physicalPrizeRequestId ||
      Number(progress.completedSpins) !== Number(filter.completedSpins)
    ) return queryResult(null);
    progress.physicalPrizeRequestId = update.$set.physicalPrizeRequestId;
    assert.equal(options.session.id, 'color-session');
    return queryResult(progress);
  };
  PhysicalPrizeRequest.findOne = (filter) => {
    requestFilters.push(structuredClone(filter));
    const matchesIdentity = String(filter.telegramId) === '9001';
    return queryResult(matchesIdentity ? request : null);
  };
  PhysicalPrizeRequest.create = async (documents, options) => {
    createCalls += 1;
    assert.equal(options.session.id, 'color-session');
    if (failCreate) throw new Error('simulated physical request insert failure');
    request = {
      ...structuredClone(documents[0]),
      createdAt: new Date('2026-10-24T10:03:00Z'),
      updatedAt: new Date('2026-10-24T10:03:00Z'),
    };
    return [request];
  };

  return {
    user,
    progress,
    get request() { return request; },
    get createCalls() { return createCalls; },
    requestFilters,
    restoreProgressPointer(value = null) { progress.physicalPrizeRequestId = value; },
    restore() {
      User.findOne = originalUserFindOne;
      FortuneWheelProgress.findOne = originalProgressFindOne;
      FortuneWheelProgress.findOneAndUpdate = originalProgressFindOneAndUpdate;
      PhysicalPrizeRequest.findOne = originalRequestFindOne;
      PhysicalPrizeRequest.create = originalRequestCreate;
    },
  };
}

test('iPhone color validation uses only the configured server allowlist', () => {
  const config = enabledCampaign();
  assert.deepEqual(
    validateIphoneColorRequest({ color: ' Gold ', idempotencyKey: 'wheel:9001:color:1' }, config),
    { ok: true, color: 'gold', idempotencyKey: 'wheel:9001:color:1', colorAllowed: true }
  );
  assert.equal(validateIphoneColorRequest({
    color: 'unconfirmed-color',
    idempotencyKey: 'wheel:9001:color:1',
  }, config).colorAllowed, false);
});

test('iPhone color cannot be selected before the third spin', async () => {
  const harness = createColorHarness({ completedSpins: 2 });
  try {
    const result = await performIphoneColorSelection({
      telegramId: '9001', color: 'gold', idempotencyKey: 'wheel:9001:color:1',
      config: enabledCampaign(), session: { id: 'color-session' },
    });
    assert.equal(result.status, 'iphone_not_unlocked');
    assert.equal(harness.createCalls, 0);
    assert.equal(harness.progress.physicalPrizeRequestId, null);
  } finally {
    harness.restore();
  }
});

test('an unconfigured color is rejected without creating a request', async () => {
  const harness = createColorHarness();
  try {
    const result = await performIphoneColorSelection({
      telegramId: '9001', color: 'unconfirmed-color', idempotencyKey: 'wheel:9001:color:1',
      config: enabledCampaign(), session: { id: 'color-session' },
    });
    assert.equal(result.status, 'invalid_color');
    assert.equal(result.code, 'INVALID_IPHONE_COLOR');
    assert.equal(harness.createCalls, 0);
  } finally {
    harness.restore();
  }
});

test('first color selection creates one pending request with immutable player selection history', async () => {
  const harness = createColorHarness();
  try {
    const now = new Date('2026-10-24T10:03:00Z');
    const result = await performIphoneColorSelection({
      telegramId: '9001', color: 'gold', idempotencyKey: 'wheel:9001:color:1',
      config: enabledCampaign(), session: { id: 'color-session' }, now,
    });
    assert.equal(result.status, 'success');
    assert.equal(result.idempotent, false);
    assert.equal(harness.createCalls, 1);
    assert.equal(result.request.campaignKey, 'fortune-wheel-v1');
    assert.equal(result.request.telegramId, '9001');
    assert.equal(result.request.prizeCode, 'iphone_duo');
    assert.equal(result.request.color, 'gold');
    assert.equal(result.request.status, 'pending');
    assert.match(result.request.requestId, /^[0-9a-f-]{36}$/i);
    assert.deepEqual(result.request.statusHistory.map(({ status, changedAt, changedBy }) => ({
      status, changedAt, changedBy,
    })), [{ status: 'pending', changedAt: now, changedBy: 'player' }]);
    assert.ok(harness.progress.physicalPrizeRequestId);
    const safe = serializePhysicalPrizeRequest(result.request);
    assert.equal(safe.color, 'gold');
    assert.equal('telegramId' in safe, false);
    assert.equal('changedBy' in safe.statusHistory[0], false);
  } finally {
    harness.restore();
  }
});

test('repeat selection returns the existing request and a different color stays locked', async () => {
  const harness = createColorHarness();
  const base = {
    telegramId: '9001', color: 'gold', idempotencyKey: 'wheel:9001:color:1',
    config: enabledCampaign(), session: { id: 'color-session' },
  };
  try {
    const first = await performIphoneColorSelection(base);
    const retry = await performIphoneColorSelection(base);
    const changed = await performIphoneColorSelection({
      ...base,
      color: 'midnight',
      idempotencyKey: 'wheel:9001:color:2',
    });
    assert.equal(first.idempotent, false);
    assert.equal(retry.idempotent, true);
    assert.equal(retry.request.requestId, first.request.requestId);
    assert.equal(changed.status, 'color_locked');
    assert.equal(harness.createCalls, 1);
    assert.equal(harness.request.color, 'gold');
  } finally {
    harness.restore();
  }
});

test('an existing request remains idempotently readable if the color is later removed from config', async () => {
  const harness = createColorHarness();
  try {
    const originalConfig = enabledCampaign();
    const first = await performIphoneColorSelection({
      telegramId: '9001', color: 'gold', idempotencyKey: 'wheel:9001:color:1',
      config: originalConfig, session: { id: 'color-session' },
    });
    const changedConfig = getFortuneWheelCampaignConfig({
      FORTUNE_WHEEL_ENABLED: 'false',
      FORTUNE_WHEEL_CAMPAIGN_APPROVED: 'false',
      FORTUNE_WHEEL_CAMPAIGN_KEY: 'fortune-wheel-v1',
      FORTUNE_WHEEL_IPHONE_COLORS: 'midnight',
    });
    const retry = await performIphoneColorSelection({
      telegramId: '9001', color: 'gold', idempotencyKey: 'wheel:9001:color:1',
      config: changedConfig, session: { id: 'color-session' },
    });
    assert.equal(first.status, 'success');
    assert.equal(retry.status, 'success');
    assert.equal(retry.idempotent, true);
    assert.equal(retry.request.requestId, first.request.requestId);
    assert.equal(harness.createCalls, 1);
  } finally {
    harness.restore();
  }
});

test('disabled, ended and unapproved campaigns still allow an already unlocked color selection', async () => {
  const configurations = [
    getFortuneWheelCampaignConfig({
      FORTUNE_WHEEL_ENABLED: 'false',
      FORTUNE_WHEEL_CAMPAIGN_APPROVED: 'true',
      FORTUNE_WHEEL_IPHONE_COLORS: 'midnight,gold',
    }),
    getFortuneWheelCampaignConfig({
      FORTUNE_WHEEL_ENABLED: 'true',
      FORTUNE_WHEEL_CAMPAIGN_APPROVED: 'false',
      FORTUNE_WHEEL_IPHONE_COLORS: 'midnight,gold',
    }),
    getFortuneWheelCampaignConfig({
      FORTUNE_WHEEL_ENABLED: 'true',
      FORTUNE_WHEEL_CAMPAIGN_APPROVED: 'true',
      FORTUNE_WHEEL_ENDS_AT: '2026-10-20T00:00:00Z',
      FORTUNE_WHEEL_IPHONE_COLORS: 'midnight,gold',
    }),
  ];

  for (const [index, config] of configurations.entries()) {
    const harness = createColorHarness();
    try {
      const result = await performIphoneColorSelection({
        telegramId: '9001',
        color: 'gold',
        idempotencyKey: `wheel:9001:color:closed:${index}`,
        config,
        session: { id: 'color-session' },
        now: new Date('2026-10-24T10:03:00Z'),
      });
      assert.equal(result.status, 'success');
      assert.equal(result.idempotent, false);
      assert.equal(result.request.color, 'gold');
      assert.equal(harness.createCalls, 1);
    } finally {
      harness.restore();
    }
  }
});

test('parallel different colors create at most one physical prize request', async () => {
  const harness = createColorHarness();
  try {
    const base = {
      telegramId: '9001', config: enabledCampaign(), session: { id: 'color-session' },
    };
    const results = await Promise.all([
      performIphoneColorSelection({
        ...base, color: 'gold', idempotencyKey: 'wheel:9001:color:parallel:a',
      }),
      performIphoneColorSelection({
        ...base, color: 'midnight', idempotencyKey: 'wheel:9001:color:parallel:b',
      }),
    ]);
    assert.equal(results.filter((item) => item.status === 'success').length, 1);
    assert.equal(results.filter((item) => item.status !== 'success').length, 1);
    assert.equal(harness.createCalls, 1);
  } finally {
    harness.restore();
  }
});

test('frozen users and another Telegram identity cannot create or retrieve the request', async () => {
  const frozenHarness = createColorHarness({ frozen: true });
  try {
    const frozen = await performIphoneColorSelection({
      telegramId: '9001', color: 'gold', idempotencyKey: 'wheel:9001:color:1',
      config: enabledCampaign(), session: { id: 'color-session' },
    });
    assert.equal(frozen.status, 'frozen');
    assert.equal(frozenHarness.createCalls, 0);

    const otherIdentity = await performIphoneColorSelection({
      telegramId: '9002', color: 'gold', idempotencyKey: 'wheel:9002:color:1',
      config: enabledCampaign(), session: { id: 'color-session' },
    });
    assert.equal(otherIdentity.status, 'not_found');
    assert.equal(frozenHarness.requestFilters.length, 0);
  } finally {
    frozenHarness.restore();
  }
});

test('iPhone color endpoint rejects a body Telegram ID that differs from signed initData', async () => {
  const request = createRequest(createSignedInitData('9001'));
  request.body = {
    telegramId: '9002',
    color: 'gold',
    idempotencyKey: 'wheel:9001:color:1',
  };
  const response = await invokeIphoneColorRoute(request);
  assert.equal(response.statusCode, 403);
  assert.equal(response.body.code, 'TELEGRAM_ID_MISMATCH');
});

test('physical prize transaction failure rolls back the progress pointer and closes the session', async () => {
  const harness = createColorHarness({ failCreate: true });
  const mongoose = require('mongoose');
  const originalStartSession = mongoose.startSession;
  let ended = false;
  mongoose.startSession = async () => ({
    id: 'color-session',
    async withTransaction(callback) {
      const pointerBefore = harness.progress.physicalPrizeRequestId;
      try {
        return await callback();
      } catch (error) {
        harness.restoreProgressPointer(pointerBefore);
        throw error;
      }
    },
    async endSession() { ended = true; },
  });
  process.env.FORTUNE_WHEEL_ENABLED = 'true';
  process.env.FORTUNE_WHEEL_CAMPAIGN_APPROVED = 'true';
  process.env.FORTUNE_WHEEL_PHYSICAL_PRIZE_CAPACITY = '1';
  process.env.FORTUNE_WHEEL_ELIGIBLE_TELEGRAM_IDS = '9001';
  process.env.FORTUNE_WHEEL_IPHONE_COLORS = 'midnight,gold';
  try {
    const request = createRequest(createSignedInitData('9001'));
    request.body = { color: 'gold', idempotencyKey: 'wheel:9001:color:failure' };
    const response = await invokeIphoneColorRoute(request);
    assert.equal(response.statusCode, 500);
    assert.equal(response.body.code, 'PHYSICAL_PRIZE_REQUEST_FAILED');
    assert.equal(harness.progress.physicalPrizeRequestId, null);
    assert.equal(harness.request, null);
    assert.equal(ended, true);
  } finally {
    mongoose.startSession = originalStartSession;
    harness.restore();
  }
});

test('transaction failure from the spin endpoint returns an error and closes the session', async () => {
  const originalStartSession = require('mongoose').startSession;
  let ended = false;
  require('mongoose').startSession = async () => ({
    async withTransaction() { throw new Error('simulated transaction failure'); },
    async endSession() { ended = true; },
  });
  process.env.FORTUNE_WHEEL_ENABLED = 'true';
  process.env.FORTUNE_WHEEL_CAMPAIGN_APPROVED = 'true';
  process.env.FORTUNE_WHEEL_PHYSICAL_PRIZE_CAPACITY = '1';
  process.env.FORTUNE_WHEEL_ELIGIBLE_TELEGRAM_IDS = '9001';
  process.env.FORTUNE_WHEEL_IPHONE_COLORS = 'midnight';
  try {
    const request = createRequest(createSignedInitData('9001'));
    request.body = { expectedSpin: 1, idempotencyKey: 'wheel:9001:failure' };
    const response = await invokeSpinRoute(request);
    assert.equal(response.statusCode, 500);
    assert.equal(response.body.code, 'FORTUNE_WHEEL_SPIN_FAILED');
    assert.equal(ended, true);
  } finally {
    require('mongoose').startSession = originalStartSession;
  }
});
