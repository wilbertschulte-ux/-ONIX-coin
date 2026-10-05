const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');

process.env.NODE_ENV = 'test';

const User = require('../models/User');
const PendingTelegramLaunch = require('../models/PendingTelegramLaunch');
const TrafficEvent = require('../models/TrafficEvent');
const router = require('../routes/coinRoutes');
const {
  MAX_LAUNCH_PARAM_LENGTH,
  applyFirstTouchAttribution,
  buildMiniAppUrl,
  extractTelegramStartPayload,
  parseLaunchParam,
} = require('../trafficAttribution');
const {
  TRAFFIC_EVENT_MAX_IN_FLIGHT,
  TRAFFIC_EVENT_MAX_TIME_MS,
  TRAFFIC_EVENT_QUEUE_TIMEOUT_MS,
  getUserTrafficAttribution,
  queueTrafficEvent,
  recordTrafficEvent,
} = require('../trafficEvents');
const {
  PENDING_TELEGRAM_LAUNCH_MAX_TIME_MS,
  PENDING_TELEGRAM_LAUNCH_TTL_MS,
  consumePendingTelegramLaunch,
  getPendingTelegramLaunch,
  getPendingLaunchInsert,
  selectTrustedTelegramLaunch,
  storePendingTelegramLaunch,
} = require('../trustedTelegramLaunch');

test('A: a new user receives tg_de_01 as first-touch source', () => {
  const user = { balance: 0, totalEarned: 0 };
  const parsed = parseLaunchParam('tg_de_01');

  assert.equal(applyFirstTouchAttribution(user, parsed.attribution, {
    isNewUser: true,
    now: Date.UTC(2026, 9, 3),
  }), true);
  assert.deepEqual(user.trafficAttribution, {
    source: 'tg_de_01',
    campaign: '01',
    market: 'de',
    firstSeenAt: new Date(Date.UTC(2026, 9, 3)),
    landingCode: 'tg_de_01',
  });
});

test('B and H: repeat launch and existing users cannot replace first touch', () => {
  const user = {};
  applyFirstTouchAttribution(user, parseLaunchParam('tg_de_01').attribution, {
    isNewUser: true,
    now: 1,
  });

  assert.equal(applyFirstTouchAttribution(user, parseLaunchParam('tg_de_02').attribution, {
    isNewUser: true,
    now: 2,
  }), false);
  assert.equal(applyFirstTouchAttribution(user, parseLaunchParam('youtube_de_01').attribution, {
    isNewUser: false,
    now: 3,
  }), false);
  assert.equal(user.trafficAttribution.source, 'tg_de_01');

  const unattributedExistingUser = {};
  assert.equal(applyFirstTouchAttribution(
    unattributedExistingUser,
    parseLaunchParam('tg_de_01').attribution,
    { isNewUser: false }
  ), false);
  assert.equal(unattributedExistingUser.trafficAttribution, undefined);
});

test('C: ordinary /start without a payload remains empty and safe', () => {
  assert.equal(extractTelegramStartPayload('/start'), '');
  assert.deepEqual(parseLaunchParam(''), {
    normalizedLaunchParam: '',
    referralTelegramId: null,
    attribution: null,
    teamCode: null,
  });
});

test('D: legacy numeric and explicit referral payloads remain referrals', () => {
  assert.equal(parseLaunchParam('123456789').referralTelegramId, '123456789');
  assert.equal(parseLaunchParam('ref_123456789').referralTelegramId, '123456789');
  assert.equal(parseLaunchParam('123456789').attribution, null);
});

test('E: referral and traffic attribution coexist in one launch parameter', () => {
  const parsed = parseLaunchParam('ref_123456789__src_tg_de_01');

  assert.equal(parsed.referralTelegramId, '123456789');
  assert.equal(parsed.attribution.source, 'tg_de_01');
  assert.equal(parsed.attribution.market, 'de');
  assert.equal(parsed.attribution.campaign, '01');
});

test('team launch parameters stay separate from referrals and marketing', () => {
  const parsed = parseLaunchParam('team_OnixCrew_42');

  assert.equal(parsed.teamCode, 'OnixCrew_42');
  assert.equal(parsed.referralTelegramId, null);
  assert.equal(parsed.attribution, null);
});

