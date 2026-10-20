# Phase 4 Expo Mobile and Offline Field Mode Report

Date: 2026-10-17

## Implemented

- Extended the existing SQLite operation queue with additive local schema upgrades, stable mutation IDs, actor scoping, parent links, local references, base-version fields, saved parent responses, update timestamps, retry timestamps, and a unique actor/mutation index. Existing queue rows are retained and receive compatible defaults.
- Added dependency-aware measurement replay. New offline rooms keep a local room reference; queued surfaces wait until the room response provides the authoritative room and measurement IDs. The server response is retained so a failed child retry can resume after an app restart.
- Cached a minimal property/measurement context per signed-in account and recover it when offline. Customer names and unrelated profile data are not included in the cache.
- Added transient exponential backoff (1 second to 15 minutes), manual retry, online/foreground retry, 401 re-authentication state, 4xx conflict state, and measurement version preflight against the existing measurement-record list API.
- Added offline attendance recording for contractor employee attendance and preserved Painter attendance submission as pending review. Both continue through the existing attendance API; the mobile queue never writes to wage ledgers or approves attendance.
- Added a Painter Attendance tab showing eligible in-house assignment check-in and attendance history, and routed Painter attendance conflicts there.
- Added Interior/Exterior and Wall/Ceiling/Texture Wall choices to the existing measurement input. Texture Wall reuses the server's existing `OTHER` surface with the existing `Texture Walls` area group. No calculation is performed on-device.
- Added Metro WebAssembly asset handling so the Expo web bundle can include Expo SQLite's existing WASM worker.
- Added a default-off compatibility gate for offline measurement replay. The server room and surface idempotency fields depend on prepared quotations migrations 0121 and 0122. With the gate off, queued measurement changes are retained and visibly held rather than replayed unsafely. Online room/surface writes still use the existing API; their success on a particular database depends on that environment's active backend code and schema.

## Existing workflows preserved

The current Contractor dashboard, customer/property records, manual quotation wizard, measurement quotation wizard, schedules, employee attendance review, work progress, and Painter jobs, applications, bookings, assignments, progress photos, and earnings screens were extended in place. Existing server endpoints remain the authority for permissions, totals, attendance status, approvals, and earnings.

## Verification

- `npm.cmd run typecheck` — passed.
- `npm.cmd test` — passed, 39 tests.
- `npm.cmd run export:android -- --max-workers 1` — passed; generated the Android JavaScript bundle.
- `npx.cmd expo export --platform web --max-workers 1` — passed; generated web bundles and included the SQLite WASM asset.
- No Django migrations were applied. No production calls, push, deployment, or full regression suite were run.
- No physical Android install/offline/restart exercise or 360px, 390px, and 430px device/browser screenshot run was performed in this turn.

## Remaining blockers and limitations

1. **Measurement replay is intentionally disabled by default.** The current workspace's Phase 2 activation report holds the schema activation. Before testing room/surface writes against the intended database, verify its compatibility with the current API code and apply/verify migrations 0121 and 0122 through the separate approved activation process. Then set `EXPO_PUBLIC_OFFLINE_MEASUREMENTS_ENABLED=true` in the mobile build environment and rebuild. The local `.env` currently does not enable it. Attendance queueing does not depend on these columns.
2. **Version conflict protection is client-side preflight only.** The client compares the cached base version with the current server version before replay, but the existing room/surface write APIs do not accept an atomic expected-version condition. A concurrent server edit between preflight and write remains a race; safe full conflict guarantees require an API-level version check.
3. **Measurement deduction/opening entry is not available in the Expo input form.** Existing server deduction formulas and saved values are left intact; this increment did not introduce a new deduction editor or change those formulas.
4. **Conflict recovery is review and re-entry.** Conflicted rows stay on-device until a user opens the referenced workspace and explicitly discards the rejected operation. There is no in-place edit/merge UI for a rejected offline payload.
5. **The development checks do not replace Android device testing.** The exports validate bundling but do not install an APK or exercise the Truecaller/PWA, hardware network transitions, SQLite restart behavior, or small-screen rendering on a device. Web runtime persistence and hosting headers were not tested in a browser.
6. **Several broader Painter/Contractor workflows remain limited to the existing endpoint coverage.** For example, offline attendance is for existing in-house membership routes; freelance painters do not receive an invented attendance or employment workflow. Contractor attendance correction remains subject to the existing backend actions and permissions.
7. **Local SQLite uses the Android app's private storage sandbox, not SQLCipher encryption.** The cache is account-scoped and limited to measurement context, dimensions, and attendance payloads; avoid adding financial or identity-document data to it without an approved encrypted-storage design.

## Changed files

- `mobile/src/core/offlineQueue.ts`
- `mobile/src/core/offlineQueuePolicy.ts`
- `mobile/src/core/offlineSync.ts`
- `mobile/src/core/phase4Capabilities.ts`
- `mobile/src/components/OfflineQueuePanel.tsx`
- `mobile/src/screens/MeasurementsScreen.tsx`
- `mobile/src/screens/EmployeeAttendanceScreen.tsx`
- `mobile/src/screens/PainterWorkspaceScreen.tsx`
- `mobile/tests/offlineQueuePolicy.test.ts`
- `mobile/tests/offlineSync.test.ts`
- `mobile/metro.config.js`
- `mobile/.env.example`
- `docs/plans/2026-10-17-phase4-mobile-offline.md`

No Phase 2 migration, backend business logic, quotation formula, salary formula, or Phase 3 web file was changed.
