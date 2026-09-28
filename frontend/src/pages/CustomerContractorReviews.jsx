import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { Navigate } from "react-router-dom";
import api from "../api/client";
import useAuth from "../context/useAuth";

export default function CustomerContractorReviews() {
  const { user } = useAuth();
  const [contractors, setContractors] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/accounts/customer-reviews/")
      .then(({ data }) => {
        setContractors(data.contractors);
        setDrafts(Object.fromEntries(data.contractors.map((item) => [item.id, item.review || { rating: 0, comment: "" }])));
      })
      .catch(() => setError("Connected contractors could not be loaded."))
      .finally(() => setLoading(false));
  }, []);

  if (user?.role !== "CUSTOMER") return <Navigate to="/dashboard" replace />;

  async function save(contractorId) {
    setSavingId(contractorId);
    setError("");
    setMessage("");
    try {
      const draft = drafts[contractorId];
      const { data } = await api.post("/accounts/customer-reviews/", { contractor_id: contractorId, ...draft });
      setContractors((current) => current.map((item) => item.id === contractorId ? { ...item, review: data } : item));
      setMessage("Your review was saved and is visible on the contractor profile.");
    } catch (requestError) {
      setError(Object.values(requestError.response?.data || {}).flat().join(" ") || "Review could not be saved.");
    } finally {
      setSavingId(null);
    }
  }

  return <div className="mx-auto max-w-3xl space-y-5 pb-8">
    <header><p className="text-xs font-bold uppercase tracking-widest text-[#176b9b]">Customer feedback</p><h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">Review your contractors</h1><p className="mt-2 text-sm text-slate-500">Rate a contractor you are connected with. Your first name and last initial appear with your review on their public profile.</p></header>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
    {loading ? <p className="rounded-2xl border bg-white p-6 text-sm text-slate-500">Loading contractors...</p> : contractors.length ? contractors.map((contractor) => <section key={contractor.id} className="rounded-2xl border bg-white p-5 sm:p-6">
      <h2 className="text-lg font-bold">{contractor.name}</h2>
      <p className="mt-1 text-xs text-slate-500">{contractor.review ? "Update your review" : "Share your experience"}</p>
      <div className="mt-4 flex gap-1" role="group" aria-label={`Rating for ${contractor.name}`}>{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" onClick={() => setDrafts((current) => ({ ...current, [contractor.id]: { ...current[contractor.id], rating: value } }))} aria-label={`${value} star${value === 1 ? "" : "s"}`} aria-pressed={drafts[contractor.id]?.rating === value} className="rounded-md p-1"><Star className={`h-7 w-7 ${value <= (drafts[contractor.id]?.rating || 0) ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} /></button>)}</div>
      <label className="mt-4 block text-sm font-semibold">Your review<textarea maxLength={1000} rows="4" value={drafts[contractor.id]?.comment || ""} onChange={(event) => setDrafts((current) => ({ ...current, [contractor.id]: { ...current[contractor.id], comment: event.target.value } }))} placeholder="Describe the work and your experience" className="mt-2 w-full rounded-xl border border-slate-300 p-3 font-normal outline-none focus:border-[#176b9b]" /></label>
      <button type="button" disabled={!drafts[contractor.id]?.rating || savingId === contractor.id} onClick={() => save(contractor.id)} className="mt-4 min-h-11 rounded-xl bg-[#176b9b] px-5 text-sm font-bold text-white disabled:opacity-50">{savingId === contractor.id ? "Saving..." : contractor.review ? "Update review" : "Submit review"}</button>
    </section>) : <p className="rounded-2xl border bg-white p-6 text-sm text-slate-500">Connect with a contractor to leave a review.</p>}
  </div>;
}
