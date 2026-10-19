const assert = require('node:assert/strict');
const test = require('node:test');

process.env.NODE_ENV = 'test';
process.env.ADMIN_SECRET = 'analytics-dashboard-test-secret';

const AnalyticsEvent = require('../models/AnalyticsEvent');
const {
  ANALYTICS_COHORT_EVENTS,
  ANALYTICS_FUNNEL_EVENTS,
  ANALYTICS_MAX_PERIOD_DAYS,
  buildAnalyticsDashboardMatch,
  buildAnalyticsDashboardPipeline,
  formatCohortFunnel,
  formatAnalyticsDashboardResult,
  formatRetention,
} = require('../analyticsDashboard');
const router = require('../routes/coinRoutes');

function getRouteHandler(path, method) {
  const layer = router.stack.find(
    (item) => item.route?.path === path && item.route?.methods?.[method]
  );
  assert.ok(layer, `${method.toUpperCase()} ${path} route is registered`);
  return layer.route.stack.at(-1).handle;
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
}

test('dashboard match applies campaign, source and market filters with a bounded period', () => {
  const now = new Date('2026-10-10T12:00:00.000Z');
  const result = buildAnalyticsDashboardMatch({
    from: '2025-01-01',
    to: '2026-10-10',
    campaign: ' autumn_de ',
    source: ' tg_de_01 ',
    market: ' de ',
  }, now);

  assert.equal(result.match.campaign, 'autumn_de');
  assert.equal(result.match.source, 'tg_de_01');
  assert.equal(result.match.market, 'de');
  assert.equal(result.to.toISOString(), now.toISOString());
  assert.equal(
    result.to.getTime() - result.from.getTime(),
    ANALYTICS_MAX_PERIOD_DAYS * 24 * 60 * 60 * 1000
  );
});

test('AnalyticsEvent has a date index for bounded dashboard aggregation', () => {
  assert.ok(AnalyticsEvent.schema.indexes().some(([keys]) =>
    Object.keys(keys).length === 1 && keys.occurredAt === -1
  ));
});

test('aggregation pipeline counts unique users for funnel and campaign comparison', () => {
  const { match } = buildAnalyticsDashboardMatch({}, new Date('2026-10-10T12:00:00.000Z'));
  const pipeline = buildAnalyticsDashboardPipeline(match);
  const facet = pipeline[1].$facet;

  assert.deepEqual(pipeline[0], { $match: match });
  assert.deepEqual(facet.totals[0].$group.userIds, { $addToSet: '$telegramId' });
  assert.deepEqual(facet.byEvent[0].$group.userIds, { $addToSet: '$telegramId' });
  assert.deepEqual(facet.byCampaign[0].$group.userIds, { $addToSet: '$telegramId' });
  assert.deepEqual(
    facet.campaignComparison[0].$group.activeUserIds,
    { $addToSet: { $cond: [{ $eq: ['$event', 'active'] }, '$telegramId', null] } }
  );
  assert.equal(facet.campaignComparison.at(-1).$limit, 100);
  assert.deepEqual(facet.cohort[0], { $match: { event: 'start' } });
  assert.equal(facet.cohort[3].$lookup.from, 'analytics_events');
});

test('cohort funnel uses only start-cohort users and reports both conversion rates', () => {
  const funnel = formatCohortFunnel({
    cohortUsers: 10,
    firstTapUsers: 8,
    firstTaskUsers: 4,
    promoUsedUsers: 2,
    referralUsers: 1,
    withdrawalUsers: 1,
  });

  assert.equal(funnel.cohortUsers, 10);
  assert.equal(funnel.attributionBasis, 'first_start');
  assert.equal(funnel.eventOrderEnforced, false);
  assert.deepEqual(funnel.stages.map((stage) => stage.event), ANALYTICS_COHORT_EVENTS);
  assert.deepEqual(funnel.stages[0], {
    event: 'start', users: 10, conversionFromCohort: 100, conversionFromPrevious: 100,
  });
  assert.deepEqual(funnel.stages[1], {
    event: 'first_tap', users: 8, conversionFromCohort: 80, conversionFromPrevious: 80,
  });
  assert.deepEqual(funnel.stages[2], {
    event: 'first_task', users: 4, conversionFromCohort: 40, conversionFromPrevious: 50,
  });
  assert.equal(funnel.stages[3].users, 2);
  assert.equal(funnel.stages[4].users, 1);
  assert.equal(funnel.stages[5].users, 1);
});

test('D1 and D7 retention use the start cohort as denominator', () => {
  assert.deepEqual(formatRetention({ cohortUsers: 8, d1Users: 4, d7Users: 2 }), {
    cohortUsers: 8,
    d1Users: 4,
    d1Rate: 50,
    d7Users: 2,
    d7Rate: 25,
    timezone: 'UTC',
  });
});

test('cohort facet uses exact UTC calendar-day boundaries for D1 and D7', () => {
  const facet = buildAnalyticsDashboardPipeline({ occurredAt: { $gte: new Date(0), $lte: new Date() } })[1].$facet.cohort;
  const retentionProjection = facet[5].$project;
  const d1Date = retentionProjection.d1.$in[0].$dateToString.date.$add;
  const d7Date = retentionProjection.d7.$in[0].$dateToString.date.$add;

  assert.equal(retentionProjection.d1.$in[0].$dateToString.timezone, 'UTC');
  assert.equal(retentionProjection.d7.$in[0].$dateToString.timezone, 'UTC');
  assert.deepEqual(d1Date, ['$startAt', 24 * 60 * 60 * 1000]);
  assert.deepEqual(d7Date, ['$startAt', 7 * 24 * 60 * 60 * 1000]);
});

