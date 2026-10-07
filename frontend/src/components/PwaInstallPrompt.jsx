import { useEffect, useMemo, useState } from "react";
import { Download, Share2, X } from "lucide-react";

const DISMISSED_KEY = "bp-pwa-install-dismissed";

function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

export default function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === "1");
  const [installed, setInstalled] = useState(() => isStandalone());
  const isIos = useMemo(() => /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream, []);

  useEffect(() => {
    const onBeforeInstall = (event) => {
      event.preventDefault();
      window.__bpPwaInstallPrompt = event;
      setInstallEvent(event);
      window.dispatchEvent(new Event("bp-pwa-install-ready"));
    };
    const onInstalled = () => {
      delete window.__bpPwaInstallPrompt;
      setInstalled(true);
      setInstallEvent(null);
      localStorage.removeItem(DISMISSED_KEY);
      window.dispatchEvent(new Event("bp-pwa-installed"));
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || dismissed || (!installEvent && !isIos)) return null;

  const dismiss = () => { localStorage.setItem(DISMISSED_KEY, "1"); setDismissed(true); };
  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") {
      delete window.__bpPwaInstallPrompt;
      setInstallEvent(null);
    }
  };

  return (
    <aside className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-lg rounded-2xl border border-indigo-200 bg-white p-4 shadow-2xl sm:bottom-5" role="status">
      <button type="button" onClick={dismiss} className="absolute right-3 top-3 rounded-full p-1 text-slate-500 hover:bg-slate-100" aria-label="Dismiss install message"><X size={18} /></button>
      <div className="flex items-start gap-3 pr-7">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white">{isIos && !installEvent ? <Share2 size={22} /> : <Download size={22} />}</span>
        <div>
          <p className="font-bold text-slate-950">Install Bharath Apps</p>
          <p className="mt-1 text-sm leading-5 text-slate-600">{isIos && !installEvent ? "Tap Share, then Add to Home Screen. The installed app opens without the browser address bar." : "Add the app to this device for a full-screen experience without the browser address bar."}</p>
        </div>
      </div>
      {installEvent && <button type="button" onClick={install} className="mt-3 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-700">Install app</button>}
    </aside>
  );
}
