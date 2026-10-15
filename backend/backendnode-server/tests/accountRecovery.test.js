const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');

process.env.NODE_ENV = 'test';
process.env.ADMIN_SECRET = 'recovery-admin-secret';
process.env.ACCOUNT_RECOVERY_SECRET = 'recovery-preview-secret-with-sufficient-entropy';

const AccountRecovery = require('../models/AccountRecovery');
const {
  AccountRecoveryError,
  buildMergedUser,
  buildRecoveryPreview,
  confirmationPhrase,
  createPreviewToken,
  executeRecovery,
  performRecoveryTransaction,
  validateRecoverySafety,
  verifyPreviewToken,
  versionDescriptor,
} = require('../accountRecovery');
const router = require('../routes/coinRoutes');

const NOW = Date.parse('2026-10-15T12:00:00.000Z');

function transaction(id, createdAt, overrides = {}) {
  return {
    _id: id,
    type: 'income_offline',
    amount: 1,
    title: 'Offline-Mining',
    status: 'completed',
    createdAt,
    ...overrides,
  };
}

function nancyFixtures() {
  const oldTransactions = Array.from({ length: 50 }, (_, index) =>
    transaction(`old-${index}`, NOW - (index + 20) * 1000)
  );
  const newTransactions = Array.from({ length: 17 }, (_, index) =>
    transaction(`new-${index}`, NOW - index * 1000)
  );
  newTransactions.push(transaction('new-gg7000', NOW - 18000, {
    type: 'income_promo',
    amount: 7000,
    title: 'Promocode GG7000',
  }));
  return {
    oldUser: {
      _id: 'old-object-id',
      __v: 6802,
      telegramId: '7937090770',
      username: 'Nancy',
      balance: 2565631,
      totalEarned: 2865901,
      level: 287,
      totalTaps: 6542,
      totalBoostsUsed: 1,
      totalUpgradesBought: 29,
      offlineClaimsCount: 38,
      energy: 1750,
      tapLevel: 17,
      minerLevel: 5,
      energyLevel: 6,
      rechargeLevel: 5,
      weeklyEarned: 0,
      weeklyEarnedWeek: '2026-W40',
      completedTasks: ['channel'],
      completedAchievements: ['first_tap'],
      ownedPerks: [],
      claimedRankBonuses: ['bronze_2'],
      usedPromoCodes: ['GG5000', 'WW10000'],
      transactions: oldTransactions,
      withdrawalRequests: [],
      notifications: [],
      securityLogs: [],
      adminNotes: [],
      frontendErrorLogs: [],
      missionStats: { dailyKey: '2026-09-06', weeklyKey: '2026-W36' },
      claimedDailyMissions: [],
      claimedWeeklyMissions: [],
      tasks: {},
      teamName: '',
      referredBy: null,
      isFrozen: false,
      isSuspicious: false,
      onixDrop: {},
      createdAt: new Date('2026-06-30T19:57:07.991Z'),
      updatedAt: new Date('2026-09-29T12:47:09.909Z'),
    },
    newUser: {
      _id: 'new-object-id',
      __v: 624,
      telegramId: '8815934880',
      username: 'Nancy',
      telegramUsername: 'LinBadGirl',
      firstName: 'Nancy',
      appLanguage: 'de',
      balance: 43412,
      totalEarned: 43412,
      level: 5,
      totalTaps: 344,
      totalBoostsUsed: 0,
      totalUpgradesBought: 0,
      offlineClaimsCount: 10,
      energy: 354,
      tapLevel: 1,
      minerLevel: 1,
      energyLevel: 1,
      rechargeLevel: 1,
      weeklyEarned: 43412,
      weeklyEarnedWeek: '2026-W42',
      completedTasks: [],
      completedAchievements: ['first_tap'],
      ownedPerks: [],
      claimedRankBonuses: ['bronze_2'],
      usedPromoCodes: ['GG7000'],
      transactions: newTransactions,
      withdrawalRequests: [],
      notifications: [],
      securityLogs: [],
      adminNotes: [],
      frontendErrorLogs: [],
      missionStats: {
        dailyKey: '2026-10-15',
        weeklyKey: '2026-W42',
        dailyTaps: 344,
        weeklyTaps: 344,
      },
      claimedDailyMissions: ['daily_offline'],
      claimedWeeklyMissions: [],
      tasks: {},
      teamName: '',
      referredBy: null,
      isFrozen: false,
      isSuspicious: false,
      onixDrop: { dayKey: '2026-10-15', attemptsUsed: 0, dailyEarned: 0 },
      createdAt: new Date('2026-10-14T10:49:13.724Z'),
      updatedAt: new Date('2026-10-14T14:39:54.761Z'),
    },
  };
}