test('repeated landing and later events without a start cannot enter the cohort', () => {
  const facet = buildAnalyticsDashboardPipeline({
    occurredAt: { $gte: new Date('2026-10-01'), $lte: new Date('2026-10-31') },
    campaign: 'first_touch_campaign',
    source: 'tg_de_01',
    market: 'de',
  })[1].$facet.cohort;

  assert.deepEqual(facet[0], { $match: { event: 'start' } });
  assert.deepEqual(facet[1], { $sort: { occurredAt: 1, _id: 1 } });
  assert.equal(facet[2].$group.startAt.$first, '$occurredAt');
  assert.ok(facet[3].$lookup.pipeline[0].$match.$expr.$and.some((condition) =>
    condition.$eq?.[0] === '$telegramId' && condition.$eq?.[1] === '$$cohortTelegramId'
  ));
  assert.ok(facet[3].$lookup.pipeline[0].$match.$expr.$and.some((condition) =>
    condition.$gte?.[0] === '$occurredAt' && condition.$gte?.[1] === '$$cohortStartAt'
  ));
});

test('empty cohort has zero conversions and retention', () => {
  const funnel = formatCohortFunnel({});
  assert.equal(funnel.cohortUsers, 0);
  assert.ok(funnel.stages.every((stage) => stage.users === 0
    && stage.conversionFromCohort === 0
    && stage.conversionFromPrevious === 0));
  assert.deepEqual(formatRetention({}), {
    cohortUsers: 0, d1Users: 0, d1Rate: 0, d7Users: 0, d7Rate: 0, timezone: 'UTC',
  });
});

test('formatter returns the complete funnel with event and unique-user counts', () => {
  const from = new Date('2026-10-01T00:00:00.000Z');
  const to = new Date('2026-10-10T00:00:00.000Z');
  const dashboard = formatAnalyticsDashboardResult([{
    totals: [{ events: 5, users: 2 }],
    byEvent: [
      { event: 'landing', events: 3, users: 2 },
      { event: 'active', events: 2, users: 1 },
    ],
    byCampaign: [{ campaign: 'autumn_de', events: 5, users: 2 }],
    campaignComparison: [{ campaign: 'autumn_de', users: 2, active: 1 }],
    cohort: [{ cohortUsers: 2, firstTapUsers: 1, d1Users: 1, d7Users: 0 }],
  }], from, to);

  assert.deepEqual(dashboard.funnel.map((item) => item.event), ANALYTICS_FUNNEL_EVENTS);
  assert.deepEqual(dashboard.funnel[0], { event: 'landing', events: 3, users: 2 });
  assert.deepEqual(dashboard.funnel[1], { event: 'start', events: 0, users: 0 });
  assert.deepEqual(dashboard.funnel[2], { event: 'active', events: 2, users: 1 });
  assert.equal(dashboard.totals.users, 2);
  assert.equal(dashboard.campaigns[0].campaign, 'autumn_de');
  assert.equal(dashboard.cohortFunnel.stages[1].users, 1);
  assert.equal(dashboard.retention.d1Rate, 50);
});

test('analytics dashboard rejects requests without admin authorization', async () => {
  const handler = getRouteHandler('/admin-analytics-events', 'get');
  const response = createResponse();
  let aggregateCalled = false;
  const originalAggregate = AnalyticsEvent.aggregate;
  AnalyticsEvent.aggregate = async () => {
    aggregateCalled = true;
    return [];
  };

  try {
    await handler({ query: { dashboard: '1' }, get: () => '' }, response);
    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.body, { message: 'Forbidden' });
    assert.equal(aggregateCalled, false);
  } finally {
    AnalyticsEvent.aggregate = originalAggregate;
  }
});

test('authorized dashboard request aggregates filtered data without returning event documents', async () => {
  const handler = getRouteHandler('/admin-analytics-events', 'get');
  const response = createResponse();
  const originalAggregate = AnalyticsEvent.aggregate;
  let capturedPipeline = null;
  AnalyticsEvent.aggregate = async (pipeline) => {
    capturedPipeline = pipeline;
    return [{
      totals: [{ events: 2, users: 1 }],
      byEvent: [{ event: 'active', events: 2, users: 1 }],
      byCampaign: [{ campaign: 'autumn_de', events: 2, users: 1 }],
      campaignComparison: [{
        campaign: 'autumn_de', users: 1, active: 1, firstTap: 0,
        firstTask: 0, promoUsed: 0, referral: 0, withdrawal: 0,
      }],
      cohort: [{
        cohortUsers: 1, firstTapUsers: 1, firstTaskUsers: 0, promoUsedUsers: 0,
        referralUsers: 0, withdrawalUsers: 0, d1Users: 1, d7Users: 0,
      }],
    }];
  };

  try {
    await handler({
      query: {
        dashboard: '1',
        secret: process.env.ADMIN_SECRET,
        campaign: 'autumn_de',
        source: 'tg_de_01',
      },
      get: () => '',
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(capturedPipeline[0].$match.campaign, 'autumn_de');
    assert.equal(capturedPipeline[0].$match.source, 'tg_de_01');
    assert.equal(response.body.totals.users, 1);
    assert.equal(response.body.events, undefined);
    assert.equal(response.body.campaigns[0].active, 1);
    assert.equal(response.body.cohortFunnel.cohortUsers, 1);
    assert.equal(response.body.retention.d1Rate, 100);
  } finally {
    AnalyticsEvent.aggregate = originalAggregate;
  }
});
