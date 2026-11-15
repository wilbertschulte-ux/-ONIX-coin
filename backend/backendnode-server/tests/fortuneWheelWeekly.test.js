const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  APPROVED_WEEKLY_CONFIG,
  APPROVED_WEEKLY_PRIZES,
  FORTUNE_WHEEL_DRAW_VERSION,
  FORTUNE_WHEEL_WEEKLY_CONFIG_VERSION,
  TOTAL_WEIGHT_PPM,
  buildEffectivePrizePool,
  drawUnbiasedInteger,
  drawWeeklyPrize,
  getFortuneWheelRandomSecret,
  getUtcWeekWindow,
  selectPrizeByTicket,
  validateWeeklyPrizeConfig,
} = require('../fortuneWheelWeekly');

const TEST_SECRET = 'test-only-fortune-wheel-random-secret-32-bytes';

function expectCode(callback, code) {
  assert.throws(callback, (error) => error?.code === code);
}

test('UTC week starts Monday 00:00 and resets on the next Monday', () => {
  const monday = getUtcWeekWindow(new Date('2026-11-02T00:00:00.000Z'));
  assert.equal(monday.weekKey, '2026-11-02');
  assert.equal(monday.startsAt.toISOString(), '2026-11-02T00:00:00.000Z');
  assert.equal(monday.resetsAt.toISOString(), '2026-11-09T00:00:00.000Z');

  const sunday = getUtcWeekWindow(new Date('2026-11-08T23:59:59.999Z'));
  assert.equal(sunday.weekKey, monday.weekKey);
  assert.equal(sunday.resetsAt.toISOString(), monday.resetsAt.toISOString());

  const nextMonday = getUtcWeekWindow(new Date('2026-11-09T00:00:00.000Z'));
  assert.equal(nextMonday.weekKey, '2026-11-09');
  assert.equal(nextMonday.startsAt.toISOString(), monday.resetsAt.toISOString());
});

test('UTC week handles year boundaries without local timezone input', () => {
  const window = getUtcWeekWindow('2027-01-01T12:00:00.000Z');
  assert.equal(window.weekKey, '2026-12-28');
  assert.equal(window.startsAt.toISOString(), '2026-12-28T00:00:00.000Z');
  assert.equal(window.resetsAt.toISOString(), '2027-01-04T00:00:00.000Z');
  expectCode(() => getUtcWeekWindow('not-a-date'), 'INVALID_WEEK_DATE');
});

test('approved prize configuration has exact immutable weights totaling one million ppm', () => {
  const validation = validateWeeklyPrizeConfig();
  assert.equal(validation.valid, true);
  assert.equal(validation.totalWeightPpm, TOTAL_WEIGHT_PPM);
  assert.equal(validation.configVersion, FORTUNE_WHEEL_WEEKLY_CONFIG_VERSION);
  assert.equal(APPROVED_WEEKLY_CONFIG.weeklySpinsLimit, 3);
  assert.equal(APPROVED_WEEKLY_CONFIG.physicalPrizeCapacity, 100);
  assert.equal(Object.isFrozen(APPROVED_WEEKLY_CONFIG), true);
  assert.deepEqual(
    APPROVED_WEEKLY_PRIZES.map(({ code, weightPpm }) => [code, weightPpm]),
    [
      ['onix_5000', 350_000],
      ['onix_10000', 300_000],
      ['onix_25000', 200_000],
      ['onix_50000', 100_000],
      ['onix_250000', 1_000],
      ['iphone_duo', 49_000],
    ]
  );
  assert.equal(Object.isFrozen(APPROVED_WEEKLY_PRIZES), true);
  assert.equal(APPROVED_WEEKLY_PRIZES.every(Object.isFrozen), true);
});

test('configuration validator rejects duplicate, invalid and changed prize definitions', () => {
  const duplicate = APPROVED_WEEKLY_PRIZES.map((prize) => ({ ...prize }));
  duplicate[1].code = duplicate[0].code;
  expectCode(() => validateWeeklyPrizeConfig(duplicate), 'PRIZE_CODE_DUPLICATE');

  const invalidType = APPROVED_WEEKLY_PRIZES.map((prize) => ({ ...prize }));
  invalidType[0].type = 'cash';
  expectCode(() => validateWeeklyPrizeConfig(invalidType), 'PRIZE_TYPE_INVALID');

  const invalidAmount = APPROVED_WEEKLY_PRIZES.map((prize) => ({ ...prize }));
  invalidAmount[0].amount = 5_001;
  expectCode(() => validateWeeklyPrizeConfig(invalidAmount), 'PRIZE_AMOUNT_INVALID');

  const nonIntegerWeight = APPROVED_WEEKLY_PRIZES.map((prize) => ({ ...prize }));
  nonIntegerWeight[0].weightPpm = 349_999.5;
  expectCode(() => validateWeeklyPrizeConfig(nonIntegerWeight), 'PRIZE_WEIGHT_INVALID');

  const changedWeight = APPROVED_WEEKLY_PRIZES.map((prize) => ({ ...prize }));
  changedWeight[0].weightPpm -= 1;
  changedWeight[1].weightPpm += 1;
  expectCode(() => validateWeeklyPrizeConfig(changedWeight), 'PRIZE_WEIGHT_MISMATCH');
});

