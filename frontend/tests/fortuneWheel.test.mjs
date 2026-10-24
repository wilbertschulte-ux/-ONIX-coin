import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const typesPath = path.join(root, 'src', 'fortuneWheel', 'fortuneWheelTypes.ts');
const componentPath = path.join(root, 'src', 'fortuneWheel', 'FortuneWheelSection.tsx');
const cssPath = path.join(root, 'src', 'fortuneWheel', 'fortuneWheel.css');
const appPath = path.join(root, 'src', 'App.tsx');
const messagesPath = path.join(root, 'src', 'i18n', 'messages.ts');

function loadTypeScriptModule(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const context = vm.createContext({ module, exports: module.exports, crypto: globalThis.crypto });
  new vm.Script(compiled, { filename: filePath }).runInContext(context);
  return module.exports;
}

const wheel = loadTypeScriptModule(typesPath);

function status(overrides = {}) {
  return {
    campaignKey: 'fw-test',
    enabled: true,
    guaranteed: true,
    eligibility: { eligible: true, admitted: true, code: 'ELIGIBLE' },
    completedSpins: 0,
    nextSpin: 1,
    rewards: [
      { spin: 1, type: 'onix', amount: 50000, status: 'available' },
      { spin: 2, type: 'onix', amount: 250000, status: 'locked' },
      { spin: 3, type: 'physical_prize', prizeCode: 'iphone_duo', status: 'locked' },
    ],
    physicalPrize: {
      reserved: true,
      unlocked: false,
      requestCreated: false,
      selectionLocked: false,
      canSelectColor: false,
      colors: [],
      request: null,
    },
    ...overrides,
  };
}

test('all three server spins land on their fixed matching sectors without randomness', () => {
  let rotation = 0;
  const expectedNormalized = [0, 240, 120];
  for (const [index, spin] of [1, 2, 3].entries()) {
    rotation = wheel.getLandingRotation(spin, rotation);
    assert.ok(rotation >= (index + 1) * 4 * 360);
    assert.equal(((rotation % 360) + 360) % 360, expectedNormalized[index]);
  }
  assert.doesNotMatch(fs.readFileSync(typesPath, 'utf8'), /Math\.random/);
});

test('a pending spin keeps one idempotency key until a confirmed response clears it', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const storageKey = wheel.spinIdempotencyStorageKey('fw-test', 1);
  const first = wheel.getOrCreateIdempotencyKey(storage, storageKey);
  const networkRetry = wheel.getOrCreateIdempotencyKey(storage, storageKey);
  assert.equal(networkRetry, first);
  wheel.clearIdempotencyKey(storage, storageKey);
  assert.equal(storage.getItem(storageKey), null);
});

test('color retries have separate persistent key and choice slots', () => {
  assert.notEqual(wheel.colorIdempotencyStorageKey('fw-test'), wheel.colorChoiceStorageKey('fw-test'));
  const source = fs.readFileSync(componentPath, 'utf8');
  assert.match(source, /localStorage\.setItem\(choiceStorageKey, confirmedColor\)/);
  assert.match(source, /pendingColor && pendingColor !== selectedColor/);
  assert.match(source, /clearIdempotencyKey\(localStorage, choiceStorageKey\)/);
});

test('spin availability follows only server status and does not skip steps', () => {
  assert.equal(wheel.canRequestSpin(status()), true);
  assert.equal(wheel.canRequestSpin(status({ enabled: false })), false);
  assert.equal(wheel.canRequestSpin(status({ eligibility: { eligible: false, code: 'NO' } })), false);
  assert.equal(wheel.canRequestSpin(status({ nextSpin: 2 })), false);
});

test('color selection is offered only after server unlock and reservation', () => {
  const unlocked = status({
    completedSpins: 3,
    nextSpin: null,
    physicalPrize: {
      reserved: true,
      unlocked: true,
      requestCreated: false,
      selectionLocked: false,
      canSelectColor: true,
      colors: ['server-color'],
      request: null,
    },
  });
  assert.equal(wheel.shouldOfferColorSelection(unlocked), true);
  assert.equal(wheel.shouldOfferColorSelection({ ...unlocked, physicalPrize: { ...unlocked.physicalPrize, colors: [] } }), false);
  assert.equal(wheel.shouldOfferColorSelection({ ...unlocked, physicalPrize: { ...unlocked.physicalPrize, request: { requestId: 'r1' } } }), false);
});

