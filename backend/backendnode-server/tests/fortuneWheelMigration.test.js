const assert = require('node:assert/strict');
const test = require('node:test');

const {
  COLLECTIONS,
  LEGACY_CAMPAIGN_KEY,
  MIGRATION_CONFIRMATION,
  REQUIRED_INDEXES,
  REQUIRED_ACCOUNT_RECOVERY_LEDGER_VERSION,
  WEEKLY_CAMPAIGN_KEY,
  analyzeFortuneWheelMigration,
  assertMigrationEnvironment,
} = require('../fortuneWheelMigration');
const {
  FORTUNE_WHEEL_ENTITLEMENT_LEDGER_RECOVERY_VERSION,
} = require('../accountRecovery');

const LEGACY_PROGRESS_ID = '64b000000000000000000001';
const LEGACY_REQUEST_ID = '64b000000000000000000011';
const STAGING_LEGACY_CAMPAIGN_KEY = 'fortune-wheel-staging-v1';

function requiredIndexes() {
  const indexes = Object.fromEntries(Object.values(COLLECTIONS).map((name) => [name, []]));
  for (const required of Object.values(REQUIRED_INDEXES)) {
    indexes[required.collection].push({
      name: required.name,
      key: { ...required.key },
      unique: required.unique,
      ...(required.options || {}),
    });
  }
  return indexes;
}

