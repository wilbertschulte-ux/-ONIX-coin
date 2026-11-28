const crypto = require('crypto');

const TOTAL_WEIGHT_PPM = 1_000_000;
const WEEKLY_SPINS_LIMIT = 3;
const IPHONE_DUO_CAMPAIGN_CAPACITY = 100;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const FORTUNE_WHEEL_WEEKLY_CONFIG_VERSION = 'weekly-random-v1';
const FORTUNE_WHEEL_DRAW_VERSION = 'hmac-sha256-rejection-v1';
const RANDOM_SECRET_ENV_NAME = 'FORTUNE_WHEEL_RANDOM_SECRET';
const MIN_RANDOM_SECRET_BYTES = 32;
const MAX_DRAW_ATTEMPTS = 1024;
const SAFE_CODE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const SAFE_IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const ALLOWED_REWARD_TYPES = new Set(['onix', 'physical_prize']);
const ALLOWED_ONIX_AMOUNTS = new Set([5_000, 10_000, 25_000, 50_000, 250_000]);

const APPROVED_WEEKLY_PRIZES = Object.freeze([
  Object.freeze({ code: 'onix_5000', type: 'onix', amount: 5_000, weightPpm: 350_000 }),
  Object.freeze({ code: 'onix_10000', type: 'onix', amount: 10_000, weightPpm: 300_000 }),
  Object.freeze({ code: 'onix_25000', type: 'onix', amount: 25_000, weightPpm: 200_000 }),
  Object.freeze({ code: 'onix_50000', type: 'onix', amount: 50_000, weightPpm: 100_000 }),
  Object.freeze({ code: 'onix_250000', type: 'onix', amount: 250_000, weightPpm: 1_000 }),
  Object.freeze({
    code: 'iphone_duo',
    type: 'physical_prize',
    prizeCode: 'iphone_duo',
    weightPpm: 49_000,
  }),
]);

const APPROVED_PRIZE_BY_CODE = new Map(
  APPROVED_WEEKLY_PRIZES.map((prize) => [prize.code, prize])
);
const APPROVED_WEEKLY_CONFIG = Object.freeze({
  configVersion: FORTUNE_WHEEL_WEEKLY_CONFIG_VERSION,
  weeklySpinsLimit: WEEKLY_SPINS_LIMIT,
  physicalPrizeCapacity: IPHONE_DUO_CAMPAIGN_CAPACITY,
  totalWeightPpm: TOTAL_WEIGHT_PPM,
  prizes: APPROVED_WEEKLY_PRIZES,
});

class FortuneWheelWeeklyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'FortuneWheelWeeklyError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new FortuneWheelWeeklyError(code, message);
}

function asValidDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    fail('INVALID_WEEK_DATE', 'A valid date is required for the weekly period');
  }
  return date;
}

function getUtcWeekWindow(now = new Date()) {
  const date = asValidDate(now);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  const startsAt = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() - daysSinceMonday
  ));
  const resetsAt = new Date(startsAt.getTime() + WEEK_MS);

  return Object.freeze({
    weekKey: startsAt.toISOString().slice(0, 10),
    startsAt,
    resetsAt,
  });
}

