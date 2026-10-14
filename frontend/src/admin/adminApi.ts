import axios from 'axios';
import type { AdminHealthResponse } from './adminTypes';

export async function loadAdminHealth(apiBaseUrl: string): Promise<AdminHealthResponse> {
  const response = await axios.get<AdminHealthResponse>(`${apiBaseUrl}/health`);
  return response.data;
}
