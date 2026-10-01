import { BriefcaseBusiness, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";
import {
  APPLICATOR_AVAILABILITY_PATH,
  WORK_REQUIREMENTS_PATH,
} from "../constants/workNetwork";

const tabsFor = (contractor) =>
  contractor
    ? [
        { to: WORK_REQUIREMENTS_PATH, label: "Work requirements", icon: BriefcaseBusiness, countKey: "requirements" },
        { to: APPLICATOR_AVAILABILITY_PATH, label: "Applicator availability", icon: Users, countKey: "availability" },
      ]
    : [
        { to: WORK_REQUIREMENTS_PATH, label: "Available jobs", icon: BriefcaseBusiness, countKey: "requirements" },
        { to: APPLICATOR_AVAILABILITY_PATH, label: "My availability", icon: Users, countKey: "availability" },
      ];

export default function WorkNetworkTabs({ pathname, contractor, requirementsCount, availabilityCount }) {
  const { t } = useLanguage();
  const tabs = tabsFor(contractor);
  const counts = { requirements: requirementsCount, availability: availabilityCount };

  return (
    <nav
      aria-label="Work network"
      className="flex w-full gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1 sm:inline-flex sm:w-auto"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = pathname === tab.to;
        const count = counts[tab.countKey];
        return (
          <Link
            key={tab.to}
            to={tab.to}
            aria-current={active ? "page" : undefined}
            className={`flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm transition sm:flex-none sm:shrink-0 sm:px-4 ${
              active
                ? "bg-white font-bold text-slate-950 shadow-sm"
                : "font-semibold text-slate-600 hover:bg-white/60 hover:text-slate-900"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{t(tab.label)}</span>
            {typeof count === "number" && (
              <span
                className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  active ? "bg-slate-900 text-white" : "bg-slate-300 text-white"
                }`}
              >
                {count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
