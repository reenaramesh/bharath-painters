import { useId, useState } from "react";
import { languages, useLanguage } from "../i18n/LanguageContext";
import useAuth from "../context/useAuth";
import api from "../api/client";

export default function LanguageSelector() {
  const id = useId();
  const { language, setLanguage, t } = useLanguage();
  const { user, refreshUser } = useAuth();
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);
  async function change(value) {
    setLanguage(value); setMessage(null);
    if (!user) return;
    setSaving(true);
    try {
      await api.patch("/accounts/me/", { preferred_language: value });
      await refreshUser(); setMessage({ key: "languageSaved" });
    } catch { setMessage({ key: "languageSaveFailed" }); }
    finally { setSaving(false); }
  }
  return <div className="space-y-1">
    <label htmlFor={id} className="block text-sm font-semibold">{t("language")}</label>
    <select id={id} value={language} disabled={saving} onChange={(event) => change(event.target.value)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#176b9b]">
      {languages.map(([code, nativeName]) => <option key={code} value={code}>{nativeName}</option>)}
    </select>
    <p className="text-xs text-slate-600">English words displayed in your selected script.</p>
    <p role="status" aria-live="polite" className="text-xs text-slate-600">{message ? t(message.key) : ""}</p>
  </div>;
}
