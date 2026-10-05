const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const mongoose = require('mongoose');

process.env.NODE_ENV = 'test';
const TEST_BOT_TOKEN = 'isolated-promo-test-bot-token';
process.env.BOT_TOKEN = TEST_BOT_TOKEN;

const User = require('../models/User');
const router = require('../routes/coinRoutes');

const promoRoute = router.stack.find(
  (layer) => layer.route?.path === '/apply-promo' && layer.route?.methods?.post
);
assert.ok(promoRoute, 'POST /apply-promo route is registered');

const rewardEnvironmentKeys = [
  'PROMO_START_REWARD',
  'PROMO_ONIX2026_REWARD',
  'PROMO_LAUNCH_REWARD',
  'PROMO_GG5000_REWARD',
  'PROMO_GG7000_REWARD',
  'PROMO_WW10000_REWARD',
];
const originalRewardEnvironment = Object.fromEntries(
  rewardEnvironmentKeys.map((key) => [key, process.env[key]])
);

for (const key of rewardEnvironmentKeys) delete process.env[key];

test.after(() => {
  for (const [key, value] of Object.entries(originalRewardEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function createSignedInitData(telegramId) {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: `promo-test-${telegramId}`,
    user: JSON.stringify({
      id: Number(telegramId),
      first_name: 'Promo',
      username: `promo_${telegramId}`,
      language_code: 'de',
    }),
  });
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(TEST_BOT_TOKEN)
    .digest();
  const hash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');
  params.set('hash', hash);
  return params.toString();
}

function createRequest({ telegramId = '71001', code = 'GG7000', initData } = {}) {
  const signedInitData = initData === undefined ? createSignedInitData(telegramId) : initData;
  return {
    body: { telegramId, code },
    ip: '127.0.0.1',
    path: '/apply-promo',
    socket: { remoteAddress: '127.0.0.1' },
    get(name) {
      return name.toLowerCase() === 'x-telegram-init-data' ? signedInitData : '';
    },
  };
}

function createResponse() {
  const response = new EventEmitter();
  response.statusCode = 200;
  response.body = null;
  response.status = function status(code) {
    this.statusCode = code;
    return this;
  };
  response.json = function json(value) {
    this.body = value;
    this.emit('finish');
    return this;
  };
  return response;
}

async function invokePromoRoute(req) {
  const res = createResponse();
  const stack = promoRoute.route.stack;

  async function dispatch(index) {
    const layer = stack[index];
    if (!layer) return undefined;
    return layer.handle(req, res, () => dispatch(index + 1));
  }

  await dispatch(0);
  return res;
}

function createPromoUser(overrides = {}) {
  return new User({
    telegramId: '71001',
    username: 'promo-user',
    appLanguage: 'de',
    balance: 100,
    totalEarned: 200,
    weeklyEarned: 300,
    usedPromoCodes: [],
    transactions: [],
    securityLogs: [],
    ...overrides,
  });
}

async function withMockedUser(user, callback, options = {}) {
  const originalFindOne = User.findOne;
  const originalFindOneAndUpdate = User.findOneAndUpdate;
  const originalSave = User.prototype.save;
  const originalStartSession = mongoose.startSession;
  let saveCalls = 0;

  User.findOne = ({ telegramId }) => {
    const value = String(telegramId) === String(user.telegramId) ? user : null;
    return {
      session() {
        return this;
      },
      select() {
        return this;
      },
      maxTimeMS() {
        return this;
      },
      lean() {
        return Promise.resolve(value);
      },
      then(resolve, reject) {
        return Promise.resolve(value).then(resolve, reject);
      },
    };
  };
  User.findOneAndUpdate = async (filter, update, options) => {
    const claimedCode = filter.usedPromoCodes?.$ne;
    assert.equal(String(filter._id), String(user._id));
    assert.equal(typeof claimedCode, 'string');
    assert.deepEqual(update, { $addToSet: { usedPromoCodes: claimedCode } });
    assert.equal(options.new, true);
    assert.ok(options.session);

    if (user.usedPromoCodes.includes(claimedCode)) return null;
    user.usedPromoCodes.push(claimedCode);
    return user;
  };
  mongoose.startSession = async () => ({
    async withTransaction(transaction) {
      return transaction();
    },
    async endSession() {},
  });
  User.prototype.save = async function save() {
    saveCalls += 1;
    if (options.saveDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.saveDelayMs));
    }
    return this;
  };

  try {
    return await callback({ getSaveCalls: () => saveCalls });
  } finally {
    User.findOne = originalFindOne;
    User.findOneAndUpdate = originalFindOneAndUpdate;
    User.prototype.save = originalSave;
    mongoose.startSession = originalStartSession;
  }
}

