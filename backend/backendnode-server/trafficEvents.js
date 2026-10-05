const TrafficEvent = require('./models/TrafficEvent');
const TRAFFIC_EVENT_MAX_TIME_MS = 1000;
const TRAFFIC_EVENT_QUEUE_TIMEOUT_MS = 1500;
const TRAFFIC_EVENT_MAX_IN_FLIGHT = 8;

let activeTrafficEventWrites = 0;

function getTrafficDayKey(value = Date.now()) {
  return new Date(value).toISOString().slice(0, 10);
}

function getUserTrafficAttribution(user) {
  const attribution = user?.trafficAttribution;
  if (!attribution?.source) return null;
  return {
    source: String(attribution.source),
    campaign: String(attribution.campaign || ''),
    market: String(attribution.market || ''),
    landingCode: String(attribution.landingCode || attribution.source),
  };
}

async function recordTrafficEvent({
  telegramId,
  event,
  attribution,
  occurredAt = Date.now(),
  deduplicationKey = '',
}) {
  const safeTelegramId = String(telegramId || '');
  if (!safeTelegramId || !attribution?.source) return { recorded: false, reason: 'not_attributed' };

  const dayKey = getTrafficDayKey(occurredAt);
  const eventKey = [event, safeTelegramId, deduplicationKey || dayKey].join(':');

  try {
    const result = await TrafficEvent.updateOne(
      { eventKey },
      {
        $setOnInsert: {
          eventKey,
          telegramId: safeTelegramId,
          event,
          source: attribution.source,
          campaign: attribution.campaign || '',
          market: attribution.market || '',
          landingCode: attribution.landingCode || attribution.source,
          occurredAt: new Date(occurredAt),
          dayKey,
        },
      },
      { upsert: true, maxTimeMS: TRAFFIC_EVENT_MAX_TIME_MS }
    );
    return { recorded: Boolean(result?.upsertedCount), duplicate: !result?.upsertedCount };
  } catch (error) {
    if (error?.code === 11000) return { recorded: false, duplicate: true };
    return { recorded: false, reason: 'storage_error' };
  }
}

function queueTrafficEvent(
  input,
  writer = recordTrafficEvent,
  timeoutMs = TRAFFIC_EVENT_QUEUE_TIMEOUT_MS
) {
  if (activeTrafficEventWrites >= TRAFFIC_EVENT_MAX_IN_FLIGHT) {
    console.warn('Traffic analytics queue capacity reached');
    return;
  }

  activeTrafficEventWrites += 1;
  let timeoutId = null;
  const writerPromise = Promise.resolve().then(() => writer(input));
  const timeout = new Promise((resolve) => {
    timeoutId = setTimeout(
      () => resolve({ recorded: false, reason: 'timeout' }),
      timeoutMs
    );
  });

  // Keep the slot occupied until the actual writer settles. The local timeout
  // only stops observing the write; it cannot safely cancel every MongoDB
  // driver state supported by this project. This hard cap prevents timed-out
  // operations from growing without bound.
  writerPromise.then(
    () => {
      activeTrafficEventWrites -= 1;
    },
    () => {
      activeTrafficEventWrites -= 1;
    }
  );

  Promise.race([writerPromise, timeout])
    .then((result) => {
      if (result?.reason === 'storage_error' || result?.reason === 'timeout') {
        console.warn('Traffic analytics write failed');
      }
    })
    .catch(() => {
      console.warn('Traffic analytics write failed');
    })
    .finally(() => {
      if (timeoutId) clearTimeout(timeoutId);
    });
}

module.exports = {
  TRAFFIC_EVENT_MAX_IN_FLIGHT,
  TRAFFIC_EVENT_MAX_TIME_MS,
  TRAFFIC_EVENT_QUEUE_TIMEOUT_MS,
  getTrafficDayKey,
  getUserTrafficAttribution,
  queueTrafficEvent,
  recordTrafficEvent,
};
