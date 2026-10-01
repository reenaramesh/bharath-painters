import { useState } from "react";
import { Share2, X } from "lucide-react";

export default function ShareAppButton({ shortcut = false, collapsed = false }) {
  const [message, setMessage] = useState("");
  const appUrl = window.location.origin;

  async function shareApp() {
    try {
      if (navigator.share) {
        await navigator.share({ title: "Bharath Painters", text: "Join Bharath Painters. Open this link on your phone and install the app.", url: appUrl });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(appUrl);
        setMessage("Application link copied. You can paste it in any app.");
      } else {
        setMessage("Copy the application link below to share it.");
      }
    } catch (error) {
      if (error?.name !== "AbortError") setMessage("Copy the application link below to share it.");
    }
  }

  return <>
    <button type="button" onClick={shareApp} title="Share App" aria-label="Share App" className={shortcut ? "w-[72px] shrink-0 snap-start text-center" : "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-indigo-700 hover:bg-indigo-50"}>
      {shortcut ? <><span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-indigo-200 bg-indigo-50 text-indigo-700 shadow-sm transition active:scale-95"><Share2 className="h-7 w-7" strokeWidth={1.8} /></span><span className="mt-2 block min-h-8 text-[11px] font-medium leading-4 text-slate-700">Share App</span></> : <><Share2 className="h-5 w-5 shrink-0" /><span className={collapsed ? "lg:hidden" : ""}>Share App</span></>}
    </button>
    {message && <div className="fixed inset-0 z-[110] grid place-items-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-label="Share Bharath Painters App">
      <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-4"><h2 className="font-bold text-slate-900">Share App</h2><button type="button" onClick={() => setMessage("")} aria-label="Close sharing" className="rounded-full bg-slate-100 p-2"><X className="h-4 w-4" /></button></div>
        <p role="status" className="mt-3 text-sm text-slate-600">{message}</p>
        <input aria-label="Application link" readOnly value={appUrl} onFocus={(event) => event.target.select()} className="mt-3 w-full rounded-xl border p-3 text-sm text-slate-900" />
        <button type="button" onClick={() => setMessage("")} className="mt-4 w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white">Done</button>
      </div>
    </div>}
  </>;
}
