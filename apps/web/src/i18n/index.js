// i18n: Bangla is the default and fallback language.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import bn from './bn.js';
import en from './en.js';

const STORAGE_KEY = 'heritage.lang';

function initialLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'bn' || saved === 'en') return saved;
  } catch { /* storage unavailable */ }
  return 'bn';
}

i18n.use(initReactI18next).init({
  resources: { bn: { translation: bn }, en: { translation: en } },
  lng: initialLanguage(),
  fallbackLng: 'bn',
  interpolation: { escapeValue: false },
});

function applyLanguage(lng) {
  document.documentElement.lang = lng;
  document.title = i18n.t('app.name');
}
applyLanguage(i18n.language);
i18n.on('languageChanged', (lng) => {
  applyLanguage(lng);
  try { localStorage.setItem(STORAGE_KEY, lng); } catch { /* ignore */ }
});

export default i18n;
