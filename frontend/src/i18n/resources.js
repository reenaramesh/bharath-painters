import { transliterate, supportedScripts } from './transliterate';
export const commonEnglish = {
  language: 'Language / Script', pdfLanguage: 'PDF Language / Script', save: 'Save', cancel: 'Cancel', search: 'Search', name: 'Name',
  mobile: 'Mobile number', email: 'Email', password: 'Password', signIn: 'Sign in', download: 'Download PDF', print: 'Print',
  close: 'Close', saving: 'Saving…', languageSaved: 'Language preference saved.',
  languageSaveFailed: 'Language changed on this device. The account preference could not be saved. Try again.',
  required: 'This field is required.', results_one: '{{count}} result', results_other: '{{count}} results',
};
export const resources = Object.fromEntries(supportedScripts.map((language) => [language, {
  common: Object.fromEntries(Object.entries(commonEnglish).map(([key, value]) => [key, transliterate(value, language)])),
}]));
