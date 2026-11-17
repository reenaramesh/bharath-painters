import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api/client';
import { ClipboardCheck, RefreshCw, Plus, Paintbrush, ChevronDown, Trash2, Layers, CircleCheck, Clock3, Pause } from 'lucide-react';
import { confirmAction } from '../utils/confirmAction.js';
import { surfaceLabel } from '../utils/groupedQuotation.js';
import './schedule-work-items.css';

const statuses = {NOT_STARTED:'Not started', IN_PROGRESS:'In progress', ON_HOLD:'On hold', COMPLETED:'Completed'};
const draftFor = row => ({version:row.version, scope_token:row.scope_token, steps:structuredClone(row.steps), note:row.note || ''});
const changed = (draft, row) => JSON.stringify(draft) !== JSON.stringify(draftFor(row));
const message = error => error.response?.data?.detail || 'Work updates could not be saved. Please retry.';

export default function ScheduleWorkItems({scheduleId, parentStatus, visible, drafts, onDraftsChange, onStart, startHint, scheduleBusy=false, project, progressError, initiallyOpen=false, itemIds=null}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [lineOpen, setLineOpen] = useState({});
  const [tab, setTab] = useState('checklist');
  const [filter, setFilter] = useState('ALL');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lineErrors, setLineErrors] = useState({});
  const [saving, setSaving] = useState({});
  const [notice, setNotice] = useState('');
  const alive = useRef(true), sequence = useRef(0), locks = useRef(new Set());
  const pendingStepFocus = useRef(null);
  const url = `/jobs/work-schedules/${scheduleId}/work-items/`;
  useEffect(() => {alive.current=true; return () => {alive.current=false;};}, []);
  const load = useCallback(async () => {
    const request=++sequence.current;
    setLoading(true); setError('');
    try {
      const response=await api.get(`/jobs/work-schedules/${scheduleId}/work-items/`);
      if(!alive.current || sequence.current!==request)return false;
      setData({...response.data, loadedParentStatus:parentStatus}); return true;
    } catch(failure) {
      if(alive.current && sequence.current===request){
        setError('Work items could not be loaded. Please retry.');
        if([403,404].includes(failure.response?.status))setData(null);
      }
      return false;
    } finally {if(alive.current && sequence.current===request)setLoading(false);}
  }, [scheduleId,parentStatus]);
  useEffect(() => {if(visible && open)void load();}, [visible,open,parentStatus,load]);
  function edit(row, changes) {
    onDraftsChange(previous => {
      const next={...previous}, draft={...(previous[row.item_id] || draftFor(row)), ...changes};
      if(changed(draft,row))next[row.item_id]=draft;else delete next[row.item_id];
      return next;
    });
    setNotice(''); setLineErrors(previous=>({...previous,[row.item_id]:null}));
  }
  async function save(row) {
    if(locks.current.has(row.item_id))return;
    const payload=drafts[row.item_id];
    if(!payload)return;
    locks.current.add(row.item_id);setSaving(previous=>({...previous,[row.item_id]:true}));
    try {
      const response=await api.patch(`${url}${row.item_id}/`,payload);
      if(!alive.current)return;
      sequence.current++;setLoading(false);
      setData(previous=>({...previous,items:previous.items.map(item=>item.item_id===row.item_id?response.data:item)}));
      onDraftsChange(previous=>{const next={...previous};delete next[row.item_id];return next;});
      setNotice('Work update saved.');setLineErrors(previous=>({...previous,[row.item_id]:null}));
    } catch(failure) {
      if(alive.current)setLineErrors(previous=>({...previous,[row.item_id]:{text:message(failure),conflict:failure.response?.status===409}}));
    } finally {
      locks.current.delete(row.item_id);
      if(alive.current)setSaving(previous=>({...previous,[row.item_id]:false}));
    }
  }
  async function reload(row) {
    if(!await confirmAction({question:'Are you sure you want to discard these changes?'}))return;
    if(!alive.current)return;
    if(await load()){
      onDraftsChange(previous=>{const next={...previous};delete next[row.item_id];return next;});
      setLineErrors(previous=>({...previous,[row.item_id]:null}));
    }
  }
  function add(row, label='') {
    setFilter('ALL');
    const steps=(drafts[row.item_id] || draftFor(row)).steps;
    if(steps.length<40){
      const id=crypto.randomUUID();
      pendingStepFocus.current=id;
      edit(row,{steps:[...steps,{id,label,status:'NOT_STARTED'}]});
    }
  }
  async function remove(row, id) {
    if(await confirmAction({question:'Are you sure you want to remove this work step?'}) && alive.current){
      const steps=(drafts[row.item_id] || draftFor(row)).steps;
      edit(row,{steps:steps.filter(step=>step.id!==id)});
    }
  }
  if(!visible)return null;
  const scheduleStatus=data && data.loadedParentStatus===parentStatus ? data.schedule_status : parentStatus || data?.schedule_status;
  const progressEnabled=scheduleStatus==='IN_PROGRESS';
  const setupId=`schedule-work-setup-${scheduleId}`;
  const retainedDrafts=data?.can_manage ? Object.keys(drafts).filter(id=>{
    const row=data.items.find(item=>String(item.item_id)===id);
    return !row || !row.can_edit || ['COMPLETED','CANCELLED'].includes(scheduleStatus);
  }) : [];
  const current=data?.items.filter(row=>row.is_current) || [];
  const allSteps=current.flatMap(row=>(row.can_edit && !['COMPLETED','CANCELLED'].includes(scheduleStatus) ? drafts[row.item_id] || row : row).steps);
  const completed=allSteps.filter(step=>step.status==='COMPLETED').length;
  const editableLine = row => data.can_manage && row.can_edit && !['COMPLETED','CANCELLED'].includes(scheduleStatus);
  const lineDraft = row => editableLine(row) ? drafts[row.item_id] || draftFor(row) : draftFor(row);
  const counts = Object.fromEntries(Object.keys(statuses).map(status=>[status,allSteps.filter(step=>step.status===status).length]));
  const percent = allSteps.length ? Math.round(completed/allSteps.length*100) : 0;
  const dirtyCount = Object.keys(drafts).length;
  const filteredItems = (data?.items || []).filter(row=>itemIds===null || itemIds.includes(String(row.item_id)));
  const matching = filteredItems.filter(row=>filter==='ALL' || lineDraft(row).steps.some(step=>step.status===filter));
  const latest = filteredItems.filter(row=>row.updated_at).sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at));
  const tabId = name => `schedule-${scheduleId}-tab-${name}`;
  const panelId = name => `schedule-${scheduleId}-panel-${name}`;
  const scopeFields = row => [['Room',row.display_scope?.room || row.room || 'General'], ['Surface',(row.surfaces || []).map(surfaceLabel).join(' + ') || '\u2014'], ['Quantity',`${row.quantity} ${row.display_scope?.unit || row.unit || 'units'}`], ['Service',row.display_scope?.service || row.service || '\u2014'], ['Product',row.display_scope?.product || row.product || '\u2014']];
  const scopeLabel = row => scopeFields(row).map(([,value])=>value).join(' \u00b7 ');

  function keyboardTab(event) {
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();
    const target=event.key==='Home'?'checklist':event.key==='End'?'notes':tab==='checklist'?'notes':'checklist';
    setTab(target);
    event.currentTarget.querySelector(`#${tabId(target)}`)?.focus();
  }
  function saveFooter(row, draft, busy) {
    return <>
      <div className="swi-save"><span className="swi-hint" role="status">{drafts[row.item_id]?'Unsaved changes':'All changes saved'}</span><button type="button" className="swi-button swi-primary" disabled={busy || loading || !drafts[row.item_id] || draft.steps.some(step=>!step.label.trim())} aria-busy={busy} onClick={()=>save(row)}>{busy?'Saving...':'Save update'}</button></div>
      {lineErrors[row.item_id] && <div role="alert" className="swi-error">{lineErrors[row.item_id].text}{lineErrors[row.item_id].conflict && <button type="button" className="swi-button swi-secondary" onClick={()=>reload(row)} disabled={busy || loading}>Reload saved line</button>}</div>}
    </>;
  }
  return <details className="schedule-work-items" open={open} onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary className="swi-heading"><span className="swi-heading-icon"><Paintbrush size={20} aria-hidden="true" /></span><span className="swi-heading-copy"><strong>Work items &amp; progress</strong><small>Quotation checklist and site updates</small></span><ChevronDown className="swi-chevron" size={20} aria-hidden="true" /></summary>
    <div className="swi-body">
      {loading && <p role="status">Loading work items...</p>}
      {error && <div role="alert" className="swi-error">{error}<button type="button" className="swi-button swi-secondary" onClick={load} disabled={loading}>Retry</button></div>}
      {progressError && <div role="alert" className="swi-error">{progressError}</div>}
      {notice && <p role="status" className="swi-success"><CircleCheck size={18} aria-hidden="true" />{notice}</p>}
      {data && <>
        <section className="swi-project-summary" aria-label="Work summary">
          <div className="swi-project-copy"><span className="swi-eyebrow"><Layers size={14} aria-hidden="true" /> QUOTATION {project?.quotation || `#${scheduleId}`}</span><div className="swi-project-title"><h3>{project?.property || 'Your work checklist'}</h3><span className={`swi-project-status swi-${scheduleStatus?.toLowerCase()}`}>{scheduleStatus?.replaceAll('_',' ').toLowerCase() || 'Scheduled'}</span></div>{project?.customer && <p>{project.customer}</p>}</div>
          <div className="swi-progress-card"><div><strong>{completed} of {allSteps.length} steps completed</strong><span>{percent}%</span></div><progress aria-label="Work-step completion" value={completed} max={allSteps.length || 1} /><div className="swi-progress-legend"><span><i className="swi-dot swi-dot-done" />Completed {completed}</span><span><i className="swi-dot swi-dot-active" />Active {counts.IN_PROGRESS}</span><span><i className="swi-dot" />Remaining {allSteps.length-completed}</span></div></div>
        </section>
        <div className="swi-view-toolbar"><div role="tablist" aria-label="Work views" className="swi-tabs" onKeyDown={keyboardTab}>{[['checklist','Checklist',ClipboardCheck],['notes','Status',Clock3]].map(([key,label,Icon])=><button type="button" role="tab" key={key} id={tabId(key)} aria-controls={panelId(key)} aria-selected={tab===key} tabIndex={tab===key?0:-1} onClick={()=>setTab(key)}><Icon size={18} aria-hidden="true" />{label}</button>)}</div><button type="button" className="swi-refresh" aria-label="Refresh progress" title="Refresh progress" onClick={load} disabled={loading || Object.values(saving).some(Boolean)}><RefreshCw size={18} aria-hidden="true" /><span>Refresh progress</span></button></div>
        {data.can_manage && !progressEnabled && !['COMPLETED','CANCELLED'].includes(scheduleStatus) && <div className="swi-setup" id={setupId}><div><strong>Start work to update step statuses</strong><p>{startHint || 'You can prepare steps now. Start the schedule when the work is ready.'}</p></div>{onStart && <button type="button" className="swi-button swi-primary" onClick={onStart} disabled={scheduleBusy || loading}>Start work</button>}</div>}
        {dirtyCount>0 && <div className="swi-draft-notice" role="status">Unsaved updates in {dirtyCount} {dirtyCount===1?'line':'lines'}. Save each line to publish its progress.</div>}
      </>}
      {retainedDrafts.map(id=><details key={id} className="swi-line swi-recovered"><summary>{data.items.some(row=>String(row.item_id)===id) ? "Unsaved update for a read-only quotation line" : "Unsaved update for a removed quotation line"}</summary><div className="swi-recovery-body"><p className="swi-hint">Your unsaved work steps are retained for reference. Review them before discarding the draft.</p><p className="swi-read-note">{drafts[id].steps.map(step=>`${step.label}: ${statuses[step.status]}`).join('\n')}</p><button type="button" className="swi-button swi-secondary" onClick={async()=>{if(await confirmAction({question:'Are you sure you want to discard these changes?'}) && alive.current)onDraftsChange(previous=>{const next={...previous};delete next[id];return next;});}}>Discard draft</button></div></details>)}
      {data && tab==='checklist' && <div role="tabpanel" id={panelId('checklist')} aria-labelledby={tabId('checklist')}>
        <div className="swi-filters" role="group" aria-label="Filter work steps">{[['ALL','All steps',allSteps.length],...Object.entries(statuses).map(([value,label])=>[value,label,counts[value]])].map(([value,label,count])=><button type="button" key={value} aria-label={`Filter work steps: ${label}`} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{label}<span>{count}</span></button>)}</div>
        {!matching.length && <div className="swi-empty"><ClipboardCheck size={28} aria-hidden="true" /><p>{data.items.length?'No work steps match this filter.':'No quotation line items are available for this schedule.'}</p>{filter!=='ALL' && <button type="button" className="swi-button swi-secondary" onClick={()=>setFilter('ALL')}>Show all steps</button>}</div>}
        <div className="swi-lines">{matching.map(row=>{
          const index=data.items.indexOf(row), busy=Boolean(saving[row.item_id]), editable=editableLine(row), draft=lineDraft(row);
          const key=row.item_id || `history-${row.progress_id}`, done=draft.steps.filter(step=>step.status==='COMPLETED').length;
          const lineStatus=done>0 && done===draft.steps.length?'completed':draft.steps.some(step=>step.status==='ON_HOLD')?'on_hold':draft.steps.some(step=>step.status==='IN_PROGRESS')?'in_progress':'not_started';
          return <details key={key} className={`swi-line swi-line-${lineStatus}`} open={lineOpen[key] ?? index===0} onToggle={event=>{const expanded=event.currentTarget.open;setLineOpen(previous=>previous[key]===expanded?previous:{...previous,[key]:expanded});}}>
            <summary className="swi-line-heading"><span className={`swi-stage-dot ${done===draft.steps.length && done>0?'swi-dot-done':'swi-dot-active'}`} /><span className="swi-line-title"><span className="swi-scope-inline" title={scopeLabel(row)}>{scopeLabel(row)}</span><span className="swi-scope-mobile">{scopeFields(row).map(([label,value])=><span key={label}><small>{label}</small><strong>{value}</strong></span>)}</span></span><span className="swi-empty-action"><span className={`swi-count ${done===draft.steps.length && done>0?'swi-count-done':''}`}>{draft.steps.length ? `${done}/${draft.steps.length} completed` : "No steps yet"}</span>{editable && !draft.steps.length && <button type="button" className="swi-button swi-secondary" disabled={busy} onClick={event=>{event?.preventDefault();event?.stopPropagation();add(row);setLineOpen(previous=>({...previous,[key]:true}));}}><Plus size={14} aria-hidden="true" />Add custom step</button>}</span><ChevronDown className="swi-chevron" size={18} aria-hidden="true" /></summary>
            <div className="swi-line-body">
              <div className="swi-checklist-column">
                {!row.is_current && <p className="swi-hint">Earlier quotation item retained for reference.</p>}
                {row.scope_changed && <p className="swi-hint">Quotation details changed. Review this line before saving an update.</p>}
                {draft.steps.length>0 && <div className="swi-steps-heading" aria-hidden="true"><span>Done</span><span>Work step</span><span>Status</span><span /></div>}<ol className="swi-steps">{draft.steps.map((step,stepIndex)=>{
                  if(filter!=='ALL' && step.status!==filter)return null;
                  const changeStep=changes=>edit(row,{steps:draft.steps.map(entry=>entry.id===step.id?{...entry,...changes}:entry)});
                  return <li key={step.id} className={`swi-task swi-task-${step.status.toLowerCase()}${editable?'':' swi-task-readonly'}`}>
                    <div className="swi-task-main">
                      {editable?<label className="swi-check-target"><input type="checkbox" checked={step.status==='COMPLETED'} aria-label={`Mark ${step.label || `work step ${stepIndex+1}`} completed`} disabled={busy || !progressEnabled || loading || scheduleBusy} aria-describedby={!progressEnabled?setupId:undefined} onChange={event=>changeStep({status:event.target.checked?'COMPLETED':'NOT_STARTED'})} /></label>:<span className="swi-check-read" aria-hidden="true">{step.status==='COMPLETED'?<CircleCheck size={16} />:<Clock3 size={16} />}</span>}
                      <div className="swi-task-copy">{editable?<label><span className="swi-sr-only">Work step {stepIndex+1}</span><input className="swi-step-name" ref={element=>{if(element && pendingStepFocus.current===step.id){element.focus();pendingStepFocus.current=null;}}} maxLength={120} value={step.label} disabled={busy} onChange={event=>changeStep({label:event.target.value})} placeholder="Name this work step" /></label>:<strong>{step.label}</strong>}</div>
                      {!editable && <span className={`swi-status-tag swi-${step.status.toLowerCase()}`}>{statuses[step.status]}</span>}
                    </div>
                    {editable && <div className="swi-task-controls"><label className="swi-status-field"><span className="swi-sr-only">Status for step {stepIndex+1}</span><select className={`swi-status-select swi-${step.status.toLowerCase()}`} value={step.status} disabled={busy || !progressEnabled || loading || scheduleBusy} aria-describedby={!progressEnabled?setupId:undefined} onChange={event=>changeStep({status:event.target.value})}>{Object.entries(statuses).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><button type="button" className="swi-remove" aria-label={`Remove work step ${stepIndex+1}`} title="Remove work step" disabled={busy} onClick={()=>remove(row,step.id)}><Trash2 size={16} aria-hidden="true" /></button></div>}
                  </li>;
                })}</ol>
                {editable && draft.steps.length>0 && <div className="swi-add"><button type="button" className="swi-button swi-secondary" disabled={busy || draft.steps.length>=40} onClick={()=>add(row)}><Plus size={18} aria-hidden="true" />Add custom step</button></div>}
                {editable && (draft.steps.length>0 || drafts[row.item_id]) && <div className="swi-line-footer">{saveFooter(row,draft,busy)}{row.updated_at && <p className="swi-updated">Updated {new Date(row.updated_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}</p>}</div>}
              </div>
            </div>
          </details>;
        })}</div>
      </div>}
      {data && tab==='notes' && <div role="tabpanel" id={panelId('notes')} aria-labelledby={tabId('notes')}>
        <div className="swi-metrics">{[[Layers,'Work steps',allSteps.length],[CircleCheck,'Completed',counts.COMPLETED],[Paintbrush,'In progress',counts.IN_PROGRESS],[Pause,'On hold',counts.ON_HOLD]].map(([Icon,label,count])=><div key={label}><Icon size={20} aria-hidden="true" /><span>{label}<strong>{count}</strong></span></div>)}</div>
        <div className="swi-status-workspace"><section className="swi-status-notes"><h3><ClipboardCheck size={18} aria-hidden="true" />Work status</h3>{filteredItems.map(row=>{const steps=lineDraft(row).steps;return <article className="swi-status-note" key={row.item_id || `history-${row.progress_id}`}><h4 className="swi-scope-inline">{scopeLabel(row)}</h4><p>{steps.filter(step=>step.status==='COMPLETED').length} of {steps.length} work steps completed</p></article>;})}{!filteredItems.length && <p className="swi-empty-copy">No work updates match the selected category.</p>}</section>
          <section className="swi-update-feed"><h3><Clock3 size={20} aria-hidden="true" />Latest saved updates</h3>{latest.length?latest.map(row=><article key={row.progress_id} className="swi-feed-entry"><span className="swi-feed-dot"><CircleCheck size={18} aria-hidden="true" /></span><div><h4 className="swi-scope-inline">{scopeLabel(row)}</h4><time dateTime={row.updated_at}>{new Date(row.updated_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}</time>{data.can_manage && row.updated_by && <p className="swi-hint">Recorded by {row.updated_by}</p>}<p>{row.steps.filter(step=>step.status==='COMPLETED').length} of {row.steps.length} steps completed</p></div></article>):<p className="swi-empty-copy">Saved work updates will appear here.</p>}</section>
        </div>
      </div>}
    </div>
  </details>;
}
