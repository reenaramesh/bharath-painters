import { useLocation } from "react-router-dom";

export default function ComingSoon() {
  const title = useLocation().pathname.split("/").filter(Boolean).pop() || "Page";
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-10">
      <p className="text-sm font-semibold uppercase tracking-wide text-amber-600">Next module</p>
      <h1 className="mt-2 text-3xl font-bold text-slate-900 capitalize">{title.replace("-", " ")}</h1>
      
    </div>
  );
}
