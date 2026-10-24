const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const {
  DeploymentIsolationError,
  REQUIRED_STAGING_SECRETS,
  STAGING_CONFIRMATION,
  createDeploymentIsolationConfig,
  verifyStagingTelegramBotIdentity,
} = require('../deploymentIsolation');

const STAGING_BOT_ID = '900001';
const STAGING_BOT_TOKEN = `${STAGING_BOT_ID}:abcdefghijklmnopqrstuvwxyz_123456789`;

function stagingEnvironment(overrides = {}) {
  return {
    ONIX_DEPLOY_ENV: 'staging',
    STAGING_DEPLOYMENT_CONFIRMATION: STAGING_CONFIRMATION,
    MONGO_URI:
      'mongodb+srv://staging-user:staging-password@onix-staging.example.mongodb.net/onix_staging?retryWrites=true&w=majority',
    STAGING_MONGODB_DATABASE: 'onix_staging',
    STAGING_MONGODB_ALLOWED_DATABASES: 'onix_staging',
    STAGING_MONGODB_ALLOWED_HOSTS: 'onix-staging.example.mongodb.net',
    BOT_TOKEN: STAGING_BOT_TOKEN,
    STAGING_TELEGRAM_BOT_ID: STAGING_BOT_ID,
    WEB_APP_URL: 'https://onix-staging.example.test',
    STAGING_FRONTEND_ALLOWED_HOSTS: 'onix-staging.example.test',
    TELEGRAM_WEBHOOK_SECRET: 'staging-webhook-secret-000001',
    ADMIN_SECRET: 'staging-admin-secret-000000002',
    ACCOUNT_RECOVERY_SECRET: 'staging-recovery-secret-000003',
    CRON_SECRET: 'staging-cron-secret-0000000004',
    ...overrides,
  };
}

function assertIsolationCode(callback, expectedCode) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof DeploymentIsolationError);
    assert.equal(error.code, expectedCode);
    return true;
  });
}

test('valid staging configuration pins database, hosts, frontend and bot identity', () => {
  const config = createDeploymentIsolationConfig(stagingEnvironment());

  assert.equal(config.environment, 'staging');
  assert.equal(config.staging, true);
  assert.equal(config.mongoDatabase, 'onix_staging');
  assert.deepEqual([...config.mongoHosts], ['onix-staging.example.mongodb.net']);
  assert.equal(config.expectedBotId, STAGING_BOT_ID);
  assert.equal(config.frontendHost, 'onix-staging.example.test');
});

test('existing production deployment remains compatible without the new staging flag', () => {
  assert.deepEqual(createDeploymentIsolationConfig({}), {
    environment: 'production',
    staging: false,
  });
  assert.deepEqual(createDeploymentIsolationConfig({ ONIX_DEPLOY_ENV: 'production' }), {
    environment: 'production',
    staging: false,
  });
});

test('production MongoDB host is rejected in staging', () => {
  assertIsolationCode(
    () => createDeploymentIsolationConfig(stagingEnvironment({
      MONGO_URI:
        'mongodb+srv://user:password@onix-production.example.mongodb.net/onix_staging?retryWrites=true&w=majority',
    })),
    'STAGING_MONGODB_HOST_FORBIDDEN'
  );
});

test('wrong or non-staging database is rejected', () => {
  assertIsolationCode(
    () => createDeploymentIsolationConfig(stagingEnvironment({
      MONGO_URI:
        'mongodb+srv://user:password@onix-staging.example.mongodb.net/onix_production?retryWrites=true&w=majority',
    })),
    'STAGING_MONGODB_DATABASE_FORBIDDEN'
  );
  assertIsolationCode(
    () => createDeploymentIsolationConfig(stagingEnvironment({
      STAGING_MONGODB_DATABASE: 'onix',
      STAGING_MONGODB_ALLOWED_DATABASES: 'onix',
    })),
    'STAGING_MONGODB_DATABASE_INVALID'
  );
});

test('missing staging bot ID is rejected before Telegram verification', () => {
  assertIsolationCode(
    () => createDeploymentIsolationConfig(stagingEnvironment({ STAGING_TELEGRAM_BOT_ID: '' })),
    'STAGING_BOT_ID_MISSING'
  );
});

test('staging has no MongoDB URI or bot token fallback', () => {
  assertIsolationCode(
    () => createDeploymentIsolationConfig(stagingEnvironment({ MONGO_URI: '' })),
    'STAGING_MONGODB_URI_INVALID'
  );
  assertIsolationCode(
    () => createDeploymentIsolationConfig(stagingEnvironment({ BOT_TOKEN: '' })),
    'STAGING_BOT_TOKEN_INVALID'
  );
});

test('bot token prefix must match the configured staging bot ID', () => {
  assertIsolationCode(
    () => createDeploymentIsolationConfig(stagingEnvironment({
      STAGING_TELEGRAM_BOT_ID: '900002',
    })),
    'STAGING_BOT_ID_MISMATCH'
  );
});

