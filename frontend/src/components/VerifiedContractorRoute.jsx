import { Navigate } from "react-router-dom";
import useAuth from "../context/useAuth";

export default function VerifiedContractorRoute({ children }) {
  const { user } = useAuth();
  if (user?.role !== "CONTRACTOR") {
    return <Navigate to={user?.role === "CUSTOMER" ? "/customer-dashboard" : "/dashboard"} replace />;
  }
  return children;
}
