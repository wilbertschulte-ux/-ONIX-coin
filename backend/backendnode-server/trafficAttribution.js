const MAX_LAUNCH_PARAM_LENGTH = 64;
const TELEGRAM_ID_PATTERN = /^\d{1,20}$/;
const TEAM_CODE_PATTERN = /^team_[A-Za-z0-9_-]{1,48}$/;
const TRACKING_CODE_PATTERN = /^[a-z][a-z0-9]{1,15}_[a-z]{2}_[a-z0-9]{1,20}(?:_[a-z0-9]{1,20})?$/;
const COMBINED_LAUNCH_PATTERN = /^ref_(\d{1,20})__src_(.+)$/;

function normalizeLaunchParam(value) {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > MAX_LAUNCH_PARAM_LENGTH) return '';
  if (!/^[A-Za-z0-9_-]+$/.test(normalized)) return '';
  return normalized;
}

function parseTrackingCode(value) {
  const code = normalizeLaunchParam(value);
  if (!code || !TRACKING_CODE_PATTERN.test(code)) return null;

  const parts = code.split('_');
  return {
    source: code,
    market: parts[1],
    campaign: parts.slice(2).join('_'),
    landingCode: code,
  };
}

function parseLaunchParam(value) {
  const normalizedLaunchParam = normalizeLaunchParam(value);
  const emptyResult = {
    normalizedLaunchParam: '',
    referralTelegramId: null,
    attribution: null,
    teamCode: null,
  };

  if (!normalizedLaunchParam) return emptyResult;

  if (TELEGRAM_ID_PATTERN.test(normalizedLaunchParam)) {
    return {
      ...emptyResult,
      normalizedLaunchParam,
      referralTelegramId: normalizedLaunchParam,
    };
  }

  const explicitReferral = normalizedLaunchParam.match(/^ref_(\d{1,20})$/);
  if (explicitReferral) {
    return {
      ...emptyResult,
      normalizedLaunchParam,
      referralTelegramId: explicitReferral[1],
    };
  }

  if (TEAM_CODE_PATTERN.test(normalizedLaunchParam)) {
    return {
      ...emptyResult,
      normalizedLaunchParam,
      teamCode: normalizedLaunchParam.slice('team_'.length),
    };
  }

  const combined = normalizedLaunchParam.match(COMBINED_LAUNCH_PATTERN);
  if (combined) {
    const attribution = parseTrackingCode(combined[2]);
    if (!attribution) return emptyResult;
    return {
      ...emptyResult,
      normalizedLaunchParam,
      referralTelegramId: combined[1],
      attribution,
    };
  }

  const attribution = parseTrackingCode(normalizedLaunchParam);
  if (!attribution) return emptyResult;

  return {
    ...emptyResult,
    normalizedLaunchParam,
    attribution,
  };
}

function applyFirstTouchAttribution(user, attribution, options = {}) {
  const { isNewUser = false, now = Date.now() } = options;
  if (!isNewUser || !user || !attribution?.source) return false;
  if (user.trafficAttribution?.source) return false;

  user.trafficAttribution = {
    source: attribution.source,
    campaign: attribution.campaign,
    market: attribution.market,
    firstSeenAt: new Date(now),
    landingCode: attribution.landingCode,
  };
  return true;
}

function buildMiniAppUrl(baseUrl, launchParam) {
  const parsed = parseLaunchParam(launchParam);
  if (!parsed.normalizedLaunchParam) return String(baseUrl || '');

  try {
    const url = new URL(String(baseUrl || ''));
    url.searchParams.set('onix_start', parsed.normalizedLaunchParam);
    return url.toString();
  } catch {
    return String(baseUrl || '');
  }
}

function extractTelegramStartPayload(text) {
  const match = String(text || '').trim().match(/^\/start(?:@[A-Za-z0-9_]+)?(?:\s+([^\s]+))?$/i);
  return normalizeLaunchParam(match?.[1] || '');
}

module.exports = {
  MAX_LAUNCH_PARAM_LENGTH,
  applyFirstTouchAttribution,
  buildMiniAppUrl,
  extractTelegramStartPayload,
  normalizeLaunchParam,
  parseLaunchParam,
  parseTrackingCode,
};
