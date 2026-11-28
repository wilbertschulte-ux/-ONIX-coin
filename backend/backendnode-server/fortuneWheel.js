const FortuneWheelProgress = require('./models/FortuneWheelProgress');

const DEFAULT_CAMPAIGN_KEY = 'fortune-wheel-v1';
const MAX_PHYSICAL_PRIZE_CAPACITY = 10000;
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

const FORTUNE_WHEEL_REWARDS = Object.freeze([
  Object.freeze({ spin: 1, type: 'onix', amount: 50000 }),
  Object.freeze({ spin: 2, type: 'onix', amount: 250000 }),
  Object.freeze({ spin: 3, type: 'physical_prize', prizeCode: 'iphone_duo' }),
]);

function envFlag(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function parseOptionalDate(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const time = Date.parse(text);
  return Number.isFinite(time) ? new Date(time) : null;
}

function parseTelegramIdAllowlist(value) {
  return new Set(
    String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter((item) => /^\d{1,32}$/.test(item))
  );
}

function parseColorAllowlist(value) {
  return Object.freeze(
    [...new Set(
      String(value || '')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter((item) => /^[a-z0-9][a-z0-9_-]{0,31}$/.test(item))
    )]
  );
}

function getFortuneWheelCampaignConfig(environment = process.env) {
  const configuredKey = String(environment.FORTUNE_WHEEL_CAMPAIGN_KEY || '').trim();
  const campaignKey = /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(configuredKey)
    ? configuredKey
    : DEFAULT_CAMPAIGN_KEY;
  const rawCapacity = Number(environment.FORTUNE_WHEEL_PHYSICAL_PRIZE_CAPACITY || 0);
  const physicalPrizeCapacity = Number.isInteger(rawCapacity)
    ? Math.min(MAX_PHYSICAL_PRIZE_CAPACITY, Math.max(0, rawCapacity))
    : 0;
  const startsAtRaw = String(environment.FORTUNE_WHEEL_STARTS_AT || '').trim();
  const endsAtRaw = String(environment.FORTUNE_WHEEL_ENDS_AT || '').trim();
  const startsAt = parseOptionalDate(startsAtRaw);
  const endsAt = parseOptionalDate(endsAtRaw);

  return Object.freeze({
    campaignKey,
    enabled: envFlag(environment.FORTUNE_WHEEL_ENABLED),
    approved: envFlag(environment.FORTUNE_WHEEL_CAMPAIGN_APPROVED),
    physicalPrizeCapacity,
    eligibleTelegramIds: parseTelegramIdAllowlist(
      environment.FORTUNE_WHEEL_ELIGIBLE_TELEGRAM_IDS
    ),
    iphoneColors: parseColorAllowlist(environment.FORTUNE_WHEEL_IPHONE_COLORS),
    startsAt,
    endsAt,
    validDateConfiguration:
      (!startsAtRaw || Boolean(startsAt)) &&
      (!endsAtRaw || Boolean(endsAt)) &&
      (!startsAt || !endsAt || startsAt.getTime() < endsAt.getTime()),
  });
}

function hasPhysicalPrizeReservation(progress) {
  return Number(progress?.physicalPrizeReservation?.slot || 0) > 0;
}

function hasUnlockedPhysicalPrizeEntitlement(progress) {
  return Boolean(
    progress &&
    hasPhysicalPrizeReservation(progress) &&
    Number(progress.completedSpins || 0) === 3 &&
    progress.iphoneUnlockedAt &&
    (progress.claims || []).some(
      (claim) => Number(claim.spin) === 3 &&
        claim.rewardType === 'physical_prize' &&
        claim.prizeCode === 'iphone_duo'
    )
  );
}

function evaluatePhysicalPrizeCompletionEligibility({ user, progress, config }) {
  if (!user) return { eligible: false, code: 'USER_NOT_FOUND' };
  if (user.isFrozen) return { eligible: false, code: 'USER_FROZEN' };
  if (!hasUnlockedPhysicalPrizeEntitlement(progress)) {
    return { eligible: false, code: 'IPHONE_NOT_UNLOCKED' };
  }
  if (!config || config.iphoneColors.length === 0) {
    return { eligible: false, code: 'IPHONE_COLORS_NOT_CONFIGURED' };
  }
  return { eligible: true, code: 'PHYSICAL_PRIZE_COMPLETION_AVAILABLE' };
}

function getConfiguredReservationSlot(config, telegramId) {
  const position = [...config.eligibleTelegramIds].indexOf(String(telegramId || ''));
  if (position < 0 || position >= config.physicalPrizeCapacity) return null;
  return position + 1;
}

function evaluateFortuneWheelEligibility({
  telegramId,
  user,
  progress,
  config = getFortuneWheelCampaignConfig(),
  now = new Date(),
}) {
  if (!user) return { eligible: false, code: 'USER_NOT_FOUND' };
  if (user.isFrozen) return { eligible: false, code: 'USER_FROZEN' };

  const hasReservation = hasPhysicalPrizeReservation(progress);

  if (!config.enabled) {
    return { eligible: false, admitted: hasReservation, code: 'CAMPAIGN_DISABLED' };
  }
  if (!config.approved) {
    return { eligible: false, admitted: hasReservation, code: 'CAMPAIGN_NOT_APPROVED' };
  }
  if (!config.validDateConfiguration) {
    return { eligible: false, admitted: hasReservation, code: 'CAMPAIGN_CONFIGURATION_INVALID' };
  }

  const nowTime = now instanceof Date ? now.getTime() : Number(now);
  if (config.startsAt && nowTime < config.startsAt.getTime()) {
    return { eligible: false, admitted: hasReservation, code: 'CAMPAIGN_NOT_STARTED' };
  }
  if (config.endsAt && nowTime >= config.endsAt.getTime()) {
    return { eligible: false, admitted: hasReservation, code: 'CAMPAIGN_ENDED' };
  }

  if (hasReservation) {
    return { eligible: true, admitted: true, code: 'ELIGIBLE' };
  }
  if (!config.eligibleTelegramIds.has(String(telegramId || ''))) {
    return { eligible: false, admitted: false, code: 'NOT_OFFICIALLY_ELIGIBLE' };
  }
  if (!getConfiguredReservationSlot(config, telegramId)) {
    return { eligible: false, admitted: false, code: 'NO_PHYSICAL_PRIZE_CAPACITY' };
  }
  if (config.iphoneColors.length === 0) {
    return { eligible: false, admitted: false, code: 'IPHONE_COLORS_NOT_CONFIGURED' };
  }

  return { eligible: true, admitted: false, code: 'RESERVATION_AVAILABLE' };
}

function rewardStatus(reward, completedSpins) {
  if (reward.spin <= completedSpins) return 'claimed';
  if (reward.spin === completedSpins + 1) return 'available';
  return 'locked';
}

function getFortuneWheelReward(expectedSpin) {
  return FORTUNE_WHEEL_REWARDS.find((reward) => reward.spin === Number(expectedSpin)) || null;
}

function validateSpinRequest({ expectedSpin, idempotencyKey }) {
  const spin = Number(expectedSpin);
  const key = String(idempotencyKey || '').trim();

  if (!Number.isInteger(spin) || spin < 1 || spin > FORTUNE_WHEEL_REWARDS.length) {
    return { ok: false, code: 'INVALID_EXPECTED_SPIN' };
  }
  if (
    key.length > MAX_IDEMPOTENCY_KEY_LENGTH ||
    !IDEMPOTENCY_KEY_PATTERN.test(key)
  ) {
    return { ok: false, code: 'INVALID_IDEMPOTENCY_KEY' };
  }
  return { ok: true, expectedSpin: spin, idempotencyKey: key };
}

function validateIphoneColorRequest({ color, idempotencyKey }, config) {
  const normalizedColor = String(color || '').trim().toLowerCase();
  const key = String(idempotencyKey || '').trim();

  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    return { ok: false, code: 'INVALID_IDEMPOTENCY_KEY' };
  }
  if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(normalizedColor)) {
    return { ok: false, code: 'INVALID_IPHONE_COLOR' };
  }
  return {
    ok: true,
    color: normalizedColor,
    idempotencyKey: key,
    colorAllowed: config.iphoneColors.includes(normalizedColor),
  };
}