test('F and G: invalid, operator-like and overlong codes are ignored', () => {
  for (const value of [
    'tg.$where.01',
    'tg_de',
    'tg_DE_01',
    'ref_not-a-number',
    'ref_123__src_invalid',
    'x'.repeat(MAX_LAUNCH_PARAM_LENGTH + 1),
  ]) {
    const parsed = parseLaunchParam(value);
    assert.equal(parsed.normalizedLaunchParam, '');
    assert.equal(parsed.referralTelegramId, null);
    assert.equal(parsed.attribution, null);
  }
});

test('supported campaign examples parse into source, market and campaign', () => {
  for (const code of [
    'tg_de_01',
    'tg_de_02',
    'youtube_de_01',
    'tiktok_de_01',
    'reddit_de_01',
    'tg_fr_01',
    'tg_nl_01',
    'tg_ua_01',
    'tg_ca_01',
  ]) {
    const parsed = parseLaunchParam(code);
    assert.equal(parsed.attribution.source, code);
    assert.equal(parsed.attribution.landingCode, code);
  }
});

test('I: attribution changes no gameplay or economy fields', () => {
  const user = {
    balance: 100,
    totalEarned: 250,
    weeklyEarned: 50,
    withdrawalRequests: [{ amount: 10 }],
  };
  const economyBefore = JSON.parse(JSON.stringify(user));

  applyFirstTouchAttribution(user, parseLaunchParam('tg_de_01').attribution, {
    isNewUser: true,
  });

  assert.equal(user.balance, economyBefore.balance);
  assert.equal(user.totalEarned, economyBefore.totalEarned);
  assert.equal(user.weeklyEarned, economyBefore.weeklyEarned);
  assert.deepEqual(user.withdrawalRequests, economyBefore.withdrawalRequests);
});

test('bot start payload is propagated only as an encoded Mini App query value', () => {
  const payload = extractTelegramStartPayload('/start@coinonix_bot ref_123__src_tg_de_01');
  const url = new URL(buildMiniAppUrl('https://onix-coin.vercel.app/app?existing=1', payload));

  assert.equal(payload, 'ref_123__src_tg_de_01');
  assert.equal(url.searchParams.get('existing'), '1');
  assert.equal(url.searchParams.get('onix_start'), payload);
});

test('User and TrafficEvent declare only the required attribution indexes', () => {
  const userIndexes = User.schema.indexes();
  const eventIndexes = TrafficEvent.schema.indexes();
  const pendingIndexes = PendingTelegramLaunch.schema.indexes();

  assert.ok(userIndexes.some(([fields]) =>
    fields['trafficAttribution.source'] === 1 &&
    fields['trafficAttribution.firstSeenAt'] === 1
  ));
  assert.ok(userIndexes.some(([fields]) =>
    Object.keys(fields).length === 1 && fields['trafficAttribution.firstSeenAt'] === 1
  ));
  assert.ok(eventIndexes.some(([fields, options]) => fields.eventKey === 1 && options.unique === true));
  assert.ok(eventIndexes.some(([fields]) =>
    fields.source === 1 && fields.event === 1 && fields.occurredAt === 1
  ));
  assert.ok(pendingIndexes.some(([fields, options]) =>
    fields.telegramId === 1 && options.unique === true
  ));
  assert.ok(pendingIndexes.some(([fields, options]) =>
    fields.expiresAt === 1 && options.expireAfterSeconds === 0
  ));
  assert.equal(PendingTelegramLaunch.schema.get('bufferCommands'), false);
});

test('traffic event writes are idempotent and keep attribution values unchanged', async () => {
  const originalUpdateOne = TrafficEvent.updateOne;
  const writes = [];
  TrafficEvent.updateOne = async (filter, update, options) => {
    writes.push({ filter, update, options });
    return { upsertedCount: writes.length === 1 ? 1 : 0 };
  };

  try {
    const user = {
      trafficAttribution: {
        source: 'tg_de_01',
        campaign: '01',
        market: 'de',
        landingCode: 'tg_de_01',
      },
    };
    const input = {
      telegramId: '1001',
      event: 'active',
      attribution: getUserTrafficAttribution(user),
      occurredAt: Date.UTC(2026, 9, 3),
    };

    assert.deepEqual(await recordTrafficEvent(input), { recorded: true, duplicate: false });
    assert.deepEqual(await recordTrafficEvent(input), { recorded: false, duplicate: true });
    assert.equal(writes[0].filter.eventKey, 'active:1001:2026-10-03');
    assert.equal(writes[0].update.$setOnInsert.source, 'tg_de_01');
    assert.deepEqual(writes[0].options, {
      upsert: true,
      maxTimeMS: TRAFFIC_EVENT_MAX_TIME_MS,
    });
  } finally {
    TrafficEvent.updateOne = originalUpdateOne;
  }
});

