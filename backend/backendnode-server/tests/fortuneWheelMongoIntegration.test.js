const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

process.env.NODE_ENV = 'test';
process.env.BOT_TOKEN = process.env.BOT_TOKEN || 'fortune-wheel-mongo-integration-token';

const User = require('../models/User');
const AccountRecovery = require('../models/AccountRecovery');
const FortuneWheelProgress = require('../models/FortuneWheelProgress');
const PhysicalPrizeRequest = require('../models/PhysicalPrizeRequest');
const { executeRecovery, versionDescriptor } = require('../accountRecovery');
const { getFortuneWheelCampaignConfig } = require('../fortuneWheel');
const router = require('../routes/coinRoutes');

const { performFortuneWheelSpin, performIphoneColorSelection } = router.__fortuneWheelTestUtils;
const { performAdminPhysicalPrizeStatusUpdate } = router.__physicalPrizeAdminTestUtils;

const CAMPAIGN_KEY = 'fw-integration';
const BASE_NOW = new Date('2026-10-24T10:00:00.000Z');

let replSet;

function campaignFor(telegramIds, capacity = telegramIds.length) {
  return getFortuneWheelCampaignConfig({
    FORTUNE_WHEEL_ENABLED: 'true',
    FORTUNE_WHEEL_CAMPAIGN_APPROVED: 'true',
    FORTUNE_WHEEL_CAMPAIGN_KEY: CAMPAIGN_KEY,
    FORTUNE_WHEEL_PHYSICAL_PRIZE_CAPACITY: String(capacity),
    FORTUNE_WHEEL_ELIGIBLE_TELEGRAM_IDS: telegramIds.join(','),
    FORTUNE_WHEEL_IPHONE_COLORS: 'midnight,gold',
  });
}

