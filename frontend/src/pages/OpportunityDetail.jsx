import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../api/client";
import useAuth from "../context/useAuth";
import BackButton from "../components/BackButton";
import { ErrorState, LoadingState } from "../components/ui";
import LeadDetailView from "../components/leads/LeadDetailView";
import EmployeeLeadDetail from "../components/leads/EmployeeLeadDetail";
import { requestError } from "../components/leads/lead-format";
import "../components/leads/lead-workspace.css";

function LeadDetailResource({ id }) {
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestVersion = useRef(0);
  const mounted = useRef(true);
  const load = useCallback(async () => {
    if (!mounted.current) return null;
    const version = ++requestVersion.current;
    const current = () => mounted.current && requestVersion.current === version;
    try {
      const { data } = await api.get(`/quotations/leads/${id}/`);
      if (current()) { setItem(data); setError(""); return data; }
    } catch (failure) {
      if (current()) {
        if ([401, 403, 404].includes(failure.response?.status)) setItem(null);
        setError(requestError(failure, "Lead could not be refreshed. Please retry. Your saved updates are retained."));
      }
    } finally { if (current()) setLoading(false); }
    return null;
  }, [id]);
  useEffect(() => {
    mounted.current = true;
    load();
    return () => { mounted.current = false; requestVersion.current += 1; };
  }, [load]);
  if (loading) return <div className="lead-workspace"><LoadingState label="Loading lead..." /></div>;
  if (!item) return <div className="lead-workspace space-y-4"><BackButton fallback="/opportunities" label="Back to leads" /><ErrorState message={error || "Lead not found."} onRetry={load} /></div>;
  const props = { item, onSaved: load, refreshError: error, onRetry: load };
  return item.can_manage_lead === false ? <EmployeeLeadDetail {...props} /> : <LeadDetailView {...props} />;
}

export default function OpportunityDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  return <LeadDetailResource key={`${user?.id}-${id}`} id={id} />;
}
