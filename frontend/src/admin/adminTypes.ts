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
