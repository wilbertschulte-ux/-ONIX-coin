const assert = require('node:assert/strict');
const test = require('node:test');

process.env.NODE_ENV = 'test';

const router = require('../routes/coinRoutes');
const User = require('../models/User');
const FortuneWheelProgress = require('../models/FortuneWheelProgress');
const FortuneWheelPrizeInventory = require('../models/FortuneWheelPrizeInventory');
const FortuneWheelPrizeEntitlement = require('../models/FortuneWheelPrizeEntitlement');
const PhysicalPrizeRequest = require('../models/PhysicalPrizeRequest');
const {
  LEGACY_CAMPAIGN_KEY,
  WEEKLY_CAMPAIGN_KEY,
  WEEKLY_MODE,
  buildWeeklyFortuneWheelStatus,
  checkWeeklyFortuneWheelReadiness,
  evaluateWeeklyEligibility,
  getFortuneWheelMode,
  performWeeklyFortuneWheelSpin,
  performWeeklyIphoneColorSelection,
} = require('../fortuneWheelWeeklyApi');
const { getFortuneWheelCampaignConfig } = require('../fortuneWheel');
const { drawWeeklyPrize } = require('../fortuneWheelWeekly');

function query(value) {
  const result = {
    session() { return Promise.resolve(value); },
    select() { return result; },
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
  };
  return result;
}

function leanQuery(value) {
  const result = {
    select() { return result; },
    session() { return result; },
    lean() { return Promise.resolve(value); },
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
  };
  return result;
}

function stagingEnvironment(overrides = {}) {
  return {
    NODE_ENV: 'production', ONIX_DEPLOY_ENV: 'staging',
    STAGING_DEPLOYMENT_CONFIRMATION: 'ONIX_STAGING_ONLY',
    TELEGRAM_WEBHOOK_SECRET: 'a'.repeat(32), ADMIN_SECRET: 'b'.repeat(32),
    ACCOUNT_RECOVERY_SECRET: 'c'.repeat(32), CRON_SECRET: 'd'.repeat(32),
    STAGING_TELEGRAM_BOT_ID: '123456789', BOT_TOKEN: `123456789:${'x'.repeat(32)}`,
    WEB_APP_URL: 'https://onix-staging.example.test',
    STAGING_FRONTEND_ALLOWED_HOSTS: 'onix-staging.example.test',
    MONGO_URI: 'mongodb://user:password@mongo-staging.example.test/onix_staging',
    STAGING_MONGODB_DATABASE: 'onix_staging',
    STAGING_MONGODB_ALLOWED_DATABASES: 'onix_staging',
    STAGING_MONGODB_ALLOWED_HOSTS: 'mongo-staging.example.test',
    FORTUNE_WHEEL_MODE: WEEKLY_MODE,
    FORTUNE_WHEEL_CAMPAIGN_KEY: WEEKLY_CAMPAIGN_KEY,
    FORTUNE_WHEEL_CONFIG_VERSION: 'weekly-random-v1',
    FORTUNE_WHEEL_RANDOM_SECRET: 'weekly-random-secret-'.repeat(3),
    ...overrides,
  };
}

function readyConnection({
  legacyIndex = false,
  inventory = true,
  unknownLegacy = false,
  ambiguousLegacy = false,
} = {}) {
  const indexMap = {
    fortune_wheel_progress: [
      { key: { campaignKey: 1, telegramId: 1, weekKey: 1 }, unique: true },
      {
        key: { campaignKey: 1, telegramId: 1, 'claims.idempotencyKey': 1 },
        unique: true,
        partialFilterExpression: { 'claims.idempotencyKey': { $type: 'string' } },
      },
      ...(legacyIndex ? [{ key: { campaignKey: 1, telegramId: 1 }, unique: true }] : []),
    ],
    fortune_wheel_prize_entitlements: [
      { key: { campaignKey: 1, telegramId: 1, prizeCode: 1 }, unique: true },
      { key: { campaignKey: 1, prizeCode: 1, slot: 1 }, unique: true },
      { key: { progressId: 1 }, unique: true },
    ],
    fortune_wheel_prize_inventory: [
      { key: { campaignKey: 1, prizeCode: 1 }, unique: true },
    ],
  };
  return {
    name: 'onix_staging',
    db: {
      collection(name) {
        return {
          async indexes() { return indexMap[name] || []; },
          async findOne(filter = {}) {
            if (filter.mode === 'legacy_fixed_v1') return unknownLegacy ? { _id: 'unknown' } : null;
            return inventory ? {
              campaignKey: WEEKLY_CAMPAIGN_KEY, prizeCode: 'iphone_duo', capacity: 100,
              reserved: 0, fulfilled: 0, configVersion: 'weekly-random-v1',
            } : null;
          },
          aggregate() { return { async toArray() { return ambiguousLegacy ? [{ _id: '9001' }] : []; } }; },
        };
      },
    },
  };
}

