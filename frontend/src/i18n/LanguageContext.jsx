import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import i18next from './i18n';
import useAuth from '../context/useAuth';
import { transliterate } from './transliterate';
import { clearSystemCopyRecords } from './systemCopy';
export const languages = [['en', 'English', 'English'], ['te', 'తెలుగు', 'Telugu'], ['kn', 'ಕನ್ನಡ', 'Kannada'], ['hi', 'हिन्दी', 'Hindi'], ['ta', 'தமிழ்', 'Tamil']];
const valid = (code) => languages.some(([language]) => code === language) ? code : 'en';
const LanguageContext = createContext(null);
export function LanguageProvider({ children }) {
  const { user } = useAuth();
  const userId = user?.id;
  const preferredLanguage = user?.preferred_language;
  useEffect(() => { clearSystemCopyRecords(); }, [userId]);
  const [language, setLanguageState] = useState(() => valid(user?.preferred_language || (!user && localStorage.getItem('bp-visitor-language'))));
  const setLanguage = useCallback((value) => {
    if (valid(value) !== value) return;
    i18next.changeLanguage(value);
    setLanguageState(value);
    localStorage.setItem(userId != null ? 'bp-language-user-' + userId : 'bp-visitor-language', value);
  }, [userId]);
  useEffect(() => {
    const saved = userId != null ? preferredLanguage || localStorage.getItem('bp-language-user-' + userId) : localStorage.getItem('bp-visitor-language');
    const resolved = valid(saved);
    i18next.changeLanguage(resolved);
    setLanguageState(resolved);
    if (userId != null) localStorage.setItem('bp-language-user-' + userId, resolved);
  }, [userId, preferredLanguage]);
  useEffect(() => { document.documentElement.lang = language; document.documentElement.dataset.script = language; }, [language]);
  const value = useMemo(() => ({ language, setLanguage, t: (key, options = {}) => {
    if (typeof key !== 'string') return key;
    if (i18next.exists(key, { ...options, lng: 'en' })) return i18next.t(key, { ...options, lng: language });
    const fallback = /^[A-Za-z][A-Za-z0-9]*:[\w.-]+$/.test(key) || /^[a-z]+[A-Z][A-Za-z0-9]*$/.test(key) || /^[A-Za-z]\w*_\w+$/.test(key) ? 'Text unavailable' : key;
    return transliterate(options.defaultValue || fallback, language);
  } }), [language, setLanguage]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
export function useLanguage() { return useContext(LanguageContext); }
