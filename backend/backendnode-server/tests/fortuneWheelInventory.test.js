const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const test = require('node:test');

const FortuneWheelProgress = require('../models/FortuneWheelProgress');
const FortuneWheelPrizeInventory = require('../models/FortuneWheelPrizeInventory');
const FortuneWheelPrizeEntitlement = require('../models/FortuneWheelPrizeEntitlement');
const {
  reservePhysicalPrizeEntitlement,
} = require('../fortuneWheelInventory');
const {
  FORTUNE_WHEEL_WEEKLY_CONFIG_VERSION,
  IPHONE_DUO_CAMPAIGN_CAPACITY,
} = require('../fortuneWheelWeekly');

function indexByKeys(model, expected) {
  return model.schema.indexes().find(([keys]) => (
    Object.entries(expected).every(([key, value]) => keys[key] === value) &&
    Object.keys(keys).length === Object.keys(expected).length
  ));
}

function validWeeklyProgress(overrides = {}) {
  return new FortuneWheelProgress({
    campaignKey: 'fortune-wheel-weekly-v1',
    telegramId: '100000001',
    mode: 'weekly_random_v1',
    schemaVersion: 2,
    weekKey: '2026-11-02',
    weekStartsAt: new Date('2026-11-02T00:00:00.000Z'),
    weekEndsAt: new Date('2026-11-09T00:00:00.000Z'),
    spinsUsed: 1,
    claims: [{
      spin: 1,
      rewardType: 'onix',
      amount: 5000,
      rewardCode: 'onix_5000',
      configVersion: FORTUNE_WHEEL_WEEKLY_CONFIG_VERSION,
      drawVersion: 'hmac-sha256-rejection-v1',
      idempotencyKey: 'weekly-progress-claim-0001',
      claimedAt: new Date('2026-11-02T10:00:00.000Z'),
    }],
    ...overrides,
  });
}

function expectValidationError(document, path) {
  const error = document.validateSync();
  assert.ok(error, 'expected validation to fail');
  assert.ok(error.errors[path], `expected validation error for ${path}`);
}

test('FortuneWheelProgress keeps the legacy index and prepares the weekly unique index', () => {
  const legacy = indexByKeys(FortuneWheelProgress, { campaignKey: 1, telegramId: 1 });
  const weekly = indexByKeys(FortuneWheelProgress, { campaignKey: 1, telegramId: 1, weekKey: 1 });
  const idempotency = indexByKeys(FortuneWheelProgress, {
    campaignKey: 1,
    telegramId: 1,
    'claims.idempotencyKey': 1,
  });
  assert.equal(legacy?.[1]?.unique, true);
  assert.equal(weekly?.[1]?.unique, true);
  assert.equal(idempotency?.[1]?.unique, true);
  assert.deepEqual(idempotency?.[1]?.partialFilterExpression, {
    'claims.idempotencyKey': { $type: 'string' },
  });
  assert.equal(FortuneWheelProgress.schema.options.autoIndex, false);
});

test('legacy progress remains valid without weekly fields', () => {
  const legacy = new FortuneWheelProgress({
    campaignKey: 'fortune-wheel-v1',
    telegramId: '100000001',
    completedSpins: 1,
    claims: [{
      spin: 1,
      rewardType: 'onix',
      amount: 50000,
      idempotencyKey: 'legacy-spin-claim-0001',
      claimedAt: new Date('2026-10-01T10:00:00.000Z'),
    }],
  });
  assert.equal(legacy.mode, 'legacy_fixed_v1');
  assert.equal(legacy.schemaVersion, 1);
  assert.equal(legacy.validateSync(), undefined);
});

test('weekly progress requires versioned contiguous claims and a Monday UTC period', () => {
  assert.equal(validWeeklyProgress().validateSync(), undefined);
  expectValidationError(validWeeklyProgress({ spinsUsed: 2 }), 'claims');
  expectValidationError(validWeeklyProgress({ schemaVersion: 1 }), 'claims');
  expectValidationError(validWeeklyProgress({
    weekStartsAt: new Date('2026-11-03T00:00:00.000Z'),
  }), 'weekKey');
  expectValidationError(validWeeklyProgress({
    weekEndsAt: new Date('2026-11-08T00:00:00.000Z'),
  }), 'weekKey');
});