function enabledConfig() {
  return getFortuneWheelCampaignConfig({
    FORTUNE_WHEEL_ENABLED: 'true',
    FORTUNE_WHEEL_CAMPAIGN_APPROVED: 'true',
    FORTUNE_WHEEL_CAMPAIGN_KEY: WEEKLY_CAMPAIGN_KEY,
    FORTUNE_WHEEL_ELIGIBLE_TELEGRAM_IDS: '9001',
    FORTUNE_WHEEL_IPHONE_COLORS: 'gold,midnight',
  });
}

test('weekly mode is explicit and legacy remains the default', () => {
  assert.equal(getFortuneWheelMode({}), 'legacy_fixed_v1');
  assert.equal(getFortuneWheelMode({ FORTUNE_WHEEL_MODE: WEEKLY_MODE }), WEEKLY_MODE);
  assert.throws(() => getFortuneWheelMode({ FORTUNE_WHEEL_MODE: 'random' }));
});

test('readiness requires staging, migrated indexes, secret and inventory capacity 100', async () => {
  const ready = await checkWeeklyFortuneWheelReadiness({
    connection: readyConnection(), environment: stagingEnvironment(),
  });
  assert.equal(ready.ready, true);

  const legacyIndex = await checkWeeklyFortuneWheelReadiness({
    connection: readyConnection({ legacyIndex: true }), environment: stagingEnvironment(),
  });
  assert.equal(legacyIndex.code, 'WEEKLY_LEGACY_PROGRESS_INDEX_ACTIVE');

  const noInventory = await checkWeeklyFortuneWheelReadiness({
    connection: readyConnection({ inventory: false }), environment: stagingEnvironment(),
  });
  assert.equal(noInventory.code, 'WEEKLY_INVENTORY_NOT_READY');

  const noSecret = await checkWeeklyFortuneWheelReadiness({
    connection: readyConnection(), environment: stagingEnvironment({ FORTUNE_WHEEL_RANDOM_SECRET: '' }),
  });
  assert.equal(noSecret.ready, false);
  assert.equal(noSecret.code, 'RANDOM_SECRET_INVALID');

  const wrongVersion = await checkWeeklyFortuneWheelReadiness({
    connection: readyConnection(),
    environment: stagingEnvironment({ FORTUNE_WHEEL_CONFIG_VERSION: 'unapproved' }),
  });
  assert.equal(wrongVersion.code, 'WEEKLY_CONFIG_VERSION_INVALID');

  const unknownLegacyCampaign = await checkWeeklyFortuneWheelReadiness({
    connection: readyConnection({ unknownLegacy: true }), environment: stagingEnvironment(),
  });
  assert.equal(unknownLegacyCampaign.code, 'WEEKLY_UNKNOWN_LEGACY_CAMPAIGN');

  const ambiguousLegacyOwnership = await checkWeeklyFortuneWheelReadiness({
    connection: readyConnection({ ambiguousLegacy: true }), environment: stagingEnvironment(),
  });
  assert.equal(ambiguousLegacyOwnership.code, 'WEEKLY_LEGACY_OWNERSHIP_AMBIGUOUS');
});