function serializePhysicalPrizeRequest(request) {
  if (!request) return null;
  return {
    requestId: String(request.requestId || ''),
    campaignKey: String(request.campaignKey || ''),
    prizeCode: String(request.prizeCode || ''),
    color: String(request.color || ''),
    status: String(request.status || 'pending'),
    createdAt: request.createdAt || null,
    statusHistory: (request.statusHistory || []).map((entry) => ({
      status: String(entry.status || ''),
      changedAt: entry.changedAt || null,
    })),
  };
}

function buildFortuneWheelStatus({ user, progress, physicalPrizeRequest, config, now = new Date() }) {
  const campaignConfig = config || getFortuneWheelCampaignConfig();
  const completedSpins = Math.min(3, Math.max(0, Number(progress?.completedSpins || 0)));
  const eligibility = evaluateFortuneWheelEligibility({
    telegramId: user?.telegramId,
    user,
    progress,
    config: campaignConfig,
    now,
  });
  const completionEligibility = evaluatePhysicalPrizeCompletionEligibility({
    user,
    progress,
    config: campaignConfig,
  });
  const requestCreated = Boolean(progress?.physicalPrizeRequestId || physicalPrizeRequest);
  const canSelectColor = Boolean(completionEligibility.eligible && !requestCreated);

  return {
    campaignKey: campaignConfig.campaignKey,
    enabled: campaignConfig.enabled,
    guaranteed: true,
    eligibility,
    completedSpins,
    nextSpin: completedSpins < 3 ? completedSpins + 1 : null,
    rewards: FORTUNE_WHEEL_REWARDS.map((reward) => ({
      ...reward,
      status: rewardStatus(reward, completedSpins),
    })),
    physicalPrize: {
      reserved: hasPhysicalPrizeReservation(progress),
      unlocked: Boolean(progress?.iphoneUnlockedAt),
      requestCreated,
      selectionLocked: Boolean(physicalPrizeRequest),
      canSelectColor,
      colors: canSelectColor ? [...campaignConfig.iphoneColors] : [],
      request: serializePhysicalPrizeRequest(physicalPrizeRequest),
    },
  };
}

