import type { AdminNavigationItem } from './adminTypes';

export const adminNavigation = [
  { id: 'overview', icon: '⌂', labelKey: 'admin.shell.overview', hintKey: 'admin.shell.overviewHint', available: true, mobilePrimary: true },
  { id: 'users', icon: '👥', labelKey: 'admin.shell.users', hintKey: 'admin.overview.playersHint', available: true, mobilePrimary: true },
  { id: 'withdrawals', icon: '💸', labelKey: 'admin.shell.withdrawals', hintKey: 'admin.overview.withdrawalsHint', available: true, mobilePrimary: true },
  { id: 'prizes', icon: '🏆', labelKey: 'admin.shell.prizes', hintKey: 'admin.overview.prizesHint', available: true, mobilePrimary: true },
  { id: 'economy', icon: '◈', labelKey: 'admin.shell.economy', hintKey: 'admin.overview.economyHint', available: true },
  { id: 'analytics', icon: '▥', labelKey: 'admin.shell.analytics', hintKey: 'admin.overview.analyticsHint', available: false, mobilePrimary: true },
  { id: 'security', icon: '🛡', labelKey: 'admin.shell.security', hintKey: 'admin.overview.logsHint', available: true },
  { id: 'broadcast', icon: '📣', labelKey: 'admin.shell.broadcast', hintKey: 'admin.shell.broadcastHint', available: true },
  { id: 'settings', icon: '⚙', labelKey: 'admin.shell.settings', hintKey: 'admin.shell.settingsHint', available: true },
  { id: 'launch', icon: '✓', labelKey: 'admin.shell.launch', hintKey: 'admin.overview.launchHint', available: true },
] as const satisfies readonly AdminNavigationItem[];

export const getAdminNavigationItem = (section: AdminNavigationItem['id']) =>
  adminNavigation.find((item) => item.id === section) ?? adminNavigation[0];
