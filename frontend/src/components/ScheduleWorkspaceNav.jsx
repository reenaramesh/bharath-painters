import useWorkspaceTabs from "./useWorkspaceTabs.js";
import { CalendarCheck, CalendarClock, History } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import useAuth from "../context/useAuth";
import { useLanguage } from "../i18n/LanguageContext";
import { menuRouteEnabled } from "../utils/menuVisibility";

const LINKS = [
  ["Work schedules", "/work-schedules", CalendarClock, ["CONTRACTOR", "CUSTOMER"]],
  ["Change work dates", "/work-reschedules", CalendarCheck, ["CONTRACTOR"]],
  ["Completed work", "/completed-work", History, ["CONTRACTOR", "CUSTOMER"]],
];

export default function ScheduleWorkspaceNav() {
  const { pathname } = useLocation();
  const { user, menuVisibility } = useAuth();
  const { t } = useLanguage();
  const navigationRef = useWorkspaceTabs(pathname);
  return <nav ref={navigationRef} aria-label={t("Schedule workspace")} className="bp-workspace-tabs flex min-w-0 max-w-full gap-2 overflow-x-auto pb-1">
    {LINKS.filter(([, path, , roles]) => roles.includes(user?.role) && menuRouteEnabled(user?.role, menuVisibility, path)).map(([label, path, Icon]) => {
      const active = pathname === path || pathname.startsWith(`${path}/`);
      return <Link key={path} to={path} aria-current={active ? "page" : undefined} className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-primary)] ${active ? "border-[var(--app-primary)] bg-blue-50 text-[var(--app-primary)]" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}><Icon size={16} aria-hidden="true" />{t(label)}</Link>;
    })}
  </nav>;
}
