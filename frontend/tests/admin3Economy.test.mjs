import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  getAdminEconomyMetricGroups,
  getAdminEconomyViewState,
  getAdminOperationPreview,
  getAdminOperationsViewState,
} from '../src/admin/adminTypes.ts';

const sectionSource = readFileSync(new URL('../src/admin/sections/EconomySection.tsx', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('../src/admin/adminApi.ts', import.meta.url), 'utf8');
const shellSource = readFileSync(new URL('../src/admin/AdminShell.tsx', import.meta.url), 'utf8');
const navigationSource = readFileSync(new URL('../src/admin/adminNavigation.ts', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../src/admin/admin.css', import.meta.url), 'utf8');

const dashboard = {
  economyConfig: { ONIX_EUR_RATE: 1 },
  totals: {
    users: 10,
    frozenUsers: 1,
    suspiciousUsers: 2,
    totalBalance: 1000,
    totalEarned: 2000,
    weeklyEarned: 300,
    referrals: 12,
    taps: 400,
    pendingWithdrawals: 3,
    pendingWithdrawOnix: 500,
    approvedWithdrawals: 4,
    rejectedWithdrawals: 5,
    createdOnix: 6000,
    spentOnix: 700,
    totalBalanceEur: 10,
    pendingWithdrawEur: 5,
  },
  transactionTypes: [{ type: 'income_promo', count: 2, amount: 7000 }],
};

const operations = {
  withdrawals: [{ telegramId: '1', username: 'Nancy', amount: 100, eurAmount: 1, status: 'pending', adminComment: 'verbatim comment', createdAt: 10 }],
  transactions: [{ telegramId: '2', username: 'Player', type: 'income_promo', amount: 7000, title: 'GG7000', status: 'completed', createdAt: 20 }],
};

test('economy view distinguishes loading, error, empty and populated responses', () => {
  assert.equal(getAdminEconomyViewState(true, false, null), 'loading');
  assert.equal(getAdminEconomyViewState(false, true, null), 'error');
  assert.equal(getAdminEconomyViewState(false, false, null), 'empty');
  assert.equal(getAdminEconomyViewState(false, false, dashboard), 'ready');
});

test('economy metric groups expose every aggregate exactly once with its real value', () => {
  const metrics = getAdminEconomyMetricGroups(dashboard).flatMap((group) => group.metrics);
  assert.equal(metrics.length, 16);
  assert.deepEqual(new Set(metrics.map((metric) => metric.key)), new Set(Object.keys(dashboard.totals)));
  assert.equal(metrics.find((metric) => metric.key === 'totalBalance')?.value, 1000);
  assert.equal(metrics.find((metric) => metric.key === 'pendingWithdrawEur')?.unit, 'eur');
  assert.equal(dashboard.transactionTypes[0].type, 'income_promo');
});

test('operations view distinguishes loading, error, empty and populated responses', () => {
  assert.equal(getAdminOperationsViewState(true, false, null), 'loading');
  assert.equal(getAdminOperationsViewState(false, true, null), 'error');
  assert.equal(getAdminOperationsViewState(false, false, { withdrawals: [], transactions: [] }), 'empty');
  assert.equal(getAdminOperationsViewState(false, false, operations), 'ready');
});

test('operation preview keeps withdrawal and transaction data verbatim and applies a bounded display limit', () => {
  const manyTransactions = Array.from({ length: 60 }, (_, index) => ({ ...operations.transactions[0], createdAt: index }));
  const preview = getAdminOperationPreview({ withdrawals: operations.withdrawals, transactions: manyTransactions });
  assert.equal(preview.withdrawalTotal, 1);
  assert.equal(preview.transactionTotal, 60);
  assert.equal(preview.transactions.length, 50);
  assert.equal(preview.withdrawals[0].adminComment, 'verbatim comment');
  assert.equal(preview.transactions[0].type, 'income_promo');
});

test('Admin 3.0 economy uses only the existing read-only endpoints and is reachable from the shell', () => {
  assert.match(apiSource, /\/admin-economy-dashboard/);
  assert.match(apiSource, /\/admin-operations/);
  assert.match(shellSource, /activeSection === 'economy'/);
  assert.match(navigationSource, /id: 'economy'[\s\S]*available: true/);
  assert.doesNotMatch(sectionSource, /axios\.(post|put|patch|delete)/);
});

test('economy and operation cards constrain long mobile content without horizontal scrolling', () => {
  assert.match(cssSource, /\.admin-economy-section \{[\s\S]*max-width: 1240px/);
  assert.match(cssSource, /\.admin-operation-list article \{[\s\S]*min-width: 0;[\s\S]*overflow: hidden/);
  assert.match(cssSource, /\.admin-operation-list article p \{[\s\S]*overflow-wrap: anywhere;[\s\S]*white-space: pre-wrap/);
  assert.doesNotMatch(cssSource, /\.admin-(economy|operation)[^}]*overflow-x:\s*auto/);
});
