const assert = require('node:assert/strict');
const test = require('node:test');

process.env.NODE_ENV = 'test';
process.env.CRON_SECRET = 'isolated-cron-secret';
process.env.ADMIN_SECRET = 'isolated-admin-secret';

const User = require('../models/User');
const WeeklyScore = require('../models/WeeklyScore');
const router = require('../routes/coinRoutes');

const {
  WeeklyPrize,
  addEarnings,
  getCompletedWeeklyScores,
  getCurrentWeeklyEarned,
  getPreviousWeekKey,
  getTeamContestPayload,
  getTeamLeaderboardForWeek,
  getWeekKey,
  materializeWeeklyScores,
  normalizeUserFields,
  rolloverUserForEarning,
  snapshotCompletedUserWeek,
} = router.__weeklyScoreTestUtils;

function createUser(overrides = {}) {
  return {
    telegramId: '1001',
    username: 'tester',
    teamName: 'ONIX Testers',
    weeklyEarnedWeek: '2026-W39',
    weeklyEarned: 12500,
    totalEarned: 50000,
    totalTaps: 321,
    balance: 50000,
    securityLogs: [],
    suspiciousReasons: [],
    ...overrides,
  };
}

function getRouteHandler(path, method) {
  const layer = router.stack.find(
    (item) => item.route?.path === path && item.route?.methods?.[method]
  );
  assert.ok(layer, `${method.toUpperCase()} ${path} route is registered`);
  return layer.route.stack.at(-1).handle;
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
}

function createQuery(value) {
  return {
    sort() {
      return this;
    },
    limit() {
      return this;
    },
    select() {
      return this;
    },
    lean() {
      return Promise.resolve(value);
    },
    then(resolve, reject) {
      return Promise.resolve(value).then(resolve, reject);
    },
  };
}

test('WeeklyScore declares the required indexes', () => {
  const indexes = WeeklyScore.schema.indexes();

  assert.ok(
    indexes.some(
      ([fields, options]) =>
        fields.week === 1 &&
        fields.telegramId === 1 &&
        options.unique === true
    )
  );
  assert.ok(
    indexes.some(
      ([fields]) =>
        fields.week === 1 &&
        fields.weeklyEarned === -1 &&
        fields.telegramId === 1
    )
  );
  assert.ok(
    indexes.some(([fields]) => fields.week === 1 && fields.teamName === 1)
  );
});

test('snapshot is immutable, repeatable and safe under concurrent calls', async () => {
  const originalUpdateOne = WeeklyScore.updateOne;
  const stored = new Map();

  WeeklyScore.updateOne = async (filter, update) => {
    await new Promise((resolve) => setImmediate(resolve));
    const key = `${filter.week}:${filter.telegramId}`;
    if (!stored.has(key)) stored.set(key, { ...update.$setOnInsert });
    return { acknowledged: true };
  };

  try {
    const user = createUser();
    await Promise.all([
      snapshotCompletedUserWeek(user),
      snapshotCompletedUserWeek(user),
    ]);

    assert.equal(stored.size, 1);
    assert.equal(stored.get('2026-W39:1001').weeklyEarned, 12500);
    assert.equal(stored.get('2026-W39:1001').teamName, 'ONIX Testers');

    user.weeklyEarned = 99999;
    await snapshotCompletedUserWeek(user);
    assert.equal(stored.get('2026-W39:1001').weeklyEarned, 12500);
  } finally {
    WeeklyScore.updateOne = originalUpdateOne;
  }
});

