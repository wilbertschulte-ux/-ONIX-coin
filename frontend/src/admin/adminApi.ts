import axios from 'axios';
import {
  createAdminUserSearchParams,
  createAdminBroadcastPayload,
  createAdminAnalyticsParams,
  ADMIN_EXPORT_DEFINITIONS,
  createAdminFreezePayload,
  createAdminBalanceAdjustmentPayload,
  createAdminBanPayload,
  createAdminNotePayload,
  createWeeklyPrizeAwardPayload,
  createWithdrawalReviewPayload,
  type AdminHealthResponse,
  type AdminEconomyDashboardResponse,
  type AdminFrontendErrorsResponse,
  type AdminFreezeUserResponse,
  type AdminSecurityLogsResponse,
  type AdminOperationsResponse,
  type AdminEconomyConfigResponse,
  type AdminExportDownload,
  type AdminVersionResponse,
  type AdminBroadcastResponse,
  type AdminAnalyticsDashboardResponse,
  type AdminAnalyticsFilters,
  type AdminSuspiciousUser,
  type AdminSuspiciousUsersResponse,
  type AdminUserProfile,
  type AdminUserSearchResponse,
  type AdminWithdrawalAction,
  type AdminWithdrawalRequest,
  type AdminWithdrawalsResponse,
  type AdminWeeklyPrizeAwardResponse,
  type AdminWeeklyPrizePreviewResponse,
} from './adminTypes';

export async function loadAdminHealth(apiBaseUrl: string): Promise<AdminHealthResponse> {
  const response = await axios.get<AdminHealthResponse>(`${apiBaseUrl}/health`);
  return response.data;
}

export async function searchAdminUsers(
  apiBaseUrl: string,
  telegramId: string,
  query: string,
  page: number
): Promise<AdminUserSearchResponse> {
  const response = await axios.get<AdminUserSearchResponse>(`${apiBaseUrl}/admin-search-users`, {
    params: createAdminUserSearchParams(telegramId, query, page),
  });
  return response.data;
}

export async function loadAdminUserProfile(
  apiBaseUrl: string,
  telegramId: string,
  targetTelegramId: string
): Promise<AdminUserProfile> {
  const response = await axios.get<{ user: AdminUserProfile }>(
    `${apiBaseUrl}/admin-user-profile/${encodeURIComponent(targetTelegramId)}`,
    { params: { telegramId } }
  );
  return response.data.user;
}

export async function adjustAdminUserBalance(
  apiBaseUrl: string,
  telegramId: string,
  targetTelegramId: string,
  amount: number,
  reason: string
): Promise<void> {
  await axios.post(
    `${apiBaseUrl}/admin-adjust-balance`,
    createAdminBalanceAdjustmentPayload(telegramId, targetTelegramId, amount, reason)
  );
}

export async function setAdminUserBan(
  apiBaseUrl: string,
  telegramId: string,
  targetTelegramId: string,
  ban: boolean,
  reason: string
): Promise<void> {
  await axios.post(
    `${apiBaseUrl}/admin-ban-user`,
    createAdminBanPayload(telegramId, targetTelegramId, ban, reason)
  );
}

export async function addAdminUserNote(
  apiBaseUrl: string,
  telegramId: string,
  targetTelegramId: string,
  text: string
): Promise<void> {
  await axios.post(
    `${apiBaseUrl}/admin-user-note`,
    createAdminNotePayload(telegramId, targetTelegramId, text)
  );
}

export async function loadAdminWithdrawals(
  apiBaseUrl: string,
  telegramId: string
): Promise<AdminWithdrawalsResponse> {
  const response = await axios.get<AdminWithdrawalsResponse>(`${apiBaseUrl}/admin-withdrawals`, {
    params: { telegramId, status: 'pending' },
  });
  return response.data;
}

export async function reviewAdminWithdrawal(
  apiBaseUrl: string,
  telegramId: string,
  request: AdminWithdrawalRequest,
  action: AdminWithdrawalAction,
  adminComment: string
): Promise<void> {
  await axios.post(
    `${apiBaseUrl}/admin-review-withdrawal`,
    createWithdrawalReviewPayload(telegramId, request, action, adminComment)
  );
}

export async function loadAdminWeeklyPrizePreview(
  apiBaseUrl: string,
  telegramId: string
): Promise<AdminWeeklyPrizePreviewResponse> {
  const response = await axios.get<AdminWeeklyPrizePreviewResponse>(
    `${apiBaseUrl}/admin-weekly-prize-preview`,
    { params: { telegramId } }
  );
  return response.data;
}

