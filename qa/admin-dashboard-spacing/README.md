# Admin dashboard alignment

Scope: the operations dashboard layout. Overview cards now appear immediately below the heading. Header actions, summary cards, search controls and pagination use compact spacing. Menu settings and support conversations share a desktop row. Mobile quick access uses a four-column grid instead of a horizontally scrolling strip; overview labels remain on one line with icons below the values.

Verification uses the existing QA admin login and synthetic empty/populated dashboard responses. All application writes after authentication are blocked. No passwords, tokens, cookies or authentication state are stored in these artifacts.

Screenshots and geometry checks cover 360, 390, 430, 768 and 1440px widths. Checks also switch to the Customers overview tab and confirm the customer search field appears. The native Python Playwright script is `tmp/full-app-audit/admin-dashboard-spacing.py`.

The page and quick access grid fit the viewport width. Long records retain ordinary vertical scrolling; wide directory tables retain contained scrolling and the existing mobile record details behavior. This is a focused dashboard check, not a full admin workflow audit.

Overview cards are links to `/dashboard?section=contractors`, `applicators`, `customers`, `messages` or `quotations`. Each opens a focused view with its own heading and the existing record controls immediately below, with a Back to dashboard link. The read-only browser check exercises all five links and the return link at every tested width in both fixture states.

The Back to dashboard link sits above the section heading with a left-arrow icon and a 44px minimum touch target.

Conversations now group by contractor, then by customer/participant conversation ID. Selecting a participant shows chronological sender-labelled message bubbles. Search matches contractor, participant, sender or message content while retaining the complete loaded thread. The overview count represents contractors with conversations. The dashboard API adds contractor_id to message rows so contractors with identical display names remain separate; existing fields and authorization stay unchanged. Focused unit tests cover grouping, chronology, same-name identities and search. Browser fixtures verify one contractor with two customer threads and thread switching without data writes.
