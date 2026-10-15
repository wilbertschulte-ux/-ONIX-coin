import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { adminGermanMessages, adminRussianMessages } from '../src/i18n/admin.ts';
import {
  acquireAdminMutationLock,
  canSendAdminBroadcast,
  createAdminBroadcastPayload,
  isAdminBroadcastMessageValid,
  releaseAdminMutationLock,
} from '../src/admin/adminTypes.ts';

const sectionSource = readFileSync(new URL('../src/admin/sections/BroadcastSection.tsx', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('../src/admin/adminApi.ts', import.meta.url), 'utf8');
const shellSource = readFileSync(new URL('../src/admin/AdminShell.tsx', import.meta.url), 'utf8');
const navigationSource = readFileSync(new URL('../src/admin/adminNavigation.ts', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../src/admin/admin.css', import.meta.url), 'utf8');
const backendSource = readFileSync(new URL('../../backend/backendnode-server/routes/coinRoutes.js', import.meta.url), 'utf8');

const dryRunResult = { dryRun: true, recipients: 25, sent: 0, failed: 0 };

test('broadcast validation rejects an empty message and preserves user content in the API payload', () => {
  assert.equal(isAdminBroadcastMessageValid('   '), false);
  assert.equal(isAdminBroadcastMessageValid('<b>Hello</b>\nWorld'), true);
  assert.deepEqual(
    createAdminBroadcastPayload('42', '  <b>Hello</b>\nWorld  ', true),
    { telegramId: '42', message: '  <b>Hello</b>\nWorld  ', dryRun: true }
  );
});

test('real send is enabled only by a successful dry run for the unchanged message', () => {
  assert.equal(canSendAdminBroadcast('Hello', null, null, false), false);
  assert.equal(canSendAdminBroadcast('Hello', 'Hello', dryRunResult, false), true);
  assert.equal(canSendAdminBroadcast('Changed', 'Hello', dryRunResult, false), false);
  assert.equal(canSendAdminBroadcast('Hello', 'Hello', { ...dryRunResult, dryRun: false }, false), false);
  assert.equal(canSendAdminBroadcast('Hello', 'Hello', dryRunResult, true), false);
});

test('one synchronous request lock protects dry run and send from double submit', () => {
  const lock = { current: false };
  assert.equal(acquireAdminMutationLock(lock), true);
  assert.equal(acquireAdminMutationLock(lock), false);
  releaseAdminMutationLock(lock);
  assert.equal(acquireAdminMutationLock(lock), true);
});

test('backend dry run returns recipient counts before BOT_TOKEN lookup or Telegram sendMessage', () => {
  const route = backendSource.slice(
    backendSource.indexOf("router.post('/admin-broadcast'"),
    backendSource.indexOf("router.get('/admin-export-users.csv'")
  );
  const dryRunBranch = route.indexOf('if (dryRun)');
  const botTokenLookup = route.indexOf('process.env.BOT_TOKEN');
  const telegramCall = route.indexOf('/sendMessage');
  assert.ok(dryRunBranch >= 0);
  assert.ok(botTokenLookup > dryRunBranch);
  assert.ok(telegramCall > botTokenLookup);
  assert.match(route, /dryRun:\s*true,[\s\S]*recipients:\s*users\.length,[\s\S]*sent:\s*0,[\s\S]*failed:\s*0/);
});

test('Admin 3.0 uses the existing endpoint for distinct dry-run and real-send requests', () => {
  assert.match(apiSource, /\/admin-broadcast/);
  assert.match(sectionSource, /runAdminBroadcast\(apiBaseUrl, adminTelegramId, message, true\)/);
  assert.match(sectionSource, /runAdminBroadcast\(apiBaseUrl, adminTelegramId, message, false\)/);
  assert.doesNotMatch(sectionSource, /useEffect/);
  assert.doesNotMatch(apiSource, /ADMIN_SECRET/);
});

test('send requires confirmation and locks the form after a successful response', () => {
  assert.match(sectionSource, /<ConfirmAdminAction/);
  assert.match(sectionSource, /setConfirmationOpen\(true\)/);
  assert.match(sectionSource, /if \(result\.dryRun\) throw/);
  assert.match(sectionSource, /setSendResult\(result\);[\s\S]*setCompleted\(true\)/);
  assert.match(sectionSource, /disabled=\{busy !== null \|\| completed\}/);
  assert.match(sectionSource, /disabled=\{!sendReady \|\| busy !== null\}/);
});

test('result renders the exact recipient, sent and failed counters returned by the server', () => {
  assert.match(sectionSource, /sendResult\.recipients/);
  assert.match(sectionSource, /sendResult\.sent/);
  assert.match(sectionSource, /sendResult\.failed/);
  assert.match(sectionSource, /requestError\.detail/);
});

test('broadcast labels are typed in German and Russian', () => {
  assert.equal(adminGermanMessages['admin.broadcast.send'], 'Rundsendung senden');
  assert.equal(adminRussianMessages['admin.broadcast.send'], 'Отправка рассылки');
  assert.equal(adminRussianMessages['admin.broadcast.confirmSend'], 'Отправить сейчас');
});

test('Broadcast is reachable and mobile cards wrap content without horizontal scrolling', () => {
  assert.match(shellSource, /activeSection === 'broadcast'/);
  assert.match(navigationSource, /id: 'broadcast'[\s\S]*available: true/);
  assert.match(cssSource, /\.admin-broadcast-panel \{[^}]*overflow: hidden/);
  assert.match(cssSource, /\.admin-broadcast-message-field textarea \{[^}]*overflow-wrap: anywhere;[^}]*white-space: pre-wrap/);
  assert.match(cssSource, /\.admin-broadcast-result-grid \{[^}]*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(cssSource, /\.admin-broadcast[^}]*overflow-x:\s*auto/);
});