test('rollover snapshots before reset and preserves User on snapshot error', async () => {
  const originalUpdateOne = WeeklyScore.updateOne;
  const observed = [];

  try {
    const user = createUser();
    WeeklyScore.updateOne = async () => {
      observed.push({
        week: user.weeklyEarnedWeek,
        weeklyEarned: user.weeklyEarned,
      });
      return { acknowledged: true };
    };

    await rolloverUserForEarning(user, '2026-W40');
    assert.deepEqual(observed, [
      { week: '2026-W39', weeklyEarned: 12500 },
    ]);
    assert.equal(user.weeklyEarnedWeek, '2026-W40');
    assert.equal(user.weeklyEarned, 0);

    const failingUser = createUser();
    WeeklyScore.updateOne = async () => {
      throw new Error('isolated snapshot failure');
    };

    await assert.rejects(
      rolloverUserForEarning(failingUser, '2026-W40'),
      /isolated snapshot failure/
    );
    assert.equal(failingUser.weeklyEarnedWeek, '2026-W39');
    assert.equal(failingUser.weeklyEarned, 12500);
  } finally {
    WeeklyScore.updateOne = originalUpdateOne;
  }
});

test('new-week, same-week and missing-week earnings follow safe rollover rules', async () => {
  const originalUpdateOne = WeeklyScore.updateOne;
  const snapshots = [];
  const currentWeek = getWeekKey();

  WeeklyScore.updateOne = async (_filter, update) => {
    snapshots.push({ ...update.$setOnInsert });
    return { acknowledged: true };
  };

  try {
    const staleUser = createUser({ weeklyEarnedWeek: '2020-W01' });
    await addEarnings(staleUser, 250);
    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0].weeklyEarned, 12500);
    assert.equal(staleUser.weeklyEarnedWeek, currentWeek);
    assert.equal(staleUser.weeklyEarned, 250);
    assert.equal(staleUser.totalEarned, 50250);

    const sameWeekUser = createUser({
      weeklyEarnedWeek: currentWeek,
      weeklyEarned: 300,
    });
    await addEarnings(sameWeekUser, 25);
    assert.equal(snapshots.length, 1);
    assert.equal(sameWeekUser.weeklyEarned, 325);

    const missingWeekUser = createUser({
      weeklyEarnedWeek: null,
      weeklyEarned: 40,
    });
    await addEarnings(missingWeekUser, 10);
    assert.equal(snapshots.length, 1);
    assert.equal(missingWeekUser.weeklyEarnedWeek, currentWeek);
    assert.equal(missingWeekUser.weeklyEarned, 50);
  } finally {
    WeeklyScore.updateOne = originalUpdateOne;
  }
});

test('materialization uses unordered idempotent setOnInsert upserts', async () => {
  const originalFind = User.find;
  const originalBulkWrite = WeeklyScore.bulkWrite;
  let receivedOperations = null;
  let receivedOptions = null;

  User.find = (filter) => {
    assert.deepEqual(filter, {
      weeklyEarnedWeek: '2026-W39',
      weeklyEarned: { $gt: 0 },
    });
    return {
      select() {
        return this;
      },
      lean() {
        return Promise.resolve([
          createUser(),
          createUser({ telegramId: '1002', weeklyEarned: 500 }),
        ]);
      },
    };
  };
  WeeklyScore.bulkWrite = async (operations, options) => {
    receivedOperations = operations;
    receivedOptions = options;
    return { acknowledged: true };
  };

  try {
    await materializeWeeklyScores('2026-W39');
    assert.equal(receivedOperations.length, 2);
    assert.deepEqual(receivedOptions, { ordered: false });
    assert.equal(
      receivedOperations[0].updateOne.update.$setOnInsert.weeklyEarned,
      12500
    );
    assert.equal(receivedOperations[0].updateOne.upsert, true);
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        receivedOperations[0].updateOne.update,
        '$inc'
      ),
      false
    );
  } finally {
    User.find = originalFind;
    WeeklyScore.bulkWrite = originalBulkWrite;
  }
});

test('read normalization preserves stale weekly fields and current progress is zero', () => {
  const user = createUser();
  const original = {
    week: user.weeklyEarnedWeek,
    score: user.weeklyEarned,
  };

  normalizeUserFields(user);

  assert.equal(user.weeklyEarnedWeek, original.week);
  assert.equal(user.weeklyEarned, original.score);
  assert.equal(getCurrentWeeklyEarned(user), 0);
});

