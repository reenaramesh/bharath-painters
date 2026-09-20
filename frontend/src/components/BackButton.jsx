import { ArrowLeft } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { resolveBackTarget } from "../utils/navigation";

export default function BackButton({
  fallback = "/dashboard",
  label = "Back",
  className = "inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-950",
}) {
  const navigate = useNavigate();
  const location = useLocation();

  function goBack() {
    const explicitReturn =
      location.state?.returnTo || location.state?.customerPath;
    const { target } = resolveBackTarget({
      location,
      fallback,
      explicitReturn,
    });
    navigate(target);
  }

  return (
    <button type="button" onClick={goBack} className={className}>
      <ArrowLeft className="h-4 w-4" />
      {label}
    </button>
  );
}