function validateWeeklyPrizeConfig(prizes = APPROVED_WEEKLY_PRIZES) {
  if (!Array.isArray(prizes) || prizes.length !== APPROVED_WEEKLY_PRIZES.length) {
    fail('PRIZE_CONFIG_INVALID', 'The approved weekly prize set is required');
  }

  const seenCodes = new Set();
  let totalWeight = 0;

  for (const prize of prizes) {
    if (!prize || typeof prize !== 'object' || Array.isArray(prize)) {
      fail('PRIZE_CONFIG_INVALID', 'Every weekly prize must be an object');
    }

    const code = String(prize.code || '').trim();
    if (!SAFE_CODE_PATTERN.test(code)) {
      fail('PRIZE_CODE_INVALID', 'Every weekly prize requires a safe code');
    }
    if (seenCodes.has(code)) {
      fail('PRIZE_CODE_DUPLICATE', 'Weekly prize codes must be unique');
    }
    seenCodes.add(code);

    if (!ALLOWED_REWARD_TYPES.has(prize.type)) {
      fail('PRIZE_TYPE_INVALID', 'Weekly prize type is not supported');
    }
    if (!Number.isSafeInteger(prize.weightPpm) || prize.weightPpm <= 0) {
      fail('PRIZE_WEIGHT_INVALID', 'Weekly prize weights must be positive safe integers');
    }

    if (prize.type === 'onix') {
      if (!Number.isSafeInteger(prize.amount) || !ALLOWED_ONIX_AMOUNTS.has(prize.amount)) {
        fail('PRIZE_AMOUNT_INVALID', 'ONIX prize amount is not approved');
      }
      if (prize.prizeCode) {
        fail('PRIZE_CONFIG_INVALID', 'ONIX prizes cannot contain a physical prize code');
      }
    } else {
      if (prize.prizeCode !== 'iphone_duo' || Number(prize.amount || 0) !== 0) {
        fail('PRIZE_PHYSICAL_INVALID', 'Only the approved iPhone Duo physical prize is supported');
      }
    }

    const approved = APPROVED_PRIZE_BY_CODE.get(code);
    if (!approved) {
      fail('PRIZE_CODE_NOT_APPROVED', 'Weekly prize code is not in the approved configuration');
    }
    if (
      approved.type !== prize.type ||
      Number(approved.amount || 0) !== Number(prize.amount || 0) ||
      String(approved.prizeCode || '') !== String(prize.prizeCode || '')
    ) {
      fail('PRIZE_DEFINITION_MISMATCH', 'Weekly prize definition differs from the approved configuration');
    }
    if (approved.weightPpm !== prize.weightPpm) {
      fail('PRIZE_WEIGHT_MISMATCH', 'Weekly prize weight differs from the approved configuration');
    }

    totalWeight += prize.weightPpm;
  }

  if (seenCodes.size !== APPROVED_PRIZE_BY_CODE.size) {
    fail('PRIZE_SET_INCOMPLETE', 'The approved weekly prize set is incomplete');
  }
  if (totalWeight !== TOTAL_WEIGHT_PPM) {
    fail('PRIZE_WEIGHT_TOTAL_INVALID', 'Weekly prize weights must total exactly 1000000 ppm');
  }

  return Object.freeze({
    valid: true,
    totalWeightPpm: totalWeight,
    configVersion: FORTUNE_WHEEL_WEEKLY_CONFIG_VERSION,
    prizes: APPROVED_WEEKLY_PRIZES,
  });
}

function distributeRenormalizedWeights(prizes, eligibleIndexes) {
  const eligibleTotal = eligibleIndexes.reduce(
    (sum, index) => sum + prizes[index].weightPpm,
    0
  );
  if (eligibleTotal <= 0) {
    fail('EFFECTIVE_POOL_EMPTY', 'At least one weekly prize must remain available');
  }

  const allocations = eligibleIndexes.map((index) => {
    const numerator = BigInt(prizes[index].weightPpm) * BigInt(TOTAL_WEIGHT_PPM);
    return {
      index,
      base: Number(numerator / BigInt(eligibleTotal)),
      remainder: numerator % BigInt(eligibleTotal),
    };
  });
  let undistributed = TOTAL_WEIGHT_PPM - allocations.reduce((sum, item) => sum + item.base, 0);
  allocations.sort((left, right) => {
    if (left.remainder === right.remainder) return left.index - right.index;
    return left.remainder > right.remainder ? -1 : 1;
  });
  for (let index = 0; index < undistributed; index += 1) {
    allocations[index].base += 1;
  }

  return new Map(allocations.map((item) => [item.index, item.base]));
}

