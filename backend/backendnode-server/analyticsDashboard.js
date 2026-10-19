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

const ANALYTICS_COHORT_EVENTS = [
  'start',
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

function buildCohortFacet() {
  const reached = (event) => ({ $in: [event, '$eventNames'] });
  const reachedCount = (field) => ({ $sum: { $cond: [field, 1, 0] } });
  const utcDay = (date) => ({
    $dateToString: { format: '%Y-%m-%d', date, timezone: 'UTC' },
  });

  return [
    { $match: { event: 'start' } },
    { $sort: { occurredAt: 1, _id: 1 } },
    {
      $group: {
        _id: '$telegramId',
        startAt: { $first: '$occurredAt' },
      },
    },
    {
      $lookup: {
        from: 'analytics_events',
        let: { cohortTelegramId: '$_id', cohortStartAt: '$startAt' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$telegramId', '$$cohortTelegramId'] },
                  { $gte: ['$occurredAt', '$$cohortStartAt'] },
                  { $in: ['$event', [...ANALYTICS_COHORT_EVENTS, 'active']] },
                ],
              },
            },
          },
          {
            $group: {
              _id: '$event',
              days: { $addToSet: utcDay('$occurredAt') },
            },
          },
        ],
        as: 'cohortEvents',
      },
    },
    {
      $project: {
        startAt: 1,
        eventNames: '$cohortEvents._id',
        activeDays: {
          $let: {
            vars: {
              activeEvent: {
                $arrayElemAt: [
                  {
                    $filter: {
                      input: '$cohortEvents',
                      as: 'entry',
                      cond: { $eq: ['$$entry._id', 'active'] },
                    },
                  },
                  0,
                ],
              },
            },
            in: { $ifNull: ['$$activeEvent.days', []] },
          },
        },
      },
    },
    {
      $project: {
        firstTap: reached('first_tap'),
        firstTask: reached('first_task'),
        promoUsed: reached('promo_used'),
        referral: reached('referral'),
        withdrawal: reached('withdrawal'),
        d1: {
          $in: [utcDay({ $add: ['$startAt', DAY_MS] }), '$activeDays'],
        },
        d7: {
          $in: [utcDay({ $add: ['$startAt', 7 * DAY_MS] }), '$activeDays'],
        },
      },
    },
    {
      $group: {
        _id: null,
        cohortUsers: { $sum: 1 },
        firstTapUsers: reachedCount('$firstTap'),
        firstTaskUsers: reachedCount('$firstTask'),
        promoUsedUsers: reachedCount('$promoUsed'),
        referralUsers: reachedCount('$referral'),
        withdrawalUsers: reachedCount('$withdrawal'),
        d1Users: reachedCount('$d1'),
        d7Users: reachedCount('$d7'),
      },
    },
    { $project: { _id: 0 } },
  ];
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
        cohort: buildCohortFacet(),
      },
    },
  ];
}

function percentage(part, total) {
  if (!Number(total)) return 0;
  return Math.round((Number(part || 0) / Number(total)) * 10000) / 100;
}

function formatCohortFunnel(cohort = {}) {
  const cohortUsers = Number(cohort.cohortUsers || 0);
  const counts = {
    start: cohortUsers,
    first_tap: Number(cohort.firstTapUsers || 0),
    first_task: Number(cohort.firstTaskUsers || 0),
    promo_used: Number(cohort.promoUsedUsers || 0),
    referral: Number(cohort.referralUsers || 0),
    withdrawal: Number(cohort.withdrawalUsers || 0),
  };
  let previousUsers = cohortUsers;

  return {
    cohortUsers,
    attributionBasis: 'first_start',
    eventOrderEnforced: false,
    stages: ANALYTICS_COHORT_EVENTS.map((event) => {
      const users = counts[event];
      const stage = {
        event,
        users,
        conversionFromCohort: percentage(users, cohortUsers),
        conversionFromPrevious: percentage(users, previousUsers),
      };
      previousUsers = users;
      return stage;
    }),
  };
}

function formatRetention(cohort = {}) {
  const cohortUsers = Number(cohort.cohortUsers || 0);
  const d1Users = Number(cohort.d1Users || 0);
  const d7Users = Number(cohort.d7Users || 0);
  return {
    cohortUsers,
    d1Users,
    d1Rate: percentage(d1Users, cohortUsers),
    d7Users,
    d7Rate: percentage(d7Users, cohortUsers),
    timezone: 'UTC',
  };
}

function formatAnalyticsDashboardResult(facetResult, from, to) {
  const result = facetResult?.[0] || {};
  const byEvent = Array.isArray(result.byEvent) ? result.byEvent : [];
  const eventMap = new Map(byEvent.map((item) => [item.event, item]));
  const cohort = result.cohort?.[0] || {};

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
    cohortFunnel: formatCohortFunnel(cohort),
    retention: formatRetention(cohort),
  };
}

module.exports = {
  ANALYTICS_CAMPAIGN_LIMIT,
  ANALYTICS_COHORT_EVENTS,
  ANALYTICS_DEFAULT_PERIOD_DAYS,
  ANALYTICS_FUNNEL_EVENTS,
  ANALYTICS_MAX_PERIOD_DAYS,
  buildAnalyticsDashboardMatch,
  buildAnalyticsDashboardPipeline,
  buildCohortFacet,
  formatCohortFunnel,
  formatAnalyticsDashboardResult,
  formatRetention,
};
