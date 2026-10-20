# Frontend contracts

`contracts.ts` is the first shared domain layer for staged frontend typing. Its decimal fields represent Django `DecimalField` values and stay strings at API boundaries. The contracts were checked against the current Django models/serializers and the existing Expo role, attendance, assignment, quotation-status, and offline-state unions. The Expo app keeps its own TypeScript source; it does not import browser contracts.

`apiValidation.ts` contains runtime guards for selected measurement, quotation, attendance, assignment, invoice-payment, project-scope, pagination, and error payloads. Use these guards at API call sites when migrating a module; interfaces alone do not validate JSON. Error normalization is additive and does not replace the Axios client's token-refresh behavior.

`calculationSafety.ts` validates decimal-string inputs and compares values exactly with `BigInt`. It validates deductions against a server-provided gross area and intentionally does not calculate measurement totals. `financialDisplay.ts` formats backend decimal strings as INR whole-rupee display values without a floating-point conversion. Existing numeric quotation preview helpers retain their established formulas and remain estimates; Django remains authoritative for persisted totals.

`tsconfig.contracts.json` is intentionally scoped to the shared types and four JSDoc-annotated utilities. JSX pages and the rest of the legacy JavaScript tree are not yet strict-checked. Runtime guards are available for use at selected API boundaries; broad adoption across every screen remains incremental follow-up work. There is no shared cross-platform package yet, so web and Expo unions still need to be compared when either side changes.

No backend schema, API response format, salary formula, migration state, or offline replay gate was changed by Phase 5.
