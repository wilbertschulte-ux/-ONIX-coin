const crypto = require('crypto');

const ACTIVE_TRANSACTION_LIMIT = 50;
const ACTIVE_NOTIFICATION_LIMIT = 50;
const ACTIVE_WITHDRAWAL_LIMIT = 20;
const ACTIVE_SECURITY_LOG_LIMIT = 100;
const PREVIEW_TOKEN_TTL_MS = 10 * 60 * 1000;
const MAX_BACKUP_BYTES = 12 * 1024 * 1024;
const TAP_WINDOW_MS = 5 * 1000;

class AccountRecoveryError extends Error {
  constructor(code, message, status = 400, details = undefined) {
    super(message);
    this.name = 'AccountRecoveryError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function cloneValue(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (Array.isArray(value)) return value.map(cloneValue);
  if (typeof value === 'object') {
    if (value._bsontype) return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]));
  }
  return value;
}

function roundOnix(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function timestamp(value) {
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function getUtcDayKey(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

function getIsoWeekKey(now = Date.now()) {
  const value = new Date(now);
  const date = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function uniqueScalars(...arrays) {
  return [...new Set(arrays.flatMap((value) => Array.isArray(value) ? value : []).map(String))];
}

function subdocumentKey(value, fallbackFields) {
  if (value?._id) return `_id:${String(value._id)}`;
  if (value?.id) return `id:${String(value.id)}`;
  return fallbackFields.map((field) => String(value?.[field] ?? '')).join('|');
}

function mergeSubdocuments(oldValues, newValues, fallbackFields, limit = Infinity) {
  const values = [...(oldValues || []), ...(newValues || [])];
  const merged = new Map();
  for (const value of values) {
    const key = subdocumentKey(value, fallbackFields);
    if (!merged.has(key)) merged.set(key, cloneValue(value));
  }
  return [...merged.values()]
    .sort((left, right) => numeric(right.createdAt) - numeric(left.createdAt))
    .slice(0, limit);
}

function mergePerkLevels(oldLevels, newLevels) {
  const toObject = (levels) => {
    if (!levels) return {};
    if (levels instanceof Map) return Object.fromEntries(levels.entries());
    return { ...levels };
  };
  const result = {};
  const oldObject = toObject(oldLevels);
  const newObject = toObject(newLevels);
  for (const key of new Set([...Object.keys(oldObject), ...Object.keys(newObject)])) {
    result[key] = Math.max(numeric(oldObject[key]), numeric(newObject[key]));
  }
  return result;
}

function calculateLevel(totalEarned) {
  return Math.floor(numeric(totalEarned) / 10000) + 1;
}

function calculateLeague(totalEarned) {
  const earned = numeric(totalEarned);
  if (earned >= 5000000) return 'Diamond';
  if (earned >= 1500000) return 'Gold';
  if (earned >= 500000) return 'Silver';
  return 'Bronze';
}

function mergePeriodStats(oldStats = {}, newStats = {}, currentDay, currentWeek) {
  const dailyFields = ['dailyTaps', 'dailyUpgrades', 'dailyOfflineClaims', 'dailyChests'];
  const weeklyFields = [
    'weeklyTaps',
    'weeklyUpgrades',
    'weeklyOfflineClaims',
    'weeklyChests',
    'weeklyReferrals',
  ];
  const result = { dailyKey: currentDay, weeklyKey: currentWeek };
  for (const field of dailyFields) {
    result[field] =
      (oldStats.dailyKey === currentDay ? numeric(oldStats[field]) : 0) +
      (newStats.dailyKey === currentDay ? numeric(newStats[field]) : 0);
  }
  for (const field of weeklyFields) {
    result[field] =
      (oldStats.weeklyKey === currentWeek ? numeric(oldStats[field]) : 0) +
      (newStats.weeklyKey === currentWeek ? numeric(newStats[field]) : 0);
  }
  return result;
}

function selectLatestDailyState(oldUser, newUser) {
  const oldTime = numeric(oldUser.dailyRewardLastClaim);
  const newTime = numeric(newUser.dailyRewardLastClaim);
  return oldTime > newTime ? oldUser : newUser;
}

function mergeReferralWindow(oldUser, newUser, keyField, countField) {
  const oldKey = String(oldUser[keyField] || '');
  const newKey = String(newUser[keyField] || '');
  if (oldKey && oldKey === newKey) {
    return { key: oldKey, count: numeric(oldUser[countField]) + numeric(newUser[countField]) };
  }
  if (oldKey > newKey) return { key: oldKey || null, count: numeric(oldUser[countField]) };
  return { key: newKey || null, count: numeric(newUser[countField]) };
}

function selectActiveBoost(oldUser, newUser, now) {
  const candidates = [oldUser, newUser]
    .filter((user) => user.activeBoost && user.activeBoost !== 'none')
    .filter((user) => numeric(user.boostEndTime) > now)
    .sort((left, right) => numeric(right.boostEndTime) - numeric(left.boostEndTime));
  return candidates[0]
    ? { activeBoost: candidates[0].activeBoost, boostEndTime: numeric(candidates[0].boostEndTime) }
    : { activeBoost: 'none', boostEndTime: 0 };
}

function getReferralConflict(oldUser, newUser) {
  const oldReferral = String(oldUser.referredBy || '');
  const newReferral = String(newUser.referredBy || '');
  return oldReferral && newReferral && oldReferral !== newReferral;
}

function validateRecoverySafety(oldUser, newUser, now = Date.now()) {
  const blockers = [];
  if (!oldUser) blockers.push({ code: 'OLD_USER_NOT_FOUND', message: 'Old user was not found' });
  if (!newUser) blockers.push({ code: 'NEW_USER_NOT_FOUND', message: 'New user was not found' });
  if (!oldUser || !newUser) return blockers;

  const oldTelegramId = String(oldUser.telegramId || '');
  const newTelegramId = String(newUser.telegramId || '');
  if (!oldTelegramId || !newTelegramId || oldTelegramId === newTelegramId) {
    blockers.push({ code: 'IDENTICAL_TELEGRAM_IDS', message: 'Old and new Telegram IDs must differ' });
  }
  if ([...(oldUser.withdrawalRequests || []), ...(newUser.withdrawalRequests || [])]
    .some((request) => request.status === 'pending')) {
    blockers.push({ code: 'PENDING_WITHDRAWAL', message: 'Pending withdrawal must be resolved first' });
  }
  if (getReferralConflict(oldUser, newUser)) {
    blockers.push({ code: 'CONFLICTING_REFERRER', message: 'Accounts have different referrers' });
  }
  const recoveryIdentities = new Set([oldTelegramId, newTelegramId]);
  if (
    recoveryIdentities.has(String(oldUser.referredBy || '')) ||
    recoveryIdentities.has(String(newUser.referredBy || ''))
  ) {
    blockers.push({ code: 'RECOVERY_REFERRAL_CYCLE', message: 'Recovery would create a self-referral' });
  }
  const oldTeam = String(oldUser.teamName || '');
  const newTeam = String(newUser.teamName || '');
  if (oldTeam && newTeam && oldTeam !== newTeam) {
    blockers.push({ code: 'CONFLICTING_TEAM', message: 'Accounts belong to different teams' });
  }
  for (const [label, user] of [['old', oldUser], ['new', newUser]]) {
    if (user.onixDrop?.sessionId && numeric(user.onixDrop.sessionExpiresAt) > now) {
      blockers.push({ code: 'ACTIVE_DROP_SESSION', message: `${label} account has an active Drop session` });
    }
  }
  if (oldUser.isFrozen || newUser.isFrozen || oldUser.isSuspicious || newUser.isSuspicious) {
    blockers.push({
      code: 'SECURITY_STATUS_REQUIRES_REVIEW',
      message: 'Frozen or suspicious accounts cannot be recovered automatically',
    });
  }
  return blockers;
}

function validateIncomingReferralSafety(oldUser, newUser, incomingReferrals = []) {
  const mergedReferrer = String(oldUser.referredBy || newUser.referredBy || '');
  if (!mergedReferrer) return [];

  const wouldReferToMergedUser = incomingReferrals.some((user) =>
    String(user.telegramId || '') === mergedReferrer
  );
  return wouldReferToMergedUser
    ? [{
        code: 'RECOVERY_REFERRAL_CYCLE',
        message: 'Updating incoming referrals would create a referral cycle',
      }]
    : [];
}

async function validateReferralGraphSafety(users, oldUser, newUser, session = null) {
  const identities = new Set([
    String(oldUser.telegramId || ''),
    String(newUser.telegramId || ''),
  ]);
  let current = String(oldUser.referredBy || newUser.referredBy || '');
  const visited = new Set();

  for (let depth = 0; current && depth < 100; depth += 1) {
    if (identities.has(current) || visited.has(current)) {
      return [{
        code: 'RECOVERY_REFERRAL_CYCLE',
        message: 'Recovery would create or retain a referral cycle',
      }];
    }
    visited.add(current);
    const referrer = await users.findOne(
      { telegramId: current },
      { ...(session ? { session } : {}), projection: { telegramId: 1, referredBy: 1 } }
    );
    current = String(referrer?.referredBy || '');
  }

  if (current) {
    return [{
      code: 'RECOVERY_REFERRAL_CHAIN_TOO_DEEP',
      message: 'Referral chain is too deep to verify safely',
    }];
  }
  return [];
}

function buildRecoveryWeeklyScorePlan(oldUser, newUser, weeklyScores = [], options = {}) {
  const now = numeric(options.now, Date.now());
  const currentWeek = options.currentWeek || getIsoWeekKey(now);
  const oldTelegramId = String(oldUser.telegramId || '');
  const newTelegramId = String(newUser.telegramId || '');
  const weeks = new Map();

  const getWeek = (week) => {
    if (!weeks.has(week)) weeks.set(week, { week, oldScore: null, newScore: null });
    return weeks.get(week);
  };

  for (const score of weeklyScores || []) {
    const week = String(score.week || '').trim();
    const telegramId = String(score.telegramId || '');
    if (!week || ![oldTelegramId, newTelegramId].includes(telegramId)) continue;
    const entry = getWeek(week);
    const key = telegramId === oldTelegramId ? 'oldScore' : 'newScore';
    if (entry[key]) {
      throw new AccountRecoveryError(
        'RECOVERY_WEEKLY_SCORE_CONFLICT',
        `Multiple WeeklyScore records exist for ${telegramId} in ${week}`,
        409
      );
    }
    entry[key] = cloneValue(score);
  }

  const addUnmaterializedProgress = (user, identity) => {
    const week = String(user.weeklyEarnedWeek || '').trim();
    const weeklyEarned = roundOnix(user.weeklyEarned || 0);
    if (!week || week === currentWeek || weeklyEarned <= 0) return;
    const entry = getWeek(week);
    const key = identity === 'old' ? 'oldScore' : 'newScore';
    if (!entry[key]) {
      entry[key] = {
        week,
        telegramId: identity === 'old' ? oldTelegramId : newTelegramId,
        username: user.username || 'Spieler',
        teamName: user.teamName || '',
        weeklyEarned,
        totalTaps: numeric(user.totalTaps),
        capturedAt: now,
        recoveryMaterialized: true,
      };
    }
  };

  addUnmaterializedProgress(oldUser, 'old');
  addUnmaterializedProgress(newUser, 'new');

  const actions = [];
  for (const entry of [...weeks.values()].sort((left, right) => left.week.localeCompare(right.week))) {
    if (entry.week === currentWeek) {
      throw new AccountRecoveryError(
        'RECOVERY_WEEKLY_SCORE_CONFLICT',
        'A WeeklyScore already exists for the current unfinished week',
        409
      );
    }
    const sources = [entry.oldScore, entry.newScore].filter(Boolean);
    const teamNames = [...new Set(sources.map((score) => String(score.teamName || '')).filter(Boolean))];
    if (teamNames.length > 1) {
      throw new AccountRecoveryError(
        'RECOVERY_WEEKLY_TEAM_CONFLICT',
        `WeeklyScore team attribution conflicts in ${entry.week}`,
        409
      );
    }

    const capturedTimes = sources.map((score) => numeric(score.capturedAt)).filter((value) => value > 0);
    const target = {
      week: entry.week,
      telegramId: newTelegramId,
      username: newUser.username || oldUser.username || 'Spieler',
      teamName: teamNames[0] || newUser.teamName || oldUser.teamName || '',
      weeklyEarned: roundOnix(sources.reduce((sum, score) => sum + numeric(score.weeklyEarned), 0)),
      totalTaps: sources.reduce((sum, score) => sum + numeric(score.totalTaps), 0),
      capturedAt: capturedTimes.length ? Math.min(...capturedTimes) : now,
    };
    actions.push({
      week: entry.week,
      target,
      existingNewScore: entry.newScore,
      oldScore: entry.oldScore,
      operation: entry.newScore ? (entry.oldScore ? 'merge' : 'keep') : 'insert',
    });
  }

  return { currentWeek, oldTelegramId, newTelegramId, actions };
}

async function applyRecoveryWeeklyScorePlan(collection, plan, session) {
  let insertedCount = 0;
  let updatedCount = 0;

  for (const action of plan.actions) {
    if (action.operation === 'insert') {
      const result = await collection.updateOne(
        { week: action.week, telegramId: plan.newTelegramId },
        { $setOnInsert: action.target },
        { upsert: true, session }
      );
      insertedCount += Number(result.upsertedCount || 0);
    } else if (action.operation === 'merge') {
      const result = await collection.updateOne(
        { _id: action.existingNewScore._id, week: action.week, telegramId: plan.newTelegramId },
        { $set: action.target },
        { session }
      );
      if (result.matchedCount !== 1) {
        throw new AccountRecoveryError(
          'RECOVERY_WEEKLY_SCORE_CONFLICT',
          `WeeklyScore changed during recovery for ${action.week}`,
          409
        );
      }
      updatedCount += 1;
    }
  }

  const removed = await collection.deleteMany(
    { telegramId: plan.oldTelegramId },
    { session }
  );
  return {
    insertedCount,
    updatedCount,
    removedOldCount: Number(removed.deletedCount || 0),
  };
}

function buildMergedUser(oldUserInput, newUserInput, options = {}) {
  const oldUser = cloneValue(oldUserInput);
  const newUser = cloneValue(newUserInput);
  const now = numeric(options.now, Date.now());
  const currentDay = options.currentDay || getUtcDayKey(now);
  const currentWeek = options.currentWeek || getIsoWeekKey(now);
  const merged = cloneValue(newUser);

  merged._id = newUser._id;
  merged.telegramId = String(newUser.telegramId);
  merged.createdAt = cloneValue(oldUser.createdAt || newUser.createdAt);
  merged.updatedAt = new Date(now);
  merged.__v = numeric(newUser.__v) + 1;

  merged.balance = roundOnix(numeric(oldUser.balance) + numeric(newUser.balance));
  merged.totalEarned = roundOnix(numeric(oldUser.totalEarned) + numeric(newUser.totalEarned));
  merged.level = calculateLevel(merged.totalEarned);
  merged.league = calculateLeague(merged.totalEarned);
  merged.totalTaps = numeric(oldUser.totalTaps) + numeric(newUser.totalTaps);
  merged.totalBoostsUsed = numeric(oldUser.totalBoostsUsed) + numeric(newUser.totalBoostsUsed);
  merged.totalUpgradesBought = numeric(oldUser.totalUpgradesBought) + numeric(newUser.totalUpgradesBought);
  merged.offlineClaimsCount = numeric(oldUser.offlineClaimsCount) + numeric(newUser.offlineClaimsCount);

  for (const field of ['tapLevel', 'minerLevel', 'energyLevel', 'rechargeLevel']) {
    merged[field] = Math.max(1, numeric(oldUser[field], 1), numeric(newUser[field], 1));
  }
  merged.perkLevels = mergePerkLevels(oldUser.perkLevels, newUser.perkLevels);
  merged.tapPower = merged.tapLevel;
  merged.maxEnergy = 500 + (merged.energyLevel - 1) * 250 + numeric(merged.perkLevels.energy_max_pro) * 300;
  merged.energyRecharge = 1 + Math.floor((merged.rechargeLevel - 1) / 4);
  merged.autoclickers = merged.minerLevel;
  merged.energy = Math.min(merged.maxEnergy, Math.max(numeric(oldUser.energy), numeric(newUser.energy)));

  merged.weeklyEarnedWeek = currentWeek;
  merged.weeklyEarned = roundOnix(
    (oldUser.weeklyEarnedWeek === currentWeek ? numeric(oldUser.weeklyEarned) : 0) +
    (newUser.weeklyEarnedWeek === currentWeek ? numeric(newUser.weeklyEarned) : 0)
  );

  for (const field of [
    'completedTasks',
    'completedAchievements',
    'ownedPerks',
    'claimedRankBonuses',
    'seasonBadges',
    'teamMissionClaims',
    'teamPrizeClaims',
    'usedPromoCodes',
    'suspiciousReasons',
  ]) {
    merged[field] = uniqueScalars(oldUser[field], newUser[field]);
  }

  merged.missionStats = mergePeriodStats(oldUser.missionStats, newUser.missionStats, currentDay, currentWeek);
  merged.claimedDailyMissions = uniqueScalars(
    oldUser.missionStats?.dailyKey === currentDay ? oldUser.claimedDailyMissions : [],
    newUser.missionStats?.dailyKey === currentDay ? newUser.claimedDailyMissions : []
  );
  merged.claimedWeeklyMissions = uniqueScalars(
    oldUser.missionStats?.weeklyKey === currentWeek ? oldUser.claimedWeeklyMissions : [],
    newUser.missionStats?.weeklyKey === currentWeek ? newUser.claimedWeeklyMissions : []
  );
  merged.tasks = {
    daily: Boolean(oldUser.tasks?.daily || newUser.tasks?.daily),
    channel: Boolean(oldUser.tasks?.channel || newUser.tasks?.channel),
    inviteFriend: Boolean(oldUser.tasks?.inviteFriend || newUser.tasks?.inviteFriend),
  };
  merged.chestStats = {
    opened: numeric(oldUser.chestStats?.opened) + numeric(newUser.chestStats?.opened),
    lastReward: timestamp(oldUser.updatedAt) > timestamp(newUser.updatedAt)
      ? String(oldUser.chestStats?.lastReward || '')
      : String(newUser.chestStats?.lastReward || ''),
  };
  merged.welcomeBonusClaimed = Boolean(oldUser.welcomeBonusClaimed || newUser.welcomeBonusClaimed);

  const fullTransactions = mergeSubdocuments(
    oldUser.transactions,
    newUser.transactions,
    ['type', 'amount', 'title', 'status', 'createdAt']
  );
  const fullNotifications = mergeSubdocuments(
    oldUser.notifications,
    newUser.notifications,
    ['type', 'message', 'createdAt']
  );
  const fullWithdrawals = mergeSubdocuments(
    oldUser.withdrawalRequests,
    newUser.withdrawalRequests,
    ['amount', 'eurAmount', 'status', 'createdAt']
  );
  const fullSecurityLogs = mergeSubdocuments(
    oldUser.securityLogs,
    newUser.securityLogs,
    ['type', 'title', 'details', 'createdAt']
  );
  merged.transactions = fullTransactions.slice(0, ACTIVE_TRANSACTION_LIMIT);
  merged.notifications = fullNotifications.slice(0, ACTIVE_NOTIFICATION_LIMIT);
  merged.withdrawalRequests = fullWithdrawals.slice(0, ACTIVE_WITHDRAWAL_LIMIT);
  merged.securityLogs = fullSecurityLogs.slice(0, ACTIVE_SECURITY_LOG_LIMIT);
  merged.adminNotes = mergeSubdocuments(oldUser.adminNotes, newUser.adminNotes, ['text', 'adminTelegramId', 'createdAt']);
  merged.frontendErrorLogs = mergeSubdocuments(
    oldUser.frontendErrorLogs,
    newUser.frontendErrorLogs,
    ['message', 'appVersion', 'createdAt']
  );

  merged.referredBy = oldUser.referredBy || newUser.referredBy || null;
  const referralSources = [oldUser, newUser].filter(
    (user) => user.referredBy && user.referredBy === merged.referredBy
  );
  merged.referredByUsername = referralSources.find((user) => user.referredByUsername)?.referredByUsername || null;
  merged.referredByBonusPaid = referralSources.some((user) => Boolean(user.referredByBonusPaid));
  merged.referredByQualifiedAt = Math.max(
    ...referralSources.map((user) => numeric(user.referredByQualifiedAt)),
    0
  ) || null;
  merged.referralsCount = numeric(oldUser.referralsCount) + numeric(newUser.referralsCount);
  const dailyReferralWindow = mergeReferralWindow(
    oldUser,
    newUser,
    'lastReferralBonusDay',
    'dailyReferralBonusCount'
  );
  const hourlyReferralWindow = mergeReferralWindow(
    oldUser,
    newUser,
    'lastReferralBonusHour',
    'hourlyReferralBonusCount'
  );
  merged.lastReferralBonusDay = dailyReferralWindow.key;
  merged.dailyReferralBonusCount = dailyReferralWindow.count;
  merged.lastReferralBonusHour = hourlyReferralWindow.key;
  merged.hourlyReferralBonusCount = hourlyReferralWindow.count;
  merged.lastReferralUsername = timestamp(oldUser.updatedAt) > timestamp(newUser.updatedAt)
    ? oldUser.lastReferralUsername || null
    : newUser.lastReferralUsername || null;

  const dailyState = selectLatestDailyState(oldUser, newUser);
  for (const field of ['dailyRewardLastClaim', 'dailyStreak', 'lastDailyClaimDay', 'lastDailyRewardDate']) {
    merged[field] = cloneValue(dailyState[field]);
  }
  merged.lastWithdrawalCheckAt = Math.max(
    numeric(oldUser.lastWithdrawalCheckAt),
    numeric(newUser.lastWithdrawalCheckAt)
  );
  for (const field of ['lastSeenAt', 'lastTapAt', 'lastUpgradeBuyAt']) {
    merged[field] = Math.max(numeric(oldUser[field]), numeric(newUser[field]));
  }
  merged.lastSeenSeasonPrizeWeek = [oldUser.lastSeenSeasonPrizeWeek, newUser.lastSeenSeasonPrizeWeek]
    .filter(Boolean)
    .sort()
    .at(-1) || '';
  merged.selectedTitle = oldUser.selectedTitle || newUser.selectedTitle || 'ONIX Player';
  merged.teamName = oldUser.teamName || newUser.teamName || '';
  merged.teamJoinedAt = merged.teamName === oldUser.teamName
    ? numeric(oldUser.teamJoinedAt)
    : numeric(newUser.teamJoinedAt);

  merged.isFrozen = Boolean(oldUser.isFrozen || newUser.isFrozen);
  merged.isSuspicious = Boolean(oldUser.isSuspicious || newUser.isSuspicious);
  merged.frozenReason = oldUser.frozenReason || newUser.frozenReason || '';

  merged.lastOfflineIncome = numeric(newUser.lastOfflineIncome);
  merged.lastOfflineSeconds = numeric(newUser.lastOfflineSeconds);
  merged.pendingOfflineIncome = roundOnix(
    numeric(oldUser.pendingOfflineIncome) + numeric(newUser.pendingOfflineIncome)
  );
  merged.pendingOfflineSeconds = numeric(oldUser.pendingOfflineSeconds) + numeric(newUser.pendingOfflineSeconds);
  merged.lastMineTickAt = now;
  merged.minerRemainder = numeric(oldUser.minerRemainder) + numeric(newUser.minerRemainder);
  Object.assign(merged, selectActiveBoost(oldUser, newUser, now));
  merged.tapTimestamps = uniqueScalars(oldUser.tapTimestamps, newUser.tapTimestamps)
    .map(Number)
    .filter((value) => Number.isFinite(value) && value >= now - TAP_WINDOW_MS)
    .sort((left, right) => left - right);

  const currentDropUsers = [oldUser, newUser].filter((user) => user.onixDrop?.dayKey === currentDay);
  merged.onixDrop = {
    dayKey: currentDay,
    attemptsUsed: currentDropUsers.reduce((sum, user) => sum + numeric(user.onixDrop?.attemptsUsed), 0),
    dailyEarned: roundOnix(currentDropUsers.reduce((sum, user) => sum + numeric(user.onixDrop?.dailyEarned), 0)),
    bestScore: Math.max(numeric(oldUser.onixDrop?.bestScore), numeric(newUser.onixDrop?.bestScore)),
    sessionId: '',
    sessionStartedAt: 0,
    sessionExpiresAt: 0,
  };

  const attributionCandidates = [oldUser.trafficAttribution, newUser.trafficAttribution]
    .filter(Boolean)
    .sort((left, right) => timestamp(left.firstSeenAt) - timestamp(right.firstSeenAt));
  if (attributionCandidates.length) merged.trafficAttribution = cloneValue(attributionCandidates[0]);
  else delete merged.trafficAttribution;

  return {
    user: merged,
    fullHistories: {
      transactions: fullTransactions,
      notifications: fullNotifications,
      withdrawalRequests: fullWithdrawals,
      securityLogs: fullSecurityLogs,
    },
  };
}

function summarizeUser(user) {
  return {
    telegramId: String(user.telegramId),
    balance: roundOnix(user.balance),
    totalEarned: roundOnix(user.totalEarned),
    level: numeric(user.level, 1),
    totalTaps: numeric(user.totalTaps),
    tapPower: numeric(user.tapPower, 1),
    maxEnergy: numeric(user.maxEnergy, 500),
    minerLevel: numeric(user.minerLevel, 1),
    totalUpgradesBought: numeric(user.totalUpgradesBought),
    offlineClaimsCount: numeric(user.offlineClaimsCount),
    transactionsCount: (user.transactions || []).length,
    withdrawalsCount: (user.withdrawalRequests || []).length,
    referralsCount: numeric(user.referralsCount),
    referredBy: user.referredBy || null,
    teamName: user.teamName || '',
    isFrozen: Boolean(user.isFrozen),
    isSuspicious: Boolean(user.isSuspicious),
  };
}

function buildRecoveryPreview(oldUser, newUser, options = {}) {
  const blockers = [
    ...validateRecoverySafety(oldUser, newUser, options.now),
    ...validateIncomingReferralSafety(oldUser, newUser, options.incomingReferrals),
    ...(options.additionalBlockers || []),
  ];
  if (blockers.length) {
    throw new AccountRecoveryError('RECOVERY_BLOCKED', 'Account recovery safety checks failed', 409, blockers);
  }
  const merged = buildMergedUser(oldUser, newUser, options);
  const weeklyScorePlan = buildRecoveryWeeklyScorePlan(
    oldUser,
    newUser,
    options.weeklyScores,
    options
  );
  return {
    old: summarizeUser(oldUser),
    new: summarizeUser(newUser),
    merged: {
      ...summarizeUser(merged.user),
      weeklyEarned: merged.user.weeklyEarned,
      weeklyEarnedWeek: merged.user.weeklyEarnedWeek,
      tapLevel: merged.user.tapLevel,
      minerLevel: merged.user.minerLevel,
      energyLevel: merged.user.energyLevel,
      rechargeLevel: merged.user.rechargeLevel,
      transactionsCountBeforeLimit: merged.fullHistories.transactions.length,
      activeTransactionsCount: merged.user.transactions.length,
      gg7000Retained:
        merged.user.usedPromoCodes.includes('GG7000') &&
        merged.fullHistories.transactions.some((item) =>
          item.type === 'income_promo' && /GG7000/i.test(String(item.title || ''))
        ),
      analyticsHandling: 'Historical AnalyticsEvent documents remain immutable; audit alias OLD -> NEW is stored',
      weeklyScoreRecovery: weeklyScorePlan.actions.map((action) => ({
        week: action.week,
        operation: action.operation,
        weeklyEarned: action.target.weeklyEarned,
      })),
    },
    safety: { allowed: true, blockers: [] },
  };
}

function confirmationPhrase(oldTelegramId, newTelegramId) {
  return `RECOVER ${oldTelegramId} INTO ${newTelegramId}`;
}

function encodeTokenPart(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function signTokenPart(encodedPayload, secret) {
  return crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

function createPreviewToken(payload, secret, now = Date.now()) {
  if (!secret) throw new AccountRecoveryError('RECOVERY_SECRET_MISSING', 'Account recovery is not configured', 503);
  const encoded = encodeTokenPart({
    ...payload,
    issuedAt: now,
    expiresAt: now + PREVIEW_TOKEN_TTL_MS,
  });
  return `${encoded}.${signTokenPart(encoded, secret)}`;
}

function verifyPreviewToken(token, secret, now = Date.now()) {
  if (!secret) throw new AccountRecoveryError('RECOVERY_SECRET_MISSING', 'Account recovery is not configured', 503);
  const [encoded, providedSignature, extra] = String(token || '').split('.');
  if (!encoded || !providedSignature || extra) {
    throw new AccountRecoveryError('INVALID_PREVIEW_TOKEN', 'Preview token is invalid', 403);
  }
  const expectedSignature = signTokenPart(encoded, secret);
  const actual = Buffer.from(providedSignature, 'utf8');
  const expected = Buffer.from(expectedSignature, 'utf8');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw new AccountRecoveryError('INVALID_PREVIEW_TOKEN', 'Preview token is invalid', 403);
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    throw new AccountRecoveryError('INVALID_PREVIEW_TOKEN', 'Preview token is invalid', 403);
  }
  if (numeric(payload.expiresAt) < now) {
    throw new AccountRecoveryError('PREVIEW_TOKEN_EXPIRED', 'Preview token has expired', 409);
  }
  return payload;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function versionDescriptor(user) {
  return {
    id: String(user._id),
    version: numeric(user.__v),
    updatedAt: timestamp(user.updatedAt),
  };
}

function assertVersion(user, expected, label) {
  const current = versionDescriptor(user);
  if (
    current.id !== String(expected?.id || '') ||
    current.version !== numeric(expected?.version) ||
    current.updatedAt !== numeric(expected?.updatedAt)
  ) {
    throw new AccountRecoveryError(
      'RECOVERY_VERSION_MISMATCH',
      `${label} user changed after preview`,
      409
    );
  }
}

async function loadLinkedRecords(connection, oldTelegramId, newTelegramId, session) {
  const ids = [oldTelegramId, newTelegramId];
  const options = { session };
  const [weeklyScores, weeklyPrizes, trafficEvents, analyticsEvents, pendingLaunches, incomingReferrals] =
    await Promise.all([
      connection.collection('weeklyscores').find({ telegramId: { $in: ids } }, options).toArray(),
      connection.collection('weeklyprizes').find({ 'winners.telegramId': { $in: ids } }, options).toArray(),
      connection.collection('traffic_events').find({ telegramId: { $in: ids } }, options).toArray(),
      connection.collection('analytics_events').find({ telegramId: { $in: ids } }, options).toArray(),
      connection.collection('pending_telegram_launches').find({ telegramId: { $in: ids } }, options).toArray(),
      connection.collection('users').find(
        { referredBy: { $in: ids } },
        { ...options, projection: { _id: 1, telegramId: 1, referredBy: 1, __v: 1, updatedAt: 1 } }
      ).toArray(),
    ]);
  return { weeklyScores, weeklyPrizes, trafficEvents, analyticsEvents, pendingLaunches, incomingReferrals };
}

function estimateBackupBytes(value) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

async function performRecoveryTransaction({
  connection,
  session,
  recoveryId,
  previewTokenHash,
  tokenPayload,
  initiatedBy,
  now = Date.now(),
}) {
  const users = connection.collection('users');
  const recoveries = connection.collection('account_recoveries');
  const existing = await recoveries.findOne({ recoveryId }, { session });
  if (existing?.status === 'completed') {
    return { alreadyCompleted: true, result: existing.result, recoveryId };
  }

  const oldTelegramId = String(tokenPayload.oldTelegramId);
  const newTelegramId = String(tokenPayload.newTelegramId);
  const [oldUser, newUser, newIdentityCount] = await Promise.all([
    users.findOne({ telegramId: oldTelegramId }, { session }),
    users.findOne({ telegramId: newTelegramId }, { session }),
    users.countDocuments({ telegramId: newTelegramId }, { session, limit: 2 }),
  ]);
  if (!oldUser) throw new AccountRecoveryError('OLD_USER_NOT_FOUND', 'Old user was not found', 404);
  if (!newUser) throw new AccountRecoveryError('NEW_USER_NOT_FOUND', 'New user was not found', 404);
  if (newIdentityCount !== 1) {
    throw new AccountRecoveryError('NEW_IDENTITY_CONFLICT', 'New Telegram ID is not unique', 409);
  }
  assertVersion(oldUser, tokenPayload.oldVersion, 'Old');
  assertVersion(newUser, tokenPayload.newVersion, 'New');
  const blockers = validateRecoverySafety(oldUser, newUser, now);
  if (blockers.length) {
    throw new AccountRecoveryError('RECOVERY_BLOCKED', 'Account recovery safety checks failed', 409, blockers);
  }

  const referralGraphBlockers = await validateReferralGraphSafety(
    users,
    oldUser,
    newUser,
    session
  );
  if (referralGraphBlockers.length) {
    throw new AccountRecoveryError(
      'RECOVERY_BLOCKED',
      'Account recovery safety checks failed',
      409,
      referralGraphBlockers
    );
  }

  const linkedRecords = await loadLinkedRecords(connection, oldTelegramId, newTelegramId, session);
  const referralBlockers = validateIncomingReferralSafety(
    oldUser,
    newUser,
    linkedRecords.incomingReferrals
  );
  if (referralBlockers.length) {
    throw new AccountRecoveryError(
      'RECOVERY_BLOCKED',
      'Account recovery safety checks failed',
      409,
      referralBlockers
    );
  }
  const merged = buildMergedUser(oldUser, newUser, { now });
  const weeklyScorePlan = buildRecoveryWeeklyScorePlan(
    oldUser,
    newUser,
    linkedRecords.weeklyScores,
    { now }
  );
  const backup = {
    oldUser: cloneValue(oldUser),
    newUser: cloneValue(newUser),
    linkedRecords: cloneValue(linkedRecords),
    weeklyScoreRecoveryPlan: cloneValue(weeklyScorePlan),
    fullMergedHistories: cloneValue(merged.fullHistories),
    oldVersion: cloneValue(tokenPayload.oldVersion),
    newVersion: cloneValue(tokenPayload.newVersion),
  };
  if (estimateBackupBytes(backup) > MAX_BACKUP_BYTES) {
    throw new AccountRecoveryError('RECOVERY_BACKUP_TOO_LARGE', 'Recovery backup exceeds the safe size limit', 409);
  }

  await recoveries.insertOne({
    recoveryId,
    oldTelegramId,
    newTelegramId,
    status: 'processing',
    previewTokenHash,
    initiatedBy: String(initiatedBy),
    backup,
    analyticsAlias: { oldTelegramId, newTelegramId },
    generatedAt: new Date(now),
    completedAt: null,
  }, { session });

  const weeklyScoreRecovery = await applyRecoveryWeeklyScorePlan(
    connection.collection('weeklyscores'),
    weeklyScorePlan,
    session
  );

  await users.updateMany(
    { referredBy: oldTelegramId },
    { $set: { referredBy: newTelegramId } },
    { session }
  );
  merged.user.referralsCount = await users.countDocuments({ referredBy: newTelegramId }, { session });

  const replacement = await users.replaceOne(
    { _id: newUser._id, __v: newUser.__v, telegramId: newTelegramId },
    merged.user,
    { session }
  );
  if (replacement.matchedCount !== 1) {
    throw new AccountRecoveryError('RECOVERY_VERSION_MISMATCH', 'New user changed during recovery', 409);
  }

  const removed = await users.deleteOne(
    { _id: oldUser._id, __v: oldUser.__v, telegramId: oldTelegramId },
    { session }
  );
  if (removed.deletedCount !== 1) {
    throw new AccountRecoveryError('RECOVERY_VERSION_MISMATCH', 'Old user changed during recovery', 409);
  }

  const result = {
    telegramId: newTelegramId,
    oldTelegramId,
    balance: merged.user.balance,
    totalEarned: merged.user.totalEarned,
    level: merged.user.level,
    totalTaps: merged.user.totalTaps,
    transactionsCount: merged.user.transactions.length,
    archivedTransactionsCount: merged.fullHistories.transactions.length,
    gg7000Retained:
      merged.user.usedPromoCodes.includes('GG7000') &&
      merged.fullHistories.transactions.some((item) =>
        item.type === 'income_promo' && /GG7000/i.test(String(item.title || ''))
      ),
    analyticsEventsRewritten: false,
    weeklyScoreRecovery,
  };
  const completedRecovery = await recoveries.updateOne(
    { recoveryId, status: 'processing' },
    { $set: { status: 'completed', completedAt: new Date(now), result } },
    { session }
  );
  if (completedRecovery.matchedCount !== 1) {
    throw new AccountRecoveryError('RECOVERY_AUDIT_MISMATCH', 'Recovery audit record changed during recovery', 409);
  }
  return { alreadyCompleted: false, result, recoveryId };
}

async function executeRecovery({ mongoose, ...options }) {
  const session = await mongoose.startSession();
  let outcome;
  try {
    await session.withTransaction(
      async () => {
        outcome = await performRecoveryTransaction({
          connection: mongoose.connection,
          session,
          ...options,
        });
      },
      {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        readPreference: 'primary',
      }
    );
    return outcome;
  } finally {
    await session.endSession();
  }
}

module.exports = {
  ACTIVE_TRANSACTION_LIMIT,
  AccountRecoveryError,
  applyRecoveryWeeklyScorePlan,
  buildMergedUser,
  buildRecoveryPreview,
  buildRecoveryWeeklyScorePlan,
  calculateLeague,
  calculateLevel,
  confirmationPhrase,
  createPreviewToken,
  executeRecovery,
  getIsoWeekKey,
  hashToken,
  performRecoveryTransaction,
  validateRecoverySafety,
  validateIncomingReferralSafety,
  validateReferralGraphSafety,
  verifyPreviewToken,
  versionDescriptor,
};
