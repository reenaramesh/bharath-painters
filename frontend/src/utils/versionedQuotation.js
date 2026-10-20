import { persistQuotation } from './unifiedQuotation.js';
import { rememberQuotationSubmission } from './quotationSubmission.js';

// Retain one request identity across an uncertain response; never mutate history.
export async function persistVersionedQuotation(api, savedRef, createPayload, editPayload, send=false) {
  if (!savedRef.current) return persistQuotation(api,savedRef,createPayload,editPayload,send);
  const sourceId=savedRef.current.id;
  const signature=JSON.stringify([sourceId,editPayload]);
  if (savedRef.versionRequest?.signature !== signature) {
    savedRef.versionRequest={signature,token:crypto.randomUUID()};
  }
  let saved;
  try {
    const response=await api.post(`/quotations/${sourceId}/versions/`,{...editPayload,edit_request_id:savedRef.versionRequest.token});
    saved=response.data;
    savedRef.current=saved;
    savedRef.versionRequest=null;
    if (send) {
      const {data}=await api.post(`/quotations/${saved.id}/submit/`,{});
      rememberQuotationSubmission(saved.id,data);
    }
    return saved;
  } catch(error) {
    if (saved) error.savedDraft=saved;
    throw error;
  }
}
