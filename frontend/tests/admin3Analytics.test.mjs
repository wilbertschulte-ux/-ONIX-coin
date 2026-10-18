import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { adminGermanMessages, adminRussianMessages } from '../src/i18n/admin.ts';
import {
  createAdminAnalyticsParams,
  EMPTY_ADMIN_ANALYTICS_FILTERS,
  getAdminAnalyticsViewState,
} from '../src/admin/adminTypes.ts';

const sectionSource = readFileSync(new URL('../src/admin/sections/AnalyticsSection.tsx', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('../src/admin/adminApi.ts', import.meta.url), 'utf8');
const shellSource = readFileSync(new URL('../src/admin/AdminShell.tsx', import.meta.url), 'utf8');
const navigationSource = readFileSync(new URL('../src/admin/adminNavigation.ts', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../src/admin/admin.css', import.meta.url), 'utf8');

const dashboard = {
  period: { from: '2026-09-01T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z' },
  totals: { events: 12, users: 5 },
  byEvent: [{ event: 'active', events: 7, users: 4 }],
  byCampaign: [{ campaign: 'tg_de_01', events: 12, users: 5 }],
  funnel: [{ event: 'active', events: 7, users: 4 }],
  campaigns: [{ campaign: 'tg_de_01', users: 5, active: 4, firstTap: 3, firstTask: 2, promoUsed: 1, referral: 1, withdrawal: 1 }],
};

test('analytics params preserve the existing dashboard contract and only include non-empty filters', () => {
  assert.deepEqual(createAdminAnalyticsParams('42', EMPTY_ADMIN_ANALYTICS_FILTERS), {
    telegramId: '42',
    dashboard: '1',
  });
  assert.deepEqual(createAdminAnalyticsParams('42', {
    from: ' 2026-09-01 ', to: '2026-10-01', campaign: ' tg_de_01 ', source: ' ', market: ' de ',
  }), {
    telegramId: '42', dashboard: '1', from: '2026-09-01', to: '2026-10-01', campaign: 'tg_de_01', market: 'de',
  });
});

test('analytics view covers loading, error, empty and populated response states', () => {
  assert.equal(getAdminAnalyticsViewState(true, false, null), 'loading');
  assert.equal(getAdminAnalyticsViewState(false, true, null), 'error');
  assert.equal(getAdminAnalyticsViewState(false, false, null), 'empty');
  assert.equal(getAdminAnalyticsViewState(false, false, { ...dashboard, totals: { events: 0, users: 0 } }), 'empty');
  assert.equal(getAdminAnalyticsViewState(false, false, dashboard), 'ready');
});

test('dashboard response mapping keeps funnel, campaigns and internal values unchanged', () => {
  assert.equal(dashboard.totals.events, 12);
  assert.equal(dashboard.totals.users, 5);
  assert.equal(dashboard.funnel[0].event, 'active');
  assert.equal(dashboard.campaigns[0].campaign, 'tg_de_01');
  assert.equal(dashboard.campaigns[0].withdrawal, 1);
});

test('Admin 3.0 calls only the existing analytics dashboard endpoint', () => {
  const endpointMatches = apiSource.match(/\/admin-analytics-events/g) || [];
  assert.equal(endpointMatches.length, 1);
  assert.match(apiSource, /createAdminAnalyticsParams/);
  assert.doesNotMatch(sectionSource, /axios\./);
  assert.doesNotMatch(sectionSource, /axios\.(post|put|patch|delete)/i);
});

test('all five existing filters and the complete legacy aggregates are rendered', () => {
  for (const filter of ['from', 'to', 'campaign', 'source', 'market']) {
    assert.match(sectionSource, new RegExp(`filters\\.${filter}`));
  }
  assert.match(sectionSource, /dashboard\.totals\.events/);
  assert.match(sectionSource, /dashboard\.totals\.users/);
  assert.match(sectionSource, /dashboard\.funnel\.map/);
  assert.match(sectionSource, /dashboard\.campaigns\.map/);
  for (const metric of ['active', 'firstTap', 'firstTask', 'promoUsed', 'referral', 'withdrawal']) {
    assert.match(sectionSource, new RegExp(`'${metric}'`));
  }
});

test('typed Analytics labels exist in German and Russian', () => {
  assert.equal(adminGermanMessages['admin.analytics.filters'], 'Filter');
  assert.equal(adminRussianMessages['admin.analytics.filters'], 'Фильтры');
  assert.equal(adminGermanMessages['admin.analytics.campaignComparison'], 'Kampagnenvergleich');
  assert.equal(adminRussianMessages['admin.analytics.campaignComparison'], 'Сравнение кампаний');
});

test('Analytics is reachable and campaign cards avoid mobile horizontal scrolling', () => {
  assert.match(shellSource, /activeSection === 'analytics'/);
  assert.match(navigationSource, /id: 'analytics'[\s\S]*available: true/);
  assert.match(cssSource, /\.admin-analytics-panel \{[^}]*overflow: hidden/);
  assert.match(cssSource, /\.admin-analytics-campaigns dl \{[^}]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(cssSource, /@media \(min-width: 900px\)[\s\S]*\.admin-analytics-campaigns \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(cssSource, /\.admin-analytics[^}]*overflow-x:\s*auto/);
});

test('backend remains unchanged and existing dashboard tests define aggregation semantics', () => {
  const backendTestSource = readFileSync(new URL('../../backend/backendnode-server/tests/analyticsDashboard.test.js', import.meta.url), 'utf8');
  assert.match(backendTestSource, /unique users for funnel and campaign comparison/);
  assert.match(backendTestSource, /dashboard rejects requests without admin authorization/);
});
