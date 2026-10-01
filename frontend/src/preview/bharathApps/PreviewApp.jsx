// ============================================================================
// BHARATH APPS — interactive preview shell
// ----------------------------------------------------------------------------
// Development-only. This module is imported exclusively from App.jsx behind
// `import.meta.env.DEV`, so a production build never includes it.
//
// It renders its own shell instead of DashboardLayout so it cannot affect any
// production navigation, and it makes no API calls at all.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  BookOpen,
  Building2,
  FileText,
  Handshake,
  Home,
  Layers,
  Network,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Users,
  Wrench,
} from "lucide-react";
import { GENERIC_MODULES, PLATFORM } from "./branding";
import { PREVIEW_CHECKS } from "./data";
import { PreviewProvider, usePreview } from "./state";
import { PersonaSwitcher } from "./PersonaSwitcher";
import { Button, Pill, PreviewBanner, SectionCard } from "./components";
import {
  ScreenAdminCatalogue,
  ScreenContractorProfile,
  ScreenEmployeeProfile,
  ScreenRegistration,
  ScreenWorkspaceBranding,
} from "./screens/accounts";
import { ScreenNetwork, ScreenProjectDetail, ScreenRequestQuote } from "./screens/network";
import {
  ScreenCompletion,
  ScreenPayments,
  ScreenWorkOutsourced,
  ScreenWorkReceived,
} from "./screens/outsourcing";

// ---------------------------------------------------------------------------
// Screen registry — grouped to mirror the intended platform navigation.
// `personas` lists the personas for which the screen is meaningful.
// ---------------------------------------------------------------------------
const SCREENS = [
  {
    group: "Platform",
    items: [
      {
        id: "branding",
        letter: "E",
        label: "Workspace branding",
        icon: Sparkles,
        personas: ["admin", "main", "receiving", "employee", "customer"],
        Component: ScreenWorkspaceBranding,
      },
      {
        id: "catalogue",
        letter: "D",
        label: "Service catalogue",
        icon: BookOpen,
        personas: ["admin"],
        Component: ScreenAdminCatalogue,
      },
    ],
  },
  {
    group: "Accounts",
    items: [
      {
        id: "registration",
        letter: "A",
        label: "Registration choice",
        icon: Building2,
        personas: ["admin", "main", "receiving", "employee"],
        Component: ScreenRegistration,
      },
      {
        id: "contractor-profile",
        letter: "B",
        label: "Contractor profile",
        icon: BadgeCheck,
        personas: ["admin", "main", "receiving"],
        Component: ScreenContractorProfile,
      },
      {
        id: "employee-profile",
        letter: "C",
        label: "Employee profile",
        icon: Users,
        personas: ["admin", "employee"],
        Component: ScreenEmployeeProfile,
      },
    ],
  },
  {
    group: "Contractor network",
    items: [
      {
        id: "network",
        letter: "F",
        label: "Contractor Network",
        icon: Network,
        personas: ["admin", "main", "receiving"],
        Component: ScreenNetwork,
      },
    ],
  },
  {
    group: "Customer project",
    items: [
      {
        id: "project",
        letter: "G",
        label: "Project detail",
        icon: Home,
        personas: ["admin", "main", "receiving", "employee", "customer"],
        Component: ScreenProjectDetail,
      },
      {
        id: "request-quote",
        letter: "H",
        label: "Request subcontractor quote",
        icon: Handshake,
        personas: ["main", "receiving"],
        Component: ScreenRequestQuote,
      },
    ],
  },
  {
    group: "Outsourcing",
    items: [
      {
        id: "work-received",
        letter: "I",
        label: "Work Received",
        icon: Layers,
        personas: ["admin", "receiving", "employee"],
        Component: ScreenWorkReceived,
      },
      {
        id: "work-outsourced",
        letter: "J",
        label: "Work Outsourced",
        icon: Wrench,
        personas: ["admin", "main"],
        Component: ScreenWorkOutsourced,
      },
      {
        id: "completion",
        letter: "K",
        label: "Completion & corrections",
        icon: ShieldCheck,
        personas: ["admin", "main", "receiving", "employee"],
        Component: ScreenCompletion,
      },
    ],
  },
  {
    group: "Financials",
    items: [
      {
        id: "payments",
        letter: "L",
        label: "Payment records",
        icon: ReceiptText,
        personas: ["admin", "main", "receiving", "customer"],
        Component: ScreenPayments,
      },
    ],
  },
];

