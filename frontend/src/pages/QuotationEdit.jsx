import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/client';
import QuotationBuilder from './QuotationBuilder';
import BackButton from '../components/BackButton';
import { ErrorState, LoadingState, PageHeader } from '../components/ui';
export default function QuotationEdit(){
 const {id}=useParams();const [quotation,setQuotation]=useState(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;setQuotation(null);setError('');api.get(`/quotations/${id}/`).then(({data})=>{if(active)setQuotation(data);}).catch(()=>{if(active)setError('Quotation could not be loaded.');});return()=>{active=false;};},[id]);
 if(error)return <ErrorState message={error}/>;
 if(!quotation)return <LoadingState/>;
 if(quotation.status!=='DRAFT' || !quotation.can_edit)return <div className="space-y-4"><BackButton fallback={`/quotations/${id}`}/><PageHeader eyebrow="Read-only quotation" title={quotation.status==='DRAFT' ? 'Draft editing is unavailable' : 'This version is preserved'} description="Only authorized Draft quotations can be edited. Open an approved Draft revision to make changes."/></div>;
 return <QuotationBuilder key={id} initialQuotation={quotation}/>;
}
