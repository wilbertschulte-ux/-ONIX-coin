// Existing UI wording is preserved for all supported languages.
export const DEFAULT_LANGUAGE = 'de' as const;

export const germanMessages = {
  "common.menu": "Menü",
  "common.language": "Sprache",
  "nav.home": "Start",
  "nav.upgrades": "Upgrades",
  "nav.tasks": "Aufgaben",
  "nav.profile": "Profil",
  "nav.wallet": "Wallet",
  "nav.drop": "Drop",
  "common.level": "Level {level}"
} as const;

export type MessageKey = keyof typeof germanMessages;
export type AppLanguage = 'de' | 'en' | 'ru' | 'uk' | 'tr' | 'es' | 'fr' | 'it' | 'pl' | 'pt';

export const messages: Record<AppLanguage, Partial<Record<MessageKey, string>>> = {
  de: germanMessages,
  en: {
    "common.menu": "Menu",
    "common.language": "Language",
    "nav.home": "Home",
    "nav.upgrades": "Upgrades",
    "nav.tasks": "Tasks",
    "nav.profile": "Profile",
    "nav.wallet": "Wallet",
    "nav.drop": "Drop",
    "common.level": "Level {level}"
  },
  ru: {
    "common.menu": "Меню",
    "common.language": "Язык",
    "nav.home": "Главная",
    "nav.upgrades": "Улучшения",
    "nav.tasks": "Задания",
    "nav.profile": "Профиль",
    "nav.wallet": "Кошелёк",
    "nav.drop": "Дроп",
    "common.level": "Уровень {level}"
  },
  uk: {
    "common.menu": "Меню",
    "common.language": "Мова",
    "nav.home": "Головна",
    "nav.upgrades": "Покращення",
    "nav.tasks": "Завдання",
    "nav.profile": "Профіль",
    "nav.wallet": "Гаманець",
    "nav.drop": "Дроп",
    "common.level": "Рівень {level}"
  },
  tr: {
    "common.menu": "Menü",
    "common.language": "Dil",
    "nav.home": "Ana Sayfa",
    "nav.upgrades": "Yükseltmeler",
    "nav.tasks": "Görevler",
    "nav.profile": "Profil",
    "nav.wallet": "Cüzdan",
    "nav.drop": "Drop",
    "common.level": "Seviye {level}"
  },
  es: {
    "common.menu": "Menú",
    "common.language": "Idioma",
    "nav.home": "Inicio",
    "nav.upgrades": "Mejoras",
    "nav.tasks": "Tareas",
    "nav.profile": "Perfil",
    "nav.wallet": "Cartera",
    "nav.drop": "Drop",
    "common.level": "Nivel {level}"
  },
  fr: {
    "common.menu": "Menu",
    "common.language": "Langue",
    "nav.home": "Accueil",
    "nav.upgrades": "Améliorations",
    "nav.tasks": "Tâches",
    "nav.profile": "Profil",
    "nav.wallet": "Portefeuille",
    "nav.drop": "Drop",
    "common.level": "Niveau {level}"
  },
  it: {
    "common.menu": "Menu",
    "common.language": "Lingua",
    "nav.home": "Home",
    "nav.upgrades": "Potenziamenti",
    "nav.tasks": "Attività",
    "nav.profile": "Profilo",
    "nav.wallet": "Portafoglio",
    "nav.drop": "Drop",
    "common.level": "Livello {level}"
  },
  pl: {
    "common.menu": "Menu",
    "common.language": "Język",
    "nav.home": "Start",
    "nav.upgrades": "Ulepszenia",
    "nav.tasks": "Zadania",
    "nav.profile": "Profil",
    "nav.wallet": "Portfel",
    "nav.drop": "Drop",
    "common.level": "Poziom {level}"
  },
  pt: {
    "common.menu": "Menu",
    "common.language": "Idioma",
    "nav.home": "Início",
    "nav.upgrades": "Melhorias",
    "nav.tasks": "Tarefas",
    "nav.profile": "Perfil",
    "nav.wallet": "Carteira",
    "nav.drop": "Drop",
    "common.level": "Nível {level}"
  },
};
