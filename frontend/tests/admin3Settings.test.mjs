import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { adminGermanMessages, adminRussianMessages } from '../src/i18n/admin.ts';
import {
  acquireAdminMutationLock,
  createAdminEconomyConfigDraft,
  createAdminEconomyConfigUpdatePayload,
  ADMIN_EXPORT_DEFINITIONS,
  getAdminEconomyConfigUpdate,
  getAdminSettingsLoadState,
  releaseAdminMutationLock,
  triggerAdminDownload,
} from '../src/admin/adminTypes.ts';

const sectionSource = readFileSync(new URL('../src/admin/sections/SettingsSection.tsx', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('../src/admin/adminApi.ts', import.meta.url), 'utf8');
const shellSource = readFileSync(new URL('../src/admin/AdminShell.tsx', import.meta.url), 'utf8');
const navigationSource = readFileSync(new URL('../src/admin/adminNavigation.ts', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../src/admin/admin.css', import.meta.url), 'utf8');
const messagesSource = readFileSync(new URL('../src/i18n/messages.ts', import.meta.url), 'utf8');

test('settings load state covers loading, error and populated behavior', () => {
  assert.equal(getAdminSettingsLoadState(true, false), 'loading');
  assert.equal(getAdminSettingsLoadState(false, true), 'error');
  assert.equal(getAdminSettingsLoadState(false, false), 'ready');
});

test('typed settings labels are complete in German and Russian and fall back to German', () => {
  assert.equal(adminGermanMessages['admin.settings.config.title'], 'Wirtschaftskonfiguration');
  assert.equal(adminRussianMessages['admin.settings.config.title'], 'Конфигурация экономики');
  assert.equal(adminRussianMessages['admin.settings.system.unavailable'], 'Недоступно');
  assert.match(messagesSource, /\.\.\.adminGermanMessages/);
});

test('export definitions preserve the required filename and media type', () => {
  assert.deepEqual(ADMIN_EXPORT_DEFINITIONS.json, { filename: 'onix-backup.json', contentType: 'application/json' });
  assert.deepEqual(ADMIN_EXPORT_DEFINITIONS.csv, { filename: 'onix-users.csv', contentType: 'text/csv' });
});

test('browser download clicks once and always releases its object URL', () => {
  const activity = [];
  const anchor = { href: '', download: '', click: () => activity.push('click') };
  const browser = { createElement: (tag) => { assert.equal(tag, 'a'); return anchor; } };
  const objectUrls = {
    createObjectURL: (blob) => { assert.equal(blob.size, 4); activity.push('create'); return 'blob:test'; },
    revokeObjectURL: (url) => { assert.equal(url, 'blob:test'); activity.push('revoke'); },
  };
  triggerAdminDownload({ blob: new Blob(['test']), ...ADMIN_EXPORT_DEFINITIONS.json }, browser, objectUrls);
  assert.equal(anchor.href, 'blob:test');
  assert.equal(anchor.download, 'onix-backup.json');
  assert.deepEqual(activity, ['create', 'click', 'revoke']);
});

test('browser download still releases its object URL when the click fails', () => {
  let revoked = false;
  const browser = { createElement: () => ({ href: '', download: '', click: () => { throw new Error('blocked'); } }) };
  const objectUrls = {
    createObjectURL: () => 'blob:blocked',
    revokeObjectURL: (url) => { assert.equal(url, 'blob:blocked'); revoked = true; },
  };
  assert.throws(
    () => triggerAdminDownload({ blob: new Blob(['test']), ...ADMIN_EXPORT_DEFINITIONS.csv }, browser, objectUrls),
    /blocked/
  );
  assert.equal(revoked, true);
});

test('export lock prevents a second submit until the first download finishes', () => {
  const lock = { current: false };
  assert.equal(acquireAdminMutationLock(lock), true);
  assert.equal(acquireAdminMutationLock(lock), false);
  releaseAdminMutationLock(lock);
  assert.equal(acquireAdminMutationLock(lock), true);
});

test('Settings uses the existing config GET/POST APIs and does not start mutations on mount', () => {
  assert.match(apiSource, /\/admin-economy-config/);
  assert.match(apiSource, /\/admin-backup/);
  assert.match(apiSource, /\/admin-export-users\.csv/);
  assert.match(apiSource, /\/version/);
  assert.match(apiSource, /axios\.post<AdminEconomyConfigResponse>/);
  assert.match(apiSource, /createAdminEconomyConfigUpdatePayload/);
  const effectBody = sectionSource.match(/useEffect\(\(\) => \{([\s\S]*?)\}, \[apiBaseUrl, adminTelegramId, synchronizeEconomy\]\);/)?.[1] || '';
  assert.match(effectBody, /loadAdminEconomyConfig/);
  assert.match(effectBody, /loadAdminVersion/);
  assert.doesNotMatch(effectBody, /downloadAdmin|triggerAdminDownload|updateAdminEconomyConfig/);
});

const economyConfig = {
  onixEurPer1000: 1.5, minWithdrawOnix: 1000, referralReward: 500,
  referredUserReward: 250, welcomeBonus: 100, maxPaidReferralsPerDay: 10,
  maxPaidReferralsPerHour: 2, chestCost: 50, dailyMissionBaseReward: 20,
  weeklyMissionBaseReward: 100, seasonPrizes: {}, upgradeBaseCosts: {}, perkBaseCosts: {},
};

test('economy config maps exact legacy keys and sends only numerically changed fields', () => {
  const saved = createAdminEconomyConfigDraft(economyConfig);
  const draft = { ...saved, onixEurPer1000: '1.50', referralReward: ' 700 ', maxPaidReferralsPerHour: '0' };
  const result = getAdminEconomyConfigUpdate(draft, saved);
  assert.deepEqual(result.changedKeys, ['referralReward', 'maxPaidReferralsPerHour']);
  assert.deepEqual(result.updates, { REFERRAL_REWARD: '700', MAX_PAID_REFERRALS_PER_HOUR: '0' });
  assert.equal(result.error, null);
  assert.deepEqual(createAdminEconomyConfigUpdatePayload('42', result.updates), {
    telegramId: '42',
    updates: { REFERRAL_REWARD: '700', MAX_PAID_REFERRALS_PER_HOUR: '0' },
  });
});

test('economy config rejects blank, negative and non-finite changed values', () => {
  const saved = createAdminEconomyConfigDraft(economyConfig);
  assert.equal(getAdminEconomyConfigUpdate({ ...saved, chestCost: '' }, saved).error, 'required');
  assert.equal(getAdminEconomyConfigUpdate({ ...saved, chestCost: '-1' }, saved).error, 'invalid');
  assert.equal(getAdminEconomyConfigUpdate({ ...saved, chestCost: 'Infinity' }, saved).error, 'invalid');
});

test('economy save uses confirmation, synchronous locking and refetches after POST', () => {
  assert.match(sectionSource, /setConfigConfirmation\(true\)/);
  assert.match(sectionSource, /acquireAdminMutationLock\(configLock\)/);
  assert.match(sectionSource, /await updateAdminEconomyConfig[\s\S]*await loadAdminEconomyConfig/);
  assert.match(sectionSource, /setConfigNotice\('success'\)/);
  assert.match(sectionSource, /setConfigNotice\('error'\)/);
});

test('economy diagnostics, runtime overrides and version fields render as read-only data', () => {
  for (const field of ['dailyMissionBaseReward', 'weeklyMissionBaseReward', 'seasonPrizes', 'upgradeBaseCosts', 'perkBaseCosts']) {
    assert.match(sectionSource, new RegExp(field));
  }
  assert.match(sectionSource, /Object\.entries\(economy\?\.overrides/);
  assert.match(sectionSource, /version\.version/);
  assert.match(sectionSource, /version\.service/);
  assert.match(sectionSource, /formatServerTime\(version\.time/);
  assert.match(sectionSource, /admin\.settings\.system\.unavailable/);
});

test('exports require confirmation and expose loading, error and success behavior', () => {
  assert.match(sectionSource, /setConfirmation\('json'\)/);
  assert.match(sectionSource, /setConfirmation\('csv'\)/);
  assert.match(sectionSource, /<ConfirmAdminAction/);
  assert.match(sectionSource, /disabled=\{downloading !== null\}/);
  assert.match(sectionSource, /setExportNotice\(\{ kind, success: true \}\)/);
  assert.match(sectionSource, /setExportNotice\(\{ kind, success: false \}\)/);
});

test('Settings is reachable and its mobile cards prevent horizontal overflow', () => {
  assert.match(shellSource, /activeSection === 'settings'/);
  assert.match(navigationSource, /id: 'settings'[\s\S]*available: true/);
  assert.match(cssSource, /\.admin-settings-panel \{[^}]*overflow: hidden/);
  assert.match(cssSource, /\.admin-settings-value-grid \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(cssSource, /\.admin-settings-value-grid pre \{[^}]*white-space: pre-wrap;[^}]*overflow-wrap: anywhere/);
  assert.doesNotMatch(cssSource, /\.admin-settings[^}]*overflow-x:\s*auto/);
});
