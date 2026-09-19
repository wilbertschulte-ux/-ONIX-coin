import { createTranslator, type AppLanguage } from './index';
import { germanMessages, messages, type MessageKey } from './messages';

type HistoricalTransaction = { type?: string; title?: string };
type EntityResolver = (title: string) => string | undefined;
const typeKeys = {
  'expense_boost': 'history.type.expense_boost',
  'expense_chest': 'history.type.expense_chest',
  'expense_perk': 'history.type.expense_perk',
  'expense_upgrade': 'history.type.expense_upgrade',
  'income_achievement': 'history.type.income_achievement',
  'income_chest': 'history.type.income_chest',
  'income_daily': 'history.type.income_daily',
  'income_daily_mission': 'history.type.income_daily_mission',
  'income_weekly_mission': 'history.type.income_weekly_mission',
  'income_team_mission': 'history.type.income_team_mission',
  'income_team_prize': 'history.type.income_team_prize',
  'income_offline': 'history.type.income_offline',
  'income_rank': 'history.type.income_rank',
  'income_referral': 'history.type.income_referral',
  'income_task': 'history.type.income_task',
  'income_season_prize': 'history.type.income_season_prize',
  'income_welcome_bonus': 'history.type.income_welcome_bonus',
  'income_promo': 'history.type.income_promo',
  'withdrawal_pending': 'history.type.withdrawal_pending',
  'withdrawal_approved': 'history.type.withdrawal_approved',
  'withdrawal_rejected': 'history.type.withdrawal_rejected',
} as const;
const missionTitleKeys = Object.keys(germanMessages).filter((key) =>
  (key.startsWith('missions.') || key.startsWith('teams.mission.')) && key.endsWith('.title')
) as Extract<MessageKey, `missions.${string}.title` | `teams.mission.${string}.title`>[];

// Read-only compatibility for persisted titles; never translate player/team names.
export function getTransactionTitle(transaction: HistoricalTransaction, language: AppLanguage, resolveAchievement?: EntityResolver): string {
  const t = createTranslator(language);
  const title = transaction.title || '';
  const type = transaction.type || '';
  // Preserve original historical wording in German, including unknown formats.
  if (language === 'de' && title) return title;
  const matchesType = (expected: string) => !type || type === expected;
  const genericKey = Object.prototype.hasOwnProperty.call(typeKeys, type) ? typeKeys[type as keyof typeof typeKeys] : 'history.transaction';
  const generic = () => t(genericKey);
  const exact = [
    ['expense_boost', 'history.tap'], ['expense_boost', 'history.mining'],
    ['expense_boost', 'history.energy'], ['income_referral', 'history.welcome'],
    ['income_task', 'history.invite'],
  ] as const;
  for (const [expected, key] of exact) if (matchesType(expected) && title === germanMessages[key]) return t(key);
  const withdrawal = /^Auszahlungsantrag ≈ ([\d.,\s]+)€$/.exec(title);
  if (matchesType('withdrawal_pending') && withdrawal) return t('history.withdrawal', { sum: withdrawal[1] });
  const daily = /^Tägliche Belohnung · Tag (\d+)\/7$/.exec(title);
  if (matchesType('income_daily') && daily) return t('history.daily', { day: daily[1] });
  const referral = /^Empfehlungsbonus für aktiven Freund: (.+)$/s.exec(title);
  if (matchesType('income_referral') && referral) return t('history.referral', { name: referral[1] });
  const entityFormats = [
    ['income_achievement', /^Erfolg: (.+)$/s, 'history.achievement'],
    ['income_daily_mission', /^Daily Mission: (.+)$/s, 'history.dailyMission'],
    ['income_weekly_mission', /^Weekly Mission: (.+)$/s, 'history.weeklyMission'],
    ['income_team_mission', /^Team-Aufgabe: (.+)$/s, 'history.teamMission'],
  ] as const;
  for (const [expected, pattern, key] of entityFormats) {
    const match = pattern.exec(title);
    if (!matchesType(expected) || !match) continue;
    const titleKey = missionTitleKeys.find((key) => germanMessages[key] === match[1]);
    const name = expected === 'income_achievement' ? resolveAchievement?.(match[1]) : titleKey ? t(titleKey) : undefined;
    return name ? t(key, { name }) : t(typeKeys[expected]);
  }
  const placeText = (source: string): string | undefined => {
    const place = /^(\d+)\. Platz$/.exec(source);
    if (place) return t('history.place', { place: place[1] });
    if (source === 'Teilnahmepreis') return t('history.participation');
    if (source === 'kein Platz') return t('teams.noPlace');
    return undefined;
  };
  // Backend format puts the place before the team; accept the known alternate too.
  const contest = /^Team-Wettbewerb ([^:]+): (\d+\. Platz|Teilnahmepreis|kein Platz) \((.*)\)$/s.exec(title);
  if (matchesType('income_team_prize') && contest) return t('history.teamPrize', { week: contest[1], place: placeText(contest[2])!, team: contest[3] });
  const alternate = /^Team-Wettbewerb ([^:]+): (.*) \((\d+\. Platz|Teilnahmepreis|kein Platz)\)$/s.exec(title);
  if (matchesType('income_team_prize') && alternate) return t('history.teamPrizeAlternate', { week: alternate[1], team: alternate[2], place: placeText(alternate[3])! });
  return generic();
}

const withdrawalErrorKeys = ['wallet.error', 'wallet.antibot', 'wallet.insufficient', 'wallet.existing', 'wallet.cooldown'] as const;
export function getWithdrawalError(message?: string) {
  const key = withdrawalErrorKeys.find((key) =>
    germanMessages[key] === message
    || Object.values(messages).some((catalog) => catalog[key] === message)
  );
  if (key) return (t: ReturnType<typeof createTranslator>) => t(key);
  const minimum = /^Mindestauszahlung ([\d.,\s]+) ONIX$/.exec(message || '');
  if (minimum) return (t: ReturnType<typeof createTranslator>) => t('wallet.minimum', { amount: minimum[1] });
  return message || ((t: ReturnType<typeof createTranslator>) => t('wallet.error'));
}
