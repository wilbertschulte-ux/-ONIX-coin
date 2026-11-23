const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getSafeStartupFailure,
  safeStartupStage,
} = require('../startupDiagnostics');

test('startup diagnostics preserve only known startup stages', () => {
  assert.equal(safeStartupStage('deployment-config'), 'deployment-config');
  assert.equal(safeStartupStage('telegram-bot-verification'), 'telegram-bot-verification');
  assert.equal(safeStartupStage('mongodb-connect'), 'mongodb-connect');
  assert.equal(safeStartupStage('fortune-wheel-readiness'), 'fortune-wheel-readiness');
  assert.equal(safeStartupStage('http-listen'), 'http-listen');
  assert.equal(safeStartupStage('mongodb://secret@example.invalid/db'), 'deployment-config');
});

test('startup diagnostics preserve safe weekly readiness failures', () => {
  assert.deepEqual(
    getSafeStartupFailure('fortune-wheel-readiness', {
      code: 'WEEKLY_REQUIRED_INDEX_MISSING',
      message: 'sensitive database details must not be logged',
    }),
    {
      stage: 'fortune-wheel-readiness',
      code: 'WEEKLY_REQUIRED_INDEX_MISSING',
    }
  );
});

test('startup diagnostics preserve safe deployment isolation codes', () => {
  const failure = getSafeStartupFailure('deployment-config', {
    code: 'STAGING_MONGODB_HOST_FORBIDDEN',
    message: 'must not be logged',
  });

  assert.deepEqual(failure, {
    stage: 'deployment-config',
    code: 'STAGING_MONGODB_HOST_FORBIDDEN',
  });
});

test('startup diagnostics classify MongoDB server selection failures', () => {
  const failure = getSafeStartupFailure('mongodb-connect', {
    name: 'MongoServerSelectionError',
    message: 'mongodb+srv://user:password@example.invalid/onix_staging',
    stack: 'sensitive stack',
  });

  assert.deepEqual(failure, {
    stage: 'mongodb-connect',
    code: 'MONGODB_SERVER_SELECTION_FAILED',
  });
  assert.doesNotMatch(JSON.stringify(failure), /password|example\.invalid|sensitive/i);
});

test('startup diagnostics classify Mongoose server selection wrappers', () => {
  const failure = getSafeStartupFailure('mongodb-connect', {
    name: 'MongooseServerSelectionError',
    message: 'mongodb+srv://user:password@example.invalid/onix_staging',
    reason: { type: 'ReplicaSetNoPrimary' },
  });

  assert.deepEqual(failure, {
    stage: 'mongodb-connect',
    code: 'MONGODB_SERVER_SELECTION_FAILED',
  });
  assert.doesNotMatch(JSON.stringify(failure), /password|example\.invalid|ReplicaSetNoPrimary/i);
});

test('startup diagnostics classify nested DNS failures without exposing hosts', () => {
  const failure = getSafeStartupFailure('mongodb-connect', {
    name: 'MongooseServerSelectionError',
    reason: {
      servers: new Map([[
        'sensitive.mongodb.net:27017',
        { error: { name: 'MongoNetworkError', code: 'ENOTFOUND', hostname: 'sensitive.mongodb.net' } },
      ]]),
    },
  });

  assert.deepEqual(failure, { stage: 'mongodb-connect', code: 'MONGODB_DNS_FAILED' });
  assert.doesNotMatch(JSON.stringify(failure), /sensitive|mongodb\.net/i);
});

test('startup diagnostics classify nested TLS failures without exposing certificates', () => {
  const failure = getSafeStartupFailure('mongodb-connect', {
    name: 'MongooseServerSelectionError',
    cause: {
      name: 'MongoNetworkError',
      cause: { code: 'ERR_TLS_CERT_ALTNAME_INVALID', cert: 'sensitive certificate' },
    },
  });

  assert.deepEqual(failure, { stage: 'mongodb-connect', code: 'MONGODB_TLS_FAILED' });
  assert.doesNotMatch(JSON.stringify(failure), /certificate|ALTNAME/i);
});

test('startup diagnostics classify network timeout and generic network failures', () => {
  assert.equal(
    getSafeStartupFailure('mongodb-connect', {
      name: 'MongooseServerSelectionError',
      reason: { servers: { first: { error: { code: 'ETIMEDOUT' } } } },
    }).code,
    'MONGODB_NETWORK_TIMEOUT'
  );
  assert.equal(
    getSafeStartupFailure('mongodb-connect', {
      name: 'MongooseServerSelectionError',
      reason: { servers: { first: { error: { code: 'ECONNREFUSED' } } } },
    }).code,
    'MONGODB_NETWORK_FAILED'
  );
});

test('startup diagnostics classify MongoDB URI parse failures', () => {
  assert.deepEqual(
    getSafeStartupFailure('mongodb-connect', { name: 'MongoParseError' }),
    { stage: 'mongodb-connect', code: 'MONGODB_URI_PARSE_FAILED' }
  );
});

test('startup diagnostics classify direct and wrapped MongoDB authentication failures', () => {
  assert.equal(
    getSafeStartupFailure('mongodb-connect', { code: 18 }).code,
    'MONGODB_AUTH_FAILED'
  );
  assert.equal(
    getSafeStartupFailure('mongodb-connect', {
      name: 'MongooseServerSelectionError',
      reason: {
        servers: new Map([[
          'sensitive.mongodb.net:27017',
          { error: { codeName: 'AuthenticationFailed', code: 18 } },
        ]]),
      },
    }).code,
    'MONGODB_AUTH_FAILED'
  );
});

test('startup diagnostics reject unsafe or unknown error codes', () => {
  const failure = getSafeStartupFailure('http-listen', {
    code: 'mongodb://user:password@example.invalid',
    message: 'sensitive message',
    stack: 'sensitive stack',
  });

  assert.deepEqual(failure, {
    stage: 'http-listen',
    code: 'STARTUP_FAILED',
  });
  assert.doesNotMatch(JSON.stringify(failure), /password|example\.invalid|sensitive/i);

  assert.equal(
    getSafeStartupFailure('deployment-config', { code: 'UNKNOWN_UPPERCASE_CODE' }).code,
    'STARTUP_FAILED'
  );
});

test('startup diagnostics normalize expected HTTP listen failures', () => {
  assert.equal(
    getSafeStartupFailure('http-listen', { code: 'EADDRINUSE' }).code,
    'HTTP_PORT_IN_USE'
  );
  assert.equal(
    getSafeStartupFailure('http-listen', { code: 'EACCES' }).code,
    'HTTP_LISTEN_PERMISSION_DENIED'
  );
});
