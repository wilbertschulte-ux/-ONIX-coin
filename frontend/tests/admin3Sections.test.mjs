import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  createAdminUserSearchParams,
  createWithdrawalReviewPayload,
  getAdminCollectionState,
} from '../src/admin/adminTypes.ts';

const usersSource = readFileSync(new URL('../src/admin/sections/UsersSection.tsx', import.meta.url), 'utf8');
const withdrawalsSource = readFileSync(new URL('../src/admin/sections/WithdrawalsSection.tsx', import.meta.url), 'utf8');
const shellSource = readFileSync(new URL('../src/admin/AdminShell.tsx', import.meta.url), 'utf8');

test('collection states cover loading, error, empty and successful lists', () => {
  assert.equal(getAdminCollectionState(true, false, 0), 'loading');
  assert.equal(getAdminCollectionState(false, true, 0), 'error');
  assert.equal(getAdminCollectionState(false, false, 0), 'empty');
  assert.equal(getAdminCollectionState(false, false, 2), 'ready');
});

test('user search trims input, bounds the page and keeps the existing page size', () => {
  assert.deepEqual(createAdminUserSearchParams('42', '  alice  ', 0), {
    telegramId: '42',
    query: 'alice',
    page: 1,
    limit: 50,
  });
});

test('Users section keeps list search, pagination and profile loading in Admin 3.0', () => {
  assert.match(usersSource, /searchAdminUsers\(/);
  assert.match(usersSource, /loadAdminUserProfile\(/);
  assert.match(usersSource, /admin-pagination/);
  assert.match(shellSource, /activeSection === 'users'/);
});

test('withdrawal payload preserves the existing approve and reject API contract', () => {
  const request = {
    userTelegramId: '100',
    username: 'Player',
    requestIndex: 3,
    amount: 500000,
    eurAmount: 5,
    status: 'pending',
    adminComment: '',
    createdAt: 1,
    reviewedAt: null,
    userStats: {
      balance: 0,
      totalEarned: 0,
      weeklyEarned: 0,
      referralsCount: 0,
      totalTaps: 0,
      totalBoostsUsed: 0,
      totalUpgradesBought: 0,
      ownedPerksCount: 0,
      achievementsCompleted: 0,
      isSuspicious: false,
      suspiciousReasons: [],
    },
  };

  assert.deepEqual(createWithdrawalReviewPayload('42', request, 'approved', 'ok'), {
    telegramId: '42',
    userTelegramId: '100',
    requestIndex: 3,
    action: 'approved',
    adminComment: 'ok',
  });
  assert.equal(createWithdrawalReviewPayload('42', request, 'rejected', '').action, 'rejected');
});

test('Withdrawals section requires confirmation and refreshes after a successful action', () => {
  assert.match(withdrawalsSource, /<ConfirmAdminAction/);
  assert.match(withdrawalsSource, /await reviewAdminWithdrawal\(/);
  assert.match(withdrawalsSource, /await refresh\(\)/);
  assert.match(withdrawalsSource, /setNotice\(\{ type: 'error'/);
  assert.match(shellSource, /activeSection === 'withdrawals'/);
});

test('Users and Withdrawals do not invoke the legacy Admin 2.0 fallback', () => {
  const usersBranch = shellSource.slice(
    shellSource.indexOf("activeSection === 'users'"),
    shellSource.indexOf("activeSection === 'withdrawals'")
  );
  const withdrawalsBranch = shellSource.slice(
    shellSource.indexOf("activeSection === 'withdrawals'"),
    shellSource.indexOf('return (\n      <AdminStateView')
  );
  assert.doesNotMatch(usersBranch, /onOpenLegacy/);
  assert.doesNotMatch(withdrawalsBranch, /onOpenLegacy/);
});
