const mongoose = require('mongoose');
const FortuneWheelProgress = require('./models/FortuneWheelProgress');
const FortuneWheelPrizeInventory = require('./models/FortuneWheelPrizeInventory');
const FortuneWheelPrizeEntitlement = require('./models/FortuneWheelPrizeEntitlement');
const PhysicalPrizeRequest = require('./models/PhysicalPrizeRequest');
const {
  FORTUNE_WHEEL_ENTITLEMENT_LEDGER_RECOVERY_VERSION,
  lookupPhysicalPrizeRequestsForCompatibility,
} = require('./accountRecovery');
const { createDeploymentIsolationConfig } = require('./deploymentIsolation');
const {
  FortuneWheelInventoryError,
  reservePhysicalPrizeEntitlement,
} = require('./fortuneWheelInventory');
const {
  APPROVED_WEEKLY_CONFIG,
  FORTUNE_WHEEL_DRAW_VERSION,
  FORTUNE_WHEEL_WEEKLY_CONFIG_VERSION,
  IPHONE_DUO_CAMPAIGN_CAPACITY,
  WEEKLY_SPINS_LIMIT,
  buildEffectivePrizePool,
  drawWeeklyPrize,
  getFortuneWheelRandomSecret,
  getUtcWeekWindow,
} = require('./fortuneWheelWeekly');
const {
  LEGACY_FORTUNE_WHEEL_CAMPAIGN_KEYS,
  PRIMARY_LEGACY_FORTUNE_WHEEL_CAMPAIGN_KEY,
  WEEKLY_FORTUNE_WHEEL_CAMPAIGN_KEY,
} = require('./fortuneWheelCampaigns');

const LEGACY_MODE = 'legacy_fixed_v1';
const WEEKLY_MODE = 'weekly_random_v1';
const LEGACY_CAMPAIGN_KEYS = LEGACY_FORTUNE_WHEEL_CAMPAIGN_KEYS;
const LEGACY_CAMPAIGN_KEY = PRIMARY_LEGACY_FORTUNE_WHEEL_CAMPAIGN_KEY;
const WEEKLY_CAMPAIGN_KEY = WEEKLY_FORTUNE_WHEEL_CAMPAIGN_KEY;
const REQUIRED_RECOVERY_VERSION = 1;

class FortuneWheelWeeklyApiError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'FortuneWheelWeeklyApiError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new FortuneWheelWeeklyApiError(code, message);
}

function getFortuneWheelMode(environment = process.env) {
  const value = String(environment.FORTUNE_WHEEL_MODE || '').trim();
  if (!value || value === LEGACY_MODE) return LEGACY_MODE;
  if (value === WEEKLY_MODE) return WEEKLY_MODE;
  fail('FORTUNE_WHEEL_MODE_INVALID', 'Fortune Wheel mode is not supported');
}

function sameIndexKey(left = {}, right = {}) {
  const a = Object.entries(left);
  const b = Object.entries(right);
  return a.length === b.length && a.every(
    ([key, value], index) => b[index]?.[0] === key && b[index]?.[1] === value
  );
}

async function safeIndexes(db, collectionName) {
  try {
    return await db.collection(collectionName).indexes();
  } catch (error) {
    if (error?.code === 26 || error?.codeName === 'NamespaceNotFound') return [];
    throw error;
  }
}

function hasUniqueIndex(indexes, key, partialFilterExpression = null) {
  return indexes.some((index) => (
    index.unique === true &&
    sameIndexKey(index.key, key) &&
    (!partialFilterExpression ||
      JSON.stringify(index.partialFilterExpression || null) === JSON.stringify(partialFilterExpression))
  ));
}

