const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

process.env.NODE_ENV = 'test';
process.env.BOT_TOKEN = process.env.BOT_TOKEN || `123456789:${'x'.repeat(32)}`;

const User = require('../models/User');
const AccountRecovery = require('../models/AccountRecovery');
const FortuneWheelProgress = require('../models/FortuneWheelProgress');
const FortuneWheelPrizeInventory = require('../models/FortuneWheelPrizeInventory');
const FortuneWheelPrizeEntitlement = require('../models/FortuneWheelPrizeEntitlement');
const PhysicalPrizeRequest = require('../models/PhysicalPrizeRequest');
const {
  COLLECTIONS,
  LEGACY_CAMPAIGN_KEY,
  MIGRATION_CONFIRMATION,
  REQUIRED_ACCOUNT_RECOVERY_LEDGER_VERSION,
  REQUIRED_INDEXES,
  WEEKLY_CAMPAIGN_KEY,
  analyzeFortuneWheelMigration,
  applyFortuneWheelMigration,
  loadMigrationSnapshot,
} = require('../fortuneWheelMigration');
const {
  checkWeeklyFortuneWheelStorageReadiness,
  performWeeklyFortuneWheelSpin,
  performWeeklyIphoneColorSelection,
} = require('../fortuneWheelWeeklyApi');
const {
  FORTUNE_WHEEL_WEEKLY_CONFIG_VERSION,
  drawWeeklyPrize,
  getUtcWeekWindow,
} = require('../fortuneWheelWeekly');
const { getFortuneWheelCampaignConfig } = require('../fortuneWheel');
const { executeRecovery, versionDescriptor } = require('../accountRecovery');
const router = require('../routes/coinRoutes');

const { performAdminPhysicalPrizeStatusUpdate } = router.__physicalPrizeAdminTestUtils;
const {
  buildProgressStatsPipeline,
  normalizeAdminFortuneWheelQuery,
} = require('../fortuneWheelAdmin');
const {
  buildAdminPhysicalPrizeFilter,
  normalizeAdminPhysicalPrizeListQuery,
} = require('../physicalPrizeAdmin');

const SECRET = 'weekly-integration-secret-with-at-least-32-characters';
const FIRST_WEEK = new Date('2026-11-09T12:00:00.000Z');
const SECOND_WEEK = new Date('2026-11-16T12:00:00.000Z');
const LEGACY_PLAYER = '9300000001';
const STAGING_LEGACY_CAMPAIGN_KEY = 'fortune-wheel-staging-v1';

let replSet;
let databaseName;
let migrationEnvironment;

function campaignFor(telegramIds) {
  return getFortuneWheelCampaignConfig({
    FORTUNE_WHEEL_ENABLED: 'true',
    FORTUNE_WHEEL_CAMPAIGN_APPROVED: 'true',
    FORTUNE_WHEEL_CAMPAIGN_KEY: WEEKLY_CAMPAIGN_KEY,
    FORTUNE_WHEEL_PHYSICAL_PRIZE_CAPACITY: '100',
    FORTUNE_WHEEL_ELIGIBLE_TELEGRAM_IDS: telegramIds.join(','),
    FORTUNE_WHEEL_IPHONE_COLORS: 'midnight,gold',
  });
}

async function transaction(work) {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      result = await work(session);
    }, {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      readPreference: 'primary',
    });
    return result;
  } finally {
    await session.endSession();
  }
}

async function attempt(work) {
  try {
    return { ok: true, result: await transaction(work) };
  } catch (error) {
    return { ok: false, error };
  }
}

async function createUser(telegramId) {
  return User.create({
    telegramId,
    username: `weekly-${telegramId}`,
    telegramUsername: `weekly_${telegramId}`,
    firstName: 'Weekly',
    lastName: 'Tester',
    balance: 0,
    totalEarned: 0,
  });
}

async function creditOnix({ user, amount, session, now }) {
  user.balance = Number(user.balance || 0) + amount;
  user.totalEarned = Number(user.totalEarned || 0) + amount;
  user.transactions.push({
    type: 'fortune_wheel',
    amount,
    description: 'Weekly Fortune Wheel integration reward',
    createdAt: now,
  });
  await user.save({ session });
  return { achievementBonuses: [], rankBonuses: [] };
}

function rewardFor({ telegramId, spin, idempotencyKey, now, physicalPrizeAvailable = true }) {
  return drawWeeklyPrize({
    secret: SECRET,
    campaignKey: WEEKLY_CAMPAIGN_KEY,
    weekKey: getUtcWeekWindow(now).weekKey,
    telegramId,
    spin,
    idempotencyKey,
    physicalPrizeAvailable,
    playerHasPhysicalPrize: !physicalPrizeAvailable,
  }).reward.code;
}

function findKeyForReward({ telegramId, spin, now, rewardCode, prefix }) {
  for (let index = 0; index < 200000; index += 1) {
    const idempotencyKey = `${prefix}:${index}`;
    if (rewardFor({ telegramId, spin, idempotencyKey, now }) === rewardCode) return idempotencyKey;
  }
  throw new Error(`Unable to find deterministic draw for ${rewardCode}`);
}