test('ticket boundaries select the exact 35, 30, 20, 10, 0.1 and 4.9 percent prizes', () => {
  const pool = buildEffectivePrizePool();
  const cases = [
    [0, 'onix_5000'],
    [349_999, 'onix_5000'],
    [350_000, 'onix_10000'],
    [649_999, 'onix_10000'],
    [650_000, 'onix_25000'],
    [849_999, 'onix_25000'],
    [850_000, 'onix_50000'],
    [949_999, 'onix_50000'],
    [950_000, 'onix_250000'],
    [950_999, 'onix_250000'],
    [951_000, 'iphone_duo'],
    [999_999, 'iphone_duo'],
  ];
  for (const [ticket, expectedCode] of cases) {
    assert.equal(selectPrizeByTicket(pool, ticket).code, expectedCode);
  }
});

test('unbiased integer generation rejects values in modulo-bias tail', () => {
  let calls = 0;
  const value = drawUnbiasedInteger({
    upperBound: TOTAL_WEIGHT_PPM,
    nextDigest() {
      calls += 1;
      return calls === 1 ? Buffer.alloc(32, 0xff) : Buffer.alloc(32, 0x00);
    },
  });
  assert.equal(value, 0);
  assert.equal(calls, 2);
});

test('cryptographic draw is deterministic for the same retry identity', () => {
  const input = {
    secret: TEST_SECRET,
    campaignKey: 'fortune-wheel-weekly-v1',
    weekKey: '2026-11-02',
    telegramId: '100000001',
    spin: 2,
    idempotencyKey: 'weekly-spin-retry-0001',
  };
  const first = drawWeeklyPrize(input);
  const retry = drawWeeklyPrize(input);
  assert.equal(first.ticket, retry.ticket);
  assert.equal(first.reward.code, retry.reward.code);
  assert.equal(first.configVersion, FORTUNE_WHEEL_WEEKLY_CONFIG_VERSION);
  assert.equal(first.drawVersion, FORTUNE_WHEEL_DRAW_VERSION);
});

test('random secret is separate, mandatory and never included in draw results', () => {
  expectCode(() => getFortuneWheelRandomSecret({}), 'RANDOM_SECRET_INVALID');
  expectCode(
    () => getFortuneWheelRandomSecret({ FORTUNE_WHEEL_RANDOM_SECRET: 'too-short' }),
    'RANDOM_SECRET_INVALID'
  );
  const secret = getFortuneWheelRandomSecret({ FORTUNE_WHEEL_RANDOM_SECRET: TEST_SECRET });
  assert.equal(Buffer.isBuffer(secret), true);
  const result = drawWeeklyPrize({
    secret,
    campaignKey: 'fortune-wheel-weekly-v1',
    weekKey: '2026-11-02',
    telegramId: '100000001',
    spin: 1,
    idempotencyKey: 'weekly-spin-secret-0001',
  });
  assert.equal(JSON.stringify(result).includes(TEST_SECRET), false);
});

test('effective pool keeps approved weights while the iPhone remains available', () => {
  const pool = buildEffectivePrizePool({ physicalPrizeAvailable: true, playerHasPhysicalPrize: false });
  assert.equal(pool.reduce((sum, prize) => sum + prize.effectiveWeightPpm, 0), TOTAL_WEIGHT_PPM);
  for (const prize of pool) {
    assert.equal(prize.effectiveWeightPpm, prize.weightPpm);
    assert.equal(prize.available, true);
  }
});

test('effective pool excludes iPhone at capacity and proportionally renormalizes ONIX', () => {
  const pool = buildEffectivePrizePool({ physicalPrizeAvailable: false });
  const iphone = pool.find((prize) => prize.code === 'iphone_duo');
  assert.equal(iphone.available, false);
  assert.equal(iphone.effectiveWeightPpm, 0);
  assert.equal(pool.reduce((sum, prize) => sum + prize.effectiveWeightPpm, 0), TOTAL_WEIGHT_PPM);

  const onix = pool.filter((prize) => prize.type === 'onix');
  const sourceTotal = onix.reduce((sum, prize) => sum + prize.weightPpm, 0);
  for (const prize of onix) {
    const exact = prize.weightPpm * TOTAL_WEIGHT_PPM / sourceTotal;
    assert.ok(Math.abs(prize.effectiveWeightPpm - exact) < 1);
  }
});

test('a player who already has an iPhone cannot draw a second one', () => {
  const pool = buildEffectivePrizePool({
    physicalPrizeAvailable: true,
    playerHasPhysicalPrize: true,
  });
  assert.equal(pool.find((prize) => prize.code === 'iphone_duo').effectiveWeightPpm, 0);

  const result = drawWeeklyPrize({
    secret: TEST_SECRET,
    campaignKey: 'fortune-wheel-weekly-v1',
    weekKey: '2026-11-02',
    telegramId: '100000001',
    spin: 3,
    idempotencyKey: 'weekly-spin-no-second-iphone',
    playerHasPhysicalPrize: true,
  });
  assert.equal(result.reward.type, 'onix');
});

test('weekly draw implementation does not use Math.random', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'fortuneWheelWeekly.js'), 'utf8');
  assert.doesNotMatch(source, /Math\.random\s*\(/);
  assert.match(source, /createHmac\('sha256'/);
  assert.match(source, /acceptanceLimit/);
});
