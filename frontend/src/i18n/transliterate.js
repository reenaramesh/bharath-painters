import glossary from '../../../shared/transliteration/glossary.json' with { type: 'json' };
import brands from '../../../shared/transliteration/protected-brands.json' with { type: 'json' };

export const supportedScripts = ['en', 'te', 'kn', 'hi', 'ta'];
const token = /\{\{[^}]*\}\}|\{[^}]*\}|https?:\/\/[^\s]+|[\w.+-]+@[\w.-]+\.[A-Za-z]+|#[\da-fA-F]{3,8}\b|\b[A-Z]{2,}(?:-[A-Z0-9]+)+\b|\b[A-Za-z]+(?:['’][A-Za-z]+)?[\w]*\b/g;
const protectedBrands = new RegExp('(' + brands.map((brand) => brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
export function transliterate(source, language = 'en') {
  if (typeof source !== 'string' || language === 'en' || !glossary[language]) return source;
  return source.split(protectedBrands).map((part, index) => index % 2 ? part : part.replace(token, (word) => {
    if (!/^[A-Za-z]+(?:['’][A-Za-z]+)?$/.test(word)) return word;
    return glossary[language][word.toLowerCase().replaceAll('’', "'")] || word;
  })).join('');
}

// Only system-owned templates are processed. Inserted values are never processed.
export function formatSystemText(source, language, values = {}) {
  return transliterate(source, language).replace(/\{\{(\w+)\}\}|\{(\w+)\}/g, (match, double, single) => {
    const key = double || single;
    return Object.hasOwn(values, key) ? String(values[key]) : match;
  });
}
