import { createElement, Fragment } from 'react';
import { useLanguage } from './LanguageContext';
import { transliterate } from './transliterate';
import { recordedSystemCopy } from './systemCopy';
import standardLabels from '../../../shared/transliteration/standard-labels.json';
import knownSources from '../../../shared/transliteration/system-sources.json';
const standard = new Set(standardLabels.map((value) => value.toLowerCase()));
const known = new Set(knownSources);

export function ScriptStandardText({ source }) {
  const { language } = useLanguage();
  return typeof source === 'string' && standard.has(source.toLowerCase()) ? transliterate(source, language) : source;
}
export function ScriptKnownText({ source }) {
  const { language } = useLanguage();
  if (typeof source !== 'string') return source;
  return recordedSystemCopy(source, language) ?? (known.has(source) ? transliterate(source, language) : source);
}

export function ScriptText({ source, parts, values = [], enumValue = false }) {
  const { language } = useLanguage();
  if (!parts) return transliterate(enumValue && typeof source === 'string' ? source.replaceAll('_', ' ') : source, language);
  return parts.map((part, index) => <Fragment key={index}>{transliterate(part, language)}{index < values.length ? values[index] : null}</Fragment>);
}
export function ScriptElement({ element, scriptFields, children, ...props }) {
  const { language } = useLanguage();
  const localized = Object.fromEntries(Object.entries(scriptFields).map(([key, value]) => [key,
    value?.systemSource !== undefined ? transliterate(value.systemSource, language)
      : value?.systemParts ? value.systemParts.map((part, index) => transliterate(part, language) + (value.systemValues[index] ?? '')).join('')
      : value,
  ]));
  return createElement(element, { ...props, ...localized }, children);
}
