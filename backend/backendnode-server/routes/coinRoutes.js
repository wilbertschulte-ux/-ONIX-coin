const axios = require('axios');
const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');

const router = express.Router();

const API_RATE_LIMITS = new Map();
const ECONOMY_OVERRIDES = {};
const APP_VERSION = process.env.APP_VERSION || '1.0.0';
const TELEGRAM_INIT_DATA_MAX_AGE_SECONDS = Math.max(
  300,
  Number(process.env.TELEGRAM_INIT_DATA_MAX_AGE_SECONDS || 24 * 60 * 60)
);
const TELEGRAM_INIT_DATA_MAX_FUTURE_SKEW_SECONDS = 60;

// Diagnostic-only Telegram Mini App authentication check.
// This endpoint does not create/update users and does not affect gameplay.
function validateTelegramInitData(initData, botToken) {
  if (!initData || typeof initData !== 'string') {
    return { ok: false, error: 'initData is missing' };
  }

  if (!botToken) {
    return { ok: false, error: 'BOT_TOKEN is not configured on the server' };
  }

  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');

  if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash)) {
    return { ok: false, error: 'Telegram hash is missing or invalid' };
  }

  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  // Telegram Mini Apps validation algorithm:
  // secret_key = HMAC_SHA256(bot_token, key="WebAppData")
  // hash = HMAC_SHA256(data_check_string, key=secret_key)
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const calculatedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  const expected = Buffer.from(calculatedHash, 'hex');
  const actual = Buffer.from(receivedHash, 'hex');

  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    return { ok: false, error: 'Telegram signature verification failed' };
  }

  const authDateRaw = params.get('auth_date');
  const authDate = Number(authDateRaw || 0);
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (!Number.isFinite(authDate) || authDate <= 0) {
    return { ok: false, error: 'Telegram auth_date is missing or invalid' };
  }

  const ageSeconds = nowSeconds - authDate;

  if (ageSeconds < -TELEGRAM_INIT_DATA_MAX_FUTURE_SKEW_SECONDS) {
    return { ok: false, error: 'Telegram initData auth_date is in the future' };
  }

  if (ageSeconds > TELEGRAM_INIT_DATA_MAX_AGE_SECONDS) {
    return {
      ok: false,
      error: 'Telegram initData has expired',
      authDate,
      ageSeconds,
    };
  }

  let user = null;
  const rawUser = params.get('user');
  if (rawUser) {
    try {
      user = JSON.parse(rawUser);
    } catch (error) {
      return { ok: false, error: 'Telegram user payload is not valid JSON' };
    }
  }

  return {
    ok: true,
    user,
    authDate: authDate || null,
    ageSeconds,
    queryId: params.get('query_id') || null,
    startParam: params.get('start_param') || null,
  };
}


function requireTelegramMiniAppUser(req, res, next) {
  const initData = req.get('x-telegram-init-data') || '';
  const result = validateTelegramInitData(initData, process.env.BOT_TOKEN);

  if (!result.ok || !result.user?.id) {
    return res.status(401).json({
      message: 'Telegram authentication required',
      error: result.ok ? 'Telegram user is missing' : result.error,
    });
  }

  req.telegramAuth = result;
  req.telegramUserId = String(result.user.id);
  return next();
}

const SENSITIVE_REWARD_LOCKS = new Map();
const SENSITIVE_REWARD_LOCK_TTL_MS = 15 * 1000;

function sensitiveRewardMutationGuard(req, res, next) {
  const telegramId = String(req.telegramUserId || '');

  if (!telegramId) {
    return res.status(401).json({
      message: 'Telegram authentication required',
    });
  }

  const now = Date.now();
  const existing = SENSITIVE_REWARD_LOCKS.get(telegramId);

  if (existing && now - existing.startedAt < SENSITIVE_REWARD_LOCK_TTL_MS) {
    return res.status(409).json({
      message: 'Reward request already in progress',
      code: 'REWARD_REQUEST_IN_PROGRESS',
    });
  }

  SENSITIVE_REWARD_LOCKS.set(telegramId, {
    startedAt: now,
    path: req.path,
  });

  let released = false;

  const release = () => {
    if (released) return;
    released = true;

    const current = SENSITIVE_REWARD_LOCKS.get(telegramId);
    if (current && current.startedAt === now) {
      SENSITIVE_REWARD_LOCKS.delete(telegramId);
    }
  };

  res.once('finish', release);
  res.once('close', release);

  return next();
}

router.post('/telegram-auth-test', express.json(), (req, res) => {
  const initData =
    req.get('x-telegram-init-data') ||
    req.body?.initData ||
    '';

  const result = validateTelegramInitData(initData, process.env.BOT_TOKEN);

  if (!result.ok) {
    return res.status(401).json({
      ok: false,
      error: result.error,
    });
  }

  return res.json({
    ok: true,
    message: 'Telegram initData signature is valid',
    user: result.user
      ? {
          id: result.user.id ?? null,
          first_name: result.user.first_name ?? '',
          last_name: result.user.last_name ?? '',
          username: result.user.username ?? '',
          language_code: result.user.language_code ?? '',
          photo_url: result.user.photo_url ?? '',
          is_premium: Boolean(result.user.is_premium),
        }
      : null,
    auth_date: result.authDate,
    auth_age_seconds: result.ageSeconds,
    query_id_present: Boolean(result.queryId),
    start_param: result.startParam,
  });
});


function escapeRegExpValue(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeTeamNameValue(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 24);
}

const Team = mongoose.models.Team || mongoose.model(
  'Team',
  new mongoose.Schema(
    {
      name: { type: String, required: true, trim: true, maxlength: 24 },
      normalizedName: { type: String, required: true, unique: true, index: true },
      createdByTelegramId: { type: String, default: '' },
    },
    { timestamps: true, collection: 'teams' }
  )
);


function getTeamsCollection() {
  return mongoose.connection.collection('teams');
}

async function findSavedTeamByName(teamName) {
  const cleanTeamName = normalizeTeamNameValue(teamName);
  if (!cleanTeamName) return null;

  const normalizedName = cleanTeamName.toLowerCase();

  try {
    return await getTeamsCollection().findOne({
      $or: [
        { normalizedName },
        { name: { $regex: new RegExp(`^${escapeRegExpValue(cleanTeamName)}$`, 'i') } },
        { teamName: { $regex: new RegExp(`^${escapeRegExpValue(cleanTeamName)}$`, 'i') } },
      ],
    });
  } catch (error) {
    return Team.findOne({ normalizedName }).lean();
  }
}

async function listSavedTeams(limit = 500) {
  try {
    // Read saved teams directly from the native Mongo collection. Some older
    // deploys wrote teams with slightly different field names, so do not rely
    // only on the Mongoose model here.
    return await getTeamsCollection().find({}).limit(limit).toArray();
  } catch (error) {
    return Team.find({}).limit(limit).lean();
  }
}

function getSavedTeamDisplayName(team) {
  // Support every team shape that may already exist in MongoDB after previous
  // deploys: { name }, { teamName }, or only { normalizedName }.
  const rawName = team?.name || team?.teamName || team?.title || team?.normalizedName || '';
  return normalizeTeamNameValue(rawName);
}

async function upsertSavedTeam(teamName, createdByTelegramId = '') {
  const cleanTeamName = normalizeTeamNameValue(teamName);
  if (!cleanTeamName) return null;

  const normalizedName = cleanTeamName.toLowerCase();
  const creatorId = String(createdByTelegramId || '');
  const now = new Date();

  // Do not use $set and $setOnInsert for the same fields in one upsert.
  // MongoDB can reject that update with a path-conflict error, which made
  // create-team and join-team fail even though reading the team list worked.
  const existingTeam = await findSavedTeamByName(cleanTeamName);

  if (existingTeam) {
    const idFilter = existingTeam._id ? { _id: existingTeam._id } : { normalizedName };
    const update = {
      normalizedName: existingTeam.normalizedName || normalizedName,
      name: getSavedTeamDisplayName(existingTeam) || cleanTeamName,
      teamName: getSavedTeamDisplayName(existingTeam) || cleanTeamName,
      updatedAt: now,
    };

    if (!existingTeam.createdByTelegramId && creatorId) {
      update.createdByTelegramId = creatorId;
    }

    await getTeamsCollection().updateOne(idFilter, { $set: update });
    return { ...existingTeam, ...update };
  }

  const payload = {
    name: cleanTeamName,
    teamName: cleanTeamName,
    normalizedName,
    createdByTelegramId: creatorId,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await getTeamsCollection().insertOne(payload);
    return payload;
  } catch (error) {
    // If another request created the same team at the same time, keep the flow working.
    const duplicate = await findSavedTeamByName(cleanTeamName);
    if (duplicate) return duplicate;
    throw error;
  }
}

function cleanupRateLimits(now = Date.now()) {
  if (API_RATE_LIMITS.size < 5000) return;

  for (const [key, item] of API_RATE_LIMITS.entries()) {
    if (now - item.startedAt > 10 * 60 * 1000) {
      API_RATE_LIMITS.delete(key);
    }
  }
}

function getSignedRateLimitIdentity(req) {
  const initData = req.get('x-telegram-init-data') || '';
  const auth = validateTelegramInitData(initData, process.env.BOT_TOKEN);

  if (auth.ok && auth.user?.id) {
    return `tg:${String(auth.user.id)}`;
  }

  // Never trust telegramId supplied in body/query/params for rate-limit identity:
  // an attacker could rotate fake IDs to bypass throttling.
  return `ip:${String(req.ip || req.socket?.remoteAddress || 'unknown')}`;
}

function getRouteRateLimit(pathname) {
  const path = String(pathname || '');

  // Tap has its own per-second anti-cheat as well. Keep this ceiling high
  // enough for normal play while blocking request floods.
  if (path === '/tap') return { maxRequests: 900, windowMs: 60 * 1000 };

  // Money / irreversible actions.
  if (path === '/request-withdrawal') return { maxRequests: 5, windowMs: 60 * 1000 };
  if (path === '/apply-promo') return { maxRequests: 10, windowMs: 60 * 1000 };
  if (path === '/open-chest') return { maxRequests: 30, windowMs: 60 * 1000 };

  // ONIX Drop should never need rapid start/finish spam.
  if (path === '/onix-drop/start') return { maxRequests: 10, windowMs: 60 * 1000 };
  if (path === '/onix-drop/finish') return { maxRequests: 10, windowMs: 60 * 1000 };

  // Reward / progression mutations.
  if (
    path === '/claim-welcome-bonus' ||
    path === '/claim-mission' ||
    path === '/claim-task' ||
    path === '/claim-team-mission' ||
    path === '/claim-team-prize' ||
    path === '/season-prize-popup'
  ) {
    return { maxRequests: 30, windowMs: 60 * 1000 };
  }

  if (
    path === '/buy-upgrade' ||
    path === '/buy-perk' ||
    path === '/activate-boost' ||
    path === '/refill-energy'
  ) {
    return { maxRequests: 60, windowMs: 60 * 1000 };
  }

  return { maxRequests: 180, windowMs: 60 * 1000 };
}

router.use((req, res, next) => {
  try {
    const isAdminOrCronPath =
      req.path.startsWith('/admin') || req.path.startsWith('/cron');

    const identity = getSignedRateLimitIdentity(req);
    const routeKey = `${identity}:${req.method}:${req.path}`;
    const globalKey = `${identity}:global`;
    const now = Date.now();

    const routeLimit = isAdminOrCronPath
      ? { maxRequests: 120, windowMs: 60 * 1000 }
      : getRouteRateLimit(req.path);
    const globalLimit = isAdminOrCronPath
      ? { maxRequests: 240, windowMs: 60 * 1000 }
      : { maxRequests: 1200, windowMs: 60 * 1000 };

    const updateBucket = (bucketKey, maxRequests, windowMs) => {
      const item = API_RATE_LIMITS.get(bucketKey) || {
        count: 0,
        startedAt: now,
      };

      if (now - item.startedAt >= windowMs) {
        item.count = 0;
        item.startedAt = now;
      }

      item.count += 1;
      API_RATE_LIMITS.set(bucketKey, item);

      return {
        allowed: item.count <= maxRequests,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((windowMs - (now - item.startedAt)) / 1000)
        ),
      };
    };

    cleanupRateLimits(now);

    const globalResult = updateBucket(
      globalKey,
      globalLimit.maxRequests,
      globalLimit.windowMs
    );
    const routeResult = updateBucket(
      routeKey,
      routeLimit.maxRequests,
      routeLimit.windowMs
    );

    if (!globalResult.allowed || !routeResult.allowed) {
      const retryAfterSeconds = Math.max(
        globalResult.allowed ? 0 : globalResult.retryAfterSeconds,
        routeResult.allowed ? 0 : routeResult.retryAfterSeconds
      );

      res.set('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        message: 'Zu viele Anfragen. Versuch es später erneut.',
        retryAfterSeconds,
      });
    }

    return next();
  } catch {
    return next();
  }
});

const User = require('../models/User');

const WeeklyPrizeSchema = new mongoose.Schema({
  week: {
    type: String,
    required: true,
    unique: true,
  },
  awardedAt: {
    type: Number,
    default: Date.now,
  },
  winners: {
    type: [
      {
        place: Number,
        telegramId: String,
        username: String,
        weeklyEarned: Number,
        prize: Number,
      },
    ],
    default: [],
  },
});

const WeeklyPrize =
  mongoose.models.WeeklyPrize || mongoose.model('WeeklyPrize', WeeklyPrizeSchema);


const LEVEL_COINS = 10000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_OFFLINE_SECONDS = 6 * 60 * 60;
const MAX_TAPS_PER_SECOND = 12;
const TAP_SUSTAINED_WINDOW_MS = 5000;
const TAP_SUSTAINED_MAX_IN_WINDOW = 55;
const TAP_RATE_VIOLATION_WINDOW_MS = 60 * 1000;
const TAP_RATE_VIOLATIONS_BEFORE_FLAG = 3;
const MAX_PAID_REFERRALS_PER_DAY = getEconomyConfig().maxPaidReferralsPerDay;
const MAX_PAID_REFERRALS_PER_HOUR = getNumberEnv('MAX_PAID_REFERRALS_PER_HOUR', 5);
const DEFAULT_ENERGY = 500;
const DEFAULT_MAX_ENERGY = 500;
const DEFAULT_TAP_POWER = 1;
const DEFAULT_ENERGY_RECHARGE = 1;
const DEFAULT_MINER_INCOME = 1; // legacy/display field
const DEFAULT_MINER_RATE_PER_MINUTE = 20;
const TEMP_TAP_BOOST_COST = 15000;
const TEMP_MINING_BOOST_COST = 20000;
const TEMP_ENERGY_REFILL_COST = 18000;

const PERKS = {
  offline_pro: {
    id: 'offline_pro',
    title: 'Offline Pro',
    baseCost: 60000,
    maxLevel: 3,
  },
  energy_saver: {
    id: 'energy_saver',
    title: 'Energy Saver',
    baseCost: 75000,
    maxLevel: 3,
  },
  daily_plus: {
    id: 'daily_plus',
    title: 'Daily Plus',
    baseCost: 75000,
    maxLevel: 3,
  },
  miner_plus: {
    id: 'miner_plus',
    title: 'Miner Plus',
    baseCost: 90000,
    maxLevel: 3,
  },
  boost_master: {
    id: 'boost_master',
    title: 'Boost Master',
    baseCost: 75000,
    maxLevel: 3,
  },
  streak_shield: {
    id: 'streak_shield',
    title: 'Streak Shield',
    baseCost: 100000,
    maxLevel: 1,
  },
  lucky_miner: {
    id: 'lucky_miner',
    title: 'Lucky Miner',
    baseCost: 100000,
    maxLevel: 3,
  },
  referral_pro: {
    id: 'referral_pro',
    title: 'Referral Pro',
    baseCost: 100000,
    maxLevel: 3,
  },
  energy_max_pro: {
    id: 'energy_max_pro',
    title: 'Energy Max Pro',
    baseCost: 75000,
    maxLevel: 3,
  },
  engineer: {
    id: 'engineer',
    title: 'Engineer',
    baseCost: 90000,
    maxLevel: 3,
  },
};



function getTeamCode(teamName) {
  return Buffer.from(String(teamName || '').trim(), 'utf8')
    .toString('base64url')
    .slice(0, 64);
}

function decodeTeamCode(code) {
  try {
    return Buffer.from(String(code || ''), 'base64url').toString('utf8').trim();
  } catch {
    return '';
  }
}

function getTeamMissionDefinitions() {
  return [
    {
      id: 'team_earn_250k',
      title: 'Team-Einkommen',
      description: 'Das Team muss 250.000 ONIX pro Woche verdienen',
      goal: 250000,
      reward: 25000,
    },
    {
      id: 'team_members_3',
      title: 'Team zusammenstellen',
      description: 'Das Team muss 3 Mitglieder haben',
      goal: 3,
      reward: 15000,
    },
    {
      id: 'team_taps_1000',
      title: 'Team-Taps',
      description: 'Das Team muss insgesamt 1.000 Taps machen',
      goal: 1000,
      reward: 20000,
    },
  ];
}

function getTeamPrizeByPlace(place) {
  const cleanPlace = Number(place || 0);

  if (cleanPlace === 1) return getNumberEnv('TEAM_CONTEST_PRIZE_TOP_1', 150000);
  if (cleanPlace === 2) return getNumberEnv('TEAM_CONTEST_PRIZE_TOP_2', 100000);
  if (cleanPlace === 3) return getNumberEnv('TEAM_CONTEST_PRIZE_TOP_3', 60000);
  if (cleanPlace >= 4) return getNumberEnv('TEAM_CONTEST_PRIZE_PARTICIPATION', 10000);

  return 0;
}

async function getTeamLeaderboardForWeek(week, limit = 0) {
  const pipeline = [
    {
      $match: {
        weeklyEarnedWeek: week,
        weeklyEarned: { $gt: 0 },
        teamName: { $nin: ['', null] },
      },
    },
    {
      $group: {
        _id: '$teamName',
        weeklyEarned: { $sum: '$weeklyEarned' },
        members: { $sum: 1 },
        totalTaps: { $sum: '$totalTaps' },
      },
    },
    { $sort: { weeklyEarned: -1, members: -1, _id: 1 } },
  ];

  if (limit > 0) pipeline.push({ $limit: limit });

  const teams = await User.aggregate(pipeline);

  return teams.map((team, index) => ({
    place: index + 1,
    teamName: team._id,
    weeklyEarned: roundOnix(team.weeklyEarned || 0),
    members: Number(team.members || 0),
    totalTaps: Number(team.totalTaps || 0),
    prize: getTeamPrizeByPlace(index + 1),
  }));
}

function getTeamContestRewardTitle(place) {
  const cleanPlace = Number(place || 0);

  if (cleanPlace === 1) return '1. Platz';
  if (cleanPlace === 2) return '2. Platz';
  if (cleanPlace === 3) return '3. Platz';
  if (cleanPlace >= 4) return 'Teilnahmepreis';

  return 'kein Platz';
}

async function getTeamContestPayload(user) {
  normalizeUserFields(user);

  const now = Date.now();
  const currentWeek = getWeekKey(now);
  const previousWeek = getPreviousWeekKey(now);
  const currentWeekEndsAt = getWeekEndTimestamp(now);
  const previousWeekEndedAt = getWeekEndTimestamp(now - 7 * 24 * 60 * 60 * 1000);
  const cleanTeamName = String(user.teamName || '').trim();

  const [activeLeaderboard, completedLeaderboard] = await Promise.all([
    getTeamLeaderboardForWeek(currentWeek, 0),
    getTeamLeaderboardForWeek(previousWeek, 0),
  ]);

  const activeTeam = activeLeaderboard.find((team) => team.teamName === cleanTeamName) || null;
  const completedTeam = completedLeaderboard.find((team) => team.teamName === cleanTeamName) || null;
  const claimKey = `${previousWeek}_${cleanTeamName}`;
  const joinedAfterCompletedContest =
    Boolean(user.teamJoinedAt) && Number(user.teamJoinedAt || 0) > previousWeekEndedAt;
  const completedPlace = completedTeam?.place || null;
  const completedPrize =
    completedPlace && !joinedAfterCompletedContest ? getTeamPrizeByPlace(completedPlace) : 0;
  const hasClaimed = cleanTeamName ? user.teamPrizeClaims.includes(claimKey) : false;

  return {
    activeWeek: currentWeek,
    completedWeek: previousWeek,
    currentWeekEndsAt,
    secondsUntilCurrentContestEnds: Math.max(0, Math.ceil((currentWeekEndsAt - now) / 1000)),
    leaderboardTop3: activeLeaderboard.slice(0, 3),
    activeTeamPlace: activeTeam?.place || null,
    activeTeamWeeklyEarned: roundOnix(activeTeam?.weeklyEarned || 0),
    completedTeamPlace: completedPlace,
    completedTeamWeeklyEarned: roundOnix(completedTeam?.weeklyEarned || 0),
    rewardTitle: getTeamContestRewardTitle(completedPlace),
    prize: completedPrize,
    claimKey,
    hasClaimed,
    canClaim: Boolean(cleanTeamName && completedPrize > 0 && !hasClaimed),
    joinedAfterCompletedContest,
    nextPrizeAvailableAt: currentWeekEndsAt,
    secondsUntilNextPrize: Math.max(0, Math.ceil((currentWeekEndsAt - now) / 1000)),
  };
}

async function getTeamStats(teamName) {
  const cleanTeamName = String(teamName || '').trim();

  if (!cleanTeamName) {
    return {
      teamName: '',
      members: 0,
      weeklyEarned: 0,
      totalEarned: 0,
      totalTaps: 0,
      teamCode: '',
      place: null,
    };
  }

  const members = await User.find({ teamName: cleanTeamName }).select(
    'telegramId username weeklyEarned totalEarned totalTaps referralsCount'
  );

  const stats = members.reduce(
    (acc, member) => {
      acc.weeklyEarned += Number(member.weeklyEarned || 0);
      acc.totalEarned += Number(member.totalEarned || 0);
      acc.totalTaps += Number(member.totalTaps || 0);
      return acc;
    },
    {
      weeklyEarned: 0,
      totalEarned: 0,
      totalTaps: 0,
    }
  );

  const leaderboard = await User.aggregate([
    {
      $match: {
        weeklyEarned: { $gt: 0 },
        teamName: { $nin: ['', null] },
      },
    },
    {
      $group: {
        _id: '$teamName',
        weeklyEarned: { $sum: '$weeklyEarned' },
      },
    },
    { $sort: { weeklyEarned: -1 } },
  ]);

  const placeIndex = leaderboard.findIndex((team) => team._id === cleanTeamName);

  return {
    teamName: cleanTeamName,
    members: members.length,
    weeklyEarned: roundOnix(stats.weeklyEarned),
    totalEarned: roundOnix(stats.totalEarned),
    totalTaps: Number(stats.totalTaps || 0),
    teamCode: getTeamCode(cleanTeamName),
    place: placeIndex >= 0 ? placeIndex + 1 : null,
    membersList: members
      .map((member) => ({
        telegramId: member.telegramId,
        username: member.username || 'Spieler',
        weeklyEarned: roundOnix(member.weeklyEarned || 0),
        totalEarned: roundOnix(member.totalEarned || 0),
        totalTaps: Number(member.totalTaps || 0),
        referralsCount: Number(member.referralsCount || 0),
      }))
      .sort((a, b) => b.weeklyEarned - a.weeklyEarned)
      .slice(0, 20),
  };
}

