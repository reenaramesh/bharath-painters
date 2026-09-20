import { useEffect, useState } from "react";
import { Building2, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import useAuth from "../context/useAuth";

export default function CustomerConnectionPrompt() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const sessionKey = `bp-connection-reminder-${user?.id || "guest"}`;
  useEffect(() => {
    if (user?.role !== "CUSTOMER" || sessionStorage.getItem(sessionKey)) return;
    api.get("/quotations/customer/connection-requests/").then(({ data }) => {
      const pending = (data.results || []).filter((item) => item.status === "PENDING");
      setItems(pending);
      setOpen(pending.length > 0);
    }).catch(() => {});
  }, [user?.id, user?.role, sessionKey]);
  function later() { sessionStorage.setItem(sessionKey, "1"); setOpen(false); }
  async function action(value) {
    if (!items[0]) return;
    await api.post(`/quotations/customer/connection-requests/${items[0].id}/${value}/`, {});
    window.dispatchEvent(new Event("portal-counts-changed"));
    setOpen(false);
  }
  if (!open) return null;
  const first = items[0];
  return <div className="fixed inset-0 z-[70] grid place-items-end bg-slate-950/55 sm:place-items-center sm:p-4" role="dialog" aria-modal="true">
    <section className="w-full rounded-t-3xl bg-white p-6 shadow-2xl sm:max-w-md sm:rounded-3xl">
      <div className="flex items-start justify-between"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-700"><Building2 className="h-6 w-6" /></span><button onClick={later} className="rounded-xl p-2 hover:bg-slate-100" aria-label="Later"><X className="h-5 w-5" /></button></div>
      {items.length > 1 ? <><h2 className="mt-5 text-xl font-extrabold">You have {items.length} new contractor connection requests</h2><p className="mt-2 text-sm leading-6 text-slate-500">Review who can create and share quotations, area calculations and project information for your account.</p><button onClick={() => { later(); navigate("/customer/connection-requests"); }} className="mt-6 w-full rounded-xl bg-slate-950 px-4 py-3 font-bold text-white">Review requests</button><button onClick={later} className="mt-2 w-full rounded-xl px-4 py-3 font-bold text-slate-500">Later</button></> : <><p className="mt-5 text-xs font-bold uppercase tracking-widest text-indigo-600">New connection request</p><h2 className="mt-2 text-xl font-extrabold">{first.contractor?.business_name}</h2><p className="mt-1 text-sm font-semibold text-slate-500">{first.contractor?.contractor_id}</p><p className="mt-4 text-sm leading-6 text-slate-600">This contractor would like to connect with your account to share records specifically related to your work with them.</p><div className="mt-6 grid grid-cols-2 gap-2"><button onClick={() => action("accept")} className="rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white">Accept</button><button onClick={() => action("reject")} className="rounded-xl border border-red-200 px-4 py-3 font-bold text-red-700">Reject</button></div><button onClick={() => { later(); navigate("/customer/connection-requests"); }} className="mt-2 w-full rounded-xl px-4 py-3 text-sm font-bold text-indigo-700">View contractor details</button></>}
    </section>
  </div>;
}
