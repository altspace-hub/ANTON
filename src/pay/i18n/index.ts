/**
 * i18n/index.ts — Pay App internationalization.
 *
 * react-i18next. en + sv ship complete catalogues; every other
 * language in languages.ts is selectable and falls back to English
 * transparently via fallbackLng until its catalogue is filled.
 *
 * Language choice is persisted to localStorage. On first run we detect
 * from navigator.language, but never silently override an explicit
 * user choice.
 *
 * Import this module once (in main.tsx) before rendering — it
 * initialises the global i18next instance synchronously so the first
 * render is already translated.
 */
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import sv from './locales/sv.json';
import { isRtl, LANGUAGES } from './languages.js';

const STORAGE_KEY = 'anton-pay-language';

/** Catalogues bundled in the app. New languages drop a JSON file in
 *  ./locales/ and register here. */
const RESOURCES = {
  en: { translation: en },
  sv: { translation: sv },
} as const;

function detectInitialLanguage(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && LANGUAGES.some((l) => l.code === stored)) return stored;
  } catch { /* localStorage unavailable */ }
  const nav = (typeof navigator !== 'undefined' ? navigator.language : 'en') || 'en';
  const code = nav.slice(0, 2).toLowerCase();
  return LANGUAGES.some((l) => l.code === code) ? code : 'en';
}

const initialLanguage = detectInitialLanguage();

void i18next
  .use(initReactI18next)
  .init({
    resources: RESOURCES,
    lng: initialLanguage,
    fallbackLng: 'en',
    interpolation: { escapeValue: false }, // React already escapes
    returnEmptyString: false,
  });

applyDirection(initialLanguage);

/** Persist + switch the active language. Components re-render via the
 *  react-i18next subscription; no reload needed. */
export function setLanguage(code: string): void {
  try { localStorage.setItem(STORAGE_KEY, code); } catch { /* ignore */ }
  void i18next.changeLanguage(code);
  applyDirection(code);
}

export function getLanguage(): string {
  return i18next.language || 'en';
}

/** Flip <html dir> for right-to-left scripts (Arabic, Hebrew, …). */
function applyDirection(code: string): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('dir', isRtl(code) ? 'rtl' : 'ltr');
  document.documentElement.setAttribute('lang', code);
}

export default i18next;