function findOnixKey({ telegramId, spin, now, prefix }) {
  for (let index = 0; index < 100; index += 1) {
    const key = `${prefix}:${index}`;
    if (rewardFor({ telegramId, spin, idempotencyKey: key, now }) !== 'iphone_duo') return key;
  }
  throw new Error('Unable to find deterministic ONIX draw');
}

function spin({ telegramId, expectedSpin, idempotencyKey, now, session }) {
  return performWeeklyFortuneWheelSpin({
    telegramId,
    expectedSpin,
    idempotencyKey,
    config: campaignFor([telegramId]),
    readiness: { ready: true },
    session,
    secret: SECRET,
    now,
    UserModel: User,
    creditOnix,
  });
}

async function resetWeeklyData() {
  await Promise.all([
    User.deleteMany({}),
    FortuneWheelProgress.deleteMany({ campaignKey: WEEKLY_CAMPAIGN_KEY }),
    FortuneWheelPrizeEntitlement.deleteMany({ campaignKey: WEEKLY_CAMPAIGN_KEY }),
    PhysicalPrizeRequest.deleteMany({ campaignKey: WEEKLY_CAMPAIGN_KEY }),
  ]);
  await FortuneWheelPrizeInventory.updateOne(
    { campaignKey: WEEKLY_CAMPAIGN_KEY, prizeCode: 'iphone_duo' },
    { $set: { reserved: 0, fulfilled: 0 } }
  );
}