function deepClone(value) {
  return structuredClone(value);
}

function matches(document, filter) {
  return Object.entries(filter || {}).every(([key, expected]) => {
    const actual = key.split('.').reduce((value, part) => value?.[part], document);
    if (expected && typeof expected === 'object' && '$in' in expected) {
      if (Array.isArray(actual)) return actual.some((item) => expected.$in.includes(item));
      return expected.$in.includes(actual);
    }
    return String(actual ?? '') === String(expected ?? '');
  });
}

class FakeCollection {
  constructor(name, state, operations, failOperation) {
    this.name = name;
    this.state = state;
    this.operations = operations;
    this.failOperation = failOperation;
  }
  values() { return this.state[this.name] || (this.state[this.name] = []); }
  maybeFail(operation) {
    this.operations.push(`${this.name}.${operation}`);
    if (this.failOperation?.value === `${this.name}.${operation}`) throw new Error('simulated failure');
  }
  async findOne(filter) {
    this.maybeFail('findOne');
    return deepClone(this.values().find((document) => matches(document, filter)) || null);
  }
  find(filter) {
    this.operations.push(`${this.name}.find`);
    return { toArray: async () => deepClone(this.values().filter((document) => matches(document, filter))) };
  }
  async countDocuments(filter) {
    this.maybeFail('countDocuments');
    return this.values().filter((document) => matches(document, filter)).length;
  }
  async insertOne(document) {
    this.maybeFail('insertOne');
    if (this.values().some((item) => item.recoveryId === document.recoveryId)) {
      const error = new Error('duplicate'); error.code = 11000; throw error;
    }
    this.values().push(deepClone(document));
    return { acknowledged: true };
  }
  async updateMany(filter, update) {
    this.maybeFail('updateMany');
    let modifiedCount = 0;
    for (const document of this.values()) {
      if (!matches(document, filter)) continue;
      Object.assign(document, deepClone(update.$set || {}));
      modifiedCount += 1;
    }
    return { modifiedCount };
  }
  async replaceOne(filter, replacement) {
    this.maybeFail('replaceOne');
    const index = this.values().findIndex((document) => matches(document, filter));
    if (index < 0) return { matchedCount: 0 };
    this.values()[index] = deepClone(replacement);
    return { matchedCount: 1 };
  }
  async deleteOne(filter) {
    this.maybeFail('deleteOne');
    const index = this.values().findIndex((document) => matches(document, filter));
    if (index < 0) return { deletedCount: 0 };
    this.values().splice(index, 1);
    return { deletedCount: 1 };
  }
  async deleteMany(filter) {
    this.maybeFail('deleteMany');
    const before = this.values().length;
    this.state[this.name] = this.values().filter((document) => !matches(document, filter));
    return { deletedCount: before - this.state[this.name].length };
  }
  async updateOne(filter, update, options = {}) {
    this.maybeFail('updateOne');
    const document = this.values().find((item) => matches(item, filter));
    if (!document && options.upsert) {
      const inserted = {
        _id: `${this.name}-${this.values().length + 1}`,
        ...deepClone(update.$setOnInsert || {}),
      };
      this.values().push(inserted);
      return { matchedCount: 0, upsertedCount: 1, upsertedId: inserted._id };
    }
    if (!document) return { matchedCount: 0, upsertedCount: 0 };
    Object.assign(document, deepClone(update.$set || {}));
    return { matchedCount: 1, upsertedCount: 0 };
  }
}

