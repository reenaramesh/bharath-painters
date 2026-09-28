import { useEffect, useState } from "react";
import api from "../api/client";

const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function decodePublicKey(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const bytes = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bytes, (character) => character.charCodeAt(0));
}

export default function PushAlertControl({ userId }) {
  const [config, setConfig] = useState(null);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    api.get("/quotations/push-subscription/").then(async ({ data }) => {
      if (cancelled) return;
      setConfig(data);
      if (!supported() || !data.enabled || Notification.permission !== "granted") return;
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (cancelled || !subscription) return;
      await api.post("/quotations/push-subscription/", subscription.toJSON());
      if (!cancelled) setActive(true);
    }).catch(() => { if (!cancelled) setConfig({ enabled: false }); });
    return () => { cancelled = true; };
  }, [userId]);

  async function enable() {
    setBusy(true);
    setMessage("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setMessage("Allow notifications in your browser settings to enable alerts."); return; }
      const registration = await navigator.serviceWorker.register("/sw.js");
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodePublicKey(config.public_key) });
      await api.post("/quotations/push-subscription/", subscription.toJSON());
      setActive(true);
      setMessage("Background alerts enabled on this device.");
    } catch (error) {
      setMessage(error.response?.data?.detail || "Background alerts could not be enabled on this device.");
    } finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true);
    setMessage("");
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await api.delete("/quotations/push-subscription/", { data: { endpoint: subscription.endpoint } });
        await subscription.unsubscribe();
      }
      setActive(false);
      setMessage("Background alerts turned off on this device.");
    } catch { setMessage("Background alerts could not be turned off. Please try again."); }
    finally { setBusy(false); }
  }

  if (!config) return null;
  if (!supported()) return <p className="border-b p-3 text-xs text-slate-500">This browser does not support background alerts.</p>;
  if (!config.enabled) return <p className="border-b p-3 text-xs text-slate-500">Background alerts are not configured on the server yet.</p>;
  return <div className="border-b bg-[#f8fbfc] p-3"><div className="flex items-center justify-between gap-3"><span><b className="block text-xs">Background alerts</b><small className="text-[11px] text-slate-500">Receive updates when the app is closed.</small></span><button type="button" disabled={busy} onClick={active ? disable : enable} className="shrink-0 rounded-lg bg-[#176b9b] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{busy ? "Working..." : active ? "Turn off" : "Enable"}</button></div>{message && <p role="status" className="mt-2 text-xs text-[#1d5e7b]">{message}</p>}</div>;
}
