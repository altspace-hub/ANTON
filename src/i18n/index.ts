import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Original 10 languages
import en from './locales/en.json';
import sv from './locales/sv.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import it from './locales/it.json';
import es from './locales/es.json';
import hi from './locales/hi.json';
import pt from './locales/pt.json';
import pl from './locales/pl.json';
import ur from './locales/ur.json';

// New 20 languages (top 30 global)
import zh from './locales/zh.json';
import ar from './locales/ar.json';
import bn from './locales/bn.json';
import uk from './locales/uk.json';
import id from './locales/id.json';
import ja from './locales/ja.json';
import tr from './locales/tr.json';
import vi from './locales/vi.json';
import ko from './locales/ko.json';
import th from './locales/th.json';
import fa from './locales/fa.json';
import nl from './locales/nl.json';
import ro from './locales/ro.json';
import el from './locales/el.json';
import cs from './locales/cs.json';
import hu from './locales/hu.json';
import he from './locales/he.json';
import fi from './locales/fi.json';
import no from './locales/no.json';
import da from './locales/da.json';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      // Original 10
      en: { translation: en },
      sv: { translation: sv },
      fr: { translation: fr },
      de: { translation: de },
      it: { translation: it },
      es: { translation: es },
      hi: { translation: hi },
      pt: { translation: pt },
      pl: { translation: pl },
      ur: { translation: ur },
      // New 20
      zh: { translation: zh },
      ar: { translation: ar },
      bn: { translation: bn },
      uk: { translation: uk },
      id: { translation: id },
      ja: { translation: ja },
      tr: { translation: tr },
      vi: { translation: vi },
      ko: { translation: ko },
      th: { translation: th },
      fa: { translation: fa },
      nl: { translation: nl },
      ro: { translation: ro },
      el: { translation: el },
      cs: { translation: cs },
      hu: { translation: hu },
      he: { translation: he },
      fi: { translation: fi },
      no: { translation: no },
      da: { translation: da },
    },
    lng: localStorage.getItem('openexpert-language') ?? 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already escapes values
    },
  });

export default i18n;