test('closed campaign keeps an earned physical prize and request accessible without enabling spins', () => {
  const unlocked = status({
    enabled: false,
    eligibility: { eligible: false, admitted: true, code: 'CAMPAIGN_ENDED' },
    completedSpins: 3,
    nextSpin: null,
    physicalPrize: {
      reserved: true,
      unlocked: true,
      requestCreated: false,
      selectionLocked: false,
      canSelectColor: true,
      colors: ['server-color'],
      request: null,
    },
  });
  assert.equal(wheel.canRequestSpin(unlocked), false);
  assert.equal(wheel.shouldOfferColorSelection(unlocked), true);

  const source = fs.readFileSync(componentPath, 'utf8');
  assert.match(source, /status && \(available \|\| hasPersistedReward\)/);
  assert.match(source, /status\.physicalPrize\.request &&/);
  assert.match(source, /fortune\.closedTitle/);
});

test('component uses authenticated API endpoints, server rewards, locks and confirmation', () => {
  const source = fs.readFileSync(componentPath, 'utf8');
  assert.match(source, /axios\.get<FortuneWheelStatus>\(`\$\{apiBaseUrl\}\/fortune-wheel\/status`\)/);
  assert.match(source, /expectedSpin,\s*idempotencyKey/);
  assert.match(source, /\/fortune-wheel\/spin/);
  assert.match(source, /\/fortune-wheel\/iphone-color/);
  assert.match(source, /spinLock\.current/);
  assert.match(source, /colorLock\.current/);
  assert.match(source, /setColorConfirmationOpen\(true\)/);
  assert.match(source, /status\.physicalPrize\.colors\.map/);
  assert.match(source, /status\?\.physicalPrize\.reserved \? 'iPhone Duo' : t\('fortune\.physicalPrize'\)/);
  assert.doesNotMatch(source, /setBalance|Math\.random/);
});

test('reload, errors, unavailable campaign and accessibility states are present', () => {
  const source = fs.readFileSync(componentPath, 'utf8');
  assert.match(source, /void loadStatus\(\)/);
  assert.match(source, /!available/);
  assert.match(source, /spinError/);
  assert.match(source, /colorError/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /prefers-reduced-motion: reduce/);
});

test('home promo opens a separate screen and no bottom navigation item is added', () => {
  const source = fs.readFileSync(appPath, 'utf8');
  assert.match(source, /className="fortune-wheel-promo"/);
  assert.match(source, /if \(fortuneWheelOpen\)/);
  const navigation = source.slice(source.indexOf('<div className="onix-nav flex">'), source.indexOf("{activeTab === 'home'"));
  assert.doesNotMatch(navigation, /fortune|wheel/i);
});

test('German, Russian and German fallback catalogs contain typed fortune messages', () => {
  const source = fs.readFileSync(messagesPath, 'utf8');
  assert.match(source, /"fortune\.title": "Aktionsrad"/);
  assert.match(source, /"fortune\.title": "Колесо акции"/);
  assert.match(source, /"fortune\.closedTitle": "Aktion für neue Drehungen geschlossen"/);
  assert.match(source, /"fortune\.closedTitle": "Акция закрыта для новых вращений"/);
  assert.equal((source.match(/\.\.\.fortuneWheelGermanMessages/g) || []).length, 10);
  assert.equal((source.match(/\.\.\.fortuneWheelRussianMessages/g) || []).length, 1);
});

test('mobile layout uses Telegram viewport, safe areas and prevents horizontal overflow', () => {
  const css = fs.readFileSync(cssPath, 'utf8');
  assert.match(css, /var\(--oc-app-height, 100dvh\)/);
  assert.match(css, /env\(safe-area-inset-top\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /overflow-x:\s*hidden/);
  assert.match(css, /@media \(max-width: 374px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
