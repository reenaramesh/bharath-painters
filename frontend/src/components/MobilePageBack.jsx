import BackButton from "./BackButton";
import useAuth from "../context/useAuth";

export default function MobilePageBack() {
  const { user } = useAuth();
  return (
    <BackButton
      fallback={user?.role === "CUSTOMER" ? "/customer-dashboard" : "/dashboard"}
      label="Back"
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-950 md:hidden"
    />
  );
}