test('weekly status exposes UTC reset, limits, claims, effective probabilities and legacy requests', () => {
  const status = buildWeeklyFortuneWheelStatus({
    user: { telegramId: '9001', isFrozen: false },
    progress: { spinsUsed: 2, claims: [{
      spin: 1, rewardType: 'onix', amount: 5000, rewardCode: 'onix_5000',
      configVersion: 'weekly-random-v1', drawVersion: 'hmac-sha256-rejection-v1',
    }] },
    inventory: { capacity: 100, reserved: 100, fulfilled: 0 },
    playerHasPhysicalPrize: false,
    physicalPrizeRequests: [{ campaignKey: 'fortune-wheel-v1', color: 'gold', status: 'pending' }],
    config: enabledConfig(), readiness: { ready: true },
    now: new Date('2026-11-04T12:00:00.000Z'),
  });
  assert.equal(status.weekKey, '2026-11-02');
  assert.equal(status.resetsAt.toISOString(), '2026-11-09T00:00:00.000Z');
  assert.deepEqual(status.spins, { limit: 3, used: 2, remaining: 1 });
  assert.equal(status.prizes.find((item) => item.prizeCode === 'iphone_duo').available, false);
  assert.equal(status.prizes.reduce((sum, item) => sum + item.effectiveWeightPpm, 0), 1_000_000);
  assert.equal(status.physicalPrize.requests[0].color, 'gold');
  assert.equal(status.physicalPrize.unlocked, false);
  assert.equal(status.physicalPrize.canSelectColor, false);
  assert.deepEqual(status.physicalPrize.colors, []);
});

test('weekly status unlocks server colors only for a valid unrequested entitlement from any week', () => {
  const base = {
    user: { telegramId: '9001', isFrozen: false },
    progress: null,
    inventory: { capacity: 100, reserved: 1, fulfilled: 0 },
    playerHasPhysicalPrize: true,
    physicalPrizeRequests: [],
    config: enabledConfig(), readiness: { ready: true },
    now: new Date('2026-11-16T12:00:00.000Z'),
  };
  const previousWeekEntitlement = {
    campaignKey: WEEKLY_CAMPAIGN_KEY,
    telegramId: '9001',
    prizeCode: 'iphone_duo',
    sourceMode: WEEKLY_MODE,
    status: 'reserved',
    progressId: '64b000000000000000000001',
    weekKey: '2026-11-02',
    physicalPrizeRequestId: null,
  };
  const unlocked = buildWeeklyFortuneWheelStatus({
    ...base, weeklyEntitlement: previousWeekEntitlement,
  });
  assert.equal(unlocked.weekKey, '2026-11-16');
  assert.equal(unlocked.physicalPrize.unlocked, true);
  assert.equal(unlocked.physicalPrize.canSelectColor, true);
  assert.deepEqual(unlocked.physicalPrize.colors, ['gold', 'midnight']);

  const requested = buildWeeklyFortuneWheelStatus({
    ...base,
    weeklyEntitlement: { ...previousWeekEntitlement, physicalPrizeRequestId: '64c000000000000000001' },
    hasWeeklyPhysicalPrizeRequest: true,
    physicalPrizeRequests: [{ campaignKey: WEEKLY_CAMPAIGN_KEY, requestId: 'request-1' }],
  });
  assert.equal(requested.physicalPrize.unlocked, true);
  assert.equal(requested.physicalPrize.canSelectColor, false);
  assert.deepEqual(requested.physicalPrize.colors, []);
  assert.equal(requested.physicalPrize.requests[0].requestId, 'request-1');

  const stagingLegacy = buildWeeklyFortuneWheelStatus({
    ...base,
    weeklyEntitlement: {
      ...previousWeekEntitlement,
      campaignKey: 'fortune-wheel-staging-v1',
      sourceMode: 'legacy_fixed_v1',
      weekKey: 'legacy',
    },
  });
  assert.equal(stagingLegacy.physicalPrize.unlocked, true);
  assert.equal(stagingLegacy.physicalPrize.canSelectColor, true);

  for (const invalidEntitlement of [
    null,
    { ...previousWeekEntitlement, telegramId: 'other-player' },
    { ...previousWeekEntitlement, campaignKey: LEGACY_CAMPAIGN_KEY },
    { ...previousWeekEntitlement, status: 'cancelled' },
    { ...previousWeekEntitlement, progressId: null },
  ]) {
    const unavailable = buildWeeklyFortuneWheelStatus({
      ...base, weeklyEntitlement: invalidEntitlement,
    });
    assert.equal(unavailable.physicalPrize.unlocked, false);
    assert.equal(unavailable.physicalPrize.canSelectColor, false);
    assert.deepEqual(unavailable.physicalPrize.colors, []);
  }
});