test('GG7000 grants exactly 7000 ONIX before achievement and rank bonuses', async () => {
  const user = createPromoUser();

  await withMockedUser(user, async () => {
    const response = await invokePromoRoute(createRequest());

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.promo.code, 'GG7000');
    assert.equal(response.body.promo.reward, 7000);
    assert.deepEqual(response.body.achievementBonuses, []);
    assert.deepEqual(response.body.rankBonuses, []);
    assert.equal(user.balance, 7100);
    assert.equal(user.totalEarned, 7200);
    assert.equal(user.weeklyEarned, 7300);
  });
});

test('GG7000 normalization preserves trim and uppercase behavior', async () => {
  for (const [index, code] of ['GG7000', 'gg7000', ' GG7000 '].entries()) {
    const telegramId = String(71100 + index);
    const user = createPromoUser({ telegramId, balance: 0, totalEarned: 0, weeklyEarned: 0 });

    await withMockedUser(user, async () => {
      const response = await invokePromoRoute(createRequest({ telegramId, code }));
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.body.promo, { code: 'GG7000', reward: 7000 });
      assert.deepEqual(user.usedPromoCodes, ['GG7000']);
    });
  }
});

test('repeated GG7000 activation is rejected without another reward', async () => {
  const user = createPromoUser({ balance: 0, totalEarned: 0, weeklyEarned: 0 });

  await withMockedUser(user, async () => {
    const first = await invokePromoRoute(createRequest());
    const stateAfterFirst = {
      balance: user.balance,
      totalEarned: user.totalEarned,
      weeklyEarned: user.weeklyEarned,
      transactions: user.transactions.length,
    };
    const second = await invokePromoRoute(createRequest());

    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 400);
    assert.deepEqual({
      balance: user.balance,
      totalEarned: user.totalEarned,
      weeklyEarned: user.weeklyEarned,
      transactions: user.transactions.length,
    }, stateAfterFirst);
    assert.equal(user.usedPromoCodes.filter((code) => code === 'GG7000').length, 1);
  });
});

test('unauthorized apply-promo request cannot grant a reward', async () => {
  const user = createPromoUser({ balance: 0, totalEarned: 0, weeklyEarned: 0 });

  await withMockedUser(user, async ({ getSaveCalls }) => {
    const response = await invokePromoRoute(createRequest({ initData: '' }));

    assert.equal(response.statusCode, 401);
    assert.equal(getSaveCalls(), 0);
    assert.equal(user.balance, 0);
    assert.deepEqual(user.usedPromoCodes, []);
  });
});

test('frozen user cannot activate GG7000', async () => {
  const user = createPromoUser({
    balance: 0,
    totalEarned: 0,
    weeklyEarned: 0,
    isFrozen: true,
    frozenReason: 'test freeze',
  });

  await withMockedUser(user, async ({ getSaveCalls }) => {
    const response = await invokePromoRoute(createRequest());

    assert.equal(response.statusCode, 403);
    assert.equal(getSaveCalls(), 0);
    assert.equal(user.balance, 0);
    assert.deepEqual(user.usedPromoCodes, []);
  });
});

