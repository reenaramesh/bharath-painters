import i18next from 'i18next';
import { transliterate } from './transliterate';
export function systemCopy(source) { return transliterate(source, i18next.language); }
export function systemCopyParts(parts, values) {
  return parts.map((part, index) => systemCopy(part) + (index < values.length ? String(values[index]) : '')).join('');
}
const records = new Map();
function remember(value, record) {
  records.set(value, record);
  if (records.size > 512) records.delete(records.keys().next().value);
  return value;
}
export function captureSystemCopy(source) { return remember(source, { source }); }
export function captureSystemCopyParts(parts, values) {
  const original = parts.map((part, index) => part + (index < values.length ? String(values[index]) : '')).join('');
  return remember(original, { parts, values });
}
export function recordedSystemCopy(source, language) {
  const record = records.get(source);
  if (!record) return null;
  return record.parts ? record.parts.map((part, index) => transliterate(part, language) + (index < record.values.length ? String(record.values[index]) : '')).join('') : transliterate(record.source, language);
}
export function clearSystemCopyRecords() { records.clear(); }
