// ---------------------------------------------------------------------------
// Persona switcher (Preview only)
// ---------------------------------------------------------------------------
// Demo persona selector with "Preview only" label, per the requirement. It
// switches the mock state so all connected screens remain consistent.
// ---------------------------------------------------------------------------

import { UserCheck } from "lucide-react";
import { PERSONAS } from "./data";
import { usePreview } from "./state";
import { Avatar, SimulatedTag } from "./components";

export function PersonaSwitcher() {
  const { state, dispatch } = usePreview();

  return (
    <div className="mb-4 rounded-2xl border border-[#e5e9f2] bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <UserCheck size={17} className="shrink-0 text-[#176b9b]" />
          <div className="min-w-0">
            <p className="truncate text-[0.85rem] font-extrabold text-[#172033]">Demo persona</p>
            <p className="mt-0.5 text-[0.68rem] leading-snug text-[#667085]">
              Preview only — switches the view without touching real data. All screens stay consistent.
            </p>
          </div>
        </div>
        <SimulatedTag>Preview only</SimulatedTag>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {PERSONAS.map((p) => {
          const active = state.activePersonaId === p.id;
          return (
            <button
              key={p.id}
              onClick={() => dispatch({ type: "SET_PERSONA", personaId: p.id })}
              className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition ${
                active
                  ? "border-[#176b9b] bg-[#f2f7fb] ring-1 ring-[#176b9b]/10"
                  : "border-[#e5e9f2] bg-white hover:border-[#c7d0de]"
              }`}
            >
              <Avatar initials={p.initials} tone={active ? "brand" : undefined} />
              <div className="min-w-0">
                <p className="truncate text-[0.8rem] font-bold text-[#172033]">{p.label}</p>
                <p className="truncate text-[0.68rem] text-[#667085]">
                  {p.name} • {p.internalRoleLabel}
                </p>
                <p className="truncate text-[0.66rem] text-[#98a2b3]">{p.businessName}</p>
              </div>
              {active && (
                <span className="ml-auto inline-flex rounded-md bg-[#176b9b] px-1.5 py-0.5 text-[0.62rem] font-extrabold uppercase tracking-wide text-white">
                  Active
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}