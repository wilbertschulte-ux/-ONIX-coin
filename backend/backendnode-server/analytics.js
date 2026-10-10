const AnalyticsEvent = require('./models/AnalyticsEvent');
const { ANALYTICS_EVENT_TYPES } = require('./models/AnalyticsEvent');

const ANALYTICS_MAX_TIME_MS = 1000;
const ANALYTICS_QUEUE_TIMEOUT_MS = 1500;
const ANALYTICS_MAX_IN_FLIGHT = 8;
const ALLOWED_EVENTS = new Set(ANALYTICS_EVENT_TYPES);

let activeAnalyticsWrites = 0;

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;

  const safeMetadata = {};
  Object.entries(metadata).slice(0, 12).forEach(([key, value]) => {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(key)) return;
    if (typeof value === 'string') safeMetadata[key] = value.slice(0, 128);
    if (typeof value === 'number' && Number.isFinite(value)) safeMetadata[key] = value;
    if (typeof value === 'boolean' || value === null) safeMetadata[key] = value;
  });

  return Object.keys(safeMetadata).length ? safeMetadata : undefined;
}

async function recordAnalyticsEvent({
  telegramId,
  event,
  attribution,
  metadata,
  occurredAt = Date.now(),
  deduplicationKey,
}) {
  const safeTelegramId = String(telegramId || '').slice(0, 64);
  const safeEvent = String(event || '');
  if (!safeTelegramId || !ALLOWED_EVENTS.has(safeEvent)) {
    return { recorded: false, reason: 'invalid_event' };
  }

  const safeDeduplicationKey = deduplicationKey === undefined
    ? undefined
    : String(deduplicationKey).slice(0, 128);
  const eventDocument = {
    telegramId: safeTelegramId,
    event: safeEvent,
    source: String(attribution?.source || '').slice(0, 64),
    campaign: String(attribution?.campaign || '').slice(0, 48),
    market: String(attribution?.market || '').slice(0, 8),
    landingCode: String(attribution?.landingCode || attribution?.source || '').slice(0, 64),
    metadata: sanitizeMetadata(metadata),
    occurredAt: new Date(occurredAt),
    ...(safeDeduplicationKey !== undefined
      ? { deduplicationKey: safeDeduplicationKey }
      : {}),
  };

  try {
    if (safeDeduplicationKey !== undefined) {
      const result = await AnalyticsEvent.updateOne(
        {
          telegramId: safeTelegramId,
          event: safeEvent,
          deduplicationKey: safeDeduplicationKey,
        },
        { $setOnInsert: eventDocument },
        { upsert: true, maxTimeMS: ANALYTICS_MAX_TIME_MS }
      );
      return { recorded: Boolean(result?.upsertedCount), duplicate: !result?.upsertedCount };
    }

    await AnalyticsEvent.create(eventDocument);
    return { recorded: true, duplicate: false };
  } catch (error) {
    if (error?.code === 11000) return { recorded: false, duplicate: true };
    return { recorded: false, reason: 'storage_error' };
  }
}

function trackAnalyticsEvent(
  input,
  writer = recordAnalyticsEvent,
  timeoutMs = ANALYTICS_QUEUE_TIMEOUT_MS
) {
  if (activeAnalyticsWrites >= ANALYTICS_MAX_IN_FLIGHT) {
    console.warn('Analytics event queue capacity reached');
    return;
  }

  activeAnalyticsWrites += 1;
  let timeoutId = null;
  const writerPromise = Promise.resolve().then(() => writer(input));
  const timeout = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve({ recorded: false, reason: 'timeout' }), timeoutMs);
  });

  writerPromise.then(
    () => { activeAnalyticsWrites -= 1; },
    () => { activeAnalyticsWrites -= 1; }
  );

  Promise.race([writerPromise, timeout])
    .then((result) => {
      if (result?.reason === 'storage_error' || result?.reason === 'timeout') {
        console.warn('Analytics event write failed');
      }
    })
    .catch(() => console.warn('Analytics event write failed'))
    .finally(() => {
      if (timeoutId) clearTimeout(timeoutId);
    });
}

module.exports = {
  ANALYTICS_EVENT_TYPES,
  ANALYTICS_MAX_IN_FLIGHT,
  ANALYTICS_MAX_TIME_MS,
  ANALYTICS_QUEUE_TIMEOUT_MS,
  recordAnalyticsEvent,
  sanitizeMetadata,
  trackAnalyticsEvent,
};