test('GET User preserves stale weekly fields while saving other normalization', async () => {
  const originalFindOne = User.findOne;
  const user = createUser({
    lastSeenAt: Date.now(),
    save: async () => undefined,
  });
  user.toObject = () => ({ ...user });
  User.findOne = async () => user;

  try {
    const handler = getRouteHandler('/:telegramId', 'get');
    const response = createResponse();
    await handler(
      {
        params: { telegramId: user.telegramId },
        telegramUserId: user.telegramId,
      },
      response
    );

    assert.equal(response.statusCode, 200);
    assert.equal(user.weeklyEarnedWeek, '2026-W39');
    assert.equal(user.weeklyEarned, 12500);
  } finally {
    User.findOne = originalFindOne;
  }
});

test('missions GET preserves stale score and excludes it from current progress', async () => {
  const originalFindOne = User.findOne;
  const user = createUser({
    save: async () => undefined,
  });
  User.findOne = async () => user;

  try {
    const handler = getRouteHandler('/missions/:telegramId', 'get');
    const response = createResponse();
    await handler(
      {
        params: { telegramId: user.telegramId },
        telegramUserId: user.telegramId,
      },
      response
    );

    assert.equal(response.statusCode, 200);
    assert.equal(user.weeklyEarnedWeek, '2026-W39');
    assert.equal(user.weeklyEarned, 12500);
    const weeklyMission = response.body.weekly.find(
      (mission) => mission.id === 'weekly_earn'
    );
    assert.equal(weeklyMission.progress, 0);
  } finally {
    User.findOne = originalFindOne;
  }
});

test('weekly leaderboard is read-only and excludes stale users', async () => {
  const originalFind = User.find;
  const originalUpdateMany = User.updateMany;
  let receivedFilter = null;

  User.updateMany = async () => {
    throw new Error('weekly leaderboard must not write');
  };
  User.find = (filter) => {
    receivedFilter = filter;
    return {
      sort() {
        return this;
      },
      limit() {
        return this;
      },
      select() {
        return Promise.resolve([]);
      },
    };
  };

  try {
    const handler = getRouteHandler('/leaderboard/weekly', 'get');
    const response = createResponse();
    await handler({ query: {}, get: () => '' }, response);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(receivedFilter, {
      weeklyEarnedWeek: getWeekKey(),
      weeklyEarned: { $gt: 0 },
    });
    assert.deepEqual(response.body.leaderboard, []);
  } finally {
    User.find = originalFind;
    User.updateMany = originalUpdateMany;
  }
});

test('automatic award materializes first, selects WeeklyScore and stores selection score', async () => {
  const originalUserFind = User.find;
  const originalScoreFind = WeeklyScore.find;
  const originalBulkWrite = WeeklyScore.bulkWrite;
  const originalUpdateOne = WeeklyScore.updateOne;
  const originalPrizeFindOne = WeeklyPrize.findOne;
  const originalPrizeCreate = WeeklyPrize.create;
  const targetWeek = '2026-W39';
  const order = [];
  const snapshots = [];
  let marker = null;

  const payoutUser = createUser({
    weeklyEarnedWeek: targetWeek,
    weeklyEarned: 4321,
    totalEarned: 4321,
    balance: 4321,
    seasonBadges: [],
    claimedRankBonuses: [],
    transactions: [],
    save: async () => undefined,
  });

  User.find = (filter) => {
    if (filter.weeklyEarnedWeek === targetWeek) {
      return createQuery([payoutUser]);
    }
    if (filter.telegramId?.$in) {
      return createQuery([payoutUser]);
    }
    throw new Error(`Unexpected User winner query: ${JSON.stringify(filter)}`);
  };
  WeeklyScore.bulkWrite = async (operations) => {
    order.push('materialize');
    for (const operation of operations) {
      const value = operation.updateOne.update.$setOnInsert;
      if (!snapshots.some((item) => item.telegramId === value.telegramId)) {
        snapshots.push({ ...value });
      }
    }
    return { acknowledged: true };
  };
  WeeklyScore.find = (filter) => {
    order.push('select');
    assert.deepEqual(filter, {
      week: targetWeek,
      weeklyEarned: { $gt: 0 },
    });
    return createQuery(snapshots);
  };
  WeeklyScore.updateOne = async () => ({ acknowledged: true });
  WeeklyPrize.findOne = async () => null;
  WeeklyPrize.create = async (value) => {
    marker = value;
    return value;
  };

  try {
    const handler = getRouteHandler('/cron-award-weekly-prizes', 'get');
    const response = createResponse();
    await handler(
      {
        query: { week: targetWeek },
        get: (name) =>
          name.toLowerCase() === 'x-cron-secret'
            ? process.env.CRON_SECRET
            : '',
      },
      response
    );

    assert.equal(response.statusCode, 200);
    assert.deepEqual(order, ['materialize', 'select']);
    assert.equal(marker.week, targetWeek);
    assert.equal(marker.winners[0].weeklyEarned, 4321);
    assert.equal(response.body.winners[0].weeklyEarned, 4321);
    assert.notEqual(payoutUser.weeklyEarned, 4321);
  } finally {
    User.find = originalUserFind;
    WeeklyScore.find = originalScoreFind;
    WeeklyScore.bulkWrite = originalBulkWrite;
    WeeklyScore.updateOne = originalUpdateOne;
    WeeklyPrize.findOne = originalPrizeFindOne;
    WeeklyPrize.create = originalPrizeCreate;
  }
});