test('trusted pending launch stores the first payload and never overwrites it', async () => {
  const originalUpdateOne = PendingTelegramLaunch.updateOne;
  let stored = null;

  PendingTelegramLaunch.updateOne = async (filter, update, options = {}) => {
    if (update.$set) {
      if (stored && stored.telegramId === filter.telegramId && stored.expiresAt <= filter.expiresAt.$lte) {
        stored = { ...update.$set };
        return { modifiedCount: 1, upsertedCount: 0 };
      }
      return { modifiedCount: 0, upsertedCount: 0 };
    }
    if (update.$setOnInsert && options.upsert) {
      if (stored) return { modifiedCount: 0, upsertedCount: 0 };
      stored = { ...update.$setOnInsert };
      return { modifiedCount: 0, upsertedCount: 1 };
    }
    throw new Error('unexpected update');
  };

  try {
    const first = await storePendingTelegramLaunch({
      telegramId: '1001',
      payload: 'tg_de_01',
      now: 1000,
    });
    const second = await storePendingTelegramLaunch({
      telegramId: '1001',
      payload: 'tg_de_02',
      now: 2000,
    });

    assert.equal(first.stored, true);
    assert.equal(second.existing, true);
    assert.equal(stored.payload, 'tg_de_01');
    assert.equal(stored.expiresAt.getTime(), 1000 + PENDING_TELEGRAM_LAUNCH_TTL_MS);
    assert.equal(PENDING_TELEGRAM_LAUNCH_MAX_TIME_MS, 1500);
  } finally {
    PendingTelegramLaunch.updateOne = originalUpdateOne;
  }
});

test('trusted launch supports legacy and combined referral without using client hints', () => {
  const legacy = getPendingLaunchInsert('2002', '123456789', 1000);
  const combined = getPendingLaunchInsert(
    '2002',
    'ref_123456789__src_tg_de_01',
    1000
  );

  assert.equal(legacy.referralTelegramId, '123456789');
  assert.equal(combined.referralTelegramId, '123456789');
  assert.equal(combined.attribution.source, 'tg_de_01');
  const signed = selectTrustedTelegramLaunch(
    null,
    'ref_999__src_tg_de_99',
    1500
  );
  assert.equal(signed.referralTelegramId, '999');
  assert.equal(signed.attribution.source, 'tg_de_99');
  assert.equal(signed.firstSeenAt.getTime(), 1500);

  const firstTouch = {
    ...parseLaunchParam('tg_de_01'),
    firstSeenAt: new Date(1000),
  };
  const signedRoutingWithEarlierAttribution = selectTrustedTelegramLaunch(
    {
      ...parseLaunchParam('ref_111__src_tg_de_01'),
      firstSeenAt: new Date(1000),
    },
    'ref_222__src_tg_fr_02',
    2000
  );
  assert.equal(signedRoutingWithEarlierAttribution.referralTelegramId, '222');
  assert.equal(signedRoutingWithEarlierAttribution.attribution.source, 'tg_de_01');
  assert.equal(signedRoutingWithEarlierAttribution.firstSeenAt.getTime(), 1000);
  assert.equal(selectTrustedTelegramLaunch(firstTouch, 'tg_de_02').attribution.source, 'tg_de_01');
});

