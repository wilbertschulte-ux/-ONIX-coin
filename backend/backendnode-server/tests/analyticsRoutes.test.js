const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');
const axios = require('axios');

process.env.NODE_ENV = 'test';

const analytics = require('../analytics');
const realTrackAnalyticsEvent = analytics.trackAnalyticsEvent;
const analyticsAttempts = [];
const analyticsEvents = [];
const analyticsKeys = new Set();
let analyticsFailureMode = '';

analytics.trackAnalyticsEvent = (input) => {
  analyticsAttempts.push(input);
  if (analyticsFailureMode === 'reject') {
    return realTrackAnalyticsEvent(input, async () => {
      throw new Error('analytics unavailable');
    }, 5);
  }
  if (analyticsFailureMode === 'timeout') {
    return realTrackAnalyticsEvent(
      input,
      () => new Promise((resolve) => setTimeout(() => resolve({ recorded: true }), 30)),
      5
    );
  }

  const key = `${input.telegramId}:${input.event}:${input.deduplicationKey ?? ''}`;
  if (!analyticsKeys.has(key)) {
    analyticsKeys.add(key);
    analyticsEvents.push(input);
  }
  return undefined;
};

const User = require('../models/User');
const router = require('../routes/coinRoutes');

test.after(() => {
  analytics.trackAnalyticsEvent = realTrackAnalyticsEvent;
});

function getUtcDayKey(value = Date.now()) {
  return new Date(value).toISOString().slice(0, 10);
}

