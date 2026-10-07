import { useCallback, useEffect, useState } from "react";
import { Star } from "lucide-react";
import { Navigate } from "react-router-dom";
import api from "../api/client";
import useAuth from "../context/useAuth";
import { Button, EmptyState, ErrorState, LoadingState, PageHeader, SectionCard } from "../components/ui";

export default function CustomerContractorReviews() {
  const { user } = useAuth();
  const [contractors, setContractors] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/accounts/customer-reviews/");
      setContractors(data.contractors);
      setDrafts(Object.fromEntries(data.contractors.map((item) => [item.id, item.review || { rating: 0, comment: "" }])));
      setError("");
    } catch {
      setError("Connected contractors could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

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

  return <div className="customer-review-page mx-auto max-w-4xl space-y-6 pb-8">
    <PageHeader eyebrow="Your feedback" title="Review your contractors" description="Share your experience with a contractor you’re connected to. Your first name and last initial appear with the review on their public profile." />
    <section className="customer-review-pulse" aria-label="Review summary">
      <div><span>Connected contractors</span><strong>{contractors.length}</strong><small>People working with you</small></div>
      <div className="is-reviewed"><span>Reviews shared</span><strong>{contractors.filter((contractor) => contractor.review).length}</strong><small>Your published feedback</small></div>
      <div><span>Still to review</span><strong>{contractors.filter((contractor) => !contractor.review).length}</strong><small>Share feedback when work is complete</small></div>
    </section>
    {error && <ErrorState message={error} onRetry={load} className="customer-review-alert" />}
    {message && <p role="status" className="customer-dashboard-notice">{message}</p>}
    {loading ? <LoadingState label="Loading your contractors…" /> : contractors.length ? <div className="customer-review-list">{contractors.map((contractor) => <SectionCard key={contractor.id} title={contractor.name} description={contractor.review ? "Your review · edit your rating or comments" : "Connected contractor · share your experience"} className="customer-review-card">
      <div className="customer-review-identity"><span className="customer-review-avatar" aria-hidden="true">{String(contractor.name || "C").trim().charAt(0).toUpperCase()}</span><div><strong>{contractor.name}</strong><span>{contractor.contractor_id || "Your connected contractor"}</span></div>{contractor.review && <span className="customer-review-existing"><Star aria-hidden="true" /> {contractor.review.rating} / 5</span>}</div>
      {contractor.review?.comment && <blockquote className="customer-review-previous">“{contractor.review.comment}”</blockquote>}
      <fieldset className="customer-review-rating"><legend>{contractor.review ? "Update your rating" : "How was your experience?"}</legend><div role="group" aria-label={`Rating for ${contractor.name}`}>{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" onClick={() => setDrafts((current) => ({ ...current, [contractor.id]: { ...current[contractor.id], rating: value } }))} aria-label={`${value} star${value === 1 ? "" : "s"}`} aria-pressed={drafts[contractor.id]?.rating === value} className="rounded-md p-1"><Star aria-hidden="true" className={`h-7 w-7 ${value <= (drafts[contractor.id]?.rating || 0) ? "fill-amber-400 text-amber-500" : "text-slate-300"}`} /></button>)}</div></fieldset>
      <label className="customer-review-field mt-4 block text-sm font-semibold">Your review<textarea maxLength={1000} rows="4" value={drafts[contractor.id]?.comment || ""} onChange={(event) => setDrafts((current) => ({ ...current, [contractor.id]: { ...current[contractor.id], comment: event.target.value } }))} placeholder="What went well? What should other customers know?" className="mt-2 w-full rounded-xl border border-slate-300 p-3 font-normal outline-none focus:border-[#176b9b]" /></label>
      <p className="customer-review-privacy">Keep feedback specific to your project. Your public review uses your first name and last initial.</p>
      <Button type="button" disabled={!drafts[contractor.id]?.rating || savingId === contractor.id} loading={savingId === contractor.id} onClick={() => save(contractor.id)} className="mt-4">{contractor.review ? "Save review changes" : "Submit review"}</Button>
    </SectionCard>)}</div> : <EmptyState title="No connected contractors yet" description="Connect with a contractor before leaving a review." />}
  </div>;
}
