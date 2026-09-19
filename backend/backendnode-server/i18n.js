// User-facing messages only. Language is read from the existing User.appLanguage.
const messages = {
  de: {
    "dailyClaimed": "Tägliche Belohnung bereits erhalten",
    "taskClaimed": "Aufgabenbelohnung bereits erhalten",
    "offlineEmpty": "Kein Offline-Einkommen zum Abholen",
    "boostActive": "Boost bereits aktiv",
    "notEnoughOnix": "Nicht genug ONIX",
    "withdrawalInProgress": "Auszahlungsantrag wird bereits verarbeitet",
    "rewardInProgress": "Belohnungsanfrage wird bereits verarbeitet",
    "rateLimit": "Zu viele Anfragen. Versuch es später erneut.",
    "welcomeClaimed": "Willkommensbonus bereits erhalten",
    "promoEmpty": "Gib einen Promocode ein",
    "promoMissing": "Promocode nicht gefunden",
    "promoUsed": "Du hast diesen Promocode bereits verwendet",
    "insufficient": "Nicht genug ONIX",
    "frozen": "Konto eingefroren",
    "teamName": "Gib einen Teamnamen ein",
    "teamNameShort": "Gib einen Teamnamen mit mindestens 2 Zeichen ein",
    "teamExists": "Ein Team mit diesem Namen existiert bereits",
    "teamMissing": "Team nicht gefunden",
    "joinFirst": "Tritt zuerst einem Team bei",
    "teamMissionMissing": "Team-Aufgabe nicht gefunden",
    "teamMissionIncomplete": "Team-Aufgabe ist noch nicht erledigt",
    "rewardClaimed": "Belohnung bereits erhalten",
    "joinedLate": "Du bist dem Team nach Ende des letzten Wettbewerbs beigetreten",
    "noParticipation": "Das Team hat am letzten Wettbewerb nicht teilgenommen",
    "teamPrizeClaimed": "Team-Preis bereits erhalten",
    "titleUnavailable": "Titel nicht verfügbar",
    "withdrawPending": "Du hast bereits einen Auszahlungsantrag in Bearbeitung",
    "withdrawCooldown": "Ein Auszahlungsantrag ist höchstens einmal alle 24 Stunden möglich",
    "perkMax": "Perk ist bereits auf Maximallevel",
    "missionMissing": "Mission nicht gefunden",
    "missionIncomplete": "Mission noch nicht erledigt",
    "subscribeFirst": "Abonniere zuerst den Kanal",
    "inviteFirst": "Lade zuerst einen Freund ein",
    "userNotFound": "Spieler nicht gefunden",
    "telegramMismatch": "Telegram-ID stimmt nicht mit dem angemeldeten Spieler überein",
    "authRequired": "Telegram-Anmeldung erforderlich",
    "invalidAmount": "Gib einen gültigen Betrag ein",
    "withdrawInsufficient": "Nicht genug ONIX für Auszahlung",
    "unknownUpgrade": "Unbekannter Upgrade-Typ",
    "upgradeCooldown": "Upgrade kann noch nicht gekauft werden",
    "unknownPerk": "Unbekannter Perk",
    "missionData": "Missionsdaten fehlen",
    "taskRequired": "Aufgabe fehlt",
    "botSettingsMissing": "Telegram-Bot-Einstellungen fehlen",
    "unknownTask": "Unbekannte Aufgabe",
    "energyAlreadyFull": "Energie ist bereits voll",
    "unknownBoost": "Unbekannter Boost-Typ",
    "unsupportedLanguage": "Sprache wird nicht unterstützt",
    "telegramRequired": "Telegram-ID erforderlich",
    "dataRequired": "Daten fehlen",
    "bot.open": "🚀 ONIX COIN öffnen",
    "bot.welcome": "⚡ <b>Willkommen bei ONIX COIN!</b>",
    "bot.description": "Tippe auf die Münze, verbessere deinen Miner, erledige Aufgaben, lade Freunde ein und steige im Ranking auf.",
    "bot.prompt": "Drücke unten auf den Button, um die App zu öffnen 👇",
    "bot.other": "🚀 Drücke unten auf den Button, um ONIX COIN zu öffnen."
},
  ru: {
    "dailyClaimed": "Ежедневная награда уже получена",
    "taskClaimed": "Награда за задание уже получена",
    "offlineEmpty": "Нет офлайн-дохода для получения",
    "boostActive": "Усиление уже активно",
    "notEnoughOnix": "Недостаточно ONIX",
    "withdrawalInProgress": "Заявка на вывод уже обрабатывается",
    "rewardInProgress": "Запрос награды уже обрабатывается",
    "rateLimit": "Слишком много запросов. Попробуйте позже.",
    "welcomeClaimed": "Приветственный бонус уже получен",
    "promoEmpty": "Введите промокод",
    "promoMissing": "Промокод не найден",
    "promoUsed": "Вы уже использовали этот промокод",
    "insufficient": "Недостаточно ONIX",
    "frozen": "Аккаунт заморожен",
    "teamName": "Введите название команды",
    "teamNameShort": "Введите название команды длиной не менее 2 символов",
    "teamExists": "Команда с таким названием уже существует",
    "teamMissing": "Команда не найдена",
    "joinFirst": "Сначала вступите в команду",
    "teamMissionMissing": "Задание команды не найдено",
    "teamMissionIncomplete": "Задание команды ещё не выполнено",
    "rewardClaimed": "Награда уже получена",
    "joinedLate": "Вы вступили в команду после окончания последнего соревнования",
    "noParticipation": "Команда не участвовала в последнем соревновании",
    "teamPrizeClaimed": "Приз команды уже получен",
    "titleUnavailable": "Титул недоступен",
    "withdrawPending": "Ваша заявка на вывод уже находится на рассмотрении",
    "withdrawCooldown": "Заявку на вывод можно создавать не чаще одного раза в 24 часа",
    "perkMax": "Навык уже максимального уровня",
    "missionMissing": "Миссия не найдена",
    "missionIncomplete": "Миссия ещё не выполнена",
    "subscribeFirst": "Сначала подпишитесь на канал",
    "inviteFirst": "Сначала пригласите друга",
    "userNotFound": "Игрок не найден",
    "telegramMismatch": "Telegram ID не совпадает с авторизованным игроком",
    "authRequired": "Требуется авторизация Telegram",
    "invalidAmount": "Введите корректную сумму",
    "withdrawInsufficient": "Недостаточно ONIX для вывода",
    "unknownUpgrade": "Неизвестный тип улучшения",
    "upgradeCooldown": "Улучшение пока нельзя купить",
    "unknownPerk": "Неизвестный перк",
    "missionData": "Не указаны данные миссии",
    "taskRequired": "Не указано задание",
    "botSettingsMissing": "Не настроен Telegram-бот",
    "unknownTask": "Неизвестное задание",
    "energyAlreadyFull": "Энергия уже полная",
    "unknownBoost": "Неизвестный тип буста",
    "unsupportedLanguage": "Язык не поддерживается",
    "telegramRequired": "Требуется Telegram ID",
    "dataRequired": "Не указаны данные",
    "bot.open": "🚀 Открыть ONIX COIN",
    "bot.welcome": "⚡ <b>Добро пожаловать в ONIX COIN!</b>",
    "bot.description": "Нажимайте на монету, улучшайте майнер, выполняйте задания, приглашайте друзей и поднимайтесь в рейтинге.",
    "bot.prompt": "Нажмите кнопку ниже, чтобы открыть приложение 👇",
    "bot.other": "🚀 Нажмите кнопку ниже, чтобы открыть ONIX COIN."
},
};

function translate(key, language = 'de', parameters = {}) {
  const template = messages[language]?.[key] ?? messages.de[key];
  if (typeof template !== 'string') throw new Error(`Unknown i18n key: ${key}`);
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (placeholder, name) =>
    Object.prototype.hasOwnProperty.call(parameters, name) ? String(parameters[name]) : placeholder
  );
}

async function getUserLanguage(User, telegramId) {
  if (!telegramId) return 'de';
  try {
    const user = await User.findOne({ telegramId: String(telegramId) })
      .select('appLanguage').maxTimeMS(1000).lean();
    return user?.appLanguage || 'de';
  } catch {
    return 'de';
  }
}

module.exports = { translate, getUserLanguage, messages };
