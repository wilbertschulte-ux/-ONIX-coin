const ANALYTICS_FUNNEL_EVENTS = [
  'landing',
  'start',
  'active',
  'first_tap',
  'first_task',
  'promo_used',
  'referral',
  'withdrawal',
];

const ANALYTICS_DEFAULT_PERIOD_DAYS = 30;
const ANALYTICS_MAX_PERIOD_DAYS = 180;
const ANALYTICS_CAMPAIGN_LIMIT = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

function sanitizeExactFilter(value, maxLength) {
  const normalized = String(value || '').trim();
  return normalized && normalized.length <= maxLength ? normalized : '';
}

function parseDate(value, endOfDay = false) {
  if (!value) return null;
  const raw = String(value);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    date.setUTCHours(23, 59, 59, 999);
  }
  return date;
}

function buildAnalyticsDashboardMatch(query = {}, now = new Date()) {
  const nowDate = new Date(now);
  const requestedTo = parseDate(query.to, true);
  const to = requestedTo && requestedTo < nowDate ? requestedTo : nowDate;
  const earliestAllowed = new Date(to.getTime() - ANALYTICS_MAX_PERIOD_DAYS * DAY_MS);
  const requestedFrom = parseDate(query.from);
  const defaultFrom = new Date(to.getTime() - ANALYTICS_DEFAULT_PERIOD_DAYS * DAY_MS);
  const fromCandidate = requestedFrom && requestedFrom <= to ? requestedFrom : defaultFrom;
  const from = fromCandidate < earliestAllowed ? earliestAllowed : fromCandidate;

  const match = {
    occurredAt: { $gte: from, $lte: to },
  };
  const campaign = sanitizeExactFilter(query.campaign, 48);
  const source = sanitizeExactFilter(query.source, 64);
  const market = sanitizeExactFilter(query.market, 8);
  if (campaign) match.campaign = campaign;
  if (source) match.source = source;
  if (market) match.market = market;

  return { match, from, to };
}

function uniqueUsersProjection(field) {
  return { $size: { $setDifference: [field, [null]] } };
}

function buildAnalyticsDashboardPipeline(match) {
  const campaignUserSet = (event) => ({
    $addToSet: {
      $cond: [{ $eq: ['$event', event] }, '$telegramId', null],
    },
  });

  return [
    { $match: match },
    {
      $facet: {
        totals: [
          { $group: { _id: null, events: { $sum: 1 }, userIds: { $addToSet: '$telegramId' } } },
          { $project: { _id: 0, events: 1, users: { $size: '$userIds' } } },
        ],
        byEvent: [
          { $group: { _id: '$event', events: { $sum: 1 }, userIds: { $addToSet: '$telegramId' } } },
          { $project: { _id: 0, event: '$_id', events: 1, users: { $size: '$userIds' } } },
          { $sort: { event: 1 } },
        ],
        byCampaign: [
          { $group: { _id: '$campaign', events: { $sum: 1 }, userIds: { $addToSet: '$telegramId' } } },
          { $project: { _id: 0, campaign: '$_id', events: 1, users: { $size: '$userIds' } } },
          { $sort: { users: -1, campaign: 1 } },
          { $limit: ANALYTICS_CAMPAIGN_LIMIT },
        ],
        campaignComparison: [
          {
            $group: {
              _id: '$campaign',
              userIds: { $addToSet: '$telegramId' },
              activeUserIds: campaignUserSet('active'),
              firstTapUserIds: campaignUserSet('first_tap'),
              firstTaskUserIds: campaignUserSet('first_task'),
              promoUsedUserIds: campaignUserSet('promo_used'),
              referralUserIds: campaignUserSet('referral'),
              withdrawalUserIds: campaignUserSet('withdrawal'),
            },
          },
          {
            $project: {
              _id: 0,
              campaign: '$_id',
              users: { $size: '$userIds' },
              active: uniqueUsersProjection('$activeUserIds'),
              firstTap: uniqueUsersProjection('$firstTapUserIds'),
              firstTask: uniqueUsersProjection('$firstTaskUserIds'),
              promoUsed: uniqueUsersProjection('$promoUsedUserIds'),
              referral: uniqueUsersProjection('$referralUserIds'),
              withdrawal: uniqueUsersProjection('$withdrawalUserIds'),
            },
          },
          { $sort: { users: -1, campaign: 1 } },
          { $limit: ANALYTICS_CAMPAIGN_LIMIT },
        ],
      },
    },
  ];
}

function formatAnalyticsDashboardResult(facetResult, from, to) {
  const result = facetResult?.[0] || {};
  const byEvent = Array.isArray(result.byEvent) ? result.byEvent : [];
  const eventMap = new Map(byEvent.map((item) => [item.event, item]));

  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    totals: result.totals?.[0] || { events: 0, users: 0 },
    byEvent,
    byCampaign: Array.isArray(result.byCampaign) ? result.byCampaign : [],
    funnel: ANALYTICS_FUNNEL_EVENTS.map((event) => ({
      event,
      events: Number(eventMap.get(event)?.events || 0),
      users: Number(eventMap.get(event)?.users || 0),
    })),
    campaigns: Array.isArray(result.campaignComparison) ? result.campaignComparison : [],
  };
}

module.exports = {
  ANALYTICS_CAMPAIGN_LIMIT,
  ANALYTICS_DEFAULT_PERIOD_DAYS,
  ANALYTICS_FUNNEL_EVENTS,
  ANALYTICS_MAX_PERIOD_DAYS,
  buildAnalyticsDashboardMatch,
  buildAnalyticsDashboardPipeline,
  formatAnalyticsDashboardResult,
};
