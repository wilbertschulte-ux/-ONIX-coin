const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

process.env.NODE_ENV = 'test';

const AnalyticsEvent = require('../models/AnalyticsEvent');
const {
  ANALYTICS_EVENT_TYPES,
  recordAnalyticsEvent,
  sanitizeMetadata,
  trackAnalyticsEvent,
} = require('../analytics');

const backendRoot = path.resolve(__dirname, '..');
const routesSource = fs.readFileSync(path.join(backendRoot, 'routes', 'coinRoutes.js'), 'utf8');
const serverSource = fs.readFileSync(path.join(backendRoot, 'server.js'), 'utf8');

function getRouteSource(startMarker, endMarker) {
  const start = routesSource.indexOf(startMarker);
  const end = routesSource.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `${startMarker} exists`);
  assert.notEqual(end, -1, `${endMarker} exists after ${startMarker}`);
  return routesSource.slice(start, end);
}

test('AnalyticsEvent has the required reporting and unique deduplication indexes', () => {
  const indexes = AnalyticsEvent.schema.indexes();
  assert.ok(indexes.some(([keys]) => keys.telegramId === 1 && keys.occurredAt === -1));
  assert.ok(indexes.some(([keys]) => keys.event === 1 && keys.occurredAt === -1));
  assert.ok(indexes.some(([keys]) =>
    keys.campaign === 1 && keys.event === 1 && keys.occurredAt === -1
  ));
  assert.ok(indexes.some(([keys, options]) =>
    keys.telegramId === 1 &&
    keys.event === 1 &&
    keys.deduplicationKey === 1 &&
    options.unique === true
  ));
});

test('all requested event types are supported', () => {
  assert.deepEqual(ANALYTICS_EVENT_TYPES, [
    'landing',
    'start',
    'active',
    'first_tap',
    'first_task',
    'promo_used',
    'referral',
    'withdrawal',
  ]);
});

test('recordAnalyticsEvent keeps attribution and safe metadata and deduplicates', async () => {
  const originalUpdateOne = AnalyticsEvent.updateOne;
  const saved = new Map();

  AnalyticsEvent.updateOne = async (filter, update, options) => {
    assert.equal(options.upsert, true);
    assert.equal(typeof options.maxTimeMS, 'number');
    const key = `${filter.telegramId}:${filter.event}:${filter.deduplicationKey}`;
    if (saved.has(key)) return { upsertedCount: 0 };
    saved.set(key, update.$setOnInsert);
    return { upsertedCount: 1 };
  };

  try {
    const input = {
      telegramId: '1001',
      event: 'promo_used',
      attribution: {
        source: 'tg_de_01',
        campaign: '01',
        market: 'de',
        landingCode: 'tg_de_01',
      },
      metadata: {
        promoCode: 'GG7000',
        nested: { unsafe: true },
        '$operator': 'ignored',
      },
      occurredAt: Date.UTC(2026, 9, 10),
      deduplicationKey: 'promo:GG7000',
    };

    assert.deepEqual(await recordAnalyticsEvent(input), { recorded: true, duplicate: false });
    assert.deepEqual(await recordAnalyticsEvent(input), { recorded: false, duplicate: true });
    assert.equal(saved.size, 1);
    const document = [...saved.values()][0];
    assert.equal(document.source, 'tg_de_01');
    assert.equal(document.campaign, '01');
    assert.equal(document.market, 'de');
    assert.equal(document.landingCode, 'tg_de_01');
    assert.deepEqual(document.metadata, { promoCode: 'GG7000' });
  } finally {
    AnalyticsEvent.updateOne = originalUpdateOne;
  }
});

test('first_tap and first_task are idempotent per user', async () => {
  const originalUpdateOne = AnalyticsEvent.updateOne;
  const claimed = new Set();
  AnalyticsEvent.updateOne = async (filter) => {
    const key = `${filter.telegramId}:${filter.event}:${filter.deduplicationKey}`;
    if (claimed.has(key)) return { upsertedCount: 0 };
    claimed.add(key);
    return { upsertedCount: 1 };
  };

  try {
    for (const event of ['first_tap', 'first_task']) {
      const input = {
        telegramId: 'first-event-user',
        event,
        attribution: { source: 'tg_de_01' },
        deduplicationKey: event,
      };
      assert.equal((await recordAnalyticsEvent(input)).recorded, true);
      assert.equal((await recordAnalyticsEvent(input)).duplicate, true);
    }
    assert.equal(claimed.size, 2);
  } finally {
    AnalyticsEvent.updateOne = originalUpdateOne;
  }
});

