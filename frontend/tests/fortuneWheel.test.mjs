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
const progressPath = path.join(root, 'src', 'fortuneWheel', 'components', 'RewardProgress.tsx');
const prizeCardPath = path.join(root, 'src', 'fortuneWheel', 'components', 'PhysicalPrizeCard.tsx');
const presentationPath = path.join(root, 'src', 'fortuneWheel', 'fortuneWheelPresentation.ts');
const previewPath = path.join(root, 'src', 'fortuneWheel', 'FortuneWheelPreview.tsx');
const previewEntryPath = path.join(root, 'src', 'fortuneWheel', 'preview.tsx');
const previewHtmlPath = path.join(root, 'fortune-wheel-preview.html');
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

function weeklyStatus(overrides = {}) {
  return {
    mode: 'weekly_random_v1', campaignKey: 'fortune-wheel-weekly-v1', enabled: true, guaranteed: false,
    serverTime: '2026-11-04T12:00:00.000Z', weekKey: '2026-11-02', resetsAt: '2026-11-09T00:00:00.000Z',
    eligibility: { eligible: true, code: 'ELIGIBLE' }, spins: { limit: 3, used: 1, remaining: 2 }, claims: [],
    prizes: [
      { code: 'onix_5000', type: 'onix', amount: 5000, prizeCode: '', configuredWeightPpm: 350000, effectiveWeightPpm: 350000, available: true },
      { code: 'iphone_duo', type: 'physical_prize', amount: 0, prizeCode: 'iphone_duo', configuredWeightPpm: 49000, effectiveWeightPpm: 49000, available: true },
    ], inventory: { capacity: 100, reserved: 1, fulfilled: 0, remaining: 99 },
    physicalPrize: { alreadyOwned: false, unlocked: false, canSelectColor: false, colors: [], requests: [] },
    ...overrides,
  };
}

test('all six server reward codes land under the fixed pointer without client randomness', () => {
  let rotation = 0;
  for (const [index, sector] of Array.from(wheel.FORTUNE_WHEEL_SECTORS).entries()) {
    rotation = wheel.getLandingRotationByRewardCode(sector.rewardCode, rotation);
    const normalizedRotation = ((rotation % 360) + 360) % 360;
    const sectorUnderPointer = (wheel.FORTUNE_WHEEL_POINTER_ANGLE - normalizedRotation + 360) % 360;
    assert.ok(rotation >= (index + 1) * 4 * 360);
    assert.equal(sectorUnderPointer, sector.centerAngle);
  }
  assert.doesNotMatch(fs.readFileSync(typesPath, 'utf8'), /Math\.random/);
});

