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
  "backend.inviteFirst",
  "backend.userNotFound",
  "backend.telegramMismatch",
  "backend.authRequired",
  "backend.invalidAmount",
  "backend.withdrawInsufficient",
  "backend.unknownUpgrade",
  "backend.upgradeCooldown",
  "backend.unknownPerk",
  "backend.missionData",
  "backend.taskRequired",
  "backend.botSettingsMissing",
  "backend.unknownTask",
  "backend.energyAlreadyFull",
  "backend.unknownBoost",
  "backend.unsupportedLanguage",
  "backend.telegramRequired",
  "backend.dataRequired"
] as const;

const legacyEnglish = {
  "Daily reward already claimed": "backend.dailyClaimed",
  "Task already claimed": "backend.taskClaimed",
  "No offline income to claim": "backend.offlineEmpty",
  "Boost already active": "backend.boostActive",
  "Not enough ONIX": "backend.insufficient",
  "Withdrawal request already in progress": "backend.withdrawalInProgress",
  "Reward request already in progress": "backend.rewardInProgress",
  "User not found": "backend.userNotFound",
  "Telegram ID does not match authenticated user": "backend.telegramMismatch",
  "Telegram authentication required": "backend.authRequired",
  "Gib einen gültigen Betrag ein": "backend.invalidAmount",
  "Nicht genug ONIX für Auszahlung": "backend.withdrawInsufficient",
  "Unknown upgrade type": "backend.unknownUpgrade",
  "Upgrade purchase cooldown": "backend.upgradeCooldown",
  "Unknown perk": "backend.unknownPerk",
  "Mission data is required": "backend.missionData",
  "Task is required": "backend.taskRequired",
  "Telegram bot settings are missing": "backend.botSettingsMissing",
  "Unknown task": "backend.unknownTask",
  "Energie ist bereits voll": "backend.energyAlreadyFull",
  "Unknown boost type": "backend.unknownBoost",
  "Unsupported language": "backend.unsupportedLanguage",
  "Telegram ID is required": "backend.telegramRequired",
  "Data is required": "backend.dataRequired"
} as const;

export function getBackendNotice(message: string) {
  if (Object.prototype.hasOwnProperty.call(legacyEnglish, message)) {
    const key = legacyEnglish[message as keyof typeof legacyEnglish];
    return (t: ReturnType<typeof createTranslator>) => t(key);
  }
  const key = keys.find((key) => germanMessages[key] === message || messages.ru[key] === message);
  return key ? (t: ReturnType<typeof createTranslator>) => t(key) : undefined;
}
