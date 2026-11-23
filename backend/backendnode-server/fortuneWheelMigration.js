const {
  FORTUNE_WHEEL_WEEKLY_CONFIG_VERSION,
  IPHONE_DUO_CAMPAIGN_CAPACITY,
} = require('./fortuneWheelWeekly');
const {
  STAGING_CONFIRMATION,
  createDeploymentIsolationConfig,
} = require('./deploymentIsolation');
const {
  LEGACY_FORTUNE_WHEEL_CAMPAIGN_KEYS,
  PRIMARY_LEGACY_FORTUNE_WHEEL_CAMPAIGN_KEY,
  WEEKLY_FORTUNE_WHEEL_CAMPAIGN_KEY,
} = require('./fortuneWheelCampaigns');

const LEGACY_CAMPAIGN_KEYS = LEGACY_FORTUNE_WHEEL_CAMPAIGN_KEYS;
const LEGACY_CAMPAIGN_KEY = PRIMARY_LEGACY_FORTUNE_WHEEL_CAMPAIGN_KEY;
const WEEKLY_CAMPAIGN_KEY = WEEKLY_FORTUNE_WHEEL_CAMPAIGN_KEY;
const PHYSICAL_PRIZE_CODE = 'iphone_duo';
const REQUIRED_ACCOUNT_RECOVERY_LEDGER_VERSION = 1;
const MIGRATION_CONFIRMATION = `APPLY ${LEGACY_CAMPAIGN_KEYS.join(',')} TO ${WEEKLY_CAMPAIGN_KEY}`;

const COLLECTIONS = Object.freeze({
  progress: 'fortune_wheel_progress',
  requests: 'physical_prize_requests',
  entitlements: 'fortune_wheel_prize_entitlements',
  inventory: 'fortune_wheel_prize_inventory',
});

const REQUIRED_INDEXES = Object.freeze({
  progressLegacy: Object.freeze({
    collection: COLLECTIONS.progress,
    key: Object.freeze({ campaignKey: 1, telegramId: 1 }),
    unique: true,
    name: 'campaignKey_1_telegramId_1',
  }),
  progressWeekly: Object.freeze({
    collection: COLLECTIONS.progress,
    key: Object.freeze({ campaignKey: 1, telegramId: 1, weekKey: 1 }),
    unique: true,
    name: 'uniq_campaign_player_week',
  }),
  progressClaimIdempotency: Object.freeze({
    collection: COLLECTIONS.progress,
    key: Object.freeze({ campaignKey: 1, telegramId: 1, 'claims.idempotencyKey': 1 }),
    unique: true,
    name: 'uniq_campaign_player_claim_idempotency',
    options: Object.freeze({
      partialFilterExpression: Object.freeze({
        'claims.idempotencyKey': Object.freeze({ $type: 'string' }),
      }),
    }),
  }),
  entitlementPlayer: Object.freeze({
    collection: COLLECTIONS.entitlements,
    key: Object.freeze({ campaignKey: 1, telegramId: 1, prizeCode: 1 }),
    unique: true,
    name: 'uniq_campaign_player_prize',
  }),
  entitlementSlot: Object.freeze({
    collection: COLLECTIONS.entitlements,
    key: Object.freeze({ campaignKey: 1, prizeCode: 1, slot: 1 }),
    unique: true,
    name: 'uniq_campaign_prize_slot',
  }),
  entitlementProgress: Object.freeze({
    collection: COLLECTIONS.entitlements,
    key: Object.freeze({ progressId: 1 }),
    unique: true,
    name: 'uniq_entitlement_progress',
  }),
  inventory: Object.freeze({
    collection: COLLECTIONS.inventory,
    key: Object.freeze({ campaignKey: 1, prizeCode: 1 }),
    unique: true,
    name: 'uniq_campaign_prize_inventory',
  }),
});

class FortuneWheelMigrationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'FortuneWheelMigrationError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new FortuneWheelMigrationError(code, message, details);
}

function id(value) {
  return value == null ? '' : String(value);
}

