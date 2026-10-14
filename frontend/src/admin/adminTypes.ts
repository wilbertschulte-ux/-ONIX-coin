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