const DEMO_STEPS = [
  { step: 1, persona: "Admin", do: "Screen D → Create category → add Cleaning" },
  { step: 2, persona: "Admin", do: "Screen E → confirm 'Bharath Cleaning Services' appears" },
  { step: 3, persona: "Employee", do: "Screen C → set primary trade to Cleaning" },
  { step: 4, persona: "Main contractor", do: "Screen B → change core service, watch branding move" },
  { step: 5, persona: "Main contractor", do: "Screen G → 3 scopes, painting + grouting internal" },
  { step: 6, persona: "Main contractor", do: "Screen H → select False Ceiling → send request" },
  { step: 7, persona: "Receiving contractor", do: "Screen I → submit quotation → assign own employee" },
  { step: 8, persona: "Main contractor", do: "Screen J → confirm scope & price" },
  { step: 9, persona: "Receiving contractor", do: "Screen I → confirm & schedule → start work" },
  { step: 10, persona: "Employee", do: "Screen K → submit completion evidence" },
  { step: 11, persona: "Main contractor", do: "Screen K → request correction, then approve" },
  { step: 12, persona: "Main contractor", do: "Screen L → record customer payment → subcontract balance unchanged" },
];

// ---------------------------------------------------------------------------
// Live verification panel — reads state, does not assert on user input.
// ---------------------------------------------------------------------------
function VerificationPanel() {
  const { state, branding } = usePreview();
  const wo = state.workOrder;
  const cleaning = state.catalogue.some((c) => c.identifier === "cleaning");
  const main = state.profiles.main;
  const cat = state.catalogue.find((c) => c.identifier === main.coreServiceIdentifier);

  const customerPaid = state.financials.customerToMain.payments.reduce((s, p) => s + p.amount, 0);
  const subPaid = state.financials.mainToReceiving.payments.reduce((s, p) => s + p.amount, 0);
  const groutingAlone =
    main.additionalSubServiceIdentifiers.includes("tile-grouting") &&
    !main.additionalSubServiceIdentifiers.includes("tile-installation");
  const additionalPresent = main.additionalServiceIdentifiers.length > 0;

  const results = {
    "core-branding": cat ? `Heading resolves to “${cat.workspaceName}” from core “${cat.name}”.` : "No core service set.",
    "additional-stable": additionalPresent
      ? `Workspace is still “${cat?.workspaceName}” with ${main.additionalServiceIdentifiers.length} additional service(s).`
      : "Add an additional service on screen B to test this.",
    "subservice-alone": groutingAlone
      ? "Only Tile Grouting is claimed — Tile Installation and Tile Repair are not."
      : "Select Tile Grouting alone on screen B to test this.",
    "admin-catalogue": cleaning
      ? "Cleaning was created by the admin form and is selectable on screens B and C."
      : "Cleaning is intentionally absent from the seed. Add it on screen D.",
    "separate-acceptance": `Connection = ${state.connections.filter((c) => c.status === "CONNECTED").length} connected / ${state.connections.filter((c) => c.status === "REQUESTED").length} pending. Work order is separately at “${STATUS_LABEL(wo.status)}”.`,
    "shared-scope": `Receiving sees ${wo.sharedScope.length} shared scope, ${wo.sharedPhotos.length} shared photos and 1 site contact. Customer quotation and margin are hidden.`,
    "payment-separation": `Customer paid ${customerPaid}; subcontractor paid ${subPaid}. These are tracked independently.`,
    "history-safe": `Historical item still reads “${state.project.customerQuotation.historicalLineItems[0].descriptionSnapshot}”.`,
    "formula-guard": `Painting deduction formulas apply to Painting only. Current scope ${state.project.scopes[1].categoryIdentifier} uses quantity × rate.`,
  };

  return (
    <SectionCard title="Live preview checks" description="Derived from preview state, read-only.">
      <ul className="space-y-1.5">
        {PREVIEW_CHECKS.map((c) => (
          <li key={c.id} className="rounded-lg border border-[#e5e9f2] bg-white px-3 py-2">
            <p className="text-[0.76rem] font-bold text-[#172033]">{c.label}</p>
            <p className="mt-0.5 text-[0.7rem] leading-relaxed text-[#667085]">{results[c.id]}</p>
          </li>
        ))}
      </ul>
      <div className="mt-3 rounded-lg border border-[#e5e9f2] bg-[#f9fafb] p-3">
        <p className="text-[0.72rem] font-bold text-[#475467]">Current workspace identity</p>
        <p className="mt-0.5 text-[0.85rem] font-extrabold text-[#172033]">
          {branding.isProfessionSelected ? branding.workspaceName : PLATFORM.name}
        </p>
        <p className="text-[0.7rem] text-[#667085]">Parent platform: {PLATFORM.name}</p>
      </div>
    </SectionCard>
  );
}

