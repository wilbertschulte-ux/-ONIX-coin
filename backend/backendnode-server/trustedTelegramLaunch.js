const PendingTelegramLaunch = require('./models/PendingTelegramLaunch');
const { parseLaunchParam } = require('./trafficAttribution');

const PENDING_TELEGRAM_LAUNCH_TTL_MS = 60 * 60 * 1000;
const PENDING_TELEGRAM_LAUNCH_MAX_TIME_MS = 1500;

function getPendingLaunchInsert(telegramId, payload, now = Date.now()) {
  const parsed = parseLaunchParam(payload);
  if (!telegramId || !parsed.normalizedLaunchParam) return null;

  return {
    telegramId: String(telegramId),
    payload: parsed.normalizedLaunchParam,
    referralTelegramId: parsed.referralTelegramId,
    attribution: parsed.attribution || undefined,
    teamCode: parsed.teamCode,
    createdAt: new Date(now),
    expiresAt: new Date(now + PENDING_TELEGRAM_LAUNCH_TTL_MS),
  };
}

async function storePendingTelegramLaunch({ telegramId, payload, now = Date.now() }) {
  const pending = getPendingLaunchInsert(telegramId, payload, now);
  if (!pending) return { stored: false, reason: 'invalid_payload' };

  try {
    const replacedExpired = await PendingTelegramLaunch.updateOne(
      {
        telegramId: pending.telegramId,
        expiresAt: { $lte: new Date(now) },
      },
      { $set: pending },
      { maxTimeMS: PENDING_TELEGRAM_LAUNCH_MAX_TIME_MS }
    );

    const result = await PendingTelegramLaunch.updateOne(
      { telegramId: pending.telegramId },
      { $setOnInsert: pending },
      { upsert: true, maxTimeMS: PENDING_TELEGRAM_LAUNCH_MAX_TIME_MS }
    );

    return {
      stored: Boolean(replacedExpired?.modifiedCount || result?.upsertedCount),
      existing: !replacedExpired?.modifiedCount && !result?.upsertedCount,
      parsed: parseLaunchParam(pending.payload),
    };
  } catch (error) {
    if (error?.code === 11000) {
      return { stored: false, existing: true, parsed: parseLaunchParam(pending.payload) };
    }
    return { stored: false, reason: 'storage_error' };
  }
}

async function consumePendingTelegramLaunch(telegramId, options = {}) {
  const { now = Date.now(), session = null } = options;
  const query = PendingTelegramLaunch.findOneAndDelete({
    telegramId: String(telegramId || ''),
    expiresAt: { $gt: new Date(now) },
  });
  if (session && typeof query.session === 'function') query.session(session);

  const pending = await query;
  return pending
    ? { ...parseLaunchParam(pending.payload), firstSeenAt: pending.createdAt }
    : null;
}

async function getPendingTelegramLaunch(telegramId, options = {}) {
  const { now = Date.now(), session = null } = options;
  const query = PendingTelegramLaunch.findOne({
    telegramId: String(telegramId || ''),
    expiresAt: { $gt: new Date(now) },
  }).setOptions({ maxTimeMS: PENDING_TELEGRAM_LAUNCH_MAX_TIME_MS });
  if (session && typeof query.session === 'function') query.session(session);

  const pending = await query;
  return pending
    ? { ...parseLaunchParam(pending.payload), firstSeenAt: pending.createdAt }
    : null;
}

function selectTrustedTelegramLaunch(pendingLaunch, signedStartParam = '', now = Date.now()) {
  const signedLaunch = parseLaunchParam(signedStartParam);
  const emptyLaunch = parseLaunchParam('');
  const routingLaunch = signedLaunch.normalizedLaunchParam
    ? signedLaunch
    : pendingLaunch || emptyLaunch;
  const attributionLaunch = pendingLaunch?.attribution
    ? pendingLaunch
    : signedLaunch.attribution
      ? { ...signedLaunch, firstSeenAt: new Date(now) }
      : null;

  return {
    ...routingLaunch,
    attribution: attributionLaunch?.attribution || null,
    firstSeenAt: attributionLaunch?.firstSeenAt || null,
  };
}

module.exports = {
  PENDING_TELEGRAM_LAUNCH_TTL_MS,
  PENDING_TELEGRAM_LAUNCH_MAX_TIME_MS,
  consumePendingTelegramLaunch,
  getPendingTelegramLaunch,
  getPendingLaunchInsert,
  selectTrustedTelegramLaunch,
  storePendingTelegramLaunch,
};