async function checkWeeklyFortuneWheelStorageReadiness({ connection } = {}) {
  try {
    if (!connection?.db) {
      return { ready: false, code: 'WEEKLY_DATABASE_NOT_CONNECTED' };
    }
    const [progressIndexes, entitlementIndexes, inventoryIndexes] = await Promise.all([
      safeIndexes(connection.db, 'fortune_wheel_progress'),
      safeIndexes(connection.db, 'fortune_wheel_prize_entitlements'),
      safeIndexes(connection.db, 'fortune_wheel_prize_inventory'),
    ]);
    if (hasUniqueIndex(progressIndexes, { campaignKey: 1, telegramId: 1 })) {
      return { ready: false, code: 'WEEKLY_LEGACY_PROGRESS_INDEX_ACTIVE' };
    }
    const required = [
      hasUniqueIndex(progressIndexes, { campaignKey: 1, telegramId: 1, weekKey: 1 }),
      hasUniqueIndex(
        progressIndexes,
        { campaignKey: 1, telegramId: 1, 'claims.idempotencyKey': 1 },
        { 'claims.idempotencyKey': { $type: 'string' } }
      ),
      hasUniqueIndex(entitlementIndexes, { campaignKey: 1, telegramId: 1, prizeCode: 1 }),
      hasUniqueIndex(entitlementIndexes, { campaignKey: 1, prizeCode: 1, slot: 1 }),
      hasUniqueIndex(entitlementIndexes, { progressId: 1 }),
      hasUniqueIndex(inventoryIndexes, { campaignKey: 1, prizeCode: 1 }),
    ];
    if (required.some((ready) => !ready)) {
      return { ready: false, code: 'WEEKLY_REQUIRED_INDEX_MISSING' };
    }
    const unknownLegacy = await connection.db.collection('fortune_wheel_progress').findOne({
      mode: 'legacy_fixed_v1',
      campaignKey: { $nin: LEGACY_CAMPAIGN_KEYS },
    });
    if (unknownLegacy) {
      return { ready: false, code: 'WEEKLY_UNKNOWN_LEGACY_CAMPAIGN' };
    }
    const ambiguousLegacy = await connection.db.collection('fortune_wheel_progress').aggregate([
      {
        $match: {
          campaignKey: { $in: LEGACY_CAMPAIGN_KEYS },
          'physicalPrizeReservation.slot': { $gt: 0 },
        },
      },
      { $group: { _id: '$telegramId', campaigns: { $addToSet: '$campaignKey' } } },
      { $match: { 'campaigns.1': { $exists: true } } },
      { $limit: 1 },
    ]).toArray();
    if (ambiguousLegacy.length > 0) {
      return { ready: false, code: 'WEEKLY_LEGACY_OWNERSHIP_AMBIGUOUS' };
    }
    const inventory = await connection.db.collection('fortune_wheel_prize_inventory').findOne({
      campaignKey: WEEKLY_CAMPAIGN_KEY,
      prizeCode: 'iphone_duo',
    });
    if (
      !inventory ||
      Number(inventory.capacity) !== IPHONE_DUO_CAMPAIGN_CAPACITY ||
      Number(inventory.reserved) < 0 ||
      Number(inventory.reserved) > IPHONE_DUO_CAMPAIGN_CAPACITY ||
      Number(inventory.fulfilled) < 0 ||
      Number(inventory.fulfilled) > Number(inventory.reserved) ||
      inventory.configVersion !== FORTUNE_WHEEL_WEEKLY_CONFIG_VERSION
    ) {
      return { ready: false, code: 'WEEKLY_INVENTORY_NOT_READY' };
    }
    return { ready: true, code: 'WEEKLY_STORAGE_READY', inventory };
  } catch (error) {
    return { ready: false, code: error?.code || 'WEEKLY_STORAGE_READINESS_FAILED' };
  }
}

async function checkWeeklyFortuneWheelReadiness({
  connection,
  environment = process.env,
  recoveryVersion = FORTUNE_WHEEL_ENTITLEMENT_LEDGER_RECOVERY_VERSION,
} = {}) {
  let mode;
  try {
    mode = getFortuneWheelMode(environment);
  } catch (error) {
    return { ready: false, mode: 'invalid', code: error.code };
  }
  if (mode !== WEEKLY_MODE) return { ready: false, mode, code: 'WEEKLY_MODE_DISABLED' };
  try {
    const isolation = createDeploymentIsolationConfig(environment);
    if (!isolation.staging) return { ready: false, mode, code: 'WEEKLY_STAGING_REQUIRED' };
    getFortuneWheelRandomSecret(environment);
    if (String(environment.FORTUNE_WHEEL_CAMPAIGN_KEY || '') !== WEEKLY_CAMPAIGN_KEY) {
      return { ready: false, mode, code: 'WEEKLY_CAMPAIGN_KEY_INVALID' };
    }
    if (String(environment.FORTUNE_WHEEL_CONFIG_VERSION || '') !== FORTUNE_WHEEL_WEEKLY_CONFIG_VERSION) {
      return { ready: false, mode, code: 'WEEKLY_CONFIG_VERSION_INVALID' };
    }
    if (recoveryVersion !== REQUIRED_RECOVERY_VERSION) {
      return { ready: false, mode, code: 'WEEKLY_ACCOUNT_RECOVERY_NOT_READY' };
    }
    if (!connection?.db || connection.name !== isolation.mongoDatabase) {
      return { ready: false, mode, code: 'WEEKLY_DATABASE_MISMATCH' };
    }

    const storageReadiness = await checkWeeklyFortuneWheelStorageReadiness({ connection });
    if (!storageReadiness.ready) return { ...storageReadiness, mode };
    return { ready: true, mode, code: 'WEEKLY_READY' };
  } catch (error) {
    return { ready: false, mode, code: error?.code || 'WEEKLY_READINESS_FAILED' };
  }
}

