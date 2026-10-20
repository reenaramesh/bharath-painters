export function measurementEditState(property, record) {
  const status = record?.status || (record?.submitted_at ? 'SUBMITTED' : 'DRAFT');
  const locked = status === 'LOCKED';
  const schemaUnavailable = property?.measurement_editing_available === false;
  const readOnly = locked || schemaUnavailable;
  return {
    status,
    locked,
    readOnly,
    // Submission acknowledges the record without changing locked content;
    // the API explicitly allows this for a locked, unsubmitted calculation.
    canSubmit: !schemaUnavailable && !record?.submitted_at,
    submitLabel: record?.submitted_at ? 'Submitted' : 'Submit',
    tone: locked || record?.submitted_at || status === 'COMPLETED' ? 'success' : 'neutral',
    reason: locked
      ? 'This Area Calculation is used in a quotation and cannot be changed.'
      : schemaUnavailable
        ? 'Measurement editing is temporarily unavailable. Saved calculations can still be viewed.'
        : '',
  };
}