async function getTeamMissionsPayload(user) {
  normalizeUserFields(user);

  const stats = await getTeamStats(user.teamName);
  const week = getWeekKey();
  const definitions = getTeamMissionDefinitions();

  return definitions.map((mission) => {
    let progress = 0;

    if (mission.id === 'team_earn_250k') progress = stats.weeklyEarned;
    if (mission.id === 'team_members_3') progress = stats.members;
    if (mission.id === 'team_taps_1000') progress = stats.totalTaps;

    const claimKey = `${week}_${mission.id}`;

    return {
      ...mission,
      week,
      progress: Math.min(Number(progress || 0), mission.goal),
      isCompleted: Number(progress || 0) >= mission.goal,
      isClaimed: user.teamMissionClaims.includes(claimKey),
    };
  });
}

function getMissionDifficulty(user) {
  const earned = Number(user.totalEarned || 0);

  if (earned >= 5000000) return 4;
  if (earned >= 1500000) return 3;
  if (earned >= 500000) return 2;

  return 1;
}

function ensureMissionStats(user, now = Date.now()) {
  const dailyKey = getUtcDayKey(now);
  const weeklyKey = getWeekKey(now);

  if (!user.missionStats) {
    user.missionStats = {};
  }

  if (user.missionStats.dailyKey !== dailyKey) {
    user.missionStats.dailyKey = dailyKey;
    user.missionStats.dailyTaps = 0;
    user.missionStats.dailyUpgrades = 0;
    user.missionStats.dailyOfflineClaims = 0;
    user.missionStats.dailyChests = 0;
    user.claimedDailyMissions = [];
  }

  if (user.missionStats.weeklyKey !== weeklyKey) {
    user.missionStats.weeklyKey = weeklyKey;
    user.missionStats.weeklyTaps = 0;
    user.missionStats.weeklyUpgrades = 0;
    user.missionStats.weeklyOfflineClaims = 0;
    user.missionStats.weeklyChests = 0;
    user.missionStats.weeklyReferrals = 0;
    user.claimedWeeklyMissions = [];
  }

  if (!user.claimedDailyMissions) user.claimedDailyMissions = [];
  if (!user.claimedWeeklyMissions) user.claimedWeeklyMissions = [];
  if (!user.usedPromoCodes) user.usedPromoCodes = [];
  if (user.welcomeBonusClaimed === undefined || user.welcomeBonusClaimed === null) {
    user.welcomeBonusClaimed = false;
  }
  if (user.lastWithdrawalCheckAt === undefined || user.lastWithdrawalCheckAt === null) {
    user.lastWithdrawalCheckAt = 0;
  }

  return user.missionStats;
}

function getDailyMissions(user) {
  const stats = ensureMissionStats(user);
  const difficulty = getMissionDifficulty(user);

  const missions = [
    {
      id: 'daily_taps',
      title: 'Tapper des Tages',
      description: `Mache heute ${100 * difficulty} Taps`,
      goal: 100 * difficulty,
      progress: Number(stats.dailyTaps || 0),
      reward: 4000,
      category: 'daily',
      secret: false,
    },
    {
      id: 'daily_upgrade',
      title: 'Upgrade des Tages',
      description: 'Kaufe heute 1 Upgrade',
      goal: 1,
      progress: Number(stats.dailyUpgrades || 0),
      reward: 4000,
      category: 'daily',
      secret: false,
    },
    {
      id: 'daily_offline',
      title: 'Miner abholen',
      description: 'Hole heute Offline-Einkommen ab',
      goal: 1,
      progress: Number(stats.dailyOfflineClaims || 0),
      reward: 4000,
      category: 'daily',
      secret: false,
    },
    {
      id: 'secret_daily_chest',
      title: 'Geheim: ONIX-Glück',
      description: 'Öffne heute 1 Truhe',
      goal: 1,
      progress: Number(stats.dailyChests || 0),
      reward: 3000,
      category: 'secret',
      secret: true,
      unlocked: Number(stats.dailyChests || 0) > 0,
    },
  ];

  return missions.map((mission) => ({
    ...mission,
    progress: Math.min(Number(mission.progress || 0), Number(mission.goal || 1)),
    isCompleted: Number(mission.progress || 0) >= Number(mission.goal || 1),
    isClaimed: user.claimedDailyMissions.includes(mission.id),
  }));
}

function getWeeklyMissions(user) {
  const stats = ensureMissionStats(user);
  const difficulty = getMissionDifficulty(user);

  const missions = [
    {
      id: 'weekly_taps',
      title: 'Tapper der Woche',
      description: `Mache ${1000 * difficulty} Taps pro Woche`,
      goal: 1000 * difficulty,
      progress: Number(stats.weeklyTaps || 0),
      reward: 10000,
      category: 'weekly',
      secret: false,
    },
    {
      id: 'weekly_earn',
      title: 'Wochenverdienst',
      description: `Verdiene ${100000 * difficulty} ONIX pro Woche`,
      goal: 100000 * difficulty,
      progress: Number(user.weeklyEarned || 0),
      reward: 10000,
      category: 'weekly',
      secret: false,
    },
    {
      id: 'weekly_upgrades',
      title: 'Ingenieur der Woche',
      description: `Kaufe ${3 * difficulty} Upgrades pro Woche`,
      goal: 3 * difficulty,
      progress: Number(stats.weeklyUpgrades || 0),
      reward: 10000,
      category: 'weekly',
      secret: false,
    },
    {
      id: 'secret_weekly_referral',
      title: 'Geheim: Rekrutierer',
      description: 'Lade 1 aktiven Freund pro Woche ein',
      goal: 1,
      progress: Number(stats.weeklyReferrals || 0),
      reward: 5000,
      category: 'secret',
      secret: true,
      unlocked: Number(stats.weeklyReferrals || 0) > 0,
    },
  ];

  return missions.map((mission) => ({
    ...mission,
    progress: Math.min(Number(mission.progress || 0), Number(mission.goal || 1)),
    isCompleted: Number(mission.progress || 0) >= Number(mission.goal || 1),
    isClaimed: user.claimedWeeklyMissions.includes(mission.id),
  }));
}

function getMissionsPayload(user) {
  ensureMissionStats(user);

  return {
    daily: getDailyMissions(user).filter((mission) => !mission.secret || mission.unlocked),
    weekly: getWeeklyMissions(user).filter((mission) => !mission.secret || mission.unlocked),
    difficulty: getMissionDifficulty(user),
    dailyKey: user.missionStats.dailyKey,
    weeklyKey: user.missionStats.weeklyKey,
  };
}

function incrementMissionStat(user, field, amount = 1) {
  const stats = ensureMissionStats(user);

  stats[field] = Number(stats[field] || 0) + amount;
}


function getPerkLevelsPayload(user) {
  const levels = {};

  if (!user.perkLevels) return levels;

  if (typeof user.perkLevels.forEach === 'function') {
    user.perkLevels.forEach((value, key) => {
      levels[key] = Number(value || 0);
    });
  } else {
    Object.entries(user.perkLevels || {}).forEach(([key, value]) => {
      levels[key] = Number(value || 0);
    });
  }

  return levels;
}

function getPerkLevel(user, perkId) {
  if (!user.perkLevels) return 0;

  const rawLevel =
    typeof user.perkLevels.get === 'function'
      ? user.perkLevels.get(perkId)
      : user.perkLevels[perkId];

  return Number(rawLevel || 0);
}

function setPerkLevel(user, perkId, level) {
  if (!user.perkLevels) user.perkLevels = new Map();

  if (typeof user.perkLevels.set === 'function') {
    user.perkLevels.set(perkId, level);
  } else {
    user.perkLevels[perkId] = level;
  }
}

function getPerkCost(perkId, nextLevel) {
  const perk = PERKS[perkId];

  if (!perk) return 0;

  return Math.round(perk.baseCost * Math.pow(1.85, Number(nextLevel || 1) - 1));
}

function getMaxOfflineSeconds(user) {
  const level = getPerkLevel(user, 'offline_pro');

  return MAX_OFFLINE_SECONDS + level * 60 * 60;
}

function hasPerk(user, perkId) {
  return getPerkLevel(user, perkId) > 0;
}

function getEnergyCost(user) {
  const level = getPerkLevel(user, 'energy_saver');
  const baseCost = Number(user.tapPower || DEFAULT_TAP_POWER);
  const multiplier = Math.max(0.7, 1 - 0.1 * level);

  return Math.max(1, roundOnix(baseCost * multiplier));
}

function getDailyRewardForUser(user) {
  const level = getPerkLevel(user, 'daily_plus');
  const baseReward = getDailyReward(user.level);
  const multiplier = 1 + 0.05 * level;

  return Math.round(baseReward * multiplier);
}

function getDailyRewardWithStreakForUser(user, streakDay) {
  return Math.round(
    getDailyRewardForUser(user) * getDailyStreakMultiplier(streakDay)
  );
}

function getMinerIncome(user) {
  const minerPerkLevel = getPerkLevel(user, 'miner_plus');
  const luckyLevel = getPerkLevel(user, 'lucky_miner');
  const minerLevel = Math.max(1, Number(user.minerLevel || 1));
  const baseIncomePerMinute = DEFAULT_MINER_RATE_PER_MINUTE + (minerLevel - 1) * 3;
  const multiplier = 1 + 0.05 * minerPerkLevel + 0.03 * luckyLevel;

  return Math.max(1, baseIncomePerMinute * multiplier);
}

function getReferralRewardForUser(user) {
  const level = getPerkLevel(user, 'referral_pro');
  const economyConfig = getEconomyConfig();

  return Math.round(economyConfig.referralReward * (1 + 0.05 * level));
}

function getUpgradeDiscountMultiplier(user) {
  const level = getPerkLevel(user, 'engineer');

  return Math.max(0.85, 1 - 0.05 * level);
}

function getBoostDurationMultiplier(user) {
  const level = getPerkLevel(user, 'boost_master');

  return 1 + 0.2 * level;
}

function getMaxEnergyWithPerks(user) {
  const level = getPerkLevel(user, 'energy_max_pro');
  const energyLevel = Math.max(1, Number(user.energyLevel || 1));
  const upgradedEnergy = DEFAULT_MAX_ENERGY + (energyLevel - 1) * 250;

  return upgradedEnergy + level * 300;
}

function getEnergyRechargeForUser(user) {
  const rechargeLevel = Math.max(1, Number(user.rechargeLevel || 1));
  return 1 + Math.floor((rechargeLevel - 1) / 4);
}
function getNumberEnv(name, fallback) {
  if (Object.prototype.hasOwnProperty.call(ECONOMY_OVERRIDES, name)) {
    const overrideValue = Number(ECONOMY_OVERRIDES[name]);

    if (Number.isFinite(overrideValue)) return overrideValue;
  }

  const value = Number(process.env[name]);

  return Number.isFinite(value) ? value : fallback;
}


function getPromoCodesConfig() {
  return {
    START: getNumberEnv('PROMO_START_REWARD', 5000),
    ONIX2026: getNumberEnv('PROMO_ONIX2026_REWARD', 10000),
    LAUNCH: getNumberEnv('PROMO_LAUNCH_REWARD', 15000),
  };
}

function getWelcomeBonusAmount() {
  return getNumberEnv('WELCOME_BONUS', 5000);
}

function getEconomyConfig() {
  return {
    onixEurPer1000: getNumberEnv('ONIX_EUR_PER_1000', 2 / 3),
    minWithdrawOnix: getNumberEnv('MIN_WITHDRAW_ONIX', 750000),
    referralReward: getNumberEnv('REFERRAL_REWARD', 25000),
    referredUserReward: getNumberEnv('REFERRED_USER_REWARD', 5000),
    welcomeBonus: getWelcomeBonusAmount(),
    maxPaidReferralsPerDay: getNumberEnv('MAX_PAID_REFERRALS_PER_DAY', 10),
    maxPaidReferralsPerHour: getNumberEnv('MAX_PAID_REFERRALS_PER_HOUR', 5),
    chestCost: getNumberEnv('CHEST_COST', 50000),
    dailyMissionBaseReward: getNumberEnv('DAILY_MISSION_BASE_REWARD', 4000),
    weeklyMissionBaseReward: getNumberEnv('WEEKLY_MISSION_BASE_REWARD', 10000),
    seasonPrizes: {
      top1: getNumberEnv('SEASON_PRIZE_TOP_1', 100000),
      top2: getNumberEnv('SEASON_PRIZE_TOP_2', 60000),
      top3: getNumberEnv('SEASON_PRIZE_TOP_3', 40000),
      top10: getNumberEnv('SEASON_PRIZE_TOP_10', 15000),
      top50: getNumberEnv('SEASON_PRIZE_TOP_50', 5000),
    },
    upgradeBaseCosts: {
      tap: getNumberEnv('UPGRADE_TAP_BASE_COST', 500),
      miner: getNumberEnv('UPGRADE_MINER_BASE_COST', 750),
      energy: getNumberEnv('UPGRADE_ENERGY_BASE_COST', 600),
      recharge: getNumberEnv('UPGRADE_RECHARGE_BASE_COST', 650),
    },
    perkBaseCosts: {
      offline_pro: getNumberEnv('PERK_OFFLINE_PRO_BASE_COST', 60000),
      energy_saver: getNumberEnv('PERK_ENERGY_SAVER_BASE_COST', 75000),
      daily_plus: getNumberEnv('PERK_DAILY_PLUS_BASE_COST', 75000),
      miner_plus: getNumberEnv('PERK_MINER_PLUS_BASE_COST', 90000),
      boost_master: getNumberEnv('PERK_BOOST_MASTER_BASE_COST', 75000),
      streak_shield: getNumberEnv('PERK_STREAK_SHIELD_BASE_COST', 100000),
      lucky_miner: getNumberEnv('PERK_LUCKY_MINER_BASE_COST', 100000),
      referral_pro: getNumberEnv('PERK_REFERRAL_PRO_BASE_COST', 100000),
      energy_max_pro: getNumberEnv('PERK_ENERGY_MAX_PRO_BASE_COST', 75000),
      engineer: getNumberEnv('PERK_ENGINEER_BASE_COST', 90000),
    },
  };
}

function getOnixEurRate() {
  return getEconomyConfig().onixEurPer1000 / 1000;
}



const ACHIEVEMENTS = [
  {
    id: 'first_tap',
    title: 'Erster Tap',
    description: 'Tippe zum ersten Mal auf die Münze',
    reward: 250,
    goal: 1,
  },
  {
    id: 'taps_100',
    title: '100 Taps',
    description: 'Mache 100 Taps',
    reward: 1000,
    goal: 100,
  },
  {
    id: 'taps_1000',
    title: '1.000 Taps',
    description: 'Mache 1.000 Taps',
    reward: 4000,
    goal: 1000,
  },
  {
    id: 'first_upgrade',
    title: 'Erstes Upgrade',
    description: 'Kaufe ein beliebiges Upgrade',
    reward: 1500,
    goal: 1,
  },
  {
    id: 'miner_level_5',
    title: 'Miner Lvl. 5',
    description: 'Bringe den Miner auf Level 5',
    reward: 5000,
    goal: 5,
  },
  {
    id: 'first_boost',
    title: 'Erster Boost',
    description: 'Aktiviere einen temporären Boost',
    reward: 2500,
    goal: 1,
  },
  {
    id: 'first_offline_claim',
    title: 'Erstes Offline-Einkommen',
    description: 'Hole das Offline-Einkommen des Miners ab',
    reward: 2500,
    goal: 1,
  },
  {
    id: 'first_friend',
    title: 'Erster Freund',
    description: 'Lade deinen ersten Freund ein',
    reward: 5000,
    goal: 1,
  },
  {
    id: 'taps_10000',
    title: '10.000 Taps',
    description: 'Mache 10.000 Taps',
    reward: 15000,
    goal: 10000,
  },
  {
    id: 'weekly_100k',
    title: '100.000 ONIX pro Woche',
    description: 'Verdiene 100.000 ONIX in einer Woche',
    reward: 10000,
    goal: 100000,
  },
  {
    id: 'all_perks',
    title: 'Perk-Sammler',
    description: 'Kaufe alle permanenten Perks',
    reward: 30000,
    goal: 10,
  },
  {
    id: 'rank_gold',
    title: 'Gold-Rang',
    description: 'Erreiche Gold I',
    reward: 20000,
    goal: 750000,
  },
  {
    id: 'rank_diamond',
    title: 'Diamond-Spieler',
    description: 'Erreiche Diamond',
    reward: 75000,
    goal: 5000000,
  },
  {
    id: 'friends_5',
    title: '5 Freunde',
    description: 'Lade 5 Freunde ein',
    reward: 20000,
    goal: 5,
  },
  {
    id: 'streak_7',
    title: '7 Tage in Folge',
    description: 'Erreiche Tag 7 der Daily-Streak',
    reward: 15000,
    goal: 7,
  },
  {
    id: 'taps_50000',
    title: '50.000 Taps',
    description: 'Mache 50.000 Taps',
    reward: 35000,
    goal: 50000,
  },
  {
    id: 'taps_100000',
    title: '100.000 Taps',
    description: 'Mache 100.000 Taps',
    reward: 60000,
    goal: 100000,
  },
  {
    id: 'earned_1m',
    title: 'ONIX-Millionär',
    description: 'Verdiene insgesamt 1.000.000 ONIX',
    reward: 25000,
    goal: 1000000,
  },
  {
    id: 'friends_10',
    title: '10 Freunde',
    description: 'Lade 10 Freunde ein',
    reward: 40000,
    goal: 10,
  },
  {
    id: 'upgrade_master',
    title: 'Upgrade-Meister',
    description: 'Kaufe 25 Upgrades',
    reward: 25000,
    goal: 25,
  },
  {
    id: 'boost_master',
    title: 'Boost Master',
    description: 'Nutze 10 Boosts',
    reward: 20000,
    goal: 10,
  },
  {
    id: 'offline_master',
    title: 'Offline-Meister',
    description: 'Hole 10-mal Offline-Einkommen ab',
    reward: 20000,
    goal: 10,
  },
];

function getAchievementProgressValue(user, achievementId) {
  if (achievementId === 'first_tap') return Number(user.totalTaps || 0);
  if (achievementId === 'taps_100') return Number(user.totalTaps || 0);
  if (achievementId === 'taps_1000') return Number(user.totalTaps || 0);
  if (achievementId === 'taps_10000') return Number(user.totalTaps || 0);
  if (achievementId === 'taps_50000') return Number(user.totalTaps || 0);
  if (achievementId === 'taps_100000') return Number(user.totalTaps || 0);
  if (achievementId === 'earned_1m') return Number(user.totalEarned || 0);
  if (achievementId === 'friends_10') return Number(user.referralsCount || 0);
  if (achievementId === 'upgrade_master') return Number(user.totalUpgradesBought || 0);
  if (achievementId === 'boost_master') return Number(user.totalBoostsUsed || 0);
  if (achievementId === 'offline_master') return Number(user.offlineClaimsCount || 0);
  if (achievementId === 'weekly_100k') return Number(user.weeklyEarned || 0);
  if (achievementId === 'all_perks') return Array.isArray(user.ownedPerks) ? user.ownedPerks.length : 0;
  if (achievementId === 'rank_gold') return Number(user.totalEarned || 0);
  if (achievementId === 'rank_diamond') return Number(user.totalEarned || 0);
  if (achievementId === 'friends_5') return Number(user.referralsCount || 0);
  if (achievementId === 'streak_7') return Number(user.dailyStreak || 0);
  if (achievementId === 'first_upgrade') return Number(user.totalUpgradesBought || 0);
  if (achievementId === 'miner_level_5') return Number(user.minerLevel || 1);
  if (achievementId === 'first_boost') return Number(user.totalBoostsUsed || 0);
  if (achievementId === 'first_offline_claim') return Number(user.offlineClaimsCount || 0);
  if (achievementId === 'first_friend') return Number(user.referralsCount || 0);

  return 0;
}

function getAchievementsPayload(user) {
  if (!user.completedAchievements) user.completedAchievements = [];

  return ACHIEVEMENTS.map((achievement) => {
    const progress = getAchievementProgressValue(user, achievement.id);
    const isCompleted = user.completedAchievements.includes(achievement.id);

    return {
      ...achievement,
      progress: Math.min(progress, achievement.goal),
      isCompleted,
    };
  });
}

function applyAchievements(user) {
  if (!user.completedAchievements) user.completedAchievements = [];

  const awarded = [];

  for (const achievement of ACHIEVEMENTS) {
    if (user.completedAchievements.includes(achievement.id)) continue;

    const progress = getAchievementProgressValue(user, achievement.id);

    if (progress >= achievement.goal) {
      user.completedAchievements.push(achievement.id);
      user.balance = roundOnix(Number(user.balance || 0) + achievement.reward);
      addEarnings(user, achievement.reward);

      addTransaction(
        user,
        'income_achievement',
        achievement.reward,
        `Erfolg: ${achievement.title}`
      );

      awarded.push({
        id: achievement.id,
        title: achievement.title,
        reward: achievement.reward,
      });
    }
  }

  return awarded;
}

const RANKS = [
  { id: 'bronze_1', name: 'Bronze I', threshold: 0, bonus: 0 },
  { id: 'bronze_2', name: 'Bronze II', threshold: 25000, bonus: 2500 },
  { id: 'bronze_3', name: 'Bronze III', threshold: 75000, bonus: 7500 },
  { id: 'silver_1', name: 'Silver I', threshold: 150000, bonus: 15000 },
  { id: 'silver_2', name: 'Silver II', threshold: 300000, bonus: 30000 },
  { id: 'silver_3', name: 'Silver III', threshold: 500000, bonus: 50000 },
  { id: 'gold_1', name: 'Gold I', threshold: 750000, bonus: 75000 },
  { id: 'gold_2', name: 'Gold II', threshold: 1000000, bonus: 100000 },
  { id: 'gold_3', name: 'Gold III', threshold: 1500000, bonus: 150000 },
  { id: 'platinum', name: 'Platinum', threshold: 2500000, bonus: 250000 },
  { id: 'diamond', name: 'Diamond', threshold: 5000000, bonus: 500000 },
  { id: 'master', name: 'Master', threshold: 10000000, bonus: 1000000 },
  { id: 'legend', name: 'Legend', threshold: 25000000, bonus: 2500000 },
];