function buildEffectivePrizePool({
  prizes = APPROVED_WEEKLY_PRIZES,
  physicalPrizeAvailable = true,
  playerHasPhysicalPrize = false,
} = {}) {
  validateWeeklyPrizeConfig(prizes);
  const physicalAllowed = Boolean(physicalPrizeAvailable && !playerHasPhysicalPrize);
  const eligibleIndexes = [];

  prizes.forEach((prize, index) => {
    if (prize.type !== 'physical_prize' || physicalAllowed) eligibleIndexes.push(index);
  });
  const normalizedWeights = distributeRenormalizedWeights(prizes, eligibleIndexes);

  return Object.freeze(prizes.map((prize, index) => Object.freeze({
    ...prize,
    configuredWeightPpm: prize.weightPpm,
    effectiveWeightPpm: normalizedWeights.get(index) || 0,
    available: normalizedWeights.has(index),
  })));
}

function validateDrawablePool(pool) {
  if (!Array.isArray(pool) || pool.length === 0) {
    fail('DRAW_POOL_INVALID', 'A non-empty effective prize pool is required');
  }
  let total = 0;
  for (const prize of pool) {
    if (!Number.isSafeInteger(prize.effectiveWeightPpm) || prize.effectiveWeightPpm < 0) {
      fail('DRAW_WEIGHT_INVALID', 'Effective weights must be non-negative safe integers');
    }
    total += prize.effectiveWeightPpm;
  }
  if (total !== TOTAL_WEIGHT_PPM) {
    fail('DRAW_WEIGHT_TOTAL_INVALID', 'Effective weights must total exactly 1000000 ppm');
  }
  return total;
}

function selectPrizeByTicket(pool, ticket) {
  const total = validateDrawablePool(pool);
  if (!Number.isSafeInteger(ticket) || ticket < 0 || ticket >= total) {
    fail('DRAW_TICKET_INVALID', 'Draw ticket is outside the weighted pool');
  }

  let upperBound = 0;
  for (const prize of pool) {
    upperBound += prize.effectiveWeightPpm;
    if (ticket < upperBound) return prize;
  }
  fail('DRAW_SELECTION_FAILED', 'The weighted draw did not select a prize');
}

function bytesToBigInt(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
    fail('DRAW_ENTROPY_INVALID', 'Draw entropy must be a non-empty buffer');
  }
  return BigInt(`0x${bytes.toString('hex')}`);
}

function drawUnbiasedInteger({ upperBound, nextDigest }) {
  if (!Number.isSafeInteger(upperBound) || upperBound <= 0) {
    fail('DRAW_UPPER_BOUND_INVALID', 'Draw upper bound must be a positive safe integer');
  }
  if (typeof nextDigest !== 'function') {
    fail('DRAW_ENTROPY_PROVIDER_INVALID', 'A draw entropy provider is required');
  }

  const divisor = BigInt(upperBound);
  for (let attempt = 0; attempt < MAX_DRAW_ATTEMPTS; attempt += 1) {
    const digest = nextDigest(attempt);
    const value = bytesToBigInt(digest);
    const range = 1n << BigInt(digest.length * 8);
    const acceptanceLimit = range - (range % divisor);
    if (value < acceptanceLimit) return Number(value % divisor);
  }
  fail('DRAW_ENTROPY_EXHAUSTED', 'Unable to obtain an unbiased draw value');
}

function validateRandomSecret(secret) {
  const bytes = Buffer.isBuffer(secret) ? Buffer.from(secret) : Buffer.from(String(secret || ''), 'utf8');
  if (bytes.length < MIN_RANDOM_SECRET_BYTES) {
    fail('RANDOM_SECRET_INVALID', 'A separate Fortune Wheel random secret of at least 32 bytes is required');
  }
  return bytes;
}

function getFortuneWheelRandomSecret(environment = process.env) {
  return validateRandomSecret(environment[RANDOM_SECRET_ENV_NAME]);
}

