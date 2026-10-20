# Release readiness workflow audit

Audit the current existing frontend/Django implementation, preserving all prior uncommitted work. Complete the in-progress revenue/service-card verification, then cover contractor, customer, painter/employee, admin and support workflows.

1. Map cross-module handoffs, failure/retry paths, ownership/permissions and existing automated coverage across sales/finance, workforce/subcontracts, identity/communications and release infrastructure.
2. Recheck the earlier A–E missing-workflow report against current code and actual tests; distinguish implemented features, confirmed defects, genuinely missing flows and desirable enhancements.
3. Run backend suites only against the owned disposable PostgreSQL database, plus frontend tests/contracts/build and appropriate browser/API journeys. Never mutate user or production data or print secrets.
4. Reproduce confirmed issues before fixing. Coordinate narrow patches with regression coverage, preserve contracts/UI patterns, and verify affected workflows.
5. Produce a module/role workflow matrix, severity-ranked evidence, fixes and test results, remaining blockers and a publish recommendation. Clearly separate verified results from untested external integrations/environment requirements. No unsupported promise of a bug-free release, deployment, commit or approval pauses.
