# Isolated quotation grouping test module

This module prototypes the attached grouped-paint workflow with synthetic data. It does not import the live quotation builder, register application routes, call APIs, persist data, run migrations, or invoke the PDF generator. Closing/reloading the page resets the sample state.

Only these new files were added for this request:

- `frontend/quotation-grouping-test.html`
- `frontend/src/preview/quotationGrouping/`

Existing application files and previously made quotation changes are untouched.

## Open the preview

The isolated development server uses:

**http://127.0.0.1:5175/quotation-grouping-test.html**

From `frontend`, start it if necessary:

```powershell
node node_modules/vite/bin/vite.js --config src/preview/quotationGrouping/vite.config.mjs --configLoader runner
```

The new HTML entry can also be opened at `/quotation-grouping-test.html` on the existing frontend development server. No application route changes are needed.

Click **Load example** to load the attached scenario, or create groups from scratch. **Reset test** clears only in-memory sample assignments and rates.

## Scope and implementation audit

The read-only audit covered:

| Existing implementation | Finding used by this prototype |
| --- | --- |
| `backend/quotations/models.py`: `PropertyMeasurement` | Measurements have a record ID, version and related surfaces. |
| `backend/quotations/models.py`: `MeasurementSurface` | Existing net area accounts for deductions and additions. The prototype consumes `net_area` and does not change/reimplement this formula. |
| `backend/quotations/serializers.py`: `MeasurementSurfaceSerializer` | API surfaces carry room, type, measurement record and read-only net area. |
| `backend/quotations/models.py`: `Quotation`, `QuotationItem` | Existing item fields support product, brand, coats, quantity, rate and `included_areas`. |
| `frontend/src/pages/QuotationBuilder.jsx` | Step 2 specifies products/coats and Step 3 prices selected items. The prototype is separate from both. |
| `backend/quotations/professional_pdf.py` | Existing PDF output reads item `included_areas`; the prototype exports quotation-shaped sample items using that field. |
| `frontend/src/components/SpecialWallSheet.jsx` and its stylesheet | Existing desktop modal/mobile bottom-sheet pattern is reused through the stylesheet. |

The prototype shows four test stages from the attachment: read-only measurements, grouped product/coats assignment, pricing, and a final **test preview**. It does not add those stages to the production application.

The fixture master lists are synthetic test inputs shaped like existing masters, not new database tables. Putty coats are omitted because the audited item specification has no separate putty-coat field. The prototype uses existing general paint coats.

## What can be tested

- Walls, ceiling and other surfaces present in the fixture (Door).
- Multi-room groups with automatic measured quantities.
- Work type, brand, product, finish, primer, paint coats and optional notes.
- Duplicate full-surface assignments blocked with an assigned-product label.
- Edit/delete groups and restore their room availability.
- A separate special-wall flow that selects existing individual measured walls.
- Special wall edits/deletes automatically recalculate normal group quantities.
- Original room/surface data and measurement version remain unchanged.
- Rate inputs appear only in Pricing.
- Quotation-shaped item output includes room contribution labels.
- Structured room/surface/version references are visible in `test_trace`.

`test_trace` is **sandbox metadata**, not a new backend API field. Do not submit the downloaded sample JSON to a live quotation endpoint. Fixture IDs do not refer to real records. Future production integration would need a separately approved, validated persistence adapter for structured group references; this module does not claim that it already persists them.

The final test stage shows line amounts and a sample subtotal only. It does not simulate or change GST, discounts, additional charges, customer information, numbering, terms, authentication, payments, schedules or PDF generation. Lump Sum is outside this sandbox and remains unchanged.

## Verification

Run the calculation and interaction tests from `frontend`:

```powershell
node --test --test-isolation=none src/preview/quotationGrouping/model.test.js src/preview/quotationGrouping/ui.test.mjs
npm.cmd run lint -- src/preview/quotationGrouping
```

Build only this module into its own output directory:

```powershell
node node_modules/vite/bin/vite.js build --config src/preview/quotationGrouping/vite.config.mjs --configLoader runner
```

Output: `frontend/dist/quotation-grouping-test/`. This build does not replace the application's `dist/index.html` or production assets.

Verified: **17 tests passed**, targeted lint passed, isolated build passed. The React interaction test checks group creation, disabled duplicate selection, special-wall editing/deletion, rate validation, final payload references and zero API calls. It uses the already installed React test renderer and does not test physical browser layout.

Desktop/mobile visual verification remains pending because no browser was connected during this task.

## Manual acceptance checklist

1. Open the preview at desktop width, then at approximately 390 x 844 mobile size.
2. On Measurements, confirm Bedroom 1 is 470 sqft and Ceiling is 130 sqft. Expand original records to inspect Wall 1-4.
3. In Step 2, create a Walls group for Bedrooms 1-3. Confirm 3 rooms and 1,300 sqft without a manual area input.
4. Continue to specification fields. Confirm no rate, amount, GST or discount fields. Save the group.
5. Create another Walls group. Confirm Bedrooms 1-3 are disabled and show the assigned product. Ceiling assignment for those same rooms must still be available.
6. Add Special Wall, select Bedroom 1 and Wall 4 (125 sqft), assign Texture Painting / Royale Play and save. Confirm Bedrooms Walls becomes 1,175 sqft and Bedroom 1's contribution is 345 sqft.
7. Edit the special assignment to Wall 3 (110 sqft). Confirm normal total is 1,190 sqft. Delete the special assignment; normal total must return to 1,300 sqft.
8. Confirm the mobile popup slides from the bottom, fits approximately 92% of the viewport, has a fixed header/footer, scrolls vertically, respects safe areas, and has no horizontal page scrolling. Confirm Cancel, Escape and Save close it appropriately.
9. Load the example, go to Pricing, and confirm quantities `[1175, 970, 300, 125]` and rates `[10, 18, 20, 45]`.
10. Confirm amounts `[11750, 17460, 6000, 5625]` and sample subtotal **40,835**. Blank or negative rates must block the final stage; zero is permitted.
11. Open the final test preview and inspect/download the sample JSON. Confirm room, surface, record and version references are retained.
12. Return to Measurements. Original areas and wall records must be unchanged. Reload the test page; sample assignments reset and the live application is unaffected.
