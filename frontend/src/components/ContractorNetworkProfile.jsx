import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import api from '../api/client';
import ContractorProfileAdapter from './ContractorProfileAdapter';
import { connectionCounterparty } from '../utils/subcontract';
import ContractorConnectionCard from './ContractorConnectionCard';

export default function ContractorNetworkProfile({row,profile:cachedProfile,stats,initialAction,busy,error,onClose,onAct,onRequestAgain}) {
  const dialogRef=useRef(null);
  const other=connectionCounterparty(row);
  const [profile,setProfile]=useState(cachedProfile || (row.viewer_authority==='RECIPIENT' ? row.requester_details : null));
  const [loading,setLoading]=useState(true);
  const [profileError,setProfileError]=useState('');
  useEffect(()=>{
    const dialog=dialogRef.current;
    if (!dialog.open) dialog.showModal();
    return ()=>{if(dialog.open)dialog.close();};
  },[]);
  useEffect(()=>{
    let active=true;
    api.get('/accounts/contractors/').then(({data})=>{if(active){const match=(Array.isArray(data)?data:data.results||[]).find(item=>item.id===other.id);if(match)setProfile(match);}}).catch(()=>{if(active)setProfileError('Additional profile details could not be loaded. Close and try again.');}).finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[other.id]);
  return <dialog ref={dialogRef} onCancel={onClose} className="network-profile-dialog network-portfolio-dialog" aria-labelledby="network-profile-title">
    <header className="flex shrink-0 items-center justify-between gap-3 border-b p-4"><h2 id="network-profile-title" className="text-lg font-bold">Contractor profile</h2><button type="button" onClick={onClose} aria-label="Close contractor profile" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border"><X className="h-4 w-4" /></button></header>
    <div className="min-h-0 overflow-y-auto p-4">
      {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading && !profile && <p role="status">Loading profile details…</p>}
      {profileError && <p role="status" className="mb-3 text-sm text-slate-600">{profileError}</p>}
      <ContractorProfileAdapter profile={profile} onBack={onClose} contextActions={{assignHref:row.can_send_work_order ? `/subcontract-work-orders?contractor=${other.id}` : null}} />
      <ContractorConnectionCard row={row} busy={busy} onAct={onAct} onRequestAgain={onRequestAgain} initialAction={initialAction} compact />
    </div>
  </dialog>;
}
