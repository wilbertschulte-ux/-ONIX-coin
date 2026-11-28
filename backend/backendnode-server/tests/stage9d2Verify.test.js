const assert = require('node:assert/strict');
const test = require('node:test');

const {
  expandValidatedSrvUri,
  safeErrorCode,
  validateEnvironment,
} = require('../.stage9d2-verify');

function testMongoUri(host = 'onix-staging.example.test', database = 'onix_staging') {
  const credentials = ['user', 'synthetic-password'].join(':');
  return `mongodb+srv://${credentials}@${host}/${database}`;
}

function stagingEnvironment(overrides = {}) {
  return {
    ONIX_DEPLOY_ENV: 'staging',
    NODE_ENV: 'production',
    STAGING_DEPLOYMENT_CONFIRMATION: 'ONIX_STAGING_ONLY',
    TELEGRAM_WEBHOOK_SECRET: 'webhook-secret-for-staging-only',
    ADMIN_SECRET: 'admin-secret-for-staging-only-1',
    ACCOUNT_RECOVERY_SECRET: 'recovery-secret-for-staging-only',
    CRON_SECRET: 'cron-secret-for-staging-only-123',
    BOT_TOKEN: `123456789:${'x'.repeat(32)}`,
    STAGING_TELEGRAM_BOT_ID: '123456789',
    WEB_APP_URL: 'https://onix-fw-staging.example.test',
    STAGING_FRONTEND_ALLOWED_HOSTS: 'onix-fw-staging.example.test',
    MONGO_URI: testMongoUri(),
    STAGING_MONGODB_DATABASE: 'onix_staging',
    STAGING_MONGODB_ALLOWED_DATABASES: 'onix_staging',
    STAGING_MONGODB_ALLOWED_HOSTS: 'onix-staging.example.test',
    FORTUNE_WHEEL_MODE: 'weekly_random_v1',
    FORTUNE_WHEEL_CAMPAIGN_KEY: 'fortune-wheel-weekly-v1',
    FORTUNE_WHEEL_CONFIG_VERSION: 'weekly-random-v1',
    FORTUNE_WHEEL_MIGRATION_WRITE_ENABLED: 'false',
    FORTUNE_WHEEL_ENABLED: 'false',
    FORTUNE_WHEEL_CAMPAIGN_APPROVED: 'false',
    FORTUNE_WHEEL_ELIGIBLE_TELEGRAM_IDS: '90001',
    FORTUNE_WHEEL_IPHONE_COLORS: 'staging-test',
    ...overrides,
  };
}

test('accepts only an explicitly isolated weekly staging target', () => {
  const result = validateEnvironment(stagingEnvironment());
  assert.equal(result.isolation.staging, true);
  assert.equal(result.isolation.mongoDatabase, 'onix_staging');
  assert.equal(result.enabled, false);
  assert.equal(result.approved, false);
  assert.equal(result.eligibleCount, 1);
});

test('rejects production deployment and production-looking MongoDB hosts', () => {
  assert.throws(
    () => validateEnvironment(stagingEnvironment({ ONIX_DEPLOY_ENV: 'production' })),
    { code: 'STAGING_DEPLOYMENT_REQUIRED' }
  );
  assert.throws(
    () => validateEnvironment(stagingEnvironment({
      MONGO_URI: testMongoUri('onix-production.example.test'),
      STAGING_MONGODB_ALLOWED_HOSTS: 'onix-production.example.test',
    })),
    { code: 'STAGING_MONGODB_TARGET_NOT_ISOLATED' }
  );
});

test('rejects mismatched database, weekly contract, write gate, and broad eligibility', () => {
  assert.throws(
    () => validateEnvironment(stagingEnvironment({
      MONGO_URI: testMongoUri('onix-staging.example.test', 'other_staging'),
    })),
    { code: 'STAGING_MONGODB_DATABASE_FORBIDDEN' }
  );
  assert.throws(
    () => validateEnvironment(stagingEnvironment({ FORTUNE_WHEEL_MODE: 'legacy_fixed_v1' })),
    { code: 'FORTUNE_WHEEL_MODE_MISMATCH' }
  );
  assert.throws(
    () => validateEnvironment(stagingEnvironment({ FORTUNE_WHEEL_MIGRATION_WRITE_ENABLED: 'true' })),
    { code: 'FORTUNE_WHEEL_MIGRATION_WRITE_MUST_BE_DISABLED' }
  );
  assert.throws(
    () => validateEnvironment(stagingEnvironment({ FORTUNE_WHEEL_ELIGIBLE_TELEGRAM_IDS: '90001,90002' })),
    { code: 'FORTUNE_WHEEL_STAGING_ALLOWLIST_INVALID' }
  );
});

test('maps unexpected connection errors to safe codes without leaking messages', () => {
  assert.equal(
    safeErrorCode({ name: 'MongoServerSelectionError', message: 'secret-host.example' }),
    'MONGODB_SERVER_SELECTION_FAILED'
  );
  assert.equal(
    safeErrorCode({ name: 'MongooseServerSelectionError', message: 'secret-host.example' }),
    'MONGODB_SERVER_SELECTION_FAILED'
  );
  assert.equal(
    safeErrorCode({ name: 'Error', message: `mongodb://${['user', 'synthetic-password'].join(':')}@host/database` }),
    'STAGING_VERIFICATION_FAILED'
  );
});

test('SRV fallback accepts only validated sibling hosts and safe TXT options', async () => {
  const fetchImpl = async (url) => ({
    ok: true,
    async json() {
      return url.includes('type=SRV')
        ? { Status: 0, Answer: [{ data: '0 0 27017 node-00.example.test.' }] }
        : { Status: 0, Answer: [{ data: '"authSource=admin&replicaSet=staging-rs"' }] };
    },
  });
  const expanded = await expandValidatedSrvUri(testMongoUri(), fetchImpl);
  assert.match(expanded, /^mongodb:\/\//);
  assert.match(expanded, /node-00\.example\.test:27017/);
  assert.doesNotMatch(expanded, /onix-production/);
});

test('SRV fallback rejects DNS targets outside the validated parent suffix', async () => {
  const fetchImpl = async (url) => ({
    ok: true,
    async json() {
      return url.includes('type=SRV')
        ? { Status: 0, Answer: [{ data: '0 0 27017 attacker.invalid.' }] }
        : { Status: 0, Answer: [] };
    },
  });
  await assert.rejects(
    expandValidatedSrvUri(testMongoUri(), fetchImpl),
    { code: 'STAGING_DNS_SRV_TARGET_FORBIDDEN' }
  );
});
