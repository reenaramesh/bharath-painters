import { transliterate, supportedScripts } from "./transliterate";
const keys = ["active","pending","draft","new","sent","viewed","accepted","approved","rejected","declined","completed","in_progress","paid","cancelled","scheduled","expired","blocked","connected"];
export const statuses = Object.fromEntries(supportedScripts.map((code) => [code, Object.fromEntries(keys.map((key) => [key, transliterate(key.replaceAll("_", " "), code)]))]));
