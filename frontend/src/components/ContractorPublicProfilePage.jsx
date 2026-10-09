import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send } from 'lucide-react';
import api from '../api/client';
import ContractorProfileAdapter, {ContractorProfileSkeleton} from './ContractorProfileAdapter';
import ContractorConnectionCard from './ContractorConnectionCard';
import { connectionCounterparty, apiErrorMessage } from '../utils/subcontract';
import useAuth from '../context/useAuth';

export default function ContractorPublicProfilePage({ bharathId }) {
  const {user}=useAuth();
  const navigate=useNavigate();
  const [customerConnection,setCustomerConnection]=useState(null);
  const [profile,setProfile]=useState(null);
  const [connection,setConnection]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [notice,setNotice]=useState('');
  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try {
      const {data:directory}=await api.get('/accounts/contractors/');
      const found=(Array.isArray(directory)?directory:directory.results||[]).find(item=>item.bharath_id===bharathId);
      if(!found) throw new Error('This contractor is not currently available in the directory.');
      setProfile(found);
      if (user?.role==='CONTRACTOR') {
        const {data:connections}=await api.get('/quotations/contractor-connections/');
        setConnection((Array.isArray(connections)?connections:[]).find(row=>connectionCounterparty(row).id===found.id) || null);
      } else if (user?.role==='CUSTOMER') {
        const {data:options}=await api.get('/quotations/service-requests/options/');
        setCustomerConnection(options.find(option=>option.contractor_id===bharathId) || null);
      }
    } catch(err) {setError(apiErrorMessage(err,'Contractor profile could not be loaded.'));}
    finally {setLoading(false);}
  },[bharathId,user?.role]);
  useEffect(()=>{load();},[load]);
  async function sendRequest() {
    setBusy(true);setError('');
    try {await api.post('/quotations/contractor-connections/',{recipient:profile.id,message,discover_method:'SEARCH'});setNotice('Request sent. Waiting for this contractor to accept.');await load();}
    catch(err){setError(apiErrorMessage(err,'Your request could not be sent. Please try again.'));}
    finally{setBusy(false);}
  }
  async function act(row,action,extra) {
    setBusy(true);setError('');
    try {await api.post(`/quotations/contractor-connections/${row.id}/${action}/`,extra||{});setNotice(action==='accept'?'Connection accepted.':'Connection updated.');await load();}
    catch(err){setError(apiErrorMessage(err,'This action could not be completed.'));}
    finally{setBusy(false);}
  }
  async function openMessage() {
    if(!customerConnection) return;
    setBusy(true);setError('');
    try {const {data}=await api.post('/quotations/chat/conversations/',{connection:customerConnection.connection});navigate(`/messages?conversation=${data.id}`);}
    catch(err){setError(apiErrorMessage(err,'The conversation could not be opened.'));}
    finally{setBusy(false);}
  }
  return <div className="mx-auto max-w-6xl min-w-0 space-y-4 pb-8">
    {error && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm">{error} <button onClick={load} type="button" className="min-h-11 px-3 underline">Retry</button></p>}
    {loading && !profile && <ContractorProfileSkeleton />}
    {profile && <ContractorProfileAdapter key={bharathId} profile={profile} contextActions={{onMessage:customerConnection?openMessage:null,busy,quoteHref:customerConnection?`/service-requests?contractor=${encodeURIComponent(bharathId)}&create=1`:null,assignHref:connection?.can_send_work_order?`/subcontract-work-orders?contractor=${profile.id}`:null}} />}
    {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
    {profile && !loading && user?.role==='CONTRACTOR' && profile.id!==user.id && <section className="portfolio-connection-controls" aria-label="Contractor connection">
      {connection ? <ContractorConnectionCard key={`${connection.id}-${connection.status}`} row={connection} busy={busy} onAct={act} onRequestAgain={sendRequest} compact /> : <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4"><div className="min-w-0"><h2 className="font-bold">Work together</h2><details className="mt-2"><summary className="cursor-pointer text-sm">Add a message (optional)</summary><label className="mt-2 block text-sm">Message<textarea className="mt-1 block w-full rounded-lg border p-3" rows={2} maxLength={2000} value={message} onChange={event=>setMessage(event.target.value)} /></label></details></div><button type="button" disabled={busy} onClick={sendRequest} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#216678] px-4 text-sm font-semibold text-white disabled:opacity-50"><Send size={16} />{busy?'Sending…':'Send request'}</button></div>}
    </section>}
  </div>;
}
