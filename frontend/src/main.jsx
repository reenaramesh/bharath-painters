import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { LanguageProvider } from "./i18n/LanguageContext.jsx";

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("Bharath Painters service worker registration failed.", error);
    });
  });
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <LanguageProvider><AuthProvider><App /></AuthProvider></LanguageProvider>
  </StrictMode>
);