test('inventory enforces capacity 100 and non-negative bounded counters', () => {
  const valid = new FortuneWheelPrizeInventory({
    campaignKey: 'fortune-wheel-weekly-v1',
    prizeCode: 'iphone_duo',
    capacity: IPHONE_DUO_CAMPAIGN_CAPACITY,
    reserved: 10,
    fulfilled: 4,
    configVersion: FORTUNE_WHEEL_WEEKLY_CONFIG_VERSION,
  });
  assert.equal(valid.validateSync(), undefined);

  expectValidationError(new FortuneWheelPrizeInventory({
    campaignKey: 'fortune-wheel-weekly-v1',
    prizeCode: 'iphone_duo',
    capacity: 99,
    reserved: 0,
    fulfilled: 0,
    configVersion: FORTUNE_WHEEL_WEEKLY_CONFIG_VERSION,
  }), 'capacity');
  expectValidationError(new FortuneWheelPrizeInventory({
    campaignKey: 'fortune-wheel-weekly-v1',
    prizeCode: 'iphone_duo',
    capacity: 100,
    reserved: 101,
    fulfilled: 0,
    configVersion: FORTUNE_WHEEL_WEEKLY_CONFIG_VERSION,
  }), 'reserved');
  expectValidationError(new FortuneWheelPrizeInventory({
    campaignKey: 'fortune-wheel-weekly-v1',
    prizeCode: 'iphone_duo',
    capacity: 100,
    reserved: 3,
    fulfilled: 4,
    configVersion: FORTUNE_WHEEL_WEEKLY_CONFIG_VERSION,
  }), 'fulfilled');
});

test('inventory and entitlement expose database-level unique invariants', () => {
  assert.equal(FortuneWheelPrizeInventory.schema.options.autoIndex, false);
  assert.equal(FortuneWheelPrizeEntitlement.schema.options.autoIndex, false);
  assert.equal(indexByKeys(FortuneWheelPrizeInventory, { campaignKey: 1, prizeCode: 1 })?.[1]?.unique, true);
  assert.equal(indexByKeys(FortuneWheelPrizeEntitlement, {
    campaignKey: 1,
    telegramId: 1,
    prizeCode: 1,
  })?.[1]?.unique, true);
  assert.equal(indexByKeys(FortuneWheelPrizeEntitlement, {
    campaignKey: 1,
    prizeCode: 1,
    slot: 1,
  })?.[1]?.unique, true);
  assert.equal(indexByKeys(FortuneWheelPrizeEntitlement, { progressId: 1 })?.[1]?.unique, true);
});

test('entitlement keeps legacy slots while weekly slots are capped at 100', () => {
  const base = {
    campaignKey: 'fortune-wheel-v1',
    telegramId: '100000001',
    prizeCode: 'iphone_duo',
    progressId: new mongoose.Types.ObjectId(),
    reservedAt: new Date('2026-10-01T00:00:00.000Z'),
    status: 'reserved',
  };
  const legacy = new FortuneWheelPrizeEntitlement({
    ...base,
    slot: 500,
    sourceMode: 'legacy_fixed_v1',
    weekKey: 'legacy',
    configVersion: 'legacy-fixed-v1',
  });
  assert.equal(legacy.validateSync(), undefined);

  const weekly = new FortuneWheelPrizeEntitlement({
    ...base,
    campaignKey: 'fortune-wheel-weekly-v1',
    slot: 101,
    sourceMode: 'weekly_random_v1',
    weekKey: '2026-11-02',
    configVersion: FORTUNE_WHEEL_WEEKLY_CONFIG_VERSION,
  });
  expectValidationError(weekly, 'slot');
});

test('reservation requires a MongoDB session', async () => {
  await assert.rejects(
    reservePhysicalPrizeEntitlement({}),
    (error) => error?.code === 'FORTUNE_WHEEL_SESSION_REQUIRED'
  );
});

function queryResult(value) {
  return { session: async () => value };
}