test('metadata sanitizer accepts only small scalar technical values', () => {
  assert.deepEqual(sanitizeMetadata({
    taskId: 'daily_taps',
    amountOnix: 25000,
    ok: true,
    empty: null,
    array: ['not stored'],
    object: { not: 'stored' },
    '$where': 'not stored',
  }), {
    taskId: 'daily_taps',
    amountOnix: 25000,
    ok: true,
    empty: null,
  });
});

test('analytics rejection and timeout never block the caller', async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const rejected = trackAnalyticsEvent(
      { telegramId: '1001', event: 'active' },
      async () => { throw new Error('storage unavailable'); },
      5
    );
    const slow = trackAnalyticsEvent(
      { telegramId: '1002', event: 'active' },
      () => new Promise((resolve) => setTimeout(() => resolve({ recorded: true }), 30)),
      5
    );
    assert.equal(rejected, undefined);
    assert.equal(slow, undefined);
    await new Promise((resolve) => setTimeout(resolve, 40));
  } finally {
    console.warn = originalWarn;
  }
});

test('first tap and first task hooks run only after a successful user save', () => {
  const tapRoute = getRouteSource("router.post('/tap'", '// ---------------- ONIX Drop');
  const missionRoute = getRouteSource("router.post('/claim-mission'", '// CLAIM TASK');
  const taskRoute = getRouteSource("router.post('/claim-task'", '// CLAIM OFFLINE INCOME');

  assert.ok(tapRoute.indexOf('await user.save();') < tapRoute.indexOf("event: 'first_tap'"));
  assert.match(tapRoute, /const isFirstTap = Number\(user\.totalTaps \|\| 0\) === 0/);
  assert.match(tapRoute, /deduplicationKey: 'first_tap'/);
  assert.ok(missionRoute.indexOf('await user.save();') < missionRoute.indexOf("event: 'first_task'"));
  assert.match(missionRoute, /metadata: \{ taskId: mission\.id \}/);
  assert.equal((taskRoute.match(/deduplicationKey: 'first_task'/g) || []).length, 2);
});

test('promo and withdrawal analytics are emitted only after their successful saves', () => {
  const promoRoute = getRouteSource("router.post('/apply-promo'", '// PUBLIC HEALTH CHECK');
  const withdrawalRoute = getRouteSource("router.post('/request-withdrawal'", '// BUY PERK');

  assert.ok(promoRoute.indexOf('await session.withTransaction') < promoRoute.indexOf("event: 'promo_used'"));
  assert.match(promoRoute, /metadata: \{ promoCode: cleanCode \}/);
  assert.ok(withdrawalRoute.indexOf('await user.save();') < withdrawalRoute.indexOf("event: 'withdrawal'"));
  assert.match(withdrawalRoute, /metadata: \{ amountOnix: withdrawAmount, eurAmount \}/);
  assert.match(withdrawalRoute, /deduplicationKey: String\(user\.withdrawalRequests\[0\]\.createdAt\)/);
});

test('landing/start/active reuse existing traffic points without removing them', () => {
  for (const event of ['landing', 'start', 'active']) {
    assert.match(routesSource, new RegExp(`queueTrafficEvent\\(\\{[\\s\\S]{0,160}event: '${event}'`));
    assert.match(routesSource, new RegExp(`trackAnalyticsEvent\\(\\{[\\s\\S]{0,160}event: '${event}'`));
  }
  assert.match(serverSource, /queueTrafficEvent\([\s\S]*event: 'landing'/);
  assert.match(serverSource, /trackAnalyticsEvent\([\s\S]*event: 'landing'/);
});

test('analytics admin endpoint remains protected by existing admin authorization', () => {
  const adminRoute = getRouteSource("router.get('/admin-analytics-events'", '// ADMIN 2.0: GET ECONOMY CONFIG');
  assert.match(adminRoute, /isAdminRequest\(req, secret, telegramId\)/);
  assert.match(adminRoute, /AnalyticsEvent\.find\(filter\)/);
  assert.doesNotMatch(adminRoute, /User\.update|AnalyticsEvent\.update|\.save\(/);
});
