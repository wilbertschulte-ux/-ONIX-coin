import { createTranslator, getLanguageLocale } from './index';
import { germanMessages, messages, type AppLanguage } from './messages';

const missionKinds = {
  team_earn_250k: 'earn',
  team_members_3: 'members',
  team_taps_1000: 'taps',
} as const;

// Display only: keep mission goals supplied by the API.
export function getTeamMissionText(mission: { id: string; goal: number }, language: AppLanguage) {
  if (!Object.prototype.hasOwnProperty.call(missionKinds, mission.id)) return undefined;
  const kind = missionKinds[mission.id as keyof typeof missionKinds];
  const t = createTranslator(language);
  const count = mission.goal.toLocaleString(getLanguageLocale(language));
  return { title: t(`teams.mission.${kind}.title`), description: t(`teams.mission.${kind}.description`, { count }) };
}

// Same countdown arithmetic as formatMissionResetTime; only unit labels differ.
export function formatTeamResetTime(ms: number, language: AppLanguage) {
  const totalSeconds = Math.max(Math.floor(ms / 1000), 0);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const t = createTranslator(language);
  return days > 0 ? t('teams.time.days', { days, hours, minutes }) : t('teams.time.hours', { hours, minutes, seconds });
}

const errorKeys = [
  'teams.errors.leave', 'teams.errors.create', 'teams.errors.join',
  'teams.errors.reward', 'teams.errors.prize', 'teams.errors.nameShort',
  'teams.errors.nameExists', 'teams.errors.notFound', 'teams.errors.joinFirst',
  'teams.errors.missionMissing', 'teams.errors.missionIncomplete',
  'teams.errors.joinedLate', 'teams.errors.noParticipation', 'teams.errors.prizeClaimed',
  'missions.errors.claimed',
] as const;

// Exact full-message compatibility, used only by team actions. Unknown errors survive.
export function teamActionError(message: string | undefined, fallback: typeof errorKeys[number]) {
  const key = message ? errorKeys.find((key) =>
    germanMessages[key] === message
    || Object.values(messages).some((catalog) => catalog[key] === message)
  ) : fallback;
  return key ? (t: ReturnType<typeof createTranslator>) => t(key) : message || ((t: ReturnType<typeof createTranslator>) => t(fallback));
}