test('automatic award empty winners is a no-op without WeeklyPrize marker', async () => {
  const originalUserFind = User.find;
  const originalScoreFind = WeeklyScore.find;
  const originalPrizeFindOne = WeeklyPrize.findOne;
  const originalPrizeCreate = WeeklyPrize.create;
  const originalWarn = console.warn;
  let markerCreated = false;
  let warning = '';

  User.find = () => createQuery([]);
  WeeklyScore.find = () => createQuery([]);
  WeeklyPrize.findOne = async () => null;
  WeeklyPrize.create = async () => {
    markerCreated = true;
  };
  console.warn = (...args) => {
    warning = args.map(String).join(' ');
  };

  try {
    const handler = getRouteHandler('/cron-award-weekly-prizes', 'get');
    const response = createResponse();
    await handler(
      {
        query: { week: '2026-W38' },
        get: () => process.env.CRON_SECRET,
      },
      response
    );

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body.winners, []);
    assert.equal(markerCreated, false);
    assert.match(warning, /No eligible winners/);
    assert.equal(warning.includes('1001'), false);
  } finally {
    User.find = originalUserFind;
    WeeklyScore.find = originalScoreFind;
    WeeklyPrize.findOne = originalPrizeFindOne;
    WeeklyPrize.create = originalPrizeCreate;
    console.warn = originalWarn;
  }
});

test('admin preview defaults to previous week and ranks WeeklyScore snapshots', async () => {
  const originalUserFind = User.find;
  const originalScoreFind = WeeklyScore.find;
  const originalPrizeFindOne = WeeklyPrize.findOne;
  const targetWeek = getPreviousWeekKey();
  const snapshot = {
    week: targetWeek,
    telegramId: '1001',
    username: 'snapshot-name',
    weeklyEarned: 7654,
  };
  const user = createUser({
    weeklyEarnedWeek: getWeekKey(),
    weeklyEarned: 999999,
  });

  User.find = (filter) => {
    if (filter.weeklyEarnedWeek === targetWeek) return createQuery([]);
    if (filter.telegramId?.$in) return createQuery([user]);
    throw new Error(`Unexpected preview User query: ${JSON.stringify(filter)}`);
  };
  WeeklyScore.find = (filter) => {
    assert.equal(filter.week, targetWeek);
    return createQuery([snapshot]);
  };
  WeeklyPrize.findOne = async () => null;

  try {
    const handler = getRouteHandler('/admin-weekly-prize-preview', 'get');
    const response = createResponse();
    await handler(
      {
        query: { secret: process.env.ADMIN_SECRET },
        get: () => '',
      },
      response
    );

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.week, targetWeek);
    assert.equal(response.body.preview[0].weeklyEarned, 7654);
    assert.equal(response.body.preview[0].telegramId, '1001');
  } finally {
    User.find = originalUserFind;
    WeeklyScore.find = originalScoreFind;
    WeeklyPrize.findOne = originalPrizeFindOne;
  }
});