async function assertWeeklyFortuneWheelStartupReady(options) {
  if (getFortuneWheelMode(options?.environment) !== WEEKLY_MODE) return { skipped: true };
  const readiness = await checkWeeklyFortuneWheelReadiness(options);
  if (!readiness.ready) fail(readiness.code, 'Weekly Fortune Wheel startup readiness failed');
  return readiness;
}

function evaluateWeeklyEligibility({ user, config, readiness, now = new Date() }) {
  if (!readiness?.ready) return { eligible: false, code: readiness?.code || 'WEEKLY_NOT_READY' };
  if (!user) return { eligible: false, code: 'USER_NOT_FOUND' };
  if (user.isFrozen) return { eligible: false, code: 'USER_FROZEN' };
  if (!config.enabled) return { eligible: false, code: 'CAMPAIGN_DISABLED' };
  if (!config.approved) return { eligible: false, code: 'CAMPAIGN_NOT_APPROVED' };
  if (!config.validDateConfiguration) return { eligible: false, code: 'CAMPAIGN_CONFIGURATION_INVALID' };
  const time = now instanceof Date ? now.getTime() : Number(now);
  if (config.startsAt && time < config.startsAt.getTime()) return { eligible: false, code: 'CAMPAIGN_NOT_STARTED' };
  if (config.endsAt && time >= config.endsAt.getTime()) return { eligible: false, code: 'CAMPAIGN_ENDED' };
  if (!config.eligibleTelegramIds.has(String(user.telegramId || ''))) {
    return { eligible: false, code: 'NOT_OFFICIALLY_ELIGIBLE' };
  }
  return { eligible: true, code: 'ELIGIBLE' };
}

function serializeWeeklyClaim(claim) {
  return {
    spin: Number(claim.spin),
    rewardType: String(claim.rewardType || ''),
    amount: Number(claim.amount || 0),
    prizeCode: String(claim.prizeCode || ''),
    rewardCode: String(claim.rewardCode || ''),
    configVersion: String(claim.configVersion || ''),
    drawVersion: String(claim.drawVersion || ''),
    claimedAt: claim.claimedAt || null,
  };
}