function getWeekKey(value = Date.now()) {
  const date = new Date(value);
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7);
  return `${utcDate.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function resetAnalytics() {
  analyticsAttempts.length = 0;
  analyticsEvents.length = 0;
  analyticsKeys.clear();
  analyticsFailureMode = '';
}

function createUser(telegramId, overrides = {}) {
  const now = Date.now();
  return new User({
    telegramId: String(telegramId),
    username: `analytics-${telegramId}`,
    appLanguage: 'de',
    balance: 200000,
    totalEarned: 0,
    weeklyEarned: 0,
    weeklyEarnedWeek: getWeekKey(now),
    energy: 1000,
    maxEnergy: 1000,
    tapPower: 1,
    totalTaps: 0,
    claimedDailyMissions: [],
    claimedWeeklyMissions: [],
    completedTasks: [],
    teamMissionClaims: [],
    withdrawalRequests: [],
    transactions: [],
    usedPromoCodes: [],
    missionStats: {
      dailyKey: getUtcDayKey(now),
      weeklyKey: getWeekKey(now),
      dailyTaps: 0,
      weeklyTaps: 0,
    },
    trafficAttribution: {
      source: 'tg_de_01',
      campaign: '01',
      market: 'de',
      landingCode: 'tg_de_01',
      firstSeenAt: new Date(now),
    },
    ...overrides,
  });
}

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
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

async function invokeRoute(path, body, telegramId) {
  const layer = router.stack.find((item) => item.route?.path === path && item.route?.methods?.post);
  assert.ok(layer, `${path} is registered`);
  const handler = layer.route.stack[layer.route.stack.length - 1].handle;
  const req = {
    body,
    telegramUserId: String(telegramId),
    telegramAuth: { user: { id: Number(telegramId) } },
  };
  const res = createResponse();
  await handler(req, res);
  return res;
}

function queryResult(value) {
  return {
    session() { return this; },
    select() { return this; },
    lean() { return Promise.resolve(value); },
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
  };
}

async function withUserMocks(user, callback, options = {}) {
  const originalFindOne = User.findOne;
  const originalFind = User.find;
  const originalAggregate = User.aggregate;
  const originalFindOneAndUpdate = User.findOneAndUpdate;
  const originalSave = User.prototype.save;
  const originalStartSession = mongoose.startSession;
  const originalAxiosGet = axios.get;

  User.findOne = () => queryResult(user);
  User.find = () => ({
    select: async () => options.teamMembers || [user],
  });
  User.aggregate = async () => options.teamLeaderboard || [];
  User.findOneAndUpdate = async (filter, update) => {
    const code = filter.usedPromoCodes?.$ne;
    if (!code || user.usedPromoCodes.includes(code)) return null;
    user.usedPromoCodes.push(code);
    return user;
  };
  User.prototype.save = async function save() { return this; };
  mongoose.startSession = async () => ({
    async withTransaction(operation) { return operation(); },
    async endSession() {},
  });
  axios.get = async () => ({ data: { result: { status: 'member' } } });

  try {
    return await callback();
  } finally {
    User.findOne = originalFindOne;
    User.find = originalFind;
    User.aggregate = originalAggregate;
    User.findOneAndUpdate = originalFindOneAndUpdate;
    User.prototype.save = originalSave;
    mongoose.startSession = originalStartSession;
    axios.get = originalAxiosGet;
  }
}

function eventsOfType(event) {
  return analyticsEvents.filter((item) => item.event === event);
}

test('successful first tap records once; rejected and repeated taps do not', async () => {
  resetAnalytics();
  const user = createUser('81001');

  await withUserMocks(user, async () => {
    const first = await invokeRoute('/tap', { telegramId: user.telegramId }, user.telegramId);
    const second = await invokeRoute('/tap', { telegramId: user.telegramId }, user.telegramId);
    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 200);
  });

  assert.equal(eventsOfType('first_tap').length, 1);
  assert.equal(eventsOfType('first_tap')[0].deduplicationKey, 'first_tap');

  resetAnalytics();
  const rejectedUser = createUser('81002', { energy: 0 });
  await withUserMocks(rejectedUser, async () => {
    const response = await invokeRoute('/tap', { telegramId: rejectedUser.telegramId }, rejectedUser.telegramId);
    assert.equal(response.statusCode, 400);
  });
  assert.equal(eventsOfType('first_tap').length, 0);
});

test('daily and weekly mission claims record first_task with the mission id', async () => {
  for (const scenario of [
    { telegramId: '81101', missionType: 'daily', missionId: 'daily_taps', stats: { dailyTaps: 100 } },
    { telegramId: '81102', missionType: 'weekly', missionId: 'weekly_taps', stats: { weeklyTaps: 1000 } },
  ]) {
    resetAnalytics();
    const user = createUser(scenario.telegramId, {
      missionStats: {
        dailyKey: getUtcDayKey(),
        weeklyKey: getWeekKey(),
        dailyTaps: scenario.stats.dailyTaps || 0,
        weeklyTaps: scenario.stats.weeklyTaps || 0,
      },
    });
    await withUserMocks(user, async () => {
      const response = await invokeRoute('/claim-mission', {
        telegramId: user.telegramId,
        missionType: scenario.missionType,
        missionId: scenario.missionId,
      }, user.telegramId);
      assert.equal(response.statusCode, 200);
    });
    assert.equal(eventsOfType('first_task').length, 1);
    assert.equal(eventsOfType('first_task')[0].metadata.taskId, scenario.missionId);
  }
});

test('channel and invite task claims record first_task', async () => {
  const originalBotToken = process.env.BOT_TOKEN;
  const originalChannelId = process.env.CHANNEL_ID;
  process.env.BOT_TOKEN = 'analytics-test-token';
  process.env.CHANNEL_ID = 'analytics-test-channel';
  try {
    for (const scenario of [
      { telegramId: '81201', task: 'channel', overrides: {} },
      { telegramId: '81202', task: 'inviteFriend', overrides: { referralsCount: 1 } },
    ]) {
      resetAnalytics();
      const user = createUser(scenario.telegramId, scenario.overrides);
      await withUserMocks(user, async () => {
        const response = await invokeRoute('/claim-task', {
          telegramId: user.telegramId,
          task: scenario.task,
        }, user.telegramId);
        assert.equal(response.statusCode, 200);
      });
      assert.equal(eventsOfType('first_task').length, 1);
      assert.equal(eventsOfType('first_task')[0].metadata.taskId, scenario.task);
    }
  } finally {
    if (originalBotToken === undefined) delete process.env.BOT_TOKEN;
    else process.env.BOT_TOKEN = originalBotToken;
    if (originalChannelId === undefined) delete process.env.CHANNEL_ID;
    else process.env.CHANNEL_ID = originalChannelId;
  }
});

test('successful team mission records first_task after saving the claim', async () => {
  resetAnalytics();
  const user = createUser('81301', { teamName: 'Analytics Team' });
  const members = [
    user,
    createUser('81302', { teamName: 'Analytics Team' }),
    createUser('81303', { teamName: 'Analytics Team' }),
  ];

  await withUserMocks(user, async () => {
    const response = await invokeRoute('/claim-team-mission', {
      telegramId: user.telegramId,
      missionId: 'team_members_3',
    }, user.telegramId);
    assert.equal(response.statusCode, 200);
  }, { teamMembers: members });

  assert.equal(eventsOfType('first_task').length, 1);
  assert.equal(eventsOfType('first_task')[0].metadata.taskId, 'team_members_3');
});

test('promo_used is recorded only for one successful promo activation', async () => {
  resetAnalytics();
  const user = createUser('81401', { balance: 0, usedPromoCodes: [] });

  await withUserMocks(user, async () => {
    const invalid = await invokeRoute('/apply-promo', {
      telegramId: user.telegramId,
      code: 'INVALID',
    }, user.telegramId);
    const successful = await invokeRoute('/apply-promo', {
      telegramId: user.telegramId,
      code: 'GG7000',
    }, user.telegramId);
    const repeated = await invokeRoute('/apply-promo', {
      telegramId: user.telegramId,
      code: 'GG7000',
    }, user.telegramId);
    assert.equal(invalid.statusCode, 400);
    assert.equal(successful.statusCode, 200);
    assert.equal(repeated.statusCode, 400);
  });

  assert.equal(eventsOfType('promo_used').length, 1);
  assert.deepEqual(eventsOfType('promo_used')[0].metadata, { promoCode: 'GG7000' });
});

test('successful withdrawal records its actual ONIX and EUR amounts', async () => {
  resetAnalytics();
  const user = createUser('81501', { balance: 1000000, withdrawalRequests: [] });

  let response;
  await withUserMocks(user, async () => {
    response = await invokeRoute('/request-withdrawal', {
      telegramId: user.telegramId,
      amount: 750000,
      withdrawalCheck: 'ONIX',
    }, user.telegramId);
    assert.equal(response.statusCode, 200);
  });

  const event = eventsOfType('withdrawal')[0];
  assert.ok(event);
  assert.equal(event.metadata.amountOnix, response.body.withdrawal.amount);
  assert.equal(event.metadata.eurAmount, response.body.withdrawal.eurAmount);
  assert.equal(event.deduplicationKey, String(response.body.withdrawal.createdAt));
});

test('analytics rejection and timeout do not change successful tap responses', async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    for (const [index, mode] of ['reject', 'timeout'].entries()) {
      resetAnalytics();
      analyticsFailureMode = mode;
      const user = createUser(String(81601 + index));
      await withUserMocks(user, async () => {
        const response = await invokeRoute('/tap', {
          telegramId: user.telegramId,
        }, user.telegramId);
        assert.equal(response.statusCode, 200);
        assert.equal(response.body.points, 1);
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  } finally {
    analyticsFailureMode = '';
    console.warn = originalWarn;
  }
});
