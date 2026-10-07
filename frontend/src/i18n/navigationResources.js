import { NAVIGATION } from "../config/navigation";
import { transliterate, supportedScripts } from "./transliterate";
export const navigationResources = Object.fromEntries(supportedScripts.map((code) => [code, Object.fromEntries(NAVIGATION.map((entry) => [entry.id, transliterate(entry.label, code)]))]));