function buildWeeklyFortuneWheelStatus({
  user,
  progress,
  inventory,
  playerHasPhysicalPrize,
  physicalPrizeRequests = [],
  weeklyEntitlement = null,
  hasWeeklyPhysicalPrizeRequest = false,
  config,
  readiness,
  now = new Date(),
}) {
  const week = getUtcWeekWindow(now);
  const used = Math.min(WEEKLY_SPINS_LIMIT, Math.max(0, Number(progress?.spinsUsed || 0)));
  const physicalPrizeAvailable = Boolean(
    readiness?.ready &&
    inventory &&
    Number(inventory.capacity) === IPHONE_DUO_CAMPAIGN_CAPACITY &&
    Number(inventory.reserved) < Number(inventory.capacity) &&
    !playerHasPhysicalPrize
  );
  const pool = buildEffectivePrizePool({
    physicalPrizeAvailable,
    playerHasPhysicalPrize,
  });
  const entitlementCampaignKey = String(weeklyEntitlement?.campaignKey || '');
  const entitlementModeMatches = (
    entitlementCampaignKey === WEEKLY_CAMPAIGN_KEY
      ? weeklyEntitlement?.sourceMode === WEEKLY_MODE
      : LEGACY_CAMPAIGN_KEYS.includes(entitlementCampaignKey) &&
        weeklyEntitlement?.sourceMode === LEGACY_MODE
  );
  const entitlementBelongsToPlayer = Boolean(
    weeklyEntitlement &&
    (entitlementCampaignKey === WEEKLY_CAMPAIGN_KEY || LEGACY_CAMPAIGN_KEYS.includes(entitlementCampaignKey)) &&
    String(weeklyEntitlement.telegramId || '') === String(user?.telegramId || '') &&
    weeklyEntitlement.prizeCode === 'iphone_duo' &&
    entitlementModeMatches &&
    ['reserved', 'fulfilled'].includes(String(weeklyEntitlement.status || '')) &&
    weeklyEntitlement.progressId
  );
  const requestCreated = Boolean(
    hasWeeklyPhysicalPrizeRequest || weeklyEntitlement?.physicalPrizeRequestId
  );
  const canSelectColor = Boolean(
    entitlementBelongsToPlayer && !requestCreated && config.iphoneColors.length > 0
  );
  return {
    mode: WEEKLY_MODE,
    campaignKey: WEEKLY_CAMPAIGN_KEY,
    enabled: Boolean(config.enabled && readiness?.ready),
    guaranteed: false,
    serverTime: now,
    weekKey: week.weekKey,
    resetsAt: week.resetsAt,
    eligibility: evaluateWeeklyEligibility({ user, config, readiness, now }),
    spins: { limit: WEEKLY_SPINS_LIMIT, used, remaining: WEEKLY_SPINS_LIMIT - used },
    claims: (progress?.claims || []).map(serializeWeeklyClaim),
    prizes: pool.map((prize) => ({
      code: prize.code,
      type: prize.type,
      amount: Number(prize.amount || 0),
      prizeCode: prize.prizeCode || '',
      configuredWeightPpm: prize.configuredWeightPpm,
      effectiveWeightPpm: prize.effectiveWeightPpm,
      available: prize.available,
    })),
    inventory: inventory ? {
      capacity: Number(inventory.capacity),
      reserved: Number(inventory.reserved),
      fulfilled: Number(inventory.fulfilled),
      remaining: Math.max(0, Number(inventory.capacity) - Number(inventory.reserved)),
    } : null,
    physicalPrize: {
      alreadyOwned: Boolean(playerHasPhysicalPrize),
      unlocked: entitlementBelongsToPlayer,
      canSelectColor,
      colors: canSelectColor ? [...config.iphoneColors] : [],
      requests: physicalPrizeRequests,
    },
  };
}

async function queryWithSession(query, session) {
  return typeof query?.session === 'function' ? query.session(session) : query;
}

async function findPhysicalPrizeOwnership({ telegramId, session, ProgressModel, EntitlementModel, RequestModel }) {
  const campaigns = [...LEGACY_CAMPAIGN_KEYS, WEEKLY_CAMPAIGN_KEY];
  const [
    weeklyEntitlement,
    legacyEntitlementResults,
    requestResults,
    reservationResults,
  ] = await Promise.all([
    queryWithSession(EntitlementModel.findOne({ telegramId, prizeCode: 'iphone_duo', campaignKey: WEEKLY_CAMPAIGN_KEY }), session),
    Promise.all(LEGACY_CAMPAIGN_KEYS.map((campaignKey) => queryWithSession(
      EntitlementModel.findOne({ telegramId, prizeCode: 'iphone_duo', campaignKey }), session
    ))),
    Promise.all(campaigns.map((campaignKey) => queryWithSession(
      RequestModel.findOne({ telegramId, prizeCode: 'iphone_duo', campaignKey }), session
    ))),
    Promise.all(campaigns.map((campaignKey) => queryWithSession(
      ProgressModel.findOne({
        telegramId,
        campaignKey,
        'physicalPrizeReservation.slot': { $gt: 0 },
      }), session
    ))),
  ]);
  const legacyEntitlements = legacyEntitlementResults.filter(Boolean);
  const requests = requestResults.filter(Boolean);
  const reservations = reservationResults.filter(Boolean);
  const legacyCampaigns = new Set([
    ...(legacyEntitlements || []).map((item) => String(item.campaignKey || '')),
    ...(requests || []).filter((item) => LEGACY_CAMPAIGN_KEYS.includes(String(item.campaignKey || '')))
      .map((item) => String(item.campaignKey || '')),
    ...(reservations || []).filter((item) => LEGACY_CAMPAIGN_KEYS.includes(String(item.campaignKey || '')))
      .map((item) => String(item.campaignKey || '')),
  ]);
  const ambiguousLegacyOwnership = legacyCampaigns.size > 1;
  const legacyEntitlement = ambiguousLegacyOwnership ? null : (legacyEntitlements || [])[0] || null;
  const request = (requests || [])[0] || null;
  const reservation = (reservations || [])[0] || null;
  return {
    owned: Boolean(weeklyEntitlement || (legacyEntitlements || []).length || request || reservation),
    ambiguousLegacyOwnership,
    legacyCampaignKeys: [...legacyCampaigns].sort(),
    entitlement: weeklyEntitlement || legacyEntitlement,
    weeklyEntitlement,
    legacyEntitlement,
    request,
    reservation,
  };
}

