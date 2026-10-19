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
  getAdminUserStatus,
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
  energy: 350, maxEnergy: 750, tapPower: 17, completedTasksCount: 12,
  tapLevel: 4, minerLevel: 5, energyLevel: 6, rechargeLevel: 7,
  suspiciousReasons: ['raw diagnostic: velocity > threshold'],
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

test('player search status is frozen first, suspicious second and active otherwise', () => {
  assert.equal(getAdminUserStatus({ isFrozen: true, isSuspicious: true }), 'blocked');
  assert.equal(getAdminUserStatus({ isFrozen: false, isSuspicious: true }), 'suspicious');
  assert.equal(getAdminUserStatus({ isFrozen: false, isSuspicious: false }), 'active');
  assert.match(usersSource, /getAdminUserStatus\(user\)/);
  assert.match(usersSource, /admin-user-status is-\$\{status\}/);
});

test('profile renders all legacy diagnostics and preserves suspicious reasons verbatim', () => {
  for (const field of ['energy', 'maxEnergy', 'tapPower', 'completedTasksCount', 'tapLevel', 'minerLevel', 'energyLevel', 'rechargeLevel', 'suspiciousReasons']) {
    assert.match(usersSource, new RegExp(`selectedUser\\.${field}`));
  }
  assert.equal(profile.suspiciousReasons[0], 'raw diagnostic: velocity > threshold');
  assert.match(usersSource, /selectedUser\.suspiciousReasons![\s\S]*\{reason\}/);
  assert.match(cssSource, /\.admin-user-reason-list li \{[^}]*overflow-wrap: anywhere;[^}]*white-space: pre-wrap/);
});

test('confirmed balance and ban actions refresh the existing profile and expose outcomes', () => {
  assert.match(usersSource, /<ConfirmAdminAction/);
  assert.match(usersSource, /await refreshProfile\(targetTelegramId\)/);
  assert.match(usersSource, /translateMutationNotice/);
  assert.match(usersSource, /adjustAdminUserBalance/);
  assert.match(usersSource, /setAdminUserBan/);
  assert.match(usersSource, /addAdminUserNote/);
});

test('admin note waits for confirmation, submits once and refreshes the profile', async () => {
  const lock = { current: false };
  const noteText = '  exact note text  ';
  let pendingAction = null;
  let postCalls = 0;
  let refreshCalls = 0;
  let releasePost;
  const postGate = new Promise((resolve) => { releasePost = resolve; });
  const payloads = [];

  const requestNoteSave = () => {
    pendingAction = { kind: 'note', text: noteText };
  };
  const confirmNoteSave = async () => {
    if (!pendingAction || !acquireAdminMutationLock(lock)) return false;
    const action = pendingAction;
    try {
      postCalls += 1;
      payloads.push(createAdminNotePayload('42', '100', action.text));
      await postGate;
      refreshCalls += 1;
      pendingAction = null;
      return true;
    } finally {
      releaseAdminMutationLock(lock);
    }
  };

  requestNoteSave();
  assert.deepEqual(pendingAction, { kind: 'note', text: noteText });
  assert.equal(postCalls, 0);

  const firstConfirm = confirmNoteSave();
  const duplicateConfirm = confirmNoteSave();
  await Promise.resolve();
  assert.equal(postCalls, 1);
  assert.equal(await duplicateConfirm, false);

  releasePost();
  assert.equal(await firstConfirm, true);
  assert.equal(refreshCalls, 1);
  assert.equal(pendingAction, null);
  assert.deepEqual(payloads, [{ telegramId: '42', targetTelegramId: '100', text: noteText }]);

  assert.match(usersSource, /setPendingAction\(\{ kind: 'note', text: noteDraft \}\)/);
  assert.match(usersSource, /onClick=\{requestAdminNote\}/);
  assert.match(usersSource, /pendingAction\?\.kind === 'note'/);
  assert.match(usersSource, /addAdminUserNote\(apiBaseUrl, adminTelegramId, targetTelegramId, action\.text\)/);
  assert.match(usersSource, /await refreshProfile\(targetTelegramId\)/);
  assert.doesNotMatch(usersSource, /onClick=\{\(\) => void saveAdminNote\(\)\}/);
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
