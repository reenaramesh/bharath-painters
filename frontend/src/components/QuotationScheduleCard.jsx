import {useCallback, useEffect, useRef, useState} from 'react';
import {Link} from 'react-router-dom';
import {CalendarDays} from 'lucide-react';
import api from '../api/client';
import {Button} from './ui';
import ReopenWorkAction from './ReopenWorkAction';
import './quotation-schedule-card.css';

const today = () => {
  const date=new Date();
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
};
const message=(error,fallback)=>Object.values(error.response?.data || {}).flat().filter(value=>typeof value==='string').join(' ') || fallback;
const statusLabel=value=>({PENDING:'Dates proposed',CONFIRMED:'Dates set',IN_PROGRESS:'In progress',COMPLETED:'Completed',CANCELLED:'Cancelled'})[value] || 'Dates not set';
const formatDate=value=>new Date(`${value}T00:00:00`).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});

export default function QuotationScheduleCard({quotation,onStatusChange}) {
  const [schedule,setSchedule]=useState(null);
  const [loading,setLoading]=useState(true);
  const [ready,setReady]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState('');
  const [form,setForm]=useState({start_date:today(),end_date:today(),reason:''});
  const alive=useRef(false),lock=useRef(false),loadGeneration=useRef(0);
  const quotationId=quotation.id,propertyId=quotation.property;
  const load=useCallback(async()=>{
    const current=++loadGeneration.current;
    setLoading(true);setReady(false);setError('');
    try {
      const {data}=await api.get('/jobs/work-schedules/',{params:propertyId?{property_id:propertyId}:{}});
      if(!alive.current || current!==loadGeneration.current)return;
      const found=(data.results || data).find(row=>String(row.quotation)===String(quotationId)) || null;
      setSchedule(found);
      setReady(true);
      setForm({start_date:found?.start_date || today(),end_date:found?.end_date || today(),reason:''});
    } catch(error) {if(alive.current && current===loadGeneration.current)setError(message(error,'Work schedule could not be loaded.'));}
    finally {if(alive.current && current===loadGeneration.current)setLoading(false);}
  },[quotationId,propertyId]);
  useEffect(()=>{alive.current=true;load();return()=>{alive.current=false;};},[load]);
  const editableState=!schedule || ['PENDING','CONFIRMED'].includes(schedule.status);
  const dateEligible=['DRAFT','SENT','VIEWED','ACCEPTED','SCHEDULED','CONVERTED'].includes(quotation.status);
  const dateChanged=Boolean(schedule && (form.start_date!==schedule.start_date || form.end_date!==schedule.end_date));
  const canStart=schedule && ['PENDING','CONFIRMED'].includes(schedule.status);
  // Actions use the persisted linked schedule; an unsaved date edit cannot start it.
  function edit(field,value){setForm(previous=>({...previous,[field]:value}));setNotice('');}

  async function saveDates(event){
    event.preventDefault();
    if(lock.current)return;
    setError('');setNotice('');
    if(!form.start_date || !form.end_date || form.end_date<form.start_date || form.start_date<today()){
      setError('Choose valid work dates starting today or later.');return;
    }
    if(dateChanged && !form.reason.trim()){setError('Enter a reason for changing the work dates.');return;}
    lock.current=true;setBusy('save');
    try {
      const {data}=await api.post('/jobs/work-schedules/',{quotation:quotationId,start_date:form.start_date,end_date:form.end_date,scheduling_mode:'CONTRACTOR',...(schedule && form.reason.trim()?{reason:form.reason.trim()}:{})});
      if(!alive.current)return;
      setSchedule(data);setForm({start_date:data.start_date,end_date:data.end_date,reason:''});
      setNotice('Work dates saved. They are available in Work schedules.');
      if(['ACCEPTED','CONVERTED'].includes(quotation.status))onStatusChange?.('SCHEDULED');
    } catch(error){if(alive.current)setError(message(error,'Work dates could not be saved.'));}
    finally {lock.current=false;if(alive.current)setBusy('');}
  }

  async function startWork(action='START'){
    if(lock.current || (action==='START' && (!canStart || dateChanged)))return;
    lock.current=true;setBusy(action==='START'?'start':'complete');setError('');setNotice('');
    try {
      const {data}=await api.post(`/jobs/work-schedules/${schedule.id}/progress/`,{action});
      if(!alive.current)return;
      setSchedule(data);setNotice(action==='START'?'Work started. Work schedules is updated.':'Work completed. You can now create the final invoice.');onStatusChange?.(action==='START'?'IN_PROGRESS':'COMPLETED');
    } catch(error){if(alive.current)setError(message(error,'Work could not be started. Your saved dates are unchanged.'));}
    finally {lock.current=false;if(alive.current)setBusy('');}
  }

  return <section className="quotation-schedule-card" aria-label="Quotation work schedule" aria-busy={loading || Boolean(busy)}>
    <header><div><h2><CalendarDays size={20} aria-hidden="true" />Work schedule</h2><p>Set dates and start work from this quotation.</p></div><span className="qsc-status">{statusLabel(schedule?.status)}</span></header>
    {loading && <p role="status">Loading work schedule...</p>}
    {error && <p role="alert" className="qsc-error">{error}</p>}
    {!loading && !ready && <Button variant="secondary" onClick={load}>Retry</Button>}
    {notice && <p role="status" className="qsc-notice">{notice}</p>}
    {ready && !loading && <>
      {editableState && dateEligible ? <form onSubmit={saveDates}>
        <div className="qsc-date-fields">
          <label>Start date<input type="date" name="start_date" value={form.start_date} min={today()} required disabled={Boolean(busy)} onChange={event=>edit('start_date',event.target.value)} /></label>
          <label>End date<input type="date" name="end_date" value={form.end_date} min={form.start_date || today()} required disabled={Boolean(busy)} onChange={event=>edit('end_date',event.target.value)} /></label>
          {dateChanged && <label className="qsc-reason">Reason for changing dates<input name="reason" value={form.reason} required disabled={Boolean(busy)} onChange={event=>edit('reason',event.target.value)} /></label>}
        </div>
        <div className="qsc-actions"><Button type="submit" variant="secondary" disabled={Boolean(busy)} loading={busy==='save'}>Save work dates</Button>
          {canStart && <Button type="button" onClick={()=>startWork()} loading={busy==='start'} disabled={Boolean(busy) || dateChanged}>Start work</Button>}
          {schedule && <Link to={`/work-schedules?quotation=${quotationId}`}>View schedule</Link>}
        </div>
        <p className="qsc-hint">{dateChanged?'Save the date changes before starting work.':'Dates and work status are shared with Work schedules. No customer or painter approval is required.'}</p>
      </form> : <>
        {schedule ? <div className="qsc-saved"><p><strong>{formatDate(schedule.start_date)}</strong> to <strong>{formatDate(schedule.end_date)}</strong></p><div className="qsc-actions">{canStart && <Button onClick={()=>startWork()} loading={busy==='start'} disabled={Boolean(busy)}>Start work</Button>}{schedule.status==='IN_PROGRESS' && <Button onClick={()=>startWork('COMPLETE')} loading={busy==='complete'} disabled={Boolean(busy)}>Complete work</Button>}{schedule.status==='COMPLETED' && <><ReopenWorkAction schedule={schedule} onUpdated={data=>{setSchedule(data);setNotice('Work reopened for rework.');onStatusChange?.('IN_PROGRESS');}} /><Link to={schedule.invoice_id?`/invoices?invoice=${schedule.invoice_id}`:`/quotations/${quotationId}?action=invoice`}>{schedule.invoice_id?'View invoice':'Create final invoice'}</Link></>}<Link to={`/work-schedules?quotation=${quotationId}`}>View schedule</Link></div></div> : <p className="qsc-hint">Work dates cannot be set for this quotation status. Use the latest eligible quotation.</p>}
      </>}
      {schedule?.rework_history?.length>0 && <details className="qsc-rework-history"><summary>Rework notes ({schedule.rework_history.length})</summary>{schedule.rework_history.map(row=><div key={row.id}><p>{row.note}</p><small>{new Date(row.created_at).toLocaleString('en-IN')}</small></div>)}</details>}
    </>}
  </section>;
}
