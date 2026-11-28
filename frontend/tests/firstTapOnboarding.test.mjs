import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  FIRST_TAP_ONBOARDING_STORAGE_KEY,
  markFirstTapOnboardingComplete,
  shouldShowFirstTapCoachmark,
} from '../src/firstTapOnboarding.ts';

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const messagesSource = readFileSync(new URL('../src/i18n/messages.ts', import.meta.url), 'utf8');
const backendSource = readFileSync(
  new URL('../../backend/backendnode-server/routes/coinRoutes.js', import.meta.url),
  'utf8'
);

test('new devices show the coachmark and completed devices skip it', () => {
  assert.equal(shouldShowFirstTapCoachmark(null), true);
  assert.equal(shouldShowFirstTapCoachmark('true'), false);
});

test('completion writes the existing tutorial storage contract', () => {
  const writes = [];
  markFirstTapOnboardingComplete({
    setItem(key, value) {
      writes.push([key, value]);
    },
  });
  assert.deepEqual(writes, [[FIRST_TAP_ONBOARDING_STORAGE_KEY, 'true']]);
});

test('the real coin and TAP button keep the existing handleTap path while the coachmark is visible', () => {
  assert.match(appSource, /data-onix-first-tap-coachmark="true"/);
  assert.equal((appSource.match(/onClick=\{handleTap\}/g) || []).length, 2);
  assert.doesNotMatch(appSource, /onix-first-tap[^\n]*axios\.post/);
});

test('only the successful tap branch completes onboarding', () => {
  const handler = appSource.slice(
    appSource.indexOf('const handleTap = async'),
    appSource.indexOf('const syncGrowthUser')
  );
  const requestIndex = handler.indexOf("axios.post(`${API_URL}/tap`");
  const completionIndex = handler.indexOf('markFirstTapOnboardingComplete(localStorage)');
  const catchIndex = handler.indexOf('} catch (error: any)');
  assert.ok(requestIndex >= 0);
  assert.ok(completionIndex > requestIndex && completionIndex < catchIndex);
  assert.doesNotMatch(handler.slice(catchIndex), /markFirstTapOnboardingComplete/);
});

test('skip remains available and the optional tutorial can be reopened later', () => {
  assert.match(appSource, /aria-label=\{t\('tutorial\.skip'\)\}[\s\S]*?onClick=\{closeTutorial\}/);
  assert.match(appSource, /onClick=\{openTutorialGuide\}/);
  assert.match(appSource, /tutorialSteps\.map/);
});

test('coachmark has German and Russian copy with German text for other language fallbacks', () => {
  assert.equal(
    (messagesSource.match(/"tutorial\.tap\.coachmark": "Tippe auf die Münze, um ONIX zu verdienen"/g) || []).length,
    9
  );
  assert.equal(
    (messagesSource.match(/"tutorial\.tap\.coachmark": "Нажми на монету, чтобы заработать ONIX"/g) || []).length,
    1
  );
});

test('coachmark stays within the Home width and does not add a blocking viewport overlay', () => {
  const coachmark = appSource.slice(
    appSource.indexOf('data-onix-first-tap-coachmark="true"') - 200,
    appSource.indexOf('data-onix-first-tap-coachmark="true"') + 1200
  );
  assert.match(coachmark, /w-full max-w-sm/);
  assert.doesNotMatch(coachmark, /fixed|inset-0|overflow-x/);
});

test('existing backend first_tap behavior and event types remain unchanged', () => {
  assert.match(backendSource, /event:\s*'first_tap'/);
  assert.equal((backendSource.match(/event:\s*'first_tap'/g) || []).length, 1);
});
