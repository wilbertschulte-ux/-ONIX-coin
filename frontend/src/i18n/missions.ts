import { createTranslator } from './index';
import { germanMessages } from './messages';
import type { AppLanguage, MessageKey } from './messages';

type Translator = ReturnType<typeof createTranslator>;
type MissionDefinition = {
  title: MessageKey;
  description: (t: Translator, goal: number) => string;
};

// Display only: goals come from the API; no difficulty or reward calculations.
const definitions = {
  daily_taps: {
    title: 'missions.dailyTaps.title',
    description: (t, count) => t('missions.dailyTaps.description', { count }),
  },
  daily_upgrade: {
    title: 'missions.dailyUpgrade.title',
    description: (t, count) => t('missions.dailyUpgrade.description', { count }),
  },
  daily_offline: {
    title: 'missions.dailyOffline.title',
    description: (t) => t('missions.dailyOffline.description'),
  },
  secret_daily_chest: {
    title: 'missions.secretChest.title',
    description: (t, count) => t('missions.secretChest.description', { count }),
  },
  weekly_taps: {
    title: 'missions.weeklyTaps.title',
    description: (t, count) => t('missions.weeklyTaps.description', { count }),
  },
  weekly_earn: {
    title: 'missions.weeklyEarn.title',
    description: (t, count) => t('missions.weeklyEarn.description', { count }),
  },
  weekly_upgrades: {
    title: 'missions.weeklyUpgrades.title',
    description: (t, count) => t('missions.weeklyUpgrades.description', { count }),
  },
  secret_weekly_referral: {
    title: 'missions.secretReferral.title',
    description: (t, count) => t('missions.secretReferral.description', { count }),
  },
} as const satisfies Record<string, MissionDefinition>;

export function getMissionText(
  mission: { id: string; goal: number },
  language: AppLanguage
): { title: string; description: string } | undefined {
  if (!Object.prototype.hasOwnProperty.call(definitions, mission.id)) return undefined;
  const definition = definitions[mission.id as keyof typeof definitions];
  const t = createTranslator(language);
  return {
    title: t(definition.title),
    description: definition.description(t, mission.goal),
  };
}

export function getWeeklyAchievementDescription(
  achievement: { id: string; goal: number },
  language: AppLanguage
): string | undefined {
  if (achievement.id !== 'weekly_100k') return undefined;
  return createTranslator(language)('achievements.weeklyEarn.description', {
    amount: achievement.goal.toLocaleString(language === 'ru' ? 'ru-RU' : 'de-DE'),
  });
}

const claimErrorKeys = [
  'missions.errors.notFound',
  'missions.errors.incomplete',
  'missions.errors.claimed',
] as const;

// Full-message compatibility only, scoped by the caller to personal missions.
export function getMissionClaimErrorKey(message: string | undefined) {
  return claimErrorKeys.find((key) => germanMessages[key] === message);
}
