const crypto = require('crypto');

const TELEGRAM_SECRET_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;

function isValidTelegramWebhookSecret(value) {
  return typeof value === 'string' && TELEGRAM_SECRET_PATTERN.test(value);
}

function timingSafeSecretEquals(providedSecret, expectedSecret) {
  if (
    !isValidTelegramWebhookSecret(providedSecret) ||
    !isValidTelegramWebhookSecret(expectedSecret)
  ) {
    return false;
  }

  const providedHash = crypto
    .createHash('sha256')
    .update(providedSecret, 'utf8')
    .digest();
  const expectedHash = crypto
    .createHash('sha256')
    .update(expectedSecret, 'utf8')
    .digest();

  return crypto.timingSafeEqual(providedHash, expectedHash);
}

function verifyTelegramWebhookSecret(req, res, next) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET || '';

  if (!isValidTelegramWebhookSecret(expectedSecret)) {
    return res.status(503).json({ message: 'Webhook unavailable' });
  }

  const providedSecret = req.get('x-telegram-bot-api-secret-token');

  if (!providedSecret) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (!timingSafeSecretEquals(providedSecret, expectedSecret)) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  return next();
}

function createTelegramWebhookRateLimiter(options = {}) {
  const windowMs = Number(options.windowMs || 60 * 1000);
  const maxRequests = Number(options.maxRequests || 1200);
  const buckets = new Map();

  return function telegramWebhookRateLimiter(req, res, next) {
    const now = Date.now();
    const key = String(req.ip || req.socket?.remoteAddress || 'telegram');
    const existing = buckets.get(key);
    const bucket =
      existing && now - existing.startedAt < windowMs
        ? existing
        : { count: 0, startedAt: now };

    bucket.count += 1;
    buckets.set(key, bucket);

    if (buckets.size > 1000) {
      for (const [bucketKey, item] of buckets.entries()) {
        if (now - item.startedAt >= windowMs) buckets.delete(bucketKey);
      }
    }

    if (bucket.count > maxRequests) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((windowMs - (now - bucket.startedAt)) / 1000)
      );
      res.set('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({ message: 'Too many requests' });
    }

    return next();
  };
}

module.exports = {
  createTelegramWebhookRateLimiter,
  isValidTelegramWebhookSecret,
  timingSafeSecretEquals,
  verifyTelegramWebhookSecret,
};