function legacyProgress(overrides = {}) {
  return {
    _id: LEGACY_PROGRESS_ID,
    campaignKey: LEGACY_CAMPAIGN_KEY,
    telegramId: '100000001',
    mode: 'legacy_fixed_v1',
    physicalPrizeReservation: {
      slot: 1,
      reservedAt: new Date('2026-01-01T00:00:00.000Z'),
      status: 'reserved',
    },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function legacyRequest(overrides = {}) {
  return {
    _id: LEGACY_REQUEST_ID,
    requestId: 'legacy-request-1',
    fortuneWheelProgressId: LEGACY_PROGRESS_ID,
    campaignKey: LEGACY_CAMPAIGN_KEY,
    telegramId: '100000001',
    prizeCode: 'iphone_duo',
    color: 'staging-test',
    status: 'pending',
    ...overrides,
  };
}

function snapshot(overrides = {}) {
  return {
    progressDocuments: [legacyProgress()],
    targetProgressDocuments: [],
    requestDocuments: [legacyRequest()],
    entitlementDocuments: [],
    inventoryDocuments: [],
    indexes: requiredIndexes(),
    ...overrides,
  };
}

function stagingEnvironment(overrides = {}) {
  return {
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
    MONGO_URI: 'mongodb://user:password@mongo-staging.example.test/onix_staging',
    STAGING_MONGODB_DATABASE: 'onix_staging',
    STAGING_MONGODB_ALLOWED_DATABASES: 'onix_staging',
    STAGING_MONGODB_ALLOWED_HOSTS: 'mongo-staging.example.test',
    ...overrides,
  };
}

test('preflight proposes a separate weekly campaign without mutating legacy data', () => {
  const report = analyzeFortuneWheelMigration(snapshot());
  assert.equal(report.ok, true);
  assert.equal(report.sourceCampaignKey, 'fortune-wheel-v1');
  assert.equal(report.targetCampaignKey, 'fortune-wheel-weekly-v1');
  assert.equal(report.counts.entitlementsToBackfill, 1);
  assert.equal(report.operations.createInventory, true);
  assert.equal(report.operations.dropLegacyProgressIndex, false);
  assert.equal(report.operations.backfillEntitlements[0].physicalPrizeRequestId, legacyRequest()._id);
});

test('preflight preserves the staging legacy campaign key during entitlement backfill', () => {
  const report = analyzeFortuneWheelMigration(snapshot({
    progressDocuments: [legacyProgress({ campaignKey: STAGING_LEGACY_CAMPAIGN_KEY })],
    requestDocuments: [legacyRequest({ campaignKey: STAGING_LEGACY_CAMPAIGN_KEY })],
  }));
  assert.equal(report.ok, true);
  assert.equal(report.sourceCampaignKey, STAGING_LEGACY_CAMPAIGN_KEY);
  assert.deepEqual(report.sourceCampaignKeys, [STAGING_LEGACY_CAMPAIGN_KEY]);
  assert.equal(
    report.operations.backfillEntitlements[0].campaignKey,
    STAGING_LEGACY_CAMPAIGN_KEY
  );
});

test('preflight fails closed when one player owns progress in multiple legacy campaigns', () => {
  const report = analyzeFortuneWheelMigration(snapshot({
    progressDocuments: [
      legacyProgress(),
      legacyProgress({
        _id: '64b000000000000000000000099',
        campaignKey: STAGING_LEGACY_CAMPAIGN_KEY,
        physicalPrizeReservation: {
          slot: 2,
          reservedAt: new Date('2026-01-01T00:00:00.000Z'),
          status: 'reserved',
        },
      }),
    ],
    requestDocuments: [],
  }));
  assert.equal(report.ok, false);
  assert.equal(report.blockers.some(
    (blocker) => blocker.code === 'LEGACY_CAMPAIGN_OWNERSHIP_AMBIGUOUS'
  ), true);
});

test('preflight is idempotent when matching entitlement and inventory already exist', () => {
  const first = analyzeFortuneWheelMigration(snapshot());
  const candidate = first.operations.backfillEntitlements[0];
  const second = analyzeFortuneWheelMigration(snapshot({
    entitlementDocuments: [{ _id: 'entitlement-1', ...candidate }],
    inventoryDocuments: [{
      campaignKey: WEEKLY_CAMPAIGN_KEY,
      prizeCode: 'iphone_duo',
      capacity: 100,
      reserved: 0,
      fulfilled: 0,
      configVersion: 'weekly-random-v1',
    }],
  }));
  assert.equal(second.ok, true);
  assert.equal(second.counts.entitlementsToBackfill, 0);
  assert.equal(second.counts.entitlementsAlreadyBackfilled, 1);
  assert.equal(second.operations.createInventory, false);
});

test('preflight blocks duplicate legacy players, slots, requests, and target progress', () => {
  const duplicateProgress = legacyProgress({
    _id: '64b000000000000000000000002',
  });
  const report = analyzeFortuneWheelMigration(snapshot({
    progressDocuments: [legacyProgress(), duplicateProgress],
    requestDocuments: [legacyRequest(), legacyRequest({ _id: 'request-2' })],
    targetProgressDocuments: [{ campaignKey: WEEKLY_CAMPAIGN_KEY }],
  }));
  const codes = new Set(report.blockers.map((blocker) => blocker.code));
  assert.equal(report.ok, false);
  assert.equal(codes.has('LEGACY_PROGRESS_DUPLICATE_PLAYER'), true);
  assert.equal(codes.has('LEGACY_RESERVATION_SLOT_DUPLICATE'), true);
  assert.equal(codes.has('LEGACY_REQUEST_DUPLICATE_PLAYER'), true);
  assert.equal(codes.has('TARGET_CAMPAIGN_ALREADY_HAS_PROGRESS'), true);
});

test('preflight blocks future entitlement player, slot, and progress conflicts', () => {
  const report = analyzeFortuneWheelMigration(snapshot({
    entitlementDocuments: [{
      _id: 'conflicting-entitlement',
      campaignKey: LEGACY_CAMPAIGN_KEY,
      telegramId: '100000001',
      prizeCode: 'iphone_duo',
      slot: 2,
      progressId: 'different-progress',
      sourceMode: 'legacy_fixed_v1',
    }],
  }));
  assert.equal(report.ok, false);
  assert.equal(
    report.blockers.some((blocker) => blocker.code === 'ENTITLEMENT_BACKFILL_CONFLICT'),
    true
  );
});

test('preflight blocks duplicate entitlement ledger keys and invalid legacy slots', () => {
  const duplicate = {
    _id: 'entitlement-1',
    campaignKey: LEGACY_CAMPAIGN_KEY,
    telegramId: '100000001',
    prizeCode: 'iphone_duo',
    slot: 1,
    progressId: LEGACY_PROGRESS_ID,
    sourceMode: 'legacy_fixed_v1',
  };
  const report = analyzeFortuneWheelMigration(snapshot({
    progressDocuments: [legacyProgress({
      physicalPrizeReservation: {
        slot: 10001,
        reservedAt: new Date('2026-01-01T00:00:00.000Z'),
        status: 'reserved',
      },
    })],
    requestDocuments: [],
    entitlementDocuments: [duplicate, { ...duplicate, _id: 'entitlement-2' }],
  }));
  const codes = new Set(report.blockers.map((blocker) => blocker.code));
  assert.equal(codes.has('LEGACY_RESERVATION_SLOT_INVALID'), true);
  assert.equal(codes.has('ENTITLEMENT_LEDGER_DUPLICATE_PLAYER'), true);
  assert.equal(codes.has('ENTITLEMENT_LEDGER_DUPLICATE_SLOT'), true);
  assert.equal(codes.has('ENTITLEMENT_LEDGER_DUPLICATE_PROGRESS'), true);
});

test('preflight blocks requests without matching progress or reservation', () => {
  const missingProgress = analyzeFortuneWheelMigration(snapshot({ progressDocuments: [] }));
  assert.equal(
    missingProgress.blockers.some((blocker) => blocker.code === 'LEGACY_REQUEST_PROGRESS_MISSING'),
    true
  );

  const noReservation = analyzeFortuneWheelMigration(snapshot({
    progressDocuments: [legacyProgress({ physicalPrizeReservation: undefined })],
  }));
  assert.equal(
    noReservation.blockers.some((blocker) => blocker.code === 'LEGACY_REQUEST_WITHOUT_RESERVATION'),
    true
  );
});

test('post-switch dry-run accepts the weekly unique index without the legacy index', () => {
  const indexes = requiredIndexes();
  indexes[COLLECTIONS.progress] = indexes[COLLECTIONS.progress].filter(
    (index) => JSON.stringify(index.key) !== JSON.stringify(REQUIRED_INDEXES.progressLegacy.key)
  );
  const report = analyzeFortuneWheelMigration(snapshot({ indexes }));
  assert.equal(report.ok, true);
  assert.equal(report.indexChecks.progressLegacy.state, 'missing');
  assert.equal(report.indexChecks.progressWeekly.state, 'ready');
  assert.equal(report.blockers.some(
    (blocker) => blocker.code === 'LEGACY_PROGRESS_UNIQUE_INDEX_MISSING'
  ), false);
  assert.equal(report.warnings.some(
    (warning) => warning.code === 'LEGACY_PROGRESS_INDEX_REMAINS'
  ), false);
  assert.equal(report.operations.dropLegacyProgressIndex, false);
});

test('pre-switch preflight fails closed when neither legacy nor weekly uniqueness exists', () => {
  const indexes = requiredIndexes();
  indexes[COLLECTIONS.progress] = indexes[COLLECTIONS.progress].filter((index) => (
    !['progressLegacy', 'progressWeekly'].some((name) => (
      JSON.stringify(index.key) === JSON.stringify(REQUIRED_INDEXES[name].key)
    ))
  ));
  const report = analyzeFortuneWheelMigration(snapshot({ indexes }));
  assert.equal(report.ok, false);
  assert.equal(report.blockers.some(
    (blocker) => blocker.code === 'LEGACY_PROGRESS_UNIQUE_INDEX_MISSING'
  ), true);
  assert.equal(report.operations.createIndexes.includes('progressWeekly'), true);
});

test('post-switch dry-run still blocks a conflicting target inventory', () => {
  const indexes = requiredIndexes();
  indexes[COLLECTIONS.progress] = indexes[COLLECTIONS.progress].filter(
    (index) => JSON.stringify(index.key) !== JSON.stringify(REQUIRED_INDEXES.progressLegacy.key)
  );
  const report = analyzeFortuneWheelMigration(snapshot({
    indexes,
    inventoryDocuments: [{
      campaignKey: WEEKLY_CAMPAIGN_KEY,
      prizeCode: 'iphone_duo',
      capacity: 99,
      reserved: 1,
      fulfilled: 0,
      configVersion: 'wrong-version',
    }],
  }));
  const codes = new Set(report.blockers.map((blocker) => blocker.code));
  assert.equal(codes.has('LEGACY_PROGRESS_UNIQUE_INDEX_MISSING'), false);
  assert.equal(codes.has('TARGET_INVENTORY_CONFLICT'), true);
});

test('dry-run is the default but still requires confirmed isolated staging', () => {
  const result = assertMigrationEnvironment({ environment: stagingEnvironment() });
  assert.equal(result.apply, false);
  assert.equal(result.deployment.staging, true);
  assert.throws(
    () => assertMigrationEnvironment({ environment: { NODE_ENV: 'production' } }),
    (error) => error.code === 'MIGRATION_STAGING_REQUIRED'
  );
});

test('writes fail closed without every explicit gate and verified backup reference', () => {
  const base = stagingEnvironment({
    FORTUNE_WHEEL_MIGRATION_WRITE_ENABLED: 'true',
    FORTUNE_WHEEL_MIGRATION_TARGET: WEEKLY_CAMPAIGN_KEY,
  });
  assert.throws(
    () => assertMigrationEnvironment({
      environment: base,
      apply: true,
      accountRecoveryLedgerVersion: REQUIRED_ACCOUNT_RECOVERY_LEDGER_VERSION,
    }),
    (error) => error.code === 'MIGRATION_CONFIRMATION_MISMATCH'
  );
  assert.throws(
    () => assertMigrationEnvironment({
      environment: base,
      apply: true,
      confirmation: MIGRATION_CONFIRMATION,
      accountRecoveryLedgerVersion: REQUIRED_ACCOUNT_RECOVERY_LEDGER_VERSION,
    }),
    (error) => error.code === 'MIGRATION_BACKUP_REQUIRED'
  );
  const result = assertMigrationEnvironment({
    environment: base,
    apply: true,
    confirmation: MIGRATION_CONFIRMATION,
    backupReference: 'staging-backup-20261107',
    accountRecoveryLedgerVersion: REQUIRED_ACCOUNT_RECOVERY_LEDGER_VERSION,
  });
  assert.equal(result.apply, true);
});

test('writes remain blocked until Account Recovery supports the entitlement ledger', () => {
  assert.throws(
    () => assertMigrationEnvironment({
      environment: stagingEnvironment({
        FORTUNE_WHEEL_MIGRATION_WRITE_ENABLED: 'true',
        FORTUNE_WHEEL_MIGRATION_TARGET: WEEKLY_CAMPAIGN_KEY,
      }),
      apply: true,
      confirmation: MIGRATION_CONFIRMATION,
      backupReference: 'staging-backup-20261107',
      accountRecoveryLedgerVersion: 0,
    }),
    (error) => error.code === 'MIGRATION_ACCOUNT_RECOVERY_NOT_READY'
  );
});

test('implemented Account Recovery capability satisfies the migration guard', () => {
  assert.equal(
    FORTUNE_WHEEL_ENTITLEMENT_LEDGER_RECOVERY_VERSION,
    REQUIRED_ACCOUNT_RECOVERY_LEDGER_VERSION
  );
  const result = assertMigrationEnvironment({
    environment: stagingEnvironment({
      FORTUNE_WHEEL_MIGRATION_WRITE_ENABLED: 'true',
      FORTUNE_WHEEL_MIGRATION_TARGET: WEEKLY_CAMPAIGN_KEY,
    }),
    apply: true,
    confirmation: MIGRATION_CONFIRMATION,
    backupReference: 'staging-backup-20261107',
    accountRecoveryLedgerVersion: FORTUNE_WHEEL_ENTITLEMENT_LEDGER_RECOVERY_VERSION,
  });
  assert.equal(result.apply, true);
});

test('unknown or production deployment environment can never enable migration writes', () => {
  for (const environment of [
    stagingEnvironment({ ONIX_DEPLOY_ENV: 'production' }),
    stagingEnvironment({ ONIX_DEPLOY_ENV: 'unexpected' }),
  ]) {
    assert.throws(() => assertMigrationEnvironment({
      environment,
      apply: true,
      confirmation: MIGRATION_CONFIRMATION,
      backupReference: 'staging-backup-20261107',
      accountRecoveryLedgerVersion: REQUIRED_ACCOUNT_RECOVERY_LEDGER_VERSION,
    }));
  }
});

test('required index plan never includes dropping the legacy progress index', () => {
  const indexes = requiredIndexes();
  indexes[COLLECTIONS.entitlements] = [];
  indexes[COLLECTIONS.inventory] = [];
  const report = analyzeFortuneWheelMigration(snapshot({ indexes }));
  assert.equal(report.ok, true);
  assert.deepEqual(new Set(report.operations.createIndexes), new Set([
    'entitlementPlayer',
    'entitlementSlot',
    'entitlementProgress',
    'inventory',
  ]));
  assert.equal(report.operations.dropLegacyProgressIndex, false);
});