async function performWeeklyFortuneWheelSpin({
  telegramId,
  expectedSpin,
  idempotencyKey,
  config,
  readiness,
  session,
  secret,
  now = new Date(),
  UserModel,
  ProgressModel = FortuneWheelProgress,
  InventoryModel = FortuneWheelPrizeInventory,
  EntitlementModel = FortuneWheelPrizeEntitlement,
  RequestModel = PhysicalPrizeRequest,
  normalizeUser = () => {},
  creditOnix,
}) {
  const user = await queryWithSession(UserModel.findOne({ telegramId }), session);
  if (!user) return { status: 'not_found' };
  normalizeUser(user);
  if (user.isFrozen) return { status: 'frozen', user };
  const eligibility = evaluateWeeklyEligibility({ user, config, readiness, now });
  if (!eligibility.eligible) return { status: 'ineligible', code: eligibility.code, user };

  const week = getUtcWeekWindow(now);
  const replayProgress = await queryWithSession(ProgressModel.findOne({
    campaignKey: WEEKLY_CAMPAIGN_KEY,
    telegramId,
    'claims.idempotencyKey': idempotencyKey,
  }), session);
  if (replayProgress) {
    const replay = (replayProgress.claims || []).find(
      (claim) => String(claim.idempotencyKey || '') === idempotencyKey
    );
    if (!replay || Number(replay.spin) !== expectedSpin) {
      return { status: 'idempotency_conflict', user, progress: replayProgress };
    }
    return { status: 'success', idempotent: true, user, progress: replayProgress, claim: replay };
  }
  let progress = await queryWithSession(ProgressModel.findOne({
    campaignKey: WEEKLY_CAMPAIGN_KEY,
    telegramId,
    weekKey: week.weekKey,
  }), session);
  if (!progress) {
    if (expectedSpin !== 1) return { status: 'out_of_sequence', expectedSpin: 1, user };
    [progress] = await ProgressModel.create([{
      campaignKey: WEEKLY_CAMPAIGN_KEY,
      telegramId,
      mode: WEEKLY_MODE,
      schemaVersion: 2,
      weekKey: week.weekKey,
      weekStartsAt: week.startsAt,
      weekEndsAt: week.resetsAt,
      completedSpins: 0,
      spinsUsed: 0,
      claims: [],
    }], { session });
  }

  const claims = progress.claims || [];
  const replay = claims.find((claim) => String(claim.idempotencyKey || '') === idempotencyKey);
  if (replay) {
    if (Number(replay.spin) !== expectedSpin) return { status: 'idempotency_conflict', user, progress };
    return { status: 'success', idempotent: true, user, progress, claim: replay };
  }
  if (claims.some((claim) => Number(claim.spin) === expectedSpin)) {
    return { status: 'already_claimed', user, progress };
  }
  const used = Number(progress.spinsUsed || 0);
  if (used >= WEEKLY_SPINS_LIMIT) return { status: 'weekly_limit_reached', user, progress };
  if (expectedSpin !== used + 1) {
    return { status: 'out_of_sequence', expectedSpin: used + 1, user, progress };
  }

  const [inventory, ownership] = await Promise.all([
    queryWithSession(InventoryModel.findOne({ campaignKey: WEEKLY_CAMPAIGN_KEY, prizeCode: 'iphone_duo' }), session),
    findPhysicalPrizeOwnership({ telegramId, session, ProgressModel, EntitlementModel, RequestModel }),
  ]);
  if (ownership.ambiguousLegacyOwnership) {
    return { status: 'ineligible', code: 'LEGACY_PHYSICAL_PRIZE_OWNERSHIP_AMBIGUOUS', user };
  }
  let physicalPrizeAvailable = Boolean(
    inventory && Number(inventory.reserved) < Number(inventory.capacity) && !ownership.owned
  );
  let draw = drawWeeklyPrize({
    secret,
    campaignKey: WEEKLY_CAMPAIGN_KEY,
    weekKey: week.weekKey,
    telegramId,
    spin: expectedSpin,
    idempotencyKey,
    physicalPrizeAvailable,
    playerHasPhysicalPrize: ownership.owned,
  });
  let entitlement = null;
  if (draw.reward.type === 'physical_prize') {
    try {
      const reserved = await reservePhysicalPrizeEntitlement({
        campaignKey: WEEKLY_CAMPAIGN_KEY,
        telegramId,
        progressId: progress._id,
        weekKey: week.weekKey,
        session,
        now,
        InventoryModel,
        EntitlementModel,
        ProgressModel,
        PhysicalPrizeRequestModel: RequestModel,
      });
      if (reserved.alreadyEntitled) {
        draw = drawWeeklyPrize({
          secret,
          campaignKey: WEEKLY_CAMPAIGN_KEY,
          weekKey: week.weekKey,
          telegramId,
          spin: expectedSpin,
          idempotencyKey,
          physicalPrizeAvailable: false,
          playerHasPhysicalPrize: true,
        });
      } else {
        entitlement = reserved.entitlement;
      }
    } catch (error) {
      if (!(error instanceof FortuneWheelInventoryError) || error.code !== 'PHYSICAL_PRIZE_CAPACITY_EXHAUSTED') throw error;
      physicalPrizeAvailable = false;
      draw = drawWeeklyPrize({
        secret,
        campaignKey: WEEKLY_CAMPAIGN_KEY,
        weekKey: week.weekKey,
        telegramId,
        spin: expectedSpin,
        idempotencyKey,
        physicalPrizeAvailable: false,
        playerHasPhysicalPrize: ownership.owned,
      });
    }
  }

  const reward = draw.reward;
  const claim = {
    spin: expectedSpin,
    rewardType: reward.type,
    amount: reward.type === 'onix' ? reward.amount : 0,
    prizeCode: reward.prizeCode || '',
    rewardCode: reward.code,
    configVersion: FORTUNE_WHEEL_WEEKLY_CONFIG_VERSION,
    drawVersion: FORTUNE_WHEEL_DRAW_VERSION,
    idempotencyKey,
    claimedAt: now,
  };
  const update = {
    $inc: { completedSpins: 1, spinsUsed: 1 },
    $push: { claims: claim },
  };
  if (entitlement) {
    update.$set = {
      physicalPrizeEntitlementId: entitlement._id,
      iphoneUnlockedAt: now,
      physicalPrizeReservation: {
        slot: entitlement.slot,
        reservedAt: entitlement.reservedAt,
        status: entitlement.status,
      },
    };
  }
  const updatedProgress = await ProgressModel.findOneAndUpdate(
    {
      _id: progress._id,
      campaignKey: WEEKLY_CAMPAIGN_KEY,
      telegramId,
      weekKey: week.weekKey,
      spinsUsed: expectedSpin - 1,
      'claims.spin': { $ne: expectedSpin },
      'claims.idempotencyKey': { $ne: idempotencyKey },
    },
    update,
    { new: true, runValidators: true, session }
  );
  if (!updatedProgress) {
    fail(
      'CONCURRENT_SPIN_CONFLICT',
      'Weekly spin state changed after prize selection; the transaction must be retried'
    );
  }

  let bonuses = { achievementBonuses: [], rankBonuses: [] };
  if (reward.type === 'onix') {
    if (typeof creditOnix !== 'function') fail('WEEKLY_ECONOMY_ADAPTER_MISSING', 'Weekly ONIX credit adapter is required');
    bonuses = await creditOnix({ user, amount: reward.amount, session, now, expectedSpin });
  }
  return {
    status: 'success', idempotent: false, user, progress: updatedProgress, claim,
    entitlement, ...bonuses,
  };
}

