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
  transactions: AdminUserTransaction[];
  withdrawalRequests: AdminUserWithdrawal[];
  securityLogs: AdminUserSecurityLog[];
  adminNotes: AdminUserNote[];
};

export type AdminUserTransaction = {
  type: string;
  amount: number;
  title: string;
  status: string;
  createdAt: number;
};

export type AdminUserWithdrawal = {
  amount: number;
  eurAmount: number;
  status: string;
  adminComment: string;
  reviewedAt: number | null;
  reviewedBy: string;
  createdAt: number;
};

export type AdminUserSecurityLog = {
  type: string;
  title: string;
  details: string;
  createdAt: number;
};

export type AdminUserNote = {
  text: string;
  adminTelegramId: string;
  createdAt: number;
};

export type AdminProfileViewState = 'loading' | 'error' | 'selected' | 'empty';

export function getAdminProfileViewState(
  loading: boolean,
  error: boolean,
  profile: AdminUserProfile | null
): AdminProfileViewState {
  if (loading) return 'loading';
  if (error) return 'error';
  if (profile) return 'selected';
  return 'empty';
}

export function parseAdminBalanceAmount(value: string): number | null {
  if (!value.trim()) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount !== 0 ? amount : null;
}

export function createAdminBalanceAdjustmentPayload(
  telegramId: string,
  targetTelegramId: string,
  amount: number,
  reason: string
) {
  return { telegramId, targetTelegramId, amount, reason: reason.trim() };
}

export function createAdminBanPayload(
  telegramId: string,
  targetTelegramId: string,
  ban: boolean,
  reason: string
) {
  return { telegramId, targetTelegramId, ban, reason: ban ? reason.trim() : '' };
}

export function createAdminNotePayload(telegramId: string, targetTelegramId: string, text: string) {
  return { telegramId, targetTelegramId, text };
}

export function acquireAdminMutationLock(lock: { current: boolean }): boolean {
  if (lock.current) return false;
  lock.current = true;
  return true;
}

export function releaseAdminMutationLock(lock: { current: boolean }): void {
  lock.current = false;
}

export type AdminProfileMutationKind = 'balance' | 'ban' | 'unban' | 'note';

export function getAdminProfileMutationNoticeKey(kind: AdminProfileMutationKind, success: boolean): MessageKey {
  if (kind === 'note') return success ? 'admin.notes.success' : 'admin.notes.error';
  if (kind === 'balance') return success ? 'admin.players.balanceSuccess' : 'admin.players.balanceError';
  if (!success) return 'admin.players.banError';
  return kind === 'ban' ? 'admin.players.banSuccess' : 'admin.players.unbanSuccess';
}

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

export type AdminEconomyTotals = {
  users: number;
  frozenUsers: number;
  suspiciousUsers: number;
  totalBalance: number;
  totalEarned: number;
  weeklyEarned: number;
  referrals: number;
  taps: number;
  pendingWithdrawals: number;
  pendingWithdrawOnix: number;
  approvedWithdrawals: number;
  rejectedWithdrawals: number;
  createdOnix: number;
  spentOnix: number;
  totalBalanceEur: number;
  pendingWithdrawEur: number;
};

export type AdminEconomyTransactionType = {
  type: string;
  count: number;
  amount: number;
};

export type AdminEconomyDashboardResponse = {
  economyConfig: Record<string, number>;
  totals: AdminEconomyTotals;
  transactionTypes: AdminEconomyTransactionType[];
};

export type AdminEconomyViewState = 'loading' | 'error' | 'empty' | 'ready';
export type AdminEconomyMetricUnit = 'count' | 'onix' | 'eur';
export type AdminEconomyMetricLabelKey =
  | 'admin.economy.players'
  | 'admin.economy.totalEarned'
  | 'admin.economy.weeklyEarned'
  | 'admin.economy.referrals'
  | 'admin.economy.taps'
  | 'admin.economy.balance'
  | 'admin.economy.positiveTransactionAmount'
  | 'admin.economy.negativeTransactionAmount'
  | 'admin.economy.totalBalanceEur'
  | 'admin.economy.pendingWithdrawals'
  | 'admin.economy.pendingWithdrawalAmount'
  | 'admin.economy.approvedWithdrawals'
  | 'admin.economy.rejectedWithdrawals'
  | 'admin.economy.pendingWithdrawEur'
  | 'admin.economy.suspicious'
  | 'admin.economy.frozen';
export type AdminEconomyGroupTitleKey =
  | 'admin.economy.activityMetrics'
  | 'admin.economy.balanceMetrics'
  | 'admin.economy.withdrawalMetrics'
  | 'admin.economy.riskMetrics';
export type AdminEconomyMetric = {
  key: keyof AdminEconomyTotals;
  labelKey: AdminEconomyMetricLabelKey;
  value: number;
  unit: AdminEconomyMetricUnit;
};

export function getAdminEconomyViewState(
  loading: boolean,
  error: boolean,
  dashboard: AdminEconomyDashboardResponse | null
): AdminEconomyViewState {
  if (loading) return 'loading';
  if (error) return 'error';
  return dashboard ? 'ready' : 'empty';
}

