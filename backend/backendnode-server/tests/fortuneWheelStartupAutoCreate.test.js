const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const mongoose = require('mongoose');
const { MongoClient, ObjectId } = require('mongodb');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

process.env.NODE_ENV = 'production';
process.env.ONIX_DEPLOY_ENV = 'staging';
process.env.FORTUNE_WHEEL_MODE = 'legacy_fixed_v1';
process.env.FORTUNE_WHEEL_ENABLED = 'false';
process.env.FORTUNE_WHEEL_CAMPAIGN_APPROVED = 'false';
process.env.FORTUNE_WHEEL_MIGRATION_WRITE_ENABLED = 'false';

const FortuneWheelProgress = require('../models/FortuneWheelProgress');
const FortuneWheelPrizeInventory = require('../models/FortuneWheelPrizeInventory');
const FortuneWheelPrizeEntitlement = require('../models/FortuneWheelPrizeEntitlement');

const LEGACY_CAMPAIGN_KEY = 'fortune-wheel-staging-v1';
const WEEKLY_COLLECTIONS = [
  'fortune_wheel_prize_entitlements',
  'fortune_wheel_prize_inventory',
];

let replSet;
let uri;
let databaseName;

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizedIndexes(indexes) {
  return indexes.map((index) => ({
    name: index.name,
    key: index.key,
    unique: index.unique === true,
    partialFilterExpression: index.partialFilterExpression || null,
    expireAfterSeconds: index.expireAfterSeconds ?? null,
  })).sort((left, right) => left.name.localeCompare(right.name));
}

async function snapshot(database) {
  const collectionNames = (await database.listCollections({}, { nameOnly: true }).toArray())
    .map((entry) => entry.name)
    .sort();
  const collections = {};
  for (const name of collectionNames) {
    const collection = database.collection(name);
    collections[name] = {
      count: await collection.countDocuments({}),
      indexes: normalizedIndexes(await collection.indexes()),
      documents: plain(await collection.find({}).sort({ _id: 1 }).toArray()),
    };
  }
  return plain({ collectionNames, collections });
}

async function seedStagingLegacyStructure() {
  const client = new MongoClient(uri);
  await client.connect();
  try {
    const database = client.db(databaseName);
    await database.createCollection('fortune_wheel_progress');
    await database.createCollection('physical_prize_requests');

    const progress = database.collection('fortune_wheel_progress');
    await progress.createIndex(
      { campaignKey: 1, telegramId: 1 },
      { unique: true, name: 'campaignKey_1_telegramId_1' }
    );
    await progress.createIndex(
      { campaignKey: 1, 'physicalPrizeReservation.slot': 1 },
      { unique: true, name: 'campaignKey_1_physicalPrizeReservation.slot_1' }
    );

    const requests = database.collection('physical_prize_requests');
    await requests.createIndex({ requestId: 1 }, { unique: true, name: 'requestId_1' });
    await requests.createIndex(
      { fortuneWheelProgressId: 1 },
      { unique: true, name: 'fortuneWheelProgressId_1' }
    );
    await requests.createIndex(
      { campaignKey: 1, telegramId: 1, prizeCode: 1 },
      { unique: true, name: 'campaignKey_1_telegramId_1_prizeCode_1' }
    );

    const progressId = new ObjectId();
    const requestId = new ObjectId();
    const playerId = '9300000001';
    const claimedAt = new Date('2026-11-15T12:00:00.000Z');
    await progress.insertOne({
      _id: progressId,
      campaignKey: LEGACY_CAMPAIGN_KEY,
      telegramId: playerId,
      mode: 'legacy_fixed_v1',
      completedSpins: 3,
      claims: [
        { spin: 1, rewardType: 'onix', amount: 50000, idempotencyKey: 'legacy-spin-1', claimedAt },
        { spin: 2, rewardType: 'onix', amount: 250000, idempotencyKey: 'legacy-spin-2', claimedAt },
        { spin: 3, rewardType: 'physical_prize', prizeCode: 'iphone_duo', idempotencyKey: 'legacy-spin-3', claimedAt },
      ],
      physicalPrizeReservation: { slot: 1, status: 'reserved', reservedAt: claimedAt },
      physicalPrizeRequestId: requestId,
    });
    await requests.insertOne({
      _id: requestId,
      requestId: crypto.randomUUID(),
      idempotencyKey: 'legacy-color-selection',
      fortuneWheelProgressId: progressId,
      campaignKey: LEGACY_CAMPAIGN_KEY,
      telegramId: playerId,
      prizeCode: 'iphone_duo',
      color: 'staging-test',
      status: 'pending',
      statusHistory: [{ status: 'pending', action: 'created', changedAt: claimedAt, changedBy: 'player' }],
    });
  } finally {
    await client.close();
  }
}

test.before(async () => {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  databaseName = `onix_staging_startup_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  uri = replSet.getUri(databaseName);
  await seedStagingLegacyStructure();
});

test.after(async () => {
  await mongoose.disconnect();
  await replSet?.stop();
});

test('weekly models disable both automatic collection creation and automatic indexes', () => {
  for (const model of [
    FortuneWheelProgress,
    FortuneWheelPrizeInventory,
    FortuneWheelPrizeEntitlement,
  ]) {
    assert.equal(model.schema.options.autoCreate, false);
    assert.equal(model.schema.options.autoIndex, false);
  }
});

test('legacy startup and repeated startup leave staging collections, indexes, and documents unchanged', async () => {
  const sourceClient = new MongoClient(uri);
  await sourceClient.connect();
  const baseline = await snapshot(sourceClient.db(databaseName));
  await sourceClient.close();

  assert.deepEqual(
    baseline.collectionNames,
    ['fortune_wheel_progress', 'physical_prize_requests']
  );

  for (let startup = 1; startup <= 2; startup += 1) {
    await mongoose.connect(uri, { autoIndex: true, autoCreate: true });
    await Promise.all([
      FortuneWheelProgress.init(),
      FortuneWheelPrizeInventory.init(),
      FortuneWheelPrizeEntitlement.init(),
    ]);

    const afterStartup = await snapshot(mongoose.connection.db);
    assert.deepEqual(afterStartup, baseline, `startup ${startup} mutated the staging structure`);
    for (const collectionName of WEEKLY_COLLECTIONS) {
      assert.equal(afterStartup.collectionNames.includes(collectionName), false);
    }
    await mongoose.disconnect();
  }
});
