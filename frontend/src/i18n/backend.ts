import { createTranslator } from './index';
import { germanMessages, messages } from './messages';

// Exact backend message compatibility, including Russian responses.
// Unknown messages and any user-supplied parameters remain untouched.
const keys = [
  "backend.rateLimit",
  "backend.welcomeClaimed",
  "backend.promoEmpty",
  "backend.promoMissing",
  "backend.promoUsed",
  "backend.insufficient",
  "backend.frozen",
  "backend.teamName",
  "teams.errors.nameShort",
  "teams.errors.nameExists",
  "teams.errors.notFound",
  "teams.errors.joinFirst",
  "teams.errors.missionMissing",
  "teams.errors.missionIncomplete",
  "missions.errors.claimed",
  "teams.errors.joinedLate",
  "teams.errors.noParticipation",
  "teams.errors.prizeClaimed",
  "backend.titleUnavailable",
  "wallet.existing",
  "wallet.cooldown",
  "backend.perkMax",
  "missions.errors.notFound",
  "missions.errors.incomplete",
  "backend.subscribeFirst",
  "backend.inviteFirst"
] as const;

export function getBackendNotice(message: string) {
  const key = keys.find((key) => germanMessages[key] === message || messages.ru[key] === message);
  return key ? (t: ReturnType<typeof createTranslator>) => t(key) : undefined;
}
