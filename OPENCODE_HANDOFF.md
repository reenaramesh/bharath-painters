\# Bharath Painters UI Handoff



Workspace:

D:\\Projects\\Bharath Painters Application



IMPORTANT:

Do not use or inspect the old OneDrive/C: copy.



Correct workspace:

D:\\Projects\\Bharath Painters Application





\# COMPLETED WORK



\## Products \& Promotions

Fully removed.



Do not reintroduce this feature.



Existing PaintType, ServiceCategory, Unit, quotation pricing, default\_price,

and relevant is\_active behavior remain preserved.





\# PHASE A — DESIGN FOUNDATION

Completed.



Main files:

\- frontend/src/index.css

\- frontend/src/components/ui.jsx



Foundation includes:

\- design tokens

\- typography scale

\- spacing scale

\- semantic colors

\- provider branding variables

\- Button

\- FormField

\- CompactCard

\- AppPageHeader / PageHeader

\- SectionCard

\- StatCard

\- StatusBadge

\- LoadingState

\- EmptyState

\- ErrorState

\- focus-visible styling

\- 44px control targets

\- reduced-motion support





\# PHASE B — APPLICATION SHELL

Completed.



Changed areas:

\- DashboardLayout

\- Sidebar

\- Topbar

\- MobileBottomNav

\- sidebar styling

\- shared shell styling



Preserved:

\- role navigation

\- employment-aware navigation

\- routes

\- permissions

\- provider / white-label branding



Previously verified:

\- desktop shell

\- mobile 360 / 390 / 430

\- no horizontal overflow

\- focus behavior

\- role navigation

\- dynamic workspace branding





\# PHASE C — CONTRACTOR PORTAL

Completed.



\## C1 Contractor Dashboard

Completed.



\## C2 Customers / Leads / Opportunities

Completed.



\## C3 Quotations / Measurements

Completed.



Preserved:

\- quotation calculations

\- measurement calculations

\- deductions/additions

\- discounts

\- GST

\- totals

\- API payloads

\- status transitions



\## C4 Jobs / Work Schedules

Completed.



\## C5 Revenue / Invoices / Payments

Completed.



\## C6 Messages / Service Requests

Completed.



Preserved:

\- shared Customer / Contractor / Painter messaging behavior

\- unread/read behavior

\- polling

\- attachments

\- color sharing

\- service request workflow



\## C7 Master Services / Contractor Profile / Business Settings

Completed.



Contractor UI redesign is considered complete for this rollout.





\# PHASE D — CUSTOMER PORTAL



\## D1 Customer Dashboard

Completed.



\## D2 Customer Connections / Contractor Requests

Completed.



Preserve:

\- connection requests

\- accept/reject

\- pending states

\- multi-contractor relationships

\- consent behavior

\- contractor search

\- profile dialog behavior





\# CURRENT TASK



Continue the COMPLETE remaining Customer Portal redesign.



Do not return to contractor pages unless a shared customer-facing component

requires a safe UI-only adjustment.



Remaining Customer areas include:



\- Properties

\- Property details

\- Area Calculation / measurement sharing

\- Quotations

\- Quotation review / acceptance

\- Work / project tracking

\- Work schedules

\- Work changes

\- Completed work

\- Work photos

\- Payments

\- Invoices

\- Messages

\- Service Requests

\- Support Tickets

\- Contractor Reviews

\- Customer Profile

\- Account Security

\- Appearance Settings



Customer Dashboard and Customer Connections already have UI work.

Preserve and build on them rather than redesigning from scratch.





\# CUSTOMER PORTAL DESIGN DIRECTION



The remaining customer experience should receive a NOTICEABLE redesign.



Do not limit changes to:

\- tiny spacing adjustments

\- small font changes

\- badge swaps

\- minor CSS cleanup



The Customer Portal should feel like one coherent modern application.



Allowed:

\- reorganize sections

\- improve visual hierarchy

\- redesign cards

\- improve page headers

\- improve CTA placement

\- simplify clutter

\- improve forms

\- improve desktop grids

\- create stronger mobile layouts

\- reuse shared Phase A primitives

\- add reusable customer-facing UI components where justified



Do NOT:

\- change business logic

\- change backend APIs

\- change database models

\- change routes

\- change permissions

\- change calculations

\- change quotation acceptance behavior

\- change payment behavior

\- change schedule behavior

\- change connection logic





\# CUSTOMER UX PRIORITIES



Customer should immediately understand:



1\. What work is happening?

2\. What do I need to do next?

3\. Which quotation requires action?

4\. When is work scheduled?

5\. How much do I need to pay?

6\. Who is my contractor?

7\. Is anything waiting for my response?



Use plain customer-friendly language.



Avoid unnecessary contractor/admin terminology.





\# SHARED UI



Reuse where appropriate:



\- PageHeader

\- SectionCard

\- CompactCard

\- StatCard

\- StatusBadge

\- Button

\- FormField

\- LoadingState

\- EmptyState

\- ErrorState



Preserve dynamic provider branding.





\# RESPONSIVE REQUIREMENTS



Design intentionally for:



\- 360px

\- 390px

\- 430px

\- 768px

\- 1024px+

\- 1280px+



Requirements:

\- 44px minimum touch targets

\- no accidental horizontal overflow

\- safe MobileBottomNav spacing

\- readable mobile forms

\- stacked mobile cards where appropriate

\- controlled horizontal scrolling only when necessary





\# ACCESSIBILITY



Maintain:

\- visible keyboard focus

\- meaningful labels

\- accessible action names

\- clear validation

\- readable font sizes

\- semantic status text

\- do not rely on color alone

\- accessible dialogs





\# TESTING STRATEGY



Prioritize implementation.



Do not run browser automation after every page.



During implementation:

\- targeted lint when useful

\- git diff --check

\- build when practical



Known issue:

The frontend build has previously hit Node/V8 out-of-memory errors.



If needed use:



set NODE\_OPTIONS=--max-old-space-size=8192



or:



set NODE\_OPTIONS=--max-old-space-size=12288



Do not refactor unrelated code merely because the build hits a memory limit.



Full browser and cross-role testing will happen after the major UI rollout.





\# IMPORTANT WORKTREE RULES



The repository contains many existing uncommitted changes.



Always:

\- inspect before editing

\- preserve unrelated changes

\- modify only intended UI hunks

\- never reset the worktree

\- never overwrite files wholesale without checking existing changes





\# NEXT ACTION



1\. Confirm workspace is:

&#x20;  D:\\Projects\\Bharath Painters Application



2\. Read this handoff.



3\. Inspect:

&#x20;  - git status

&#x20;  - current git diff

&#x20;  - customer-facing routes/pages



4\. Identify which remaining Customer Portal modules have already received

&#x20;  partial UI work.



5\. Continue directly with the remaining Customer Portal redesign.



Do not stop at audit-only unless there is a real blocker.



Do not begin Painter or Admin redesign yet.

