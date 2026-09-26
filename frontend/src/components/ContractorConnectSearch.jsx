import { useState } from "react";
import { Search, UserPlus } from "lucide-react";
import api from "../api/client";
import useAuth from "../context/useAuth";

export default function ContractorConnectSearch({ onConnected }) {
  const { user } = useAuth();
  const [mobile, setMobile] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function search(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const { data } = await api.get("/quotations/customer/contractors/search/", { params: { mobile } });
      setResult(data);
    } catch (requestError) {
      setError(requestError.response?.data?.mobile || requestError.response?.data?.detail || "Contractor search failed.");
    } finally { setBusy(false); }
  }

  async function connect() {
    setBusy(true);
    setError("");
    try {
      await api.post("/quotations/customer/contractors/connect/", { mobile: result.mobile });
      setResult(current => ({ ...current, connection_status: "CONNECTED", can_connect: false }));
      await onConnected();
      window.dispatchEvent(new Event("portal-counts-changed"));
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "The contractor could not be connected.");
    } finally { setBusy(false); }
  }

  const invitation = `Hello, I would like to connect with you on Bharath Painters. Register as a contractor here: ${window.location.origin}/register. My customer mobile number is ${user?.mobile || "available from me"}. After registration, we can connect and share quotations and project updates.`;
  const invitationNumber = String(result?.mobile || "").replace(/[^0-9]/g, "");

  return <section className="rounded-2xl border bg-white p-5 sm:p-6">
    <h2 className="flex items-center gap-2 text-lg font-bold"><UserPlus className="h-5 w-5 text-indigo-600" />Find your contractor</h2>
    <p className="mt-2 text-sm text-slate-500">Enter your known contractor's mobile number to connect. If they have not registered, invite them to join.</p>
    <form onSubmit={search} className="mt-4 flex flex-col gap-3 sm:flex-row"><input required disabled={busy} inputMode="tel" aria-label="Contractor mobile number" placeholder="Contractor mobile number" value={mobile} onChange={event => { setMobile(event.target.value); setResult(null); setError(""); }} className="min-w-0 flex-1 rounded-xl border px-4 py-3 outline-none focus:border-indigo-500" /><button disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 font-bold text-white disabled:opacity-50"><Search className="h-4 w-4" />{busy ? "Please wait..." : "Search"}</button></form>
    {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {result?.state === "FOUND" && <div className="mt-4 rounded-xl bg-indigo-50 p-4"><h3 className="font-bold">{result.contractor.business_name}</h3><p className="mt-1 text-sm text-slate-600">{result.contractor.contractor_id || result.contractor.name} ? {result.mobile}</p>{result.connection_status === "CONNECTED" ? <p role="status" className="mt-3 font-semibold text-emerald-700">Connected. This contractor is in My contractors.</p> : result.can_connect ? <><p className="mt-3 text-sm text-slate-600">Connecting gives this contractor permission to create and share records for their work with you.</p><button type="button" onClick={connect} disabled={busy} className="mt-3 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? "Connecting..." : "Connect contractor"}</button></> : <p className="mt-3 text-sm text-slate-600">This contractor is blocked on your account.</p>}</div>}
    {result?.state === "NOT_FOUND" && <div className="mt-4 rounded-xl bg-amber-50 p-4"><h3 className="font-bold">Contractor not registered</h3><p className="mt-2 text-sm text-slate-600">Invite {result.mobile} to register. Choose a channel to review and send the invitation.</p><div className="mt-4 flex flex-wrap gap-3"><a href={`https://wa.me/${invitationNumber}?text=${encodeURIComponent(invitation)}`} target="_blank" rel="noreferrer" className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white">Invite via WhatsApp</a><a href={`sms:+${invitationNumber}?body=${encodeURIComponent(invitation)}`} className="rounded-xl border bg-white px-4 py-3 text-sm font-bold">Invite via SMS</a></div></div>}
    {result?.state === "UNAVAILABLE" && <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{result.message}</p>}
  </section>;
}