test('signed start_param is trusted while unsigned referral hints cannot grant a reward', async () => {
  const routeLayer = router.stack.find(
    (layer) => layer.route?.path === '/create' && layer.route?.methods?.post
  );
  const createHandler = routeLayer.route.stack.at(-1).handle;
  const originalFindOne = User.findOne;
  const originalStartSession = mongoose.startSession;
  const originalUserSave = User.prototype.save;
  const originalPendingFindOne = PendingTelegramLaunch.findOne;
  const originalPendingFindOneAndDelete = PendingTelegramLaunch.findOneAndDelete;
  const originalTrafficUpdateOne = TrafficEvent.updateOne;
  const users = new Map();
  const referrer = new User({ telegramId: '123456789', username: 'referrer' });
  users.set(referrer.telegramId, referrer);

  User.findOne = (filter) => ({
    session() {
      return this;
    },
    then(resolve, reject) {
      return Promise.resolve(users.get(String(filter.telegramId)) || null).then(resolve, reject);
    },
  });
  mongoose.startSession = async () => ({
    async withTransaction(callback) {
      return callback();
    },
    async endSession() {},
  });
  User.prototype.save = async function save() {
    users.set(String(this.telegramId), this);
    return this;
  };
  PendingTelegramLaunch.findOne = () => ({
    setOptions() {
      return this;
    },
    session() {
      return this;
    },
    then(resolve, reject) {
      return Promise.resolve(null).then(resolve, reject);
    },
  });
  PendingTelegramLaunch.findOneAndDelete = () => ({
    session() {
      return this;
    },
    then(resolve, reject) {
      return Promise.resolve(null).then(resolve, reject);
    },
  });
  TrafficEvent.updateOne = async () => ({ upsertedCount: 1 });

  const response = () => ({
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  });
  const request = (telegramId, startParam, body) => ({
    body,
    telegramUserId: telegramId,
    telegramAuth: {
      startParam,
      user: {
        id: Number(telegramId),
        first_name: 'New',
        username: `user_${telegramId}`,
        language_code: 'de',
      },
    },
  });

  try {
    const unsignedResponse = response();
    await createHandler(request('7101', null, {
      launchParam: 'ref_123456789__src_tg_de_01',
      referredBy: '123456789',
    }), unsignedResponse);

    const unsignedUser = users.get('7101');
    assert.equal(unsignedResponse.statusCode, 200);
    assert.equal(unsignedUser.referredBy, null);
    assert.equal(unsignedUser.trafficAttribution, undefined);
    assert.equal(unsignedUser.balance, 0);
    assert.equal(
      unsignedUser.transactions.filter((entry) => entry.type === 'income_referral').length,
      0
    );
    assert.equal(referrer.referralsCount, 0);

    const signedResponse = response();
    await createHandler(request(
      '7102',
      'ref_123456789__src_tg_de_01',
      {
        launchParam: 'ref_999999999__src_tg_fr_02',
        referredBy: '999999999',
      }
    ), signedResponse);

    const signedUser = users.get('7102');
    assert.equal(signedResponse.statusCode, 200);
    assert.equal(signedUser.referredBy, '123456789');
    assert.equal(signedUser.trafficAttribution.source, 'tg_de_01');
    assert.equal(signedUser.trafficAttribution.firstSeenAt instanceof Date, true);
    assert.equal(
      signedUser.transactions.filter((entry) => entry.type === 'income_referral').length,
      1
    );
    assert.ok(signedUser.balance > 0);
    assert.equal(referrer.referralsCount, 1);
  } finally {
    User.findOne = originalFindOne;
    mongoose.startSession = originalStartSession;
    User.prototype.save = originalUserSave;
    PendingTelegramLaunch.findOne = originalPendingFindOne;
    PendingTelegramLaunch.findOneAndDelete = originalPendingFindOneAndDelete;
    TrafficEvent.updateOne = originalTrafficUpdateOne;
  }
});