// The spin endpoint calls this helper inside the same MongoDB transaction as
// the first reward so a failed reward cannot consume a physical-prize slot.
async function reserveFortuneWheelEntry({
  user,
  session,
  config = getFortuneWheelCampaignConfig(),
  now = new Date(),
  ProgressModel = FortuneWheelProgress,
}) {
  if (!session) throw new Error('Fortune wheel reservation requires a MongoDB session');

  let existingQuery = ProgressModel.findOne({
    campaignKey: config.campaignKey,
    telegramId: String(user?.telegramId || ''),
  });
  if (typeof existingQuery.session === 'function') existingQuery = existingQuery.session(session);
  const existing = await existingQuery;
  if (existing) return { created: false, progress: existing };

  const eligibility = evaluateFortuneWheelEligibility({
    telegramId: user?.telegramId,
    user,
    progress: null,
    config,
    now,
  });
  if (!eligibility.eligible) return { created: false, progress: null, eligibility };

  const slot = getConfiguredReservationSlot(config, user.telegramId);
  let reservationQuery = ProgressModel.findOneAndUpdate(
    {
      campaignKey: config.campaignKey,
      telegramId: String(user.telegramId),
    },
    {
      $setOnInsert: {
          campaignKey: config.campaignKey,
          telegramId: String(user.telegramId),
          completedSpins: 0,
          claims: [],
          physicalPrizeReservation: {
            slot,
            reservedAt: now,
            status: 'reserved',
          },
      },
    },
    {
      new: true,
      upsert: true,
      session,
      setDefaultsOnInsert: true,
      includeResultMetadata: true,
    }
  );
  if (typeof reservationQuery.session === 'function') {
    reservationQuery = reservationQuery.session(session);
  }
  const reservationResult = await reservationQuery;
  const progress = reservationResult?.value || reservationResult;
  const created = reservationResult?.lastErrorObject
    ? reservationResult.lastErrorObject.updatedExisting === false
    : false;

  return { created, progress };
}

module.exports = {
  DEFAULT_CAMPAIGN_KEY,
  FORTUNE_WHEEL_REWARDS,
  buildFortuneWheelStatus,
  evaluateFortuneWheelEligibility,
  evaluatePhysicalPrizeCompletionEligibility,
  getConfiguredReservationSlot,
  getFortuneWheelCampaignConfig,
  getFortuneWheelReward,
  hasPhysicalPrizeReservation,
  hasUnlockedPhysicalPrizeEntitlement,
  reserveFortuneWheelEntry,
  serializePhysicalPrizeRequest,
  validateIphoneColorRequest,
  validateSpinRequest,
};
