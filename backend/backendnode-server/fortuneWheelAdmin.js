const {
  APPROVED_WEEKLY_CONFIG,
  buildEffectivePrizePool,
  getUtcWeekWindow,
} = require('./fortuneWheelWeekly');
const {
  LEGACY_CAMPAIGN_KEYS,
  LEGACY_MODE,
  WEEKLY_CAMPAIGN_KEY,
  WEEKLY_MODE,
} = require('./fortuneWheelWeeklyApi');

const ADMIN_ENTITLEMENT_STATUSES = Object.freeze(['reserved', 'fulfilled', 'awaiting_color']);
const CAMPAIGN_KEYS = new Set([...LEGACY_CAMPAIGN_KEYS, WEEKLY_CAMPAIGN_KEY]);
const SAFE_WEEK_KEY = /^\d{4}-\d{2}-\d{2}$/;

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeAdminFortuneWheelQuery(query = {}, now = new Date()) {
  const campaignKey = String(query.campaignKey || WEEKLY_CAMPAIGN_KEY).trim();
  const weekKey = String(query.weekKey || '').trim();
  const rawStatus = String(query.entitlementStatus || '').trim().toLowerCase();
  const entitlementStatus = rawStatus === 'all' ? '' : rawStatus;
  const search = String(query.entitlementSearch || '').trim();
  const page = Math.max(1, Math.trunc(Number(query.entitlementPage) || 1));
  const limit = Math.min(50, Math.max(1, Math.trunc(Number(query.entitlementLimit) || 20)));

  if (!CAMPAIGN_KEYS.has(campaignKey)) {
    return { ok: false, code: 'INVALID_FORTUNE_WHEEL_CAMPAIGN' };
  }
  if (weekKey && !SAFE_WEEK_KEY.test(weekKey)) {
    return { ok: false, code: 'INVALID_FORTUNE_WHEEL_WEEK' };
  }
  if (LEGACY_CAMPAIGN_KEYS.includes(campaignKey) && weekKey) {
    return { ok: false, code: 'LEGACY_CAMPAIGN_HAS_NO_WEEK' };
  }
  if (entitlementStatus && !ADMIN_ENTITLEMENT_STATUSES.includes(entitlementStatus)) {
    return { ok: false, code: 'INVALID_ENTITLEMENT_STATUS' };
  }
  if (search.length > 64) {
    return { ok: false, code: 'ENTITLEMENT_SEARCH_TOO_LONG' };
  }

  const currentWeek = getUtcWeekWindow(now);
  return {
    ok: true,
    campaignKey,
    weekKey: campaignKey === WEEKLY_CAMPAIGN_KEY ? (weekKey || currentWeek.weekKey) : '',
    entitlementStatus,
    search,
    page,
    limit,
    currentWeek,
  };
}

function buildProgressStatsPipeline({ campaignKey, weekKey }) {
  const match = { campaignKey };
  if (weekKey) match.weekKey = weekKey;
  return [
    { $match: match },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: '$telegramId',
              spinsUsed: { $sum: { $ifNull: ['$spinsUsed', '$completedSpins'] } },
            },
          },
          {
            $group: {
              _id: null,
              uniquePlayers: { $sum: 1 },
              spinsUsed: { $sum: '$spinsUsed' },
            },
          },
        ],
        rewards: [
          { $unwind: '$claims' },
          {
            $group: {
              _id: {
                $cond: [
                  { $gt: [{ $strLenCP: { $ifNull: ['$claims.rewardCode', ''] } }, 0] },
                  '$claims.rewardCode',
                  {
                    $switch: {
                      branches: [
                        { case: { $eq: ['$claims.rewardType', 'physical_prize'] }, then: 'iphone_duo' },
                        { case: { $eq: ['$claims.amount', 5000] }, then: 'onix_5000' },
                        { case: { $eq: ['$claims.amount', 10000] }, then: 'onix_10000' },
                        { case: { $eq: ['$claims.amount', 25000] }, then: 'onix_25000' },
                        { case: { $eq: ['$claims.amount', 50000] }, then: 'onix_50000' },
                        { case: { $eq: ['$claims.amount', 250000] }, then: 'onix_250000' },
                      ],
                      default: 'unknown',
                    },
                  },
                ],
              },
              count: { $sum: 1 },
              totalOnix: {
                $sum: {
                  $cond: [{ $eq: ['$claims.rewardType', 'onix'] }, '$claims.amount', 0],
                },
              },
            },
          },
          { $sort: { _id: 1 } },
        ],
      },
    },
  ];
}

function normalizeProgressStats(aggregation = []) {
  const facet = aggregation[0] || {};
  const summary = facet.summary?.[0] || {};
  const rewards = (facet.rewards || []).map((reward) => ({
    rewardCode: String(reward._id || 'unknown'),
    count: Number(reward.count || 0),
    totalOnix: Number(reward.totalOnix || 0),
  }));
  return {
    uniquePlayers: Number(summary.uniquePlayers || 0),
    spinsUsed: Number(summary.spinsUsed || 0),
    totalOnix: rewards.reduce((sum, reward) => sum + reward.totalOnix, 0),
    rewards,
  };
}