test('manual award rejects the current incomplete week before payout', async () => {
  const originalPrizeFindOne = WeeklyPrize.findOne;
  let markerChecked = false;
  WeeklyPrize.findOne = async () => {
    markerChecked = true;
    return null;
  };

  try {
    const handler = getRouteHandler('/admin-award-weekly-prizes', 'post');
    const response = createResponse();
    await handler(
      {
        body: {
          secret: process.env.ADMIN_SECRET,
          confirm: 'AWARD_WEEKLY_PRIZES',
          week: getWeekKey(),
        },
        get: () => '',
      },
      response
    );

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.week, getWeekKey());
    assert.equal(markerChecked, false);
  } finally {
    WeeklyPrize.findOne = originalPrizeFindOne;
  }
});

test('manual award uses its explicit WeeklyScore week and immutable selection score', async () => {
  const originalUserFind = User.find;
  const originalScoreFind = WeeklyScore.find;
  const originalPrizeFindOne = WeeklyPrize.findOne;
  const originalPrizeCreate = WeeklyPrize.create;
  const targetWeek = getPreviousWeekKey();
  const snapshot = {
    week: targetWeek,
    telegramId: '1001',
    username: 'snapshot-name',
    weeklyEarned: 8000,
  };
  const payoutUser = createUser({
    weeklyEarnedWeek: getWeekKey(),
    weeklyEarned: 500,
    totalEarned: 500,
    balance: 500,
    seasonBadges: [],
    claimedRankBonuses: [],
    transactions: [],
    save: async () => undefined,
  });
  let marker = null;

  User.find = (filter) => {
    if (filter.weeklyEarnedWeek === targetWeek) return createQuery([]);
    if (filter.telegramId?.$in) return createQuery([payoutUser]);
    throw new Error(`Unexpected manual User query: ${JSON.stringify(filter)}`);
  };
  WeeklyScore.find = (filter) => {
    assert.equal(filter.week, targetWeek);
    return createQuery([snapshot]);
  };
  WeeklyPrize.findOne = async () => null;
  WeeklyPrize.create = async (value) => {
    marker = value;
    return value;
  };

  try {
    const handler = getRouteHandler('/admin-award-weekly-prizes', 'post');
    const response = createResponse();
    await handler(
      {
        body: {
          secret: process.env.ADMIN_SECRET,
          confirm: 'AWARD_WEEKLY_PRIZES',
          week: targetWeek,
        },
        get: () => '',
      },
      response
    );

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.week, targetWeek);
    assert.equal(marker.week, targetWeek);
    assert.equal(marker.winners[0].weeklyEarned, 8000);
    assert.equal(response.body.winners[0].weeklyEarned, 8000);
    assert.notEqual(payoutUser.weeklyEarned, 8000);
  } finally {
    User.find = originalUserFind;
    WeeklyScore.find = originalScoreFind;
    WeeklyPrize.findOne = originalPrizeFindOne;
    WeeklyPrize.create = originalPrizeCreate;
  }
});

