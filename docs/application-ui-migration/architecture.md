# Architecture and behaviour inventory

## Existing foundation

`main.jsx` mounts AuthProvider/LanguageProvider, popup input protection and the production service worker. `App.jsx` uses lazy page imports, route error boundaries and Suspense. `DashboardLayout.jsx` provides Sidebar, Topbar, outlet, role-specific bottom navigation, floating actions, global table sorting, mobile table dialogs and customer connection prompts. The separate Expo `mobile/` project is not the web/PWA implementation and is outside this migration.

Canonical tokens live in `index.css`; `application-ui.css` normalizes existing shared controls; `reference-theme.css` carries the approved master presentation. Page-family CSS remains extensive and requires individual review, not another broad rewrite. Existing common components include PageHeader, Button, StatCard, SectionCard, FormField, StatusBadge, loading/empty/error states, ContractorDialog, CustomerForm/ConnectionFlow, PropertyForm, SearchableSelect, PdfPreview and contractor contact links.

## Authorization and navigation

ProtectedRoute requires a session. VerifiedContractorRoute currently checks the Contractor role; despite its name it does not itself enforce verification. ProviderProfileRoute allows Contractor/Painter. Additional page checks and Django permissions remain authoritative. `config/navigation.js` and menu visibility select role/employment destinations; menu availability alone is not authorization. Painter freelance/in-house variants must be exercised separately. Public share/review pages enforce their own save eligibility.

The generated 98-route inventory includes public routes, authenticated routes, legacy redirects, development-only previews and the catch-all. Dashboard query sections and other conditional in-page states need supplementary checks; they are not separate router paths.

## Shared workflows to preserve

| Area | Existing integration and interactions |
| --- | --- |
| Session | AuthContext + API client: login, Google login, refresh/session expiry, role state, logout/push cleanup. |
| Navigation | Sidebar search/groups/rail/mobile focus trap; Topbar search `/quotations/global-search/`, notifications/read actions, profile menu and home/back navigation. |
| Localization | LanguageContext + i18next resources, navigation/status/auth namespaces, transliteration fallback, script fonts and the Vite static-system-copy plugin. Transliteration is not a complete semantic translation. |
| CRM | Customer connection states, private saved contacts, detail actions/follow-ups, property access and activity history. Keep per-contractor scope. |
| Contacts | Truecaller multipart service-worker handoff, explicit Painter/Customer selection, retained draft, duplicate lookup, private painter/customer save and existing detail routes. |
| Measurements/quotes | Property/room/surface ownership, units/deductions, revisions/locking, grouped/manual/measured items, pricing/discount/tax distinctions, drafts/handoffs, approval, PDF preview/download. |
| Workforce | Freelance/in-house eligibility, job applications/invitations, assignment/attendance, schedules/changes, work order states and review/approval. |
| Finance | Actual API totals, payment/advance allocation, invoice state, contractor/customer project accounts and subscription administration. |
| Communication | Conversation selection/unread counts, send/upload failures, service/support requests and notification deep links. |
| Admin | User/verification/account actions, safe confirmation, recovery/billing/master data and reports; no invented backend controls. |

## Migration evidence policy

Every page begins pending. Record inspected actions/conditional states, changed components, viewport screenshots, keyboard/accessibility checks and API success/failure evidence. Prior theme screenshots can support comparisons but do not establish business-flow completion. Isolated fixtures are labelled and never used as production data.

Test builds, targeted Node tests and browser suites sequentially to avoid the resource contention observed during the earlier theme rollout. Use 320/375/390/428/768/1024/1280/1440px for the final responsive matrix; state any omitted width/state. Preserve existing dirty files; snapshot at `backend/.qa-temp/application-ui-20261016-start/`. Do not deploy or push.
