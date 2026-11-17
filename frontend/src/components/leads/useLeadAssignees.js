import { useEffect, useState } from "react";
import api from "../../api/client";

export default function useLeadAssignees(enabled = true) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setLoading(true); setError("");
    api.get("/quotations/leads/assignees/")
      .then(({ data }) => { if (active) setMembers(data); })
      .catch(() => { if (active) setError("Team members could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [enabled, attempt]);
  return { members, loading: enabled && loading, error, retry: () => setAttempt(value => value + 1) };
}