test('join-team accepts only signed or pending invite codes while manual teamName remains available', async () => {
  const routeLayer = router.stack.find(
    (layer) => layer.route?.path === '/join-team' && layer.route?.methods?.post
  );
  const joinHandler = routeLayer.route.stack.at(-1).handle;
  const originalFindOne = User.findOne;
  const originalFind = User.find;
  const originalAggregate = User.aggregate;
  const originalPendingFindOne = PendingTelegramLaunch.findOne;
  const originalCollection = mongoose.connection.collection;
  const teamName = 'OnixCrew';
  const teamCode = Buffer.from(teamName, 'utf8').toString('base64url');
  const otherCode = Buffer.from('OtherCrew', 'utf8').toString('base64url');
  const player = new User({ telegramId: '7201', username: 'player' });
  player.save = async () => player;
  let pending = null;

  User.findOne = async (filter) => (
    String(filter.telegramId || '') === player.telegramId ? player : null
  );
  User.find = () => ({
    async select() {
      return [player];
    },
  });
  User.aggregate = async () => [];
  PendingTelegramLaunch.findOne = () => ({
    setOptions() {
      return this;
    },
    then(resolve, reject) {
      return Promise.resolve(pending).then(resolve, reject);
    },
  });
  mongoose.connection.collection = () => ({
    async findOne() {
      return {
        _id: 'team-id',
        name: teamName,
        teamName,
        normalizedName: teamName.toLowerCase(),
      };
    },
    async updateOne() {},
  });

  const response = () => ({
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  });
  const request = ({ body, startParam = null }) => ({
    body: { telegramId: player.telegramId, ...body },
    telegramUserId: player.telegramId,
    telegramAuth: { startParam, user: { id: Number(player.telegramId) } },
  });

  try {
    const signedMatch = response();
    await joinHandler(request({
      body: { teamCode },
      startParam: `team_${teamCode}`,
    }), signedMatch);
    assert.equal(signedMatch.statusCode, 200);
    assert.equal(player.teamName, teamName);

    const signedMismatch = response();
    await joinHandler(request({
      body: { teamCode },
      startParam: `team_${otherCode}`,
    }), signedMismatch);
    assert.equal(signedMismatch.statusCode, 403);

    const unsignedCode = response();
    await joinHandler(request({ body: { teamCode } }), unsignedCode);
    assert.equal(unsignedCode.statusCode, 403);

    pending = {
      telegramId: player.telegramId,
      payload: `team_${teamCode}`,
      createdAt: new Date(1000),
      expiresAt: new Date(Date.now() + 60_000),
    };
    const pendingMatch = response();
    await joinHandler(request({ body: { teamCode } }), pendingMatch);
    assert.equal(pendingMatch.statusCode, 200);
    assert.equal(player.teamName, teamName);

    pending = null;
    const manualJoin = response();
    await joinHandler(request({ body: { teamName } }), manualJoin);
    assert.equal(manualJoin.statusCode, 200);
    assert.equal(player.teamName, teamName);

    const mixedBypass = response();
    await joinHandler(request({
      body: { teamCode, teamName: 'OtherCrew' },
      startParam: `team_${teamCode}`,
    }), mixedBypass);
    assert.equal(mixedBypass.statusCode, 403);
  } finally {
    User.findOne = originalFindOne;
    User.find = originalFind;
    User.aggregate = originalAggregate;
    PendingTelegramLaunch.findOne = originalPendingFindOne;
    mongoose.connection.collection = originalCollection;
  }
});

test('pending launch consumption is user-bound, one-time and rejects expired data', async () => {
  const originalFindOneAndDelete = PendingTelegramLaunch.findOneAndDelete;
  const observed = [];
  const session = { id: 'test-session' };
  let returned = {
    telegramId: '1001',
    payload: 'tg_de_01',
    createdAt: new Date(1000),
  };

  PendingTelegramLaunch.findOneAndDelete = (filter) => ({
    session(value) {
      observed.push({ filter, session: value });
      return this;
    },
    then(resolve, reject) {
      const value = returned;
      returned = null;
      return Promise.resolve(value).then(resolve, reject);
    },
  });

  try {
    const first = await consumePendingTelegramLaunch('1001', { now: 2000, session });
    const replay = await consumePendingTelegramLaunch('1001', { now: 2000, session });

    assert.equal(first.attribution.source, 'tg_de_01');
    assert.equal(first.firstSeenAt.getTime(), 1000);
    assert.equal(replay, null);
    assert.equal(observed[0].filter.telegramId, '1001');
    assert.equal(observed[0].filter.expiresAt.$gt.getTime(), 2000);
    assert.equal(observed[0].session, session);
  } finally {
    PendingTelegramLaunch.findOneAndDelete = originalFindOneAndDelete;
  }
});

