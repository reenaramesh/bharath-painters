import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { resources } from "./resources";
import { transliterate } from './transliterate';
import { NAVIGATION } from "../config/navigation";
import { authResources } from "./authResources";

const statusKeys = ['active', 'pending', 'draft', 'new', 'sent', 'viewed', 'accepted', 'approved', 'rejected', 'declined', 'completed', 'in_progress', 'paid', 'cancelled', 'scheduled', 'expired', 'blocked', 'connected'];
for (const language of Object.keys(resources)) {
  resources[language].statuses = Object.fromEntries(statusKeys.map((key) => [key, transliterate((key.charAt(0).toUpperCase() + key.slice(1)).replaceAll('_', ' '), language)]));
  resources[language].auth = Object.fromEntries(Object.entries(authResources.en).map(([key, value]) => [key, transliterate(value, language)]));
  resources[language].navigation = Object.fromEntries(NAVIGATION.map((entry) => [entry.id, transliterate(entry.label, language)]));
}

i18next.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  supportedLngs: Object.keys(resources),
  ns: ["common", "statuses", "navigation", "auth"],
  defaultNS: "common",
  interpolation: { escapeValue: false },
  returnNull: false,
  returnEmptyString: false,
});
export default i18next;
