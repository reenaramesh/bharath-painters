# Premium mobile starter integration plan

**Goal:** Merge the supplied starter's blue-and-white dashboard into the existing isolated Expo mobile foundation, with authenticated Django reads and no production changes.

**Architecture:** Keep the existing guarded Expo Router stack, five Contractor tabs, SecureStore session and refresh client. Adapt the ZIP's DashboardCard components and theme tokens into the existing root-level mobile app. A typed, session-scoped repository caches dashboard/profile reads for 60 seconds and deduplicates concurrent loads. No polling or financial writes.

**Tech stack:** Expo SDK 55, React Native, TypeScript, Expo Router, React Native Paper MD3, Ionicons, SecureStore.

- [x] Audit Git, ZIP, frontend Contractor view, account roles/login/profile serializers, Django URL declarations, dashboard and property authorization. No AGENTS.md found outside excluded dependency folders. Baseline: only starter ZIP and mobile/designs are untracked.
- [x] Adapt starter theme and reusable metric/action cards inside mobile/src; preserve native safe areas, dark mode and 48dp controls.
- [x] Add mobile/src/core/workspace.ts: dashboard/profile reads, contract validation, single-flight cache, explicit refresh and logout invalidation. Test cache, invalidation, contract failure and profile failure independently.
- [x] Merge real dashboard metrics, follow-ups, pipeline, visits, quotations, customers and profile summary. Keep all ten shortcuts permission-gated. Never label estimate value as revenue or substitute sample values on API failure.
- [x] Run mobile typecheck, targeted unit tests, Expo configuration and compatibility checks. Use a mocked API browser preview for login, permission denial, error states and widths 360/390/430; no production requests.
- [x] Report Git diff including protected path checks; document source mappings, ZIP adaptations, launch instructions, native tests still unverified and module status.

Subsequent increments: customer/property read screens with bounded data strategies; measurement parity; quotation wizard parity; schedules/projects; invoice/receipt payments; chat; profile writes; other role dashboards. Existing demo screens are not completed API integrations.
