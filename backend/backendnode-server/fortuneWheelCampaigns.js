const LEGACY_FORTUNE_WHEEL_CAMPAIGN_KEYS = Object.freeze([
  'fortune-wheel-v1',
  'fortune-wheel-staging-v1',
]);
const PRIMARY_LEGACY_FORTUNE_WHEEL_CAMPAIGN_KEY = LEGACY_FORTUNE_WHEEL_CAMPAIGN_KEYS[0];
const WEEKLY_FORTUNE_WHEEL_CAMPAIGN_KEY = 'fortune-wheel-weekly-v1';
const ALL_FORTUNE_WHEEL_CAMPAIGN_KEYS = Object.freeze([
  ...LEGACY_FORTUNE_WHEEL_CAMPAIGN_KEYS,
  WEEKLY_FORTUNE_WHEEL_CAMPAIGN_KEY,
]);

function isLegacyFortuneWheelCampaignKey(value) {
  return LEGACY_FORTUNE_WHEEL_CAMPAIGN_KEYS.includes(String(value || ''));
}

function isKnownFortuneWheelCampaignKey(value) {
  return ALL_FORTUNE_WHEEL_CAMPAIGN_KEYS.includes(String(value || ''));
}

module.exports = {
  ALL_FORTUNE_WHEEL_CAMPAIGN_KEYS,
  LEGACY_FORTUNE_WHEEL_CAMPAIGN_KEYS,
  PRIMARY_LEGACY_FORTUNE_WHEEL_CAMPAIGN_KEY,
  WEEKLY_FORTUNE_WHEEL_CAMPAIGN_KEY,
  isKnownFortuneWheelCampaignKey,
  isLegacyFortuneWheelCampaignKey,
};