function STATUS_LABEL(s) {
  return String(s).replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
function PreviewInner() {
  const { state, dispatch, branding } = usePreview();
  const [screenId, setScreenId] = useState("branding");
  const personaId = state.activePersonaId;

  // Preview-only: the production <title> is left untouched.
  useEffect(() => {
    const previous = document.title;
    document.title = "Bharath Apps — preview";
    return () => {
      document.title = previous;
    };
  }, []);

  const activeScreen = useMemo(
    () => SCREENS.flatMap((g) => g.items).find((s) => s.id === screenId),
    [screenId],
  );
  const visibleGroups = useMemo(
    () =>
      SCREENS.map((g) => ({ ...g, items: g.items.filter((i) => i.personas.includes(personaId)) })).filter(
        (g) => g.items.length > 0,
      ),
    [personaId],
  );

  const Active = activeScreen?.Component;
  const isAdmin = personaId === "admin";
  const isContractor = personaId === "main" || personaId === "receiving";

  return (
    <div className="min-h-screen bg-[#f4f6fa]">
      {/* Preview header — visually distinct from the real application */}
      <header className="sticky top-0 z-30 border-b-2 border-dashed border-amber-400 bg-amber-50/95 backdrop-blur">
        <div className="mx-auto w-full max-w-[1640px] px-3 py-2.5 sm:px-4 md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-500 text-[0.7rem] font-extrabold text-white">
                {PLATFORM.short}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[0.88rem] font-extrabold text-[#172033]">
                  {PLATFORM.name} — Multi-trade &amp; outsourcing preview
                </p>
                <p className="truncate text-[0.68rem] text-[#92400e]">
                  Development-only · mock data · no API calls · isolated from production navigation
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  dispatch({ type: "RESET" });
                  setScreenId("branding");
                }}
              >
                Reset demo data
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1640px] px-3 py-4 pb-16 sm:px-4 md:px-6 md:py-6">
        <PreviewBanner />
        <PersonaSwitcher />

        <div className="grid gap-4 lg:grid-cols-[236px_minmax(0,1fr)]">
          {/* Screen navigation */}
          <nav className="min-w-0 lg:sticky lg:top-[92px] lg:self-start">
            <div className="rounded-2xl border border-[#e5e9f2] bg-white p-2.5">
              <p className="px-1.5 pb-1.5 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-[#98a2b3]">
                Screens ({activeScreen?.letter})
              </p>
              <div className="minimia-scroll flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
                {visibleGroups.map((g) => (
                  <div key={g.group} className="shrink-0 lg:shrink">
                    <p className="hidden px-1.5 pb-1 pt-2 text-[0.6rem] font-extrabold uppercase tracking-[0.12em] text-[#c4cad6] lg:block">
                      {g.group}
                    </p>
                    <div className="flex gap-1 lg:flex-col">
                      {g.items.map((s) => {
                        const Icon = s.icon;
                        const active = s.id === screenId;
                        return (
                          <button
                            key={s.id}
                            onClick={() => setScreenId(s.id)}
                            className={`flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[0.76rem] font-semibold transition ${
                              active ? "bg-[#176b9b] text-white" : "text-[#475467] hover:bg-[#f4f6fa]"
                            }`}
                          >
                            <Icon size={14} className="shrink-0" />
                            <span className="whitespace-nowrap lg:whitespace-normal">
                              <span className="mr-1 opacity-60">{s.letter}</span>
                              {s.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-2 border-t border-[#e5e9f2] pt-2">
                <p className="px-1.5 pb-1 text-[0.6rem] font-extrabold uppercase tracking-[0.12em] text-[#c4cad6]">
                  Generic modules
                </p>
                <div className="flex flex-wrap gap-1 px-1">
                  {GENERIC_MODULES.slice(0, 6).map((m) => (
                    <Pill key={m} tone="neutral">{m}</Pill>
                  ))}
                </div>
              </div>
            </div>
          </nav>

          {/* Active screen */}
          <div className="min-w-0 space-y-4">
            <div className="rounded-2xl border border-[#e5e9f2] bg-white p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-[#98a2b3]">
                    Platform · Workspace
                  </p>
                  <p className="truncate text-lg font-extrabold tracking-tight text-[#172033]">
                    {branding.isProfessionSelected ? branding.workspaceName : PLATFORM.name}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(isAdmin || isContractor || personaId === "employee") && (
                    <Pill tone="info">
                      {isAdmin ? "Admin" : branding.professionalSingular ?? "Provider"}
                    </Pill>
                  )}
                  <Pill tone="warning">Screen {activeScreen?.letter}</Pill>
                </div>
              </div>
            </div>

            {Active && <Active />}

            <div className="grid gap-4 xl:grid-cols-2">
              <SectionCard title="Demo scenario" description="Follow in order for a connected walkthrough.">
                <ol className="space-y-1.5">
                  {DEMO_STEPS.map((s) => (
                    <li key={s.step} className="flex gap-2 text-[0.74rem]">
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-[#f4f6fa] text-[0.64rem] font-extrabold text-[#475467]">
                        {s.step}
                      </span>
                      <span className="min-w-0">
                        <strong className="text-[#172033]">{s.persona}:</strong>{" "}
                        <span className="text-[#667085]">{s.do}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </SectionCard>

              <div className="space-y-4">
                <VerificationPanel />
                <SectionCard title="Activity log" description="Every simulated action, in order.">
                  <div className="minimia-scroll max-h-64 space-y-1.5 overflow-y-auto">
                    {[...state.activity].reverse().map((a) => (
                      <div key={a.id} className="rounded-lg border border-[#e5e9f2] bg-white px-3 py-2">
                        <p className="text-[0.72rem] text-[#475467]">{a.action}</p>
                        <p className="text-[0.64rem] text-[#98a2b3]">
                          {a.actorPersonaId} · {String(a.at).slice(11, 19)} · simulated
                        </p>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              </div>
            </div>

            <p className="flex items-start gap-2 rounded-xl border border-dashed border-amber-300 bg-amber-50 px-3 py-2.5 text-[0.72rem] leading-relaxed text-amber-900">
              <FileText size={14} className="mt-0.5 shrink-0" />
              This preview is gated behind <code className="font-mono">import.meta.env.DEV</code>. It is excluded from
              production builds, is not present in any navigation, does not bypass authentication for real routes, and makes
              no network requests.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BharathAppsPreview() {
  return (
    <PreviewProvider>
      <PreviewInner />
    </PreviewProvider>
  );
}