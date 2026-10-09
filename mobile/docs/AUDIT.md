# Mobile audit and architecture — 9 October 2026

## Scope and evidence

Read-only source audit of `frontend/src/App.jsx`, `frontend/src/config/navigation.js`, `frontend/src/context/AuthContext.jsx`, `frontend/src/api/client.js`, all five Django URL modules, account roles, ContractorCrmDashboardView, IsVerifiedContractor, and property_access.py. This is a source audit, not a production API probe. Existing backend, database, web pages and deployment are outside the change scope. Complete route and endpoint declarations are captured in `route-inventory.md`.

## Role-wise screen inventory

| Backend role | Existing web screens / workflows | Proposed native destinations |
|---|---|---|
| CONTRACTOR | Dashboard; Customers and customer quotation history; Properties, rooms and measurements; Leads, Opportunities and Site Visits; Quotations with measured/manual builders, edit, PDF and submit; Tasks; Schedules, changes, reschedules, completed work and photos; Completed Projects portfolio; Employees, team, bookings, job posts/applications and contractor network; outsourced/received work orders; invoices, payments/revenue, subscriptions; chat, service requests, support; catalogue/rates, reports, settings, profile, account security | Home / Customers / Work / Messages / More. Customers → detail → properties → measurement. Work → leads, quotations, projects, schedules, payments. More → business tools and account. |
| CUSTOMER | Dashboard; contractor connections/requests and reviews; properties and sharing/access; quotations and actions; shared measurement access; invoices/receipts; schedules, work changes and completed work; photos, messages, requests, support, colors, profile, appearance/security | Home / Properties / Work / Messages / Account. Property detail is the permission context for measurements, quotations and sharing. |
| PAINTER (employee/professional) | Applicator dashboard; assignments/progress; freelance availability, jobs and bookings; in-house employment and earnings; job activity, photos/reviews, messages, support, settings/profile/subscription | Today / Assignments / Calendar / Messages / Account. Employment response selects in-house vs freelance sections. No fabricated EMPLOYEE role. |
| ADMIN | Operations dashboard, contractors/professionals, customer connections/audit, billing/subscription revenue/packages, catalogue/master data, reports/photos/activity, support staff, API settings, profile/security | Overview / People / Operations / Finance / Account. Build separately after contractor workflows. |
| SUPPORT | Recovery workspace/search/actions/audit, support tickets, profile, appearance, account security | Restricted support stack; never inherit Admin access. |
| Public | Login, contractor/painter/customer registration, recovery, customer share links, property invitation links, identity/profile PDFs | Auth stack and deferred deep-link resolver. Registration, recovery and invitation acceptance are later increments. |

## Endpoint mapping (paths relative to /api)

