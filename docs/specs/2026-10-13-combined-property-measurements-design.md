# Combined property measurements

Approved flow: one saved measurement contains interior and exterior surfaces. Each surface retains its work area, dimensions and deductions. The property lists a combined total and separate interior/exterior totals. Adding areas continues the current editable measurement; a separate revision remains an explicit action.

Existing records can be combined by selecting two or more editable records belonging to the same property and contractor. Keep the oldest selected reference, move rooms and surfaces without changing their IDs, retain source notes and references in its notes, and remove the now-empty source records atomically. Reject submitted records and any record referenced by quotations. No automatic mutation of existing customer data.

Quotation painting items continue to choose Interior or Exterior independently, allowing both in the same quotation. The measurement shortcut opens the selected measurement rather than starting another. Remove the property-wide exterior-only guard for the grouped builder.

Use existing page controls and responsive styling. Loading and API failure states retain selections for retry; combine is disabled until at least two eligible records are selected and while saving. Verify dimensions, deductions, scoped access, locked records, one-record persistence, quotation selection, mobile layout and frontend build.
