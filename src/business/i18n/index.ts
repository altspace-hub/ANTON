/**
 * i18n/index.ts — Business App internationalization.
 *
 * react-i18next with all 34 catalogues bundled. Any string missing
 * from a catalogue falls back to English transparently via fallbackLng.
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
import de from './locales/de.json';
import fr from './locales/fr.json';
import es from './locales/es.json';
import it from './locales/it.json';
import pt from './locales/pt.json';
import nl from './locales/nl.json';
import da from './locales/da.json';
import no from './locales/no.json';
import fi from './locales/fi.json';
import pl from './locales/pl.json';
import cs from './locales/cs.json';
import hu from './locales/hu.json';
import ro from './locales/ro.json';
import el from './locales/el.json';
import tr from './locales/tr.json';
import uk from './locales/uk.json';
import ar from './locales/ar.json';
import he from './locales/he.json';
import fa from './locales/fa.json';
import ur from './locales/ur.json';
import hi from './locales/hi.json';
import bn from './locales/bn.json';
import id from './locales/id.json';
import vi from './locales/vi.json';
import th from './locales/th.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import zh from './locales/zh.json';
import ru from './locales/ru.json';
import ms from './locales/ms.json';
import tl from './locales/tl.json';
import sk from './locales/sk.json';
import { isRtl, LANGUAGES } from './languages.js';

const STORAGE_KEY = 'anton-business-language';

/** All 34 catalogues bundled in the app. New languages drop a
 *  JSON file in ./locales/ and register here. */
const RESOURCES = {
  en: { translation: en },
  sv: { translation: sv },
  de: { translation: de },
  fr: { translation: fr },
  es: { translation: es },
  it: { translation: it },
  pt: { translation: pt },
  nl: { translation: nl },
  da: { translation: da },
  no: { translation: no },
  fi: { translation: fi },
  pl: { translation: pl },
  cs: { translation: cs },
  hu: { translation: hu },
  ro: { translation: ro },
  el: { translation: el },
  tr: { translation: tr },
  uk: { translation: uk },
  ar: { translation: ar },
  he: { translation: he },
  fa: { translation: fa },
  ur: { translation: ur },
  hi: { translation: hi },
  bn: { translation: bn },
  id: { translation: id },
  vi: { translation: vi },
  th: { translation: th },
  ja: { translation: ja },
  ko: { translation: ko },
  zh: { translation: zh },
  ru: { translation: ru },
  ms: { translation: ms },
  tl: { translation: tl },
  sk: { translation: sk },
} as const;

function detectInitialLanguage(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && LANGUAGES.some((l) => l.code === stored)) return stored;
  } catch { /* localStorage unavailable */ }
  // First run — detect from the browser, fall back to English.
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