function fakeMongoose(fixtures, options = {}) {
  const state = {
    users: [deepClone(fixtures.oldUser), deepClone(fixtures.newUser), ...deepClone(fixtures.extraUsers || [])],
    account_recoveries: [],
    weeklyscores: deepClone(fixtures.weeklyScores || []),
    weeklyprizes: [], traffic_events: [], pending_telegram_launches: [],
    analytics_events: [{ _id: 'analytics-new', telegramId: fixtures.newUser.telegramId, event: 'promo_used' }],
  };
  const operations = [];
  const failOperation = { value: options.failOperation || '' };
  const connection = {
    collection(name) { return new FakeCollection(name, state, operations, failOperation); },
  };
  let transactionTail = Promise.resolve();
  return {
    state,
    operations,
    connection,
    async startSession() {
      return {
        async withTransaction(callback) {
          const run = transactionTail.then(async () => {
            const snapshot = deepClone(state);
            try { return await callback(); }
            catch (error) {
              for (const key of Object.keys(state)) delete state[key];
              Object.assign(state, snapshot);
              throw error;
            }
          });
          transactionTail = run.catch(() => undefined);
          return run;
        },
        async endSession() {},
      };
    },
  };
}

function recoveryOptions(fixtures, recoveryId = 'recovery-nancy') {
  return {
    recoveryId,
    previewTokenHash: 'hash',
    tokenPayload: {
      recoveryId,
      oldTelegramId: fixtures.oldUser.telegramId,
      newTelegramId: fixtures.newUser.telegramId,
      oldVersion: versionDescriptor(fixtures.oldUser),
      newVersion: versionDescriptor(fixtures.newUser),
    },
    initiatedBy: 'admin',
    now: NOW,
  };
}

function routeHandler(path) {
  const layer = router.stack.find((item) => item.route?.path === path && item.route?.methods?.post);
  assert.ok(layer, `Missing POST route ${path}`);
  return layer.route.stack.at(-1).handle;
}