test('H, I and J: best-effort traffic queue never blocks business responses', async (t) => {
  const warnings = [];
  t.mock.method(console, 'warn', (message) => warnings.push(message));

  let unresolvedWriterCalled = false;
  let resolveUnresolved;
  const unresolved = new Promise((resolve) => {
    resolveUnresolved = resolve;
  });
  const result = queueTrafficEvent({ event: 'active' }, () => {
    unresolvedWriterCalled = true;
    return unresolved;
  }, 5);
  assert.equal(result, undefined);

  queueTrafficEvent({ event: 'withdrawal' }, async () => {
    throw new Error('isolated analytics failure');
  });
  await new Promise((resolve) => setTimeout(resolve, 15));

  assert.equal(unresolvedWriterCalled, true);
  assert.equal(TRAFFIC_EVENT_QUEUE_TIMEOUT_MS, 1500);
  assert.deepEqual(warnings, [
    'Traffic analytics write failed',
    'Traffic analytics write failed',
  ]);
  resolveUnresolved({ recorded: true });
  await new Promise((resolve) => setImmediate(resolve));
});

test('telemetry concurrency is bounded and excess events are dropped', async (t) => {
  const warnings = [];
  const releases = [];
  let started = 0;
  t.mock.method(console, 'warn', (message) => warnings.push(message));

  for (let index = 0; index < TRAFFIC_EVENT_MAX_IN_FLIGHT + 3; index += 1) {
    const result = queueTrafficEvent(
      { event: 'active', index },
      () => {
        started += 1;
        return new Promise((resolve) => releases.push(resolve));
      },
      5
    );
    assert.equal(result, undefined);
  }

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(started, TRAFFIC_EVENT_MAX_IN_FLIGHT);
  assert.equal(
    warnings.filter((message) => message === 'Traffic analytics queue capacity reached').length,
    3
  );

  await new Promise((resolve) => setTimeout(resolve, 10));
  for (const release of releases) release({ recorded: true });
  await new Promise((resolve) => setImmediate(resolve));

  queueTrafficEvent({ event: 'active' }, async () => {
    throw new Error('late analytics rejection');
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(warnings.includes('Traffic analytics write failed'));
});

test('MongoDB telemetry timeout or rejection is contained as storage failure', async () => {
  const originalUpdateOne = TrafficEvent.updateOne;
  TrafficEvent.updateOne = async () => {
    const error = new Error('operation exceeded time limit');
    error.code = 50;
    throw error;
  };

  try {
    const result = await recordTrafficEvent({
      telegramId: 'timeout-user',
      event: 'active',
      attribution: parseLaunchParam('tg_de_01').attribution,
    });
    assert.deepEqual(result, { recorded: false, reason: 'storage_error' });
  } finally {
    TrafficEvent.updateOne = originalUpdateOne;
  }
});

test('C, D, H, I and J: critical routes ignore client referral hints and never await analytics', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'coinRoutes.js'), 'utf8');
  const frontendSource = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'frontend', 'src', 'App.tsx'),
    'utf8'
  );
  const createRoute = source.slice(
    source.indexOf("router.post('/create'"),
    source.indexOf('// SAVE USER PROGRESS')
  );
  const withdrawalStart = source.indexOf("router.post('/request-withdrawal'");
  const withdrawalEnd = source.indexOf('\nrouter.', withdrawalStart + 1);
  const withdrawalRoute = source.slice(
    withdrawalStart,
    withdrawalEnd === -1 ? source.length : withdrawalEnd
  );

  assert.doesNotMatch(source, /await\s+(?:record|queue)TrafficEvent\s*\(/);
  assert.doesNotMatch(createRoute, /req\.body\.(?:launchParam|referredBy)/);
  assert.match(createRoute, /req\.telegramAuth\?\.startParam/);
  assert.doesNotMatch(createRoute, /\blaunchParam\b/);
  assert.doesNotMatch(createRoute, /\breferredBy\s*[,}]/);
  assert.match(createRoute, /consumePendingTelegramLaunch\(telegramId/);
  assert.match(createRoute, /session\.withTransaction/);
  assert.ok(
    withdrawalRoute.indexOf('await user.save()') < withdrawalRoute.indexOf('queueTrafficEvent({'),
    'withdrawal must be persisted before best-effort telemetry is queued'
  );
  assert.match(frontendSource, /coinonix_bot\?start=\$\{telegramId\}/);
  assert.doesNotMatch(frontendSource, /coinonix_bot\/onix\?startapp=\$\{telegramId\}/);
  assert.doesNotMatch(frontendSource, /location\.search[\s\S]{0,120}onix_start/);
});

