import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';

i18n
  .use(HttpBackend)
  .use(initReactI18next)
  .init({
    backend: {
      // Handles both default namespace (translation) and school namespace
      loadPath: (lng: string[], ns: string[]) => {
        const namespace = ns[0];
        if (namespace === 'school') {
          // Only English and Swedish have school translations; fall back to English for others
          const schoolLng = ['en', 'sv'].includes(lng[0]) ? lng[0] : 'en';
          return `/locales/${schoolLng}-school.json`;
        }
        return `/locales/${lng[0]}.json`;
      },
    },
    lng: localStorage.getItem('openexpert-language') ?? 'en',
    fallbackLng: 'en',
    ns: ['translation', 'school'],
    defaultNS: 'translation',
    supportedLngs: [
      'en', 'sv', 'fr', 'de', 'it', 'es', 'hi', 'pt', 'pl', 'ur',
      'zh', 'ar', 'bn', 'uk', 'id', 'ja', 'tr', 'vi', 'ko', 'th',
      'fa', 'nl', 'ro', 'el', 'cs', 'hu', 'he', 'fi', 'no', 'da',
    ],
    react: {
      useSuspense: false,  // HTTP backend is async — don't throw Suspense, render with empty strings then re-render
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
