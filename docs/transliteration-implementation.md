The application now has a runnable phonetic-script implementation for English, Telugu, Kannada, Hindi and Tamil. This is not a claim of full completion or production readiness: fluent-speaker review, live mobile/browser checks and the remaining mixed-origin text audit are outstanding. No deployment or production-data changes were performed.

English wording and word order remain the source. Labels use English pronunciation in the selected script, with the eight requested Telugu examples explicitly pinned. Semantic translations were removed from the active common, authentication, navigation, status and PDF resources. The static glossary has 2,537 entries per native script, including 378 explicit spelling overrides. Dictionary-derived entries are phonetic drafts requiring fluent-speaker review; they are not independently certified spellings. Ambiguous or unknown pronunciations remain English and are listed in `shared/transliteration/review.json`.

The glossary uses offline English pronunciations from [CMUdict](https://github.com/cmusphinx/cmudict), with its license retained in `shared/transliteration/LICENSE-CMUDICT.txt`. Runtime code does not call a transliteration service or upload page/customer content. Resource preparation reads repository sources, not customer records.

The interface work covers these route families:

- Contractor, customer, employee/applicator, administrator and support dashboards; menus, navigation, account security and settings.
- Sign-in, registration, recovery and other authentication pages.
- Customers, properties, measurements, quotations, invoices, receipts, payments, schedules, jobs and teams.
- Contractor network, connection requests, invitations, internal messages, notifications, services and catalogues.
- Support, administration, reporting and billing screens.
- Public verification, contractor digital card and employee/applicator profile templates.

`shared/transliteration/coverage.json` inventories 89 frontend route patterns and 144 JSX source files. More than 5,000 display locations are marked. These counts include source retained for inactive pages; they are provenance/inventory counts, not proof that every runtime string or workflow has been manually reviewed. Development previews are excluded. Opportunities remains removed from live navigation and routing.

Build-time marking identifies source-owned display literals, labels, placeholders, tooltips, conditional copy and template fragments. Dynamic inserted values, form values, route strings, API keys, CSS classes and stored enums are preserved. Shared UI headings no longer blindly process arbitrary customer/business titles. Error and notice state stays as original primitive strings; a bounded, account-cleared in-memory provenance map localizes the surrounding system text when displayed. Switching scripts does not remount the form or rewrite its entries. Standard service/role labels use an explicit allowlist. Unknown custom catalogue entries remain unchanged. System-generated invitation text uses protected interpolation for company, owner, skills, contact details and URLs.

The existing `preferred_language` account field is reused. The dashboard and account selectors save that preference through the existing account endpoint, restore it after account changes and keep local keys scoped to the user ID. Visitor preferences are separate. The explanatory text is “English words displayed in your selected script.” No database field was renamed and this change requires no new schema migration.

Native PDF variants share the glossary and use the existing PyMuPDF Story/HarfBuzz renderer with embedded Noto fonts. The document inventory is:

| Document | Native script support |
|---|---|
| Quotation, including section filtering | te / kn / hi / ta |
| Invoice, including restricted payment visibility | te / kn / hi / ta |
| Area calculation / measurement | te / kn / hi / ta |
| Invoice payment receipt | te / kn / hi / ta |
| Advance payment receipt | te / kn / hi / ta |
| Project payment receipt | te / kn / hi / ta |
| Package invoice / receipt | te / kn / hi / ta |
| Contractor profile PDF | te / kn / hi / ta |

English continues to use the original English PDF builders. Native document headings, table labels, payment-mode labels, page/footer copy and generated currency words use the shared resources. Currency words include paise and preserve signs; stored totals and calculations are not changed. Customer/business data, IDs, references, item descriptions, addresses, custom notes and saved/custom terms are passed through unchanged. Native profile PDFs retain the stored logo, portrait, QR image, project details/photos, social links and reviews, in a flowing information layout rather than the English illustrated card layout.

The existing PDF preview selector is labelled “PDF Language / Script”. Requests default to the dashboard selection, but changing an individual preview does not change the account preference. Preview, print, share and download use the same selected blob. Variant request metadata includes `document_language`; preview/download filenames distinguish scripts. Previews close and pending results are invalidated when accounts change. There is no shared server PDF cache in this implementation. Any future server cache must include document ID/revision, script, access scope and section/payment-visibility options. Package documents and absolute public profile PDF URLs now participate in this request tracking. The public contractor card also has a separate PDF script selection.

Verification completed:

- React renderer and transform tests passed for protected data, enum values, interpolation, immediate switching, unsaved entries, original error-state strings and separate account preferences.
- 34 Django tests passed, covering shared spellings, Unicode script ranges, English fallback, account preference persistence/validation, public templates, PDF font embedding/searchable text, profile media/data retention, long tables, concurrency, restricted payment visibility, connection inbox permissions and existing business settings.
- 32 isolated PDF variants were generated across eight document types and four scripts. All pages were rasterized, font embedding and protected data checked, and page-width bounds checked. Representative first/last pages were visually inspected; long quotation, invoice and measurement tables span multiple A4 pages. Fixtures live under ignored `tmp/transliteration/pdfs/`.
- The production frontend build passed. Targeted lint has no errors; existing Fast Refresh export-pattern warnings and the existing dashboard hook warning remain.

Remaining review items are material:

- A fluent reader for each script must review the explicit overrides and dictionary-derived drafts. Start with `overrides.tsv`, then `review.json` and the rendered document samples. Automated checks establish script ranges and consistency, not natural pronunciation.
- A live browser connection is unavailable. Actual mobile widths, every role’s workflow, PDF preview/printing and long native labels have not been visually tested in the running app.
- Mixed-origin strings returned by helpers or the API are kept in English unless their source is proven or matches registered system copy. This includes some notification text containing actor/customer data and generated/stored descriptions without provenance. They need a manual audit rather than blanket transliteration that could alter user data. Source-file marking does not constitute 100% visible-text coverage.
- Public template layout and the new separate PDF controls need live desktop/mobile visual review. Native profile PDFs retain their data and media but use a different flowing layout; that design also needs user review.

Deployment requirements, when a deployment is separately authorized: install the updated frontend lockfile with `npm ci`; build with the Vite system-copy plugin; include `tools/transliteration/` during frontend builds and `shared/transliteration/` at the repository root for backend runtime access; serve the bundled frontend fonts; run Django `collectstatic` for the public-template fonts; retain the pinned PyMuPDF dependency and backend Noto font/license files; restart the development/backend processes after resource or dependency changes. Review and retain the CMUdict and Noto license notices. Generated `.test-build`, `tmp/` fixtures and the downloaded preparation dictionary are not production assets. No release should be described as fully verified until the remaining review items are resolved.