test('A, E and F: trusted pending launches carry marketing and legacy referrals to registration', () => {
  const marketing = getPendingLaunchInsert('3001', 'tg_de_01', 1000);
  const combined = getPendingLaunchInsert('3002', 'ref_123456789__src_tg_de_01', 1000);
  const legacy = getPendingLaunchInsert('3003', '123456789', 1000);

  assert.equal(selectTrustedTelegramLaunch(marketing).attribution.source, 'tg_de_01');
  assert.equal(selectTrustedTelegramLaunch(combined).referralTelegramId, '123456789');
  assert.equal(selectTrustedTelegramLaunch(combined).attribution.source, 'tg_de_01');
  assert.equal(selectTrustedTelegramLaunch(legacy).referralTelegramId, '123456789');
});

test('K: duplicate landing events share one idempotency key', async () => {
  const originalUpdateOne = TrafficEvent.updateOne;
  const stored = new Set();

  TrafficEvent.updateOne = async (filter) => {
    if (stored.has(filter.eventKey)) return { upsertedCount: 0 };
    stored.add(filter.eventKey);
    return { upsertedCount: 1 };
  };

  try {
    const input = {
      telegramId: '4001',
      event: 'landing',
      attribution: parseLaunchParam('tg_de_01').attribution,
      occurredAt: 1000,
      deduplicationKey: 'tg_de_01',
    };
    assert.deepEqual(await recordTrafficEvent(input), { recorded: true, duplicate: false });
    assert.deepEqual(await recordTrafficEvent(input), { recorded: false, duplicate: true });
    assert.equal(stored.size, 1);
  } finally {
    TrafficEvent.updateOne = originalUpdateOne;
  }
});

test('L and M: later trusted sources cannot replace stored User first touch', () => {
  const user = {};
  const first = selectTrustedTelegramLaunch(getPendingLaunchInsert('5001', 'tg_de_01', 1000));
  const later = selectTrustedTelegramLaunch(getPendingLaunchInsert('5001', 'tg_de_02', 2000));

  assert.equal(applyFirstTouchAttribution(user, first.attribution, {
    isNewUser: true,
    now: first.createdAt,
  }), true);
  assert.equal(applyFirstTouchAttribution(user, later.attribution, {
    isNewUser: true,
    now: later.createdAt,
  }), false);
  assert.equal(user.trafficAttribution.source, 'tg_de_01');
});

test('N: an expired pending launch cannot be consumed for referral reward', async () => {
  const originalFindOneAndDelete = PendingTelegramLaunch.findOneAndDelete;
  let stored = {
    telegramId: '6001',
    payload: 'ref_123456789',
    createdAt: new Date(1000),
    expiresAt: new Date(2000),
  };

  PendingTelegramLaunch.findOneAndDelete = (filter) => ({
    then(resolve, reject) {
      const isEligible =
        stored &&
        stored.telegramId === filter.telegramId &&
        stored.expiresAt > filter.expiresAt.$gt;
      const value = isEligible ? stored : null;
      if (isEligible) stored = null;
      return Promise.resolve(value).then(resolve, reject);
    },
  });

  try {
    const result = await consumePendingTelegramLaunch('6001', { now: 3000 });
    assert.equal(result, null);
    assert.equal(stored.payload, 'ref_123456789');
  } finally {
    PendingTelegramLaunch.findOneAndDelete = originalFindOneAndDelete;
  }
});

test('O: concurrent registration is protected by unique User identity and transaction retry path', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'coinRoutes.js'), 'utf8');
  const createRoute = source.slice(
    source.indexOf("router.post('/create'"),
    source.indexOf('// SAVE USER PROGRESS')
  );
  const userIndexes = User.schema.indexes();

  assert.ok(userIndexes.some(([fields, options]) =>
    fields.telegramId === 1 && options.unique === true
  ));
  assert.match(createRoute, /User\.findOne\(\{ telegramId \}\)\.session\(session\)/);
  assert.match(createRoute, /error\?\.code !== 11000/);
  assert.match(createRoute, /user = await User\.findOne\(\{ telegramId \}\)/);
  assert.match(createRoute, /await refUser\.save\(\{ session \}\)/);
  assert.match(createRoute, /await user\.save\(\{ session \}\)/);
});