function responseDouble() {
  return {
    statusCode: 200,
    body: null,
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
}

test('Nancy preview shows OLD, NEW and the expected merged result', () => {
  const fixtures = nancyFixtures();
  const preview = buildRecoveryPreview(fixtures.oldUser, fixtures.newUser, { now: NOW });
  assert.equal(preview.old.telegramId, '7937090770');
  assert.equal(preview.new.telegramId, '8815934880');
  assert.equal(preview.merged.telegramId, '8815934880');
});

test('Nancy merged balance and total earned are additive', () => {
  const { oldUser, newUser } = nancyFixtures();
  const { user } = buildMergedUser(oldUser, newUser, { now: NOW });
  assert.equal(user.balance, 2609043);
  assert.equal(user.totalEarned, 2909313);
});

test('Nancy level and league are recomputed without reward helpers', () => {
  const { oldUser, newUser } = nancyFixtures();
  const { user } = buildMergedUser(oldUser, newUser, { now: NOW });
  assert.equal(user.level, 291);
  assert.equal(user.league, 'Gold');
});

test('all expected Nancy counters and derived progression values are preserved', () => {
  const { oldUser, newUser } = nancyFixtures();
  const { user } = buildMergedUser(oldUser, newUser, { now: NOW });
  assert.equal(user.totalTaps, 6886);
  assert.equal(user.tapPower, 17);
  assert.equal(user.maxEnergy, 1750);
  assert.equal(user.minerLevel, 5);
  assert.equal(user.totalUpgradesBought, 29);
  assert.equal(user.offlineClaimsCount, 48);
});

test('positive stale weekly progress is materialized for the NEW identity', async () => {
  const fixtures = nancyFixtures();
  fixtures.oldUser.weeklyEarnedWeek = '2026-W41';
  fixtures.oldUser.weeklyEarned = 1200;
  const database = fakeMongoose(fixtures);
  await executeRecovery({ mongoose: database, ...recoveryOptions(fixtures) });
  assert.deepEqual(
    database.state.weeklyscores.map((score) => [score.week, score.telegramId, score.weeklyEarned]),
    [['2026-W41', '8815934880', 1200]]
  );
  assert.equal(database.state.account_recoveries[0].backup.weeklyScoreRecoveryPlan.actions.length, 1);
});

test('OLD and NEW WeeklyScore for one completed week merge once under NEW identity', async () => {
  const fixtures = nancyFixtures();
  fixtures.oldUser.weeklyEarnedWeek = '2026-W41';
  fixtures.oldUser.weeklyEarned = 1200;
  fixtures.newUser.weeklyEarnedWeek = '2026-W41';
  fixtures.newUser.weeklyEarned = 300;
  fixtures.weeklyScores = [
    { _id: 'old-score', week: '2026-W41', telegramId: '7937090770', weeklyEarned: 1200, totalTaps: 6542 },
    { _id: 'new-score', week: '2026-W41', telegramId: '8815934880', weeklyEarned: 300, totalTaps: 344 },
  ];
  const database = fakeMongoose(fixtures);
  await executeRecovery({ mongoose: database, ...recoveryOptions(fixtures) });
  assert.equal(database.state.weeklyscores.length, 1);
  assert.equal(database.state.weeklyscores[0].telegramId, '8815934880');
  assert.equal(database.state.weeklyscores[0].weeklyEarned, 1500);
  assert.equal(database.state.weeklyscores[0].totalTaps, 6886);
});

test('GG7000 claim and its existing transaction are retained exactly once', () => {
  const { oldUser, newUser } = nancyFixtures();
  const merged = buildMergedUser(oldUser, newUser, { now: NOW });
  assert.equal(merged.user.usedPromoCodes.filter((code) => code === 'GG7000').length, 1);
  assert.equal(merged.fullHistories.transactions.filter((item) => /GG7000/i.test(item.title)).length, 1);
});

test('transactions deduplicate by subdocument id', () => {
  const { oldUser, newUser } = nancyFixtures();
  newUser.transactions.push(deepClone(oldUser.transactions[0]));
  const merged = buildMergedUser(oldUser, newUser, { now: NOW });
  assert.equal(merged.fullHistories.transactions.length, 68);
});

test('active transaction history is limited to 50 while full history keeps 68', () => {
  const { oldUser, newUser } = nancyFixtures();
  const merged = buildMergedUser(oldUser, newUser, { now: NOW });
  assert.equal(merged.user.transactions.length, 50);
  assert.equal(merged.fullHistories.transactions.length, 68);
});

test('transaction backup contains full raw OLD and NEW documents and linked records', async () => {
  const fixtures = nancyFixtures();
  const database = fakeMongoose(fixtures);
  await executeRecovery({ mongoose: database, ...recoveryOptions(fixtures) });
  const record = database.state.account_recoveries[0];
  assert.equal(record.backup.oldUser.transactions.length, 50);
  assert.equal(record.backup.newUser.transactions.length, 18);
  assert.equal(record.backup.fullMergedHistories.transactions.length, 68);
  assert.equal(record.backup.linkedRecords.analyticsEvents.length, 1);
});

test('conflicting referrer blocks recovery', () => {
  const { oldUser, newUser } = nancyFixtures();
  oldUser.referredBy = '100'; newUser.referredBy = '200';
  assert.ok(validateRecoverySafety(oldUser, newUser, NOW).some((item) => item.code === 'CONFLICTING_REFERRER'));
});

for (const [label, mutate] of [
  ['OLD→OLD', ({ oldUser }) => { oldUser.referredBy = oldUser.telegramId; }],
  ['NEW→NEW', ({ newUser }) => { newUser.referredBy = newUser.telegramId; }],
  ['OLD→NEW', ({ oldUser, newUser }) => { oldUser.referredBy = newUser.telegramId; }],
  ['NEW→OLD', ({ oldUser, newUser }) => { newUser.referredBy = oldUser.telegramId; }],
]) {
  test(`${label} referral cycle blocks recovery`, () => {
    const fixtures = nancyFixtures();
    mutate(fixtures);
    assert.ok(validateRecoverySafety(fixtures.oldUser, fixtures.newUser, NOW)
      .some((item) => item.code === 'RECOVERY_REFERRAL_CYCLE'));
  });
}

test('incoming OLD referral update cannot create a two-account referral cycle', async () => {
  const fixtures = nancyFixtures();
  fixtures.oldUser.referredBy = '300';
  fixtures.extraUsers = [{
    _id: 'referrer-object-id',
    __v: 1,
    telegramId: '300',
    referredBy: fixtures.oldUser.telegramId,
    updatedAt: new Date('2026-10-14T10:00:00.000Z'),
  }];
  const database = fakeMongoose(fixtures);
  await assert.rejects(
    executeRecovery({ mongoose: database, ...recoveryOptions(fixtures) }),
    (error) => error instanceof AccountRecoveryError &&
      error.details?.some((item) => item.code === 'RECOVERY_REFERRAL_CYCLE')
  );
  assert.equal(database.state.users.length, 3);
  assert.equal(database.state.account_recoveries.length, 0);
});

test('incoming OLD referral update cannot create a longer referral cycle', async () => {
  const fixtures = nancyFixtures();
  fixtures.oldUser.referredBy = '300';
  fixtures.extraUsers = [
    { _id: 'a', __v: 1, telegramId: '300', referredBy: '400', updatedAt: new Date() },
    { _id: 'b', __v: 1, telegramId: '400', referredBy: fixtures.oldUser.telegramId, updatedAt: new Date() },
  ];
  const database = fakeMongoose(fixtures);
  await assert.rejects(
    executeRecovery({ mongoose: database, ...recoveryOptions(fixtures) }),
    (error) => error instanceof AccountRecoveryError &&
      error.details?.some((item) => item.code === 'RECOVERY_REFERRAL_CYCLE')
  );
  assert.equal(database.state.users.length, 4);
});

test('incoming referral is rebound to NEW and referralsCount is recomputed', async () => {
  const fixtures = nancyFixtures();
  fixtures.extraUsers = [{
    _id: 'referred-user',
    __v: 1,
    telegramId: '500',
    referredBy: fixtures.oldUser.telegramId,
    updatedAt: new Date(),
  }];
  const database = fakeMongoose(fixtures);
  await executeRecovery({ mongoose: database, ...recoveryOptions(fixtures) });
  assert.equal(database.state.users.find((user) => user.telegramId === '500').referredBy, '8815934880');
  assert.equal(database.state.users.find((user) => user.telegramId === '8815934880').referralsCount, 1);
});

test('incoming referral rebind rolls back when a later recovery step fails', async () => {
  const fixtures = nancyFixtures();
  fixtures.extraUsers = [{
    _id: 'referred-user',
    __v: 1,
    telegramId: '500',
    referredBy: fixtures.oldUser.telegramId,
    updatedAt: new Date(),
  }];
  const database = fakeMongoose(fixtures, { failOperation: 'users.replaceOne' });
  await assert.rejects(executeRecovery({ mongoose: database, ...recoveryOptions(fixtures) }));
  assert.equal(database.state.users.find((user) => user.telegramId === '500').referredBy, '7937090770');
  assert.equal(database.state.account_recoveries.length, 0);
});

test('pending withdrawal blocks recovery', () => {
  const { oldUser, newUser } = nancyFixtures();
  newUser.withdrawalRequests = [{ status: 'pending' }];
  assert.ok(validateRecoverySafety(oldUser, newUser, NOW).some((item) => item.code === 'PENDING_WITHDRAWAL'));
});

test('conflicting team blocks recovery', () => {
  const { oldUser, newUser } = nancyFixtures();
  oldUser.teamName = 'A'; newUser.teamName = 'B';
  assert.ok(validateRecoverySafety(oldUser, newUser, NOW).some((item) => item.code === 'CONFLICTING_TEAM'));
});

test('frozen or suspicious status requires manual review', () => {
  const { oldUser, newUser } = nancyFixtures();
  oldUser.isFrozen = true; newUser.isSuspicious = true;
  assert.ok(validateRecoverySafety(oldUser, newUser, NOW)
    .some((item) => item.code === 'SECURITY_STATUS_REQUIRES_REVIEW'));
});

test('active Drop session blocks recovery', () => {
  const { oldUser, newUser } = nancyFixtures();
  oldUser.onixDrop = { sessionId: 'active', sessionExpiresAt: NOW + 60_000 };
  assert.ok(validateRecoverySafety(oldUser, newUser, NOW)
    .some((item) => item.code === 'ACTIVE_DROP_SESSION'));
});

test('preview token is signed, expiring and rejects tampering', () => {
  const token = createPreviewToken({ recoveryId: 'one' }, process.env.ACCOUNT_RECOVERY_SECRET, NOW);
  assert.equal(verifyPreviewToken(token, process.env.ACCOUNT_RECOVERY_SECRET, NOW).recoveryId, 'one');
  assert.throws(() => verifyPreviewToken(`${token}x`, process.env.ACCOUNT_RECOVERY_SECRET, NOW));
  assert.throws(() => verifyPreviewToken(token, process.env.ACCOUNT_RECOVERY_SECRET, NOW + 11 * 60 * 1000));
});

test('confirmation phrase is exact and identity-bound', () => {
  assert.equal(confirmationPhrase('7937090770', '8815934880'), 'RECOVER 7937090770 INTO 8815934880');
  assert.notEqual(confirmationPhrase('8815934880', '7937090770'), 'RECOVER 7937090770 INTO 8815934880');
});

test('repeated recoveryId returns the completed result without merging again', async () => {
  const fixtures = nancyFixtures();
  const database = fakeMongoose(fixtures);
  const first = await executeRecovery({ mongoose: database, ...recoveryOptions(fixtures) });
  const second = await executeRecovery({ mongoose: database, ...recoveryOptions(fixtures) });
  assert.equal(first.alreadyCompleted, false);
  assert.equal(second.alreadyCompleted, true);
  assert.equal(database.state.account_recoveries.length, 1);
});

test('concurrent confirms for one recoveryId commit the merge once', async () => {
  const fixtures = nancyFixtures();
  const database = fakeMongoose(fixtures);
  const options = recoveryOptions(fixtures, 'concurrent-recovery');
  const results = await Promise.all([
    executeRecovery({ mongoose: database, ...options }),
    executeRecovery({ mongoose: database, ...options }),
  ]);
  assert.deepEqual(results.map((item) => item.alreadyCompleted).sort(), [false, true]);
  assert.equal(database.state.account_recoveries.length, 1);
  assert.equal(database.state.users.length, 1);
  assert.equal(database.state.users[0].balance, 2609043);
});

test('version mismatch between preview and confirm blocks all mutations', async () => {
  const fixtures = nancyFixtures();
  const database = fakeMongoose(fixtures);
  const options = recoveryOptions(fixtures);
  options.tokenPayload.oldVersion.version -= 1;
  await assert.rejects(
    executeRecovery({ mongoose: database, ...options }),
    (error) => error instanceof AccountRecoveryError && error.code === 'RECOVERY_VERSION_MISMATCH'
  );
  assert.equal(database.state.users.length, 2);
  assert.equal(database.state.account_recoveries.length, 0);
});

test('transaction failure rolls back backup, replacement and referral changes', async () => {
  const fixtures = nancyFixtures();
  const database = fakeMongoose(fixtures, { failOperation: 'users.deleteOne' });
  await assert.rejects(executeRecovery({ mongoose: database, ...recoveryOptions(fixtures) }));
  assert.equal(database.state.users.length, 2);
  assert.equal(database.state.users.find((user) => user.telegramId === '8815934880').balance, 43412);
  assert.equal(database.state.account_recoveries.length, 0);
});

for (const failOperation of [
  'account_recoveries.insertOne',
  'users.updateMany',
  'users.replaceOne',
  'account_recoveries.updateOne',
]) {
  test(`transaction rolls back when ${failOperation} fails`, async () => {
    const fixtures = nancyFixtures();
    const database = fakeMongoose(fixtures, { failOperation });
    await assert.rejects(executeRecovery({ mongoose: database, ...recoveryOptions(fixtures) }));
    assert.equal(database.state.users.length, 2);
    assert.equal(database.state.users.find((user) => user.telegramId === '8815934880').balance, 43412);
    assert.equal(database.state.account_recoveries.length, 0);
    assert.equal(database.state.weeklyscores.length, 0);
  });
}

test('stale WeeklyScore materialization rolls back with a later transaction failure', async () => {
  const fixtures = nancyFixtures();
  fixtures.oldUser.weeklyEarnedWeek = '2026-W41';
  fixtures.oldUser.weeklyEarned = 1200;
  const database = fakeMongoose(fixtures, { failOperation: 'users.updateMany' });
  await assert.rejects(executeRecovery({ mongoose: database, ...recoveryOptions(fixtures) }));
  assert.equal(database.state.weeklyscores.length, 0);
  assert.equal(database.state.users.length, 2);
  assert.equal(database.state.account_recoveries.length, 0);
});

test('recovery performs no reward operation and adds no synthetic transaction', () => {
  const { oldUser, newUser } = nancyFixtures();
  const merged = buildMergedUser(oldUser, newUser, { now: NOW });
  assert.equal(merged.fullHistories.transactions.length, oldUser.transactions.length + newUser.transactions.length);
  assert.equal(merged.user.balance, oldUser.balance + newUser.balance);
});

test('historical AnalyticsEvents are backed up and never rewritten', async () => {
  const fixtures = nancyFixtures();
  const database = fakeMongoose(fixtures);
  await executeRecovery({ mongoose: database, ...recoveryOptions(fixtures) });
  assert.equal(database.state.analytics_events[0].telegramId, '8815934880');
  assert.equal(database.operations.some((item) => item.startsWith('analytics_events.update')), false);
});

test('NEW ObjectId and Telegram identity are preserved', () => {
  const { oldUser, newUser } = nancyFixtures();
  const { user } = buildMergedUser(oldUser, newUser, { now: NOW });
  assert.equal(user._id, 'new-object-id');
  assert.equal(user.telegramId, '8815934880');
  assert.equal(user.telegramUsername, 'LinBadGirl');
});

test('OLD is deleted after NEW replacement and recovery backup insertion', async () => {
  const fixtures = nancyFixtures();
  const database = fakeMongoose(fixtures);
  await performRecoveryTransaction({
    connection: database.connection,
    session: {},
    ...recoveryOptions(fixtures),
  });
  const insert = database.operations.indexOf('account_recoveries.insertOne');
  const replace = database.operations.indexOf('users.replaceOne');
  const remove = database.operations.indexOf('users.deleteOne');
  assert.ok(insert >= 0 && replace > insert && remove > replace);
  assert.equal(database.state.users.some((user) => user.telegramId === '7937090770'), false);
});

test('AccountRecovery declares unique recoveryId and keeps immutable backup fields', () => {
  const indexes = AccountRecovery.schema.indexes();
  assert.ok(indexes.some(([keys, options]) => keys.recoveryId === 1 && options.unique));
  assert.equal(AccountRecovery.schema.path('backup').options.immutable, true);
});

test('preview endpoint is admin-only and rejects before database access', async () => {
  const response = responseDouble();
  await routeHandler('/admin-account-recovery-preview')(
    { body: {}, get: () => '' },
    response
  );
  assert.equal(response.statusCode, 403);
});

test('confirm endpoint is admin-only', async () => {
  const response = responseDouble();
  await routeHandler('/admin-account-recovery-confirm')(
    { body: {}, get: () => '' },
    response
  );
  assert.equal(response.statusCode, 403);
});

test('confirm endpoint rejects a preview token bound to another recovery request', async () => {
  const fixtures = nancyFixtures();
  const token = createPreviewToken({
    ...recoveryOptions(fixtures, 'token-recovery').tokenPayload,
  }, process.env.ACCOUNT_RECOVERY_SECRET, Date.now());
  const response = responseDouble();
  await routeHandler('/admin-account-recovery-confirm')(
    {
      body: {
        secret: process.env.ADMIN_SECRET,
        recoveryId: 'different-recovery',
        previewToken: token,
        oldTelegramId: fixtures.oldUser.telegramId,
        newTelegramId: fixtures.newUser.telegramId,
      },
      get: () => '',
    },
    response
  );
  assert.equal(response.statusCode, 403);
  assert.equal(response.body.code, 'RECOVERY_REQUEST_MISMATCH');
});

test('confirm endpoint requires the exact confirmation phrase', async () => {
  const fixtures = nancyFixtures();
  const options = recoveryOptions(fixtures, 'phrase-recovery');
  const token = createPreviewToken(options.tokenPayload, process.env.ACCOUNT_RECOVERY_SECRET, Date.now());
  const response = responseDouble();
  await routeHandler('/admin-account-recovery-confirm')(
    {
      body: {
        secret: process.env.ADMIN_SECRET,
        recoveryId: options.recoveryId,
        previewToken: token,
        confirmation: 'RECOVER THE WRONG ACCOUNT',
        oldTelegramId: fixtures.oldUser.telegramId,
        newTelegramId: fixtures.newUser.telegramId,
      },
      get: () => '',
    },
    response
  );
  assert.equal(response.statusCode, 400);
  assert.equal(response.body.code, 'CONFIRMATION_REQUIRED');
});
