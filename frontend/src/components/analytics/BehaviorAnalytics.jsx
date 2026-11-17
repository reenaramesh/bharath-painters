import { useEffect, useRef, useState } from 'react';
import api from '../../api/client';
import { LoadingState } from '../ui';
import JourneyExplorer from './JourneyExplorer.jsx';
import ModuleDetails from './ModuleDetails.jsx';
import { ActivityTimeline, Pagination, ScreenTable, SessionTable, UserActivityTable } from './BehaviorTables.jsx';
import { activityLabel } from '../../analytics/presentation.js';

export default function BehaviorAnalytics({filters,selected,onSelect,onSession,section,refresh}) {
  const [data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const [page,setPage]=useState(1),[usersPage,setUsersPage]=useState(1),[sessionsPage,setSessionsPage]=useState(1);
  const [retry,setRetry]=useState(0),[exporting,setExporting]=useState(false),[exportMessage,setExportMessage]=useState('');
  const [exportKind,setExportKind]=useState('');
  const request=useRef(0);
  useEffect(()=>{setPage(1);setUsersPage(1);setSessionsPage(1);setExportKind('');},[filters,selected?.id]);
  useEffect(()=>{
    const controller=new AbortController(),sequence=++request.current;
    setLoading(true);setError('');setExportMessage('');
    api.get('/application-analytics/behavior/',{params:{...filters,user:selected?.id || undefined,page,users_page:usersPage,sessions_page:sessionsPage},signal:controller.signal}).then(response=>{
      if (request.current===sequence) setData(response.data);
    }).catch(failure=>{if (request.current===sequence && failure.code!=='ERR_CANCELED') setError('Behaviour reports could not be loaded. Check your filters and try again.');})
      .finally(()=>{if (request.current===sequence) setLoading(false);});
    return ()=>controller.abort();
  },[filters,selected?.id,page,usersPage,sessionsPage,refresh,retry]);
  async function download(kind) {
    setExporting(true);setExportMessage('');
    try {
      const response=await api.get('/application-analytics/export/',{params:{...filters,user:selected?.id || undefined,kind},responseType:'blob'});
      const url=URL.createObjectURL(response.data),link=document.createElement('a');
      link.href=url;link.download=`application-analytics-${kind}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      setExportMessage(response.headers['x-analytics-truncated']==='true'?'Downloaded the first 5,000 rows. Narrow the filters for a complete export.':'CSV downloaded.');
    } catch {setExportMessage('Export unavailable. Try again.');} finally {setExporting(false);}
  }
  if (loading) return <LoadingState label="Loading behaviour reports…"/>;
  if (error) return <div className="aa-panel" role="alert"><p>{error}</p><button type="button" onClick={()=>setRetry(value=>value+1)}>Retry behaviour reports</button></div>;
  if (!data) return null;
  const actions=Object.fromEntries(data.available_actions.map(action=>[action.id,action.label]));
  return <>
    <div className="aa-export"><p className="aa-muted">CSV opens in Excel. Exports use the applied filters and are limited to 5,000 rows.</p><label>Export report<select aria-label="Export report" value={exportKind} onChange={event=>setExportKind(event.target.value)}><option value="">Current report</option><option value="users">Users</option><option value="modules">Modules</option><option value="features">Features</option>{(selected || filters.session) && <option value="timeline">Timeline</option>}</select></label><button type="button" disabled={exporting} onClick={()=>download(exportKind || (section==='Module details'?'features':selected || filters.session?'timeline':'users'))}>{exporting?'Exporting…':'Export CSV'}</button></div>
    {exportMessage && <p role="status" className="aa-muted">{exportMessage}</p>}
    {filters.session && <p className="aa-selection" role="status">Session {filters.session}<button type="button" onClick={()=>onSession('')}>Show all sessions</button></p>}
    {section==='User Analytics' && <>
      {!data.users.length && <div className="aa-panel" role="status"><h2>No user activity matches these filters</h2><p className="aa-muted">Search a Bharath ID or broaden the date range. Records appear after real activity is collected.</p></div>}
      <section className="aa-panel"><h2>Users</h2><UserActivityTable rows={data.users} onSelect={onSelect}/><Pagination page={data.users_page} more={data.users_has_more} onPage={setUsersPage} label="User results pages"/></section>
      {data.profile && <p className="aa-muted">Account role: {data.profile.role}. Observed analytics roles: {data.profile.roles.join(', ') || 'None in this selection'}. Active in-house memberships: {data.profile.memberships.length}. Memberships do not duplicate activity.</p>}
    </>}
    {section!=='Module details' && <section className="aa-panel"><h2>Session explorer</h2><p className="aa-muted">Choose a session to inspect its timeline and navigation. Active / incomplete means no ending has been observed yet.</p><SessionTable rows={data.sessions} selected={filters.session} onSelect={onSession}/>{!data.sessions.length && <p className="aa-muted">No sessions match these filters.</p>}<Pagination page={data.sessions_page} more={data.sessions_has_more} onPage={setSessionsPage} label="Session results pages"/></section>}
    {section==='User Analytics' && <>
      {(selected || filters.session) ? <><section className="aa-panel"><h2>Engagement by screen</h2><ScreenTable rows={data.screen_usage}/></section><section className="aa-panel"><h2>Session timeline</h2><p className="aa-muted">Chronological events · Asia/Kolkata · up to 100 per page. Engagement entries are active-time increments.</p><ActivityTimeline events={data.timeline} actions={actions}/><Pagination page={data.timeline_page} more={data.timeline_has_more} onPage={setPage} label="Timeline pages"/></section></>:<p className="aa-muted">Select a user or session to see an individual timeline.</p>}
    </>}
    {section==='Journey exploration' && filters.session && <section className="aa-panel"><h2>Chronological session path</h2><p className="aa-muted">Screens and successful actions from timeline page {data.timeline_page}. Other event types remain available in User Analytics.</p><ol className="aa-session-path">{data.timeline.filter(event=>['screen_viewed','feature_action'].includes(event.kind)).map(event=><li key={event.id}>{event.kind==='screen_viewed'?event.screen:activityLabel(event,actions)}</li>)}</ol><Pagination page={data.timeline_page} more={data.timeline_has_more} onPage={setPage} label="Session path pages"/></section>}
    {(section==='Journey exploration' || selected || filters.session) && <JourneyExplorer journey={data.journey} actions={actions}/>}
    {section==='Module details' && (data.module_detail ? <ModuleDetails data={data.module_detail} actions={actions}/>:<div className="aa-panel" role="status">Choose a module and apply the filters to open its detail report.</div>)}
    <details className="aa-panel"><summary>Behaviour metric definitions</summary><dl className="aa-definitions">{Object.entries(data.definitions).map(([name,description])=><div key={name}><dt>{name.replaceAll('_',' ')}</dt><dd>{description}</dd></div>)}</dl></details>
  </>;
}