test('completed team contest uses WeeklyScore team membership and current uses User', async () => {
  const originalUserFind = User.find;
  const originalUserAggregate = User.aggregate;
  const originalScoreBulkWrite = WeeklyScore.bulkWrite;
  const originalScoreAggregate = WeeklyScore.aggregate;
  const originalScoreFindOne = WeeklyScore.findOne;
  const currentWeek = getWeekKey();
  const previousWeek = getPreviousWeekKey();
  const aggregateSources = [];

  User.find = (filter) => {
    assert.equal(filter.weeklyEarnedWeek, previousWeek);
    return createQuery([
      createUser({
        weeklyEarnedWeek: previousWeek,
        weeklyEarned: 5000,
        teamName: 'Historic Team',
      }),
    ]);
  };
  WeeklyScore.bulkWrite = async () => ({ acknowledged: true });
  User.aggregate = async (pipeline) => {
    aggregateSources.push({ source: 'User', pipeline });
    return [
      {
        _id: 'Current Team',
        weeklyEarned: 100,
        members: 1,
        totalTaps: 5,
      },
    ];
  };
  WeeklyScore.aggregate = async (pipeline) => {
    aggregateSources.push({ source: 'WeeklyScore', pipeline });
    return [
      {
        _id: 'Historic Team',
        weeklyEarned: 5000,
        members: 1,
        totalTaps: 321,
      },
    ];
  };
  WeeklyScore.findOne = (filter) => {
    assert.equal(filter.week, previousWeek);
    assert.equal(filter.telegramId, '1001');
    return createQuery({ teamName: 'Historic Team' });
  };

  try {
    const current = await getTeamLeaderboardForWeek(currentWeek);
    const completed = await getTeamLeaderboardForWeek(previousWeek);
    const contest = await getTeamContestPayload(
      createUser({
        weeklyEarnedWeek: currentWeek,
        weeklyEarned: 0,
        teamName: 'Current Team',
        teamPrizeClaims: [],
        teamJoinedAt: Date.now(),
      })
    );

    assert.equal(current[0].teamName, 'Current Team');
    assert.equal(completed[0].teamName, 'Historic Team');
    assert.equal(contest.completedTeamPlace, 1);
    assert.equal(contest.completedTeamWeeklyEarned, 5000);
    assert.equal(contest.canClaim, true);
    assert.equal(contest.joinedAfterCompletedContest, false);
    const currentAggregate = aggregateSources.find(
      (entry) => entry.source === 'User'
    );
    const completedAggregate = aggregateSources.find(
      (entry) => entry.source === 'WeeklyScore'
    );
    assert.equal(
      currentAggregate.pipeline[0].$match.weeklyEarnedWeek,
      currentWeek
    );
    assert.equal(completedAggregate.pipeline[0].$match.week, previousWeek);
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        completedAggregate.pipeline[0].$match,
        'weeklyEarnedWeek'
      ),
      false
    );
  } finally {
    User.find = originalUserFind;
    User.aggregate = originalUserAggregate;
    WeeklyScore.bulkWrite = originalScoreBulkWrite;
    WeeklyScore.aggregate = originalScoreAggregate;
    WeeklyScore.findOne = originalScoreFindOne;
  }
});

async function runTeamPrizeClaimScenario({
  currentTeamName,
  historicalTeamName,
  existingClaim = false,
}) {
  const originalUserFindOne = User.findOne;
  const originalUserFind = User.find;
  const originalUserAggregate = User.aggregate;
  const originalScoreFindOne = WeeklyScore.findOne;
  const originalScoreAggregate = WeeklyScore.aggregate;
  const previousWeek = getPreviousWeekKey();
  const claimKey = `${previousWeek}_${historicalTeamName || ''}`;
  let saveCount = 0;
  const user = createUser({
    appLanguage: 'de',
    teamName: currentTeamName,
    teamJoinedAt: currentTeamName ? Date.now() : 0,
    teamPrizeClaims: existingClaim ? [claimKey] : [],
    weeklyEarnedWeek: getWeekKey(),
    weeklyEarned: 0,
    totalEarned: 0,
    balance: 0,
    totalTaps: 0,
    transactions: [],
    notifications: [],
    completedTasks: [],
    completedAchievements: [],
    claimedRankBonuses: [],
    claimedDailyMissions: [],
    claimedWeeklyMissions: [],
    usedPromoCodes: [],
    teamMissionClaims: [],
    securityLogs: [],
    suspiciousReasons: [],
    save: async () => {
      saveCount += 1;
    },
    toObject() {
      return { ...this };
    },
  });

  User.findOne = async (filter) => {
    assert.equal(filter.telegramId, '1001');
    return user;
  };
  User.find = () => createQuery([]);
  User.aggregate = async () =>
    currentTeamName
      ? [
          {
            _id: currentTeamName,
            weeklyEarned: 100,
            members: 1,
            totalTaps: 1,
          },
        ]
      : [];
  WeeklyScore.aggregate = async () =>
    historicalTeamName
      ? [
          {
            _id: historicalTeamName,
            weeklyEarned: 5000,
            members: 1,
            totalTaps: 50,
          },
        ]
      : [];
  WeeklyScore.findOne = (filter) => {
    assert.equal(filter.week, previousWeek);
    assert.equal(filter.telegramId, '1001');
    return createQuery(
      historicalTeamName ? { teamName: historicalTeamName } : null
    );
  };

  try {
    const handler = getRouteHandler('/claim-team-prize', 'post');
    const response = createResponse();
    await handler(
      {
        body: { telegramId: '1001' },
        telegramUserId: '1001',
      },
      response
    );

    return { response, user, claimKey, saveCount };
  } finally {
    User.findOne = originalUserFindOne;
    User.find = originalUserFind;
    User.aggregate = originalUserAggregate;
    WeeklyScore.findOne = originalScoreFindOne;
    WeeklyScore.aggregate = originalScoreAggregate;
  }
}

