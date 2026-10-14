import axios from 'axios';
import {
  createAdminUserSearchParams,
  createWithdrawalReviewPayload,
  type AdminHealthResponse,
  type AdminUserProfile,
  type AdminUserSearchResponse,
  type AdminWithdrawalAction,
  type AdminWithdrawalRequest,
  type AdminWithdrawalsResponse,
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