test('weekly eligibility remains fail-closed for readiness, frozen, approval and campaign dates', () => {
  const now = new Date('2026-11-04T12:00:00.000Z');
  const user = { telegramId: '9001', isFrozen: false };
  const enabled = enabledConfig();
  assert.equal(evaluateWeeklyEligibility({ user, config: enabled, readiness: { ready: false }, now }).eligible, false);
  assert.equal(evaluateWeeklyEligibility({ user: { ...user, isFrozen: true }, config: enabled, readiness: { ready: true }, now }).code, 'USER_FROZEN');
  assert.equal(evaluateWeeklyEligibility({
    user, config: { ...enabled, approved: false }, readiness: { ready: true }, now,
  }).code, 'CAMPAIGN_NOT_APPROVED');
  assert.equal(evaluateWeeklyEligibility({
    user, config: { ...enabled, endsAt: new Date('2026-11-04T12:00:00.000Z') },
    readiness: { ready: true }, now,
  }).code, 'CAMPAIGN_ENDED');
  assert.equal(evaluateWeeklyEligibility({ user, config: enabled, readiness: { ready: true }, now }).eligible, true);
});

function spinHarness({
  inventoryReserved = 100,
  reservationFails = false,
  progressUpdateFails = false,
} = {}) {
  const user = { telegramId: '9001', isFrozen: false, balance: 0 };
  const progresses = [];
  let credits = 0;
  const ProgressModel = {
    findOne(filter) {
      if (filter['physicalPrizeReservation.slot']) return query(null);
      if (filter['claims.idempotencyKey']) {
        return query(progresses.find((item) => item.claims.some(
          (claim) => claim.idempotencyKey === filter['claims.idempotencyKey']
        )) || null);
      }
      return query(progresses.find((item) => item.weekKey === filter.weekKey) || null);
    },
    async create(documents) {
      const progress = {
        _id: `64b00000000000000000000${progresses.length + 1}`,
        ...structuredClone(documents[0]),
      };
      progresses.push(progress);
      return [progress];
    },
    async findOneAndUpdate(filter, update) {
      if (progressUpdateFails) return null;
      const progress = progresses.find((item) => item._id === filter._id);
      if (!progress || progress.spinsUsed !== filter.spinsUsed) return null;
      if (progress.claims.some((claim) => claim.spin === filter['claims.spin'].$ne)) return null;
      progress.spinsUsed += update.$inc.spinsUsed;
      progress.completedSpins += update.$inc.completedSpins;
      progress.claims.push(structuredClone(update.$push.claims));
      if (update.$set) Object.assign(progress, structuredClone(update.$set));
      return progress;
    },
  };
  const UserModel = { findOne: () => query(user) };
  const inventory = { capacity: 100, reserved: inventoryReserved, fulfilled: 0, configVersion: 'weekly-random-v1' };
  const InventoryModel = {
    findOne: () => query(inventory),
    async findOneAndUpdate() {
      if (reservationFails || inventory.reserved >= inventory.capacity) return null;
      inventory.reserved += 1;
      return inventory;
    },
  };
  const entitlements = [];
  const EntitlementModel = {
    findOne: () => query(entitlements[0] || null),
    async create(documents) {
      const entitlement = {
        _id: '64c000000000000000000001',
        ...structuredClone(documents[0]),
        slot: inventory.reserved,
      };
      entitlements.push(entitlement);
      return [entitlement];
    },
  };
  const RequestModel = { findOne: () => query(null) };
  return {
    user, progresses, entitlements, inventory,
    input: {
      telegramId: '9001', config: enabledConfig(), readiness: { ready: true }, session: {},
      secret: 'weekly-spin-test-secret-'.repeat(3), UserModel, ProgressModel,
      InventoryModel, EntitlementModel, RequestModel,
      async creditOnix({ user: target, amount }) { credits += 1; target.balance += amount; return {}; },
    },
    get credits() { return credits; },
  };
}

