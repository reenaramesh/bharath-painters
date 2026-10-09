# Report analytics

Admin Reports now show a user distribution ring, account verification, customer status, employee availability, monthly invoices, quotation stages, project progress and payment totals. The existing contractor Reports page receives financial and project charts using its existing scoped report response. Contractor sessions never request the admin directory.

Monthly invoice bars are keyboard selectable and display exact billed, paid and balance amounts. The period selector chooses the latest 6 or 12 recorded months. Detailed financial tables remain available in an expandable section, and the upcoming project table and CSV export remain available.

Sources: existing `/jobs/reports/` and, for admins only, `/quotations/admin-dashboard/`. No database, backend calculation or reporting permission changes. Customer chart counts represent directory records, not a deduplicated count of portal accounts.

Verification: two focused aggregation tests, production frontend build, targeted lint and whitespace checks. Native Python Playwright checked admin/contractor × empty/populated × 360/390/768/1440px (16 views), month selection via keyboard, role separation and document overflow. Screenshots were visually reviewed at desktop and mobile sizes. Fixtures are synthetic and authenticated application writes were blocked after sign-in. No passwords, tokens, cookies or authentication state are saved in artifacts.

This is a focused reports UI check, not a complete accessibility or financial reconciliation audit.

The user and quotation breakdowns use doughnut charts with keyboard-selectable legends, exact counts and percentages. Verification, customer and workforce distributions use thicker horizontal bars; monthly invoices retain paired vertical bars. The browser check also selects a pie legend category and verifies the selected state and detail text.

Latest requested presentation: restore the earlier doughnut style with a total in the center. Contractor Reports use matching doughnut charts for quotation stages and active/completed projects, based solely on the contractor's existing scoped report response. Admin user and quotation charts retain that same style; all bar charts remain available.

Chart fills now use a lighter palette: blue, mint, peach, lavender, rose and teal. The invoiced summary card uses a pale blue background rather than a dark fill. Text and keyboard focus retain dark contrasting colors.

Monthly invoice performance is a right-side panel beside quotation and project charts at tablet/desktop widths, and stacks below them on phones. Browser geometry checks verify this placement in both roles and both data states.

Monthly invoices use horizontal paired bars: month labels on the left, billed/received lengths scaled against the maximum recorded amount on the right. Month selection, exact totals, period controls and the light palette remain available.
