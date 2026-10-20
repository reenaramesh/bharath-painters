import { BriefcaseBusiness, CalendarCheck, ClipboardList, Users } from "lucide-react";
import useWorkspaceTabs from "./useWorkspaceTabs.js";
import { Link, useLocation, useOutletContext } from "react-router-dom";
import useAuth from "../context/useAuth";
import { useLanguage } from "../i18n/LanguageContext";
import { activeNavigation, visibleNavigation } from "../config/navigation";
import { CONTRACTOR_HIRING_IDS } from "../utils/hiringNavigation.js";
import { menuEnabled } from "../utils/menuVisibility";

const PAINTER_LINKS = ["available-work", "painter-applications", "painter-bookings", "availability"];
const ICONS = { jobs: BriefcaseBusiness, "available-work": BriefcaseBusiness, "job-activity": ClipboardList, "painter-applications": ClipboardList, bookings: CalendarCheck, "painter-bookings": CalendarCheck, "painter-contacts": Users, referrals: Users, availability: CalendarCheck };

export default function HiringWorkspaceNav() {
  const { user, menuVisibility } = useAuth();
  const { employmentStatus = "loading" } = useOutletContext() || {};
  const { pathname, search = "" } = useLocation();
  const { t } = useLanguage();
  const ids = user?.role === "PAINTER" ? PAINTER_LINKS : user?.role === "CONTRACTOR" ? CONTRACTOR_HIRING_IDS : [];
  const source = visibleNavigation(user?.role, employmentStatus);
  const ordered = user?.role === "CONTRACTOR" ? ids.map(id => source.find(entry => entry.id === id)).filter(Boolean) : source.filter(entry => ids.includes(entry.id));
  const entries = ordered.filter(entry => menuEnabled(user?.role, menuVisibility, entry.id));
  const selected = activeNavigation(entries, `${pathname}${search}`);
  const navigationRef = useWorkspaceTabs(selected?.id);
  if (!entries.length) return null;
  return <nav ref={navigationRef} aria-label={t(user?.role === "CONTRACTOR" ? "Jobs & Applications sections" : "Hiring workspace")} className="bp-workspace-tabs flex min-w-0 max-w-full gap-2 overflow-x-auto pb-1">
    {entries.map(entry => {
      const Icon = ICONS[entry.id];
      const active = selected?.id === entry.id;
      return <Link key={entry.id} to={entry.route} aria-current={active ? "page" : undefined} className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-primary)] ${active ? "border-[var(--app-primary)] bg-blue-50 text-[var(--app-primary)]" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
        <Icon size={16} aria-hidden="true" />{t(`navigation:${entry.id}`, { defaultValue: entry.label })}
      </Link>;
    })}
  </nav>;
}
