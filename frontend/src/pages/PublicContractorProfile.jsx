import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import ContractorProfileAdapter, { ContractorProfileSkeleton } from "../components/ContractorProfileAdapter";
import { loadContractorPublicProfile } from "../utils/contractorPublicProfile.js";

export default function PublicContractorProfile() {
  const { bharathId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null); setError("");
    loadContractorPublicProfile(bharathId).then(value => { if (active) setData(value); })
      .catch(() => { if (active) setError("This verified contractor profile is unavailable. Please try again."); });
    return () => { active = false; };
  }, [bharathId, attempt]);
  return <main className="mx-auto max-w-5xl min-w-0 p-2 sm:p-4">
    {error ? <div role="alert" className="rounded-xl border bg-white p-5"><p>{error}</p><button type="button" className="mt-3 min-h-11 rounded-lg border px-4 bp-ui-action" onClick={() => setAttempt(current => current+1)}>Retry</button></div> : data ? <ContractorProfileAdapter data={data} /> : <ContractorProfileSkeleton />}
  </main>;
}