function buildDrawMessage({
  campaignKey,
  configVersion = FORTUNE_WHEEL_WEEKLY_CONFIG_VERSION,
  weekKey,
  telegramId,
  spin,
  idempotencyKey,
  drawVersion = FORTUNE_WHEEL_DRAW_VERSION,
}) {
  const normalized = {
    campaignKey: String(campaignKey || '').trim(),
    configVersion: String(configVersion || '').trim(),
    weekKey: String(weekKey || '').trim(),
    telegramId: String(telegramId || '').trim(),
    spin: Number(spin),
    idempotencyKey: String(idempotencyKey || '').trim(),
    drawVersion: String(drawVersion || '').trim(),
  };

  if (!SAFE_CODE_PATTERN.test(normalized.campaignKey)) {
    fail('DRAW_CAMPAIGN_INVALID', 'A safe campaign key is required');
  }
  if (!SAFE_CODE_PATTERN.test(normalized.configVersion)) {
    fail('DRAW_CONFIG_VERSION_INVALID', 'A safe configuration version is required');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized.weekKey)) {
    fail('DRAW_WEEK_INVALID', 'A UTC week key is required');
  }
  if (!/^\d{1,32}$/.test(normalized.telegramId)) {
    fail('DRAW_TELEGRAM_ID_INVALID', 'A Telegram identity is required');
  }
  if (!Number.isInteger(normalized.spin) || normalized.spin < 1 || normalized.spin > WEEKLY_SPINS_LIMIT) {
    fail('DRAW_SPIN_INVALID', 'Spin must be within the weekly limit');
  }
  if (!SAFE_IDEMPOTENCY_KEY_PATTERN.test(normalized.idempotencyKey)) {
    fail('DRAW_IDEMPOTENCY_KEY_INVALID', 'A valid idempotency key is required');
  }
  if (normalized.drawVersion !== FORTUNE_WHEEL_DRAW_VERSION) {
    fail('DRAW_VERSION_INVALID', 'Draw version is not supported');
  }

  return Buffer.from(JSON.stringify([
    normalized.drawVersion,
    normalized.campaignKey,
    normalized.configVersion,
    normalized.weekKey,
    normalized.telegramId,
    normalized.spin,
    normalized.idempotencyKey,
  ]), 'utf8');
}

function drawWeeklyPrize({
  secret,
  campaignKey,
  configVersion = FORTUNE_WHEEL_WEEKLY_CONFIG_VERSION,
  weekKey,
  telegramId,
  spin,
  idempotencyKey,
  physicalPrizeAvailable = true,
  playerHasPhysicalPrize = false,
  prizes = APPROVED_WEEKLY_PRIZES,
}) {
  const secretBytes = validateRandomSecret(secret);
  const pool = buildEffectivePrizePool({
    prizes,
    physicalPrizeAvailable,
    playerHasPhysicalPrize,
  });
  const message = buildDrawMessage({
    campaignKey,
    configVersion,
    weekKey,
    telegramId,
    spin,
    idempotencyKey,
  });
  const ticket = drawUnbiasedInteger({
    upperBound: TOTAL_WEIGHT_PPM,
    nextDigest(attempt) {
      return crypto
        .createHmac('sha256', secretBytes)
        .update(message)
        .update(Buffer.from([0]))
        .update(String(attempt))
        .digest();
    },
  });
  const prize = selectPrizeByTicket(pool, ticket);

  return Object.freeze({
    ticket,
    reward: prize,
    configVersion,
    drawVersion: FORTUNE_WHEEL_DRAW_VERSION,
    pool,
  });
}

module.exports = {
  ALLOWED_ONIX_AMOUNTS,
  APPROVED_WEEKLY_CONFIG,
  APPROVED_WEEKLY_PRIZES,
  FORTUNE_WHEEL_DRAW_VERSION,
  FORTUNE_WHEEL_WEEKLY_CONFIG_VERSION,
  FortuneWheelWeeklyError,
  IPHONE_DUO_CAMPAIGN_CAPACITY,
  RANDOM_SECRET_ENV_NAME,
  TOTAL_WEIGHT_PPM,
  WEEKLY_SPINS_LIMIT,
  buildDrawMessage,
  buildEffectivePrizePool,
  drawUnbiasedInteger,
  drawWeeklyPrize,
  getFortuneWheelRandomSecret,
  getUtcWeekWindow,
  selectPrizeByTicket,
  validateRandomSecret,
  validateWeeklyPrizeConfig,
};
