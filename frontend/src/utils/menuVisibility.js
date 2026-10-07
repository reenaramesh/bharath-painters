import { NAVIGATION } from "../config/navigation.js";
export const PROTECTED_MENUS = new Set(["dashboard", "security", "profile", "settings"]);
export function menuEnabled(role, visibility, id) {
  return PROTECTED_MENUS.has(id) || !(visibility?.[role] || []).includes(id);
}
export function menuRouteEnabled(role, visibility, href) {
  const exact = NAVIGATION.find((entry) => entry.roles.includes(role) && entry.route === href);
  if (exact) return menuEnabled(role, visibility, exact.id);
  const path = href.split("?")[0];
  const entries = NAVIGATION.filter((entry) => entry.roles.includes(role) && !entry.route.includes("?") && (path === entry.route || path.startsWith(`${entry.route}/`)));
  entries.sort((a, b) => b.route.length - a.route.length);
  return !entries.length || menuEnabled(role, visibility, entries[0].id);
}
