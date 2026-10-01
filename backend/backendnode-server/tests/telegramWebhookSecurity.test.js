const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('crypto');

const {
  createTelegramWebhookRateLimiter,
  isValidTelegramWebhookSecret,
  timingSafeSecretEquals,
  verifyTelegramWebhookSecret,
} = require('../telegramWebhookSecurity');

function createResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function runSecretMiddleware(headerValue) {
  const req = {
    get(name) {
      if (name.toLowerCase() !== 'x-telegram-bot-api-secret-token') return '';
      return headerValue;
    },
  };
  const res = createResponse();
  let nextCalls = 0;

  verifyTelegramWebhookSecret(req, res, () => {
    nextCalls += 1;
  });

  return { nextCalls, res };
}

test.beforeEach(() => {
  process.env.TELEGRAM_WEBHOOK_SECRET = 'valid_webhook-secret_2026';
});

test.after(() => {
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
});

test('correct Telegram secret allows webhook processing', () => {
  const { nextCalls, res } = runSecretMiddleware('valid_webhook-secret_2026');

  assert.equal(nextCalls, 1);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, null);
});

test('missing Telegram secret header is rejected without revealing the expected value', () => {
  const { nextCalls, res } = runSecretMiddleware(undefined);

  assert.equal(nextCalls, 0);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { message: 'Unauthorized' });
  assert.doesNotMatch(JSON.stringify(res.body), /valid_webhook-secret_2026/);
});

test('incorrect Telegram secret is rejected', () => {
  const { nextCalls, res } = runSecretMiddleware('wrong_webhook_secret');

  assert.equal(nextCalls, 0);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { message: 'Forbidden' });
});

test('malformed Telegram secret header is rejected', () => {
  const { nextCalls, res } = runSecretMiddleware('invalid secret with spaces');

  assert.equal(nextCalls, 0);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { message: 'Forbidden' });
});

test('missing server-side Telegram webhook secret fails closed', () => {
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
  const { nextCalls, res } = runSecretMiddleware('valid_webhook-secret_2026');

  assert.equal(nextCalls, 0);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { message: 'Webhook unavailable' });
});

test('secret comparison hashes both values before timingSafeEqual', (t) => {
  const originalTimingSafeEqual = crypto.timingSafeEqual;
  const comparedLengths = [];

  t.mock.method(crypto, 'timingSafeEqual', (left, right) => {
    comparedLengths.push([left.length, right.length]);
    return originalTimingSafeEqual(left, right);
  });

  assert.equal(
    timingSafeSecretEquals('valid_webhook-secret_2026', 'valid_webhook-secret_2026'),
    true
  );
  assert.equal(
    timingSafeSecretEquals('short_wrong', 'valid_webhook-secret_2026'),
    false
  );
  assert.deepEqual(comparedLengths, [
    [32, 32],
    [32, 32],
  ]);
});

test('Telegram secret validation accepts only the documented header format', () => {
  assert.equal(isValidTelegramWebhookSecret('abc-DEF_123'), true);
  assert.equal(isValidTelegramWebhookSecret('contains spaces'), false);
  assert.equal(isValidTelegramWebhookSecret('x'.repeat(257)), false);
  assert.equal(isValidTelegramWebhookSecret(''), false);
});

test('webhook rate limiter allows normal traffic and rejects only the configured excess', () => {
  const limiter = createTelegramWebhookRateLimiter({ windowMs: 60_000, maxRequests: 2 });
  const req = { ip: '149.154.167.220', socket: {} };
  const results = [];

  for (let index = 0; index < 3; index += 1) {
    const res = createResponse();
    let nextCalls = 0;
    limiter(req, res, () => {
      nextCalls += 1;
    });
    results.push({ nextCalls, statusCode: res.statusCode, retryAfter: res.headers['Retry-After'] });
  }

  assert.deepEqual(results.slice(0, 2), [
    { nextCalls: 1, statusCode: 200, retryAfter: undefined },
    { nextCalls: 1, statusCode: 200, retryAfter: undefined },
  ]);
  assert.equal(results[2].nextCalls, 0);
  assert.equal(results[2].statusCode, 429);
  assert.match(results[2].retryAfter, /^\d+$/);
});
