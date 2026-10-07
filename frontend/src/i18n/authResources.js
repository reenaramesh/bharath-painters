import { transliterate, supportedScripts } from "./transliterate";
const english = {
  "welcome": "Welcome back",
  "signInHint": "Sign in with your mobile number or verified email.",
  "identifier": "Mobile number or verified email",
  "identifierPlaceholder": "Mobile number or email",
  "enterPassword": "Enter password",
  "showPassword": "Show password",
  "hidePassword": "Hide password",
  "forgotPassword": "Forgot password?",
  "signingIn": "Signing in…",
  "newHere": "New to Bharath Apps?",
  "createAccount": "Create an account",
  "customerQuestion": "Are you a customer?",
  "createCustomer": "Create customer login",
  "orIdentifier": "or use mobile / email"
};
export const authResources = Object.fromEntries(supportedScripts.map((code) => [code, Object.fromEntries(Object.entries(english).map(([key, value]) => [key, transliterate(value, code)]))]));