function getRankInfo(totalEarned) {
  const earned = Number(totalEarned || 0);
  let currentRank = RANKS[0];
  let nextRank = null;

  for (let i = 0; i < RANKS.length; i += 1) {
    if (earned >= RANKS[i].threshold) {
      currentRank = RANKS[i];
      nextRank = RANKS[i + 1] || null;
    }
  }

  const currentThreshold = currentRank.threshold;
  const nextThreshold = nextRank ? nextRank.threshold : currentThreshold;
  const progressTotal = Math.max(1, nextThreshold - currentThreshold);
  const progressCurrent = Math.max(0, earned - currentThreshold);
  const progressPercent = nextRank
    ? Math.min(100, (progressCurrent / progressTotal) * 100)
    : 100;

  return {
    currentRank,
    nextRank,
    progressCurrent: roundOnix(progressCurrent),
    progressTotal: roundOnix(progressTotal),
    progressPercent: roundOnix(progressPercent),
  };
}

function applyRankBonuses(user) {
  if (!user.claimedRankBonuses) user.claimedRankBonuses = [];

  const awarded = [];
  let changed = true;
  let guard = 0;

  while (changed && guard < RANKS.length + 2) {
    changed = false;
    guard += 1;

    for (const rank of RANKS) {
      if (rank.bonus <= 0) continue;
      if (user.claimedRankBonuses.includes(rank.id)) continue;

      if (Number(user.totalEarned || 0) >= rank.threshold) {
        user.balance = roundOnix(Number(user.balance || 0) + rank.bonus);
        addEarnings(user, rank.bonus);
        user.claimedRankBonuses.push(rank.id);
        addTransaction(
          user,
          'income_rank',
          rank.bonus,
          `Rangbonus ${rank.name}`
        );
        awarded.push({
          id: rank.id,
          name: rank.name,
          bonus: rank.bonus,
        });
        changed = true;
      }
    }
  }

  return awarded;
}


function roundOnix(value) {
  const numericValue = Number(value || 0);
  if (!Number.isFinite(numericValue)) return 0;
  return numericValue < 0 ? Math.ceil(numericValue) : Math.floor(numericValue);
}

function roundCurrency(value) {
  const numericValue = Number(value || 0);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.round(numericValue * 100) / 100;
}

function addTransaction(user, type, amount, title, status = 'completed') {
  if (!user.transactions) user.transactions = [];

  user.transactions.unshift({
    type,
    amount: roundOnix(amount),
    title,
    status,
    createdAt: Date.now(),
  });

  user.transactions = user.transactions.slice(0, 50);
}

function prepareReferralBonusWindow(user, now = Date.now()) {
  const todayKey = getUtcDayKey(now);
  const hourKey = getUtcHourKey(now);

  if (user.lastReferralBonusDay !== todayKey) {
    user.lastReferralBonusDay = todayKey;
    user.dailyReferralBonusCount = 0;
  }

  if (user.lastReferralBonusHour !== hourKey) {
    user.lastReferralBonusHour = hourKey;
    user.hourlyReferralBonusCount = 0;
  }

  if (user.dailyReferralBonusCount === undefined || user.dailyReferralBonusCount === null) {
    user.dailyReferralBonusCount = 0;
  }

  if (user.hourlyReferralBonusCount === undefined || user.hourlyReferralBonusCount === null) {
    user.hourlyReferralBonusCount = 0;
  }

  return todayKey;
}

function canReceivePaidReferralBonus(user, now = Date.now()) {
  prepareReferralBonusWindow(user, now);

  return (
    Number(user.dailyReferralBonusCount || 0) < getEconomyConfig().maxPaidReferralsPerDay &&
    Number(user.hourlyReferralBonusCount || 0) < MAX_PAID_REFERRALS_PER_HOUR
  );
}

function getNextUtcDayStart(timestamp = Date.now()) {
  const date = new Date(timestamp);
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + 1,
    0,
    0,
    0,
    0
  );
}

function getReferralLimitPayload(user, now = Date.now()) {
  prepareReferralBonusWindow(user, now);

  const used = Number(user.dailyReferralBonusCount || 0);
  const max = getEconomyConfig().maxPaidReferralsPerDay;
  const resetAt = getNextUtcDayStart(now);

  return {
    used,
    max,
    remaining: Math.max(max - used, 0),
    resetAt,
    secondsUntilReset: Math.max(Math.ceil((resetAt - now) / 1000), 0),
    isLimitReached: used >= max,
  };
}


// ONIX Drop mini-game economy. The daily cap is deliberately small so the
// mini-game improves retention without becoming a dominant ONIX source.
const ONIX_DROP_DAILY_ATTEMPTS = 3;
const ONIX_DROP_MAX_REWARD_PER_RUN = 2500;
const ONIX_DROP_SESSION_MS = 60 * 1000;
const ONIX_DROP_MIN_RUN_MS = 5 * 1000;

function prepareOnixDropDay(user, now = Date.now()) {
  const dayKey = getUtcDayKey(now);
  if (!user.onixDrop || user.onixDrop.dayKey !== dayKey) {
    user.onixDrop = {
      dayKey,
      attemptsUsed: 0,
      dailyEarned: 0,
      bestScore: Number(user.onixDrop?.bestScore || 0),
      sessionId: '',
      sessionStartedAt: 0,
      sessionExpiresAt: 0,
    };
  }
}

function getOnixDropPayload(user, now = Date.now()) {
  prepareOnixDropDay(user, now);
  const attemptsUsed = Number(user.onixDrop.attemptsUsed || 0);
  return {
    attemptsUsed,
    attemptsMax: ONIX_DROP_DAILY_ATTEMPTS,
    attemptsLeft: Math.max(ONIX_DROP_DAILY_ATTEMPTS - attemptsUsed, 0),
    dailyEarned: Number(user.onixDrop.dailyEarned || 0),
    bestScore: Number(user.onixDrop.bestScore || 0),
    maxRewardPerRun: ONIX_DROP_MAX_REWARD_PER_RUN,
    resetAt: getNextUtcDayStart(now),
  };
}

function getTapUpgradeCost(tapLevel) {
  return Math.round(1000 * Math.pow(1.20, Number(tapLevel || 1) - 1));
}

function getMinerUpgradeCost(minerLevel) {
  return Math.round(2500 * Math.pow(1.20, Number(minerLevel || 1) - 1));
}

function getEnergyUpgradeCost(energyLevel) {
  return Math.round(1500 * Math.pow(1.15, Number(energyLevel || 1) - 1));
}

function getRechargeUpgradeCost(rechargeLevel) {
  return Math.round(1800 * Math.pow(1.15, Number(rechargeLevel || 1) - 1));
}

function getDailyReward(level) {
  const safeLevel = Math.max(1, Number(level || 1));
  return Math.min(2500 + Math.floor((safeLevel - 1) / 10) * 100, 3000);
}

function getUtcDayKey(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function getUtcHourKey(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 13);
}

function getWeekKey(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const utcDate = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );

  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);

  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((utcDate - yearStart) / 86400000 + 1) / 7);

  return `${utcDate.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function getWeekEndTimestamp(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const day = date.getUTCDay() || 7;
  const daysUntilNextMonday = 8 - day;

  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + daysUntilNextMonday,
    0,
    0,
    0,
    0
  );
}

function getPreviousWeekKey(timestamp = Date.now()) {
  return getWeekKey(Number(timestamp) - 7 * 24 * 60 * 60 * 1000);
}

function addEarnings(user, amount) {
  const value = roundOnix(amount);
  const currentWeek = getWeekKey();

  if (!user.weeklyEarnedWeek || user.weeklyEarnedWeek !== currentWeek) {
    user.weeklyEarnedWeek = currentWeek;
    user.weeklyEarned = 0;
  }

  user.totalEarned = roundOnix(Number(user.totalEarned || 0) + value);
  user.weeklyEarned = roundOnix(Number(user.weeklyEarned || 0) + value);
}

function getDailyStreakMultiplier(streakDay) {
  const day = Number(streakDay || 1);

  if (day >= 7) return 2;

  return 1 + (day - 1) * 0.1;
}

function getDailyRewardWithStreak(level, streakDay) {
  return Math.round(getDailyReward(level) * getDailyStreakMultiplier(streakDay));
}

function getTapBoostCost(_tapPower) {
  return TEMP_TAP_BOOST_COST;
}

function getMiningBoostCost(_autoclickers) {
  return TEMP_MINING_BOOST_COST;
}

function getEnergyRefillCost() {
  return TEMP_ENERGY_REFILL_COST;
}


function calculateLevel(totalEarned) {
  return Math.floor((totalEarned || 0) / LEVEL_COINS) + 1;
}

function normalizeUserFields(user) {
  if (!user.completedTasks) user.completedTasks = [];
  if (!user.claimedRankBonuses) user.claimedRankBonuses = [];
  if (!user.tapTimestamps) user.tapTimestamps = [];

  if (user.balance === undefined || user.balance === null) user.balance = 0;
  user.balance = roundOnix(user.balance);
  if (user.energy === undefined || user.energy === null) user.energy = DEFAULT_ENERGY;
  user.energy = Math.max(0, roundOnix(user.energy));
  user.maxEnergy = Math.max(DEFAULT_MAX_ENERGY, roundOnix(getMaxEnergyWithPerks(user)));
  user.energy = Math.min(Number(user.energy || 0), Number(user.maxEnergy || DEFAULT_MAX_ENERGY));
  if (user.tapPower === undefined || user.tapPower === null) user.tapPower = DEFAULT_TAP_POWER;
  user.tapPower = Math.max(1, roundOnix(user.tapPower));
  user.energyRecharge = Math.max(1, roundOnix(getEnergyRechargeForUser(user)));
  if (user.autoclickers === undefined || user.autoclickers === null) user.autoclickers = 1;
  user.autoclickers = Math.max(1, roundOnix(user.autoclickers));
  if (user.minerRemainder === undefined || user.minerRemainder === null) user.minerRemainder = 0;
  user.minerRemainder = Math.max(0, Number(user.minerRemainder || 0));
  if (user.totalEarned === undefined || user.totalEarned === null) user.totalEarned = 0;
  user.totalEarned = roundOnix(user.totalEarned);
  if (user.weeklyEarned === undefined || user.weeklyEarned === null) user.weeklyEarned = 0;
  user.weeklyEarned = roundOnix(user.weeklyEarned);
  if (user.weeklyEarnedWeek === undefined || user.weeklyEarnedWeek === null) {
    user.weeklyEarnedWeek = getWeekKey();
  }
  if (user.weeklyEarnedWeek !== getWeekKey()) {
    user.weeklyEarnedWeek = getWeekKey();
    user.weeklyEarned = 0;
  }
  if (user.level === undefined || user.level === null) user.level = calculateLevel(user.totalEarned);

  if (user.referralsCount === undefined || user.referralsCount === null) user.referralsCount = 0;

  if (user.tapLevel === undefined || user.tapLevel === null) user.tapLevel = 1;
  if (user.minerLevel === undefined || user.minerLevel === null) user.minerLevel = 1;
  if (user.energyLevel === undefined || user.energyLevel === null) user.energyLevel = 1;
  if (user.rechargeLevel === undefined || user.rechargeLevel === null) user.rechargeLevel = 1;

  // Keep max energy deterministic: base + energy upgrades + Energy Max Pro.
  // This prevents Energy Max Pro from stacking on top of an already boosted maxEnergy.
  user.maxEnergy = getMaxEnergyWithPerks(user);
  user.energy = Math.min(Number(user.energy || 0), Number(user.maxEnergy || DEFAULT_MAX_ENERGY));

  if (user.totalTaps === undefined || user.totalTaps === null) user.totalTaps = 0;
  if (user.totalBoostsUsed === undefined || user.totalBoostsUsed === null) user.totalBoostsUsed = 0;
  if (user.totalUpgradesBought === undefined || user.totalUpgradesBought === null) user.totalUpgradesBought = 0;
  if (user.offlineClaimsCount === undefined || user.offlineClaimsCount === null) user.offlineClaimsCount = 0;

  if (user.dailyStreak === undefined || user.dailyStreak === null) user.dailyStreak = 0;
  if (user.lastDailyClaimDay === undefined || user.lastDailyClaimDay === null) {
    user.lastDailyClaimDay = null;
  }

  if (user.lastOfflineIncome === undefined || user.lastOfflineIncome === null) {
    user.lastOfflineIncome = 0;
  }

  if (user.lastOfflineSeconds === undefined || user.lastOfflineSeconds === null) {
    user.lastOfflineSeconds = 0;
  }

  if (user.pendingOfflineIncome === undefined || user.pendingOfflineIncome === null) {
    user.pendingOfflineIncome = 0;
  }

  if (user.pendingOfflineSeconds === undefined || user.pendingOfflineSeconds === null) {
    user.pendingOfflineSeconds = 0;
  }

  if (!user.activeBoost) {
    user.activeBoost = 'none';
  }

  if (user.boostEndTime === undefined || user.boostEndTime === null) {
    user.boostEndTime = 0;
  }

  if (user.lastMineTickAt === undefined || user.lastMineTickAt === null) {
    user.lastMineTickAt = 0;
  }

  if (user.lastUpgradeBuyAt === undefined || user.lastUpgradeBuyAt === null) {
    user.lastUpgradeBuyAt = 0;
  }

  if (!user.activeBoost) user.activeBoost = 'none';
  if (!user.boostEndTime) user.boostEndTime = 0;

  if (
    user.activeBoost !== 'none' &&
    Number(user.boostEndTime || 0) <= Date.now()
) {
  user.activeBoost = 'none';
  user.boostEndTime = 0;
}

  return user;
}






function safeSecretEquals(providedValue, expectedValue) {
  const provided = String(providedValue || '');
  const expected = String(expectedValue || '');

  if (!provided || !expected) return false;

  const providedBuffer = Buffer.from(provided, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');

  if (providedBuffer.length !== expectedBuffer.length) return false;

  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

function isAdminRequest(req, secret, telegramId) {
  // Server-side ADMIN_SECRET remains available for emergency/manual admin calls.
  if (process.env.ADMIN_SECRET && safeSecretEquals(secret, process.env.ADMIN_SECRET)) {
    return true;
  }

  if (!process.env.ADMIN_TELEGRAM_ID) return false;

  // A raw telegramId from query/body is never sufficient for admin access.
  // Admin Telegram identity must come from cryptographically signed Mini App initData.
  const initData = req.get('x-telegram-init-data') || '';
  const auth = validateTelegramInitData(initData, process.env.BOT_TOKEN);

  if (!auth.ok || !auth.user?.id) return false;

  const signedTelegramId = String(auth.user.id);
  const configuredAdminId = String(process.env.ADMIN_TELEGRAM_ID);

  if (signedTelegramId !== configuredAdminId) return false;

  // If the frontend also sends telegramId, it must match the signed identity.
  if (telegramId && String(telegramId) !== signedTelegramId) return false;

  return true;
}

function isCronRequest(req) {
  const headerSecret = req.get('x-cron-secret') || '';
  const querySecret = req.query.secret ? String(req.query.secret) : '';
  const providedSecret = headerSecret || querySecret;

  return Boolean(
    process.env.CRON_SECRET &&
    safeSecretEquals(providedSecret, process.env.CRON_SECRET)
  );
}


// CRON: AUTO AWARD WEEKLY PRIZES
// By default awards the previous completed UTC week.

router.get('/cron-award-weekly-prizes', async (req, res) => {
  try {
    if (!isCronRequest(req)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const targetWeek = req.query.week ? String(req.query.week) : getPreviousWeekKey();
    const alreadyAwarded = await WeeklyPrize.findOne({ week: targetWeek });

    if (alreadyAwarded) {
      return res.json({
        message: 'Already awarded',
        week: targetWeek,
        winners: alreadyAwarded.winners,
      });
    }

    const prizes = Array.from({ length: 50 }, (_, index) => getSeasonPrizeByPlace(index + 1));

    const topUsers = await User.find({
      weeklyEarnedWeek: targetWeek,
      weeklyEarned: { $gt: 0 },
    })
      .sort({ weeklyEarned: -1 })
      .limit(50);

    const winners = [];

    for (let i = 0; i < topUsers.length; i += 1) {
      const user = topUsers[i];
      const prize = prizes[i];
      const place = i + 1;
      const seasonBadge = getSeasonBadgeByPlace(place);

      if (!prize) continue;

      normalizeUserFields(user);

      user.balance = roundOnix(Number(user.balance || 0) + prize);
      addEarnings(user, prize);

      if (seasonBadge && !user.seasonBadges.includes(seasonBadge)) {
        user.seasonBadges.push(seasonBadge);
      }

      addTransaction(user, 'income_season_prize', prize, `Saisonpreis: Platz ${place}`);

      applyRankBonuses(user);
      user.level = calculateLevel(user.totalEarned);
      user.updatedAt = new Date();

      const referralBonus = await tryPayQualifiedReferralBonus(user);

    await user.save();

      winners.push({
        place,
        telegramId: user.telegramId,
        username: user.username || 'Spieler',
        weeklyEarned: roundOnix(user.weeklyEarned || 0),
        prize,
      });
    }

    await WeeklyPrize.create({
      week: targetWeek,
      awardedAt: Date.now(),
      winners,
    });

    return res.json({
      message: 'Weekly prizes awarded by cron',
      week: targetWeek,
      winners,
    });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.json({ message: 'Already awarded' });
    }

    return res.status(500).json({ error: error.message });
  }
});

// ADMIN: PREVIEW WEEKLY SEASON PRIZES
router.get('/admin-weekly-prize-preview', async (req, res) => {
  try {
    const secret = req.query.secret ? String(req.query.secret) : '';
    const telegramId = req.query.telegramId ? String(req.query.telegramId) : '';

    if (!isAdminRequest(req, secret, telegramId)) {
      return res.status(403).json({
        message: 'Forbidden',
      });
    }

    const targetWeek = req.query.week ? String(req.query.week) : getWeekKey();
    const prizes = Array.from({ length: 50 }, (_, index) => getSeasonPrizeByPlace(index + 1));

    const alreadyAwarded = await WeeklyPrize.findOne({ week: targetWeek });

    const topUsers = await User.find({
      weeklyEarnedWeek: targetWeek,
      weeklyEarned: { $gt: 0 },
    })
      .sort({ weeklyEarned: -1 })
      .limit(50)
      .select('telegramId username weeklyEarned totalEarned balance');

    return res.json({
      week: targetWeek,
      alreadyAwarded: Boolean(alreadyAwarded),
      awardedAt: alreadyAwarded?.awardedAt || null,
      awardedWinners: alreadyAwarded?.winners || [],
      preview: topUsers.map((user, index) => ({
        place: index + 1,
        telegramId: user.telegramId,
        username: user.username || 'Spieler',
        weeklyEarned: roundOnix(user.weeklyEarned || 0),
        totalEarned: roundOnix(user.totalEarned || 0),
        balance: roundOnix(user.balance || 0),
        prize: prizes[index],
      })),
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message,
    });
  }
});

// ADMIN: AWARD WEEKLY SEASON PRIZES
router.post('/admin-award-weekly-prizes', async (req, res) => {
  try {
    const { secret, confirm, week, telegramId } = req.body;

    if (!isAdminRequest(req, secret, telegramId)) {
      return res.status(403).json({
        message: 'Forbidden',
      });
    }

    if (confirm !== 'AWARD_WEEKLY_PRIZES') {
      return res.status(400).json({
        message: 'Confirmation is required',
      });
    }

    const targetWeek = week || getWeekKey();

    const alreadyAwarded = await WeeklyPrize.findOne({ week: targetWeek });

    if (alreadyAwarded) {
      return res.status(400).json({
        message: 'Weekly prizes already awarded',
        week: targetWeek,
        winners: alreadyAwarded.winners,
      });
    }

    const prizes = Array.from({ length: 50 }, (_, index) => getSeasonPrizeByPlace(index + 1));

    const topUsers = await User.find({
      weeklyEarnedWeek: targetWeek,
      weeklyEarned: { $gt: 0 },
    })
      .sort({ weeklyEarned: -1 })
      .limit(50);

    if (!topUsers.length) {
      return res.status(400).json({
        message: 'No eligible users for this week',
        week: targetWeek,
      });
    }

    const winners = [];

    for (let i = 0; i < topUsers.length; i += 1) {
      const user = topUsers[i];
      const prize = prizes[i];
      const place = i + 1;
      const seasonBadge = getSeasonBadgeByPlace(place);

      if (!prize) continue;

      normalizeUserFields(user);

      user.balance = roundOnix(Number(user.balance || 0) + prize);
      addEarnings(user, prize);

      if (seasonBadge && !user.seasonBadges.includes(seasonBadge)) {
        user.seasonBadges.push(seasonBadge);
      }

      addTransaction(
        user,
        'income_season_prize',
        prize,
        `Saisonpreis: Platz ${place}`
      );

      const rankBonuses = applyRankBonuses(user);
      user.level = calculateLevel(user.totalEarned);
      user.updatedAt = new Date();

      const referralBonus = await tryPayQualifiedReferralBonus(user);

    await user.save();

      winners.push({
        place,
        telegramId: user.telegramId,
        username: user.username || 'Spieler',
        weeklyEarned: roundOnix(user.weeklyEarned || 0),
        prize,
        rankBonuses,
      });
    }

    await WeeklyPrize.create({
      week: targetWeek,
      awardedAt: Date.now(),
      winners,
    });

    return res.json({
      message: 'Weekly prizes awarded',
      week: targetWeek,
      winners,
    });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(400).json({
        message: 'Weekly prizes already awarded',
      });
    }

    return res.status(500).json({
      error: error.message,
    });
  }
});



// SEASON PRIZE POPUP FOR USER
router.post('/season-prize-popup', requireTelegramMiniAppUser, async (req, res) => {
  try {
    const requestedTelegramId = String(req.body?.telegramId || '');
    const telegramId = req.telegramUserId;

    if (requestedTelegramId && requestedTelegramId !== telegramId) {
      return res.status(403).json({
        message: 'Telegram ID does not match authenticated user',
      });
    }

    const user = await User.findOne({ telegramId });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    normalizeUserFields(user);

    const latestSeason = await WeeklyPrize.findOne({
      'winners.telegramId': telegramId,
    }).sort({ awardedAt: -1 });

    if (!latestSeason || user.lastSeenSeasonPrizeWeek === latestSeason.week) {
      return res.json({ prize: null });
    }

    const winner = latestSeason.winners.find(
      (item) => String(item.telegramId) === String(telegramId)
    );

    user.lastSeenSeasonPrizeWeek = latestSeason.week;
    await user.save();

    return res.json({
      prize: winner
        ? {
            week: latestSeason.week,
            place: winner.place,
            prize: winner.prize,
          }
        : null,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// SEASON HISTORY
router.get('/season-history', async (req, res) => {
  try {
    const seasons = await WeeklyPrize.find({})
      .sort({ awardedAt: -1 })
      .limit(10);

    return res.json({
      seasons: seasons.map((season) => ({
        week: season.week,
        awardedAt: season.awardedAt,
        winners: season.winners || [],
      })),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});




// ADMIN: SEARCH / LIST USERS
router.get('/admin-search-users', async (req, res) => {
  try {
    const secret = req.query.secret ? String(req.query.secret) : '';
    const telegramId = req.query.telegramId ? String(req.query.telegramId) : '';
    const query = req.query.query ? String(req.query.query).trim() : '';
    const page = Math.max(Number.parseInt(String(req.query.page || '1'), 10) || 1, 1);
    const requestedLimit = Number.parseInt(String(req.query.limit || '50'), 10) || 50;
    const limit = Math.min(Math.max(requestedLimit, 1), 100);

    if (!isAdminRequest(req, secret, telegramId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const filter = {};

    if (query) {
      const searchRegex = new RegExp(escapeRegExpValue(query), 'i');
      filter.$or = [
        { telegramId: searchRegex },
        { username: searchRegex },
        { telegramUsername: searchRegex },
        { firstName: searchRegex },
        { lastName: searchRegex },
        { displayName: searchRegex },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select(
          'telegramId username telegramUsername firstName lastName displayName languageCode photoUrl balance totalEarned weeklyEarned referralsCount totalTaps level selectedTitle league isSuspicious isFrozen frozenReason createdAt updatedAt'
        ),
      User.countDocuments(filter),
    ]);

    const totalPages = Math.max(Math.ceil(total / limit), 1);

    return res.json({
      users: users.map((user) => ({
        telegramId: user.telegramId,
        username: user.username || user.displayName || 'Spieler',
        telegramUsername: user.telegramUsername || '',
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        displayName: user.displayName || user.username || 'Spieler',
        languageCode: user.languageCode || '',
        photoUrl: user.photoUrl || '',
        telegramProfileUrl: user.telegramUsername
          ? `https://t.me/${String(user.telegramUsername).replace(/^@+/, '')}`
          : '',
        balance: roundOnix(user.balance || 0),
        totalEarned: roundOnix(user.totalEarned || 0),
        weeklyEarned: roundOnix(user.weeklyEarned || 0),
        referralsCount: Number(user.referralsCount || 0),
        totalTaps: Number(user.totalTaps || 0),
        level: Number(user.level || 1),
        selectedTitle: user.selectedTitle || 'ONIX Player',
        league: user.league || getLeagueByTotalEarned(user.totalEarned),
        isSuspicious: Boolean(user.isSuspicious),
        isFrozen: Boolean(user.isFrozen),
        frozenReason: user.frozenReason || '',
        createdAt: user.createdAt || null,
        updatedAt: user.updatedAt || null,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
      query,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ADMIN: USER PROFILE
