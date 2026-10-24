import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const configPath = path.join(root, 'src', 'apiConfig.ts');
const appPath = path.join(root, 'src', 'App.tsx');
const viteConfigPath = path.join(root, 'vite.config.ts');

function loadApiConfig() {
  const source = fs.readFileSync(configPath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const context = vm.createContext({ module, exports: module.exports, URL, Set, Error });
  new vm.Script(compiled, { filename: configPath }).runInContext(context);
  return module.exports;
}

const { PRODUCTION_API_URL, resolveApiBaseUrl } = loadApiConfig();

test('production deployment preserves the existing API fallback', () => {
  assert.equal(
    resolveApiBaseUrl({
      productionBuild: true,
      hostingEnvironment: 'production',
    }),
    PRODUCTION_API_URL
  );
});

test('an explicit production API URL is normalized', () => {
  assert.equal(
    resolveApiBaseUrl({
      configuredUrl: `${PRODUCTION_API_URL}/`,
      deployEnvironment: 'production',
      productionBuild: true,
    }),
    PRODUCTION_API_URL
  );
});

test('staging and preview require an explicit API URL', () => {
  for (const environment of ['staging', 'preview']) {
    assert.throws(
      () => resolveApiBaseUrl({ deployEnvironment: environment, productionBuild: true }),
      /VITE_API_URL is required/
    );
  }
});

test('staging uses its configured API and never falls back to production', () => {
  assert.equal(
    resolveApiBaseUrl({
      configuredUrl: 'https://onix-staging.onrender.com/api/coins/',
      deployEnvironment: 'staging',
      productionBuild: true,
    }),
    'https://onix-staging.onrender.com/api/coins'
  );
  assert.throws(
    () => resolveApiBaseUrl({
      configuredUrl: PRODUCTION_API_URL,
      deployEnvironment: 'staging',
      productionBuild: true,
    }),
    /cannot use the production API/
  );
});

test('preview cannot explicitly target the production origin', () => {
  assert.throws(
    () => resolveApiBaseUrl({
      configuredUrl: PRODUCTION_API_URL,
      hostingEnvironment: 'preview',
      productionBuild: true,
    }),
    /cannot use the production API/
  );
});

test('Vercel preview context cannot be overridden by a production VITE setting', () => {
  assert.throws(
    () => resolveApiBaseUrl({
      configuredUrl: PRODUCTION_API_URL,
      deployEnvironment: 'production',
      hostingEnvironment: 'preview',
      productionBuild: true,
    }),
    /cannot use the production API/
  );
});

test('unknown and development builds fail closed without configuration', () => {
  assert.throws(
    () => resolveApiBaseUrl({ productionBuild: false }),
    /VITE_API_URL is required/
  );
  assert.throws(
    () => resolveApiBaseUrl({ hostingEnvironment: 'custom', productionBuild: true }),
    /Unsupported frontend deployment environment/
  );
});

test('VITE_API_URL rejects credentials and secret-bearing URL components', () => {
  for (const configuredUrl of [
    'https://user:password@staging.example/api/coins',
    'https://staging.example/api/coins?token=secret',
    'https://staging.example/api/coins#secret',
  ]) {
    assert.throws(
      () => resolveApiBaseUrl({
        configuredUrl,
        deployEnvironment: 'staging',
        productionBuild: true,
      }),
      /must not contain credentials, query parameters, or fragments/
    );
  }
});

test('all frontend clients receive the single resolved API base', () => {
  const appSource = fs.readFileSync(appPath, 'utf8');
  assert.match(appSource, /const API_URL = resolveApiBaseUrl\(/);
  assert.doesNotMatch(appSource, /const API_URL = ['"]https:\/\//);
  assert.match(appSource, /apiBaseUrl=\{API_URL\}/);
  assert.match(appSource, /fetch\(`\$\{API_URL\}/);
  assert.match(appSource, /axios\.(?:get|post)\(`\$\{API_URL\}/);
});

test('Vercel deployment context is embedded at build time', () => {
  const viteConfigSource = fs.readFileSync(viteConfigPath, 'utf8');
  assert.match(viteConfigSource, /process\.env\.VERCEL_ENV/);
  assert.match(viteConfigSource, /__ONIX_HOSTING_ENV__/);
});
