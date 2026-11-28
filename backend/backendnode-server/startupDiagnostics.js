const STARTUP_STAGES = Object.freeze([
  'deployment-config',
  'telegram-bot-verification',
  'mongodb-connect',
  'fortune-wheel-readiness',
  'http-listen',
]);

const SAFE_FORTUNE_WHEEL_ERROR_CODES = new Set([
  'FORTUNE_WHEEL_MODE_INVALID',
  'RANDOM_SECRET_INVALID',
  'WEEKLY_ACCOUNT_RECOVERY_NOT_READY',
  'WEEKLY_CAMPAIGN_KEY_INVALID',
  'WEEKLY_CONFIG_VERSION_INVALID',
  'WEEKLY_DATABASE_MISMATCH',
  'WEEKLY_INVENTORY_NOT_READY',
  'WEEKLY_LEGACY_PROGRESS_INDEX_ACTIVE',
  'WEEKLY_READINESS_FAILED',
  'WEEKLY_REQUIRED_INDEX_MISSING',
  'WEEKLY_STAGING_REQUIRED',
]);

const SAFE_DEPLOYMENT_ERROR_CODES = new Set([
  'DEPLOYMENT_ENVIRONMENT_CONFLICT',
  'DEPLOYMENT_ENVIRONMENT_UNKNOWN',
  'STAGING_ALLOWLIST_INVALID',
  'STAGING_BOT_ID_MISMATCH',
  'STAGING_BOT_ID_MISSING',
  'STAGING_BOT_TOKEN_INVALID',
  'STAGING_BOT_VERIFICATION_FAILED',
  'STAGING_BOT_VERIFIER_MISSING',
  'STAGING_CONFIRMATION_MISSING',
  'STAGING_ENVIRONMENT_NOT_EXPLICIT',
  'STAGING_MONGODB_DATABASE_FORBIDDEN',
  'STAGING_MONGODB_DATABASE_INVALID',
  'STAGING_MONGODB_DATABASE_MISSING',
  'STAGING_MONGODB_HOST_FORBIDDEN',
  'STAGING_MONGODB_HOST_INVALID',
  'STAGING_MONGODB_URI_INVALID',
  'STAGING_SECRETS_REUSED',
  'STAGING_SECRET_MISSING',
  'STAGING_WEB_APP_HOST_FORBIDDEN',
  'STAGING_WEB_APP_URL_INVALID',
  'STAGING_WEB_APP_URL_MISSING',
]);

function safeStartupStage(stage) {
  return STARTUP_STAGES.includes(stage) ? stage : 'deployment-config';
}

function collectMongoErrorChain(error) {
  const candidates = [];
  const queue = [error];
  const visited = new Set();

  while (queue.length > 0 && candidates.length < 64) {
    const candidate = queue.shift();
    if (!candidate || (typeof candidate !== 'object' && typeof candidate !== 'function')) continue;
    if (visited.has(candidate)) continue;
    visited.add(candidate);
    candidates.push(candidate);

    for (const nested of [candidate.cause, candidate.reason, candidate.error]) {
      if (nested) queue.push(nested);
    }

    const servers = candidate.servers;
    if (servers instanceof Map) {
      for (const server of servers.values()) queue.push(server, server?.error, server?.cause);
    } else if (servers && typeof servers === 'object') {
      for (const server of Object.values(servers)) queue.push(server, server?.error, server?.cause);
    }

    if (Array.isArray(candidate.errors)) queue.push(...candidate.errors);
  }

  return candidates;
}

function errorCode(candidate) {
  return String(candidate?.code || '').trim().toUpperCase();
}

function errorName(candidate) {
  return String(candidate?.name || candidate?.constructor?.name || '').trim();
}

function isMongoAuthenticationError(candidates) {
  return candidates.some((candidate) =>
    Number(candidate?.code) === 18 || candidate?.codeName === 'AuthenticationFailed'
  );
}

function classifyMongoConnectionError(error) {
  const candidates = collectMongoErrorChain(error);

  if (isMongoAuthenticationError(candidates)) return 'MONGODB_AUTH_FAILED';
  if (candidates.some((candidate) => errorName(candidate) === 'MongoParseError')) {
    return 'MONGODB_URI_PARSE_FAILED';
  }

  const codes = candidates.map(errorCode);
  const names = candidates.map(errorName);
  if (codes.some((code) => ['ENOTFOUND', 'EAI_AGAIN', 'ESERVFAIL', 'ENODATA'].includes(code))) {
    return 'MONGODB_DNS_FAILED';
  }
  if (codes.some((code) =>
    code.startsWith('ERR_SSL_') ||
    code.startsWith('ERR_TLS_') ||
    ['DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_HAS_EXPIRED'].includes(code)
  )) {
    return 'MONGODB_TLS_FAILED';
  }
  if (
    codes.some((code) => ['ETIMEDOUT', 'ESOCKETTIMEDOUT'].includes(code)) ||
    names.some((name) => name === 'MongoNetworkTimeoutError')
  ) {
    return 'MONGODB_NETWORK_TIMEOUT';
  }
  if (
    codes.some((code) => ['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE'].includes(code)) ||
    names.some((name) => name === 'MongoNetworkError')
  ) {
    return 'MONGODB_NETWORK_FAILED';
  }
  if (names.some((name) =>
    name === 'MongoServerSelectionError' || name === 'MongooseServerSelectionError'
  )) {
    return 'MONGODB_SERVER_SELECTION_FAILED';
  }

  return null;
}

function classifyStartupError(error, stage) {
  if (stage === 'mongodb-connect') {
    const mongoCode = classifyMongoConnectionError(error);
    if (mongoCode) return mongoCode;
  }

  const code = typeof error?.code === 'string' ? error.code : '';
  if (SAFE_DEPLOYMENT_ERROR_CODES.has(code)) return code;
  if (stage === 'fortune-wheel-readiness' && SAFE_FORTUNE_WHEEL_ERROR_CODES.has(code)) return code;
  if (stage === 'http-listen' && code === 'EADDRINUSE') return 'HTTP_PORT_IN_USE';
  if (stage === 'http-listen' && code === 'EACCES') return 'HTTP_LISTEN_PERMISSION_DENIED';
  return 'STARTUP_FAILED';
}

function getSafeStartupFailure(stage, error) {
  const safeStage = safeStartupStage(stage);
  return Object.freeze({
    stage: safeStage,
    code: classifyStartupError(error, safeStage),
  });
}

module.exports = {
  STARTUP_STAGES,
  classifyStartupError,
  getSafeStartupFailure,
  safeStartupStage,
};
