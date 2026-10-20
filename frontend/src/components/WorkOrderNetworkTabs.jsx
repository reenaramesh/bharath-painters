import useWorkspaceTabs from "./useWorkspaceTabs.js";
import { Link, useLocation } from "react-router-dom";
import { ClipboardList, Network } from "lucide-react";
import useAuth from "../context/useAuth";
import { menuRouteEnabled } from "../utils/menuVisibility";

export default function WorkOrderNetworkTabs() {
  const { pathname } = useLocation();
  const { user, menuVisibility } = useAuth();
  const navigationRef = useWorkspaceTabs(pathname);
  return <nav ref={navigationRef} aria-label="Work orders and subcontractors" className="bp-workspace-tabs flex min-w-0 gap-2 overflow-x-auto pb-1">
    {[["Work Orders", "/subcontract-work-orders", ClipboardList], ["Subcontractors", "/contractor-network", Network]].filter(([,path]) => menuRouteEnabled(user?.role, menuVisibility, path)).map(([label,path,Icon]) => <Link key={path} to={path} aria-current={(pathname === path || pathname.startsWith(`${path}/`)) ? "page" : undefined} className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 text-xs ${(pathname === path || pathname.startsWith(`${path}/`)) ? "border-[var(--app-primary)] bg-blue-50 text-[var(--app-primary)]" : "bg-white text-slate-600"}`}><Icon size={16} aria-hidden="true" />{label}</Link>)}
  </nav>;
}