test('existing promo codes retain their fallback rewards', async () => {
  const expectedRewards = {
    START: 5000,
    ONIX2026: 10000,
    LAUNCH: 15000,
    GG5000: 5000,
    WW10000: 10000,
  };

  for (const [index, [code, reward]] of Object.entries(expectedRewards).entries()) {
    const telegramId = String(71200 + index);
    const user = createPromoUser({ telegramId, balance: 0, totalEarned: 0, weeklyEarned: 0 });

    await withMockedUser(user, async () => {
      const response = await invokePromoRoute(createRequest({ telegramId, code }));
      assert.equal(response.statusCode, 200);
      assert.equal(response.body.promo.reward, reward);
      assert.equal(user.balance, reward);
    });
  }
});

test('successful GG7000 activation updates earnings, usage and income_promo history', async () => {
  const user = createPromoUser({ balance: 10, totalEarned: 20, weeklyEarned: 30 });

  await withMockedUser(user, async ({ getSaveCalls }) => {
    const response = await invokePromoRoute(createRequest());
    const promoTransactions = user.transactions.filter(
      (transaction) => transaction.type === 'income_promo'
    );

    assert.equal(response.statusCode, 200);
    assert.equal(getSaveCalls(), 1);
    assert.equal(user.balance, 7010);
    assert.equal(user.totalEarned, 7020);
    assert.equal(user.weeklyEarned, 7030);
    assert.deepEqual(user.usedPromoCodes, ['GG7000']);
    assert.equal(promoTransactions.length, 1);
    assert.equal(promoTransactions[0].amount, 7000);
    assert.equal(promoTransactions[0].title, 'Promocode GG7000');
  });
});

test('same-process concurrent GG7000 activation is serialized by the reward guard', async () => {
  const user = createPromoUser({ balance: 0, totalEarned: 0, weeklyEarned: 0 });

  await withMockedUser(user, async () => {
    const [first, second] = await Promise.all([
      invokePromoRoute(createRequest()),
      invokePromoRoute(createRequest()),
    ]);
    const statuses = [first.statusCode, second.statusCode].sort((left, right) => left - right);

    assert.deepEqual(statuses, [200, 409]);
    assert.equal(user.balance, 7000);
    assert.equal(user.totalEarned, 7000);
    assert.equal(user.weeklyEarned, 7000);
    assert.equal(user.usedPromoCodes.filter((code) => code === 'GG7000').length, 1);
    assert.equal(
      user.transactions.filter((transaction) => transaction.type === 'income_promo').length,
      1
    );
  }, { saveDelayMs: 10 });
});

test('apply-promo wires the conditional claim and every reward mutation to one session', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'routes', 'coinRoutes.js'),
    'utf8'
  );
  const routeStart = source.indexOf("router.post('/apply-promo'");
  const routeEnd = source.indexOf('// PUBLIC HEALTH CHECK', routeStart);
  const applyPromoRoute = source.slice(routeStart, routeEnd);

  assert.match(applyPromoRoute, /session\.withTransaction/);
  assert.match(applyPromoRoute, /User\.findOne\(\{ telegramId \}\)\.session\(session\)/);
  assert.match(applyPromoRoute, /usedPromoCodes:\s*\{\s*\$ne:\s*cleanCode\s*\}/);
  assert.match(applyPromoRoute, /\$addToSet:\s*\{\s*usedPromoCodes:\s*cleanCode\s*\}/);
  assert.match(applyPromoRoute, /new:\s*true,\s*session/);
  assert.match(applyPromoRoute, /addEarnings\(user, reward, session\)/);
  assert.match(applyPromoRoute, /applyAchievements\(user, session\)/);
  assert.match(applyPromoRoute, /applyRankBonuses\(user, session\)/);
  assert.match(applyPromoRoute, /user\.save\(\{ session \}\)/);
});