async function inTransaction(work) {
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

async function attemptTransaction(work) {
  try {
    return { ok: true, result: await inTransaction(work) };
  } catch (error) {
    return { ok: false, error };
  }
}

async function createUser(telegramId, overrides = {}) {
  return User.create({
    telegramId,
    username: `integration-${telegramId}`,
    telegramUsername: `integration_${telegramId}`,
    firstName: 'Integration',
    lastName: 'Player',
    balance: 0,
    totalEarned: 0,
    ...overrides,
  });
}

function claimsForUnlockedIphone() {
  return [
    { spin: 1, rewardType: 'onix', amount: 50000, prizeCode: '', idempotencyKey: 'integration:spin:1', claimedAt: BASE_NOW },
    { spin: 2, rewardType: 'onix', amount: 250000, prizeCode: '', idempotencyKey: 'integration:spin:2', claimedAt: BASE_NOW },
    { spin: 3, rewardType: 'physical_prize', amount: 0, prizeCode: 'iphone_duo', idempotencyKey: 'integration:spin:3', claimedAt: BASE_NOW },
  ];
}

async function createUnlockedProgress(telegramId, slot = 1, campaignKey = CAMPAIGN_KEY) {
  return FortuneWheelProgress.create({
    campaignKey,
    telegramId,
    completedSpins: 3,
    claims: claimsForUnlockedIphone(),
    physicalPrizeReservation: { slot, reservedAt: BASE_NOW, status: 'reserved' },
    iphoneUnlockedAt: BASE_NOW,
  });
}

async function createPrizeRequest(progress, telegramId, overrides = {}) {
  const request = await PhysicalPrizeRequest.create({
    requestId: crypto.randomUUID(),
    idempotencyKey: `integration:color:${telegramId}`,
    fortuneWheelProgressId: progress._id,
    campaignKey: progress.campaignKey,
    telegramId,
    prizeCode: 'iphone_duo',
    color: 'gold',
    status: 'pending',
    statusHistory: [{
      action: 'created',
      status: 'pending',
      color: 'gold',
      changedAt: BASE_NOW,
      changedBy: 'player',
    }],
    ...overrides,
  });
  await FortuneWheelProgress.updateOne(
    { _id: progress._id },
    { $set: { physicalPrizeRequestId: request._id } }
  );
  return request;
}

async function clearDatabase() {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
}

test.before(async () => {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  const databaseName = `fw_integration_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  await mongoose.connect(replSet.getUri(), { dbName: databaseName });
  await Promise.all([
    User.syncIndexes(),
    AccountRecovery.syncIndexes(),
    FortuneWheelProgress.syncIndexes(),
    PhysicalPrizeRequest.syncIndexes(),
  ]);
});

test.afterEach(clearDatabase);

test.after(async () => {
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
});

test('real replica set creates the required unique indexes', async () => {
  const progressIndexes = await FortuneWheelProgress.collection.getIndexes({ full: true });
  const requestIndexes = await PhysicalPrizeRequest.collection.getIndexes({ full: true });
  const recoveryIndexes = await AccountRecovery.collection.getIndexes({ full: true });

  assert.ok(progressIndexes.some((index) => index.unique && index.key.campaignKey === 1 && index.key.telegramId === 1));
  assert.ok(progressIndexes.some((index) => index.unique && index.key.campaignKey === 1 && index.key['physicalPrizeReservation.slot'] === 1));
  assert.ok(requestIndexes.some((index) => index.unique && index.key.requestId === 1));
  assert.ok(requestIndexes.some((index) => index.unique && index.key.fortuneWheelProgressId === 1));
  assert.ok(requestIndexes.some((index) => index.unique && index.key.campaignKey === 1 && index.key.telegramId === 1 && index.key.prizeCode === 1));
  assert.ok(recoveryIndexes.some((index) => index.unique && index.key.recoveryId === 1));

  console.log('FW integration indexes:', JSON.stringify({
    fortuneWheelProgress: progressIndexes.map(({ name, key, unique = false }) => ({ name, key, unique })),
    physicalPrizeRequest: requestIndexes.map(({ name, key, unique = false }) => ({ name, key, unique })),
    accountRecovery: recoveryIndexes.map(({ name, key, unique = false }) => ({ name, key, unique })),
  }));
});

test('two concurrent first spins persist one claim and one ONIX payout', async () => {
  const telegramId = '9100000001';
  await createUser(telegramId);
  const config = campaignFor([telegramId]);
  const calls = [1, 2].map(() => attemptTransaction((session) => performFortuneWheelSpin({
    telegramId,
    expectedSpin: 1,
    idempotencyKey: 'integration:first-spin:same-key',
    config,
    session,
    now: BASE_NOW,
  })));
  const results = await Promise.all(calls);
  assert.ok(results.some((entry) => entry.ok && entry.result.status === 'success'));
  const user = await User.findOne({ telegramId }).lean();
  const progress = await FortuneWheelProgress.findOne({ campaignKey: CAMPAIGN_KEY, telegramId }).lean();
  const wheelTransactions = user.transactions.filter((entry) => entry.type === 'income_fortune_wheel');
  assert.equal(wheelTransactions.length, 1);
  assert.equal(wheelTransactions[0].amount, 50000);
  assert.ok(user.balance >= 50000, 'existing achievement/rank bonuses may increase the final balance');
  assert.equal(progress.completedSpins, 1);
  assert.equal(progress.claims.length, 1);
});

test('same idempotency key replays without another payout', async () => {
  const telegramId = '9100000002';
  await createUser(telegramId);
  const config = campaignFor([telegramId]);
  const payload = {
    telegramId,
    expectedSpin: 1,
    idempotencyKey: 'integration:first-spin:replay',
    config,
    now: BASE_NOW,
  };
  const first = await inTransaction((session) => performFortuneWheelSpin({ ...payload, session }));
  const balanceAfterFirst = (await User.findOne({ telegramId }).lean()).balance;
  const replay = await inTransaction((session) => performFortuneWheelSpin({ ...payload, session }));
  assert.equal(first.status, 'success');
  assert.equal(first.idempotent, false);
  assert.equal(replay.status, 'success');
  assert.equal(replay.idempotent, true);
  const storedUser = await User.findOne({ telegramId }).lean();
  assert.equal(storedUser.balance, balanceAfterFirst);
  assert.equal(storedUser.transactions.filter((entry) => entry.type === 'income_fortune_wheel').length, 1);
  assert.equal((await FortuneWheelProgress.findOne({ telegramId }).lean()).claims.length, 1);
});

test('different idempotency key cannot claim an already completed spin', async () => {
  const telegramId = '9100000003';
  await createUser(telegramId);
  const config = campaignFor([telegramId]);
  await inTransaction((session) => performFortuneWheelSpin({
    telegramId, expectedSpin: 1, idempotencyKey: 'integration:first-spin:key-a', config, session, now: BASE_NOW,
  }));
  const balanceAfterFirst = (await User.findOne({ telegramId }).lean()).balance;
  const replay = await inTransaction((session) => performFortuneWheelSpin({
    telegramId, expectedSpin: 1, idempotencyKey: 'integration:first-spin:key-b', config, session, now: BASE_NOW,
  }));
  assert.equal(replay.status, 'already_claimed');
  const storedUser = await User.findOne({ telegramId }).lean();
  assert.equal(storedUser.balance, balanceAfterFirst);
  assert.equal(storedUser.transactions.filter((entry) => entry.type === 'income_fortune_wheel').length, 1);
  assert.equal((await FortuneWheelProgress.findOne({ telegramId }).lean()).claims.length, 1);
});

test('concurrent reservation of one physical slot commits only one participant', async () => {
  const firstId = '9100000011';
  const secondId = '9100000012';
  await Promise.all([createUser(firstId), createUser(secondId)]);
  const attempts = await Promise.all([
    attemptTransaction((session) => performFortuneWheelSpin({
      telegramId: firstId,
      expectedSpin: 1,
      idempotencyKey: 'integration:slot:first',
      config: campaignFor([firstId], 1),
      session,
      now: BASE_NOW,
    })),
    attemptTransaction((session) => performFortuneWheelSpin({
      telegramId: secondId,
      expectedSpin: 1,
      idempotencyKey: 'integration:slot:second',
      config: campaignFor([secondId], 1),
      session,
      now: BASE_NOW,
    })),
  ]);
  assert.equal(attempts.filter((entry) => entry.ok && entry.result.status === 'success').length, 1);
  assert.equal(await FortuneWheelProgress.countDocuments({ campaignKey: CAMPAIGN_KEY }), 1);
  const users = await User.find({ telegramId: { $in: [firstId, secondId] } }).lean();
  const wheelTransactions = users.flatMap((user) =>
    user.transactions.filter((entry) => entry.type === 'income_fortune_wheel')
  );
  assert.equal(wheelTransactions.length, 1);
  assert.equal(wheelTransactions[0].amount, 50000);
});

test('forced transaction failure rolls back both ONIX and progress', async () => {
  const telegramId = '9100000021';
  await createUser(telegramId);
  const config = campaignFor([telegramId]);
  await assert.rejects(
    inTransaction(async (session) => {
      const result = await performFortuneWheelSpin({
        telegramId,
        expectedSpin: 1,
        idempotencyKey: 'integration:rollback:onix',
        config,
        session,
        now: BASE_NOW,
      });
      assert.equal(result.status, 'success');
      throw new Error('forced transaction rollback after payout');
    }),
    /forced transaction rollback/
  );
  const user = await User.findOne({ telegramId }).lean();
  assert.equal(user.balance, 0);
  assert.equal(user.totalEarned, 0);
  assert.equal(user.transactions.filter((entry) => entry.type === 'income_fortune_wheel').length, 0);
  assert.equal(await FortuneWheelProgress.countDocuments({ telegramId }), 0);
});

test('User save failure rolls back the earlier progress mutation', async () => {
  const telegramId = '9100000022';
  await createUser(telegramId);
  const config = campaignFor([telegramId]);
  const originalSave = User.prototype.save;
  User.prototype.save = async function injectedSaveFailure(options) {
    if (String(this.telegramId) === telegramId && options?.session) {
      throw new Error('injected User save failure');
    }
    return originalSave.call(this, options);
  };
  try {
    await assert.rejects(
      inTransaction((session) => performFortuneWheelSpin({
        telegramId,
        expectedSpin: 1,
        idempotencyKey: 'integration:rollback:user-save',
        config,
        session,
        now: BASE_NOW,
      })),
      /injected User save failure/
    );
  } finally {
    User.prototype.save = originalSave;
  }
  assert.equal((await User.findOne({ telegramId }).lean()).balance, 0);
  assert.equal(await FortuneWheelProgress.countDocuments({ telegramId }), 0);
});

test('concurrent different colors create one immutable physical prize request', async () => {
  const telegramId = '9100000031';
  await createUser(telegramId);
  await createUnlockedProgress(telegramId);
  const config = campaignFor([telegramId]);
  const attempts = await Promise.all(['gold', 'midnight'].map((color) =>
    attemptTransaction((session) => performIphoneColorSelection({
      telegramId,
      color,
      idempotencyKey: `integration:color:${color}`,
      config,
      session,
      now: BASE_NOW,
    }))
  ));
  assert.equal(attempts.filter((entry) => entry.ok && entry.result.status === 'success' && !entry.result.idempotent).length, 1);
  assert.equal(await PhysicalPrizeRequest.countDocuments({ telegramId }), 1);
  const progress = await FortuneWheelProgress.findOne({ telegramId }).lean();
  const request = await PhysicalPrizeRequest.findOne({ telegramId }).lean();
  assert.equal(String(progress.physicalPrizeRequestId), String(request._id));
  assert.ok(['gold', 'midnight'].includes(request.color));
});

test('repeated physical prize submission returns the same request', async () => {
  const telegramId = '9100000032';
  await createUser(telegramId);
  await createUnlockedProgress(telegramId);
  const config = campaignFor([telegramId]);
  const payload = {
    telegramId,
    color: 'gold',
    idempotencyKey: 'integration:color:replay',
    config,
    now: BASE_NOW,
  };
  const first = await inTransaction((session) => performIphoneColorSelection({ ...payload, session }));
  const replay = await inTransaction((session) => performIphoneColorSelection({ ...payload, session }));
  assert.equal(first.status, 'success');
  assert.equal(first.idempotent, false);
  assert.equal(replay.status, 'success');
  assert.equal(replay.idempotent, true);
  assert.equal(replay.request.requestId, first.request.requestId);
  assert.equal(await PhysicalPrizeRequest.countDocuments({ telegramId }), 1);
});

test('concurrent administrative status changes commit one version only', async () => {
  const telegramId = '9100000041';
  await createUser(telegramId);
  const progress = await createUnlockedProgress(telegramId);
  const request = await createPrizeRequest(progress, telegramId);
  const attempts = await Promise.all(['a', 'b'].map((suffix) =>
    attemptTransaction((session) => performAdminPhysicalPrizeStatusUpdate({
      requestId: request.requestId,
      payload: {
        nextStatus: 'approved',
        reason: 'Integration approval',
        expectedVersion: 0,
        idempotencyKey: `integration:admin:approve:${suffix}`,
      },
      actor: 'telegram:integration-admin',
      session,
      cancellationReasons: [],
      now: BASE_NOW,
    }))
  ));
  assert.equal(attempts.filter((entry) => entry.ok && entry.result.status === 'success').length, 1);
  const stored = await PhysicalPrizeRequest.findOne({ requestId: request.requestId }).lean();
  assert.equal(stored.status, 'approved');
  assert.equal(stored.__v, 1);
  assert.equal(stored.statusHistory.filter((entry) => entry.action === 'status_changed').length, 1);
});

test('delivered request and reservation fulfillment commit atomically', async () => {
  const telegramId = '9100000042';
  await createUser(telegramId);
  const progress = await createUnlockedProgress(telegramId);
  const request = await createPrizeRequest(progress, telegramId, {
    status: 'shipped',
    statusHistory: [{
      action: 'status_changed',
      status: 'shipped',
      previousStatus: 'preparing',
      color: 'gold',
      changedAt: BASE_NOW,
      changedBy: 'telegram:integration-admin',
      operationKey: 'integration:admin:shipped',
    }],
  });
  const result = await inTransaction((session) => performAdminPhysicalPrizeStatusUpdate({
    requestId: request.requestId,
    payload: {
      nextStatus: 'delivered',
      reason: 'Carrier confirmed delivery',
      expectedVersion: 0,
      idempotencyKey: 'integration:admin:delivered',
    },
    actor: 'telegram:integration-admin',
    session,
    cancellationReasons: [],
    now: BASE_NOW,
  }));
  assert.equal(result.status, 'success');
  assert.equal((await PhysicalPrizeRequest.findById(request._id).lean()).status, 'delivered');
  assert.equal((await FortuneWheelProgress.findById(progress._id).lean()).physicalPrizeReservation.status, 'fulfilled');
});

test('account recovery atomically rebinds existing progress and physical prize request', async () => {
  const oldTelegramId = '9100000051';
  const newTelegramId = '9100000052';
  const [oldUser, newUser] = await Promise.all([
    createUser(oldTelegramId, { balance: 100, totalEarned: 100 }),
    createUser(newTelegramId, { balance: 5, totalEarned: 5 }),
  ]);
  const progress = await createUnlockedProgress(oldTelegramId);
  const request = await createPrizeRequest(progress, oldTelegramId);
  const outcome = await executeRecovery({
    mongoose,
    recoveryId: crypto.randomUUID(),
    previewTokenHash: 'integration-preview-token-hash',
    tokenPayload: {
      oldTelegramId,
      newTelegramId,
      oldVersion: versionDescriptor(oldUser.toObject()),
      newVersion: versionDescriptor(newUser.toObject()),
    },
    initiatedBy: 'integration-admin',
    now: BASE_NOW.getTime(),
  });
  assert.equal(outcome.alreadyCompleted, false);
  assert.equal(await User.countDocuments({ telegramId: oldTelegramId }), 0);
  assert.equal(await User.countDocuments({ telegramId: newTelegramId }), 1);
  assert.equal((await FortuneWheelProgress.findById(progress._id).lean()).telegramId, newTelegramId);
  const reboundRequest = await PhysicalPrizeRequest.findById(request._id).lean();
  assert.equal(reboundRequest.telegramId, newTelegramId);
  assert.equal(reboundRequest.color, 'gold');
  assert.equal(await AccountRecovery.countDocuments({ status: 'completed' }), 1);
});

test('account recovery conflict leaves both identities and prize records unchanged', async () => {
  const oldTelegramId = '9100000061';
  const newTelegramId = '9100000062';
  const [oldUser, newUser] = await Promise.all([
    createUser(oldTelegramId, { balance: 100 }),
    createUser(newTelegramId, { balance: 5 }),
  ]);
  const oldProgress = await createUnlockedProgress(oldTelegramId, 1);
  const request = await createPrizeRequest(oldProgress, oldTelegramId);
  const newProgress = await createUnlockedProgress(newTelegramId, 2);
  await assert.rejects(
    executeRecovery({
      mongoose,
      recoveryId: crypto.randomUUID(),
      previewTokenHash: 'integration-preview-token-hash',
      tokenPayload: {
        oldTelegramId,
        newTelegramId,
        oldVersion: versionDescriptor(oldUser.toObject()),
        newVersion: versionDescriptor(newUser.toObject()),
      },
      initiatedBy: 'integration-admin',
      now: BASE_NOW.getTime(),
    }),
    (error) => error?.code === 'RECOVERY_BLOCKED'
  );
  assert.equal((await User.findOne({ telegramId: oldTelegramId }).lean()).balance, 100);
  assert.equal((await User.findOne({ telegramId: newTelegramId }).lean()).balance, 5);
  assert.equal((await FortuneWheelProgress.findById(oldProgress._id).lean()).telegramId, oldTelegramId);
  assert.equal((await FortuneWheelProgress.findById(newProgress._id).lean()).telegramId, newTelegramId);
  assert.equal((await PhysicalPrizeRequest.findById(request._id).lean()).telegramId, oldTelegramId);
  assert.equal(await AccountRecovery.countDocuments({}), 0);
});
