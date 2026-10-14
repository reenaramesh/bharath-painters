// One-time in-memory handoff to the existing detail/share UI. Never persist credentials.
let pending = null;
export function quotationSubmissionError(error) {
  const fallback = 'Sending could not be confirmed. Refresh the quotation to check its status before retrying.';
  const data = error.response?.data;
  if (error.response?.status >= 500 || typeof data !== 'object' || data === null) return fallback;
  const messages = (value) => typeof value === 'string'
    ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(messages) : [];
  const details = messages(data).filter(value => !/<[^>]+>/.test(value)).join(' ').trim();
  return details || fallback;
}
export function rememberQuotationSubmission(id, data, now = Date.now()) {
  pending = {id:String(id),data,expires:now+60000};
}
export function consumeQuotationSubmission(id, now = Date.now()) {
  const submission = pending;
  pending = null;
  return submission?.id === String(id) && now <= submission.expires ? submission.data : null;
}
