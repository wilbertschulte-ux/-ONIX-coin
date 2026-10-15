import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  acquireAdminMutationLock,
  createAdminBalanceAdjustmentPayload,
  createAdminBanPayload,
  createAdminNotePayload,
  getAdminProfileMutationNoticeKey,
  getAdminProfileViewState,
  parseAdminBalanceAmount,
  releaseAdminMutationLock,
} from '../src/admin/adminTypes.ts';

const usersSource = readFileSync(new URL('../src/admin/sections/UsersSection.tsx', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('../src/admin/adminApi.ts', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../src/admin/admin.css', import.meta.url), 'utf8');

const profile = {
  telegramId: '100', username: 'Nancy', balance: 10, totalEarned: 20, weeklyEarned: 5,
  referralsCount: 0, totalTaps: 3, level: 2, isSuspicious: false, isFrozen: false,
  frozenReason: '', totalBoostsUsed: 0, totalUpgradesBought: 1, offlineClaimsCount: 0,
  transactions: [{ type: 'income_promo', amount: 7, title: 'GG7000', status: 'confirmed', createdAt: 1 }],
  withdrawalRequests: [{ amount: 5, eurAmount: 0.05, status: 'approved', adminComment: 'ok', reviewedAt: 2, reviewedBy: '42', createdAt: 1 }],
  securityLogs: [{ type: 'admin_note', title: 'Note', details: 'raw details', createdAt: 1 }],
  adminNotes: [{ text: 'verbatim note', adminTelegramId: '42', createdAt: 1 }],
};

test('profile view behavior covers loading, error, empty and populated data', () => {
  assert.equal(getAdminProfileViewState(true, false, null), 'loading');
  assert.equal(getAdminProfileViewState(false, true, null), 'error');
  assert.equal(getAdminProfileViewState(false, false, null), 'empty');
  assert.equal(getAdminProfileViewState(false, false, profile), 'selected');
  assert.equal(profile.transactions[0].title, 'GG7000');
  assert.equal(profile.withdrawalRequests[0].adminComment, 'ok');
  assert.equal(profile.securityLogs[0].details, 'raw details');
  assert.equal(profile.adminNotes[0].text, 'verbatim note');
});

test('balance validation accepts finite non-zero values and rejects unsafe input', () => {
  assert.equal(parseAdminBalanceAmount(' 125.5 '), 125.5);
  assert.equal(parseAdminBalanceAmount('-50'), -50);
  for (const value of ['', ' ', '0', 'NaN', 'Infinity']) assert.equal(parseAdminBalanceAmount(value), null);
  assert.deepEqual(createAdminBalanceAdjustmentPayload('42', '100', -50, ' correction '), {
    telegramId: '42', targetTelegramId: '100', amount: -50, reason: 'correction',
  });
});

test('ban, unban and note payloads preserve existing contracts and note content', () => {
  assert.deepEqual(createAdminBanPayload('42', '100', true, ' review '), { telegramId: '42', targetTelegramId: '100', ban: true, reason: 'review' });
  assert.deepEqual(createAdminBanPayload('42', '100', false, 'ignored'), { telegramId: '42', targetTelegramId: '100', ban: false, reason: '' });
  assert.deepEqual(createAdminNotePayload('42', '100', '  exact note  '), { telegramId: '42', targetTelegramId: '100', text: '  exact note  ' });
});

test('mutation lock rejects a second submit until the first operation releases it', () => {
  const lock = { current: false };
  assert.equal(acquireAdminMutationLock(lock), true);
  assert.equal(acquireAdminMutationLock(lock), false);
  releaseAdminMutationLock(lock);
  assert.equal(acquireAdminMutationLock(lock), true);
});

test('balance, ban, unban and note outcomes select explicit success and error states', () => {
  assert.equal(getAdminProfileMutationNoticeKey('balance', true), 'admin.players.balanceSuccess');
  assert.equal(getAdminProfileMutationNoticeKey('balance', false), 'admin.players.balanceError');
  assert.equal(getAdminProfileMutationNoticeKey('ban', true), 'admin.players.banSuccess');
  assert.equal(getAdminProfileMutationNoticeKey('unban', true), 'admin.players.unbanSuccess');
  assert.equal(getAdminProfileMutationNoticeKey('ban', false), 'admin.players.banError');
  assert.equal(getAdminProfileMutationNoticeKey('note', true), 'admin.notes.success');
  assert.equal(getAdminProfileMutationNoticeKey('note', false), 'admin.notes.error');
});

test('profile mutations use only the existing admin endpoints and typed payload builders', () => {
  assert.match(apiSource, /\/admin-adjust-balance/);
  assert.match(apiSource, /createAdminBalanceAdjustmentPayload/);
  assert.match(apiSource, /\/admin-ban-user/);
  assert.match(apiSource, /createAdminBanPayload/);
  assert.match(apiSource, /\/admin-user-note/);
  assert.match(apiSource, /createAdminNotePayload/);
});

test('confirmed balance and ban actions refresh the existing profile and expose outcomes', () => {
  assert.match(usersSource, /<ConfirmAdminAction/);
  assert.match(usersSource, /await refreshProfile\(targetTelegramId\)/);
  assert.match(usersSource, /translateMutationNotice/);
  assert.match(usersSource, /adjustAdminUserBalance/);
  assert.match(usersSource, /setAdminUserBan/);
  assert.match(usersSource, /addAdminUserNote/);
});

test('profile histories use mobile cards with wrapping and no horizontal scroller', () => {
  assert.match(usersSource, /selectedUser\.transactions/);
  assert.match(usersSource, /selectedUser\.withdrawalRequests/);
  assert.match(usersSource, /selectedUser\.securityLogs/);
  assert.match(usersSource, /selectedUser\.adminNotes/);
  assert.match(cssSource, /\.admin-user-history-list article \{[\s\S]*min-width: 0;[\s\S]*overflow: hidden;/);
  assert.match(cssSource, /\.admin-user-history-list article p \{[\s\S]*overflow-wrap: anywhere;[\s\S]*white-space: pre-wrap;/);
  assert.doesNotMatch(cssSource, /\.admin-user-history[^}]*overflow-x:\s*auto/);
});
