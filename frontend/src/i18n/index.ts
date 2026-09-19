import { DEFAULT_LANGUAGE, germanMessages, messages } from './messages';
import type { AppLanguage, MessageKey } from './messages';

export { DEFAULT_LANGUAGE } from './messages';
export type { AppLanguage, MessageKey } from './messages';

const languageLocales: Record<AppLanguage, string> = {
  de: 'de-DE',
  en: 'en-US',
  ru: 'ru-RU',
  uk: 'uk-UA',
  tr: 'tr-TR',
  es: 'es-ES',
  fr: 'fr-FR',
  it: 'it-IT',
  pl: 'pl-PL',
  pt: 'pt-PT',
};

export function getLanguageLocale(language: AppLanguage = DEFAULT_LANGUAGE) {
  return languageLocales[language] ?? languageLocales[DEFAULT_LANGUAGE];
}

type PlaceholderNames<Text extends string> =
  Text extends `${string}{${infer Name}}${infer Rest}`
    ? Name | PlaceholderNames<Rest>
    : never;

type MessageParameters<Key extends MessageKey> = Record<
  PlaceholderNames<(typeof germanMessages)[Key]>,
  string | number
>;

type TranslationArguments<Key extends MessageKey> =
  [PlaceholderNames<(typeof germanMessages)[Key]>] extends [never]
    ? []
    : [parameters: MessageParameters<Key>];

// Pure string interpolation: values are never interpreted as HTML or templates.
// React remains responsible for escaping text when it renders the result.
export function createTranslator(language: AppLanguage = DEFAULT_LANGUAGE) {
  return function t<Key extends MessageKey>(
    key: Key,
    ...args: TranslationArguments<Key>
  ): string {
    const template = messages[language]?.[key] ?? germanMessages[key];
    const parameters = args[0] as Record<string, string | number> | undefined;

    return template.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (placeholder, name: string) => {
      if (!parameters || !Object.prototype.hasOwnProperty.call(parameters, name)) {
        return placeholder;
      }
      return String(parameters[name]);
    });
  };
}