async function performWeeklyIphoneColorSelection({
  telegramId,
  color,
  idempotencyKey,
  config,
  session,
  now = new Date(),
  UserModel,
  ProgressModel = FortuneWheelProgress,
  EntitlementModel = FortuneWheelPrizeEntitlement,
  RequestModel = PhysicalPrizeRequest,
  legacySelection,
}) {
  const user = await queryWithSession(UserModel.findOne({ telegramId }), session);
  if (!user) return { status: 'not_found' };
  if (user.isFrozen) return { status: 'frozen', user };
  const compatibility = await lookupPhysicalPrizeRequestsForCompatibility({
    collection: RequestModel.collection,
    telegramId,
    activeCampaignKey: WEEKLY_CAMPAIGN_KEY,
    session,
  });
  if (compatibility.ambiguousLegacyCampaigns) {
    return { status: 'legacy_ownership_ambiguous', user };
  }
  const existing = compatibility.activeRequests[0] || compatibility.legacyRequests[0] || null;
  if (existing) {
    if (String(existing.color || '') !== color) return { status: 'color_locked', user, request: existing };
    return { status: 'success', idempotent: true, user, request: existing };
  }
  if (!config.iphoneColors.includes(color)) return { status: 'invalid_color', code: 'INVALID_IPHONE_COLOR', user };

  const entitlement = await queryWithSession(EntitlementModel.findOne({
    campaignKey: WEEKLY_CAMPAIGN_KEY,
    telegramId,
    prizeCode: 'iphone_duo',
  }), session);
  if (!entitlement) {
    if (typeof legacySelection !== 'function') return { status: 'iphone_not_unlocked', user };
    const legacyEntitlements = await queryWithSession(EntitlementModel.find({
      campaignKey: { $in: LEGACY_CAMPAIGN_KEYS },
      telegramId,
      prizeCode: 'iphone_duo',
    }), session);
    const legacyCampaignKeys = [...new Set((legacyEntitlements || []).map(
      (item) => String(item.campaignKey || '')
    ))];
    if (legacyCampaignKeys.length > 1) return { status: 'legacy_ownership_ambiguous', user };
    if (legacyCampaignKeys.length === 0) return { status: 'iphone_not_unlocked', user };
    return legacySelection(legacyCampaignKeys[0]);
  }
  const progress = await queryWithSession(ProgressModel.findOne({ _id: entitlement.progressId, telegramId }), session);
  if (!progress || entitlement.physicalPrizeRequestId || progress.physicalPrizeRequestId) {
    return { status: 'request_state_inconsistent', user, progress };
  }
  const requestObjectId = new mongoose.Types.ObjectId();
  const requestId = require('crypto').randomUUID();
  const updatedEntitlement = await EntitlementModel.findOneAndUpdate(
    { _id: entitlement._id, telegramId, physicalPrizeRequestId: null },
    { $set: { physicalPrizeRequestId: requestObjectId, updatedAt: now } },
    { new: true, runValidators: true, session }
  );
  if (!updatedEntitlement) return { status: 'concurrent_conflict', user, progress };
  const updatedProgress = await ProgressModel.findOneAndUpdate(
    { _id: progress._id, telegramId, physicalPrizeRequestId: null },
    { $set: { physicalPrizeRequestId: requestObjectId } },
    { new: true, runValidators: true, session }
  );
  if (!updatedProgress) {
    fail(
      'CONCURRENT_PHYSICAL_PRIZE_CONFLICT',
      'Physical prize state changed after entitlement update; the transaction must be retried'
    );
  }
  const [request] = await RequestModel.create([{
    _id: requestObjectId,
    requestId,
    idempotencyKey,
    fortuneWheelProgressId: progress._id,
    campaignKey: WEEKLY_CAMPAIGN_KEY,
    telegramId,
    prizeCode: 'iphone_duo',
    color,
    status: 'pending',
    statusHistory: [{ action: 'created', status: 'pending', color, changedAt: now, changedBy: 'player', comment: '' }],
    telegramUsernameSnapshot: user.telegramUsername || user.username || '',
    displayNameSnapshot: [user.firstName, user.lastName].filter(Boolean).join(' '),
  }], { session });
  return { status: 'success', idempotent: false, user, progress: updatedProgress, request };
}

module.exports = {
  APPROVED_WEEKLY_CONFIG,
  FortuneWheelWeeklyApiError,
  LEGACY_CAMPAIGN_KEY,
  LEGACY_CAMPAIGN_KEYS,
  LEGACY_MODE,
  WEEKLY_CAMPAIGN_KEY,
  WEEKLY_MODE,
  assertWeeklyFortuneWheelStartupReady,
  buildWeeklyFortuneWheelStatus,
  checkWeeklyFortuneWheelReadiness,
  checkWeeklyFortuneWheelStorageReadiness,
  evaluateWeeklyEligibility,
  findPhysicalPrizeOwnership,
  getFortuneWheelMode,
  performWeeklyFortuneWheelSpin,
  performWeeklyIphoneColorSelection,
  serializeWeeklyClaim,
};