export function getAdminEconomyMetricGroups(dashboard: AdminEconomyDashboardResponse) {
  const { totals } = dashboard;
  const metric = (key: keyof AdminEconomyTotals, labelKey: AdminEconomyMetricLabelKey, unit: AdminEconomyMetricUnit): AdminEconomyMetric => ({
    key,
    labelKey,
    value: Number(totals[key] || 0),
    unit,
  });

  return [
    {
      id: 'activity',
      titleKey: 'admin.economy.activityMetrics' as AdminEconomyGroupTitleKey,
      metrics: [
        metric('users', 'admin.economy.players', 'count'),
        metric('totalEarned', 'admin.economy.totalEarned', 'onix'),
        metric('weeklyEarned', 'admin.economy.weeklyEarned', 'onix'),
        metric('referrals', 'admin.economy.referrals', 'count'),
        metric('taps', 'admin.economy.taps', 'count'),
      ],
    },
    {
      id: 'balances',
      titleKey: 'admin.economy.balanceMetrics' as AdminEconomyGroupTitleKey,
      metrics: [
        metric('totalBalance', 'admin.economy.balance', 'onix'),
        metric('createdOnix', 'admin.economy.positiveTransactionAmount', 'onix'),
        metric('spentOnix', 'admin.economy.negativeTransactionAmount', 'onix'),
        metric('totalBalanceEur', 'admin.economy.totalBalanceEur', 'eur'),
      ],
    },
    {
      id: 'withdrawals',
      titleKey: 'admin.economy.withdrawalMetrics' as AdminEconomyGroupTitleKey,
      metrics: [
        metric('pendingWithdrawals', 'admin.economy.pendingWithdrawals', 'count'),
        metric('pendingWithdrawOnix', 'admin.economy.pendingWithdrawalAmount', 'onix'),
        metric('approvedWithdrawals', 'admin.economy.approvedWithdrawals', 'count'),
        metric('rejectedWithdrawals', 'admin.economy.rejectedWithdrawals', 'count'),
        metric('pendingWithdrawEur', 'admin.economy.pendingWithdrawEur', 'eur'),
      ],
    },
    {
      id: 'risk',
      titleKey: 'admin.economy.riskMetrics' as AdminEconomyGroupTitleKey,
      metrics: [
        metric('suspiciousUsers', 'admin.economy.suspicious', 'count'),
        metric('frozenUsers', 'admin.economy.frozen', 'count'),
      ],
    },
  ];
}

export type AdminOperationWithdrawal = {
  telegramId: string;
  username: string;
  amount: number;
  eurAmount: number;
  status: string;
  adminComment?: string;
  reviewedAt?: number | null;
  reviewedBy?: string;
  createdAt?: number;
};

export type AdminOperationTransaction = {
  telegramId: string;
  username: string;
  type: string;
  amount: number;
  title?: string;
  status?: string;
  createdAt?: number;
};

export type AdminOperationsResponse = {
  withdrawals: AdminOperationWithdrawal[];
  transactions: AdminOperationTransaction[];
};

export function getAdminOperationsViewState(
  loading: boolean,
  error: boolean,
  operations: AdminOperationsResponse | null
): AdminCollectionState {
  return getAdminCollectionState(
    loading,
    error,
    Number(operations?.withdrawals?.length || 0) + Number(operations?.transactions?.length || 0)
  );
}

export function getAdminOperationPreview(operations: AdminOperationsResponse, limit = 50) {
  const safeLimit = Math.max(1, Math.trunc(Number(limit) || 50));
  return {
    withdrawalTotal: operations.withdrawals.length,
    transactionTotal: operations.transactions.length,
    withdrawals: operations.withdrawals.slice(0, safeLimit),
    transactions: operations.transactions.slice(0, safeLimit),
  };
}

export type AdminEconomyConfig = {
  onixEurPer1000: number;
  minWithdrawOnix: number;
  referralReward: number;
  referredUserReward: number;
  welcomeBonus: number;
  maxPaidReferralsPerDay: number;
  maxPaidReferralsPerHour: number;
  chestCost: number;
  dailyMissionBaseReward: number;
  weeklyMissionBaseReward: number;
  seasonPrizes: Record<string, number>;
  upgradeBaseCosts: Record<string, number>;
  perkBaseCosts: Record<string, number>;
};

export type AdminEconomyConfigResponse = {
  config: AdminEconomyConfig;
  overrides: Record<string, number>;
};

export type AdminVersionResponse = {
  version: string;
  service: string;
  time: number;
};

export type AdminSettingsLoadState = 'loading' | 'error' | 'ready';

export function getAdminSettingsLoadState(loading: boolean, error: boolean): AdminSettingsLoadState {
  if (loading) return 'loading';
  if (error) return 'error';
  return 'ready';
}

export type AdminExportKind = 'json' | 'csv';

export type AdminExportDownload = {
  blob: Blob;
  filename: 'onix-backup.json' | 'onix-users.csv';
  contentType: 'application/json' | 'text/csv';
};

export const ADMIN_EXPORT_DEFINITIONS = {
  json: { filename: 'onix-backup.json', contentType: 'application/json' },
  csv: { filename: 'onix-users.csv', contentType: 'text/csv' },
} as const satisfies Record<AdminExportKind, Omit<AdminExportDownload, 'blob'>>;

export function triggerAdminDownload(
  download: AdminExportDownload,
  browser: Pick<Document, 'createElement'> = document,
  objectUrls: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'> = URL
) {
  const objectUrl = objectUrls.createObjectURL(download.blob);
  try {
    const anchor = browser.createElement('a');
    anchor.href = objectUrl;
    anchor.download = download.filename;
    anchor.click();
  } finally {
    objectUrls.revokeObjectURL(objectUrl);
  }
}
