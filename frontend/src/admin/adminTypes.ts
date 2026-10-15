import type { MessageKey } from '../i18n';

export type AdminSectionId =
  | 'overview'
  | 'users'
  | 'withdrawals'
  | 'prizes'
  | 'economy'
  | 'analytics'
  | 'security'
  | 'broadcast'
  | 'settings'
  | 'launch';

export type AdminNavigationItem = {
  id: AdminSectionId;
  icon: string;
  labelKey: MessageKey;
  hintKey: MessageKey;
  available: boolean;
  mobilePrimary?: boolean;
};

export type AdminHealthResponse = {
  ok: boolean;
  service?: string;
  version?: string;
  users?: number;
  week?: string;
  time?: number;
};

export type AdminCollectionState = 'loading' | 'error' | 'empty' | 'ready';

export function getAdminCollectionState(loading: boolean, error: boolean, count: number): AdminCollectionState {
  if (loading) return 'loading';
  if (error) return 'error';
  if (count === 0) return 'empty';
  return 'ready';
}

export type AdminUserSummary = {
  telegramId: string;
  username: string;
  telegramUsername?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  languageCode?: string;
  photoUrl?: string;
  telegramProfileUrl?: string;
  balance: number;
  totalEarned: number;
  weeklyEarned: number;
  referralsCount: number;
  totalTaps: number;
  level?: number;
  selectedTitle?: string;
  league?: string;
  isSuspicious: boolean;
  isFrozen: boolean;
  frozenReason: string;
  createdAt?: string | number | null;
  updatedAt?: string | number | null;
};

export type AdminUserProfile = AdminUserSummary & {
  totalBoostsUsed: number;
  totalUpgradesBought: number;
  offlineClaimsCount: number;
  level: number;
  energy?: number;
  maxEnergy?: number;
  tapPower?: number;
  energyRecharge?: number;
  autoclickers?: number;
  tapLevel?: number;
  minerLevel?: number;
  energyLevel?: number;
  rechargeLevel?: number;
  completedTasksCount?: number;
  usedPromoCodesCount?: number;
  withdrawalRequestsCount?: number;
  lastTapAt?: string | number | null;
  suspiciousReasons?: string[];
};

export type AdminUserSearchResponse = {
  users: AdminUserSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
  query: string;
};

export function createAdminUserSearchParams(telegramId: string, query: string, page: number) {
  return {
    telegramId,
    query: query.trim(),
    page: Math.max(1, Math.trunc(Number(page) || 1)),
    limit: 50,
  };
}

export type AdminWithdrawalRequest = {
  userTelegramId: string;
  username: string;
  requestIndex: number;
  amount: number;
  eurAmount: number;
  status: string;
  adminComment: string;
  createdAt: number;
  reviewedAt: number | null;
  userStats: {
    balance: number;
    totalEarned: number;
    weeklyEarned: number;
    referralsCount: number;
    totalTaps: number;
    totalBoostsUsed: number;
    totalUpgradesBought: number;
    ownedPerksCount: number;
    achievementsCompleted: number;
    isSuspicious: boolean;
    suspiciousReasons: string[];
  };
};

export type AdminWithdrawalsResponse = {
  status: string;
  requests: AdminWithdrawalRequest[];
};

export type AdminWithdrawalAction = 'approved' | 'rejected';

export function createWithdrawalReviewPayload(
  telegramId: string,
  request: AdminWithdrawalRequest,
  action: AdminWithdrawalAction,
  adminComment: string
) {
  return {
    telegramId,
    userTelegramId: request.userTelegramId,
    requestIndex: request.requestIndex,
    action,
    adminComment,
  };
}

export type AdminWeeklyPrizeWinner = {
  place: number;
  telegramId: string;
  username: string;
  weeklyEarned: number;
  prize: number;
  totalEarned?: number;
  balance?: number;
};

export type AdminWeeklyPrizeDiagnostics = {
  targetWeek: string;
  sourceUsersCount: number | null;
  materializedWeeklyScoreCount: number | null;
  eligibleCount: number | null;
  alreadyAwarded: boolean;
  winnersCount: number | null;
};

export type AdminWeeklyPrizePreviewResponse = {
  week: string;
  alreadyAwarded: boolean;
  awardedAt: number | string | null;
  awardedWinners: AdminWeeklyPrizeWinner[];
  diagnostics: AdminWeeklyPrizeDiagnostics;
  preview: AdminWeeklyPrizeWinner[];
};

export type AdminWeeklyPrizeAwardResponse = {
  status: string;
  week: string;
  winners: AdminWeeklyPrizeWinner[];
  diagnostics: AdminWeeklyPrizeDiagnostics;
};

export type AdminWeeklyPrizeViewState = 'loading' | 'error' | 'empty' | 'already-awarded' | 'ready';

export function getAdminWeeklyPrizeViewState(
  loading: boolean,
  error: boolean,
  preview: AdminWeeklyPrizePreviewResponse | null
): AdminWeeklyPrizeViewState {
  if (loading) return 'loading';
  if (error) return 'error';
  if (!preview) return 'empty';
  if (preview.alreadyAwarded) return 'already-awarded';
  if (preview.preview.length === 0) return 'empty';
  return 'ready';
}

export function createWeeklyPrizeAwardPayload(telegramId: string, week: string) {
  return {
    telegramId,
    confirm: 'AWARD_WEEKLY_PRIZES',
    week,
  };
}

export type AdminSecurityTab = 'suspicious' | 'security-logs' | 'frontend-errors';

export type AdminSuspiciousUser = {
  telegramId: string;
  username: string;
  balance: number;
  totalEarned: number;
  weeklyEarned: number;
  referralsCount: number;
  totalTaps: number;
  isSuspicious: boolean;
  suspiciousReasons: string[];
  isFrozen: boolean;
  frozenReason: string;
};

export type AdminSuspiciousUsersResponse = {
  users: AdminSuspiciousUser[];
};

export type AdminFreezeUserResponse = {
  message: string;
  user: {
    telegramId: string;
    username: string;
    isFrozen: boolean;
    frozenReason: string;
  };
};

export type AdminSecurityLog = {
  telegramId: string;
  username: string;
  isFrozen: boolean;
  isSuspicious: boolean;
  type: string;
  title: string;
  details: string;
  createdAt: number;
};

export type AdminSecurityLogsResponse = {
  logs: AdminSecurityLog[];
};

export type AdminFrontendErrorLog = {
  telegramId: string;
  username: string;
  message: string;
  stack: string;
  appVersion: string;
  createdAt: number;
};

export type AdminFrontendErrorsResponse = {
  logs: AdminFrontendErrorLog[];
};

export function createAdminFreezePayload(
  telegramId: string,
  user: Pick<AdminSuspiciousUser, 'telegramId' | 'isFrozen'>,
  reason: string
) {
  return {
    telegramId,
    targetTelegramId: user.telegramId,
    freeze: !user.isFrozen,
    reason: user.isFrozen ? '' : reason.trim(),
  };
}

export function applyAdminFreezeResult(
  users: AdminSuspiciousUser[],
  result: AdminFreezeUserResponse['user']
) {
  return users.map((user) => user.telegramId === result.telegramId
    ? { ...user, isFrozen: result.isFrozen, frozenReason: result.frozenReason }
    : user);
}
