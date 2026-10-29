const STARTUP_STAGES = Object.freeze([
  'deployment-config',
  'telegram-bot-verification',
  'mongodb-connect',
  'http-listen',
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

function isMongoAuthenticationError(error) {
  return [error, error?.cause, error?.reason?.error].some((candidate) =>
    Number(candidate?.code) === 18 || candidate?.codeName === 'AuthenticationFailed'
  );
}

function classifyStartupError(error, stage) {
  if (stage === 'mongodb-connect') {
    if (isMongoAuthenticationError(error)) return 'MONGODB_AUTH_FAILED';
    if (error?.name === 'MongoParseError') return 'MONGODB_URI_PARSE_FAILED';
    if (error?.name === 'MongoServerSelectionError') {
      return 'MONGODB_SERVER_SELECTION_FAILED';
    }
  }

  const code = typeof error?.code === 'string' ? error.code : '';
  if (SAFE_DEPLOYMENT_ERROR_CODES.has(code)) return code;
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