function findIphoneDrawKey(secret, weekKey = '2026-11-02') {
  for (let index = 0; index < 500; index += 1) {
    const key = `weekly:iphone:${String(index).padStart(4, '0')}`;
    const draw = drawWeeklyPrize({
      secret, campaignKey: WEEKLY_CAMPAIGN_KEY, weekKey, telegramId: '9001',
      spin: 1, idempotencyKey: key, physicalPrizeAvailable: true,
    });
    if (draw.reward.type === 'physical_prize') return key;
  }
  throw new Error('Unable to find deterministic physical prize fixture');
}

test('weekly spin is idempotent, enforces three spins and creates a new UTC-week document', async () => {
  const harness = spinHarness();
  const now = new Date('2026-11-04T12:00:00.000Z');
  const firstInput = { ...harness.input, expectedSpin: 1, idempotencyKey: 'weekly:spin:one', now };
  const first = await performWeeklyFortuneWheelSpin(firstInput);
  const retry = await performWeeklyFortuneWheelSpin(firstInput);
  const conflict = await performWeeklyFortuneWheelSpin({
    ...firstInput, idempotencyKey: 'weekly:spin:other',
  });
  assert.equal(first.status, 'success');
  assert.equal(first.idempotent, false);
  assert.equal(retry.idempotent, true);
  assert.equal(conflict.status, 'already_claimed');

  await performWeeklyFortuneWheelSpin({
    ...harness.input, expectedSpin: 2, idempotencyKey: 'weekly:spin:two', now,
  });
  await performWeeklyFortuneWheelSpin({
    ...harness.input, expectedSpin: 3, idempotencyKey: 'weekly:spin:three', now,
  });
  const fourth = await performWeeklyFortuneWheelSpin({
    ...harness.input, expectedSpin: 4, idempotencyKey: 'weekly:spin:four', now,
  });
  assert.equal(fourth.status, 'weekly_limit_reached');
  assert.equal(harness.progresses[0].claims.length, 3);
  assert.equal(harness.credits, 3);

  const nextWeek = await performWeeklyFortuneWheelSpin({
    ...harness.input, expectedSpin: 1, idempotencyKey: 'weekly:next:one',
    now: new Date('2026-11-09T00:00:00.000Z'),
  });
  assert.equal(nextWeek.status, 'success');
  assert.equal(harness.progresses.length, 2);
  assert.deepEqual(harness.progresses.map((item) => item.weekKey), ['2026-11-02', '2026-11-09']);
  const creditsBeforeBoundaryRetry = harness.credits;
  const boundaryRetry = await performWeeklyFortuneWheelSpin({
    ...harness.input, expectedSpin: 1, idempotencyKey: 'weekly:spin:one',
    now: new Date('2026-11-09T00:01:00.000Z'),
  });
  assert.equal(boundaryRetry.idempotent, true);
  assert.equal(boundaryRetry.claim.idempotencyKey, 'weekly:spin:one');
  assert.equal(harness.credits, creditsBeforeBoundaryRetry);
  assert.equal(harness.progresses.length, 2);
});

test('weekly spin reserves one entitlement atomically for an iPhone draw', async () => {
  const harness = spinHarness({ inventoryReserved: 0 });
  const idempotencyKey = findIphoneDrawKey(harness.input.secret);
  const result = await performWeeklyFortuneWheelSpin({
    ...harness.input, expectedSpin: 1, idempotencyKey,
    now: new Date('2026-11-04T12:00:00.000Z'),
  });
  assert.equal(result.status, 'success');
  assert.equal(result.claim.rewardType, 'physical_prize');
  assert.equal(result.claim.prizeCode, 'iphone_duo');
  assert.equal(harness.inventory.reserved, 1);
  assert.equal(harness.entitlements.length, 1);
  assert.equal(harness.progresses[0].physicalPrizeEntitlementId, harness.entitlements[0]._id);
  assert.equal(harness.credits, 0);
});

