const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildAdminFortuneWheelDashboard,
  buildEntitlementFilter,
  buildProgressStatsPipeline,
  normalizeAdminFortuneWheelQuery,
  normalizeProgressStats,
  serializeAdminEntitlement,
} = require('../fortuneWheelAdmin');

const now = new Date('2026-11-11T12:00:00.000Z');

test('admin query supports legacy/weekly campaign, UTC week, status, search and bounded pagination', () => {
  const weekly = normalizeAdminFortuneWheelQuery({
    campaignKey: 'fortune-wheel-weekly-v1', weekKey: '2026-11-09', entitlementStatus: 'awaiting_color',
    entitlementSearch: '900', entitlementPage: '-2', entitlementLimit: '500',
  }, now);
  assert.equal(weekly.ok, true);
  assert.equal(weekly.weekKey, '2026-11-09');
  assert.equal(weekly.page, 1);
  assert.equal(weekly.limit, 50);
  const filter = buildEntitlementFilter(weekly);
  assert.equal(filter.campaignKey, 'fortune-wheel-weekly-v1');
  assert.equal(filter.weekKey, '2026-11-09');
  assert.equal(filter.status, 'reserved');
  assert.equal(filter.physicalPrizeRequestId, null);
  assert.equal(filter.telegramId.test('900123'), true);
  assert.equal(normalizeAdminFortuneWheelQuery({ campaignKey: 'forged' }, now).ok, false);
  assert.equal(normalizeAdminFortuneWheelQuery({ campaignKey: 'fortune-wheel-v1', weekKey: '2026-11-09' }, now).ok, false);
});

test('admin query exposes staging legacy campaign without allowing a week filter', () => {
  const accepted = normalizeAdminFortuneWheelQuery({ campaignKey: 'fortune-wheel-staging-v1' });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.weekKey, '');
  assert.equal(normalizeAdminFortuneWheelQuery({
    campaignKey: 'fortune-wheel-staging-v1',
    weekKey: '2026-11-09',
  }).code, 'LEGACY_CAMPAIGN_HAS_NO_WEEK');
});

test('statistics pipeline remains campaign and week bounded and aggregation totals are exact', () => {
  const pipeline = buildProgressStatsPipeline({ campaignKey: 'fortune-wheel-weekly-v1', weekKey: '2026-11-09' });
  assert.deepEqual(pipeline[0], { $match: { campaignKey: 'fortune-wheel-weekly-v1', weekKey: '2026-11-09' } });
  const stats = normalizeProgressStats([{
    summary: [{ uniquePlayers: 2, spinsUsed: 5 }],
    rewards: [
      { _id: 'onix_5000', count: 3, totalOnix: 15000 },
      { _id: 'onix_250000', count: 1, totalOnix: 250000 },
      { _id: 'iphone_duo', count: 1, totalOnix: 0 },
    ],
  }]);
  assert.equal(stats.uniquePlayers, 2);
  assert.equal(stats.spinsUsed, 5);
  assert.equal(stats.totalOnix, 265000);
  assert.equal(stats.rewards.find((item) => item.rewardCode === 'iphone_duo').count, 1);
});

test('weekly dashboard exposes configured/effective probability and cumulative inventory counters', () => {
  const normalized = normalizeAdminFortuneWheelQuery({ campaignKey: 'fortune-wheel-weekly-v1' }, now);
  const dashboard = buildAdminFortuneWheelDashboard({
    normalized,
    aggregation: [{ summary: [{ uniquePlayers: 4, spinsUsed: 9 }], rewards: [] }],
    inventory: { capacity: 100, reserved: 7, fulfilled: 3, configVersion: 'weekly-random-v1' },
    campaignConfig: {
      campaignKey: 'fortune-wheel-weekly-v1', enabled: true, approved: true,
      validDateConfiguration: true, startsAt: null, endsAt: null,
    },
    mode: 'weekly_random_v1',
    storageReadiness: { ready: true, code: 'WEEKLY_STORAGE_READY' },
    now,
  });
  assert.equal(dashboard.active, true);
  assert.equal(dashboard.stats.uniquePlayers, 4);
  assert.equal(dashboard.configuredProbabilities.length, 6);
  assert.equal(dashboard.configuredProbabilities.reduce((sum, item) => sum + item.weightPpm, 0), 1000000);
  assert.equal(dashboard.effectiveProbabilities.reduce((sum, item) => sum + item.effectiveWeightPpm, 0), 1000000);
  assert.deepEqual(dashboard.inventory, {
    exists: true, capacity: 100, reserved: 7, fulfilled: 3, remaining: 93, configVersion: 'weekly-random-v1',
  });
});

test('exhausted inventory removes iPhone from effective probability without changing configuration', () => {
  const normalized = normalizeAdminFortuneWheelQuery({ campaignKey: 'fortune-wheel-weekly-v1' }, now);
  const dashboard = buildAdminFortuneWheelDashboard({
    normalized, aggregation: [],
    inventory: { capacity: 100, reserved: 100, fulfilled: 20, configVersion: 'weekly-random-v1' },
    campaignConfig: { campaignKey: 'fortune-wheel-weekly-v1', enabled: false, approved: false, validDateConfiguration: true, startsAt: null, endsAt: null },
    mode: 'legacy_fixed_v1', storageReadiness: { ready: false, code: 'WEEKLY_REQUIRED_INDEX_MISSING' }, now,
  });
  assert.equal(dashboard.active, false);
  assert.equal(dashboard.configuredProbabilities.find((item) => item.rewardCode === 'iphone_duo').weightPpm, 49000);
  assert.equal(dashboard.effectiveProbabilities.find((item) => item.rewardCode === 'iphone_duo').effectiveWeightPpm, 0);
  assert.equal(dashboard.inventory.remaining, 0);
});

test('entitlement serializer exposes linked request and identifies winner awaiting color', () => {
  const base = {
    _id: 'entitlement-1', telegramId: '9001', campaignKey: 'fortune-wheel-weekly-v1',
    weekKey: '2026-11-09', prizeCode: 'iphone_duo', slot: 5, status: 'reserved',
    reservedAt: now, physicalPrizeRequestId: null,
  };
  const awaiting = serializeAdminEntitlement(base, { user: { telegramUsername: 'winner' } });
  assert.equal(awaiting.awaitingColor, true);
  assert.equal(awaiting.telegramUsername, 'winner');
  const linked = serializeAdminEntitlement({ ...base, physicalPrizeRequestId: 'request-object-id' }, {
    request: { requestId: 'request-1', color: 'staging-test', status: 'pending', telegramUsernameSnapshot: 'winner' },
  });
  assert.equal(linked.awaitingColor, false);
  assert.equal(linked.requestId, 'request-1');
  assert.equal(linked.color, 'staging-test');
});
