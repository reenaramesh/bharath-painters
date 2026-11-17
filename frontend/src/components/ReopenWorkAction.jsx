import {useEffect, useRef, useState} from 'react';
import api from '../api/client';
import ContractorDialog from './ContractorDialog';
import {Button} from './ui';

export default function ReopenWorkAction({schedule,onUpdated}) {
  const [open,setOpen]=useState(false),[note,setNote]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const alive=useRef(false),lock=useRef(false);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  async function reopen(event){
    event.preventDefault();
    if(lock.current)return;
    if(!note.trim()){setError('Describe the issues and rework needed.');return;}
    lock.current=true;setBusy(true);setError('');
    try {
      const {data}=await api.post(`/jobs/work-schedules/${schedule.id}/progress/`,{action:'REOPEN',note:note.trim()});
      if(!alive.current)return;
      setOpen(false);setNote('');onUpdated(data);
    } catch(error){if(alive.current)setError(Object.values(error.response?.data || {}).flat().filter(value=>typeof value==='string').join(' ') || 'Work could not be reopened. Your note is retained.');}
    finally {lock.current=false;if(alive.current)setBusy(false);}
  }
  if(schedule.status!=='COMPLETED' || schedule.invoice_id || schedule.can_reopen===false)return null;
  return <>
    <Button type="button" variant="secondary" onClick={()=>setOpen(true)}>Reopen for rework</Button>
    {open && <ContractorDialog title="Reopen work" description="Record the issues and the rework needed before reopening." onClose={()=>{if(!lock.current)setOpen(false);}}>
      <form onSubmit={reopen} className="grid gap-4">
        <label className="grid gap-2 text-sm font-semibold">Issues and rework plan<textarea value={note} onChange={event=>setNote(event.target.value)} rows={4} maxLength={4000} required disabled={busy} className="w-full rounded-xl border p-3 bp-ui-control" placeholder="Describe what needs fixing and how it will be corrected." /></label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <Button type="submit" loading={busy} disabled={busy}>Reopen work</Button>
      </form>
    </ContractorDialog>}
  </>;
}