test('O regression: concurrent create requests apply one trusted referral exactly once', async () => {
  const routeLayer = router.stack.find(
    (layer) => layer.route?.path === '/create' && layer.route?.methods?.post
  );
  const createHandler = routeLayer.route.stack.at(-1).handle;
  const originalFindOne = User.findOne;
  const originalStartSession = mongoose.startSession;
  const originalUserSave = User.prototype.save;
  const originalPendingFindOne = PendingTelegramLaunch.findOne;
  const originalPendingFindOneAndDelete = PendingTelegramLaunch.findOneAndDelete;
  const originalTrafficUpdateOne = TrafficEvent.updateOne;
  const users = new Map();
  const referrer = new User({ telegramId: '123456789', username: 'referrer' });
  users.set(referrer.telegramId, referrer);
  let pending = {
    telegramId: '7001',
    payload: 'ref_123456789__src_tg_de_01',
    createdAt: new Date(1000),
    expiresAt: new Date(Date.now() + 60_000),
  };
  let outerCreateReads = 0;
  let releaseOuterReads;
  const bothOuterReads = new Promise((resolve) => {
    releaseOuterReads = resolve;
  });
  let transactionQueue = Promise.resolve();

  User.findOne = (filter) => {
    let session = null;
    return {
      session(value) {
        session = value;
        return this;
      },
      async then(resolve, reject) {
        try {
          if (!session && filter.telegramId === '7001' && outerCreateReads < 2) {
            outerCreateReads += 1;
            if (outerCreateReads === 2) releaseOuterReads();
            await bothOuterReads;
            return resolve(null);
          }
          return resolve(users.get(String(filter.telegramId)) || null);
        } catch (error) {
          return reject(error);
        }
      },
    };
  };
  mongoose.startSession = async () => ({
    withTransaction(callback) {
      const run = transactionQueue.then(callback);
      transactionQueue = run.catch(() => {});
      return run;
    },
    async endSession() {},
  });
  User.prototype.save = async function save() {
    users.set(String(this.telegramId), this);
    return this;
  };
  PendingTelegramLaunch.findOne = () => ({
    setOptions() {
      return this;
    },
    session() {
      return this;
    },
    then(resolve, reject) {
      return Promise.resolve(pending).then(resolve, reject);
    },
  });
  PendingTelegramLaunch.findOneAndDelete = (filter) => ({
    session() {
      return this;
    },
    then(resolve, reject) {
      const eligible =
        pending &&
        pending.telegramId === filter.telegramId &&
        pending.expiresAt > filter.expiresAt.$gt;
      const value = eligible ? pending : null;
      if (eligible) pending = null;
      return Promise.resolve(value).then(resolve, reject);
    },
  });
  TrafficEvent.updateOne = async () => ({ upsertedCount: 1 });

  const createResponse = () => ({
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  });
  const createRequest = () => ({
    body: {
      launchParam: 'ref_999999999',
      referredBy: '999999999',
    },
    telegramUserId: '7001',
    telegramAuth: {
      user: {
        id: 7001,
        first_name: 'New',
        username: 'new_user',
        language_code: 'de',
      },
    },
  });

  try {
    const responses = [createResponse(), createResponse()];
    await Promise.all([
      createHandler(createRequest(), responses[0]),
      createHandler(createRequest(), responses[1]),
    ]);

    const createdUser = users.get('7001');
    assert.equal(responses[0].statusCode, 200);
    assert.equal(responses[1].statusCode, 200);
    assert.equal(createdUser.referredBy, '123456789');
    assert.equal(createdUser.trafficAttribution.source, 'tg_de_01');
    const referralTransactions = createdUser.transactions.filter(
      (entry) => entry.type === 'income_referral'
    );
    assert.equal(referralTransactions.length, 1);
    assert.ok(referralTransactions[0].amount > 0);
    assert.equal(createdUser.balance, referralTransactions[0].amount);
    assert.equal(createdUser.totalEarned, referralTransactions[0].amount);
    assert.equal(referrer.referralsCount, 1);
    assert.equal(users.size, 2);
    assert.equal(pending, null);
  } finally {
    User.findOne = originalFindOne;
    mongoose.startSession = originalStartSession;
    User.prototype.save = originalUserSave;
    PendingTelegramLaunch.findOne = originalPendingFindOne;
    PendingTelegramLaunch.findOneAndDelete = originalPendingFindOneAndDelete;
    TrafficEvent.updateOne = originalTrafficUpdateOne;
  }
});
