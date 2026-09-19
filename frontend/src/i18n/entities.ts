import { createTranslator, type AppLanguage } from './index';

const achievementIds = [
  'first_tap', 'taps_100', 'taps_1000', 'first_upgrade', 'miner_level_5',
  'first_boost', 'first_offline_claim', 'first_friend', 'taps_10000', 'weekly_100k',
  'all_perks', 'rank_gold', 'rank_diamond', 'friends_5', 'streak_7', 'taps_50000',
  'taps_100000', 'earned_1m', 'friends_10', 'upgrade_master', 'boost_master',
  'offline_master',
] as const;

type AchievementId = typeof achievementIds[number];

export function getAchievementText(
  achievement: { id: string; title?: string; description?: string },
  language: AppLanguage
) {
  if (!achievementIds.includes(achievement.id as AchievementId)) return undefined;
  const t = createTranslator(language);
  const id = achievement.id as AchievementId;
  return {
    title: t(`achievement.${id}.title`),
    description: t(`achievement.${id}.description`),
  };
}

const rankIds = [
  'bronze_1', 'bronze_2', 'bronze_3', 'silver_1', 'silver_2', 'silver_3',
  'gold_1', 'gold_2', 'gold_3', 'platinum', 'diamond', 'master', 'legend',
] as const;

type RankId = typeof rankIds[number];

export function getRankName(rank: { id?: string; name?: string }, language: AppLanguage) {
  if (!rankIds.includes(rank.id as RankId)) return rank.name || createTranslator(language)('entity.rank');
  return createTranslator(language)(`rank.${rank.id as RankId}`);
}

const profileTitleKeys = {
  'ONIX Player': 'profileTitle.onixPlayer',
  'Tap Master': 'profileTitle.tapMaster',
  Miner: 'profileTitle.miner',
  'Referral Master': 'profileTitle.referralMaster',
  'Season Hunter': 'profileTitle.seasonHunter',
  Diamond: 'profileTitle.diamond',
  'Boost Master': 'profileTitle.boostMaster',
  'Perk Collector': 'profileTitle.perkCollector',
} as const;

export function getProfileTitle(title: string, language: AppLanguage) {
  const key = profileTitleKeys[title as keyof typeof profileTitleKeys];
  return key ? createTranslator(language)(key) : title;
}

const badgeKeys = {
  'Gold+': 'badge.gold', Diamond: 'badge.diamond', Referral: 'badge.referral',
  Streak: 'badge.streak', 'All Perks': 'badge.allPerks', 'Top 3': 'badge.top3',
  'Top 10': 'badge.top10',
} as const;

export function getBadgeLabel(label: string, language: AppLanguage) {
  const key = badgeKeys[label as keyof typeof badgeKeys];
  return key ? createTranslator(language)(key) : label;
}
