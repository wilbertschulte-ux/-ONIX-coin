import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const typesPath = path.join(root, 'src', 'fortuneWheel', 'fortuneWheelTypes.ts');
const componentPath = path.join(root, 'src', 'fortuneWheel', 'FortuneWheelSection.tsx');
const premiumWheelPath = path.join(root, 'src', 'fortuneWheel', 'components', 'PremiumWheel.tsx');
const resultScreenPath = path.join(root, 'src', 'fortuneWheel', 'components', 'RewardResultScreen.tsx');
const presentationPath = path.join(root, 'src', 'fortuneWheel', 'fortuneWheelPresentation.ts');
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
const presentation = loadTypeScriptModule(presentationPath);

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
  const pointerAngle = 270;
  const expectedNormalized = [270, 150, 30];
  const expectedSectorCenters = [0, 120, 240];
  for (const [index, spin] of [1, 2, 3].entries()) {
    rotation = wheel.getLandingRotation(spin, rotation);
    const normalizedRotation = ((rotation % 360) + 360) % 360;
    const sectorUnderPointer = (pointerAngle - normalizedRotation + 360) % 360;
    assert.ok(rotation >= (index + 1) * 4 * 360);
    assert.equal(normalizedRotation, expectedNormalized[index]);
    assert.equal(sectorUnderPointer, expectedSectorCenters[index]);
  }
  assert.doesNotMatch(fs.readFileSync(typesPath, 'utf8'), /Math\.random/);
});

test('one shared sector manifest drives SVG geometry and landing calculations', () => {
  const manifest = Array.from(wheel.FORTUNE_WHEEL_SECTORS);
  assert.equal(manifest.length, 6);
  assert.deepEqual(
    manifest.filter((sector) => sector.primary).map(({ spin, centerAngle, kind }) => ({ spin, centerAngle, kind })),
    [
      { spin: 1, centerAngle: 0, kind: 'onix-50k' },
      { spin: 2, centerAngle: 120, kind: 'onix-250k' },
      { spin: 3, centerAngle: 240, kind: 'iphone-duo' },
    ]
  );
  assert.equal(wheel.FORTUNE_WHEEL_POINTER_ANGLE, 270);

  const premiumSource = fs.readFileSync(premiumWheelPath, 'utf8');
  assert.match(premiumSource, /FORTUNE_WHEEL_SECTORS\.map/);
  assert.match(premiumSource, /className="premium-wheel-pointer"/);
  assert.match(premiumSource, /sectorPath\(sector\)/);
  assert.doesNotMatch(premiumSource, /Math\.random|response\.claim|axios/);
});

test('premium SVG labels stay horizontal and use lightweight reward icons', () => {
  const source = fs.readFileSync(premiumWheelPath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');
  assert.match(source, /--label-counter-rotation/);
  assert.match(source, /`\$\{-rotation\}deg`/);
  assert.match(source, /premium-wheel-sector-icon is-onix/);
  assert.match(source, /premium-wheel-sector-icon is-phone/);
  assert.match(source, /premium-wheel-emblem[^>]*>ONIX</);
  assert.match(source, /Array\.from\(\{ length: 18 \}/);
  assert.match(css, /\.premium-wheel-label\s*\{[^}]*rotate\(var\(--label-counter-rotation\)\)/);
  assert.doesNotMatch(source, /rotate\(\$\{sector\.centerAngle \+ 90\}\)/);
  assert.doesNotMatch(source, /<image|\.png|\.webp|\.jpe?g/i);
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

test('server claim stops, highlights, and only then opens the dedicated result screen', () => {
  const source = fs.readFileSync(componentPath, 'utf8');
  const resultSource = fs.readFileSync(resultScreenPath, 'utf8');
  assert.match(source, /getLandingRotation\(response\.data\.claim\.spin, current\)/);
  assert.match(source, /setHighlightedSpin\(claim\.spin\)/);
  assert.match(source, /WINNER_HIGHLIGHT_MS/);
  assert.match(source, /setResult\(claim\)/);
  assert.match(source, /setHighlightedSpin\(claim\.spin\);[^]*?setTimeout\([^]*?finishSpinAnimation\(claim\)/);
  assert.match(source, /<RewardResultScreen/);
  assert.match(resultSource, /Number\(claim\.amount \|\| 0\)\.toLocaleString\(locale\)/);
  assert.match(resultSource, /claim\.rewardType === 'onix'/);
  assert.match(resultSource, /data-result-spin=\{claim\.spin\}/);
  assert.doesNotMatch(resultSource, /50000|250000|Math\.random/);
});

test('persisted server progress remains authoritative and never auto-starts a spin', () => {
  const source = fs.readFileSync(componentPath, 'utf8');
  assert.match(source, /status\.completedSpins > 0/);
  assert.match(source, /status\.rewards\.map/);
  assert.match(source, /status\.physicalPrize\.request &&/);
  assert.match(source, /disabled=\{!canRequestSpin\(status\) \|\| wheelBusy\}/);
  assert.match(source, /onSpin=\{\(\) => void spin\(\)\}/);
});

test('physical prize presentation hides technical codes without changing server values', () => {
  assert.equal(JSON.stringify(presentation.getPrizeColorDisplay('staging-test', ['staging-test'])), JSON.stringify({ kind: 'staging' }));
  assert.equal(JSON.stringify(presentation.getPrizeColorDisplay('space_black', ['space_black', 'gold'])), JSON.stringify({ kind: 'option', number: 1 }));
  assert.equal(JSON.stringify(presentation.getPrizeColorDisplay('Gold', ['Gold'])), JSON.stringify({ kind: 'literal', value: 'Gold' }));
  assert.equal(presentation.getPrizeRequestStatusKey('pending'), 'pending');
  assert.equal(presentation.getPrizeRequestStatusKey('internal-new-state'), 'processing');

  const source = fs.readFileSync(componentPath, 'utf8');
  assert.match(source, /getPrizeColorDisplay\(color, status\?\.physicalPrize\.colors \?\? \[\]\)/);
  assert.match(source, /\{ color: confirmedColor, idempotencyKey \}/);
  assert.match(source, /fortune\.requestStatus\./);
  assert.doesNotMatch(source, /<dd>\{status\.physicalPrize\.request\.color\}<\/dd>/);
  assert.doesNotMatch(source, /<strong>\{status\.physicalPrize\.request\.status\}<\/strong>/);
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
  assert.match(source, /"fortune\.resultOnixTitle": "Deine garantierte Belohnung"/);
  assert.match(source, /"fortune\.resultOnixTitle": "Ваша гарантированная награда"/);
  assert.match(source, /"fortune\.colorStagingTest": "Testfarbe"/);
  assert.match(source, /"fortune\.colorStagingTest": "Тестовый цвет"/);
  assert.match(source, /"fortune\.requestStatus\.pending": "Wird geprüft"/);
  assert.match(source, /"fortune\.requestStatus\.pending": "На проверке"/);
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
  assert.match(css, /width:\s*clamp\(276px, 82vw, 356px\)/);
  assert.match(css, /\.premium-wheel-stage/);
  assert.match(css, /\.fortune-result-screen/);
  assert.match(css, /\.fortune-wheel-progress\s*\{[^}]*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.fortune-wheel-progress::before/);
  assert.match(css, /\.fortune-wheel-request header/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