function buildEntitlementFilter(normalized) {
  const filter = { campaignKey: normalized.campaignKey, prizeCode: 'iphone_duo' };
  if (normalized.weekKey) filter.weekKey = normalized.weekKey;
  if (normalized.entitlementStatus && normalized.entitlementStatus !== 'awaiting_color') {
    filter.status = normalized.entitlementStatus;
  }
  if (normalized.search) {
    filter.telegramId = new RegExp(`^${escapeRegExp(normalized.search)}`);
  }
  if (normalized.entitlementStatus === 'awaiting_color') {
    filter.status = 'reserved';
    filter.physicalPrizeRequestId = null;
  }
  return filter;
}

function serializeAdminEntitlement(entitlement, { request = null, user = null } = {}) {
  const source = typeof entitlement?.toObject === 'function'
    ? entitlement.toObject({ flattenMaps: true })
    : entitlement || {};
  return {
    id: String(source._id || ''),
    telegramId: String(source.telegramId || ''),
    telegramUsername: String(
      request?.telegramUsernameSnapshot || user?.telegramUsername || user?.username || ''
    ),
    campaignKey: String(source.campaignKey || ''),
    weekKey: String(source.weekKey || 'legacy'),
    prizeCode: String(source.prizeCode || ''),
    slot: Number(source.slot || 0),
    status: String(source.status || 'reserved'),
    color: String(request?.color || ''),
    requestId: String(request?.requestId || ''),
    requestStatus: String(request?.status || ''),
    wonAt: source.reservedAt || source.createdAt || null,
    fulfilledAt: source.fulfilledAt || null,
    awaitingColor: !source.physicalPrizeRequestId && !request,
  };
}

function buildCampaignDashboard({
  normalized,
  aggregation,
  inventory,
  campaignConfig,
  mode,
  storageReadiness,
  now = new Date(),
}) {
  const stats = normalizeProgressStats(aggregation);
  const weekly = normalized.campaignKey === WEEKLY_CAMPAIGN_KEY;
  const capacity = Number(inventory?.capacity || 0);
  const reserved = Number(inventory?.reserved || 0);
  const fulfilled = Number(inventory?.fulfilled || 0);
  const physicalPrizeAvailable = Boolean(inventory && reserved < capacity);
  const configuredProbabilities = weekly
    ? APPROVED_WEEKLY_CONFIG.prizes.map((prize) => ({
        rewardCode: prize.code,
        type: prize.type,
        amount: Number(prize.amount || 0),
        weightPpm: prize.weightPpm,
      }))
    : [];
  const effectiveProbabilities = weekly
    ? buildEffectivePrizePool({ physicalPrizeAvailable, playerHasPhysicalPrize: false }).map((prize) => ({
        rewardCode: prize.code,
        effectiveWeightPpm: prize.effectiveWeightPpm,
        available: prize.available,
      }))
    : [];
  const nowTime = now instanceof Date ? now.getTime() : Number(now);
  const selectedInEnvironment = campaignConfig.campaignKey === normalized.campaignKey;
  const dateActive = campaignConfig.validDateConfiguration &&
    (!campaignConfig.startsAt || nowTime >= campaignConfig.startsAt.getTime()) &&
    (!campaignConfig.endsAt || nowTime < campaignConfig.endsAt.getTime());
  const active = selectedInEnvironment && campaignConfig.enabled && campaignConfig.approved && dateActive &&
    (!weekly || mode === WEEKLY_MODE);

  return {
    campaignKey: normalized.campaignKey,
    mode: weekly ? WEEKLY_MODE : LEGACY_MODE,
    active,
    enabled: selectedInEnvironment && campaignConfig.enabled,
    approved: selectedInEnvironment && campaignConfig.approved,
    startsAt: selectedInEnvironment ? campaignConfig.startsAt : null,
    endsAt: selectedInEnvironment ? campaignConfig.endsAt : null,
    week: weekly ? {
      weekKey: normalized.weekKey,
      currentWeekKey: normalized.currentWeek.weekKey,
      startsAt: normalized.weekKey === normalized.currentWeek.weekKey ? normalized.currentWeek.startsAt : null,
      resetsAt: normalized.weekKey === normalized.currentWeek.weekKey ? normalized.currentWeek.resetsAt : null,
    } : null,
    readiness: weekly ? storageReadiness : { ready: true, code: 'LEGACY_READY' },
    stats,
    configuredProbabilities,
    effectiveProbabilities,
    inventory: weekly ? {
      exists: Boolean(inventory),
      capacity,
      reserved,
      fulfilled,
      remaining: Math.max(0, capacity - reserved),
      configVersion: String(inventory?.configVersion || ''),
    } : null,
  };
}

module.exports = {
  ADMIN_ENTITLEMENT_STATUSES,
  buildAdminFortuneWheelDashboard: buildCampaignDashboard,
  buildEntitlementFilter,
  buildProgressStatsPipeline,
  normalizeAdminFortuneWheelQuery,
  normalizeProgressStats,
  serializeAdminEntitlement,
};
