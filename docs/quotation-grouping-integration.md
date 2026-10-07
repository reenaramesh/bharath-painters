# Original quotation workflow integration

The approved sandbox workflow is now connected to the original new-quotation builder for measured interior quotations.

## Behavior

- Keep the original customer/property/measurement selection screen and its actions.
- Services & Product shows measured rooms in horizontal rows, original-record eye popups, grouped assignments, Select all, and edit/delete actions.
- Room-level Assign Products and Add Special Wall remain available. Special walls select saved measured walls and reduce only normal group contributions.
- Products, brands, services, descriptions and units come from existing API master records. Production imports no sample fixtures.
- Group and general-service editors include rate and amount. Finish and optional notes stay out of those popups, as requested.
- Final quotation uses horizontal rows with description, quantity, rate, amount, eye/pencil actions, and responsive detail popups.
- Existing Add door area, Add window area, Add services, Save draft, Preview quotation and all PDF preview actions remain available. The PDF dialog/action block and main builder footer were verified identical to their pre-integration snapshots.
- Existing GST, discount, totals, PDF generation, exterior and Lump Sum code paths are retained. Grouped items feed the existing calculations instead of adding a second set of charges.
- The sandbox remains at `/quotation-grouping-test.html`. Its calculation module now re-exports the shared production calculations.

## Persistence

`QuotationItem.specification_details` is an optional JSON field added by additive migration `0114_quotationitem_specification_details`. It retains group identifiers, room/surface contributions, primer coats and the measurement record/version. Existing `included_areas` remains a list of display strings for the existing PDF code.

The field was needed because the existing item had no structured specification-reference field and `included_areas` explicitly validates strings. No measurement records/formulas or existing columns are modified. Existing quotations receive the empty default. Ordinary quotation edits retain this metadata; the existing revision-copy code copies concrete fields automatically.

Server validation checks source ownership through the selected measurement record, version, duplicate assignments, original source areas and calculated quantities. Submitted group totals must match saved measurements after special-wall allocation.

Only migration 0114 was pending in the local plan, and it has been applied to the local SQLite database. No external database or deployment was changed.

## Verification

- 20 frontend calculation and interaction tests passed, including real master IDs, source references, room actions, rates and eye/edit popups.
- 9 backend tests passed, including existing endpoint creation, PDF preview without persistence, PDF text extraction, metadata round trips, totals and duplicate/tampered source rejection.
- Targeted lint, production build and migration consistency checks passed.
- Existing PDF preview and builder footer regions match the captured baseline exactly.
- Two older `QuotationApiTests` fail because their fixtures have no connected customer. They also fail with the captured pre-integration serializer. Authentication/connection rules were not changed to bypass them.
- Browser visual verification is pending; the browser runtime reported no connected browsers. No visual certification is claimed.

Run the targeted frontend checks from `frontend`:

```powershell
node --test --test-isolation=none src/preview/quotationGrouping/model.test.js src/preview/quotationGrouping/ui.test.mjs src/utils/groupedQuotation.integration.test.mjs
npm.cmd run lint -- src/pages/QuotationBuilder.jsx src/pages/QuotationEdit.jsx src/components/GroupedQuotationWorkspace.jsx src/utils/groupedQuotation.js src/utils/groupedQuotation.integration.test.mjs
npm.cmd run build -- --configLoader runner
```

Run the backend checks from `backend`:

```powershell
& venv/Scripts/python.exe manage.py test quotations.test_grouped_specifications --noinput
& venv/Scripts/python.exe manage.py makemigrations --check --dry-run
```

Manual review: open the original `/quotations/new` page, select a connected customer/property/measurement, create/edit a group, add a special wall and general service, then review Final quotation and the existing PDF preview buttons. Repeat at desktop and mobile widths. Confirm a saved group retains its room/source references and original measurements are unchanged.
