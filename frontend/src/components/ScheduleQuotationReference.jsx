import {useEffect, useRef, useState} from 'react';
import {FileText} from 'lucide-react';
import api from '../api/client';
import { previewPdf } from './PdfPreview';

export default function ScheduleQuotationReference({quotationId,quotationNumber,role}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const generation=useRef(0),lock=useRef(false);
  useEffect(()=>{
    const invalidate=()=>{generation.current++;};
    invalidate();lock.current=false;setBusy(false);setError('');
    return invalidate;
  },[quotationId,role]);
  async function open(){
    if(lock.current)return;
    const current=generation.current;
    lock.current=true;setBusy(true);setError('');
    try {
      const path=role==='CUSTOMER'?`/quotations/customer-portal/quotations/${quotationId}/pdf/`:`/quotations/${quotationId}/pdf/`;
      const {data}=await api.get(path,{responseType:'blob'});
      if(current===generation.current)previewPdf(data,`${quotationNumber || 'quotation'}.pdf`,{modal:true});
    } catch {if(current===generation.current)setError('Quotation could not be opened. Please try again.');}
    finally {if(current===generation.current){lock.current=false;setBusy(false);}}
  }
  return <div className="schedule-quotation-reference">
    <button type="button" className="schedule-quotation-link bp-ui-action" aria-haspopup="dialog" aria-busy={busy || undefined} aria-disabled={busy || undefined} onClick={open}><FileText size={16} aria-hidden="true" />{busy?'Opening quotation...':'View quotation'}</button>
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
  </div>;
}