test('one shared sector manifest drives SVG geometry and landing calculations', () => {
  const manifest = Array.from(wheel.FORTUNE_WHEEL_SECTORS);
  assert.equal(manifest.length, 6);
  assert.deepEqual(manifest.map(({ rewardCode }) => rewardCode), ['onix_5000', 'onix_10000', 'onix_25000', 'onix_50000', 'onix_250000', 'iphone_duo']);
  assert.equal(wheel.FORTUNE_WHEEL_POINTER_ANGLE, 270);

  const premiumSource = fs.readFileSync(premiumWheelPath, 'utf8');
  assert.match(premiumSource, /sectors\.map/);
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
  assert.match(source, /premium-wheel-emblem/);
  assert.match(source, /<i>O<\/i><b>ONIX<\/b>/);
  assert.match(source, /Array\.from\(\{ length: 18 \}/);
  assert.match(source, /premium-wheel-glass/);
  assert.match(source, /premium-wheel-emblem/);
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
  const storageKey = wheel.spinIdempotencyStorageKey('fw-test', '2026-11-02', 1);
  assert.match(storageKey, /fw-test:2026-11-02:1$/);
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

test('weekly status controls remaining spins, week-scoped idempotency and prior-week color rights', () => {
  const active = weeklyStatus();
  assert.equal(wheel.canRequestSpin(active), true);
  assert.equal(wheel.getExpectedSpin(active), 2);
  assert.equal(wheel.canRequestSpin(weeklyStatus({ spins: { limit: 3, used: 3, remaining: 0 } })), false);
  const unlocked = weeklyStatus({
    physicalPrize: { alreadyOwned: true, unlocked: true, canSelectColor: true, colors: ['server-color'], requests: [] },
  });
  assert.equal(wheel.shouldOfferColorSelection(unlocked), true);
  assert.equal(wheel.shouldOfferColorSelection({
    ...unlocked, physicalPrize: { ...unlocked.physicalPrize, requests: [{ requestId: 'existing' }] },
  }), false);
  assert.notEqual(
    wheel.spinIdempotencyStorageKey(active.campaignKey, active.weekKey, 1),
    wheel.spinIdempotencyStorageKey(active.campaignKey, '2026-11-09', 1)
  );
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
  assert.match(source, /getPhysicalPrizeRequests\(status\)/);
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
  assert.match(source, /colors\.map/);
  assert.match(source, /status\.physicalPrize\.alreadyOwned/);
  assert.doesNotMatch(source, /setBalance|Math\.random/);
});

test('server claim stops, highlights, and only then opens the dedicated result screen', () => {
  const source = fs.readFileSync(componentPath, 'utf8');
  const resultSource = fs.readFileSync(resultScreenPath, 'utf8');
  assert.match(source, /getLandingRotationByRewardCode\(getClaimRewardCode\(response\.data\.claim\), current\)/);
  assert.match(source, /setHighlightedRewardCode\(getClaimRewardCode\(claim\)\)/);
  assert.match(source, /WINNER_HIGHLIGHT_MS/);
  assert.match(source, /setResult\(claim\)/);
  assert.match(source, /setHighlightedRewardCode\(getClaimRewardCode\(claim\)\);[^]*?setTimeout\([^]*?finishSpinAnimation\(claim\)/);
  assert.match(source, /<RewardResultScreen/);
  assert.match(resultSource, /Number\(claim\.amount \|\| 0\)\.toLocaleString\(locale\)/);
  assert.match(resultSource, /claim\.rewardType === 'onix'/);
  assert.match(resultSource, /data-result-spin=\{claim\.spin\}/);
  assert.doesNotMatch(resultSource, /50000|250000|Math\.random/);
});

test('persisted server progress remains authoritative and never auto-starts a spin', () => {
  const source = fs.readFileSync(componentPath, 'utf8');
  assert.match(source, /status\.claims\.length > 0/);
  assert.match(source, /<RewardProgress/);
  assert.match(source, /getPhysicalPrizeRequests\(status\)/);
  assert.match(source, /status\.spins\.remaining/);
  assert.match(source, /disabled=\{!canRequestSpin\(status\) \|\| wheelBusy\}/);
  assert.match(source, /onSpin=\{\(\) => void spin\(\)\}/);
});

test('reward progress and physical prize card are shared presentation components', () => {
  const source = fs.readFileSync(componentPath, 'utf8');
  const progressSource = fs.readFileSync(progressPath, 'utf8');
  const prizeSource = fs.readFileSync(prizeCardPath, 'utf8');
  assert.match(source, /<RewardProgress/);
  assert.match(source, /<PhysicalPrizeCard/);
  assert.match(progressSource, /role="list"/);
  assert.match(progressSource, /role="listitem"/);
  assert.match(prizeSource, /getPrizeRequestStatusKey\(request\.status\)/);
  assert.doesNotMatch(progressSource + prizeSource, /axios|fetch\(|XMLHttpRequest/);
});

test('isolated visual preview covers weekly limits, all rewards and recovery states without any API client', () => {
  const source = fs.readFileSync(previewPath, 'utf8');
  const entry = fs.readFileSync(previewEntryPath, 'utf8');
  const html = fs.readFileSync(previewHtmlPath, 'utf8');
  assert.match(source, /data-mock-only="true"/);
  assert.match(source, /'spins-3', 'spins-2', 'spins-1', 'spins-0'/);
  for (const amount of [5000, 10000, 25000, 50000, 250000]) assert.match(source, new RegExp(`amount: ${amount}`));
  assert.match(source, /rewardType: 'physical_prize'/);
  assert.match(source, /'color', 'request', 'iphone-unavailable', 'new-week', 'loading', 'error'/);
  assert.match(source, /<PremiumWheel/);
  assert.match(source, /<RewardResultScreen/);
  assert.match(source, /<PhysicalPrizeCard/);
  assert.match(entry, /<FortuneWheelPreview/);
  assert.match(html, /fortune-wheel-preview\.html|Mock Preview/);
  assert.doesNotMatch(source + entry + html, /axios|fetch\(|XMLHttpRequest|onrender\.com|\/fortune-wheel\/spin/);
});

test('physical prize presentation hides technical codes without changing server values', () => {
  assert.equal(JSON.stringify(presentation.getPrizeColorDisplay('staging-test', ['staging-test'])), JSON.stringify({ kind: 'staging' }));
  assert.equal(JSON.stringify(presentation.getPrizeColorDisplay('space_black', ['space_black', 'gold'])), JSON.stringify({ kind: 'option', number: 1 }));
  assert.equal(JSON.stringify(presentation.getPrizeColorDisplay('Gold', ['Gold'])), JSON.stringify({ kind: 'literal', value: 'Gold' }));
  assert.equal(presentation.getPrizeRequestStatusKey('pending'), 'pending');
  assert.equal(presentation.getPrizeRequestStatusKey('internal-new-state'), 'processing');

  const source = fs.readFileSync(componentPath, 'utf8');
  assert.match(source, /getPrizeColorDisplay\(color, colors\)/);
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
  assert.match(source, /"fortune\.preview\.safe": "Nur Mock-Daten · keine API-Anfragen"/);
  assert.match(source, /"fortune\.preview\.safe": "Только mock-данные · без API-запросов"/);
  assert.match(source, /"fortune\.weeklyTitle": "3 Ziehungen pro Woche"/);
  assert.match(source, /"fortune\.weeklyTitle": "3 вращения в неделю"/);
  assert.match(source, /"fortune\.visualOddsNotice": "Das Rad ist eine Animation/);
  assert.match(source, /"fortune\.visualOddsNotice": "Колесо является анимацией/);
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
  assert.match(css, /width:\s*clamp\(292px, 91vw, 420px\)/);
  assert.match(css, /\.premium-wheel-stage/);
  assert.match(css, /\.fortune-result-screen/);
  assert.match(css, /\.fortune-wheel-progress\s*\{[^}]*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.fortune-wheel-progress::before/);
  assert.match(css, /\.fortune-wheel-request header/);
  assert.match(css, /@media \(min-width: 375px\) and \(max-width: 430px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