test('last-slot race excludes iPhone and commits a deterministic ONIX fallback', async () => {
  const harness = spinHarness({ inventoryReserved: 99, reservationFails: true });
  const idempotencyKey = findIphoneDrawKey(harness.input.secret);
  const result = await performWeeklyFortuneWheelSpin({
    ...harness.input, expectedSpin: 1, idempotencyKey,
    now: new Date('2026-11-04T12:00:00.000Z'),
  });
  assert.equal(result.status, 'success');
  assert.equal(result.claim.rewardType, 'onix');
  assert.equal(result.claim.amount > 0, true);
  assert.equal(harness.inventory.reserved, 99);
  assert.equal(harness.entitlements.length, 0);
  assert.equal(harness.credits, 1);
});

test('a progress conflict after iPhone reservation throws so the transaction cannot partially commit', async () => {
  const harness = spinHarness({ inventoryReserved: 0, progressUpdateFails: true });
  const idempotencyKey = findIphoneDrawKey(harness.input.secret);
  await assert.rejects(
    performWeeklyFortuneWheelSpin({
      ...harness.input, expectedSpin: 1, idempotencyKey,
      now: new Date('2026-11-04T12:00:00.000Z'),
    }),
    (error) => error?.code === 'CONCURRENT_SPIN_CONFLICT'
  );
  assert.equal(harness.credits, 0);
});

test('weekly color flow creates one request from an entitlement outside the current week', async () => {
  const user = { telegramId: '9001', isFrozen: false, username: 'winner' };
  const progress = { _id: 'old-week-progress', telegramId: '9001', physicalPrizeRequestId: null };
  const entitlement = {
    _id: 'entitlement-1', telegramId: '9001', campaignKey: WEEKLY_CAMPAIGN_KEY,
    prizeCode: 'iphone_duo', progressId: progress._id, physicalPrizeRequestId: null,
  };
  const requests = [];
  const UserModel = { findOne: () => query(user) };
  const ProgressModel = {
    findOne: () => query(progress),
    async findOneAndUpdate() { progress.physicalPrizeRequestId = 'request-object-id'; return progress; },
  };
  const EntitlementModel = {
    findOne: () => query(entitlement),
    async findOneAndUpdate() { entitlement.physicalPrizeRequestId = 'request-object-id'; return entitlement; },
  };
  const RequestModel = {
    collection: {
      find() { return { async toArray() { return structuredClone(requests); } }; },
    },
    async create(documents) { requests.push(structuredClone(documents[0])); return [requests[0]]; },
  };
  const result = await performWeeklyIphoneColorSelection({
    telegramId: '9001', color: 'gold', idempotencyKey: 'weekly:color:gold',
    config: enabledConfig(), session: {}, UserModel, ProgressModel, EntitlementModel, RequestModel,
  });
  assert.equal(result.status, 'success');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].fortuneWheelProgressId, 'old-week-progress');
  assert.equal(requests[0].color, 'gold');
});

test('a color progress conflict throws after entitlement mutation so the transaction rolls back', async () => {
  const user = { telegramId: '9001', isFrozen: false };
  const progress = { _id: 'old-week-progress', telegramId: '9001', physicalPrizeRequestId: null };
  const entitlement = {
    _id: 'entitlement-1', telegramId: '9001', campaignKey: WEEKLY_CAMPAIGN_KEY,
    prizeCode: 'iphone_duo', progressId: progress._id, physicalPrizeRequestId: null,
  };
  const RequestModel = {
    collection: { find: () => ({ toArray: async () => [] }) },
    async create() { throw new Error('request creation must not run'); },
  };
  await assert.rejects(
    performWeeklyIphoneColorSelection({
      telegramId: '9001', color: 'gold', idempotencyKey: 'weekly:color:conflict',
      config: enabledConfig(), session: {},
      UserModel: { findOne: () => query(user) },
      ProgressModel: {
        findOne: () => query(progress),
        async findOneAndUpdate() { return null; },
      },
      EntitlementModel: {
        findOne: () => query(entitlement),
        async findOneAndUpdate() { return entitlement; },
      },
      RequestModel,
    }),
    (error) => error?.code === 'CONCURRENT_PHYSICAL_PRIZE_CONFLICT'
  );
});

