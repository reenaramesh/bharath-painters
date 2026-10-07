import { transliterate, supportedScripts } from "./transliterate";
const keys = ["Save","Cancel","Search","Edit","Delete","Close","Done","Name","Mobile number","Email","Loading data...","Unable to load","Try again","Something went wrong.","Nothing here yet","New records will appear here."];
export const commonTranslations = Object.fromEntries(supportedScripts.map((code) => [code, Object.fromEntries(keys.map((key) => [key, transliterate(key, code)]))]));
