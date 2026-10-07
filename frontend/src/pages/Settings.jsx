import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Sparkles, UserRound } from "lucide-react";
import useAuth from "../context/useAuth";
import ProviderProfile from "./ProviderProfile";
import ContractorBusinessSettings from "./ContractorBusinessSettings";
import ApplicatorProfile from "./ApplicatorProfile";
import { PageHeader } from "../components/ui";
import LanguageSelector from "../components/LanguageSelector";

// Contractor Settings uses the approved combined business form. Employee
// Settings retains its existing personal/trade modules and role-specific APIs.
const EMPLOYEE_TABS = [
  { id: "trade", label: "Trade & skills", icon: Sparkles },
  { id: "personal", label: "Personal details", icon: UserRound },
];

export default function Settings() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const isEmployee = user?.role === "PAINTER";
  const tabs = EMPLOYEE_TABS;

  // A legacy deep link such as /settings?tab=personal must still open that tab,
  // and an unknown tab falls back to the first one instead of rendering nothing.
  const requested = params.get("tab");
  const active = useMemo(
    () => (tabs.some((tab) => tab.id === requested) ? requested : tabs[0].id),
    [requested, tabs],
  );

  const select = (id) => {
    const next = new URLSearchParams(params);
    next.set("tab", id);
    setParams(next, { replace: true });
  };

  if (!isEmployee) return <div className="space-y-6"><LanguageSelector /><ContractorBusinessSettings /></div>;

  if (isEmployee) {
    return (
      <div className="space-y-6">
        <LanguageSelector />
        <PageHeader
          eyebrow="Settings"
          title="Your trade and personal details"
          description="One place for everything about how you work and who you are."
        />
        <TabBar tabs={tabs} active={active} onSelect={select} />
        <Link to="/profile" className="inline-block font-semibold text-sky-700">View & share QR/public profile</Link>
        <Panel id="trade" active={active}><ProviderProfile embedded /></Panel>
        <Panel id="personal" active={active}><ApplicatorProfile embedded /></Panel>
      </div>
    );
  }

  return null;
}

// Keep forms mounted: switching sections must never throw away unsaved edits.
function Panel({ id, active, children }) {
  return <section role="tabpanel" id={`settings-panel-${id}`} aria-labelledby={`settings-tab-${id}`} hidden={active !== id} tabIndex={0}>{children}</section>;
}

function TabBar({ tabs, active, onSelect }) {
  return (
    <div role="tablist" aria-label="Settings sections" className="flex flex-wrap gap-2">
      {tabs.map(({ id, label, icon: Icon }) => {
        const selected = id === active;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            id={`settings-tab-${id}`}
            aria-selected={selected}
            aria-controls={`settings-panel-${id}`}
            tabIndex={selected ? 0 : -1}
            onKeyDown={(event) => {
              const index = tabs.findIndex((tab) => tab.id === id);
              const next = event.key === "ArrowRight" ? (index + 1) % tabs.length
                : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length
                : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
              if (next === null) return;
              event.preventDefault();
              onSelect(tabs[next].id);
              document.getElementById(`settings-tab-${tabs[next].id}`)?.focus();
            }}
            onClick={() => onSelect(id)}
            className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
              selected
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        );
})}
    </div>
  );
}
