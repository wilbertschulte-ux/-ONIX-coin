import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  createWeeklyPrizeAwardPayload,
  getAdminWeeklyPrizeViewState,
} from '../src/admin/adminTypes.ts';

const sectionSource = readFileSync(new URL('../src/admin/sections/WeeklyPrizesSection.tsx', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('../src/admin/adminApi.ts', import.meta.url), 'utf8');
const shellSource = readFileSync(new URL('../src/admin/AdminShell.tsx', import.meta.url), 'utf8');
const navigationSource = readFileSync(new URL('../src/admin/adminNavigation.ts', import.meta.url), 'utf8');

const preview = {
  week: '2026-W40',
  alreadyAwarded: false,
  awardedAt: null,
  awardedWinners: [],
  diagnostics: {
    targetWeek: '2026-W40',
    sourceUsersCount: 2,
    materializedWeeklyScoreCount: 2,
    eligibleCount: 2,
    alreadyAwarded: false,
    winnersCount: 0,
  },
  preview: [{ place: 1, telegramId: '1', username: 'A', weeklyEarned: 100, prize: 50 }],
};

test('weekly prize state covers loading, error, empty, ready and already-awarded', () => {
  assert.equal(getAdminWeeklyPrizeViewState(true, false, null), 'loading');
  assert.equal(getAdminWeeklyPrizeViewState(false, true, null), 'error');
  assert.equal(getAdminWeeklyPrizeViewState(false, false, { ...preview, preview: [] }), 'empty');
  assert.equal(getAdminWeeklyPrizeViewState(false, false, preview), 'ready');
  assert.equal(getAdminWeeklyPrizeViewState(false, false, { ...preview, alreadyAwarded: true }), 'already-awarded');
  assert.equal(getAdminWeeklyPrizeViewState(false, false, { ...preview, alreadyAwarded: true, preview: [] }), 'already-awarded');
});

test('award payload preserves the existing backend confirmation and target week', () => {
  assert.deepEqual(createWeeklyPrizeAwardPayload('42', '2026-W40'), {
    telegramId: '42',
    confirm: 'AWARD_WEEKLY_PRIZES',
    week: '2026-W40',
  });
});

test('Admin 3.0 uses only the existing weekly preview and award endpoints', () => {
  assert.match(apiSource, /\/admin-weekly-prize-preview/);
  assert.match(apiSource, /\/admin-award-weekly-prizes/);
  assert.match(shellSource, /activeSection === 'prizes'/);
  assert.match(navigationSource, /id: 'prizes'[\s\S]*available: true/);
});

test('award requires confirmation and has a synchronous duplicate-submit guard', () => {
  assert.match(sectionSource, /<ConfirmAdminAction/);
  assert.match(sectionSource, /awardingRef\.current/);
  assert.match(sectionSource, /preview\.alreadyAwarded/);
  assert.match(sectionSource, /preview\.preview\.length === 0/);
});

test('success keeps server winners and diagnostics while failure is visible', () => {
  assert.match(sectionSource, /awardedWinners: result\.winners \|\| \[\]/);
  assert.match(sectionSource, /diagnostics: result\.diagnostics \|\| current\.diagnostics/);
  assert.match(sectionSource, /admin\.prizes\.awardSuccess/);
  assert.match(sectionSource, /admin\.prizes\.awardError/);
});