test.before(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  databaseName = `onix_staging_fw_weekly_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const uri = replSet.getUri(databaseName);
  await mongoose.connect(uri);
  migrationEnvironment = {
    NODE_ENV: 'production',
    ONIX_DEPLOY_ENV: 'staging',
    STAGING_DEPLOYMENT_CONFIRMATION: 'ONIX_STAGING_ONLY',
    TELEGRAM_WEBHOOK_SECRET: 'a'.repeat(32),
    ADMIN_SECRET: 'b'.repeat(32),
    ACCOUNT_RECOVERY_SECRET: 'c'.repeat(32),
    CRON_SECRET: 'd'.repeat(32),
    STAGING_TELEGRAM_BOT_ID: '123456789',
    BOT_TOKEN: `123456789:${'x'.repeat(32)}`,
    WEB_APP_URL: 'https://onix-staging.example.test',
    STAGING_FRONTEND_ALLOWED_HOSTS: 'onix-staging.example.test',
    MONGO_URI: uri,
    STAGING_MONGODB_DATABASE: databaseName,
    STAGING_MONGODB_ALLOWED_DATABASES: databaseName,
    STAGING_MONGODB_ALLOWED_HOSTS: '127.0.0.1,localhost',
    FORTUNE_WHEEL_MIGRATION_WRITE_ENABLED: 'true',
    FORTUNE_WHEEL_MIGRATION_TARGET: WEEKLY_CAMPAIGN_KEY,
  };

  const db = mongoose.connection.db;
  await db.createCollection(COLLECTIONS.progress);
  await db.collection(COLLECTIONS.progress).createIndex(
    REQUIRED_INDEXES.progressLegacy.key,
    { unique: true, name: REQUIRED_INDEXES.progressLegacy.name }
  );
  const legacyProgressId = new mongoose.Types.ObjectId();
  const legacyRequestId = new mongoose.Types.ObjectId();
  await db.collection(COLLECTIONS.progress).insertOne({
    _id: legacyProgressId,
    campaignKey: STAGING_LEGACY_CAMPAIGN_KEY,
    telegramId: LEGACY_PLAYER,
    mode: 'legacy_fixed_v1',
    completedSpins: 3,
    claims: [
      { spin: 1, rewardType: 'onix', amount: 50000, idempotencyKey: 'legacy-spin-1', claimedAt: FIRST_WEEK },
      { spin: 2, rewardType: 'onix', amount: 250000, idempotencyKey: 'legacy-spin-2', claimedAt: FIRST_WEEK },
      { spin: 3, rewardType: 'physical_prize', amount: 0, prizeCode: 'iphone_duo', idempotencyKey: 'legacy-spin-3', claimedAt: FIRST_WEEK },
    ],
    iphoneUnlockedAt: FIRST_WEEK,
    physicalPrizeRequestId: legacyRequestId,
    physicalPrizeReservation: { slot: 1, reservedAt: FIRST_WEEK, status: 'reserved' },
    createdAt: FIRST_WEEK,
    updatedAt: FIRST_WEEK,
  });
  await db.collection(COLLECTIONS.requests).insertOne({
    _id: legacyRequestId,
    requestId: 'legacy-integration-request',
    idempotencyKey: 'legacy-integration-color',
    fortuneWheelProgressId: legacyProgressId,
    campaignKey: STAGING_LEGACY_CAMPAIGN_KEY,
    telegramId: LEGACY_PLAYER,
    prizeCode: 'iphone_duo',
    color: 'gold',
    status: 'pending',
    statusHistory: [{
      action: 'created', status: 'pending', color: 'gold', changedAt: FIRST_WEEK,
      changedBy: 'player', comment: '',
    }],
    createdAt: FIRST_WEEK,
    updatedAt: FIRST_WEEK,
  });
  await Promise.all([
    User.create({
      telegramId: LEGACY_PLAYER,
      username: 'staging-legacy-player',
      telegramUsername: 'staging_legacy_player',
      balance: 300000,
      totalEarned: 300000,
      transactions: [
        { type: 'fortune_wheel', amount: 50000, description: 'Legacy first spin', createdAt: FIRST_WEEK },
        { type: 'fortune_wheel', amount: 250000, description: 'Legacy second spin', createdAt: FIRST_WEEK },
      ],
    }),
    User.createIndexes(),
    AccountRecovery.createIndexes(),
    PhysicalPrizeRequest.createIndexes(),
  ]);
});

test.after(async () => {
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
});

test('real migration preflight, apply, indexes, backfill, inventory, and idempotent reapply', async () => {
  const dryRun = analyzeFortuneWheelMigration(await loadMigrationSnapshot(mongoose.connection));
  assert.equal(dryRun.ok, true);
  assert.equal(dryRun.counts.entitlementsToBackfill, 1);
  assert.equal(dryRun.operations.createInventory, true);

  const options = {
    connection: mongoose.connection,
    environment: migrationEnvironment,
    confirmation: MIGRATION_CONFIRMATION,
    backupReference: 'weekly-integration-backup-001',
    accountRecoveryLedgerVersion: REQUIRED_ACCOUNT_RECOVERY_LEDGER_VERSION,
  };
  const first = await applyFortuneWheelMigration(options);
  assert.equal(first.after.ok, true);
  assert.equal(first.after.counts.entitlementsAlreadyBackfilled, 1);
  const second = await applyFortuneWheelMigration(options);
  assert.equal(second.after.counts.entitlementsToBackfill, 0);

  const [progressIndexes, entitlementIndexes, inventoryIndexes] = await Promise.all([
    FortuneWheelProgress.collection.getIndexes({ full: true }),
    FortuneWheelPrizeEntitlement.collection.getIndexes({ full: true }),
    FortuneWheelPrizeInventory.collection.getIndexes({ full: true }),
  ]);
  for (const required of Object.values(REQUIRED_INDEXES)) {
    const indexes = required.collection === COLLECTIONS.progress
      ? progressIndexes
      : required.collection === COLLECTIONS.entitlements
        ? entitlementIndexes
        : inventoryIndexes;
    assert.ok(indexes.some((index) => index.name === required.name && index.unique === true));
  }
  assert.equal(await mongoose.connection.db.collection(COLLECTIONS.entitlements).countDocuments({
    campaignKey: STAGING_LEGACY_CAMPAIGN_KEY,
    telegramId: LEGACY_PLAYER,
  }), 1);
  assert.equal(await mongoose.connection.db.collection(COLLECTIONS.inventory).countDocuments({
    campaignKey: WEEKLY_CAMPAIGN_KEY,
    capacity: 100,
  }), 1);

  const concurrent = await Promise.all([applyFortuneWheelMigration(options), applyFortuneWheelMigration(options)]);
  assert.equal(concurrent.every((result) => result.after.ok), true);
  assert.equal(await mongoose.connection.db.collection(COLLECTIONS.entitlements).countDocuments({
    campaignKey: STAGING_LEGACY_CAMPAIGN_KEY,
  }), 1);
});

test('staging legacy history remains visible to Admin after entitlement backfill', async () => {
  const normalizedDashboard = normalizeAdminFortuneWheelQuery({
    campaignKey: STAGING_LEGACY_CAMPAIGN_KEY,
  }, FIRST_WEEK);
  assert.equal(normalizedDashboard.ok, true);
  const [aggregation] = await FortuneWheelProgress.aggregate(buildProgressStatsPipeline({
    campaignKey: STAGING_LEGACY_CAMPAIGN_KEY,
    weekKey: '',
  }));
  assert.equal(aggregation.summary[0].uniquePlayers, 1);
  assert.equal(aggregation.summary[0].spinsUsed, 3);
  assert.equal(aggregation.rewards.reduce((sum, reward) => sum + Number(reward.totalOnix || 0), 0), 300000);

  const normalizedRequests = normalizeAdminPhysicalPrizeListQuery({
    campaignKey: STAGING_LEGACY_CAMPAIGN_KEY,
  });
  assert.equal(normalizedRequests.ok, true);
  const visibleRequests = await PhysicalPrizeRequest.find(
    buildAdminPhysicalPrizeFilter(normalizedRequests)
  ).lean();
  assert.equal(visibleRequests.length, 1);
  assert.equal(visibleRequests[0].color, 'gold');
  assert.equal(visibleRequests[0].statusHistory[0].status, 'pending');
});

test('migration writes roll back atomically when an operation fails', async () => {
  const session = await mongoose.startSession();
  const before = await FortuneWheelPrizeInventory.findOne({ campaignKey: WEEKLY_CAMPAIGN_KEY }).lean();
  await assert.rejects(session.withTransaction(async () => {
    await FortuneWheelPrizeInventory.updateOne(
      { campaignKey: WEEKLY_CAMPAIGN_KEY },
      { $set: { reserved: 1 } },
      { session }
    );
    await FortuneWheelPrizeEntitlement.create([{
      campaignKey: WEEKLY_CAMPAIGN_KEY,
      telegramId: '9300000099',
      prizeCode: 'iphone_duo',
      slot: 1,
      progressId: new mongoose.Types.ObjectId(),
      sourceMode: 'weekly_random_v1',
      weekKey: '2026-11-09',
      configVersion: FORTUNE_WHEEL_WEEKLY_CONFIG_VERSION,
      status: 'reserved',
      reservedAt: FIRST_WEEK,
    }], { session });
    throw new Error('forced-migration-rollback');
  }));
  await session.endSession();
  const after = await FortuneWheelPrizeInventory.findOne({ campaignKey: WEEKLY_CAMPAIGN_KEY }).lean();
  assert.equal(after.reserved, before.reserved);
  assert.equal(await FortuneWheelPrizeEntitlement.countDocuments({ telegramId: '9300000099' }), 0);
});

test('manual legacy index switch enables weekly storage while legacy documents remain readable', async () => {
  const before = await checkWeeklyFortuneWheelStorageReadiness({ connection: mongoose.connection });
  assert.equal(before.ready, false);
  assert.equal(before.code, 'WEEKLY_LEGACY_PROGRESS_INDEX_ACTIVE');
  await mongoose.connection.db.collection(COLLECTIONS.progress).dropIndex(REQUIRED_INDEXES.progressLegacy.name);
  const after = await checkWeeklyFortuneWheelStorageReadiness({ connection: mongoose.connection });
  assert.equal(after.ready, true);
  assert.ok(await FortuneWheelProgress.findOne({ campaignKey: STAGING_LEGACY_CAMPAIGN_KEY, telegramId: LEGACY_PLAYER }));
  assert.ok(await PhysicalPrizeRequest.findOne({ campaignKey: STAGING_LEGACY_CAMPAIGN_KEY, telegramId: LEGACY_PLAYER }));
});

test('concurrent first spin, idempotent retry, conflicting key, limit, and weekly reset are atomic', async () => {
  await resetWeeklyData();
  const telegramId = '9300000101';
  await createUser(telegramId);
  const firstKey = findOnixKey({ telegramId, spin: 1, now: FIRST_WEEK, prefix: 'weekly:first' });
  const concurrent = await Promise.all([
    attempt((session) => spin({ telegramId, expectedSpin: 1, idempotencyKey: firstKey, now: FIRST_WEEK, session })),
    attempt((session) => spin({ telegramId, expectedSpin: 1, idempotencyKey: firstKey, now: FIRST_WEEK, session })),
  ]);
  assert.equal(concurrent.filter((entry) => entry.ok && entry.result.status === 'success').length, 2);
  const progress = await FortuneWheelProgress.findOne({ campaignKey: WEEKLY_CAMPAIGN_KEY, telegramId }).lean();
  const user = await User.findOne({ telegramId }).lean();
  assert.equal(progress.spinsUsed, 1);
  assert.equal(progress.claims.length, 1);
  assert.equal(user.balance, progress.claims[0].amount);

  const replay = await transaction((session) => spin({
    telegramId, expectedSpin: 1, idempotencyKey: firstKey, now: FIRST_WEEK, session,
  }));
  assert.equal(replay.idempotent, true);
  assert.equal((await User.findOne({ telegramId }).lean()).balance, user.balance);
  const conflict = await transaction((session) => spin({
    telegramId, expectedSpin: 1, idempotencyKey: 'weekly:first:different-key', now: FIRST_WEEK, session,
  }));
  assert.equal(conflict.status, 'already_claimed');

  for (const expectedSpin of [2, 3]) {
    const key = findOnixKey({ telegramId, spin: expectedSpin, now: FIRST_WEEK, prefix: `weekly:${expectedSpin}` });
    const result = await transaction((session) => spin({ telegramId, expectedSpin, idempotencyKey: key, now: FIRST_WEEK, session }));
    assert.equal(result.status, 'success');
  }
  const fourth = await transaction((session) => spin({
    telegramId, expectedSpin: 4, idempotencyKey: 'weekly:fourth:attempt', now: FIRST_WEEK, session,
  }));
  assert.equal(fourth.status, 'weekly_limit_reached');
  assert.equal((await FortuneWheelProgress.findOne({ campaignKey: WEEKLY_CAMPAIGN_KEY, telegramId }).lean()).claims.length, 3);

  const nextWeekKey = findOnixKey({ telegramId, spin: 1, now: SECOND_WEEK, prefix: 'weekly:reset' });
  const reset = await transaction((session) => spin({
    telegramId, expectedSpin: 1, idempotencyKey: nextWeekKey, now: SECOND_WEEK, session,
  }));
  assert.equal(reset.status, 'success');
  assert.equal(await FortuneWheelProgress.countDocuments({ campaignKey: WEEKLY_CAMPAIGN_KEY, telegramId }), 2);
});

test('last iPhone slot is reserved once and the 101st result falls back to ONIX', async () => {
  await resetWeeklyData();
  await FortuneWheelPrizeInventory.updateOne(
    { campaignKey: WEEKLY_CAMPAIGN_KEY, prizeCode: 'iphone_duo' },
    { $set: { reserved: 99, fulfilled: 0 } }
  );
  const players = ['9300000201', '9300000202'];
  await Promise.all(players.map(createUser));
  const keys = players.map((telegramId, index) => findKeyForReward({
    telegramId,
    spin: 1,
    now: FIRST_WEEK,
    rewardCode: 'iphone_duo',
    prefix: `weekly:last-slot:${index}`,
  }));
  const results = await Promise.all(players.map((telegramId, index) => attempt((session) => spin({
    telegramId,
    expectedSpin: 1,
    idempotencyKey: keys[index],
    now: FIRST_WEEK,
    session,
  }))));
  assert.equal(results.filter((entry) => entry.ok).length, 2);
  const rewardCodes = results.map((entry) => entry.result.claim.rewardCode);
  assert.equal(rewardCodes.filter((code) => code === 'iphone_duo').length, 1);
  assert.equal(rewardCodes.filter((code) => code !== 'iphone_duo').length, 1);
  const inventory = await FortuneWheelPrizeInventory.findOne({ campaignKey: WEEKLY_CAMPAIGN_KEY }).lean();
  assert.equal(inventory.reserved, 100);
  assert.equal(await FortuneWheelPrizeEntitlement.countDocuments({ campaignKey: WEEKLY_CAMPAIGN_KEY }), 1);
});

test('weekly ONIX payout and progress both roll back when the economy adapter fails', async () => {
  await resetWeeklyData();
  const telegramId = '9300000251';
  await createUser(telegramId);
  const idempotencyKey = findOnixKey({
    telegramId, spin: 1, now: FIRST_WEEK, prefix: 'weekly:rollback:economy',
  });
  await assert.rejects(transaction((session) => performWeeklyFortuneWheelSpin({
    telegramId,
    expectedSpin: 1,
    idempotencyKey,
    config: campaignFor([telegramId]),
    readiness: { ready: true },
    session,
    secret: SECRET,
    now: FIRST_WEEK,
    UserModel: User,
    creditOnix: async ({ user, amount, session: payoutSession }) => {
      user.balance = Number(user.balance || 0) + amount;
      user.totalEarned = Number(user.totalEarned || 0) + amount;
      await user.save({ session: payoutSession });
      throw new Error('forced-weekly-economy-rollback');
    },
  })), /forced-weekly-economy-rollback/);
  const [user, progress] = await Promise.all([
    User.findOne({ telegramId }).lean(),
    FortuneWheelProgress.findOne({ campaignKey: WEEKLY_CAMPAIGN_KEY, telegramId }).lean(),
  ]);
  assert.equal(user.balance, 0);
  assert.equal(user.totalEarned, 0);
  assert.equal(progress, null);
});

test('one player cannot win a second iPhone in a later week', async () => {
  await resetWeeklyData();
  const telegramId = '9300000301';
  await createUser(telegramId);
  const firstKey = findKeyForReward({
    telegramId, spin: 1, now: FIRST_WEEK, rewardCode: 'iphone_duo', prefix: 'weekly:owned:first',
  });
  const first = await transaction((session) => spin({
    telegramId, expectedSpin: 1, idempotencyKey: firstKey, now: FIRST_WEEK, session,
  }));
  assert.equal(first.claim.rewardCode, 'iphone_duo');
  const secondKey = findKeyForReward({
    telegramId, spin: 1, now: SECOND_WEEK, rewardCode: 'iphone_duo', prefix: 'weekly:owned:second',
  });
  const second = await transaction((session) => spin({
    telegramId, expectedSpin: 1, idempotencyKey: secondKey, now: SECOND_WEEK, session,
  }));
  assert.notEqual(second.claim.rewardCode, 'iphone_duo');
  assert.equal(await FortuneWheelPrizeEntitlement.countDocuments({ campaignKey: WEEKLY_CAMPAIGN_KEY, telegramId }), 1);
});

test('100,000 deterministic HMAC draws stay within statistical tolerance of approved weights', () => {
  const counts = new Map();
  const weekKey = getUtcWeekWindow(FIRST_WEEK).weekKey;
  for (let index = 0; index < 100000; index += 1) {
    const reward = drawWeeklyPrize({
      secret: SECRET,
      campaignKey: WEEKLY_CAMPAIGN_KEY,
      weekKey,
      telegramId: String(9400000000 + index),
      spin: (index % 3) + 1,
      idempotencyKey: `weekly:distribution:${index}`,
      physicalPrizeAvailable: true,
      playerHasPhysicalPrize: false,
    }).reward.code;
    counts.set(reward, (counts.get(reward) || 0) + 1);
  }
  const expected = {
    onix_5000: 35000,
    onix_10000: 30000,
    onix_25000: 20000,
    onix_50000: 10000,
    onix_250000: 100,
    iphone_duo: 4900,
  };
  for (const [rewardCode, expectedCount] of Object.entries(expected)) {
    const tolerance = rewardCode === 'onix_250000' ? 50 : Math.max(250, expectedCount * 0.025);
    assert.ok(
      Math.abs((counts.get(rewardCode) || 0) - expectedCount) <= tolerance,
      `${rewardCode} observed ${counts.get(rewardCode) || 0}, expected ${expectedCount} ± ${tolerance}`
    );
  }
});

test('concurrent color choices create one request and preserve the entitlement across week reset', async () => {
  await resetWeeklyData();
  const telegramId = '9300000401';
  await createUser(telegramId);
  const key = findKeyForReward({
    telegramId, spin: 1, now: FIRST_WEEK, rewardCode: 'iphone_duo', prefix: 'weekly:color:win',
  });
  await transaction((session) => spin({ telegramId, expectedSpin: 1, idempotencyKey: key, now: FIRST_WEEK, session }));
  const selections = await Promise.all(['gold', 'midnight'].map((color) => attempt((session) => (
    performWeeklyIphoneColorSelection({
      telegramId,
      color,
      idempotencyKey: `weekly:color:${color}`,
      config: campaignFor([telegramId]),
      session,
      now: SECOND_WEEK,
      UserModel: User,
    })
  ))));
  assert.equal(selections.filter((entry) => entry.ok && entry.result.status === 'success').length >= 1, true);
  assert.equal(await PhysicalPrizeRequest.countDocuments({ campaignKey: WEEKLY_CAMPAIGN_KEY, telegramId }), 1);
  const request = await PhysicalPrizeRequest.findOne({ campaignKey: WEEKLY_CAMPAIGN_KEY, telegramId }).lean();
  const entitlement = await FortuneWheelPrizeEntitlement.findOne({ campaignKey: WEEKLY_CAMPAIGN_KEY, telegramId }).lean();
  assert.equal(String(request._id), String(entitlement.physicalPrizeRequestId));
  assert.ok(['gold', 'midnight'].includes(request.color));
});

test('weekly delivery fulfills entitlement and inventory exactly once under concurrent updates', async () => {
  const telegramId = '9300000401';
  let request = await PhysicalPrizeRequest.findOne({ campaignKey: WEEKLY_CAMPAIGN_KEY, telegramId });
  assert.ok(request);
  const transitions = ['approved', 'preparing', 'shipped'];
  for (const [index, nextStatus] of transitions.entries()) {
    const result = await transaction((session) => performAdminPhysicalPrizeStatusUpdate({
      requestId: request.requestId,
      payload: {
        nextStatus,
        reason: `Integration transition to ${nextStatus}`,
        expectedVersion: index,
        idempotencyKey: `weekly:admin:${nextStatus}`,
      },
      actor: 'telegram:integration-admin',
      session,
      cancellationReasons: [],
      now: new Date(FIRST_WEEK.getTime() + (index + 1) * 1000),
      connection: mongoose.connection,
    }));
    assert.equal(result.status, 'success');
    request = result.request;
  }

  const deliveryPayload = {
    nextStatus: 'delivered',
    reason: 'Integration carrier delivery confirmation',
    expectedVersion: 3,
    idempotencyKey: 'weekly:admin:delivered',
  };
  const concurrent = await Promise.all([
    attempt((session) => performAdminPhysicalPrizeStatusUpdate({
      requestId: request.requestId,
      payload: deliveryPayload,
      actor: 'telegram:integration-admin',
      session,
      cancellationReasons: [],
      now: SECOND_WEEK,
      connection: mongoose.connection,
    })),
    attempt((session) => performAdminPhysicalPrizeStatusUpdate({
      requestId: request.requestId,
      payload: deliveryPayload,
      actor: 'telegram:integration-admin',
      session,
      cancellationReasons: [],
      now: SECOND_WEEK,
      connection: mongoose.connection,
    })),
  ]);
  assert.equal(concurrent.filter((entry) => entry.ok && entry.result.status === 'success').length >= 1, true);

  const [storedRequest, entitlement, inventory] = await Promise.all([
    PhysicalPrizeRequest.findOne({ requestId: request.requestId }).lean(),
    FortuneWheelPrizeEntitlement.findOne({ campaignKey: WEEKLY_CAMPAIGN_KEY, telegramId }).lean(),
    FortuneWheelPrizeInventory.findOne({ campaignKey: WEEKLY_CAMPAIGN_KEY }).lean(),
  ]);
  assert.equal(storedRequest.status, 'delivered');
  assert.equal(entitlement.status, 'fulfilled');
  assert.equal(inventory.reserved, 1);
  assert.equal(inventory.fulfilled, 1);

  const replay = await transaction((session) => performAdminPhysicalPrizeStatusUpdate({
    requestId: request.requestId,
    payload: deliveryPayload,
    actor: 'telegram:integration-admin',
    session,
    cancellationReasons: [],
    now: SECOND_WEEK,
    connection: mongoose.connection,
  }));
  assert.equal(replay.status, 'success');
  assert.equal(replay.idempotent, true);
  const afterReplay = await FortuneWheelPrizeInventory.findOne({ campaignKey: WEEKLY_CAMPAIGN_KEY }).lean();
  assert.equal(afterReplay.reserved, 1);
  assert.equal(afterReplay.fulfilled, 1);
});

test('Account Recovery atomically transfers multiple weeks, entitlement, and request without another payout', async () => {
  await resetWeeklyData();
  await AccountRecovery.deleteMany({});
  const oldTelegramId = '9300000501';
  const newTelegramId = '9300000502';
  const [oldUser, newUser] = await Promise.all([createUser(oldTelegramId), createUser(newTelegramId)]);
  const iphoneKey = findKeyForReward({
    telegramId: oldTelegramId,
    spin: 1,
    now: FIRST_WEEK,
    rewardCode: 'iphone_duo',
    prefix: 'weekly:recovery:iphone',
  });
  await transaction((session) => spin({
    telegramId: oldTelegramId,
    expectedSpin: 1,
    idempotencyKey: iphoneKey,
    now: FIRST_WEEK,
    session,
  }));
  await transaction((session) => performWeeklyIphoneColorSelection({
    telegramId: oldTelegramId,
    color: 'gold',
    idempotencyKey: 'weekly:recovery:color',
    config: campaignFor([oldTelegramId]),
    session,
    now: FIRST_WEEK,
    UserModel: User,
  }));
  const nextWeekKey = findOnixKey({
    telegramId: oldTelegramId,
    spin: 1,
    now: SECOND_WEEK,
    prefix: 'weekly:recovery:next-week',
  });
  await transaction((session) => spin({
    telegramId: oldTelegramId,
    expectedSpin: 1,
    idempotencyKey: nextWeekKey,
    now: SECOND_WEEK,
    session,
  }));
  const balanceBefore = (await User.findOne({ telegramId: oldTelegramId }).lean()).balance;
  const recoveryId = crypto.randomUUID();
  const outcome = await executeRecovery({
    mongoose,
    recoveryId,
    previewTokenHash: 'weekly-integration-preview-token-hash',
    tokenPayload: {
      oldTelegramId,
      newTelegramId,
      oldVersion: versionDescriptor((await User.findOne({ telegramId: oldTelegramId })).toObject()),
      newVersion: versionDescriptor(newUser.toObject()),
    },
    initiatedBy: 'integration-admin',
    now: SECOND_WEEK.getTime(),
  });
  assert.equal(outcome.alreadyCompleted, false);
  assert.equal(await User.countDocuments({ telegramId: oldTelegramId }), 0);
  const recovered = await User.findOne({ telegramId: newTelegramId }).lean();
  assert.equal(recovered.balance, balanceBefore);
  assert.equal(await FortuneWheelProgress.countDocuments({ campaignKey: WEEKLY_CAMPAIGN_KEY, telegramId: newTelegramId }), 2);
  assert.equal(await FortuneWheelPrizeEntitlement.countDocuments({ campaignKey: WEEKLY_CAMPAIGN_KEY, telegramId: newTelegramId }), 1);
  assert.equal(await PhysicalPrizeRequest.countDocuments({ campaignKey: WEEKLY_CAMPAIGN_KEY, telegramId: newTelegramId, color: 'gold' }), 1);
  const replay = await executeRecovery({
    mongoose,
    recoveryId,
    previewTokenHash: 'weekly-integration-preview-token-hash',
    tokenPayload: {
      oldTelegramId,
      newTelegramId,
      oldVersion: versionDescriptor(oldUser.toObject()),
      newVersion: versionDescriptor(newUser.toObject()),
    },
    initiatedBy: 'integration-admin',
    now: SECOND_WEEK.getTime(),
  });
  assert.equal(replay.alreadyCompleted, true);
  assert.equal((await User.findOne({ telegramId: newTelegramId }).lean()).balance, balanceBefore);
});

test('Account Recovery weekly conflict fails closed and leaves both identities unchanged', async () => {
  await resetWeeklyData();
  await AccountRecovery.deleteMany({});
  const oldTelegramId = '9300000601';
  const newTelegramId = '9300000602';
  const [oldUser, newUser] = await Promise.all([createUser(oldTelegramId), createUser(newTelegramId)]);
  const week = getUtcWeekWindow(FIRST_WEEK);
  await FortuneWheelProgress.create([
    {
      campaignKey: WEEKLY_CAMPAIGN_KEY, telegramId: oldTelegramId, mode: 'weekly_random_v1', schemaVersion: 2,
      weekKey: week.weekKey, weekStartsAt: week.startsAt, weekEndsAt: week.resetsAt,
      completedSpins: 0, spinsUsed: 0, claims: [],
    },
    {
      campaignKey: WEEKLY_CAMPAIGN_KEY, telegramId: newTelegramId, mode: 'weekly_random_v1', schemaVersion: 2,
      weekKey: week.weekKey, weekStartsAt: week.startsAt, weekEndsAt: week.resetsAt,
      completedSpins: 0, spinsUsed: 0, claims: [],
    },
  ]);
  await assert.rejects(executeRecovery({
    mongoose,
    recoveryId: crypto.randomUUID(),
    previewTokenHash: 'weekly-integration-conflict-token-hash',
    tokenPayload: {
      oldTelegramId,
      newTelegramId,
      oldVersion: versionDescriptor(oldUser.toObject()),
      newVersion: versionDescriptor(newUser.toObject()),
    },
    initiatedBy: 'integration-admin',
    now: SECOND_WEEK.getTime(),
  }), (error) => (
    error?.code === 'RECOVERY_BLOCKED' &&
    Array.isArray(error.details) &&
    error.details.some((blocker) => blocker.code === 'FORTUNE_WHEEL_PROGRESS_CONFLICT')
  ));
  assert.equal(await User.countDocuments({ telegramId: { $in: [oldTelegramId, newTelegramId] } }), 2);
  assert.equal(await FortuneWheelProgress.countDocuments({ campaignKey: WEEKLY_CAMPAIGN_KEY }), 2);
  assert.equal(await AccountRecovery.countDocuments({ status: 'completed' }), 0);
});

test('Account Recovery preserves staging legacy claims, request, entitlement, and original campaign key', async () => {
  await AccountRecovery.deleteMany({});
  await User.deleteMany({ telegramId: { $in: [LEGACY_PLAYER, '9300000702'] } });
  const oldUser = await User.create({
    telegramId: LEGACY_PLAYER,
    username: 'staging-legacy-player',
    telegramUsername: 'staging_legacy_player',
    balance: 300000,
    totalEarned: 300000,
    transactions: [
      { type: 'fortune_wheel', amount: 50000, description: 'Legacy first spin', createdAt: FIRST_WEEK },
      { type: 'fortune_wheel', amount: 250000, description: 'Legacy second spin', createdAt: FIRST_WEEK },
    ],
  });
  const newUser = await createUser('9300000702');
  await executeRecovery({
    mongoose,
    recoveryId: crypto.randomUUID(),
    previewTokenHash: 'staging-legacy-recovery-token-hash',
    tokenPayload: {
      oldTelegramId: LEGACY_PLAYER,
      newTelegramId: newUser.telegramId,
      oldVersion: versionDescriptor(oldUser.toObject()),
      newVersion: versionDescriptor(newUser.toObject()),
    },
    initiatedBy: 'integration-admin',
    now: SECOND_WEEK.getTime(),
  });

  const [progress, request, entitlement, recovered] = await Promise.all([
    FortuneWheelProgress.findOne({
      campaignKey: STAGING_LEGACY_CAMPAIGN_KEY,
      telegramId: newUser.telegramId,
    }).lean(),
    PhysicalPrizeRequest.findOne({
      campaignKey: STAGING_LEGACY_CAMPAIGN_KEY,
      telegramId: newUser.telegramId,
    }).lean(),
    FortuneWheelPrizeEntitlement.findOne({
      campaignKey: STAGING_LEGACY_CAMPAIGN_KEY,
      telegramId: newUser.telegramId,
    }).lean(),
    User.findOne({ telegramId: newUser.telegramId }).lean(),
  ]);
  assert.deepEqual(progress.claims.map((claim) => claim.amount), [50000, 250000, 0]);
  assert.equal(progress.physicalPrizeReservation.slot, 1);
  assert.equal(request.requestId, 'legacy-integration-request');
  assert.equal(request.color, 'gold');
  assert.equal(request.status, 'pending');
  assert.equal(request.statusHistory[0].changedBy, 'player');
  assert.equal(entitlement.slot, 1);
  assert.equal(entitlement.campaignKey, STAGING_LEGACY_CAMPAIGN_KEY);
  assert.equal(recovered.balance, 300000);
  assert.equal(recovered.transactions.length, 2);
});

test('real collection invariants have no duplicate claims, slots, entitlements, or orphaned weekly requests', async () => {
  const db = mongoose.connection.db;
  const duplicateEntitlements = await db.collection(COLLECTIONS.entitlements).aggregate([
    { $group: { _id: { campaignKey: '$campaignKey', telegramId: '$telegramId', prizeCode: '$prizeCode' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]).toArray();
  const duplicateSlots = await db.collection(COLLECTIONS.entitlements).aggregate([
    { $group: { _id: { campaignKey: '$campaignKey', prizeCode: '$prizeCode', slot: '$slot' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]).toArray();
  const orphanedRequests = await db.collection(COLLECTIONS.requests).aggregate([
    { $match: { campaignKey: WEEKLY_CAMPAIGN_KEY } },
    { $lookup: { from: COLLECTIONS.entitlements, localField: '_id', foreignField: 'physicalPrizeRequestId', as: 'entitlement' } },
    { $match: { entitlement: { $size: 0 } } },
  ]).toArray();
  assert.deepEqual(duplicateEntitlements, []);
  assert.deepEqual(duplicateSlots, []);
  assert.deepEqual(orphanedRequests, []);

  const inventory = await FortuneWheelPrizeInventory.findOne({ campaignKey: WEEKLY_CAMPAIGN_KEY }).lean();
  const weeklyEntitlementCount = await FortuneWheelPrizeEntitlement.countDocuments({ campaignKey: WEEKLY_CAMPAIGN_KEY });
  assert.equal(inventory.reserved, weeklyEntitlementCount);
  assert.equal(inventory.fulfilled <= inventory.reserved, true);
});
