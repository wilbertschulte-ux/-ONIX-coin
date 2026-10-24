import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const typesPath = path.join(root, 'src', 'admin', 'adminTypes.ts');
const apiPath = path.join(root, 'src', 'admin', 'adminApi.ts');
const sectionPath = path.join(root, 'src', 'admin', 'sections', 'PhysicalPrizesSection.tsx');
const shellPath = path.join(root, 'src', 'admin', 'AdminShell.tsx');
const navigationPath = path.join(root, 'src', 'admin', 'adminNavigation.ts');
const cssPath = path.join(root, 'src', 'admin', 'admin.css');
const i18nPath = path.join(root, 'src', 'i18n', 'admin.ts');

function loadTypes() {
  const source = fs.readFileSync(typesPath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const context = vm.createContext({ module, exports: module.exports });
  new vm.Script(compiled, { filename: typesPath }).runInContext(context);
  return module.exports;
}

const helpers = loadTypes();
const request = {
  requestId: 'request-1', campaignKey: 'campaign', telegramId: '9001', telegramUsername: 'winner',
  prizeCode: 'iphone_duo', color: 'gold', status: 'pending', createdAt: null, updatedAt: null,
  reviewedAt: null, reviewedBy: '', version: 4, statusHistory: [], allowedTransitions: ['approved'],
};

test('list parameters preserve status, sort and bounded pagination while trimming search', () => {
  const params = helpers.createAdminPhysicalPrizeListParams('9000', {
    status: 'pending', search: '  request-1  ', sort: 'oldest', page: -2,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(params)), {
    telegramId: '9000', status: 'pending', search: 'request-1', sort: 'oldest', page: 1, limit: 20,
  });
});

test('status and color payloads carry optimistic version and one idempotency key', () => {
  const statusPayload = helpers.createAdminPhysicalPrizeStatusPayload(
    '9000', request, 'approved', 'Verified', '', '', 'status-operation-1'
  );
  assert.equal(statusPayload.expectedVersion, 4);
  assert.equal(statusPayload.idempotencyKey, 'status-operation-1');
  assert.equal(statusPayload.nextStatus, 'approved');
  const colorPayload = helpers.createAdminPhysicalPrizeColorPayload(
    '9000', request, 'midnight', 'Support correction', 'color-operation-1'
  );
  assert.equal(colorPayload.expectedVersion, 4);
  assert.equal(colorPayload.color, 'midnight');
});

test('Admin 3.0 uses only the protected physical prize list and mutation endpoints', () => {
  const api = fs.readFileSync(apiPath, 'utf8');
  assert.match(api, /\/admin-physical-prizes`/);
  assert.match(api, /\/admin-physical-prizes\/\$\{encodeURIComponent\(request\.requestId\)\}\/status/);
  assert.match(api, /\/admin-physical-prizes\/\$\{encodeURIComponent\(request\.requestId\)\}\/color/);
  assert.doesNotMatch(api, /ADMIN_SECRET|secret:/);
});

test('section supports filters, pagination, cards and full expandable audit history', () => {
  const source = fs.readFileSync(sectionPath, 'utf8');
  assert.match(source, /admin-physical-prize-filters/);
  assert.match(source, /request\.requestId/);
  assert.match(source, /request\.telegramId/);
  assert.match(source, /request\.telegramUsername/);
  assert.match(source, /request\.updatedAt/);
  assert.match(source, /request\.statusHistory/);
  assert.match(source, /<details className="admin-physical-prize-history">/);
  assert.match(source, /hasNextPage/);
  assert.match(source, /hasPrevPage/);
});

test('every mutation requires confirmation and a synchronous duplicate-submit lock', () => {
  const source = fs.readFileSync(sectionPath, 'utf8');
  assert.match(source, /mutationLock\.current/);
  assert.match(source, /if \(!draft \|\| !draftValid \|\| mutationLock\.current\) return/);
  assert.match(source, /<ConfirmAdminAction/);
  assert.match(source, /setConfirmOpen\(true\)/);
});

test('cancellation and color correction require documented input from server options', () => {
  const source = fs.readFileSync(sectionPath, 'utf8');
  assert.match(source, /data\?\.filters\.cancellationReasons/);
  assert.match(source, /data\?\.filters\.availableColors/);
  assert.match(source, /draft\.resolution\.trim\(\)\.length >= 3/);
  assert.match(source, /draft\.reason\.trim\(\)\.length >= 3/);
  assert.doesNotMatch(source, /address|shippingAddress/i);
});

test('navigation and shell expose one integrated Physical Prizes section', () => {
  const navigation = fs.readFileSync(navigationPath, 'utf8');
  const shell = fs.readFileSync(shellPath, 'utf8');
  assert.equal((navigation.match(/id: 'physical-prizes'/g) || []).length, 1);
  assert.match(shell, /<PhysicalPrizesSection/);
  assert.match(shell, /activeSection === 'physical-prizes'/);
});

test('German and Russian typed labels exist and other languages retain German admin fallback', () => {
  const source = fs.readFileSync(i18nPath, 'utf8');
  assert.match(source, /"admin\.shell\.physicalPrizes": "Physische Prämien"/);
  assert.match(source, /"admin\.shell\.physicalPrizes": "Физические призы"/);
  assert.match(source, /adminRussianMessages[\s\S]*satisfies Record<AdminMessageKey, string>/);
  const messages = fs.readFileSync(path.join(root, 'src', 'i18n', 'messages.ts'), 'utf8');
  assert.ok((messages.match(/\.\.\.adminGermanMessages/g) || []).length >= 9);
});

test('mobile cards wrap long values and avoid horizontal table layouts', () => {
  const css = fs.readFileSync(cssPath, 'utf8');
  assert.match(css, /\.admin-physical-prize-list[\s\S]*grid-template-columns/);
  assert.match(css, /\.admin-physical-prize-card[\s\S]*min-width:\s*0/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /@media \(max-width: 480px\)[\s\S]*\.admin-physical-prize-facts/);
});
