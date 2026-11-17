import { quotationItemPresentation } from './quotationItemPresentation.js';

export function scheduleCategory(item) {
  const category = quotationItemPresentation(item).category;
  return !category || category === '-' ? 'Uncategorized' : String(category).trim() || 'Uncategorized';
}
export const categoryKey = value => String(value).trim().toLocaleLowerCase('en-IN');
export function scheduleCategories(items) {
  const categories = new Map();
  for (const item of items) {
    const name = scheduleCategory(item), key = categoryKey(name);
    if (!categories.has(key)) categories.set(key, name);
  }
  return [...categories].sort((a,b) => a[1].localeCompare(b[1]));
}
export function filterScheduleItems(items, category) {
  return category ? items.filter(item => categoryKey(scheduleCategory(item)) === category) : items;
}