test('Telegram getMe must return the same staging bot ID', async () => {
  const config = createDeploymentIsolationConfig(stagingEnvironment());
  await assert.rejects(
    verifyStagingTelegramBotIdentity(config, async () => ({
      data: { ok: true, result: { id: 900002, is_bot: true } },
    })),
    (error) => error.code === 'STAGING_BOT_ID_MISMATCH'
  );
});

test('successful Telegram getMe verification returns only the public bot ID', async () => {
  const config = createDeploymentIsolationConfig(stagingEnvironment());
  let receivedToken = '';
  const identity = await verifyStagingTelegramBotIdentity(config, async (token) => {
    receivedToken = token;
    return { data: { ok: true, result: { id: Number(STAGING_BOT_ID), is_bot: true } } };
  });

  assert.equal(receivedToken, STAGING_BOT_TOKEN);
  assert.deepEqual(identity, { id: STAGING_BOT_ID });
  assert.doesNotMatch(JSON.stringify(identity), /abcdefghijklmnopqrstuvwxyz/);
});

test('Telegram verification failures are sanitized and never reveal BOT_TOKEN', async () => {
  const config = createDeploymentIsolationConfig(stagingEnvironment());
  await assert.rejects(
    verifyStagingTelegramBotIdentity(config, async () => {
      throw new Error(`request failed for ${STAGING_BOT_TOKEN}`);
    }),
    (error) => {
      assert.equal(error.code, 'STAGING_BOT_VERIFICATION_FAILED');
      assert.doesNotMatch(error.message, new RegExp(STAGING_BOT_ID));
      assert.doesNotMatch(error.message, /abcdefghijklmnopqrstuvwxyz/);
      return true;
    }
  );
});

test('every required staging secret fails closed when absent', () => {
  for (const name of REQUIRED_STAGING_SECRETS) {
    assertIsolationCode(
      () => createDeploymentIsolationConfig(stagingEnvironment({ [name]: '' })),
      'STAGING_SECRET_MISSING'
    );
  }
});

test('staging secrets must be distinct', () => {
  const sharedSecret = 'staging-shared-secret-00000001';
  assertIsolationCode(
    () => createDeploymentIsolationConfig(stagingEnvironment({
      TELEGRAM_WEBHOOK_SECRET: sharedSecret,
      ADMIN_SECRET: sharedSecret,
    })),
    'STAGING_SECRETS_REUSED'
  );
});

test('unknown deployment environments and missing staging confirmation are rejected', () => {
  assertIsolationCode(
    () => createDeploymentIsolationConfig({ ONIX_DEPLOY_ENV: 'qa' }),
    'DEPLOYMENT_ENVIRONMENT_UNKNOWN'
  );
  assertIsolationCode(
    () => createDeploymentIsolationConfig(stagingEnvironment({
      STAGING_DEPLOYMENT_CONFIRMATION: '',
    })),
    'STAGING_CONFIRMATION_MISSING'
  );
});

test('NODE_ENV staging cannot bypass the explicit staging guard', () => {
  assertIsolationCode(
    () => createDeploymentIsolationConfig({ NODE_ENV: 'staging' }),
    'STAGING_ENVIRONMENT_NOT_EXPLICIT'
  );
  assertIsolationCode(
    () => createDeploymentIsolationConfig({
      NODE_ENV: 'staging',
      ONIX_DEPLOY_ENV: 'production',
    }),
    'DEPLOYMENT_ENVIRONMENT_CONFLICT'
  );
});

test('staging cannot use the production frontend fallback', () => {
  assertIsolationCode(
    () => createDeploymentIsolationConfig(stagingEnvironment({ WEB_APP_URL: '' })),
    'STAGING_WEB_APP_URL_MISSING'
  );
  assertIsolationCode(
    () => createDeploymentIsolationConfig(stagingEnvironment({
      WEB_APP_URL: 'https://onix-coin.vercel.app',
      STAGING_FRONTEND_ALLOWED_HOSTS: 'onix-coin.vercel.app',
    })),
    'STAGING_WEB_APP_HOST_FORBIDDEN'
  );
});

test('server verifies staging isolation before Telegram getMe, MongoDB and listen', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const configIndex = source.indexOf('createDeploymentIsolationConfig(process.env)');
  const getMeIndex = source.indexOf('verifyStagingTelegramBotIdentity(isolation');
  const stagingMongoIndex = source.indexOf('mongoose.connect(isolation.mongoUri)');
  const stagingListenIndex = source.indexOf('\n  listen();', stagingMongoIndex);

  assert.ok(configIndex >= 0);
  assert.ok(getMeIndex > configIndex);
  assert.ok(stagingMongoIndex > getMeIndex);
  assert.ok(stagingListenIndex > stagingMongoIndex);
});