function reservationInput(overrides = {}) {
  return {
    campaignKey: 'fortune-wheel-weekly-v1',
    telegramId: '100000001',
    progressId: new mongoose.Types.ObjectId(),
    weekKey: '2026-11-02',
    session: { transaction: true },
    PhysicalPrizeRequestModel: { findOne: () => ({ select: () => queryResult(null) }) },
    ...overrides,
  };
}

test('existing unique entitlement prevents another inventory reservation', async () => {
  const existing = { _id: new mongoose.Types.ObjectId(), slot: 7 };
  let inventoryCalls = 0;
  const result = await reservePhysicalPrizeEntitlement(reservationInput({
    EntitlementModel: { findOne: () => queryResult(existing) },
    ProgressModel: { findOne: () => { throw new Error('legacy lookup must not run'); } },
    InventoryModel: { findOneAndUpdate: () => { inventoryCalls += 1; } },
  }));
  assert.equal(result.alreadyEntitled, true);
  assert.equal(result.entitlement, existing);
  assert.equal(inventoryCalls, 0);
});

test('unmigrated legacy entitlement fails closed before inventory mutation', async () => {
  let inventoryCalls = 0;
  await assert.rejects(
    reservePhysicalPrizeEntitlement(reservationInput({
      EntitlementModel: { findOne: () => queryResult(null) },
      ProgressModel: { findOne: () => ({ select: () => queryResult({ _id: 'legacy-progress' }) }) },
      InventoryModel: { findOneAndUpdate: () => { inventoryCalls += 1; } },
    })),
    (error) => error?.code === 'LEGACY_ENTITLEMENT_NOT_MIGRATED'
  );
  assert.equal(inventoryCalls, 0);
});

test('unmigrated legacy physical prize request also fails closed', async () => {
  await assert.rejects(
    reservePhysicalPrizeEntitlement(reservationInput({
      EntitlementModel: { findOne: () => queryResult(null) },
      ProgressModel: { findOne: () => ({ select: () => queryResult(null) }) },
      PhysicalPrizeRequestModel: {
        findOne: () => ({ select: () => queryResult({ _id: 'legacy-request' }) }),
      },
      InventoryModel: { findOneAndUpdate: () => { throw new Error('must not reserve'); } },
    })),
    (error) => error?.code === 'LEGACY_ENTITLEMENT_NOT_MIGRATED'
  );
});

test('conditional inventory update prevents reservation after slot 100', async () => {
  let observedFilter = null;
  await assert.rejects(
    reservePhysicalPrizeEntitlement(reservationInput({
      EntitlementModel: { findOne: () => queryResult(null), create: async () => { throw new Error('must not create'); } },
      ProgressModel: { findOne: () => ({ select: () => queryResult(null) }) },
      InventoryModel: {
        findOneAndUpdate: async (filter) => {
          observedFilter = filter;
          return null;
        },
      },
    })),
    (error) => error?.code === 'PHYSICAL_PRIZE_CAPACITY_EXHAUSTED'
  );
  assert.deepEqual(observedFilter.reserved, { $lt: 100 });
  assert.deepEqual(observedFilter.$expr, { $lt: ['$reserved', '$capacity'] });
});

test('successful reservation uses one session for inventory and unique entitlement', async () => {
  const session = { transaction: true };
  const progressId = new mongoose.Types.ObjectId();
  let inventoryOptions = null;
  let createOptions = null;
  let createdDocument = null;
  const result = await reservePhysicalPrizeEntitlement(reservationInput({
    progressId,
    session,
    EntitlementModel: {
      findOne: () => queryResult(null),
      create: async ([document], options) => {
        createdDocument = document;
        createOptions = options;
        return [{ ...document, _id: new mongoose.Types.ObjectId() }];
      },
    },
    ProgressModel: { findOne: () => ({ select: () => queryResult(null) }) },
    InventoryModel: {
      findOneAndUpdate: async (_filter, update, options) => {
        assert.deepEqual(update, { $inc: { reserved: 1 } });
        inventoryOptions = options;
        return { reserved: 100, capacity: 100 };
      },
    },
  }));
  assert.equal(result.reserved, true);
  assert.equal(result.entitlement.slot, 100);
  assert.equal(createdDocument.progressId, progressId);
  assert.equal(inventoryOptions.session, session);
  assert.equal(createOptions.session, session);
});