| Native feature | Existing contract | Access / integration notes |
|---|---|---|
| Session | POST accounts/login/ `{identifier,password}` → `{access,refresh,user}`; POST accounts/token/refresh/ `{refresh}`; GET accounts/me/ | Bearer JWT. Native SecureStore, no browser localStorage. Login identifier accepts mobile or verified recovery email. |
| Menu | GET accounts/menu-visibility/ → role-keyed disabled IDs | UI visibility is separate from authorization. On menu failure, hide optional live destinations until retry succeeds. |
| Contractor home | GET quotations/contractor-crm/dashboard/ | CONTRACTOR only. Counts, quotation_value, profile_completion, pipeline, tasks, site_visits, recent_customers, recent_quotations, new_requests. quotation_value is estimate value, not collected revenue. |
| Customers | quotations/customers/, customers/:id/, customers/:id/follow-ups/; contractor/customer-connections/ and request/ | Customer visibility follows connected contractor relationship. Never assume global customer ownership. |
| Properties | quotations/properties/, properties/:id/, invitations/, share-search/, share/, contacts/:action/ | Keep primary/shared contact and permission rules. No sharing writes in foundation. |
| Leads | quotations/leads/, leads/:id/, site-visits/ | The web Opportunities screens also use leads/ with filters such as view=all. There is no separate opportunities API route. Preserve stage, ownership and transitions. |
| Measurements | quotations/properties/:id/measurement-records/, measurement-records/:id/ and submit/; properties/:id/rooms/, properties/:id/measurements/, measurements/:id/openings/, properties/:id/room-measurement/save/; measurement-access/ | Preserve opening deductions/additions, units, wall/ceiling behavior and approval workflow. Calculator always belongs to a property. |
| Quotations | quotations/, create/, preview-pdf/, :id/, :id/submit/, :id/pdf/, room sync; project-scopes/ and work-changes/ | Server requires verified CONTRACTOR: both is_verified and verification_status=VERIFIED. Port builder/calculations only after parity fixtures. |
| Projects | accounts/profile-card/projects/ (completed portfolio); jobs/work-schedules/; quotations/project-scopes/ | No single generic all-projects endpoint. Active work derives from schedules/scopes; completed portfolio is separate. |
| Schedules | jobs/work-schedules/ with accept/, painters/, payment/, cancel/, progress/, advance-receipt/ | Preserve customer acceptance, schedule status, assignment and financial transitions. |
| Payments | quotations/invoices/ with :id/payments/, pdf/, receipt/; billing/contractor-revenue/ and receipts/ | Separate invoice payments, schedule advances and revenue receipts. No invented unified payment POST. |
| Messages | quotations/chat/conversations/, contacts/, conversations/:id/messages/, safety/, messages/:id/, forward/, attachments/:id/ | Existing REST conversation/safety permissions; no assumed websocket endpoint. |
| Settings | accounts/provider-profile/, contractor-profile/, business-settings/, recovery-email/, change-password/, profile-card/ | Theme is local in foundation; profile/security writes follow later. |
| Employees | jobs/applicator-dashboard/, my-assignments/, my-in-house-employment/, my-in-house-earnings/, applicator-availability/, applicator-bookings/ | Employment determines eligible work options; server remains authority. |
| Customer dashboard | quotations/customer-portal/dashboard/, properties/, quotations/, invoices/; customer/contractors/; billing/customer-finance/ | Render effective property_access.permissions individually. Deny missing flags. |
| Admin/support | quotations/admin-dashboard/, admin/customer-connections/, support-staff/, support-workspace/*; billing/plans/, assignments/, revenue/ | Explicit role-specific stacks; no client privilege changes. |
| Outsourcing | outsourcing/work-orders/ and detail transitions/scopes/assignments/wages/quotes/quote-decisions/invoices/payments/additional-work/events | Subsequent dedicated work-order flow; retain participant access and state machine. |

## Navigation and reusable components

Expo Router root stack contains login, a role holding screen, contractor tabs, module list, record detail, and a native modal presented as a bottom sheet. Android back pops details/sheets before tabs; tabs return to Home. All ten requested modules are reachable in the demo prototype. In live mode only Home integrates business data; other destinations explicitly describe pending integration, never show sample records as real data.

React Native Paper provides MD3 buttons, inputs, search, cards, chips, icons and progress. The user-selected redesign uses navy, ivory and orange, bundled Manrope typography, 4/8/12/16/24/32 spacing, 20dp cards and 48dp controls. Reuse Screen (safe areas + keyboard avoidance), Section, BusinessBriefing, DailyFocus, ContractorShortcuts, ModuleTile, RecordCard, Empty/Error State, DashboardSkeleton and status labels. Lists use FlatList with stable keys; dashboard is bounded to six recent items per backend contract. Sheet uses native stack modal presentation and explicit close. Theme respects system settings and supports local overrides. Avoid motion on reduced-motion preference via MD3 animation scale and disabled stack transitions. See REDESIGN.md for the visual rationale and desktop preview frame.

## State and security coverage

Boot/restoration → loading; invalid session → login; offline restoration → retry without deleting valid tokens; unauthorized role → explicit holding screen; unverified contractor → restricted quotation/payment/project destinations. Home supports skeleton, refresh, error/retry and real empty data. Demo is entered explicitly from Login, has a persistent sample-data label, uses local fixtures only, and cannot submit to the backend. Passwords are never stored. Native tokens are a single SecureStore session; web preview uses memory only. Refresh is single-flight; logout/expiry cannot be undone by an in-flight refresh. API paths are relative and origin-bound; HTTPS required except explicit local development. No financial writes or duplicated quotation calculations in this increment.

## Implementation sequence

1. Source inventory and locked navigation/design specification (this document).
2. Isolated Expo/TypeScript/Router/MD3 setup, theme, safe areas, guarded session, API client and tests.
3. Contractor Home, five tabs, all ten demo destinations, searchable fixture lists/detail and quick-action sheet. Connect login/me/menu/Home read-only.
4. Customer connection directory and property detail reads, pagination/search adapters, permission fixtures; then native add-customer/property forms with step-level validation and preserved drafts.
5. Measurement property/room/surface/opening editor. Compare against existing calculator fixtures, unit rounding, deductions, submit and sharing approval responses.
6. Quotation wizard: customer/property → measured/manual scope → service/rates → tax/discount → review. Verify totals, revisions, PDF and submit parity before enabling writes.
7. Leads/opportunities/tasks/site visits; schedules, changes, assignments and projects with backend state transitions.
8. Invoices/advances/receipts and financial reconciliation; chat and attachments/safety; settings/profile/security.
9. Customer, employee (in-house/freelance), Admin and Support dashboards with dedicated permission tests.
10. Device QA at 360/390/430dp and smaller widths; TalkBack, large font, dark mode, keyboard, reduced motion, back/deep links, slow network and list performance. Android signed build/distribution is a separate approved release task.

## Foundation acceptance

TypeScript check, unit tests for authorization/session/API refresh, Expo Android bundling, and web-preview visual/navigation QA where runtime is available. Browser preview does not prove native keyboard, TalkBack, Android back or performance; those require emulator/device validation. No production deployment or backend/database changes.

Technical references: [Expo Router setup](https://docs.expo.dev/router/installation/), [Expo SDK 55](https://expo.dev/blog/upgrading-to-sdk-55), [Paper MD3 theming](https://oss.callstack.com/react-native-paper/docs/guides/theming).