test('team prize claim uses historical team after the player leaves', async () => {
  const { response, user, claimKey, saveCount } = await runTeamPrizeClaimScenario({
    currentTeamName: '',
    historicalTeamName: 'Team A',
  });

  assert.equal(response.statusCode, 200);
  assert.equal(saveCount, 1);
  assert.ok(user.teamPrizeClaims.includes(claimKey));
  assert.equal(claimKey, `${getPreviousWeekKey()}_Team A`);
  const transaction = user.transactions.find(
    (item) => item.type === 'income_team_prize'
  );
  assert.match(transaction.title, /\(Team A\)$/);
  assert.equal(user.teamName, '');
});

test('team prize claim keeps historical attribution after a team change', async () => {
  const { response, user, claimKey } = await runTeamPrizeClaimScenario({
    currentTeamName: 'Team B',
    historicalTeamName: 'Team A',
  });

  assert.equal(response.statusCode, 200);
  assert.ok(user.teamPrizeClaims.includes(claimKey));
  assert.equal(claimKey, `${getPreviousWeekKey()}_Team A`);
  const transaction = user.transactions.find(
    (item) => item.type === 'income_team_prize'
  );
  assert.match(transaction.title, /\(Team A\)$/);
  assert.equal(transaction.title.includes('(Team B)'), false);
  assert.equal(user.teamName, 'Team B');
});

test('current team alone does not create completed team prize eligibility', async () => {
  const { response, user, saveCount } = await runTeamPrizeClaimScenario({
    currentTeamName: 'Team B',
    historicalTeamName: '',
  });

  assert.equal(response.statusCode, 400);
  assert.equal(saveCount, 0);
  assert.deepEqual(user.teamPrizeClaims, []);
  assert.equal(
    user.transactions.some((item) => item.type === 'income_team_prize'),
    false
  );
});

test('historical team claim key preserves duplicate claim protection', async () => {
  const { response, user, claimKey, saveCount } = await runTeamPrizeClaimScenario({
    currentTeamName: 'Team B',
    historicalTeamName: 'Team A',
    existingClaim: true,
  });

  assert.equal(response.statusCode, 400);
  assert.equal(saveCount, 0);
  assert.deepEqual(user.teamPrizeClaims, [claimKey]);
  assert.equal(
    user.transactions.some((item) => item.type === 'income_team_prize'),
    false
  );
});

test('ISO week boundaries remain stable', () => {
  assert.equal(getWeekKey(Date.parse('2020-12-31T23:59:59.999Z')), '2020-W53');
  assert.equal(getWeekKey(Date.parse('2021-01-01T00:00:00.000Z')), '2020-W53');
  assert.equal(getWeekKey(Date.parse('2021-01-04T00:00:00.000Z')), '2021-W01');
  assert.equal(getWeekKey(Date.parse('2026-09-27T23:59:59.999Z')), '2026-W39');
  assert.equal(getWeekKey(Date.parse('2026-09-28T00:00:00.000Z')), '2026-W40');
});
