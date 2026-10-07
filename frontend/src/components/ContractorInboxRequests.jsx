import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Handshake } from "lucide-react";
import api from "../api/client";
import { apiErrorMessage } from "../utils/subcontract";
import ContractorConnectionCard from "./ContractorConnectionCard";

export default function ContractorInboxRequests() {
  const [searchParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const requestedId = Number(searchParams.get("connection"));

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/quotations/contractor-connections/", { params: { status: "PENDING" } });
      setRows(data.filter((row) => row.viewer_authority === "RECIPIENT"));
      setError("");
    } catch (err) { setError(apiErrorMessage(err, "Connection requests could not be loaded.")); }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 30000);
    return () => window.clearInterval(timer);
  }, [load]);
  useEffect(() => { if (requestedId) setExpanded(true); }, [requestedId]);

  async function act(row, action, extra = {}) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api.post(`/quotations/contractor-connections/${row.id}/${action}/`, extra);
      setRows((current) => current.filter((item) => item.id !== row.id));
      setNotice(action === "accept" ? "Connection accepted. You can now find this contractor in your network." : "Connection request declined.");
      window.dispatchEvent(new Event("portal-counts-changed"));
    } catch (err) { setError(apiErrorMessage(err, "The request could not be updated.")); }
    finally { setBusy(false); }
  }

  if (!rows.length && !error && !notice && !requestedId) return null;
  const ordered = [...rows].sort((a, b) => Number(b.id === requestedId) - Number(a.id === requestedId));
  return <section className="mb-3 shrink-0 overflow-hidden rounded-2xl border border-blue-200 bg-blue-50" aria-label="Incoming contractor connection requests">
    <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} aria-controls="contractor-inbox-requests" className="flex min-h-11 w-full items-center gap-2 px-4 py-3 text-left text-sm font-bold text-slate-900"><Handshake className="h-5 w-5" />Contractor connection requests ({rows.length})<span className="ml-auto text-xs font-semibold">{expanded ? "Hide" : "View"}</span></button>
    {expanded && <div id="contractor-inbox-requests" className="max-h-[40dvh] space-y-3 overflow-y-auto px-3 pb-3">
      {error && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}<button type="button" onClick={load} className="ml-2 underline">Retry</button></div>}
      {notice && <p role="status" className="rounded-xl bg-white p-3 text-sm text-slate-700">{notice} <Link to="/contractor-network" className="font-semibold underline">Open network</Link></p>}
      {ordered.map((row) => <ContractorConnectionCard key={row.id} row={row} busy={busy} onAct={act} />)}
      {!rows.length && !error && <p className="px-1 text-sm text-slate-600">No pending incoming requests. <Link to="/contractor-network" className="font-semibold underline">View your network</Link></p>}
    </div>}
  </section>;
}