router.get('/admin-user-profile/:targetTelegramId', async (req, res) => {
  try {
    const secret = req.query.secret ? String(req.query.secret) : '';
    const telegramId = req.query.telegramId ? String(req.query.telegramId) : '';
    const { targetTelegramId } = req.params;

    if (!isAdminRequest(req, secret, telegramId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const user = await User.findOne({ telegramId: targetTelegramId });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    normalizeUserFields(user);

    return res.json({
      user: {
        telegramId: user.telegramId,
        username: user.username || 'Spieler',
        telegramUsername: user.telegramUsername || '',
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        displayName: user.displayName || user.username || 'Spieler',
        languageCode: user.languageCode || 'de',
        photoUrl: user.photoUrl || '',
        telegramProfileUrl: user.telegramUsername
          ? `https://t.me/${String(user.telegramUsername).replace(/^@+/, '')}`
          : '',
        createdAt: user.createdAt || null,
        updatedAt: user.updatedAt || null,
        lastTapAt: user.lastTapAt || null,
        balance: roundOnix(user.balance || 0),
        totalEarned: roundOnix(user.totalEarned || 0),
        weeklyEarned: roundOnix(user.weeklyEarned || 0),
        referralsCount: Number(user.referralsCount || 0),
        totalTaps: Number(user.totalTaps || 0),
        totalBoostsUsed: Number(user.totalBoostsUsed || 0),
        totalUpgradesBought: Number(user.totalUpgradesBought || 0),
        offlineClaimsCount: Number(user.offlineClaimsCount || 0),
        level: Number(user.level || 1),
        energy: Number(user.energy || 0),
        maxEnergy: Number(user.maxEnergy || 0),
        tapPower: Number(user.tapPower || 1),
        energyRecharge: Number(user.energyRecharge || 1),
        autoclickers: Number(user.autoclickers || 0),
        tapLevel: Number(user.tapLevel || 1),
        minerLevel: Number(user.minerLevel || 1),
        energyLevel: Number(user.energyLevel || 1),
        rechargeLevel: Number(user.rechargeLevel || 1),
        completedTasksCount: Array.isArray(user.completedTasks) ? user.completedTasks.length : 0,
        usedPromoCodesCount: Array.isArray(user.usedPromoCodes) ? user.usedPromoCodes.length : 0,
        withdrawalRequestsCount: Array.isArray(user.withdrawalRequests) ? user.withdrawalRequests.length : 0,
        selectedTitle: user.selectedTitle || 'ONIX Player',
        league: user.league || getLeagueByTotalEarned(user.totalEarned),
        isSuspicious: Boolean(user.isSuspicious),
        suspiciousReasons: user.suspiciousReasons || [],
        isFrozen: Boolean(user.isFrozen),
        frozenReason: user.frozenReason || '',
        transactions: (user.transactions || []).slice(0, 20),
        withdrawalRequests: (user.withdrawalRequests || []).slice(0, 10),
        securityLogs: (user.securityLogs || []).slice(0, 50),
        adminNotes: (user.adminNotes || []).slice(0, 20),
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ADMIN: ADJUST USER BALANCE
router.post('/admin-adjust-balance', async (req, res) => {
  try {
    const { secret, telegramId, targetTelegramId, amount, reason } = req.body;

    if (!isAdminRequest(req, secret, telegramId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const delta = Number(amount);

    if (!Number.isFinite(delta) || delta === 0) {
      return res.status(400).json({ message: 'Gib einen gültigen Betrag ein' });
    }

    const user = await User.findOne({ telegramId: targetTelegramId });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    normalizeUserFields(user);

    user.balance = roundOnix(Number(user.balance || 0) + delta);

    if (delta > 0) {
      addEarnings(user, delta);
    }

    addTransaction(
      user,
      'admin_balance_adjustment',
      delta,
      reason ? `Админ корректировка: ${reason}` : 'Админ корректировка баланса',
      'confirmed'
    );

    addSecurityLog(
      user,
      'admin_balance',
      delta > 0 ? 'Guthaben увеличен админом' : 'Guthaben уменьшен админом',
      `${delta > 0 ? '+' : ''}${delta} ONIX. ${reason || ''}`.trim()
    );

    const achievementBonuses = applyAchievements(user);
    const rankBonuses = applyRankBonuses(user);
    user.level = calculateLevel(user.totalEarned);
    user.updatedAt = new Date();

    await user.save();

    return res.json({
      user: {
        telegramId: user.telegramId,
        username: user.username || 'Spieler',
        balance: roundOnix(user.balance || 0),
        totalEarned: roundOnix(user.totalEarned || 0),
        securityLogs: user.securityLogs || [],
      },
      achievementBonuses,
      rankBonuses,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ADMIN: BAN / UNBAN USER
router.post('/admin-ban-user', async (req, res) => {
  try {
    const { secret, telegramId, targetTelegramId, ban, reason } = req.body;

    if (!isAdminRequest(req, secret, telegramId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const user = await User.findOne({ telegramId: targetTelegramId });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    normalizeUserFields(user);

    user.isFrozen = Boolean(ban);
    user.frozenReason = ban ? String(reason || 'Аккаунт заблокирован администратором') : '';

    addSecurityLog(
      user,
      ban ? 'ban' : 'unban',
      ban ? 'Аккаунт заблокирован' : 'Аккаунт разблокирован',
      ban ? user.frozenReason : 'Разблокирован администратором'
    );

    if (ban) {
      addSuspiciousReason(user, user.frozenReason);
    }

    user.updatedAt = new Date();

    await user.save();

    return res.json({
      user: {
        telegramId: user.telegramId,
        username: user.username || 'Spieler',
        isFrozen: Boolean(user.isFrozen),
        frozenReason: user.frozenReason || '',
        securityLogs: user.securityLogs || [],
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ADMIN: SECURITY LOGS
router.get('/admin-security-logs', async (req, res) => {
  try {
    const secret = req.query.secret ? String(req.query.secret) : '';
    const telegramId = req.query.telegramId ? String(req.query.telegramId) : '';

    if (!isAdminRequest(req, secret, telegramId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const users = await User.find({
      'securityLogs.0': { $exists: true },
    })
      .sort({ updatedAt: -1 })
      .limit(100)
      .select('telegramId username securityLogs isFrozen isSuspicious');

    const logs = [];

    users.forEach((user) => {
      (user.securityLogs || []).slice(0, 20).forEach((log) => {
        logs.push({
          telegramId: user.telegramId,
          username: user.username || 'Spieler',
          isFrozen: Boolean(user.isFrozen),
          isSuspicious: Boolean(user.isSuspicious),
          type: log.type || 'info',
          title: log.title || '',
          details: log.details || '',
          createdAt: log.createdAt || 0,
        });
      });
    });

    logs.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));

    return res.json({ logs: logs.slice(0, 100) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ADMIN: LIST SUSPICIOUS USERS
router.get('/admin-suspicious-users', async (req, res) => {
  try {
    const secret = req.query.secret ? String(req.query.secret) : '';
    const telegramId = req.query.telegramId ? String(req.query.telegramId) : '';

    if (!isAdminRequest(req, secret, telegramId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const users = await User.find({
      $or: [
        { isSuspicious: true },
        { isFrozen: true },
      ],
    })
      .sort({ updatedAt: -1 })
      .limit(100)
      .select('telegramId username balance totalEarned weeklyEarned referralsCount totalTaps isSuspicious suspiciousReasons isFrozen frozenReason');

    return res.json({
      users: users.map((user) => ({
        telegramId: user.telegramId,
        username: user.username || 'Spieler',
        balance: roundOnix(user.balance || 0),
        totalEarned: roundOnix(user.totalEarned || 0),
        weeklyEarned: roundOnix(user.weeklyEarned || 0),
        referralsCount: Number(user.referralsCount || 0),
        totalTaps: Number(user.totalTaps || 0),
        isSuspicious: Boolean(user.isSuspicious),
        suspiciousReasons: user.suspiciousReasons || [],
        isFrozen: Boolean(user.isFrozen),
        frozenReason: user.frozenReason || '',
      })),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ADMIN: FREEZE / UNFREEZE USER
router.post('/admin-freeze-user', async (req, res) => {
  try {
    const { secret, telegramId, targetTelegramId, freeze, reason } = req.body;

    if (!isAdminRequest(req, secret, telegramId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const user = await User.findOne({ telegramId: targetTelegramId });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.isFrozen = Boolean(freeze);
    user.frozenReason = freeze ? String(reason || 'Konto eingefroren администратором') : '';
    user.updatedAt = new Date();

    if (freeze) {
      addSuspiciousReason(user, user.frozenReason);
    }

    await user.save();

    return res.json({
      message: freeze ? 'User frozen' : 'User unfrozen',
      user: {
        telegramId: user.telegramId,
        username: user.username || 'Spieler',
        isFrozen: user.isFrozen,
        frozenReason: user.frozenReason,
      },
      referralBonusPaid: typeof referralBonus !== 'undefined' ? referralBonus : null,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ADMIN: LIST WITHDRAWAL REQUESTS
router.get('/admin-withdrawals', async (req, res) => {
  try {
    const secret = req.query.secret ? String(req.query.secret) : '';
    const telegramId = req.query.telegramId ? String(req.query.telegramId) : '';
    const status = req.query.status ? String(req.query.status) : 'pending';

    if (!isAdminRequest(req, secret, telegramId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const users = await User.find({
      'withdrawalRequests.0': { $exists: true },
    }).select(
      'telegramId username balance totalEarned weeklyEarned referralsCount totalTaps totalBoostsUsed totalUpgradesBought ownedPerks completedAchievements withdrawalRequests isSuspicious suspiciousReasons'
    );

    const requests = [];

    users.forEach((user) => {
      user.withdrawalRequests.forEach((request, index) => {
        if (status !== 'all' && request.status !== status) return;

        requests.push({
          userTelegramId: user.telegramId,
          username: user.username || 'Spieler',
          requestIndex: index,
          amount: roundOnix(request.amount || 0),
          eurAmount: roundCurrency(request.eurAmount || 0),
          status: request.status || 'pending',
          adminComment: request.adminComment || '',
          createdAt: request.createdAt || 0,
          reviewedAt: request.reviewedAt || null,
          reviewedBy: request.reviewedBy || '',
          userStats: {
            balance: roundOnix(user.balance || 0),
            totalEarned: roundOnix(user.totalEarned || 0),
            weeklyEarned: roundOnix(user.weeklyEarned || 0),
            referralsCount: Number(user.referralsCount || 0),
            totalTaps: Number(user.totalTaps || 0),
            totalBoostsUsed: Number(user.totalBoostsUsed || 0),
            totalUpgradesBought: Number(user.totalUpgradesBought || 0),
            ownedPerksCount: Array.isArray(user.ownedPerks) ? user.ownedPerks.length : 0,
            achievementsCompleted: Array.isArray(user.completedAchievements) ? user.completedAchievements.length : 0,
            isSuspicious: Boolean(user.isSuspicious),
            suspiciousReasons: user.suspiciousReasons || [],
          },
        });
      });
    });

    requests.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));

    return res.json({ status, requests });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ADMIN: REVIEW WITHDRAWAL REQUEST
router.post('/admin-review-withdrawal', async (req, res) => {
  try {
    const { secret, telegramId, userTelegramId, requestIndex, action, adminComment } = req.body;

    if (!isAdminRequest(req, secret, telegramId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    if (!['approved', 'rejected'].includes(action)) {
      return res.status(400).json({ message: 'Action must be approved or rejected' });
    }

    const user = await User.findOne({ telegramId: userTelegramId });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    normalizeUserFields(user);

    const index = Number(requestIndex);
    const request = user.withdrawalRequests[index];

    if (!request) {
      return res.status(404).json({ message: 'Withdrawal request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Withdrawal request already reviewed' });
    }

    request.status = action;
    request.adminComment = String(adminComment || '');
    request.reviewedAt = Date.now();
    request.reviewedBy = String(telegramId || 'admin');

    if (action === 'rejected') {
      user.balance = roundOnix(Number(user.balance || 0) + Number(request.amount || 0));

      addTransaction(
        user,
        'withdrawal_rejected',
        Number(request.amount || 0),
        request.adminComment
          ? `Вывод отклонён: ${request.adminComment}`
          : 'Вывод отклонён, ONIX возвращены',
        'rejected'
      );
    } else {
      addTransaction(
        user,
        'withdrawal_approved',
        0,
        request.adminComment
          ? `Вывод одобрен: ${request.adminComment}`
          : 'Вывод одобрен',
        'approved'
      );
    }

    user.markModified('withdrawalRequests');
    user.updatedAt = new Date();

    const referralBonus = await tryPayQualifiedReferralBonus(user);

    await user.save();

    return res.json({
      message: `Withdrawal ${action}`,
      user: {
        telegramId: user.telegramId,
        username: user.username || 'Spieler',
        balance: roundOnix(user.balance || 0),
      },
      request,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});





// PUBLIC LAUNCH INFO
router.get('/launch-info', async (req, res) => {
  try {
    const userCount = await User.countDocuments({});

    return res.json({
      ok: true,
      title: 'ONIX COIN',
      status: 'Public beta preparation',
      users: userCount,
      version: APP_VERSION,
      roadmap: [
        'Tap-to-earn core',
        'Seasons and teams',
        'Growth tools',
        'Public beta',
        'Listing preparation',
      ],
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

// PUBLIC APP VERSION
router.get('/version', async (req, res) => {
  return res.json({
    version: APP_VERSION,
    service: 'onix-coin',
    time: Date.now(),
  });
});

// FRONTEND ERROR LOG
router.post('/frontend-error', async (req, res) => {
  try {
    const { telegramId, message, stack, appVersion } = req.body;

    const user = telegramId ? await User.findOne({ telegramId }) : null;

    if (user) {
      normalizeUserFields(user);

      user.frontendErrorLogs.unshift({
        message: String(message || '').slice(0, 500),
        stack: String(stack || '').slice(0, 2000),
        appVersion: String(appVersion || '').slice(0, 50),
        createdAt: Date.now(),
      });

      user.frontendErrorLogs = user.frontendErrorLogs.slice(0, 30);

      addSecurityLog(user, 'frontend_error', 'Frontend error', String(message || '').slice(0, 500));

      await user.save();
    }

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false });
  }
});

// ADMIN: DOWNLOAD JSON BACKUP
router.get('/admin-backup', async (req, res) => {
  try {
    const secret = req.query.secret ? String(req.query.secret) : '';
    const telegramId = req.query.telegramId ? String(req.query.telegramId) : '';

    if (!isAdminRequest(req, secret, telegramId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const users = await User.find({}).lean();
    const weeklyPrizes = await WeeklyPrize.find({}).lean();

    const payload = {
      version: APP_VERSION,
      exportedAt: new Date().toISOString(),
      users,
      weeklyPrizes,
    };

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="onix-backup.json"');

    return res.send(JSON.stringify(payload, null, 2));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ADMIN: FRONTEND ERROR LOGS
router.get('/admin-frontend-errors', async (req, res) => {
  try {
    const secret = req.query.secret ? String(req.query.secret) : '';
    const telegramId = req.query.telegramId ? String(req.query.telegramId) : '';

    if (!isAdminRequest(req, secret, telegramId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const users = await User.find({
      'frontendErrorLogs.0': { $exists: true },
    })
      .limit(100)
      .select('telegramId username frontendErrorLogs');

    const logs = [];

    users.forEach((user) => {
      (user.frontendErrorLogs || []).forEach((log) => {
        logs.push({
          telegramId: user.telegramId,
          username: user.username || 'Spieler',
          message: log.message || '',
          stack: log.stack || '',
          appVersion: log.appVersion || '',
          createdAt: log.createdAt || 0,
        });
      });
    });

    logs.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));

    return res.json({ logs: logs.slice(0, 100) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});


// ADMIN 2.0: GET ECONOMY CONFIG
router.get('/admin-economy-config', async (req, res) => {
  try {
    const secret = req.query.secret ? String(req.query.secret) : '';
    const telegramId = req.query.telegramId ? String(req.query.telegramId) : '';

    if (!isAdminRequest(req, secret, telegramId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    return res.json({
      config: getEconomyConfig(),
      overrides: ECONOMY_OVERRIDES,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ADMIN 2.0: UPDATE ECONOMY CONFIG OVERRIDES
router.post('/admin-economy-config', async (req, res) => {
  try {
    const { secret, telegramId, updates } = req.body;

    if (!isAdminRequest(req, secret, telegramId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const allowed = [
      'ONIX_EUR_PER_1000',
      'MIN_WITHDRAW_ONIX',
      'REFERRAL_REWARD',
      'REFERRED_USER_REWARD',
      'WELCOME_BONUS',
      'CHEST_COST',
      'MAX_PAID_REFERRALS_PER_DAY',
      'MAX_PAID_REFERRALS_PER_HOUR',
      'DAILY_MISSION_BASE_REWARD',
      'WEEKLY_MISSION_BASE_REWARD',
    ];

    Object.entries(updates || {}).forEach(([key, value]) => {
      if (!allowed.includes(key)) return;

      const numberValue = Number(value);

      if (Number.isFinite(numberValue) && numberValue >= 0) {
        ECONOMY_OVERRIDES[key] = numberValue;
      }
    });

    return res.json({
      config: getEconomyConfig(),
      overrides: ECONOMY_OVERRIDES,
      message: 'Runtime config updated',
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ADMIN 2.0: BROADCAST MESSAGE
router.post('/admin-broadcast', async (req, res) => {
  try {
    const { secret, telegramId, message, dryRun } = req.body;

    if (!isAdminRequest(req, secret, telegramId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const text = String(message || '').trim();

    if (!text) {
      return res.status(400).json({ message: 'Введите текст рассылки' });
    }

    const users = await User.find({ telegramId: { $nin: ['', null] } })
      .limit(5000)
      .select('telegramId');

    if (dryRun) {
      return res.json({
        dryRun: true,
        recipients: users.length,
        sent: 0,
        failed: 0,
      });
    }

    const botToken = process.env.BOT_TOKEN;

    if (!botToken) {
      return res.status(400).json({ message: 'BOT_TOKEN не настроен на backend' });
    }

    let sent = 0;
    let failed = 0;

    for (const user of users) {
      try {
        await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          chat_id: user.telegramId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        });

        sent += 1;
      } catch {
        failed += 1;
      }
    }

    return res.json({
      dryRun: false,
      recipients: users.length,
      sent,
      failed,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ADMIN 2.0: EXPORT USERS CSV
router.get('/admin-export-users.csv', async (req, res) => {
  try {
    const secret = req.query.secret ? String(req.query.secret) : '';
    const telegramId = req.query.telegramId ? String(req.query.telegramId) : '';

    if (!isAdminRequest(req, secret, telegramId)) {
      return res.status(403).send('Forbidden');
    }

    const users = await User.find({}).select(
      'telegramId username balance totalEarned weeklyEarned referralsCount totalTaps teamName isFrozen isSuspicious createdAt'
    );

    const escapeCsv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

    const rows = [
      [
        'telegramId',
        'username',
        'balance',
        'totalEarned',
        'weeklyEarned',
        'referralsCount',
        'totalTaps',
        'teamName',
        'isFrozen',
        'isSuspicious',
        'createdAt',
      ],
      ...users.map((user) => [
        user.telegramId,
        user.username || '',
        roundOnix(user.balance || 0),
        roundOnix(user.totalEarned || 0),
        roundOnix(user.weeklyEarned || 0),
        Number(user.referralsCount || 0),
        Number(user.totalTaps || 0),
        user.teamName || '',
        Boolean(user.isFrozen),
        Boolean(user.isSuspicious),
        user.createdAt ? new Date(user.createdAt).toISOString() : '',
      ]),
    ];

    const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="onix-users.csv"');

    return res.send(csv);
  } catch (error) {
    return res.status(500).send(error.message);
  }
});

// ADMIN 2.0: ALL WITHDRAWALS AND TRANSACTIONS
router.get('/admin-operations', async (req, res) => {
  try {
    const secret = req.query.secret ? String(req.query.secret) : '';
    const telegramId = req.query.telegramId ? String(req.query.telegramId) : '';

    if (!isAdminRequest(req, secret, telegramId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const users = await User.find({}).select(
      'telegramId username transactions withdrawalRequests'
    );

    const withdrawals = [];
    const transactions = [];

    users.forEach((user) => {
      (user.withdrawalRequests || []).forEach((request) => {
        withdrawals.push({
          telegramId: user.telegramId,
          username: user.username || 'Spieler',
          ...(typeof request.toObject === 'function' ? request.toObject() : request),
        });
      });

      (user.transactions || []).slice(0, 30).forEach((transaction) => {
        transactions.push({
          telegramId: user.telegramId,
          username: user.username || 'Spieler',
          ...(typeof transaction.toObject === 'function' ? transaction.toObject() : transaction),
        });
      });
    });

    withdrawals.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    transactions.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));

    return res.json({
      withdrawals: withdrawals.slice(0, 200),
      transactions: transactions.slice(0, 300),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ADMIN 2.0: ADD ADMIN NOTE
router.post('/admin-user-note', async (req, res) => {
  try {
    const { secret, telegramId, targetTelegramId, text } = req.body;

    if (!isAdminRequest(req, secret, telegramId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const noteText = String(text || '').trim().slice(0, 500);

    if (!noteText) {
      return res.status(400).json({ message: 'Введите заметку' });
    }

    const user = await User.findOne({ telegramId: targetTelegramId });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    normalizeUserFields(user);

    user.adminNotes.unshift({
      text: noteText,
      adminTelegramId: telegramId,
      createdAt: Date.now(),
    });

    user.adminNotes = user.adminNotes.slice(0, 50);

    addSecurityLog(user, 'admin_note', 'Админская заметка', noteText);

    await user.save();

    return res.json({
      notes: user.adminNotes,
      securityLogs: user.securityLogs || [],
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});


// ADMIN: ECONOMY DASHBOARD
router.get('/admin-economy-dashboard', async (req, res) => {
  try {
    const secret = req.query.secret ? String(req.query.secret) : '';
    const telegramId = req.query.telegramId ? String(req.query.telegramId) : '';

    if (!isAdminRequest(req, secret, telegramId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const users = await User.find({}).select(
      'balance totalEarned weeklyEarned referralsCount totalTaps transactions withdrawalRequests isSuspicious isFrozen'
    );

    const totals = {
      users: users.length,
      frozenUsers: 0,
      suspiciousUsers: 0,
      totalBalance: 0,
      totalEarned: 0,
      weeklyEarned: 0,
      referrals: 0,
      taps: 0,
      pendingWithdrawals: 0,
      pendingWithdrawOnix: 0,
      approvedWithdrawals: 0,
      rejectedWithdrawals: 0,
      createdOnix: 0,
      spentOnix: 0,
    };

    const transactionTypes = {};

    users.forEach((user) => {
      totals.totalBalance += Number(user.balance || 0);
      totals.totalEarned += Number(user.totalEarned || 0);
      totals.weeklyEarned += Number(user.weeklyEarned || 0);
      totals.referrals += Number(user.referralsCount || 0);
      totals.taps += Number(user.totalTaps || 0);

      if (user.isFrozen) totals.frozenUsers += 1;
      if (user.isSuspicious) totals.suspiciousUsers += 1;

      (user.withdrawalRequests || []).forEach((request) => {
        if (request.status === 'pending') {
          totals.pendingWithdrawals += 1;
          totals.pendingWithdrawOnix += Number(request.amount || 0);
        }

        if (request.status === 'approved') totals.approvedWithdrawals += 1;
        if (request.status === 'rejected') totals.rejectedWithdrawals += 1;
      });

      (user.transactions || []).forEach((transaction) => {
        const amount = Number(transaction.amount || 0);
        const type = transaction.type || 'unknown';

        if (!transactionTypes[type]) {
          transactionTypes[type] = {
            count: 0,
            amount: 0,
          };
        }

        transactionTypes[type].count += 1;
        transactionTypes[type].amount += amount;

        if (amount > 0) totals.createdOnix += amount;
        if (amount < 0) totals.spentOnix += Math.abs(amount);
      });
    });

    const rate = getOnixEurRate();

    return res.json({
      economyConfig: getEconomyConfig(),
      totals: {
        ...totals,
        totalBalance: roundOnix(totals.totalBalance),
        totalEarned: roundOnix(totals.totalEarned),
        weeklyEarned: roundOnix(totals.weeklyEarned),
        pendingWithdrawOnix: roundOnix(totals.pendingWithdrawOnix),
        createdOnix: roundOnix(totals.createdOnix),
        spentOnix: roundOnix(totals.spentOnix),
        totalBalanceEur: roundCurrency(totals.totalBalance * rate),
        pendingWithdrawEur: roundCurrency(totals.pendingWithdrawOnix * rate),
      },
      transactionTypes: Object.entries(transactionTypes)
        .map(([type, data]) => ({
          type,
          count: data.count,
          amount: roundOnix(data.amount),
        }))
        .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
        .slice(0, 20),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});



// CLAIM WELCOME BONUS
router.post('/claim-welcome-bonus', requireTelegramMiniAppUser, sensitiveRewardMutationGuard, async (req, res) => {
  try {
    const requestedTelegramId = String(req.body?.telegramId || '');
    const telegramId = req.telegramUserId;

    if (requestedTelegramId && requestedTelegramId !== telegramId) {
      return res.status(403).json({
        message: 'Telegram ID does not match authenticated user',
      });
    }

    const user = await User.findOne({ telegramId });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    normalizeUserFields(user);

    const frozenResponse = ensureUserNotFrozen(user, res);
    if (frozenResponse) return frozenResponse;

    if (user.welcomeBonusClaimed) {
      return res.status(400).json({ message: 'Willkommensbonus bereits erhalten' });
    }

    const reward = getWelcomeBonusAmount();

    user.welcomeBonusClaimed = true;
    user.balance = roundOnix(Number(user.balance || 0) + reward);
    addEarnings(user, reward);

    addTransaction(user, 'income_welcome_bonus', reward, 'Welcome bonus');

    addSecurityLog(user, 'welcome_bonus', 'Welcome bonus claimed', `+${reward} ONIX`);

    const achievementBonuses = applyAchievements(user);
    const rankBonuses = applyRankBonuses(user);
    user.level = calculateLevel(user.totalEarned);
    user.updatedAt = new Date();

    await user.save();

    return res.json({
      user: {
        ...user.toObject({ flattenMaps: true }),
        perkLevels: getPerkLevelsPayload(user),
        achievements: getAchievementsPayload(user),
        referralLimit: getReferralLimitPayload(user),
        missions: getMissionsPayload(user),
      },
      reward,
      achievementBonuses,
      rankBonuses,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// APPLY PROMO CODE
router.post('/apply-promo', requireTelegramMiniAppUser, sensitiveRewardMutationGuard, async (req, res) => {
  try {
    const { code } = req.body;
    const requestedTelegramId = String(req.body?.telegramId || '');
    const telegramId = req.telegramUserId;

    if (requestedTelegramId && requestedTelegramId !== telegramId) {
      return res.status(403).json({
        message: 'Telegram ID does not match authenticated user',
      });
    }

    const cleanCode = String(code || '').trim().toUpperCase();

    if (!cleanCode) {
      return res.status(400).json({ message: 'Gib einen Promocode ein' });
    }

    const promoCodes = getPromoCodesConfig();
    const reward = promoCodes[cleanCode];

    if (!reward) {
      return res.status(400).json({ message: 'Promocode nicht gefunden' });
    }

    const user = await User.findOne({ telegramId });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    normalizeUserFields(user);

    const frozenResponse = ensureUserNotFrozen(user, res);
    if (frozenResponse) return frozenResponse;

    if (user.usedPromoCodes.includes(cleanCode)) {
      return res.status(400).json({ message: 'Du hast diesen Promocode bereits verwendet' });
    }

    user.usedPromoCodes.push(cleanCode);
    user.balance = roundOnix(Number(user.balance || 0) + reward);
    addEarnings(user, reward);

    addTransaction(user, 'income_promo', reward, `Promocode ${cleanCode}`);

    addSecurityLog(user, 'promo', 'Promo code used', `${cleanCode}: +${reward} ONIX`);

    const achievementBonuses = applyAchievements(user);
    const rankBonuses = applyRankBonuses(user);
    user.level = calculateLevel(user.totalEarned);
    user.updatedAt = new Date();

    await user.save();

    return res.json({
      user: {
        ...user.toObject({ flattenMaps: true }),
        perkLevels: getPerkLevelsPayload(user),
        achievements: getAchievementsPayload(user),
        referralLimit: getReferralLimitPayload(user),
        missions: getMissionsPayload(user),
      },
      promo: {
        code: cleanCode,
        reward,
      },
      achievementBonuses,
      rankBonuses,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// PUBLIC HEALTH CHECK
router.get('/health', async (req, res) => {
  try {
    const userCount = await User.countDocuments({});

    return res.json({
      ok: true,
      service: 'onix-coin',
      version: APP_VERSION,
      users: userCount,
      rateLimitBuckets: API_RATE_LIMITS.size,
      week: getWeekKey(),
      time: Date.now(),
      economyConfig: getEconomyConfig(),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

// PUBLIC ECONOMY CONFIG
router.get('/config', async (req, res) => {
  try {
    return res.json(getEconomyConfig());
  } catch (error) {
    return res.status(500).json({
      error: error.message,
    });
  }
});


// TEAM WEEKLY LEADERBOARD
router.get('/leaderboard/teams', async (req, res) => {
  try {
    const currentWeek = getWeekKey();

    const teams = await User.aggregate([
      {
        $match: {
          weeklyEarnedWeek: currentWeek,
          weeklyEarned: { $gt: 0 },
          teamName: { $nin: ['', null] },
        },
      },
      {
        $group: {
          _id: '$teamName',
          weeklyEarned: { $sum: '$weeklyEarned' },
          members: { $sum: 1 },
        },
      },
      { $sort: { weeklyEarned: -1 } },
      { $limit: 20 },
    ]);

    return res.json({
      week: currentWeek,
      teams: teams.map((team, index) => ({
        place: index + 1,
        teamName: team._id,
        weeklyEarned: roundOnix(team.weeklyEarned || 0),
        members: team.members,
      })),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});


// REFERRALS LIST FOR PROFILE
router.get('/referrals/:telegramId', requireTelegramMiniAppUser, async (req, res) => {
  try {
    const requestedTelegramId = String(req.params.telegramId || '');
    const telegramId = req.telegramUserId;

    if (requestedTelegramId && requestedTelegramId !== telegramId) {
      return res.status(403).json({
        message: 'Telegram ID does not match authenticated user',
      });
    }

    if (!telegramId) {
      return res.status(400).json({ message: 'Telegram ID is required' });
    }

    const owner = await User.findOne({ telegramId });

    if (!owner) {
      return res.status(404).json({ message: 'User not found' });
    }

    const referrals = await User.find({ referredBy: telegramId })
      .sort({ createdAt: -1, _id: -1 })
      .limit(100)
      .select('telegramId username selectedTitle totalEarned weeklyEarned totalTaps referralsCount createdAt')
      .lean();

    return res.json({
      referrals: referrals.map((user) => ({
        telegramId: user.telegramId,
        username: user.username || 'ONIX Player',
        selectedTitle: user.selectedTitle || 'ONIX Player',
        rankName: getRankInfo(Number(user.totalEarned || 0)).currentRank.name,
        totalEarned: Number(user.totalEarned || 0),
        weeklyEarned: Number(user.weeklyEarned || 0),
        totalTaps: Number(user.totalTaps || 0),
        referralsCount: Number(user.referralsCount || 0),
        createdAt: user.createdAt ? new Date(user.createdAt).getTime() : 0,
      })),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// WEEKLY LEADERBOARD
router.get('/leaderboard/weekly', async (req, res) => {
  try {
    const currentWeek = getWeekKey();
    const telegramId = req.query.telegramId ? String(req.query.telegramId) : '';

    await User.updateMany(
      {
        weeklyEarnedWeek: { $ne: currentWeek },
      },
      {
        $set: {
          weeklyEarnedWeek: currentWeek,
          weeklyEarned: 0,
        },
      }
    );

    const users = await User.find({})
      .sort({ weeklyEarned: -1 })
      .limit(20)
      .select('telegramId username weeklyEarned totalEarned');

    let currentUserPlace = null;
    let currentUserWeeklyEarned = 0;

    if (telegramId) {
      const currentUser = await User.findOne({ telegramId }).select(
        'weeklyEarned weeklyEarnedWeek'
      );

      if (currentUser) {
        const weeklyEarned = Number(currentUser.weeklyEarned || 0);
        currentUserWeeklyEarned = roundOnix(weeklyEarned);

        const playersAbove = await User.countDocuments({
          weeklyEarnedWeek: currentWeek,
          weeklyEarned: { $gt: weeklyEarned },
        });

        currentUserPlace = playersAbove + 1;
      }
    }

    const seasonEndsAt = getWeekEndTimestamp();

    return res.json({
      week: currentWeek,
      seasonEndsAt,
      secondsUntilSeasonEnd: Math.max(Math.ceil((seasonEndsAt - Date.now()) / 1000), 0),
      currentUserPlace,
      currentUserWeeklyEarned,
      leaderboard: users.map((user, index) => ({
        place: index + 1,
        telegramId: user.telegramId,
        username: user.username || 'Spieler',
        weeklyEarned: roundOnix(user.weeklyEarned || 0),
        totalEarned: roundOnix(user.totalEarned || 0),
      })),
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message,
    });
  }
});


// ALL EXISTING TEAMS FOR PROFILE TEAM PAGE
// IMPORTANT: register before /:telegramId so /teams is not handled as a user id.
router.get('/teams', async (req, res) => {
  try {
    const q = normalizeTeamNameValue(req.query.q || '');
    const normalizedQuery = q.toLowerCase();
    const compactQuery = normalizedQuery.replace(/\s+/g, '');
    const currentWeek = getWeekKey();
    const searchRegex = q ? new RegExp(escapeRegExpValue(q), 'i') : null;

    const matchesTeamQuery = (teamName) => {
      if (!normalizedQuery) return true;
      const name = normalizeTeamNameValue(teamName).toLowerCase();
      const compactName = name.replace(/\s+/g, '');

      return name.includes(normalizedQuery) || compactName.includes(compactQuery);
    };

    const userMatch = {
      teamName: { $nin: ['', null] },
    };

    // Important: saved teams can exist without members after the creator leaves.
    // Fetch them without a strict Mongo regex filter and do the final search in JS,
    // so teams created earlier still appear in search/list even when nobody is inside.
    const [savedTeams, weeklyLeaderboard, userTeams] = await Promise.all([
      listSavedTeams(500),
      User.aggregate([
        {
          $match: {
            weeklyEarnedWeek: currentWeek,
            weeklyEarned: { $gt: 0 },
            teamName: { $nin: ['', null] },
          },
        },
        {
          $group: {
            _id: '$teamName',
            weeklyEarned: { $sum: '$weeklyEarned' },
          },
        },
        { $sort: { weeklyEarned: -1 } },
      ]),
      User.aggregate([
        { $match: userMatch },
        {
          $group: {
            _id: '$teamName',
            members: { $sum: 1 },
            weeklyEarned: { $sum: '$weeklyEarned' },
            totalEarned: { $sum: '$totalEarned' },
            totalTaps: { $sum: '$totalTaps' },
          },
        },
      ]),
    ]);

    const placeByTeam = new Map(
      weeklyLeaderboard.map((team, index) => [String(team._id || '').toLowerCase(), index + 1])
    );

    const teamsByKey = new Map();

    for (const team of savedTeams) {
      const name = getSavedTeamDisplayName(team);
      if (!name || !matchesTeamQuery(name)) continue;
      const key = name.toLowerCase();
      teamsByKey.set(key, {
        teamName: name,
        members: 0,
        weeklyEarned: 0,
        totalEarned: 0,
        totalTaps: 0,
      });
    }

    for (const team of userTeams) {
      const name = normalizeTeamNameValue(team._id);
      if (!name || !matchesTeamQuery(name)) continue;
      const key = name.toLowerCase();
      const existing = teamsByKey.get(key) || { teamName: name };
      teamsByKey.set(key, {
        ...existing,
        teamName: existing.teamName || name,
        members: Number(team.members || 0),
        weeklyEarned: roundOnix(team.weeklyEarned || 0),
        totalEarned: roundOnix(team.totalEarned || 0),
        totalTaps: Number(team.totalTaps || 0),
      });
    }

    const teams = [...teamsByKey.values()]
      .sort((a, b) =>
        Number(b.totalEarned || 0) - Number(a.totalEarned || 0) ||
        Number(b.members || 0) - Number(a.members || 0) ||
        String(a.teamName).localeCompare(String(b.teamName))
      )
      .slice(0, 100);

    return res.json({
      week: currentWeek,
      teams: teams.map((team) => ({
        teamName: team.teamName,
        members: Number(team.members || 0),
        weeklyEarned: roundOnix(team.weeklyEarned || 0),
        totalEarned: roundOnix(team.totalEarned || 0),
        totalTaps: Number(team.totalTaps || 0),
        teamCode: getTeamCode(team.teamName),
        place: placeByTeam.get(String(team.teamName || '').toLowerCase()) || null,
      })),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});


// GET USER
router.get('/:telegramId', requireTelegramMiniAppUser, async (req, res) => {
  try {
    const requestedTelegramId = String(req.params.telegramId || '');
    const telegramId = req.telegramUserId;

    if (requestedTelegramId && requestedTelegramId !== telegramId) {
      return res.status(403).json({
        message: 'Telegram ID does not match authenticated user',
      });
    }

    if (!telegramId) {
      return res.status(400).json({
        message: 'Telegram ID is required',
      });
    }

    const user = await User.findOne({ telegramId });

    if (!user) {
      return res.status(404).json({
        message: 'User not found',
      });
    }

    normalizeUserFields(user);

    const frozenResponse = ensureUserNotFrozen(user, res);
    if (frozenResponse) return frozenResponse;

    const now = Date.now();

    if (
      user.activeBoost &&
      user.activeBoost !== 'none' &&
      Number(user.boostEndTime || 0) <= now
    ) {
      user.activeBoost = 'none';
      user.boostEndTime = 0;
    }

    let offlineIncome = 0;
    let offlineSecondsForPopup = 0;

    const lastSeenAt = user.lastSeenAt || now;
    const offlineSeconds = Math.floor((now - lastSeenAt) / 1000);

    if (offlineSeconds > 0) {
      const offlineEnergy = roundOnix(
        Number(user.energy || 0) +
          Number(user.energyRecharge || DEFAULT_ENERGY_RECHARGE) * offlineSeconds
      );

      user.energy = Math.min(
        Number(user.maxEnergy || DEFAULT_MAX_ENERGY),
        offlineEnergy
      );
    }

    if (
  user.autoclickers > 0 &&
  offlineSeconds > 10 &&
  Number(user.pendingOfflineIncome || 0) <= 0
) {
      const countedSeconds = Math.min(offlineSeconds, getMaxOfflineSeconds(user));

      offlineSecondsForPopup = countedSeconds;
      offlineIncome = roundOnix(getMinerIncome(user) * (countedSeconds / 60));

      if (offlineIncome > 0) {
        user.pendingOfflineIncome += offlineIncome;
        user.pendingOfflineSeconds += offlineSecondsForPopup;
      }
    }

    user.lastOfflineIncome = user.pendingOfflineIncome;
    user.lastOfflineSeconds = user.pendingOfflineSeconds;
    user.lastSeenAt = now;
    user.updatedAt = new Date();

    const referralBonus = await tryPayQualifiedReferralBonus(user);

    await user.save();

    return res.json({
      ...user.toObject({ flattenMaps: true }),
      achievements: getAchievementsPayload(user),
      referralLimit: getReferralLimitPayload(user),
        missions: getMissionsPayload(user),
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message,
    });
  }
});

// APP LANGUAGE
router.post('/language', requireTelegramMiniAppUser, async (req, res) => {
  try {
    const requestedTelegramId = String(req.body?.telegramId || '');
    const telegramId = req.telegramUserId;
    const language = String(req.body?.language || '').toLowerCase();

    if (requestedTelegramId && requestedTelegramId !== telegramId) {
      return res.status(403).json({
        message: 'Telegram ID does not match authenticated user',
      });
    }
    if (!['de', 'en', 'ru', 'uk', 'tr', 'es', 'fr', 'it', 'pl', 'pt'].includes(language)) return res.status(400).json({ message: 'Unsupported language' });

    const user = await User.findOne({ telegramId });
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.appLanguage = language;
    user.updatedAt = new Date();
    await user.save();

    return res.json({ success: true, appLanguage: user.appLanguage });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// CREATE USER
router.post('/create', requireTelegramMiniAppUser, async (req, res) => {
  try {
    const {
      telegramId: bodyTelegramId,
      username: bodyUsername,
      referredBy,
      initData: bodyInitData,
    } = req.body;

    // Step 3: use verified Telegram identity when available, but keep the
    // legacy body fields as a fallback. This deliberately does NOT protect
    // gameplay routes yet, so taps/progress cannot be broken by this step.
    const initData = req.get('x-telegram-init-data') || bodyInitData || '';
    const authResult = initData
      ? validateTelegramInitData(initData, process.env.BOT_TOKEN)
      : { ok: false, user: null };
    const telegramUser = authResult.ok && authResult.user ? authResult.user : null;

    const telegramId = req.telegramUserId;
    if (bodyTelegramId && String(bodyTelegramId) !== telegramId) {
      return res.status(403).json({
        message: 'Telegram ID does not match authenticated user',
      });
    }
    const firstName = String(telegramUser?.first_name || '').trim();
    const lastName = String(telegramUser?.last_name || '').trim();
    const verifiedDisplayName = [firstName, lastName].filter(Boolean).join(' ').trim();
    const displayName = verifiedDisplayName || String(bodyUsername || '').trim() || 'Spieler';

    if (!telegramId) {
      return res.status(400).json({
        message: 'Telegram ID is required',
      });
    }

    let user = await User.findOne({ telegramId });

    if (!user) {
      user = new User({
        telegramId,
        username: displayName,
        telegramUsername: telegramUser?.username || '',
        firstName,
        lastName,
        displayName,
        languageCode: telegramUser?.language_code || '',
        appLanguage: (() => { const l=String(telegramUser?.language_code||'').toLowerCase().split('-')[0]; return ['de','en','ru','uk','tr','es','fr','it','pl','pt'].includes(l) ? l : 'de'; })(),
        photoUrl: telegramUser?.photo_url || '',
        referredBy: referredBy || null,
        completedTasks: [],
        completedAchievements: [],
        ownedPerks: [],
        perkLevels: {},
        chestStats: {
          opened: 0,
          lastReward: '',
        },
        missionStats: {},
        claimedDailyMissions: [],
        claimedWeeklyMissions: [],
        usedPromoCodes: [],
        welcomeBonusClaimed: false,
        lastWithdrawalCheckAt: 0,
        claimedRankBonuses: [],
        transactions: [],
        totalTaps: 0,
        totalBoostsUsed: 0,
        totalUpgradesBought: 0,
        offlineClaimsCount: 0,
        dailyStreak: 0,
        lastDailyClaimDay: null,
        tapTimestamps: [],

        balance: 0,
        energy: DEFAULT_ENERGY,
        maxEnergy: DEFAULT_MAX_ENERGY,
        tapPower: DEFAULT_TAP_POWER,
        energyRecharge: DEFAULT_ENERGY_RECHARGE,
        autoclickers: DEFAULT_MINER_INCOME,

        totalEarned: 0,
        weeklyEarned: 0,
        weeklyEarnedWeek: getWeekKey(),
        level: 1,

        referralsCount: 0,
        dailyReferralBonusCount: 0,
        hourlyReferralBonusCount: 0,
        lastReferralBonusHour: null,
        lastReferralBonusDay: null,
        withdrawalRequests: [],
        seasonBadges: [],
        selectedTitle: 'ONIX Player',
        lastSeenSeasonPrizeWeek: '',
        teamName: '',
        teamJoinedAt: 0,
        teamMissionClaims: [],
        teamPrizeClaims: [],
        league: 'Bronze',
        isSuspicious: false,
        isFrozen: false,
        frozenReason: '',
        suspiciousReasons: [],
        securityLogs: [],
        adminNotes: [],
        frontendErrorLogs: [],

        tapLevel: 1,
        minerLevel: 1,
        energyLevel: 1,
        rechargeLevel: 1,

        lastSeenAt: Date.now(),
        lastMineTickAt: 0,
        lastUpgradeBuyAt: 0,
        lastOfflineIncome: 0,
        lastOfflineSeconds: 0,
        pendingOfflineIncome: 0,
        pendingOfflineSeconds: 0,
        activeBoost: 'none',
        boostEndTime: 0,
      });

      if (referredBy && referredBy !== telegramId) {
        const refUser = await User.findOne({
          telegramId: referredBy,
        });

        if (refUser) {
          normalizeUserFields(refUser);

          const economyConfig = getEconomyConfig();

          refUser.referralsCount += 1;
          incrementMissionStat(refUser, 'weeklyReferrals');
          refUser.lastReferralUsername = displayName || 'neuer Spieler';
          refUser.updatedAt = new Date();

          user.referredByUsername = refUser.username || 'Spielers';

          // Реферальный бонус пригласившему теперь начисляется не сразу,
          // а после активности нового игрока: 100 Taps.
          user.referredByBonusPaid = false;

          user.balance = roundOnix(Number(user.balance || 0) + economyConfig.referredUserReward);
          addEarnings(user, economyConfig.referredUserReward);

          addTransaction(
            user,
            'income_referral',
            economyConfig.referredUserReward,
            'Bonus für Einstieg über Link'
          );

          applyAchievements(user);
          applyRankBonuses(user);
          user.level = calculateLevel(user.totalEarned);

          await refUser.save();
        }
      }

      const referralBonus = await tryPayQualifiedReferralBonus(user);

      await user.save();
    } else {
      normalizeUserFields(user);

      // Only signed initData is allowed to refresh Telegram-specific fields.
      if (telegramUser) {
        user.telegramUsername = telegramUser.username || '';
        user.firstName = firstName;
        user.lastName = lastName;
        user.displayName = displayName;
        user.languageCode = telegramUser.language_code || '';
        if (!['de','en','ru','uk','tr','es','fr','it','pl','pt'].includes(String(user.appLanguage || ''))) { const l=String(telegramUser.language_code||'').toLowerCase().split('-')[0]; user.appLanguage=['de','en','ru','uk','tr','es','fr','it','pl','pt'].includes(l) ? l : 'de'; }
        user.photoUrl = telegramUser.photo_url || '';

        // Keep the legacy display-name field in sync without changing its
        // meaning to @username. This avoids breaking existing screens.
        if (displayName && user.username !== displayName) {
          user.username = displayName;
        }
      } else if (bodyUsername && user.username !== bodyUsername) {
        user.username = bodyUsername;
      }

      user.updatedAt = new Date();

      // ВАЖНО:
      // lastSeenAt здесь НЕ обновляем.
      // Иначе offline income не успеет посчитаться в GET /:telegramId.

      const referralBonus = await tryPayQualifiedReferralBonus(user);

      await user.save();
    }

    return res.json({
      ...user.toObject({ flattenMaps: true }),
      achievements: getAchievementsPayload(user),
      referralLimit: getReferralLimitPayload(user),
      missions: getMissionsPayload(user),
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message,
    });
  }
});

// SAVE USER PROGRESS — SAFE LEGACY ROUTE
// This route is kept only for compatibility.
// Important game economy fields are no longer accepted from frontend.
// Balance, totalEarned, levels, upgrades, boosts and miners are changed only by backend routes.
router.post('/save', requireTelegramMiniAppUser, async (req, res) => {
  try {
    const { data } = req.body;
    const requestedTelegramId = String(req.body?.telegramId || '');
    const telegramId = req.telegramUserId;

    if (requestedTelegramId && requestedTelegramId !== telegramId) {
      return res.status(403).json({
        message: 'Telegram ID does not match authenticated user',
      });
    }

    if (!data) {
      return res.status(400).json({
        message: 'Data is required',
      });
    }

    let user = await User.findOne({ telegramId });

    if (!user) {
      user = new User({
        telegramId,
        completedTasks: [],
        completedAchievements: [],
        ownedPerks: [],
        perkLevels: {},
        chestStats: {
          opened: 0,
          lastReward: '',
        },
        missionStats: {},
        claimedDailyMissions: [],
        claimedWeeklyMissions: [],
        usedPromoCodes: [],
        welcomeBonusClaimed: false,
        lastWithdrawalCheckAt: 0,
        claimedRankBonuses: [],
        transactions: [],
        totalTaps: 0,
        totalBoostsUsed: 0,
        totalUpgradesBought: 0,
        offlineClaimsCount: 0,
        dailyStreak: 0,
        lastDailyClaimDay: null,
        tapTimestamps: [],

        balance: 0,
        energy: DEFAULT_ENERGY,
        maxEnergy: DEFAULT_MAX_ENERGY,
        tapPower: DEFAULT_TAP_POWER,
        energyRecharge: DEFAULT_ENERGY_RECHARGE,
        autoclickers: DEFAULT_MINER_INCOME,

        totalEarned: 0,
        weeklyEarned: 0,
        weeklyEarnedWeek: getWeekKey(),
        level: 1,

        referralsCount: 0,
        dailyReferralBonusCount: 0,
        hourlyReferralBonusCount: 0,
        lastReferralBonusHour: null,
        lastReferralBonusDay: null,
        withdrawalRequests: [],
        seasonBadges: [],
        selectedTitle: 'ONIX Player',
        lastSeenSeasonPrizeWeek: '',
        teamName: '',
        teamJoinedAt: 0,
        teamMissionClaims: [],
        teamPrizeClaims: [],
        league: 'Bronze',
        isSuspicious: false,
        isFrozen: false,
        frozenReason: '',
        suspiciousReasons: [],
        securityLogs: [],
        adminNotes: [],
        frontendErrorLogs: [],

        tapLevel: 1,
        minerLevel: 1,
        energyLevel: 1,
        rechargeLevel: 1,

        lastSeenAt: Date.now(),
        lastMineTickAt: 0,
        lastUpgradeBuyAt: 0,
        lastOfflineIncome: 0,
        lastOfflineSeconds: 0,
        pendingOfflineIncome: 0,
        pendingOfflineSeconds: 0,
        activeBoost: 'none',
        boostEndTime: 0,
      });
    }

    normalizeUserFields(user);

    const safeEnergy = Number(data.energy);

    if (Number.isFinite(safeEnergy)) {
      user.energy = Math.max(
        0,
        Math.min(Number(user.maxEnergy || DEFAULT_MAX_ENERGY), safeEnergy)
      );
    }

    user.updatedAt = new Date();
    user.lastSeenAt = Date.now();

    const referralBonus = await tryPayQualifiedReferralBonus(user);

    await user.save();

    return res.json(user);
  } catch (error) {
    return res.status(500).json({
      error: error.message,
    });
  }
});


// BUY UPGRADE — BACKEND AUTHORITATIVE PURCHASE
router.post('/buy-upgrade', requireTelegramMiniAppUser, async (req, res) => {
  try {
    const { type } = req.body;
    const requestedTelegramId = String(req.body?.telegramId || '');
    const telegramId = req.telegramUserId;

    if (requestedTelegramId && requestedTelegramId !== telegramId) {
      return res.status(403).json({
        message: 'Telegram ID does not match authenticated user',
      });
    }

    const allowedTypes = ['tap', 'energy', 'recharge', 'miner'];

    if (!allowedTypes.includes(type)) {
      return res.status(400).json({
        message: 'Unknown upgrade type',
      });
    }

    const user = await User.findOne({ telegramId });

    if (!user) {
      return res.status(404).json({
        message: 'User not found',
      });
    }

    normalizeUserFields(user);

    const frozenResponse = ensureUserNotFrozen(user, res);
    if (frozenResponse) return frozenResponse;

    const now = Date.now();
    const lastUpgradeBuyAt = Number(user.lastUpgradeBuyAt || 0);
    const elapsedMs = now - lastUpgradeBuyAt;

    if (lastUpgradeBuyAt > 0 && elapsedMs < 500) {
      return res.status(429).json({
        message: 'Upgrade purchase cooldown',
        retryAfterMs: 500 - elapsedMs,
      });
    }

    let cost = 0;

    if (type === 'tap') cost = getTapUpgradeCost(user.tapLevel);
    if (type === 'energy') cost = getEnergyUpgradeCost(user.energyLevel);
    if (type === 'recharge') cost = getRechargeUpgradeCost(user.rechargeLevel);
    if (type === 'miner') cost = getMinerUpgradeCost(user.minerLevel);

    cost = Math.round(cost * getUpgradeDiscountMultiplier(user));

    if (Number(user.balance || 0) < cost) {
      return res.status(400).json({
        message: 'Nicht genug ONIX',
      });
    }

    user.balance = roundOnix(Number(user.balance || 0) - cost);

    const upgradeTitles = {
      tap: 'Tap-Stärke-Upgrade',
      energy: 'Energie-Upgrade',
      recharge: 'Regenerations-Upgrade',
      miner: 'Miner-Upgrade',
    };

    addTransaction(
      user,
      'expense_upgrade',
      -cost,
      upgradeTitles[type] || 'Upgrade-Kauf'
    );

    if (type === 'tap') {
      user.tapLevel = Number(user.tapLevel || 1) + 1;
      user.tapPower = Number(user.tapPower || 1) + 1;
    }

    if (type === 'energy') {
      user.energyLevel = Number(user.energyLevel || 1) + 1;
      user.maxEnergy = getMaxEnergyWithPerks(user);
      user.energy = Math.min(Number(user.energy || 0), Number(user.maxEnergy || DEFAULT_MAX_ENERGY));
    }

    if (type === 'recharge') {
      user.rechargeLevel = Number(user.rechargeLevel || 1) + 1;
      user.energyRecharge = getEnergyRechargeForUser(user);
    }

    if (type === 'miner') {
      user.minerLevel = Number(user.minerLevel || 1) + 1;
      // Keep autoclickers as a legacy/display field. Actual miner income is derived from minerLevel.
      user.autoclickers = Math.max(1, Number(user.minerLevel || 1));
    }

    user.totalUpgradesBought = Number(user.totalUpgradesBought || 0) + 1;
    incrementMissionStat(user, 'dailyUpgrades');
    incrementMissionStat(user, 'weeklyUpgrades');
    const achievementBonuses = applyAchievements(user);
    const rankBonuses = applyRankBonuses(user);
    user.level = calculateLevel(user.totalEarned);

    user.lastUpgradeBuyAt = now;
    user.updatedAt = new Date();
    user.lastSeenAt = now;

    const referralBonus = await tryPayQualifiedReferralBonus(user);

    await user.save();

    return res.json({
      user: {
        ...user.toObject({ flattenMaps: true }),
        perkLevels: getPerkLevelsPayload(user),
        achievements: getAchievementsPayload(user),
        referralLimit: getReferralLimitPayload(user),
        missions: getMissionsPayload(user),
      },
      achievements: getAchievementsPayload(user),
      referralLimit: getReferralLimitPayload(user),
        missions: getMissionsPayload(user),
      achievementBonuses,
      rankBonuses,
      upgrade: {
        type,
        cost,
      },
      referralBonusPaid: typeof referralBonus !== 'undefined' ? referralBonus : null,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message,
    });
  }
});





function addSecurityLog(user, type, title, details = '') {
  if (!user.securityLogs) user.securityLogs = [];
  if (!user.adminNotes) user.adminNotes = [];
  if (!user.frontendErrorLogs) user.frontendErrorLogs = [];

  user.securityLogs.unshift({
    type,
    title,
    details,
    createdAt: Date.now(),
  });

  user.securityLogs = user.securityLogs.slice(0, 100);
}

function addSuspiciousReason(user, reason) {
  if (!user.suspiciousReasons) user.suspiciousReasons = [];
  if (user.referredByBonusPaid === undefined || user.referredByBonusPaid === null) {
    user.referredByBonusPaid = false;
  }
  if (user.referredByQualifiedAt === undefined || user.referredByQualifiedAt === null) {
    user.referredByQualifiedAt = null;
  }
  if (user.isFrozen === undefined || user.isFrozen === null) {
    user.isFrozen = false;
  }
  if (user.frozenReason === undefined || user.frozenReason === null) {
    user.frozenReason = '';
  }

  if (!user.suspiciousReasons.includes(reason)) {
    user.suspiciousReasons.push(reason);
  }

  user.isSuspicious = true;
  addSecurityLog(user, 'suspicious', reason, 'Автоматический флаг подозрительности');
}

function ensureUserNotFrozen(user, res) {
  if (user.isFrozen) {
    return res.status(403).json({
      message: user.frozenReason || 'Konto eingefroren',
    });
  }

  return null;
}

function getRecentSecurityLogCount(user, type, sinceMs) {
  const logs = Array.isArray(user.securityLogs) ? user.securityLogs : [];
  return logs.filter((entry) => {
    return (
      entry &&
      entry.type === type &&
      Number(entry.createdAt || 0) >= Number(sinceMs || 0)
    );
  }).length;
}

function registerTapRateViolation(user, now, details) {
  const since = now - TAP_RATE_VIOLATION_WINDOW_MS;
  const previousViolations = getRecentSecurityLogCount(
    user,
    'tap_rate_limit',
    since
  );

  addSecurityLog(
    user,
    'tap_rate_limit',
    'Tap rate limit exceeded',
    details
  );

  if (previousViolations + 1 >= TAP_RATE_VIOLATIONS_BEFORE_FLAG) {
    addSuspiciousReason(
      user,
      'Repeated impossible tap speed detected'
    );
  }
}

function isReferralQualified(user) {
  // Важно: НЕ используем totalEarned/balance для проверки,
  // потому что новый игрок получает стартовый бонус 15 000 ONIX по реферальной ссылке.
  // Иначе пригласивший получит большой бонус сразу.
  return Number(user.totalTaps || 0) >= 100;
}

async function tryPayQualifiedReferralBonus(user) {
  if (!user.referredBy || user.referredByBonusPaid) return null;
  if (!isReferralQualified(user)) return null;

  const refUser = await User.findOne({
    telegramId: user.referredBy,
  });

  if (!refUser) {
    user.referredByBonusPaid = true;
    return null;
  }

  normalizeUserFields(refUser);

  const now = Date.now();
  const economyConfig = getEconomyConfig();

  if (!canReceivePaidReferralBonus(refUser, now)) {
    addSuspiciousReason(refUser, 'referral_bonus_limit_reached');
    refUser.updatedAt = new Date();
    await refUser.save();
    return null;
  }

  refUser.dailyReferralBonusCount = Number(refUser.dailyReferralBonusCount || 0) + 1;
  refUser.hourlyReferralBonusCount = Number(refUser.hourlyReferralBonusCount || 0) + 1;
  const referralReward = getReferralRewardForUser(refUser);

  refUser.balance = roundOnix(
    Number(refUser.balance || 0) + referralReward
  );
  addEarnings(refUser, referralReward);
  refUser.lastReferralUsername = user.username || 'neuer Spieler';

  addTransaction(
    refUser,
    'income_referral',
    referralReward,
    `Empfehlungsbonus für aktiven Freund: ${user.username || 'neuer Spieler'}`
  );

  applyAchievements(refUser);
  applyRankBonuses(refUser);
  refUser.level = calculateLevel(refUser.totalEarned);
  refUser.updatedAt = new Date();

  user.referredByBonusPaid = true;
  user.referredByQualifiedAt = now;

  await refUser.save();

  return {
    referrerTelegramId: refUser.telegramId,
    referrerUsername: refUser.username || 'Spieler',
    reward: referralReward,
  };
}



function getLeagueByTotalEarned(totalEarned) {
  const earned = Number(totalEarned || 0);

  if (earned >= 5000000) return 'Diamond';
  if (earned >= 1500000) return 'Gold';
  if (earned >= 500000) return 'Silver';

  return 'Bronze';
}

function getSeasonPrizeByPlace(place) {
  if (place === 1) return 100000;
  if (place === 2) return 60000;
  if (place === 3) return 40000;
  if (place >= 4 && place <= 10) return 15000;
  if (place >= 11 && place <= 50) return 5000;

  return 0;
}

function getSeasonBadgeByPlace(place) {
  if (place === 1) return 'Season Winner';
  if (place === 2) return 'Season Top 2';
  if (place === 3) return 'Season Top 3';
  if (place <= 10) return 'Season Top 10';
  if (place <= 50) return 'Season Top 50';

  return '';
}


// ALL EXISTING TEAMS FOR PROFILE TEAM PAGE
router.get('/teams', async (req, res) => {
  try {
    const q = normalizeTeamNameValue(req.query.q || '');
    const normalizedQuery = q.toLowerCase();
    const compactQuery = normalizedQuery.replace(/\s+/g, '');
    const currentWeek = getWeekKey();
    const searchRegex = q ? new RegExp(escapeRegExpValue(q), 'i') : null;

    const matchesTeamQuery = (teamName) => {
      if (!normalizedQuery) return true;
      const name = normalizeTeamNameValue(teamName).toLowerCase();
      const compactName = name.replace(/\s+/g, '');

      return name.includes(normalizedQuery) || compactName.includes(compactQuery);
    };

    const userMatch = {
      teamName: { $nin: ['', null] },
    };

    // Important: saved teams can exist without members after the creator leaves.
    // Fetch them without a strict Mongo regex filter and do the final search in JS,
    // so teams created earlier still appear in search/list even when nobody is inside.
    const [savedTeams, weeklyLeaderboard, userTeams] = await Promise.all([
      listSavedTeams(500),
      User.aggregate([
        {
          $match: {
            weeklyEarnedWeek: currentWeek,
            weeklyEarned: { $gt: 0 },
            teamName: { $nin: ['', null] },
          },
        },
        {
          $group: {
            _id: '$teamName',
            weeklyEarned: { $sum: '$weeklyEarned' },
          },
        },
        { $sort: { weeklyEarned: -1 } },
      ]),
      User.aggregate([
        { $match: userMatch },
        {
          $group: {
            _id: '$teamName',
            members: { $sum: 1 },
            weeklyEarned: { $sum: '$weeklyEarned' },
            totalEarned: { $sum: '$totalEarned' },
            totalTaps: { $sum: '$totalTaps' },
          },
        },
      ]),
    ]);

    const placeByTeam = new Map(
      weeklyLeaderboard.map((team, index) => [String(team._id || '').toLowerCase(), index + 1])
    );

    const teamsByKey = new Map();

    for (const team of savedTeams) {
      const name = getSavedTeamDisplayName(team);
      if (!name || !matchesTeamQuery(name)) continue;
      const key = name.toLowerCase();
      teamsByKey.set(key, {
        teamName: name,
        members: 0,
        weeklyEarned: 0,
        totalEarned: 0,
        totalTaps: 0,
      });
    }

    for (const team of userTeams) {
      const name = normalizeTeamNameValue(team._id);
      if (!name || !matchesTeamQuery(name)) continue;
      const key = name.toLowerCase();
      const existing = teamsByKey.get(key) || { teamName: name };
      teamsByKey.set(key, {
        ...existing,
        teamName: existing.teamName || name,
        members: Number(team.members || 0),
        weeklyEarned: roundOnix(team.weeklyEarned || 0),
        totalEarned: roundOnix(team.totalEarned || 0),
        totalTaps: Number(team.totalTaps || 0),
      });
    }

    const teams = [...teamsByKey.values()]
      .sort((a, b) =>
        Number(b.totalEarned || 0) - Number(a.totalEarned || 0) ||
        Number(b.members || 0) - Number(a.members || 0) ||
        String(a.teamName).localeCompare(String(b.teamName))
      )
      .slice(0, 100);

    return res.json({
      week: currentWeek,
      teams: teams.map((team) => ({
        teamName: team.teamName,
        members: Number(team.members || 0),
        weeklyEarned: roundOnix(team.weeklyEarned || 0),
        totalEarned: roundOnix(team.totalEarned || 0),
        totalTaps: Number(team.totalTaps || 0),
        teamCode: getTeamCode(team.teamName),
        place: placeByTeam.get(String(team.teamName || '').toLowerCase()) || null,
      })),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});


// SET TEAM NAME
router.post('/set-team', requireTelegramMiniAppUser, async (req, res) => {
  try {
    const { teamName } = req.body;
    const requestedTelegramId = String(req.body?.telegramId || '');
    const telegramId = req.telegramUserId;

    if (requestedTelegramId && requestedTelegramId !== telegramId) {
      return res.status(403).json({
        message: 'Telegram ID does not match authenticated user',
      });
    }

    const cleanTeamName = String(teamName || '').trim().slice(0, 24);

    if (!cleanTeamName) {
      return res.status(400).json({ message: 'Gib einen Teamnamen ein' });
    }

    const user = await User.findOne({ telegramId });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    normalizeUserFields(user);

    const frozenResponse = ensureUserNotFrozen(user, res);
    if (frozenResponse) return frozenResponse;

    user.teamName = cleanTeamName;
    if (!user.teamJoinedAt) user.teamJoinedAt = Date.now();
    user.updatedAt = new Date();

    addSecurityLog(user, 'team_legacy_set', 'Legacy set-team redirected to saved team', cleanTeamName);

    await upsertSavedTeam(cleanTeamName, telegramId);
    await user.save();

    return res.json({
      user: {
        ...user.toObject({ flattenMaps: true }),
        perkLevels: getPerkLevelsPayload(user),
        achievements: getAchievementsPayload(user),
        referralLimit: getReferralLimitPayload(user),
        missions: getMissionsPayload(user),
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});


// CREATE TEAM
router.post('/create-team', requireTelegramMiniAppUser, async (req, res) => {
  try {
    const { teamName } = req.body;
    const requestedTelegramId = String(req.body?.telegramId || '');
    const telegramId = req.telegramUserId;

    if (requestedTelegramId && requestedTelegramId !== telegramId) {
      return res.status(403).json({
        message: 'Telegram ID does not match authenticated user',
      });
    }

    const cleanTeamName = normalizeTeamNameValue(teamName);

    if (cleanTeamName.length < 2) {
      return res.status(400).json({ message: 'Gib einen Teamnamen mit mindestens 2 Zeichen ein' });
    }

    const existingTeamMember = await User.findOne({
      teamName: { $regex: new RegExp(`^${escapeRegExpValue(cleanTeamName)}$`, 'i') },
    }).select('teamName');

    const existingSavedTeam = await findSavedTeamByName(cleanTeamName);

    if (existingTeamMember || existingSavedTeam) {
      return res.status(409).json({ message: 'Ein Team mit diesem Namen existiert bereits' });
    }

    const user = await User.findOne({ telegramId });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    normalizeUserFields(user);

    const frozenResponse = ensureUserNotFrozen(user, res);
    if (frozenResponse) return frozenResponse;

    user.teamName = cleanTeamName;
    user.teamJoinedAt = Date.now();
    user.updatedAt = new Date();

    addSecurityLog(user, 'team_create', 'Создание команды', cleanTeamName);

    await upsertSavedTeam(cleanTeamName, telegramId);

    await user.save();

    const teamContest = await getTeamContestPayload(user);

    return res.json({
      user: {
        ...user.toObject({ flattenMaps: true }),
        perkLevels: getPerkLevelsPayload(user),
        achievements: getAchievementsPayload(user),
        referralLimit: getReferralLimitPayload(user),
        missions: getMissionsPayload(user),
      },
      team: await getTeamStats(cleanTeamName),
      teamMissions: await getTeamMissionsPayload(user),
      teamPrize: teamContest.completedPrize || 0,
      teamContest,
      week: getWeekKey(),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});


// JOIN TEAM BY CODE
router.post('/join-team', requireTelegramMiniAppUser, async (req, res) => {
  try {
    const { teamCode, teamName } = req.body;
    const requestedTelegramId = String(req.body?.telegramId || '');
    const telegramId = req.telegramUserId;

    if (requestedTelegramId && requestedTelegramId !== telegramId) {
      return res.status(403).json({
        message: 'Telegram ID does not match authenticated user',
      });
    }

    const cleanTeamName = String(teamName || decodeTeamCode(teamCode) || '')
      .trim()
      .slice(0, 24);

    if (!cleanTeamName) {
      return res.status(400).json({ message: 'Team nicht gefunden' });
    }

    const user = await User.findOne({ telegramId });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    normalizeUserFields(user);

    const frozenResponse = ensureUserNotFrozen(user, res);
    if (frozenResponse) return frozenResponse;

    user.teamName = cleanTeamName;
    user.teamJoinedAt = Date.now();
    user.updatedAt = new Date();

    addSecurityLog(user, 'team_join', 'Вступление в команду', cleanTeamName);

    await upsertSavedTeam(cleanTeamName);

    await user.save();

    return res.json({
      user: {
        ...user.toObject({ flattenMaps: true }),
        perkLevels: getPerkLevelsPayload(user),
        achievements: getAchievementsPayload(user),
        referralLimit: getReferralLimitPayload(user),
        missions: getMissionsPayload(user),
      },
      team: await getTeamStats(cleanTeamName),
      teamMissions: await getTeamMissionsPayload(user),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});


// LEAVE TEAM
router.post('/leave-team', requireTelegramMiniAppUser, async (req, res) => {
  try {
    const requestedTelegramId = String(req.body?.telegramId || '');
    const telegramId = req.telegramUserId;

    if (requestedTelegramId && requestedTelegramId !== telegramId) {
      return res.status(403).json({
        message: 'Telegram ID does not match authenticated user',
      });
    }

    const user = await User.findOne({ telegramId });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    normalizeUserFields(user);

    const frozenResponse = ensureUserNotFrozen(user, res);
    if (frozenResponse) return frozenResponse;

    const oldTeamName = user.teamName || '';
    user.teamName = '';
    user.teamJoinedAt = null;
    user.updatedAt = new Date();

    addSecurityLog(user, 'team_leave', 'Выход из команды', oldTeamName || 'Без команды');

    await user.save();

    return res.json({
      user: {
        ...user.toObject({ flattenMaps: true }),
        perkLevels: getPerkLevelsPayload(user),
        achievements: getAchievementsPayload(user),
        referralLimit: getReferralLimitPayload(user),
        missions: getMissionsPayload(user),
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// TEAM SOCIAL DASHBOARD
router.get('/team-dashboard/:telegramId', requireTelegramMiniAppUser, async (req, res) => {
  try {
    const requestedTelegramId = String(req.params.telegramId || '');
    const telegramId = req.telegramUserId;

    if (requestedTelegramId && requestedTelegramId !== telegramId) {
      return res.status(403).json({
        message: 'Telegram ID does not match authenticated user',
      });
    }

    const user = await User.findOne({ telegramId });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    normalizeUserFields(user);

    const team = await getTeamStats(user.teamName);
    const teamMissions = await getTeamMissionsPayload(user);
    const teamContest = await getTeamContestPayload(user);

    return res.json({
      team: {
        ...team,
        place: teamContest.activeTeamPlace || team.place,
        weeklyEarned: teamContest.activeTeamWeeklyEarned || team.weeklyEarned,
      },
      teamMissions,
      teamPrize: teamContest.prize,
      teamContest,
      week: teamContest.activeWeek,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// CLAIM TEAM MISSION
router.post('/claim-team-mission', requireTelegramMiniAppUser, sensitiveRewardMutationGuard, async (req, res) => {
  try {
    const { missionId } = req.body;
    const requestedTelegramId = String(req.body?.telegramId || '');
    const telegramId = req.telegramUserId;

    if (requestedTelegramId && requestedTelegramId !== telegramId) {
      return res.status(403).json({
        message: 'Telegram ID does not match authenticated user',
      });
    }

    const user = await User.findOne({ telegramId });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    normalizeUserFields(user);

    const frozenResponse = ensureUserNotFrozen(user, res);
    if (frozenResponse) return frozenResponse;

    if (!user.teamName) {
      return res.status(400).json({ message: 'Tritt zuerst einem Team bei' });
    }

    const missions = await getTeamMissionsPayload(user);
    const mission = missions.find((item) => item.id === missionId);

    if (!mission) {
      return res.status(404).json({ message: 'Team-Aufgabe nicht gefunden' });
    }

    if (!mission.isCompleted) {
      return res.status(400).json({ message: 'Team-Aufgabe ist noch nicht erledigt' });
    }

    const claimKey = `${getWeekKey()}_${mission.id}`;

    if (user.teamMissionClaims.includes(claimKey)) {
      return res.status(400).json({ message: 'Belohnung bereits erhalten' });
    }

    user.teamMissionClaims.push(claimKey);
    user.balance = roundOnix(Number(user.balance || 0) + mission.reward);
    addEarnings(user, mission.reward);
    addTransaction(user, 'income_team_mission', mission.reward, `Team-Aufgabe: ${mission.title}`);

    const achievementBonuses = applyAchievements(user);
    const rankBonuses = applyRankBonuses(user);
    user.level = calculateLevel(user.totalEarned);
    user.updatedAt = new Date();

    await user.save();

    return res.json({
      user: {
        ...user.toObject({ flattenMaps: true }),
        perkLevels: getPerkLevelsPayload(user),
        achievements: getAchievementsPayload(user),
        referralLimit: getReferralLimitPayload(user),
        missions: getMissionsPayload(user),
      },
      teamMissions: await getTeamMissionsPayload(user),
      reward: {
        title: mission.title,
        amount: mission.reward,
      },
      achievementBonuses,
      rankBonuses,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// CLAIM TEAM WEEKLY PRIZE
router.post('/claim-team-prize', requireTelegramMiniAppUser, sensitiveRewardMutationGuard, async (req, res) => {
  try {
    const requestedTelegramId = String(req.body?.telegramId || '');
    const telegramId = req.telegramUserId;

    if (requestedTelegramId && requestedTelegramId !== telegramId) {
      return res.status(403).json({
        message: 'Telegram ID does not match authenticated user',
      });
    }

    const user = await User.findOne({ telegramId });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    normalizeUserFields(user);

    const frozenResponse = ensureUserNotFrozen(user, res);
    if (frozenResponse) return frozenResponse;

    if (!user.teamName) {
      return res.status(400).json({ message: 'Tritt zuerst einem Team bei' });
    }

    const teamContest = await getTeamContestPayload(user);
    const team = await getTeamStats(user.teamName);
    const prize = Number(teamContest.prize || 0);
    const claimKey = teamContest.claimKey;

    if (teamContest.joinedAfterCompletedContest) {
      return res.status(400).json({
        message: 'Du bist dem Team nach Ende des letzten Wettbewerbs beigetreten',
        teamContest,
      });
    }

    if (!prize || !teamContest.completedTeamPlace) {
      return res.status(400).json({
        message: 'Das Team hat am letzten Wettbewerb nicht teilgenommen',
        teamContest,
      });
    }

    if (user.teamPrizeClaims.includes(claimKey)) {
      return res.status(400).json({
        message: 'Team-Preis bereits erhalten',
        teamContest,
      });
    }

    user.teamPrizeClaims.push(claimKey);
    user.balance = roundOnix(Number(user.balance || 0) + prize);
    addEarnings(user, prize);
    addTransaction(
      user,
      'income_team_prize',
      prize,
      `Team-Wettbewerb ${teamContest.completedWeek}: ${teamContest.rewardTitle} (${user.teamName})`
    );

    const achievementBonuses = applyAchievements(user);
    const rankBonuses = applyRankBonuses(user);
    user.level = calculateLevel(user.totalEarned);
    user.updatedAt = new Date();

    await user.save();

    const updatedContest = await getTeamContestPayload(user);

    return res.json({
      user: {
        ...user.toObject({ flattenMaps: true }),
        perkLevels: getPerkLevelsPayload(user),
        achievements: getAchievementsPayload(user),
        referralLimit: getReferralLimitPayload(user),
        missions: getMissionsPayload(user),
      },
      team,
      prize,
      teamContest: updatedContest,
      achievementBonuses,
      rankBonuses,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// FRIENDS LEADERBOARD
router.get('/friends-leaderboard/:telegramId', requireTelegramMiniAppUser, async (req, res) => {
  try {
    const requestedTelegramId = String(req.params.telegramId || '');
    const telegramId = req.telegramUserId;

    if (requestedTelegramId && requestedTelegramId !== telegramId) {
      return res.status(403).json({
        message: 'Telegram ID does not match authenticated user',
      });
    }

    const users = await User.find({
      $or: [{ referredBy: telegramId }, { telegramId }],
    })
      .sort({ totalEarned: -1 })
      .limit(30)
      .select('telegramId username totalEarned weeklyEarned referralsCount');

    return res.json({
      friends: users.map((user, index) => ({
        place: index + 1,
        telegramId: user.telegramId,
        username: user.username || 'Spieler',
        totalEarned: roundOnix(user.totalEarned || 0),
        weeklyEarned: roundOnix(user.weeklyEarned || 0),
        referralsCount: Number(user.referralsCount || 0),
        isMe: String(user.telegramId) === String(telegramId),
      })),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// SELECT PROFILE TITLE
router.post('/select-title', requireTelegramMiniAppUser, async (req, res) => {
  try {
    const { title } = req.body;
    const requestedTelegramId = String(req.body?.telegramId || '');
    const telegramId = req.telegramUserId;

    if (requestedTelegramId && requestedTelegramId !== telegramId) {
      return res.status(403).json({
        message: 'Telegram ID does not match authenticated user',
      });
    }

    const allowedTitles = [
      'ONIX Player',
      'Tap Master',
      'Miner',
      'Referral Master',
      'Season Hunter',
      'Diamond',
      'Boost Master',
      'Perk Collector',
    ];

    if (!allowedTitles.includes(title)) {
      return res.status(400).json({ message: 'Titel nicht verfügbar' });
    }

    const user = await User.findOne({ telegramId });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    normalizeUserFields(user);

    user.selectedTitle = title;
    user.updatedAt = new Date();

    await user.save();

    return res.json({
      user: {
        ...user.toObject({ flattenMaps: true }),
        perkLevels: getPerkLevelsPayload(user),
        achievements: getAchievementsPayload(user),
        referralLimit: getReferralLimitPayload(user),
        missions: getMissionsPayload(user),
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// REQUEST WITHDRAWAL — creates a pending withdrawal request
router.post('/request-withdrawal', requireTelegramMiniAppUser, async (req, res) => {
  try {
    const { amount, withdrawalCheck } = req.body;
    const requestedTelegramId = String(req.body?.telegramId || '');
    const telegramId = req.telegramUserId;

    if (requestedTelegramId && requestedTelegramId !== telegramId) {
      return res.status(403).json({
        message: 'Telegram ID does not match authenticated user',
      });
    }

    const economyConfig = getEconomyConfig();
    const withdrawAmount = roundOnix(Number(amount || economyConfig.minWithdrawOnix));

    if (withdrawAmount < economyConfig.minWithdrawOnix) {
      return res.status(400).json({
        message: `Mindestauszahlung ${economyConfig.minWithdrawOnix} ONIX`,
      });
    }

    const user = await User.findOne({ telegramId });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    normalizeUserFields(user);

    const frozenResponse = ensureUserNotFrozen(user, res);
    if (frozenResponse) return frozenResponse;

    const hasPendingWithdrawal = user.withdrawalRequests.some(
      (request) => request.status === 'pending'
    );

    if (hasPendingWithdrawal) {
      return res.status(400).json({
        message: 'Du hast bereits einen Auszahlungsantrag in Bearbeitung',
      });
    }

    const lastWithdrawal = user.withdrawalRequests[0];
    const withdrawalCooldownMs = 24 * 60 * 60 * 1000;

    if (
      lastWithdrawal &&
      Date.now() - Number(lastWithdrawal.createdAt || 0) < withdrawalCooldownMs
    ) {
      return res.status(400).json({
        message: 'Ein Auszahlungsantrag ist höchstens einmal alle 24 Stunden möglich',
      });
    }

    if (Number(user.balance || 0) < withdrawAmount) {
      return res.status(400).json({ message: 'Nicht genug ONIX für Auszahlung' });
    }

    user.balance = roundOnix(Number(user.balance || 0) - withdrawAmount);

    const eurAmount = roundCurrency(withdrawAmount * getOnixEurRate());

    user.withdrawalRequests.unshift({
      amount: withdrawAmount,
      eurAmount,
      status: 'pending',
      createdAt: Date.now(),
    });

    user.withdrawalRequests = user.withdrawalRequests.slice(0, 20);

    addTransaction(
      user,
      'withdrawal_pending',
      -withdrawAmount,
      `Auszahlungsantrag ≈ ${eurAmount}€`,
      'pending'
    );

    user.updatedAt = new Date();
    await user.save();

    return res.json({
      user: {
        ...user.toObject({ flattenMaps: true }),
        perkLevels: getPerkLevelsPayload(user),
        achievements: getAchievementsPayload(user),
        referralLimit: getReferralLimitPayload(user),
        missions: getMissionsPayload(user),
      },
      withdrawal: user.withdrawalRequests[0],
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// BUY PERK — ONE-TIME PERMANENT BONUSES
router.post('/buy-perk', requireTelegramMiniAppUser, async (req, res) => {
  try {
    const { perkId } = req.body;
    const requestedTelegramId = String(req.body?.telegramId || '');
    const telegramId = req.telegramUserId;

    if (requestedTelegramId && requestedTelegramId !== telegramId) {
      return res.status(403).json({
        message: 'Telegram ID does not match authenticated user',
      });
    }

    const perk = PERKS[perkId];

    if (!perk) {
      return res.status(400).json({
        message: 'Unknown perk',
      });
    }

    const user = await User.findOne({ telegramId });

    if (!user) {
      return res.status(404).json({
        message: 'User not found',
      });
    }

    normalizeUserFields(user);

    const frozenResponse = ensureUserNotFrozen(user, res);
    if (frozenResponse) return frozenResponse;

    const currentLevel = getPerkLevel(user, perk.id);
    const nextLevel = currentLevel + 1;

    if (currentLevel >= perk.maxLevel) {
      return res.status(400).json({
        message: 'Perk ist bereits auf Maximallevel',
      });
    }

    const cost = getPerkCost(perk.id, nextLevel);

    if (Number(user.balance || 0) < cost) {
      return res.status(400).json({
        message: 'Nicht genug ONIX',
      });
    }

    user.balance = roundOnix(Number(user.balance || 0) - cost);
    setPerkLevel(user, perk.id, nextLevel);

    if (!user.ownedPerks.includes(perk.id)) {
      user.ownedPerks.push(perk.id);
    }

    if (perk.id === 'energy_max_pro') {
      user.maxEnergy = getMaxEnergyWithPerks(user);
      user.energy = Math.min(Number(user.energy || 0), Number(user.maxEnergy || DEFAULT_MAX_ENERGY));
    }

    addTransaction(
      user,
      'expense_perk',
      -cost,
      `Perk: ${perk.title} Lvl. ${nextLevel}`
    );

    const achievementBonuses = applyAchievements(user);
    user.updatedAt = new Date();
    user.lastSeenAt = Date.now();

    await user.save();

    return res.json({
      user: {
        ...user.toObject({ flattenMaps: true }),
        perkLevels: getPerkLevelsPayload(user),
        achievements: getAchievementsPayload(user),
        referralLimit: getReferralLimitPayload(user),
        missions: getMissionsPayload(user),
      },
      perk: {
        id: perk.id,
        title: perk.title,
        cost,
        level: nextLevel,
        maxLevel: perk.maxLevel,
      },
      achievementBonuses,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message,
    });
  }
});

// OPEN CHEST — RANDOM SHOP REWARD
router.post('/open-chest', requireTelegramMiniAppUser, sensitiveRewardMutationGuard, async (req, res) => {
  try {
    const requestedTelegramId = String(req.body?.telegramId || '');
    const telegramId = req.telegramUserId;

    if (requestedTelegramId && requestedTelegramId !== telegramId) {
      return res.status(403).json({
        message: 'Telegram ID does not match authenticated user',
      });
    }

    const user = await User.findOne({ telegramId });

    if (!user) {
      return res.status(404).json({
        message: 'User not found',
      });
    }

    normalizeUserFields(user);

    const frozenResponse = ensureUserNotFrozen(user, res);
    if (frozenResponse) return frozenResponse;

    const chestCost = getEconomyConfig().chestCost;

    if (Number(user.balance || 0) < chestCost) {
      return res.status(400).json({
        message: 'Nicht genug ONIX',
      });
    }

    const roll = Math.random();
    let rewardAmount = 0;
    let rewardTitle = '';

    if (roll < 0.45) {
      rewardAmount = 15000;
      rewardTitle = 'Truhe: kleiner Bonus';
    } else if (roll < 0.75) {
      rewardAmount = 40000;
      rewardTitle = 'Truhe: guter Bonus';
    } else if (roll < 0.93) {
      rewardAmount = 75000;
      rewardTitle = 'Truhe: seltener Bonus';
    } else {
      rewardAmount = 150000;
      rewardTitle = 'Truhe: Jackpot';
    }

    user.balance = roundOnix(Number(user.balance || 0) - chestCost);
    addTransaction(user, 'expense_chest', -chestCost, 'Truhe geöffnet');

    user.balance = roundOnix(Number(user.balance || 0) + rewardAmount);
    addEarnings(user, rewardAmount);
    addTransaction(user, 'income_chest', rewardAmount, rewardTitle);

    user.chestStats = {
      opened: Number(user.chestStats?.opened || 0) + 1,
      lastReward: `${rewardTitle}: +${rewardAmount} ONIX`,
    };
    incrementMissionStat(user, 'dailyChests');
    incrementMissionStat(user, 'weeklyChests');

    const achievementBonuses = applyAchievements(user);
    const rankBonuses = applyRankBonuses(user);
    user.level = calculateLevel(user.totalEarned);
    user.updatedAt = new Date();
    user.lastSeenAt = Date.now();

    await user.save();

    return res.json({
      user: {
        ...user.toObject({ flattenMaps: true }),
        perkLevels: getPerkLevelsPayload(user),
        achievements: getAchievementsPayload(user),
        referralLimit: getReferralLimitPayload(user),
        missions: getMissionsPayload(user),
      },
      chest: {
        cost: chestCost,
        rewardAmount,
        rewardTitle,
      },
      achievementBonuses,
      rankBonuses,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message,
    });
  }
});


// MISSIONS PAYLOAD
router.get('/missions/:telegramId', requireTelegramMiniAppUser, async (req, res) => {
  try {
    const requestedTelegramId = String(req.params.telegramId || '');
    const telegramId = req.telegramUserId;

    if (requestedTelegramId && requestedTelegramId !== telegramId) {
      return res.status(403).json({
        message: 'Telegram ID does not match authenticated user',
      });
    }

    const user = await User.findOne({ telegramId });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    normalizeUserFields(user);
    await user.save();

    return res.json(getMissionsPayload(user));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// CLAIM DAILY / WEEKLY MISSION
router.post('/claim-mission', requireTelegramMiniAppUser, sensitiveRewardMutationGuard, async (req, res) => {
  try {
    const { missionId, missionType } = req.body;
    const requestedTelegramId = String(req.body?.telegramId || '');
    const telegramId = req.telegramUserId;

    if (requestedTelegramId && requestedTelegramId !== telegramId) {
      return res.status(403).json({
        message: 'Telegram ID does not match authenticated user',
      });
    }

    if (!missionId || !['daily', 'weekly'].includes(missionType)) {
      return res.status(400).json({ message: 'Mission data is required' });
    }

    const user = await User.findOne({ telegramId });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    normalizeUserFields(user);

    const frozenResponse = ensureUserNotFrozen(user, res);
    if (frozenResponse) return frozenResponse;

    const missions = missionType === 'daily' ? getDailyMissions(user) : getWeeklyMissions(user);
    const visibleMissions = missions.filter((mission) => !mission.secret || mission.unlocked);
    const mission = visibleMissions.find((item) => item.id === missionId);

    if (!mission) {
      return res.status(404).json({ message: 'Mission nicht gefunden' });
    }

    if (!mission.isCompleted) {
      return res.status(400).json({ message: 'Mission noch nicht erledigt' });
    }

    const claimedList =
      missionType === 'daily' ? user.claimedDailyMissions : user.claimedWeeklyMissions;

    if (claimedList.includes(mission.id)) {
      return res.status(400).json({ message: 'Belohnung bereits erhalten' });
    }

    claimedList.push(mission.id);

    user.balance = roundOnix(Number(user.balance || 0) + mission.reward);
    addEarnings(user, mission.reward);

    addTransaction(
      user,
      missionType === 'daily' ? 'income_daily_mission' : 'income_weekly_mission',
      mission.reward,
      `${missionType === 'daily' ? 'Daily' : 'Weekly'} Mission: ${mission.title}`
    );

    const achievementBonuses = applyAchievements(user);
    const rankBonuses = applyRankBonuses(user);
    user.level = calculateLevel(user.totalEarned);
    user.updatedAt = new Date();
    user.lastSeenAt = Date.now();

    await user.save();

    return res.json({
      user: {
        ...user.toObject({ flattenMaps: true }),
        perkLevels: getPerkLevelsPayload(user),
        achievements: getAchievementsPayload(user),
        referralLimit: getReferralLimitPayload(user),
        missions: getMissionsPayload(user),
      },
      missions: getMissionsPayload(user),
      missionReward: {
        id: mission.id,
        title: mission.title,
        reward: mission.reward,
      },
      achievementBonuses,
      rankBonuses,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// CLAIM TASK
router.post('/claim-task', requireTelegramMiniAppUser, sensitiveRewardMutationGuard, async (req, res) => {
  try {
    const { task } = req.body;
    const requestedTelegramId = String(req.body?.telegramId || '');
    const telegramId = req.telegramUserId;

    if (requestedTelegramId && requestedTelegramId !== telegramId) {
      return res.status(403).json({
        message: 'Telegram ID does not match authenticated user',
      });
    }

    if (!task) {
      return res.status(400).json({
        message: 'Task is required',
      });
    }

    const user = await User.findOne({ telegramId });

    if (!user) {
      return res.status(404).json({
        message: 'User not found',
      });
    }

    normalizeUserFields(user);

    // DAILY REWARD WITH STREAK
    if (task === 'daily') {
      const now = Date.now();
      const todayKey = getUtcDayKey(now);

      if (user.dailyRewardLastClaim) {
        const lastClaimTime = Number(user.dailyRewardLastClaim || 0);
        const lastClaimDay = user.lastDailyClaimDay || getUtcDayKey(lastClaimTime);

        if (lastClaimDay === todayKey || now - lastClaimTime < DAY_MS) {
          return res.status(400).json({
            message: 'Daily reward already claimed',
          });
        }
      }

      const yesterdayKey = getUtcDayKey(now - DAY_MS);
      const previousClaimDay =
        user.lastDailyClaimDay ||
        (user.dailyRewardLastClaim ? getUtcDayKey(Number(user.dailyRewardLastClaim)) : null);

      let nextStreak = 1;

      if (previousClaimDay === yesterdayKey) {
        nextStreak = Number(user.dailyStreak || 0) + 1;
      } else if (getPerkLevel(user, 'streak_shield') > 0 && Number(user.dailyStreak || 0) > 1) {
        nextStreak = Number(user.dailyStreak || 0);
      }

      if (nextStreak > 7) {
        nextStreak = 1;
      }

      const reward = getDailyRewardWithStreakForUser(user, nextStreak);

      user.balance = roundOnix(Number(user.balance || 0) + reward);
      addEarnings(user, reward);
      user.dailyRewardLastClaim = now;
      user.lastDailyClaimDay = todayKey;
      user.dailyStreak = nextStreak;

      addTransaction(user, 'income_daily', reward, `Tägliche Belohnung · Tag ${nextStreak}/7`);

      const rankBonuses = applyRankBonuses(user);
      user.level = calculateLevel(user.totalEarned);
      user.updatedAt = new Date();
      user.lastSeenAt = now;

      await user.save();

      return res.json({
        ...user.toObject({ flattenMaps: true }),
        perkLevels: getPerkLevelsPayload(user),
        achievements: getAchievementsPayload(user),
        claimedDailyReward: reward,
        rankBonuses,
        dailyStreak: nextStreak,
        dailyStreakMultiplier: getDailyStreakMultiplier(nextStreak),
      });
    }

    // CHANNEL SUBSCRIBE
    if (task === 'channel') {
      if (user.completedTasks.includes('channel')) {
        return res.status(400).json({
          message: 'Task already claimed',
        });
      }

      if (!process.env.BOT_TOKEN || !process.env.CHANNEL_ID) {
        return res.status(500).json({
          message: 'Telegram bot settings are missing',
        });
      }

      const response = await axios.get(
        `https://api.telegram.org/bot${process.env.BOT_TOKEN}/getChatMember`,
        {
          params: {
            chat_id: process.env.CHANNEL_ID,
            user_id: telegramId,
          },
        }
      );

      const status = response.data?.result?.status;

      const isSubscribed = ['member', 'administrator', 'creator'].includes(
        status
      );

      if (!isSubscribed) {
        return res.status(400).json({
          message: 'Abonniere zuerst den Kanal',
        });
      }

      user.balance = roundOnix(Number(user.balance || 0) + 25000);
      addEarnings(user, 25000);
      user.completedTasks.push('channel');
      addTransaction(user, 'income_task', 25000, 'Aufgabe: Kanal abonnieren');

      const rankBonuses = applyRankBonuses(user);
      user.level = calculateLevel(user.totalEarned);
      user.updatedAt = new Date();
      user.lastSeenAt = Date.now();

      await user.save();

      return res.json({
        ...user.toObject({ flattenMaps: true }),
        perkLevels: getPerkLevelsPayload(user),
        achievements: getAchievementsPayload(user),
        referralLimit: getReferralLimitPayload(user),
        missions: getMissionsPayload(user),
        rankBonuses: typeof rankBonuses !== 'undefined' ? rankBonuses : [],
        achievementBonuses: typeof achievementBonuses !== 'undefined' ? achievementBonuses : [],
      });
    }

    // INVITE FRIEND
    if (task === 'inviteFriend') {
      if (user.completedTasks.includes('inviteFriend')) {
        return res.status(400).json({
          message: 'Task already claimed',
        });
      }

      if (user.referralsCount < 1) {
        return res.status(400).json({
          message: 'Lade zuerst einen Freund ein',
        });
      }

      const economyConfig = getEconomyConfig();

      user.balance = roundOnix(Number(user.balance || 0) + economyConfig.referralReward);
      addEarnings(user, economyConfig.referralReward);
      user.completedTasks.push('inviteFriend');
      addTransaction(
        user,
        'income_task',
        economyConfig.referralReward,
        'Aufgabe: Freund einladen'
      );

      const rankBonuses = applyRankBonuses(user);
      user.level = calculateLevel(user.totalEarned);
      user.updatedAt = new Date();
      user.lastSeenAt = Date.now();

      await user.save();

      return res.json({
        ...user.toObject({ flattenMaps: true }),
        perkLevels: getPerkLevelsPayload(user),
        achievements: getAchievementsPayload(user),
        referralLimit: getReferralLimitPayload(user),
        missions: getMissionsPayload(user),
        rankBonuses: typeof rankBonuses !== 'undefined' ? rankBonuses : [],
        achievementBonuses: typeof achievementBonuses !== 'undefined' ? achievementBonuses : [],
      });
    }

    return res.status(400).json({
      message: 'Unknown task',
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message,
    });
  }
});

// CLAIM OFFLINE INCOME
router.post('/claim-offline-income', requireTelegramMiniAppUser, async (req, res) => {
  try {
    const requestedTelegramId = String(req.body?.telegramId || '');
    const telegramId = req.telegramUserId;

    if (requestedTelegramId && requestedTelegramId !== telegramId) {
      return res.status(403).json({
        message: 'Telegram ID does not match authenticated user',
      });
    }

    const user = await User.findOne({ telegramId });

    if (!user) {
      return res.status(404).json({
        message: 'User not found',
      });
    }

    normalizeUserFields(user);

    const claimedAmount = Number(user.pendingOfflineIncome || 0);
    const claimedSeconds = Number(user.pendingOfflineSeconds || 0);

    if (claimedAmount <= 0) {
      return res.status(400).json({
        message: 'No offline income to claim',
      });
    }

    user.balance = roundOnix(Number(user.balance || 0) + claimedAmount);
    addEarnings(user, claimedAmount);
    addTransaction(user, 'income_offline', claimedAmount, 'Offline-Mining');
    user.offlineClaimsCount = Number(user.offlineClaimsCount || 0) + 1;
    incrementMissionStat(user, 'dailyOfflineClaims');
    incrementMissionStat(user, 'weeklyOfflineClaims');
    const achievementBonuses = applyAchievements(user);
    const rankBonuses = applyRankBonuses(user);
    user.level = calculateLevel(user.totalEarned);

    user.lastOfflineIncome = claimedAmount;
    user.lastOfflineSeconds = claimedSeconds;

    user.pendingOfflineIncome = 0;
    user.pendingOfflineSeconds = 0;

    user.updatedAt = new Date();
    user.lastSeenAt = Date.now();

    await user.save();

    return res.json({
      user: {
        ...user.toObject({ flattenMaps: true }),
        perkLevels: getPerkLevelsPayload(user),
        achievements: getAchievementsPayload(user),
        referralLimit: getReferralLimitPayload(user),
        missions: getMissionsPayload(user),
      },
      achievements: getAchievementsPayload(user),
      referralLimit: getReferralLimitPayload(user),
        missions: getMissionsPayload(user),
      achievementBonuses,
      rankBonuses,
      claimedAmount,
      claimedSeconds,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message,
    });
  }
});



// MINE TICK — BACKEND ONLINE MINING
router.post('/mine-tick', requireTelegramMiniAppUser, async (req, res) => {
  try {
    const requestedTelegramId = String(req.body?.telegramId || '');
    const telegramId = req.telegramUserId;

    if (requestedTelegramId && requestedTelegramId !== telegramId) {
      return res.status(403).json({
        message: 'Telegram ID does not match authenticated user',
      });
    }

    const user = await User.findOne({ telegramId });

    if (!user) {
      return res.status(404).json({
        message: 'User not found',
      });
    }

    normalizeUserFields(user);

    const frozenResponse = ensureUserNotFrozen(user, res);
    if (frozenResponse) return frozenResponse;

    const now = Date.now();
    const lastMineTickAt = Number(user.lastMineTickAt || 0);
    const elapsedMs = now - lastMineTickAt;

    if (lastMineTickAt > 0 && elapsedMs < 900) {
      return res.status(429).json({
        message: 'Mine tick cooldown',
        user,
        income: 0,
        multiplier: 1,
        isMiningBoostActive: false,
        retryAfterMs: 900 - elapsedMs,
      });
    }

    if (
      user.activeBoost &&
      user.activeBoost !== 'none' &&
      Number(user.boostEndTime || 0) <= now
    ) {
      user.activeBoost = 'none';
      user.boostEndTime = 0;
    }

    const isMiningBoostActive =
      user.activeBoost === 'mining' && Number(user.boostEndTime || 0) > now;

    const multiplier = isMiningBoostActive ? 2 : 1;
    const elapsedForIncomeMs = lastMineTickAt > 0 ? Math.max(0, elapsedMs) : 1000;
    const rawMinerIncome =
      getMinerIncome(user) * (elapsedForIncomeMs / 60000) * multiplier +
      Number(user.minerRemainder || 0);
    const income = Math.max(0, Math.floor(rawMinerIncome));
    user.minerRemainder = Math.max(0, rawMinerIncome - income);

    if (income > 0) {
      user.balance = roundOnix(Number(user.balance || 0) + income);
      addEarnings(user, income);
      applyRankBonuses(user);
      user.level = calculateLevel(user.totalEarned);
    }

    user.energy = Math.min(
      Number(user.maxEnergy || DEFAULT_MAX_ENERGY),
      Number(user.energy || 0) + Number(user.energyRecharge || DEFAULT_ENERGY_RECHARGE)
    );

    user.lastMineTickAt = now;
    user.updatedAt = new Date();
    user.lastSeenAt = now;

    await user.save();

    return res.json({
      user: {
        ...user.toObject({ flattenMaps: true }),
        perkLevels: getPerkLevelsPayload(user),
        achievements: getAchievementsPayload(user),
        referralLimit: getReferralLimitPayload(user),
        missions: getMissionsPayload(user),
      },
      achievements: getAchievementsPayload(user),
      income,
      multiplier,
      isMiningBoostActive,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message,
    });
  }
});


// REFILL ENERGY — fills energy to max for a fixed ONIX price
router.post('/refill-energy', requireTelegramMiniAppUser, async (req, res) => {
  try {
    const requestedTelegramId = String(req.body?.telegramId || '');
    const telegramId = req.telegramUserId;

    if (requestedTelegramId && requestedTelegramId !== telegramId) {
      return res.status(403).json({
        message: 'Telegram ID does not match authenticated user',
      });
    }

    const user = await User.findOne({ telegramId });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    normalizeUserFields(user);

    const frozenResponse = ensureUserNotFrozen(user, res);
    if (frozenResponse) return frozenResponse;

    const maxEnergy = Number(user.maxEnergy || DEFAULT_MAX_ENERGY);
    const currentEnergy = Number(user.energy || 0);

    if (currentEnergy >= maxEnergy) {
      return res.status(400).json({ message: 'Energie ist bereits voll' });
    }

    const cost = getEnergyRefillCost();

    if (Number(user.balance || 0) < cost) {
      return res.status(400).json({ message: 'Nicht genug ONIX' });
    }

    user.balance = roundOnix(Number(user.balance || 0) - cost);
    user.energy = maxEnergy;
    addTransaction(user, 'expense_boost', -cost, 'Energie auf 100 % aufgefüllt');
    user.updatedAt = new Date();
    user.lastSeenAt = Date.now();

    await user.save();

    return res.json({
      user: {
        ...user.toObject({ flattenMaps: true }),
        perkLevels: getPerkLevelsPayload(user),
        achievements: getAchievementsPayload(user),
        referralLimit: getReferralLimitPayload(user),
        missions: getMissionsPayload(user),
      },
      achievements: getAchievementsPayload(user),
      referralLimit: getReferralLimitPayload(user),
      missions: getMissionsPayload(user),
      refill: { cost, energy: user.energy, maxEnergy },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ACTIVATE BOOST
router.post('/activate-boost', requireTelegramMiniAppUser, async (req, res) => {
  try {
    const { type } = req.body;
    const requestedTelegramId = String(req.body?.telegramId || '');
    const telegramId = req.telegramUserId;

    if (requestedTelegramId && requestedTelegramId !== telegramId) {
      return res.status(403).json({
        message: 'Telegram ID does not match authenticated user',
      });
    }

    const durationConfig = {
      tap: 10 * 60 * 1000,
      mining: 15 * 60 * 1000,
    };

    if (!durationConfig[type]) {
      return res.status(400).json({
        message: 'Unknown boost type',
      });
    }

    const user = await User.findOne({ telegramId });

    if (!user) {
      return res.status(404).json({
        message: 'User not found',
      });
    }

    normalizeUserFields(user);

    const now = Date.now();

    if (
      user.activeBoost &&
      user.activeBoost !== 'none' &&
      Number(user.boostEndTime || 0) > now
    ) {
      return res.status(400).json({
        message: 'Boost already active',
      });
    }

    const cost =
      type === 'tap'
        ? getTapBoostCost(user.tapPower)
        : getMiningBoostCost(user.autoclickers);

    if (Number(user.balance || 0) < cost) {
      return res.status(400).json({
        message: 'Not enough ONIX',
      });
    }

    user.balance = roundOnix(Number(user.balance || 0) - cost);
    addTransaction(
      user,
      'expense_boost',
      -cost,
      type === 'tap' ? 'Tap-Boost ×2' : 'Mining-Boost ×2'
    );
    user.activeBoost = type;
    const effectiveDurationMs = Math.round(durationConfig[type] * getBoostDurationMultiplier(user));
    user.boostEndTime = now + effectiveDurationMs;
    user.totalBoostsUsed = Number(user.totalBoostsUsed || 0) + 1;
    const achievementBonuses = applyAchievements(user);
    const rankBonuses = applyRankBonuses(user);
    user.level = calculateLevel(user.totalEarned);
    user.updatedAt = new Date();
    user.lastSeenAt = now;

    await user.save();

    return res.json({
      user: {
        ...user.toObject({ flattenMaps: true }),
        perkLevels: getPerkLevelsPayload(user),
        achievements: getAchievementsPayload(user),
        referralLimit: getReferralLimitPayload(user),
        missions: getMissionsPayload(user),
      },
      achievements: getAchievementsPayload(user),
      referralLimit: getReferralLimitPayload(user),
        missions: getMissionsPayload(user),
      achievementBonuses,
      rankBonuses,
      boost: {
        type,
        cost,
        boostEndTime: user.boostEndTime,
        durationMs: effectiveDurationMs,
      },
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message,
    });
  }
});

// TAP COIN — BACKEND ANTI-CHEAT
router.post('/tap', requireTelegramMiniAppUser, async (req, res) => {
  try {
    const requestedTelegramId = String(req.body?.telegramId || '');
    const telegramId = req.telegramUserId;

    if (requestedTelegramId && requestedTelegramId !== telegramId) {
      return res.status(403).json({
        message: 'Telegram ID does not match authenticated user',
      });
    }

    const user = await User.findOne({ telegramId });

    if (!user) {
      return res.status(404).json({
        message: 'User not found',
      });
    }

    normalizeUserFields(user);

    const frozenResponse = ensureUserNotFrozen(user, res);
    if (frozenResponse) return frozenResponse;

    const energyCost = getEnergyCost(user);

    if (Number(user.energy || 0) < energyCost) {
      return res.status(400).json({
        message: 'No energy',
      });
    }

    const now = Date.now();
    const oneSecondAgo = now - 1000;
    const sustainedWindowStart = now - TAP_SUSTAINED_WINDOW_MS;

    // Keep only the window needed for anti-cheat checks.
    user.tapTimestamps = user.tapTimestamps
      .map((time) => Number(time))
      .filter((time) => Number.isFinite(time) && time > sustainedWindowStart);

    const tapsLastSecond = user.tapTimestamps.filter(
      (time) => time > oneSecondAgo
    ).length;

    if (tapsLastSecond >= MAX_TAPS_PER_SECOND) {
      registerTapRateViolation(
        user,
        now,
        `${tapsLastSecond + 1} tap attempts within ~1 second`
      );
      user.updatedAt = new Date();
      user.lastSeenAt = now;
      await user.save();

      return res.status(429).json({
        message: 'Too many taps',
      });
    }

    if (user.tapTimestamps.length >= TAP_SUSTAINED_MAX_IN_WINDOW) {
      addSuspiciousReason(
        user,
        'Sustained impossible tap speed detected'
      );
      addSecurityLog(
        user,
        'tap_sustained_limit',
        'Sustained tap rate blocked',
        `${user.tapTimestamps.length + 1} tap attempts within ${TAP_SUSTAINED_WINDOW_MS / 1000} seconds`
      );
      user.updatedAt = new Date();
      user.lastSeenAt = now;
      await user.save();

      return res.status(429).json({
        message: 'Too many taps',
      });
    }

    user.tapTimestamps.push(now);

    if (
      user.activeBoost &&
      user.activeBoost !== 'none' &&
      Number(user.boostEndTime || 0) <= now
    ) {
      user.activeBoost = 'none';
      user.boostEndTime = 0;
    }

    const isTapBoostActive =
      user.activeBoost === 'tap' && Number(user.boostEndTime || 0) > now;

    const points = roundOnix(Number(user.tapPower || DEFAULT_TAP_POWER) * (isTapBoostActive ? 2 : 1));

    user.balance = roundOnix(Number(user.balance || 0) + points);
    addEarnings(user, points);
    user.energy = Math.max(0, roundOnix(Number(user.energy || 0) - energyCost));
    user.totalTaps = Number(user.totalTaps || 0) + 1;
    incrementMissionStat(user, 'dailyTaps');
    incrementMissionStat(user, 'weeklyTaps');

    const achievementBonuses = applyAchievements(user);
    const rankBonuses = applyRankBonuses(user);
    user.level = calculateLevel(user.totalEarned);
    user.updatedAt = new Date();
    user.lastSeenAt = now;

    await user.save();

    return res.json({
      user: {
        ...user.toObject({ flattenMaps: true }),
        perkLevels: getPerkLevelsPayload(user),
        achievements: getAchievementsPayload(user),
        referralLimit: getReferralLimitPayload(user),
        missions: getMissionsPayload(user),
      },
      achievements: getAchievementsPayload(user),
      referralLimit: getReferralLimitPayload(user),
        missions: getMissionsPayload(user),
      achievementBonuses,
      rankBonuses,
      points,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message,
    });
  }
});

// ---------------- ONIX Drop mini-game ----------------
router.get('/onix-drop/status/:telegramId', requireTelegramMiniAppUser, async (req, res) => {
  try {
    const requestedTelegramId = String(req.params.telegramId || '');
    const telegramId = req.telegramUserId;

    if (requestedTelegramId && requestedTelegramId !== telegramId) {
      return res.status(403).json({
        message: 'Telegram ID does not match authenticated user',
      });
    }

    const user = await User.findOne({ telegramId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    prepareOnixDropDay(user);
    await user.save();
    return res.json(getOnixDropPayload(user));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/onix-drop/start', requireTelegramMiniAppUser, async (req, res) => {
  try {
    const requestedTelegramId = String(req.body?.telegramId || '');
    const telegramId = req.telegramUserId;

    if (requestedTelegramId && requestedTelegramId !== telegramId) {
      return res.status(403).json({
        message: 'Telegram ID does not match authenticated user',
      });
    }

    const user = await User.findOne({ telegramId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const now = Date.now();
    prepareOnixDropDay(user, now);
    if (Number(user.onixDrop.attemptsUsed || 0) >= ONIX_DROP_DAILY_ATTEMPTS) {
      return res.status(429).json({ error: 'No ONIX Drop attempts left today', ...getOnixDropPayload(user, now) });
    }

    // Starting a round consumes the attempt. This prevents unlimited restarts
    // until a perfect round is achieved.
    const sessionId = crypto.randomUUID();
    user.onixDrop.attemptsUsed = Number(user.onixDrop.attemptsUsed || 0) + 1;
    user.onixDrop.sessionId = sessionId;
    user.onixDrop.sessionStartedAt = now;
    user.onixDrop.sessionExpiresAt = now + ONIX_DROP_SESSION_MS;
    await user.save();

    return res.json({
      sessionId,
      durationSeconds: 30,
      ...getOnixDropPayload(user, now),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/onix-drop/finish', requireTelegramMiniAppUser, async (req, res) => {
  try {
    const requestedTelegramId = String(req.body?.telegramId || '');
    const telegramId = req.telegramUserId;

    if (requestedTelegramId && requestedTelegramId !== telegramId) {
      return res.status(403).json({
        message: 'Telegram ID does not match authenticated user',
      });
    }

    const sessionId = String(req.body?.sessionId || '');
    const submittedScore = Math.max(0, Math.floor(Number(req.body?.score || 0)));
    const user = await User.findOne({ telegramId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const now = Date.now();
    prepareOnixDropDay(user, now);
    const startedAt = Number(user.onixDrop.sessionStartedAt || 0);
    const expiresAt = Number(user.onixDrop.sessionExpiresAt || 0);
    if (!sessionId || sessionId !== String(user.onixDrop.sessionId || '')) {
      return res.status(400).json({ error: 'Invalid or already used ONIX Drop session' });
    }
    if (now < startedAt + ONIX_DROP_MIN_RUN_MS || now > expiresAt) {
      user.onixDrop.sessionId = '';
      await user.save();
      return res.status(400).json({ error: 'ONIX Drop session timing is invalid' });
    }

    const reward = Math.min(submittedScore, ONIX_DROP_MAX_REWARD_PER_RUN);
    user.onixDrop.sessionId = '';
    user.onixDrop.sessionStartedAt = 0;
    user.onixDrop.sessionExpiresAt = 0;
    user.onixDrop.dailyEarned = Number(user.onixDrop.dailyEarned || 0) + reward;
    user.onixDrop.bestScore = Math.max(Number(user.onixDrop.bestScore || 0), submittedScore);
    user.balance = Number(user.balance || 0) + reward;
    user.totalEarned = Number(user.totalEarned || 0) + reward;
    user.level = calculateLevel(user.totalEarned);
    user.lastSeenAt = now;
    await user.save();

    return res.json({ reward, balance: user.balance, level: user.level, ...getOnixDropPayload(user, now) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
