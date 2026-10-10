// One-time in-memory handoff to the existing detail/share UI. Never persist credentials.
let pending = null;
export function rememberQuotationSubmission(id, data, now = Date.now()) {
  pending = {id:String(id),data,expires:now+60000};
}
export function consumeQuotationSubmission(id, now = Date.now()) {
  const submission = pending;
  pending = null;
  return submission?.id === String(id) && now <= submission.expires ? submission.data : null;
}
