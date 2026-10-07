# Bharath UI refresh proposal

Status: proposed for user review; application source has not been changed.

## Recommended first pass

Refresh shared dashboard navigation and the contractor dashboard using a crafted studio workspace direction: the clarity of a professional project ledger with the material warmth of an interior design studio.

The application already has shared `--bp-*` tokens, appearance variables, reusable cards, Lucide icons, mobile navigation, and contractor dashboard styling. Extend these conventions rather than introducing a second component library.

## Design brief

- Purpose: make daily project management attractive, readable, and easy to scan.
- Audience: contractors using phones on site and larger screens in the office.
- Tone: crafted studio workspace.
- Reference: an interior studio's project ledger and paint sample presentation.
- Palette: warm ivory canvas, white surfaces, deep blue navigation, existing user-selected brand accent.
- Type: retain supported body typography and use the existing Plus Jakarta Sans stack for confident headings; verify font availability before relying on it.
- Memorable: a restrained paint-swatch motif in the dashboard welcome area, with practical information taking priority.
- Restraint: avoid decorative charts, invented metrics, background video, and excessive animation.

## Scope and intended files

- `frontend/src/index.css`: shared presentation tokens and carefully scoped dashboard styles; preserve existing token names and appearance overrides.
- `frontend/src/layouts/DashboardLayout.jsx`: presentation markup only if required for the refined shell.
- `frontend/src/components/Sidebar.jsx`: presentation of existing navigation, active states, and branding; preserve menu visibility and role rules.
- `frontend/src/pages/contractor-dashboard.css`: dashboard spacing, typography, cards, action hierarchy, and responsive composition.
- `frontend/src/pages/ContractorDashboard.jsx`: presentation markup only if necessary; retain existing data, calculations, links, and actions.

All of these files must be read in full before implementation. Existing uncommitted edits must be preserved. Backend/database files, authentication, menu permissions, API calls, calculations, and workflow behavior are outside this change.

## Composition

Use a clear welcome area and one prominent existing primary action. Keep alerts readable and distinguish their urgency through existing status semantics. Give summary metrics consistent typography and alignment. Use compact, orderly rows for recent work and generous spacing between major sections. Refine sidebar hierarchy through spacing and active-state contrast without changing available navigation items.

At narrow widths, stack sections in task order, let labels wrap, and retain touch-friendly controls. At wider widths, use the existing dashboard grid with a clear primary work column and supporting activity column. Preserve reading and tab order.

## State coverage

Preserve and style the existing loading, empty, error, overdue, disabled, and populated states. Keep existing error and empty-state actions. Support long customer names, large currency values, translated labels, keyboard focus, and reduced-motion preferences.

## Verification

Run the frontend build and appropriate existing checks. Inspect actual desktop and mobile renders, including the dashboard's populated and empty states where accessible. Check overflow, focus visibility, readable contrast, touch targets, and existing appearance overrides. Use the installed frontend-design-review and responsive-design guidance; use an available Playwright workflow for browser QA. Report authentication or browser-runtime blockers explicitly rather than claiming unobserved screens passed.

## Alternatives

1. Crafted studio workspace (recommended): distinctive but suited to daily operational use; focused first pass.
2. Minimal polish: retain the current cool palette and improve spacing, type, and borders; less visual change.
3. Full application redesign: extend a new presentation system across every role and workflow; requires a broader page inventory and staged review.

## Acceptance criteria

The shared shell and contractor dashboard have a coherent presentation, primary actions are easy to identify, layouts remain usable at mobile and desktop widths, selected appearance colors still work, and existing behavior and uncommitted changes remain intact. Other pages receive only intentional shared-shell effects during this first pass.
