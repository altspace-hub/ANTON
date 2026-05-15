/**
 * languages.ts — the locale catalogue for the Business App language picker.
 *
 * `code` is the BCP-47 / ISO-639-1 tag i18next keys on. `native` is the
 * language's own name (shown to the user — a Swede looking for Swedish
 * scans for "Svenska", not "Swedish"). `english` is the fallback label.
 *
 * Mirrors the 29-language set the Comm App ships. en + sv ship complete
 * Business App translations today; the rest fall back to en until their
 * catalogue is filled in (the i18n config's fallbackLng handles this
 * transparently).
 */

export interface LanguageOption {
  code: string;
  native: string;
  english: string;
  /** Right-to-left script — the UI flips layout direction for these. */
  rtl?: boolean;
}

export const LANGUAGES: LanguageOption[] = [
  { code: 'en', native: 'English',            english: 'English' },
  { code: 'sv', native: 'Svenska',            english: 'Swedish' },
  { code: 'de', native: 'Deutsch',            english: 'German' },
  { code: 'fr', native: 'Français',           english: 'French' },
  { code: 'es', native: 'Español',            english: 'Spanish' },
  { code: 'it', native: 'Italiano',           english: 'Italian' },
  { code: 'pt', native: 'Português',          english: 'Portuguese' },
  { code: 'nl', native: 'Nederlands',         english: 'Dutch' },
  { code: 'da', native: 'Dansk',              english: 'Danish' },
  { code: 'no', native: 'Norsk',              english: 'Norwegian' },
  { code: 'fi', native: 'Suomi',              english: 'Finnish' },
  { code: 'pl', native: 'Polski',             english: 'Polish' },
  { code: 'cs', native: 'Čeština',            english: 'Czech' },
  { code: 'hu', native: 'Magyar',             english: 'Hungarian' },
  { code: 'ro', native: 'Română',             english: 'Romanian' },
  { code: 'el', native: 'Ελληνικά',           english: 'Greek' },
  { code: 'tr', native: 'Türkçe',             english: 'Turkish' },
  { code: 'uk', native: 'Українська',         english: 'Ukrainian' },
  { code: 'ar', native: 'العربية',            english: 'Arabic', rtl: true },
  { code: 'he', native: 'עברית',              english: 'Hebrew', rtl: true },
  { code: 'fa', native: 'فارسی',               english: 'Persian', rtl: true },
  { code: 'ur', native: 'اردو',               english: 'Urdu', rtl: true },
  { code: 'hi', native: 'हिन्दी',              english: 'Hindi' },
  { code: 'bn', native: 'বাংলা',              english: 'Bengali' },
  { code: 'id', native: 'Bahasa Indonesia',   english: 'Indonesian' },
  { code: 'vi', native: 'Tiếng Việt',         english: 'Vietnamese' },
  { code: 'th', native: 'ไทย',                english: 'Thai' },
  { code: 'ja', native: '日本語',              english: 'Japanese' },
  { code: 'ko', native: '한국어',              english: 'Korean' },
];

/** Languages with a complete Business App translation bundled today.
 *  Everything else falls back to English (i18next fallbackLng). */
export const COMPLETE_LOCALES = new Set(['en', 'sv']);

export function isRtl(code: string): boolean {
  return LANGUAGES.find((l) => l.code === code)?.rtl ?? false;
}

export function languageOption(code: string): LanguageOption | undefined {
  return LANGUAGES.find((l) => l.code === code);
}
