const STAGING_ENVIRONMENT = 'staging';
const PRODUCTION_ENVIRONMENT = 'production';
const STAGING_CONFIRMATION = 'ONIX_STAGING_ONLY';
const PRODUCTION_FRONTEND_HOST = 'onix-coin.vercel.app';

const REQUIRED_STAGING_SECRETS = Object.freeze([
  'TELEGRAM_WEBHOOK_SECRET',
  'ADMIN_SECRET',
  'ACCOUNT_RECOVERY_SECRET',
  'CRON_SECRET',
]);

class DeploymentIsolationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DeploymentIsolationError';
    this.code = code;
  }
}

function clean(value) {
  return String(value || '').trim();
}

function fail(code, message) {
  throw new DeploymentIsolationError(code, message);
}

function parseAllowlist(value, label, validator) {
  const entries = [...new Set(
    clean(value)
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
  )];
  if (entries.length === 0 || entries.some((entry) => !validator(entry))) {
    fail('STAGING_ALLOWLIST_INVALID', `${label} must contain a valid explicit allowlist`);
  }
  return entries;
}

function parseMongoTarget(uri) {
  const value = clean(uri);
  const schemeMatch = value.match(/^(mongodb(?:\+srv)?):\/\//i);
  if (!schemeMatch) {
    fail('STAGING_MONGODB_URI_INVALID', 'Staging MONGO_URI must be a MongoDB connection string');
  }

  const remainder = value.slice(schemeMatch[0].length);
  const slashIndex = remainder.indexOf('/');
  if (slashIndex < 0) {
    fail('STAGING_MONGODB_DATABASE_MISSING', 'Staging MONGO_URI must include a database name');
  }

  const authority = remainder.slice(0, slashIndex);
  const pathAndQuery = remainder.slice(slashIndex + 1);
  const databasePart = pathAndQuery.split(/[?#]/, 1)[0];
  let database;
  try {
    database = decodeURIComponent(databasePart);
  } catch {
    fail('STAGING_MONGODB_DATABASE_INVALID', 'Staging MongoDB database name is invalid');
  }
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(database)) {
    fail('STAGING_MONGODB_DATABASE_INVALID', 'Staging MONGO_URI must include a safe database name');
  }

  const credentialsEnd = authority.lastIndexOf('@');
  const hostsPart = credentialsEnd >= 0 ? authority.slice(credentialsEnd + 1) : authority;
  const rawHosts = hostsPart.split(',').map((host) => host.trim()).filter(Boolean);
  const hosts = rawHosts.map((host) => {
    if (host.startsWith('[')) {
      const closingBracket = host.indexOf(']');
      return closingBracket >= 0 ? host.slice(0, closingBracket + 1).toLowerCase() : '';
    }
    return host.split(':', 1)[0].toLowerCase();
  });
  if (
    hosts.length === 0 ||
    hosts.some((host) => !/^(?:[a-z0-9-]+\.)*[a-z0-9-]+$/.test(host))
  ) {
    fail('STAGING_MONGODB_HOST_INVALID', 'Staging MONGO_URI contains an invalid host');
  }

  return { database, hosts };
}

function validateStagingSecrets(environment) {
  const values = [];
  for (const name of REQUIRED_STAGING_SECRETS) {
    const value = clean(environment[name]);
    if (value.length < 24) {
      fail('STAGING_SECRET_MISSING', `Staging requires a strong ${name}`);
    }
    values.push(value);
  }
  if (new Set(values).size !== values.length) {
    fail('STAGING_SECRETS_REUSED', 'Staging security secrets must be distinct');
  }
}

function validateStagingFrontend(environment) {
  const configuredUrl = clean(environment.WEB_APP_URL);
  if (!configuredUrl) {
    fail('STAGING_WEB_APP_URL_MISSING', 'Staging requires an explicit WEB_APP_URL');
  }

  let parsed;
  try {
    parsed = new URL(configuredUrl);
  } catch {
    fail('STAGING_WEB_APP_URL_INVALID', 'Staging WEB_APP_URL must be an absolute URL');
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    fail('STAGING_WEB_APP_URL_INVALID', 'Staging WEB_APP_URL must be a clean HTTPS URL');
  }

  const allowedHosts = parseAllowlist(
    environment.STAGING_FRONTEND_ALLOWED_HOSTS,
    'STAGING_FRONTEND_ALLOWED_HOSTS',
    (host) => /^(?:[a-z0-9-]+\.)*[a-z0-9-]+$/.test(host)
  );
  const host = parsed.hostname.toLowerCase();
  if (host === PRODUCTION_FRONTEND_HOST || !allowedHosts.includes(host)) {
    fail('STAGING_WEB_APP_HOST_FORBIDDEN', 'Staging WEB_APP_URL host is not allowed');
  }

  return { webAppUrl: parsed.toString().replace(/\/$/, ''), frontendHost: host };
}

function validateStagingBot(environment) {
  const expectedBotId = clean(environment.STAGING_TELEGRAM_BOT_ID);
  if (!/^\d{5,20}$/.test(expectedBotId)) {
    fail('STAGING_BOT_ID_MISSING', 'Staging requires STAGING_TELEGRAM_BOT_ID');
  }

  const botToken = clean(environment.BOT_TOKEN);
  const tokenMatch = botToken.match(/^(\d{5,20}):[A-Za-z0-9_-]{20,}$/);
  if (!tokenMatch) {
    fail('STAGING_BOT_TOKEN_INVALID', 'Staging requires a valid BOT_TOKEN');
  }
  if (tokenMatch[1] !== expectedBotId) {
    fail('STAGING_BOT_ID_MISMATCH', 'Staging BOT_TOKEN does not match STAGING_TELEGRAM_BOT_ID');
  }

  return { botToken, expectedBotId };
}

function createDeploymentIsolationConfig(environment = process.env) {
  const explicitEnvironment = clean(environment.ONIX_DEPLOY_ENV).toLowerCase();
  const nodeEnvironment = clean(environment.NODE_ENV).toLowerCase();
  if (!explicitEnvironment && nodeEnvironment === STAGING_ENVIRONMENT) {
    fail(
      'STAGING_ENVIRONMENT_NOT_EXPLICIT',
      'NODE_ENV=staging requires explicit ONIX_DEPLOY_ENV=staging'
    );
  }
  if (
    explicitEnvironment === PRODUCTION_ENVIRONMENT &&
    nodeEnvironment === STAGING_ENVIRONMENT
  ) {
    fail('DEPLOYMENT_ENVIRONMENT_CONFLICT', 'Production and staging environment flags conflict');
  }
  if (!explicitEnvironment || explicitEnvironment === PRODUCTION_ENVIRONMENT) {
    return Object.freeze({ environment: PRODUCTION_ENVIRONMENT, staging: false });
  }
  if (explicitEnvironment !== STAGING_ENVIRONMENT) {
    fail('DEPLOYMENT_ENVIRONMENT_UNKNOWN', 'ONIX_DEPLOY_ENV must be production or staging');
  }
  if (clean(environment.STAGING_DEPLOYMENT_CONFIRMATION) !== STAGING_CONFIRMATION) {
    fail(
      'STAGING_CONFIRMATION_MISSING',
      `Staging requires STAGING_DEPLOYMENT_CONFIRMATION=${STAGING_CONFIRMATION}`
    );
  }

  validateStagingSecrets(environment);
  const { botToken, expectedBotId } = validateStagingBot(environment);
  const { webAppUrl, frontendHost } = validateStagingFrontend(environment);

  const expectedDatabase = clean(environment.STAGING_MONGODB_DATABASE);
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(expectedDatabase) || !/staging/i.test(expectedDatabase)) {
    fail('STAGING_MONGODB_DATABASE_INVALID', 'Staging database name must be explicit and contain staging');
  }
  const allowedDatabases = parseAllowlist(
    environment.STAGING_MONGODB_ALLOWED_DATABASES,
    'STAGING_MONGODB_ALLOWED_DATABASES',
    (database) => /^[a-z0-9_-]{1,64}$/.test(database) && database.includes('staging')
  );
  const allowedHosts = parseAllowlist(
    environment.STAGING_MONGODB_ALLOWED_HOSTS,
    'STAGING_MONGODB_ALLOWED_HOSTS',
    (host) => /^(?:[a-z0-9-]+\.)*[a-z0-9-]+$/.test(host)
  );
  const mongoUri = clean(environment.MONGO_URI);
  const mongoTarget = parseMongoTarget(mongoUri);
  const normalizedDatabase = expectedDatabase.toLowerCase();
  if (
    mongoTarget.database.toLowerCase() !== normalizedDatabase ||
    !allowedDatabases.includes(normalizedDatabase)
  ) {
    fail('STAGING_MONGODB_DATABASE_FORBIDDEN', 'Staging MONGO_URI database is not allowed');
  }
  if (mongoTarget.hosts.some((host) => !allowedHosts.includes(host))) {
    fail('STAGING_MONGODB_HOST_FORBIDDEN', 'Staging MONGO_URI host is not allowed');
  }

  return Object.freeze({
    environment: STAGING_ENVIRONMENT,
    staging: true,
    mongoUri,
    mongoDatabase: mongoTarget.database,
    mongoHosts: Object.freeze([...mongoTarget.hosts]),
    botToken,
    expectedBotId,
    webAppUrl,
    frontendHost,
  });
}

async function verifyStagingTelegramBotIdentity(config, requestBotIdentity) {
  if (!config?.staging) return null;
  if (typeof requestBotIdentity !== 'function') {
    fail('STAGING_BOT_VERIFIER_MISSING', 'Staging Telegram bot verification is unavailable');
  }

  let payload;
  try {
    payload = await requestBotIdentity(config.botToken);
  } catch {
    fail('STAGING_BOT_VERIFICATION_FAILED', 'Staging Telegram bot identity verification failed');
  }

  const bot = payload?.data?.result || payload?.result || null;
  if (payload?.data?.ok === false || payload?.ok === false || !bot) {
    fail('STAGING_BOT_VERIFICATION_FAILED', 'Staging Telegram bot identity verification failed');
  }
  if (String(bot.id || '') !== config.expectedBotId || bot.is_bot !== true) {
    fail('STAGING_BOT_ID_MISMATCH', 'Telegram getMe identity does not match the staging bot');
  }

  return Object.freeze({ id: config.expectedBotId });
}

module.exports = {
  DeploymentIsolationError,
  REQUIRED_STAGING_SECRETS,
  STAGING_CONFIRMATION,
  createDeploymentIsolationConfig,
  parseMongoTarget,
  verifyStagingTelegramBotIdentity,
};
