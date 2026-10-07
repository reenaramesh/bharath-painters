import { useEffect, useState } from "react";
import api from "../api/client";

// Resolve once in the layout so sidebar and mobile shortcuts share eligibility.
export default function useEmploymentStatus(user) {
  const [employment, setEmployment] = useState({ userId: null, status: "loading" });
  useEffect(() => {
    if (user?.role !== "PAINTER") return undefined;
    let current = true;
    const load = async () => {
      try {
        await api.get("/jobs/my-in-house-employment/");
        if (current) setEmployment({ userId: user.id, status: "in-house" });
      } catch (error) {
        // A network/auth error is not proof that the employee is independent.
        if (current) setEmployment({ userId: user.id, status: error.response?.status === 404 ? "freelance" : "unavailable" });
      }
    };
    load();
    window.addEventListener("focus", load);
    window.addEventListener("bp-employment-changed", load);
    return () => { current = false; window.removeEventListener("focus", load); window.removeEventListener("bp-employment-changed", load); };
  }, [user?.id, user?.role]);
  return user?.role !== "PAINTER" ? "freelance" : employment.userId === user.id ? employment.status : "loading";
}
