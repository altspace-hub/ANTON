import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';

i18n
  .use(HttpBackend)
  .use(initReactI18next)
  .init({
    backend: {
      loadPath: '/locales/{{lng}}.json',
    },
    lng: localStorage.getItem('openexpert-language') ?? 'en',
    fallbackLng: 'en',
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
