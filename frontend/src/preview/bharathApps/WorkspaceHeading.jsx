// ---------------------------------------------------------------------------
// Personalised workspace heading (uses branding resolver)
// ---------------------------------------------------------------------------

import { workspaceHeading, workspaceSubheading } from "./branding";
import { usePreview } from "./state";

export function WorkspaceHeading() {
  const { state, branding, activeProfile } = usePreview();
  const activePersonaId = state.activePersonaId;
  const additional =
    activePersonaId === "employee"
      ? state.employee.additionalSkillIdentifiers
      : activeProfile?.additionalServiceIdentifiers ?? [];
  const heading = workspaceHeading(branding);
  const sub = workspaceSubheading(branding, additional);

  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="bp-eyebrow">Bharath Apps · Workspace</p>
        <h1 className="mt-1 truncate text-2xl font-extrabold tracking-tight text-[#172033] sm:text-3xl">
          {heading}
        </h1>
        <p className="bp-page-description mt-1 max-w-[760px]">{sub}</p>
      </div>
    </div>
  );
}