export async function awardAdminWeeklyPrizes(
  apiBaseUrl: string,
  telegramId: string,
  week: string
): Promise<AdminWeeklyPrizeAwardResponse> {
  const response = await axios.post<AdminWeeklyPrizeAwardResponse>(
    `${apiBaseUrl}/admin-award-weekly-prizes`,
    createWeeklyPrizeAwardPayload(telegramId, week)
  );
  return response.data;
}

export async function loadAdminSuspiciousUsers(
  apiBaseUrl: string,
  telegramId: string
): Promise<AdminSuspiciousUsersResponse> {
  const response = await axios.get<AdminSuspiciousUsersResponse>(`${apiBaseUrl}/admin-suspicious-users`, {
    params: { telegramId },
  });
  return response.data;
}

export async function freezeAdminUser(
  apiBaseUrl: string,
  telegramId: string,
  user: AdminSuspiciousUser,
  reason: string
): Promise<AdminFreezeUserResponse> {
  const response = await axios.post<AdminFreezeUserResponse>(
    `${apiBaseUrl}/admin-freeze-user`,
    createAdminFreezePayload(telegramId, user, reason)
  );
  return response.data;
}

export async function loadAdminSecurityLogs(
  apiBaseUrl: string,
  telegramId: string
): Promise<AdminSecurityLogsResponse> {
  const response = await axios.get<AdminSecurityLogsResponse>(`${apiBaseUrl}/admin-security-logs`, {
    params: { telegramId },
  });
  return response.data;
}

export async function loadAdminFrontendErrors(
  apiBaseUrl: string,
  telegramId: string
): Promise<AdminFrontendErrorsResponse> {
  const response = await axios.get<AdminFrontendErrorsResponse>(`${apiBaseUrl}/admin-frontend-errors`, {
    params: { telegramId },
  });
  return response.data;
}

export async function loadAdminEconomyDashboard(
  apiBaseUrl: string,
  telegramId: string
): Promise<AdminEconomyDashboardResponse> {
  const response = await axios.get<AdminEconomyDashboardResponse>(`${apiBaseUrl}/admin-economy-dashboard`, {
    params: { telegramId },
  });
  return response.data;
}

export async function loadAdminOperations(
  apiBaseUrl: string,
  telegramId: string
): Promise<AdminOperationsResponse> {
  const response = await axios.get<AdminOperationsResponse>(`${apiBaseUrl}/admin-operations`, {
    params: { telegramId },
  });
  return response.data;
}

export async function loadAdminEconomyConfig(
  apiBaseUrl: string,
  telegramId: string
): Promise<AdminEconomyConfigResponse> {
  const response = await axios.get<AdminEconomyConfigResponse>(`${apiBaseUrl}/admin-economy-config`, {
    params: { telegramId },
  });
  return response.data;
}

export async function downloadAdminJsonExport(
  apiBaseUrl: string,
  telegramId: string
): Promise<AdminExportDownload> {
  const response = await axios.get<Blob>(`${apiBaseUrl}/admin-backup`, {
    params: { telegramId },
    responseType: 'blob',
  });
  return { blob: response.data, ...ADMIN_EXPORT_DEFINITIONS.json };
}

export async function downloadAdminUsersCsv(
  apiBaseUrl: string,
  telegramId: string
): Promise<AdminExportDownload> {
  const response = await axios.get<Blob>(`${apiBaseUrl}/admin-export-users.csv`, {
    params: { telegramId },
    responseType: 'blob',
  });
  return { blob: response.data, ...ADMIN_EXPORT_DEFINITIONS.csv };
}

export async function loadAdminVersion(apiBaseUrl: string): Promise<AdminVersionResponse> {
  const response = await axios.get<AdminVersionResponse>(`${apiBaseUrl}/version`);
  return response.data;
}

export async function runAdminBroadcast(
  apiBaseUrl: string,
  telegramId: string,
  message: string,
  dryRun: boolean
): Promise<AdminBroadcastResponse> {
  const response = await axios.post<AdminBroadcastResponse>(
    `${apiBaseUrl}/admin-broadcast`,
    createAdminBroadcastPayload(telegramId, message, dryRun)
  );
  return response.data;
}

export function getAdminApiErrorDetail(error: unknown): string {
  if (!axios.isAxiosError(error)) return '';
  const data = error.response?.data;
  if (!data || typeof data !== 'object') return typeof data === 'string' ? data : '';
  const message = 'message' in data ? data.message : 'error' in data ? data.error : '';
  return typeof message === 'string' ? message : '';
}

export async function loadAdminAnalyticsDashboard(
  apiBaseUrl: string,
  telegramId: string,
  filters: AdminAnalyticsFilters
): Promise<AdminAnalyticsDashboardResponse> {
  const response = await axios.get<AdminAnalyticsDashboardResponse>(
    `${apiBaseUrl}/admin-analytics-events`,
    { params: createAdminAnalyticsParams(telegramId, filters) }
  );
  return response.data;
}
