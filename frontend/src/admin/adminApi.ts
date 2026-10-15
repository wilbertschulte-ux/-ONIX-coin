import axios from 'axios';
import {
  createAdminUserSearchParams,
  createAdminFreezePayload,
  createAdminBalanceAdjustmentPayload,
  createAdminBanPayload,
  createAdminNotePayload,
  createWeeklyPrizeAwardPayload,
  createWithdrawalReviewPayload,
  type AdminHealthResponse,
  type AdminFrontendErrorsResponse,
  type AdminFreezeUserResponse,
  type AdminSecurityLogsResponse,
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
