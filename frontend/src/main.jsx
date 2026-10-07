import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./i18n/fonts.css";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { LanguageProvider } from "./i18n/LanguageContext.jsx";

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("Bharath Apps service worker registration failed.", error);
    });
  });
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider><LanguageProvider><App /></LanguageProvider></AuthProvider>
  </StrictMode>
);
