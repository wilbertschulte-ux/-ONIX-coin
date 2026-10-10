const assert = require('node:assert/strict');
const test = require('node:test');

process.env.NODE_ENV = 'test';
process.env.ADMIN_SECRET = 'analytics-dashboard-test-secret';

const AnalyticsEvent = require('../models/AnalyticsEvent');
const {
  ANALYTICS_FUNNEL_EVENTS,
  ANALYTICS_MAX_PERIOD_DAYS,
  buildAnalyticsDashboardMatch,
  buildAnalyticsDashboardPipeline,
  formatAnalyticsDashboardResult,
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
  }], from, to);

  assert.deepEqual(dashboard.funnel.map((item) => item.event), ANALYTICS_FUNNEL_EVENTS);
  assert.deepEqual(dashboard.funnel[0], { event: 'landing', events: 3, users: 2 });
  assert.deepEqual(dashboard.funnel[1], { event: 'start', events: 0, users: 0 });
  assert.deepEqual(dashboard.funnel[2], { event: 'active', events: 2, users: 1 });
  assert.equal(dashboard.totals.users, 2);
  assert.equal(dashboard.campaigns[0].campaign, 'autumn_de');
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
  } finally {
    AnalyticsEvent.aggregate = originalAggregate;
  }
});
