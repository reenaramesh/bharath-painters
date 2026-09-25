import { useEffect, useMemo, useState } from "react";
import {
  BriefcaseBusiness,
  Check,
  Copy,
  MessageCircle,
  Smartphone,
  X,
} from "lucide-react";

const PREFERENCE_KEY = "bp_preferred_whatsapp_app";
const PERSONAL_PACKAGE = "com.whatsapp";
const BUSINESS_PACKAGE = "com.whatsapp.w4b";

export default function WhatsAppAppChooser() {
  const [request, setRequest] = useState(null);
  const [remember, setRemember] = useState(false);
  const [preferred, setPreferred] = useState(() =>
    window.localStorage.getItem(PREFERENCE_KEY),
  );
  const [copied, setCopied] = useState(false);
  const isAndroid = useMemo(
    () => /Android/i.test(window.navigator.userAgent),
    [],
  );

  useEffect(() => {
    function interceptWhatsAppLink(event) {
      if (event.defaultPrevented || event.button !== 0) return;
      const anchor = event.target.closest?.("a[href]");
      if (!anchor) return;
      const details = parseWhatsAppUrl(anchor.href);
      if (!details) return;
      event.preventDefault();
      event.stopPropagation();
      setCopied(false);
      setRemember(false);
      setRequest(details);
    }

    document.addEventListener("click", interceptWhatsAppLink, true);
    return () =>
      document.removeEventListener("click", interceptWhatsAppLink, true);
  }, []);

  useEffect(() => {
    if (!request) return undefined;
    function closeOnEscape(event) {
      if (event.key === "Escape") setRequest(null);
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [request]);

  if (!request) return null;

  function launchWhatsApp(app) {
    if (remember) {
      window.localStorage.setItem(PREFERENCE_KEY, app);
      setPreferred(app);
    }

    if (isAndroid) {
      const packageName =
        app === "business" ? BUSINESS_PACKAGE : PERSONAL_PACKAGE;
      window.location.href = buildAndroidIntent(
        request,
        packageName,
      );
    } else {
      window.open(request.fallbackUrl, "_blank", "noopener,noreferrer");
    }
    setRequest(null);
  }

  async function copyContact() {
    const value = request.phone || request.text || request.fallbackUrl;
    try {
      await window.navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      window.prompt("Copy this value", value);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-end bg-slate-950/55 p-0 backdrop-blur-[2px] sm:place-items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="whatsapp-app-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setRequest(null);
      }}
    >
      <section className="w-full overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-md sm:rounded-3xl">
        <header className="flex items-start justify-between border-b border-slate-200 px-5 py-5">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
              <MessageCircle className="h-6 w-6" />
            </span>
            <div>
              <h2 id="whatsapp-app-title" className="text-lg font-extrabold text-slate-950">
                Open WhatsApp
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Choose the account you want to use.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setRequest(null)}
            className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Close WhatsApp chooser"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-3 p-5">
          {request.phone && (
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                Send message to
              </p>
              <p className="mt-1 font-extrabold text-slate-900">
                +{request.phone}
              </p>
            </div>
          )}

          {isAndroid ? (
            <>
              <AppButton
                icon={BriefcaseBusiness}
                title="WhatsApp Business"
                subtitle="Send using your official business account"
                preferred={preferred === "business"}
                onClick={() => launchWhatsApp("business")}
                primary
              />
              <AppButton
                icon={Smartphone}
                title="Personal WhatsApp"
                subtitle="Send using your personal account"
                preferred={preferred === "personal"}
                onClick={() => launchWhatsApp("personal")}
              />
              <label className="flex cursor-pointer items-center gap-3 rounded-xl px-1 py-2 text-sm font-semibold text-slate-600">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
                />
                Remember my preferred app on this device
              </label>
            </>
          ) : (
            <>
              <AppButton
                icon={MessageCircle}
                title="Open WhatsApp"
                subtitle="Your device will open its available WhatsApp app"
                onClick={() => launchWhatsApp("personal")}
                primary
              />
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                Selecting Personal or Business separately is supported on
                Android. On this device, WhatsApp controls which installed app
                opens.
              </p>
            </>
          )}

          <button
            type="button"
            onClick={copyContact}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            {copied ? (
              <Check className="h-4 w-4 text-emerald-600" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {copied
              ? "Copied"
              : request.phone
                ? "Copy mobile number"
                : "Copy message"}
          </button>
        </div>
      </section>
    </div>
  );
}

function AppButton({
  icon: Icon,
  title,
  subtitle,
  preferred,
  primary,
  onClick,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition ${
        primary
          ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"
          : "border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
      }`}
    >
      <span
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${
          primary ? "bg-white/15" : "bg-emerald-50 text-emerald-700"
        }`}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 font-extrabold">
          {title}
          {preferred && (
            <small
              className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                primary
                  ? "bg-white/20 text-white"
                  : "bg-emerald-100 text-emerald-700"
              }`}
            >
              Preferred
            </small>
          )}
        </span>
        <span
          className={`mt-0.5 block text-xs ${
            primary ? "text-emerald-50" : "text-slate-500"
          }`}
        >
          {subtitle}
        </span>
      </span>
    </button>
  );
}

function parseWhatsAppUrl(value) {
  try {
    const url = new URL(value, window.location.origin);
    const host = url.hostname.toLowerCase();
    const isWhatsApp =
      host === "wa.me" ||
      host === "api.whatsapp.com" ||
      host === "web.whatsapp.com";
    if (!isWhatsApp) return null;

    const pathPhone =
      host === "wa.me" ? url.pathname.split("/").filter(Boolean)[0] : "";
    const phone = String(url.searchParams.get("phone") || pathPhone || "")
      .replace(/\D/g, "");
    const text = url.searchParams.get("text") || "";
    const fallbackUrl = buildFallbackUrl(phone, text);
    return { phone, text, fallbackUrl };
  } catch {
    return null;
  }
}

function buildFallbackUrl(phone, text) {
  const query = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${phone}${query}`;
}

function buildAndroidIntent(request, packageName) {
  const params = new URLSearchParams();
  if (request.phone) params.set("phone", request.phone);
  if (request.text) params.set("text", request.text);
  const query = params.toString();
  return `intent://send${query ? `?${query}` : ""}#Intent;scheme=whatsapp;package=${packageName};S.browser_fallback_url=${encodeURIComponent(request.fallbackUrl)};end`;
}
