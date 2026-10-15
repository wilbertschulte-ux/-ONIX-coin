import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  applyAdminFreezeResult,
  createAdminFreezePayload,
  getAdminCollectionState,
} from '../src/admin/adminTypes.ts';

const sectionSource = readFileSync(new URL('../src/admin/sections/SecuritySection.tsx', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('../src/admin/adminApi.ts', import.meta.url), 'utf8');
const shellSource = readFileSync(new URL('../src/admin/AdminShell.tsx', import.meta.url), 'utf8');
const navigationSource = readFileSync(new URL('../src/admin/adminNavigation.ts', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../src/admin/admin.css', import.meta.url), 'utf8');

const suspiciousUser = {
  telegramId: '100',
  username: 'Nancy',
  balance: 10,
  totalEarned: 20,
  weeklyEarned: 5,
  referralsCount: 0,
  totalTaps: 2,
  isSuspicious: true,
  suspiciousReasons: ['diagnostic value'],
  isFrozen: false,
  frozenReason: '',
};

test('security collections distinguish loading, error, empty and populated states', () => {
  assert.equal(getAdminCollectionState(true, false, 0), 'loading');
  assert.equal(getAdminCollectionState(false, true, 0), 'error');
  assert.equal(getAdminCollectionState(false, false, 0), 'empty');
  assert.equal(getAdminCollectionState(false, false, 1), 'ready');
});

test('freeze and unfreeze payloads preserve the existing backend contract', () => {
  assert.deepEqual(createAdminFreezePayload('42', suspiciousUser, '  manual review  '), {
    telegramId: '42',
    targetTelegramId: '100',
    freeze: true,
    reason: 'manual review',
  });
  assert.deepEqual(createAdminFreezePayload('42', { ...suspiciousUser, isFrozen: true }, 'ignored'), {
    telegramId: '42',
    targetTelegramId: '100',
    freeze: false,
    reason: '',
  });
});

test('successful freeze updates only the matching suspicious account', () => {
  const other = { ...suspiciousUser, telegramId: '200', username: 'Other' };
  const result = applyAdminFreezeResult([suspiciousUser, other], {
    telegramId: '100',
    username: 'Nancy',
    isFrozen: true,
    frozenReason: 'manual review',
  });
  assert.equal(result[0].isFrozen, true);
  assert.equal(result[0].frozenReason, 'manual review');
  assert.deepEqual(result[1], other);
});

test('Admin 3.0 Security uses only the existing four security endpoints', () => {
  assert.match(apiSource, /\/admin-suspicious-users/);
  assert.match(apiSource, /\/admin-freeze-user/);
  assert.match(apiSource, /\/admin-security-logs/);
  assert.match(apiSource, /\/admin-frontend-errors/);
  assert.match(shellSource, /activeSection === 'security'/);
  assert.match(navigationSource, /id: 'security'[\s\S]*available: true/);
});

test('freeze requires confirmation and blocks synchronous duplicate submission', () => {
  assert.match(sectionSource, /<ConfirmAdminAction/);
  assert.match(sectionSource, /submittingRef\.current/);
  assert.match(sectionSource, /if \(!pendingFreeze \|\| submittingRef\.current\) return/);
  assert.match(sectionSource, /setNotice\(\{ type: 'error'/);
  assert.match(sectionSource, /applyAdminFreezeResult/);
});

test('security and frontend error details are expandable without changing diagnostic text', () => {
  assert.match(sectionSource, /<details><summary>\{t\('admin\.security\.showDetails'\)\}/);
  assert.match(sectionSource, /\{log\.details \|\| '—'\}/);
  assert.match(sectionSource, /<details><summary>\{t\('admin\.security\.showStack'\)\}/);
  assert.match(sectionSource, /<pre>\{error\.stack\}<\/pre>/);
});

test('security cards constrain long mobile content and avoid horizontal scrolling', () => {
  assert.match(cssSource, /\.admin-security-card \{[\s\S]*min-width: 0;[\s\S]*overflow: hidden;/);
  assert.match(cssSource, /\.admin-security-card details pre \{[\s\S]*max-width: 100%;[\s\S]*white-space: pre-wrap;[\s\S]*overflow-wrap: anywhere;/);
  assert.doesNotMatch(cssSource, /\.admin-security-card[^}]*overflow-x:\s*auto/);
});