function dateOrNull(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function sameIndexKey(left = {}, right = {}) {
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  return leftEntries.length === rightEntries.length && leftEntries.every(
    ([key, value], index) => rightEntries[index]?.[0] === key && rightEntries[index]?.[1] === value
  );
}

function inspectIndex(indexes, required) {
  const matching = (indexes || []).find((index) => sameIndexKey(index.key, required.key));
  if (!matching) return { state: 'missing', required };
  const expectedPartial = required.options?.partialFilterExpression;
  const partialMatches = !expectedPartial ||
    JSON.stringify(matching.partialFilterExpression || null) === JSON.stringify(expectedPartial);
  if (Boolean(matching.unique) !== Boolean(required.unique) || !partialMatches) {
    return { state: 'conflict', required, actual: matching };
  }
  return { state: 'ready', required, actual: matching };
}

function addDuplicateBlockers(items, keyFor, code, blockers) {
  const seen = new Map();
  for (const item of items) {
    const key = keyFor(item);
    if (!key) continue;
    const current = seen.get(key) || [];
    current.push(item);
    seen.set(key, current);
  }
  for (const [key, duplicates] of seen.entries()) {
    if (duplicates.length > 1) blockers.push({ code, key, count: duplicates.length });
  }
}

function buildLegacyEntitlementCandidates(progressDocuments, requestDocuments, blockers, warnings) {
  const requestsByProgress = new Map();
  for (const request of requestDocuments) {
    const progressId = id(request.fortuneWheelProgressId);
    if (progressId) requestsByProgress.set(progressId, request);
  }

  const candidates = [];
  for (const progress of progressDocuments) {
    const slot = Number(progress?.physicalPrizeReservation?.slot || 0);
    const progressId = id(progress._id);
    const request = requestsByProgress.get(progressId) || null;
    if (!Number.isInteger(slot) || slot <= 0) {
      if (request) {
        blockers.push({
          code: 'LEGACY_REQUEST_WITHOUT_RESERVATION',
          progressId,
          requestId: id(request._id),
        });
      } else if (progress.iphoneUnlockedAt || progress.physicalPrizeRequestId) {
        warnings.push({ code: 'LEGACY_PRIZE_STATE_WITHOUT_RESERVATION', progressId });
      }
      continue;
    }
    if (slot > 10000) {
      blockers.push({ code: 'LEGACY_RESERVATION_SLOT_INVALID', progressId, slot });
      continue;
    }

    if (request && id(request.telegramId) !== id(progress.telegramId)) {
      blockers.push({ code: 'LEGACY_REQUEST_PLAYER_MISMATCH', progressId });
    }
    if (request && id(request.campaignKey) !== id(progress.campaignKey)) {
      blockers.push({ code: 'LEGACY_REQUEST_CAMPAIGN_MISMATCH', progressId });
    }
    if (
      request &&
      progress.physicalPrizeRequestId &&
      id(progress.physicalPrizeRequestId) !== id(request._id)
    ) {
      blockers.push({ code: 'LEGACY_REQUEST_POINTER_MISMATCH', progressId });
    }
    if (
      request?.status === 'delivered' &&
      progress.physicalPrizeReservation.status !== 'fulfilled'
    ) {
      blockers.push({ code: 'LEGACY_DELIVERED_RESERVATION_MISMATCH', progressId });
    }

    const fulfilled = progress.physicalPrizeReservation.status === 'fulfilled';
    candidates.push({
      campaignKey: id(progress.campaignKey),
      telegramId: id(progress.telegramId),
      prizeCode: PHYSICAL_PRIZE_CODE,
      slot,
      progressId: progress._id,
      sourceMode: 'legacy_fixed_v1',
      weekKey: 'legacy',
      configVersion: 'legacy-fixed-v1',
      status: fulfilled ? 'fulfilled' : 'reserved',
      reservedAt: dateOrNull(progress.physicalPrizeReservation.reservedAt) || dateOrNull(progress.createdAt),
      fulfilledAt: fulfilled
        ? dateOrNull(progress.physicalPrizeReservation.fulfilledAt) || dateOrNull(progress.updatedAt)
        : null,
      physicalPrizeRequestId: request?._id || progress.physicalPrizeRequestId || null,
    });
  }

  for (const request of requestDocuments) {
    const progressId = id(request.fortuneWheelProgressId);
    if (!progressDocuments.some((progress) => id(progress._id) === progressId)) {
      blockers.push({
        code: 'LEGACY_REQUEST_PROGRESS_MISSING',
        requestId: id(request._id),
        progressId,
      });
    }
  }
  return candidates;
}

function entitlementMatches(existing, candidate) {
  return (
    id(existing.campaignKey) === candidate.campaignKey &&
    id(existing.telegramId) === candidate.telegramId &&
    id(existing.prizeCode) === candidate.prizeCode &&
    Number(existing.slot) === candidate.slot &&
    id(existing.progressId) === id(candidate.progressId) &&
    id(existing.sourceMode) === candidate.sourceMode
  );
}

function analyzeFortuneWheelMigration(snapshot = {}) {
  const progressDocuments = snapshot.progressDocuments || [];
  const requestDocuments = snapshot.requestDocuments || [];
  const entitlementDocuments = snapshot.entitlementDocuments || [];
  const inventoryDocuments = snapshot.inventoryDocuments || [];
  const targetProgressDocuments = snapshot.targetProgressDocuments || [];
  const indexes = snapshot.indexes || {};
  const blockers = [];
  const warnings = [];

  if (LEGACY_CAMPAIGN_KEY === WEEKLY_CAMPAIGN_KEY) {
    blockers.push({ code: 'CAMPAIGN_KEYS_COLLIDE' });
  }
  if (targetProgressDocuments.length > 0) {
    blockers.push({ code: 'TARGET_CAMPAIGN_ALREADY_HAS_PROGRESS', count: targetProgressDocuments.length });
  }

  const legacyCampaignsByPlayer = new Map();
  for (const document of progressDocuments) {
    const telegramId = id(document.telegramId);
    if (!telegramId) continue;
    const campaigns = legacyCampaignsByPlayer.get(telegramId) || new Set();
    campaigns.add(id(document.campaignKey));
    legacyCampaignsByPlayer.set(telegramId, campaigns);
  }
  for (const [telegramId, campaigns] of legacyCampaignsByPlayer.entries()) {
    if (campaigns.size > 1) {
      blockers.push({
        code: 'LEGACY_CAMPAIGN_OWNERSHIP_AMBIGUOUS',
        key: telegramId,
        campaignKeys: [...campaigns].sort(),
      });
    }
  }

  addDuplicateBlockers(
    progressDocuments,
    (document) => `${id(document.campaignKey)}::${id(document.telegramId)}`,
    'LEGACY_PROGRESS_DUPLICATE_PLAYER',
    blockers
  );
  addDuplicateBlockers(
    progressDocuments.filter((document) => Number(document?.physicalPrizeReservation?.slot) > 0),
    (document) => `${id(document.campaignKey)}::${Number(document.physicalPrizeReservation.slot)}`,
    'LEGACY_RESERVATION_SLOT_DUPLICATE',
    blockers
  );
  addDuplicateBlockers(
    requestDocuments,
    (document) => `${id(document.campaignKey)}::${id(document.telegramId)}::${id(document.prizeCode)}`,
    'LEGACY_REQUEST_DUPLICATE_PLAYER',
    blockers
  );
  addDuplicateBlockers(
    entitlementDocuments,
    (document) => `${id(document.campaignKey)}::${id(document.telegramId)}::${id(document.prizeCode)}`,
    'ENTITLEMENT_LEDGER_DUPLICATE_PLAYER',
    blockers
  );
  addDuplicateBlockers(
    entitlementDocuments,
    (document) => `${id(document.campaignKey)}::${id(document.prizeCode)}::${Number(document.slot)}`,
    'ENTITLEMENT_LEDGER_DUPLICATE_SLOT',
    blockers
  );
  addDuplicateBlockers(
    entitlementDocuments,
    (document) => id(document.progressId),
    'ENTITLEMENT_LEDGER_DUPLICATE_PROGRESS',
    blockers
  );
  addDuplicateBlockers(
    requestDocuments,
    (document) => id(document.fortuneWheelProgressId),
    'LEGACY_REQUEST_DUPLICATE_PROGRESS',
    blockers
  );

  const candidates = buildLegacyEntitlementCandidates(
    progressDocuments,
    requestDocuments,
    blockers,
    warnings
  );
  const backfill = [];
  let alreadyBackfilled = 0;
  for (const candidate of candidates) {
    const byPlayer = entitlementDocuments.find((document) => (
      id(document.campaignKey) === candidate.campaignKey &&
      id(document.telegramId) === candidate.telegramId &&
      id(document.prizeCode) === candidate.prizeCode
    ));
    const bySlot = entitlementDocuments.find((document) => (
      id(document.campaignKey) === candidate.campaignKey &&
      id(document.prizeCode) === candidate.prizeCode &&
      Number(document.slot) === candidate.slot
    ));
    const byProgress = entitlementDocuments.find(
      (document) => id(document.progressId) === id(candidate.progressId)
    );
    const conflicts = [byPlayer, bySlot, byProgress].filter(Boolean).filter(
      (document) => !entitlementMatches(document, candidate)
    );
    if (conflicts.length > 0) {
      blockers.push({
        code: 'ENTITLEMENT_BACKFILL_CONFLICT',
        progressId: id(candidate.progressId),
        conflictingEntitlementIds: [...new Set(conflicts.map((item) => id(item._id)))],
      });
    } else if (byPlayer || bySlot || byProgress) {
      alreadyBackfilled += 1;
    } else {
      backfill.push(candidate);
    }
  }

  const targetInventory = inventoryDocuments.filter((document) => (
    id(document.campaignKey) === WEEKLY_CAMPAIGN_KEY &&
    id(document.prizeCode) === PHYSICAL_PRIZE_CODE
  ));
  if (targetInventory.length > 1) {
    blockers.push({ code: 'TARGET_INVENTORY_DUPLICATE', count: targetInventory.length });
  }
  const existingInventory = targetInventory[0] || null;
  if (existingInventory && (
    Number(existingInventory.capacity) !== IPHONE_DUO_CAMPAIGN_CAPACITY ||
    Number(existingInventory.reserved) !== 0 ||
    Number(existingInventory.fulfilled) !== 0 ||
    id(existingInventory.configVersion) !== FORTUNE_WHEEL_WEEKLY_CONFIG_VERSION
  )) {
    blockers.push({ code: 'TARGET_INVENTORY_CONFLICT' });
  }

  const indexChecks = {};
  for (const [name, required] of Object.entries(REQUIRED_INDEXES)) {
    indexChecks[name] = inspectIndex(indexes[required.collection] || [], required);
    if (indexChecks[name].state === 'conflict') {
      blockers.push({ code: 'INDEX_OPTIONS_CONFLICT', index: name });
    }
  }
  const legacyProgressIndexActive = indexChecks.progressLegacy.state === 'ready';
  const weeklyProgressIndexReady = indexChecks.progressWeekly.state === 'ready';
  if (!legacyProgressIndexActive && !weeklyProgressIndexReady) {
    blockers.push({ code: 'LEGACY_PROGRESS_UNIQUE_INDEX_MISSING' });
  }

  if (legacyProgressIndexActive) {
    warnings.push({
      code: 'LEGACY_PROGRESS_INDEX_REMAINS',
      message: 'The unique (campaignKey, telegramId) index still blocks a second weekly document.',
    });
  }
  warnings.push({
    code: 'LEGACY_ENDPOINT_COMPATIBILITY_REQUIRED',
    message: 'A future endpoint switch must keep legacy prize request and color lookups available.',
  });

  const detectedSourceCampaignKeys = [...new Set([
    ...progressDocuments.map((document) => id(document.campaignKey)),
    ...requestDocuments.map((document) => id(document.campaignKey)),
  ].filter((key) => LEGACY_CAMPAIGN_KEYS.includes(key)))].sort();
  return Object.freeze({
    ok: blockers.length === 0,
    dryRun: true,
    sourceCampaignKey: detectedSourceCampaignKeys.length === 1
      ? detectedSourceCampaignKeys[0]
      : null,
    sourceCampaignKeys: Object.freeze(detectedSourceCampaignKeys),
    targetCampaignKey: WEEKLY_CAMPAIGN_KEY,
    counts: Object.freeze({
      legacyProgress: progressDocuments.length,
      legacyPhysicalPrizeRequests: requestDocuments.length,
      legacyEntitlementCandidates: candidates.length,
      entitlementsToBackfill: backfill.length,
      entitlementsAlreadyBackfilled: alreadyBackfilled,
      targetProgress: targetProgressDocuments.length,
    }),
    blockers: Object.freeze(blockers),
    warnings: Object.freeze(warnings),
    indexChecks: Object.freeze(indexChecks),
    operations: Object.freeze({
      createIndexes: Object.freeze(Object.entries(indexChecks)
        .filter(([name, check]) => name !== 'progressLegacy' && check.state === 'missing')
        .map(([name]) => name)),
      backfillEntitlements: Object.freeze(backfill),
      createInventory: !existingInventory,
      dropLegacyProgressIndex: false,
    }),
  });
}

function assertMigrationEnvironment({
  environment = process.env,
  apply = false,
  confirmation = '',
  backupReference = '',
  accountRecoveryLedgerVersion = 0,
} = {}) {
  const deployment = createDeploymentIsolationConfig(environment);
  if (!deployment.staging) {
    fail('MIGRATION_STAGING_REQUIRED', 'Fortune Wheel migration is allowed only in confirmed staging');
  }
  if (!apply) return Object.freeze({ deployment, apply: false });
  if (environment.FORTUNE_WHEEL_MIGRATION_WRITE_ENABLED !== 'true') {
    fail('MIGRATION_WRITE_NOT_ENABLED', 'Migration writes require an explicit write enable flag');
  }
  if (environment.FORTUNE_WHEEL_MIGRATION_TARGET !== WEEKLY_CAMPAIGN_KEY) {
    fail('MIGRATION_TARGET_MISMATCH', 'Migration target campaign is not explicitly confirmed');
  }
  if (accountRecoveryLedgerVersion !== REQUIRED_ACCOUNT_RECOVERY_LEDGER_VERSION) {
    fail(
      'MIGRATION_ACCOUNT_RECOVERY_NOT_READY',
      'Account Recovery must support the entitlement ledger before migration writes are allowed'
    );
  }
  if (confirmation !== MIGRATION_CONFIRMATION) {
    fail('MIGRATION_CONFIRMATION_MISMATCH', 'Migration confirmation phrase does not match');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(String(backupReference || ''))) {
    fail('MIGRATION_BACKUP_REQUIRED', 'A verified staging backup reference is required');
  }
  return Object.freeze({ deployment, apply: true, backupReference: String(backupReference) });
}

async function collectionExists(db, name) {
  const entries = await db.listCollections({ name }, { nameOnly: true }).toArray();
  return entries.length > 0;
}

async function readCollection(db, name, filter = {}) {
  return (await collectionExists(db, name)) ? db.collection(name).find(filter).toArray() : [];
}

async function readIndexes(db, name) {
  return (await collectionExists(db, name)) ? db.collection(name).indexes() : [];
}

async function loadMigrationSnapshot(connection) {
  const db = connection?.db;
  if (!db) fail('MIGRATION_DATABASE_REQUIRED', 'A MongoDB connection is required');
  const [
    progressDocuments,
    targetProgressDocuments,
    requestDocuments,
    entitlementDocuments,
    inventoryDocuments,
  ] = await Promise.all([
    readCollection(db, COLLECTIONS.progress, { campaignKey: { $in: LEGACY_CAMPAIGN_KEYS } }),
    readCollection(db, COLLECTIONS.progress, { campaignKey: WEEKLY_CAMPAIGN_KEY }),
    readCollection(db, COLLECTIONS.requests, {
      campaignKey: { $in: LEGACY_CAMPAIGN_KEYS },
      prizeCode: PHYSICAL_PRIZE_CODE,
    }),
    readCollection(db, COLLECTIONS.entitlements, {
      campaignKey: { $in: [...LEGACY_CAMPAIGN_KEYS, WEEKLY_CAMPAIGN_KEY] },
      prizeCode: PHYSICAL_PRIZE_CODE,
    }),
    readCollection(db, COLLECTIONS.inventory, {
      campaignKey: WEEKLY_CAMPAIGN_KEY,
      prizeCode: PHYSICAL_PRIZE_CODE,
    }),
  ]);
  const indexes = {};
  for (const name of Object.values(COLLECTIONS)) indexes[name] = await readIndexes(db, name);
  return {
    progressDocuments,
    targetProgressDocuments,
    requestDocuments,
    entitlementDocuments,
    inventoryDocuments,
    indexes,
  };
}

async function ensureRequiredIndex(db, required) {
  if (!(await collectionExists(db, required.collection))) {
    try {
      await db.createCollection(required.collection);
    } catch (error) {
      if (error?.code !== 48 && error?.codeName !== 'NamespaceExists') throw error;
    }
  }
  const existing = inspectIndex(await db.collection(required.collection).indexes(), required);
  if (existing.state === 'ready') return false;
  if (existing.state === 'conflict') {
    fail('INDEX_OPTIONS_CONFLICT', `Index conflict for ${required.name}`);
  }
  await db.collection(required.collection).createIndex(required.key, {
    name: required.name,
    unique: required.unique,
    ...(required.options || {}),
  });
  return true;
}

async function applyFortuneWheelMigration({
  connection,
  environment,
  confirmation,
  backupReference,
  accountRecoveryLedgerVersion,
}) {
  const safety = assertMigrationEnvironment({
    environment,
    apply: true,
    confirmation,
    backupReference,
    accountRecoveryLedgerVersion,
  });
  if (connection?.name !== safety.deployment.mongoDatabase) {
    fail('MIGRATION_DATABASE_MISMATCH', 'Connected database does not match confirmed staging database');
  }

  const before = analyzeFortuneWheelMigration(await loadMigrationSnapshot(connection));
  if (!before.ok) fail('MIGRATION_PREFLIGHT_BLOCKED', 'Migration preflight has blockers', before.blockers);
  const db = connection.db;
  for (const [name, required] of Object.entries(REQUIRED_INDEXES)) {
    if (name !== 'progressLegacy') await ensureRequiredIndex(db, required);
  }

  const session = await connection.startSession();
  try {
    await session.withTransaction(async () => {
      if (before.operations.backfillEntitlements.length > 0) {
        await db.collection(COLLECTIONS.entitlements).bulkWrite(
          before.operations.backfillEntitlements.map((candidate) => ({
            updateOne: {
              filter: {
                campaignKey: candidate.campaignKey,
                telegramId: candidate.telegramId,
                prizeCode: candidate.prizeCode,
              },
              update: {
                $setOnInsert: { ...candidate, createdAt: new Date(), updatedAt: new Date() },
              },
              upsert: true,
            },
          })),
          { session, ordered: true }
        );
      }
      await db.collection(COLLECTIONS.inventory).updateOne(
        { campaignKey: WEEKLY_CAMPAIGN_KEY, prizeCode: PHYSICAL_PRIZE_CODE },
        {
          $setOnInsert: {
            campaignKey: WEEKLY_CAMPAIGN_KEY,
            prizeCode: PHYSICAL_PRIZE_CODE,
            capacity: IPHONE_DUO_CAMPAIGN_CAPACITY,
            reserved: 0,
            fulfilled: 0,
            configVersion: FORTUNE_WHEEL_WEEKLY_CONFIG_VERSION,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
        { upsert: true, session }
      );
    });
  } finally {
    await session.endSession();
  }

  const after = analyzeFortuneWheelMigration(await loadMigrationSnapshot(connection));
  if (!after.ok || after.operations.backfillEntitlements.length > 0 || after.operations.createInventory) {
    fail('MIGRATION_VERIFICATION_FAILED', 'Post-migration verification did not reach an idempotent state');
  }
  return Object.freeze({ applied: true, before, after, backupReference: safety.backupReference });
}

module.exports = {
  COLLECTIONS,
  FortuneWheelMigrationError,
  LEGACY_CAMPAIGN_KEY,
  LEGACY_CAMPAIGN_KEYS,
  MIGRATION_CONFIRMATION,
  PHYSICAL_PRIZE_CODE,
  REQUIRED_ACCOUNT_RECOVERY_LEDGER_VERSION,
  REQUIRED_INDEXES,
  WEEKLY_CAMPAIGN_KEY,
  analyzeFortuneWheelMigration,
  applyFortuneWheelMigration,
  assertMigrationEnvironment,
  loadMigrationSnapshot,
  sameIndexKey,
};
