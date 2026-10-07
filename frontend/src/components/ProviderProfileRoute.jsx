import { Navigate } from "react-router-dom";
import useAuth from "../context/useAuth";

// The multi-trade profile belongs to whoever does the work, which is the
// contractor and the employee. Everyone else has no profile to edit.
export default function ProviderProfileRoute({ children }) {
  const { user } = useAuth();
  if (!["CONTRACTOR", "PAINTER"].includes(user?.role)) {
    return (
      <Navigate
        to={user?.role === "CUSTOMER" ? "/customer-dashboard" : "/dashboard"}
        replace
      />
    );
  }
  return children;
}

export function LegacyPersonalSettingsRedirect() {
  const { user } = useAuth();
  return <ProviderProfileRoute><Navigate to={`/settings?tab=${user?.role === "PAINTER" ? "personal" : "company"}`} replace /></ProviderProfileRoute>;
}
