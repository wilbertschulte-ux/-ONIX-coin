import { createTranslator } from './index';
import { germanMessages, messages } from './messages';

// Exact backend message compatibility, including Russian responses.
// Unknown messages and any user-supplied parameters remain untouched.
const keys = [
  "backend.dailyClaimed",
  "backend.taskClaimed",
  "backend.offlineEmpty",
  "backend.boostActive",
  "backend.withdrawalInProgress",
  "backend.rewardInProgress",

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

const legacyEnglish = {
  "Daily reward already claimed": "backend.dailyClaimed",
  "Task already claimed": "backend.taskClaimed",
  "No offline income to claim": "backend.offlineEmpty",
  "Boost already active": "backend.boostActive",
  "Not enough ONIX": "backend.insufficient",
  "Withdrawal request already in progress": "backend.withdrawalInProgress",
  "Reward request already in progress": "backend.rewardInProgress"
} as const;

export function getBackendNotice(message: string) {
  if (Object.prototype.hasOwnProperty.call(legacyEnglish, message)) {
    const key = legacyEnglish[message as keyof typeof legacyEnglish];
    return (t: ReturnType<typeof createTranslator>) => t(key);
  }
  const key = keys.find((key) => germanMessages[key] === message || messages.ru[key] === message);
  return key ? (t: ReturnType<typeof createTranslator>) => t(key) : undefined;
}
