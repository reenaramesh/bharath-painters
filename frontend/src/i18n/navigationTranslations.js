import { transliterate, supportedScripts } from "./transliterate";
const keys = ["Overview","Customers & Sales","Work Management","People & Network","Finance","Communication","Business Setup","Account","Home","Properties & Measurements","Shared Measurements","My Contractors","Account Security","Appearance","Support Tickets","Site Visits"];
export const navigationTranslations = Object.fromEntries(supportedScripts.map((code) => [code, Object.fromEntries(keys.map((key) => [key, transliterate(key, code)]))]));