test('weekly spin route fails closed before mutation when migration readiness is absent', async () => {
  const route = router.stack.find((layer) => layer.route?.path === '/fortune-wheel/spin');
  const handler = route.route.stack.at(-1).handle;
  const previous = process.env.FORTUNE_WHEEL_MODE;
  process.env.FORTUNE_WHEEL_MODE = WEEKLY_MODE;
  const response = {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  try {
    await handler({
      telegramUserId: '9001',
      body: { expectedSpin: 1, idempotencyKey: 'weekly:route:spin' },
    }, response);
    assert.equal(response.statusCode, 503);
    assert.notEqual(response.body.code, 'WEEKLY_READY');
  } finally {
    if (previous === undefined) delete process.env.FORTUNE_WHEEL_MODE;
    else process.env.FORTUNE_WHEEL_MODE = previous;
  }
});

test('weekly status route returns weekly shape and keeps a legacy request visible', async () => {
  const route = router.stack.find((layer) => layer.route?.path === '/fortune-wheel/status');
  const handler = route.route.stack.at(-1).handle;
  const previousMode = process.env.FORTUNE_WHEEL_MODE;
  const originals = {
    userFindOne: User.findOne,
    progressFindOne: FortuneWheelProgress.findOne,
    inventoryFindOne: FortuneWheelPrizeInventory.findOne,
    entitlementFindOne: FortuneWheelPrizeEntitlement.findOne,
    requestFindOne: PhysicalPrizeRequest.findOne,
    collectionFind: PhysicalPrizeRequest.collection.find,
  };
  process.env.FORTUNE_WHEEL_MODE = WEEKLY_MODE;
  User.findOne = () => leanQuery({ telegramId: '9001', isFrozen: false });
  FortuneWheelProgress.findOne = (filter) => leanQuery(filter.weekKey ? {
    telegramId: '9001', weekKey: filter.weekKey, spinsUsed: 1, claims: [],
  } : null);
  FortuneWheelPrizeInventory.findOne = () => leanQuery({ capacity: 100, reserved: 0, fulfilled: 0 });
  FortuneWheelPrizeEntitlement.findOne = () => query(null);
  PhysicalPrizeRequest.findOne = () => query(null);
  PhysicalPrizeRequest.collection.find = () => ({
    async toArray() {
      return [{
        requestId: 'legacy-request', campaignKey: 'fortune-wheel-v1',
        telegramId: '9001', prizeCode: 'iphone_duo', color: 'gold', status: 'pending',
      }];
    },
  });
  const response = {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  try {
    await handler({ telegramUserId: '9001' }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.mode, WEEKLY_MODE);
    assert.equal(response.body.spins.used, 1);
    assert.equal(response.body.physicalPrize.requests[0].campaignKey, 'fortune-wheel-v1');
    assert.equal(response.body.physicalPrize.requests[0].color, 'gold');
  } finally {
    User.findOne = originals.userFindOne;
    FortuneWheelProgress.findOne = originals.progressFindOne;
    FortuneWheelPrizeInventory.findOne = originals.inventoryFindOne;
    FortuneWheelPrizeEntitlement.findOne = originals.entitlementFindOne;
    PhysicalPrizeRequest.findOne = originals.requestFindOne;
    PhysicalPrizeRequest.collection.find = originals.collectionFind;
    if (previousMode === undefined) delete process.env.FORTUNE_WHEEL_MODE;
    else process.env.FORTUNE_WHEEL_MODE = previousMode;
  }
});
