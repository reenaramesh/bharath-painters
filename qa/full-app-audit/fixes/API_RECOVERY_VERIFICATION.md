# API recovery and follow-up verification

8 October 2026. All work used the D: project. Server process working directories were verified as `D:\projects\Bharath Painters Application\frontend` and `D:\projects\Bharath Painters Application\backend`; the old OneDrive application copy was not inspected or modified.

## Changes

- Read-only GET/HEAD requests automatically retry temporary502/503/504 and recognized connection errors up to twice, after 300ms and 600ms. An ongoing outage still surfaces the normal error/retry UI.
- POST/PATCH/PUT/DELETE requests are never replayed by this recovery layer. Permission/not-found/internal-server errors401/403/404/500 are not retried by it. Existing authentication refresh behavior is retained.
- Canceling a queued retry prevents the next request.
- Sidebar booking-count polling now uses the same visible navigation eligibility as the menu. In-house Painter sessions no longer request the contractor/freelance-only booking endpoint.

## Verification

- **10/10 native browser checks passed**: transient502 recovery for Contractor and Customer at 1440, 360, 390 and 430; persistent502 stops after three total GET attempts; in-house Painter makes no forbidden booking requests during initial load or the 15-second polling interval.
- **78/78 original UI regression checks passed**, zero blocked/failing checks and zero uncaught browser page errors.
- **11 unit checks passed** for API recovery, cancellation, mutation safety, navigation, menu visibility and body scroll.
- Production build passed. Lint has no errors; existing warnings remain.
- The measured quotation using existing QA records reached final review at 1440, 360, 390 and 430 after correctly selecting category, brand, product and coats. No quotation save/send was submitted.
- Real local API diagnostics: 270 authenticated GET probes, 268 HTTP200 responses, 0 HTTP5xx responses and 2 connection refusals. All connection refusals occurred in the direct Django requests at concurrency 16; all frontend-proxy probes returned200. This is consistent with a local development-server connection/burst limit; it does not prove the historical502 root cause or a production outage is fixed.

## Evidence

- [Browser recovery results](after-recovery-results.json)
- [Original UI regression results](after-results.json)
- [API probe details](api-stability-results.json)
- [Quotation draft results](quotation-draft-results.json)
- [Contractor390px recovery](recovery-contractor-390.png)
- [Customer390px recovery](recovery-customer-390.png)
- [Quotation final review390px](quotation-draft-review-390.png)

## Limits

- Persistent upstream outages require server-side investigation; frontend retries cannot repair a stopped or failing backend. No current HTTP502 was reproduced during the real local probes.
- Support-specific authentication and valid invitation/subcontract fixtures still require existing authorized access/data. They are test coverage gaps, not verified defects that can truthfully be marked fixed.
- Shared browser discovery found no connected browser; no existing Support session could be obtained there. No credentials were invented or reset.
- Live deployment has not been performed. The live frontend URL was requested for comparison; none was supplied during this pass.
- Backend/database files were not edited; existing changes remain preserved. No production/account/payment mutations or authentication-state export occurred.
- The early browser recovery harness also intercepted the Customer options request; those count-assertion failures were corrected by targeting only the list request and do not represent product bugs. The separate in-house polling failure was reproduced before the fix.
