import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, Users, Clock, Layers } from 'lucide-react';
import useAuth from '../context/useAuth';
import api from '../api/client';
import { PageHeader, StatCard, LoadingState } from '../components/ui';
import './application-analytics.css';
import BehaviorAnalytics from '../components/analytics/BehaviorAnalytics.jsx';
import EngagementChart from '../components/analytics/EngagementChart.jsx';

const roles = ['CONTRACTOR', 'PAINTER', 'CUSTOMER', 'EMPLOYEE'];
const dateString = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const dates = days => { const end = new Date(), start = new Date(); start.setDate(start.getDate() - days + 1); return { start: dateString(start), end: dateString(end) }; };
const title = value => value.replaceAll('-', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
const duration = ms => `${Math.floor(ms / 60000)}m ${Math.floor(ms / 1000) % 60}s`;

export default function ApplicationAnalytics() {
  const { user } = useAuth();
  return user?.role === 'ADMIN' ? <AnalyticsWorkspace /> : <Navigate to="/dashboard" replace />;
}

function AnalyticsWorkspace() {
  const {moduleId}=useParams();
  const navigate=useNavigate();
  const [filters, setFilters] = useState({ ...dates(7), role: '', module: moduleId || '',device:'',session:'' });
  const [applied, setApplied] = useState(filters);
  const [period, setPeriod] = useState('7');
  const [tab, setTab] = useState(moduleId ? 'Module details' : 'Overview');
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [query, setQuery] = useState(''), [matches, setMatches] = useState([]), [searchState, setSearchState] = useState('');
  const [selected, setSelected] = useState(null), [sort, setSort] = useState('visits');
  const request = useRef(0), searchRequest = useRef(0);
  useEffect(()=>{
    setFilters(previous=>({...previous,module:moduleId || ''}));
    setApplied(previous=>({...previous,module:moduleId || ''}));
    setTab(moduleId?'Module details':'Overview');
  },[moduleId]);
  function selectUser(row) {
    setSelected(row);setFilters(previous=>({...previous,session:''}));setApplied(previous=>({...previous,session:''}));setTab('User Analytics');
  }
  function selectSession(session) {
    setFilters(previous=>({...previous,session}));setApplied(previous=>({...previous,session}));
  }
  useEffect(() => {
    const controller = new AbortController(), sequence = ++request.current;
    setLoading(true); setError('');
    api.get('/application-analytics/report/', { params: { ...applied, user: selected?.id || undefined }, signal: controller.signal }).then(response => {
      if (sequence === request.current) setData(response.data);
    }).catch(err => {
      if (sequence === request.current && err.code !== 'ERR_CANCELED') setError(err.response?.data?.[0] || 'Analytics could not be loaded. Check the date range and try again.');
    }).finally(() => { if (sequence === request.current) setLoading(false); });
    return () => controller.abort();
  }, [applied, selected, refresh]);
  async function search(event) {
    event.preventDefault(); const sequence = ++searchRequest.current;
    setSearchState('Searching…'); setMatches([]);
    try {
      const result = await api.get('/application-analytics/users/', { params: { q: query } });
      if (sequence !== searchRequest.current) return;
      setMatches(result.data); setSearchState(result.data.length ? 'Select a user below.' : 'No matching Bharath ID.');
    } catch { if (sequence === searchRequest.current) setSearchState('Search unavailable. Try again.'); }
  }
  const ranking = [...(data?.modules || [])].sort((a,b) => b[sort] - a[sort] || a.module.localeCompare(b.module));
  return <div className="application-analytics">
    <PageHeader eyebrow="Admin / Application Analytics" title="Application Analytics" description="Understand real application usage, module visits and foreground engagement." actions={<button type="button" onClick={() => setRefresh(value => value+1)} disabled={loading}>Refresh reports</button>} />
    {moduleId && <Link className="aa-back-link" to="/application-analytics">← All application analytics</Link>}
    <form className="aa-panel aa-filters" onSubmit={event => { event.preventDefault(); setApplied({ ...filters }); if(moduleId && moduleId!==filters.module)navigate(filters.module?`/application-analytics/modules/${filters.module}`:'/application-analytics'); }}>
      <label>Period<select aria-label="Period" value={period} onChange={event => { const value = event.target.value; setPeriod(value); if (value !== 'custom') setFilters({ ...filters, ...dates(Number(value)) }); }}><option value="1">Today</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="custom">Custom range</option></select></label>
      <label>From<input type="date" required value={filters.start} max={filters.end} onChange={event => { setPeriod('custom'); setFilters({ ...filters, start: event.target.value }); }} /></label>
      <label>To<input type="date" required value={filters.end} min={filters.start} max={dateString(new Date())} onChange={event => { setPeriod('custom'); setFilters({ ...filters, end: event.target.value }); }} /></label>
      <label>User role<select aria-label="User role" value={filters.role} onChange={event => setFilters({ ...filters, role: event.target.value })}><option value="">All roles</option>{roles.map(role => <option key={role} value={role}>{role}</option>)}</select></label>
      <label>Module<select aria-label="Module" value={filters.module} onChange={event => setFilters({ ...filters, module: event.target.value })}><option value="">All modules</option>{data?.available_modules.map(module => <option value={module} key={module}>{title(module)}</option>)}</select></label>
      <label>Device<select aria-label="Device" value={filters.device} onChange={event=>setFilters({...filters,device:event.target.value})}><option value="">All devices</option>{['desktop','tablet','mobile'].map(device=><option key={device} value={device}>{title(device)}</option>)}</select></label>
      <button className="aa-primary" disabled={loading}>Apply filters</button>
    </form>
    <nav className="aa-tabs" aria-label="Analytics sections">{['Overview', 'Module ranking', 'User Analytics','Journey exploration',...(moduleId||applied.module?['Module details']:[])].map(name => <button key={name} type="button" aria-pressed={tab === name} onClick={() => setTab(name)}>{name}</button>)}</nav>
    {tab === 'User Analytics' && <section className="aa-panel"><h2>Find a user</h2><form className="aa-search" onSubmit={search}><label>Bharath ID<input value={query} minLength={2} maxLength={64} required onChange={event => setQuery(event.target.value)} placeholder="Enter a Bharath ID" /></label><button>Search user</button>{selected && <button type="button" onClick={() => {setSelected(null);selectSession('');}}>Clear selected user</button>}</form><p role="status" className="aa-muted">{searchState}</p><div className="aa-results">{matches.map(row => <button key={row.id} type="button" aria-pressed={selected?.id === row.id} onClick={() => selectUser(row)}>{row.bharath_id} · {row.role}</button>)}</div></section>}
    {selected && <p className="aa-muted" role="status">Showing activity for {selected.bharath_id}. All sections use this user and the applied filters. <button type="button" onClick={() => {setSelected(null);selectSession('');}}>Show all users</button></p>}
    {loading ? <LoadingState label="Loading real activity…" /> : error ? <div className="aa-panel aa-notice" role="alert"><p>{error}</p><button type="button" onClick={() => setRefresh(value => value+1)}>Try again</button></div> : data && <>
      <p className="aa-muted">{data.filters.start} to {data.filters.end} · Asia/Kolkata · Updates when you refresh · Admin activity is excluded.</p>
      {!data.overview.sessions && <div className="aa-panel aa-notice" role="status"><h2>No activity recorded for these filters</h2><p>Activity will appear after a user opens a module and the next tracking batch arrives. Try a wider period or another role.</p></div>}
      <div className="aa-kpis"><StatCard icon={Users} label="Active users" value={data.overview.active_users} hint="Distinct accounts with recorded activity" /><StatCard icon={Activity} label="Sessions" value={data.overview.sessions} hint="Sessions with activity in this period" /><StatCard icon={Clock} label="Engaged time" value={duration(data.overview.engaged_ms)} hint="Visible use; idle cutoff is 30 seconds" /><StatCard icon={Layers} label="Module views" value={data.overview.module_views} hint="Entries into a different module" /></div>
      {tab === 'Overview' && <><OverviewCharts data={data} /><EngagementChart trend={data.trend}/></>}
      {['Overview','Module ranking'].includes(tab) && <section className="aa-panel"><h2>Module ranking</h2><ModuleTable rows={tab==='Overview'?ranking.slice(0,10):ranking} sort={sort} onSort={setSort} /></section>}
      {['User Analytics','Journey exploration','Module details'].includes(tab) && <BehaviorAnalytics filters={applied} selected={selected} onSelect={selectUser} onSession={selectSession} section={tab} refresh={refresh}/>}
      <details className="aa-panel"><summary>Metric definitions &amp; privacy</summary><p className="aa-muted">Active users are distinct authenticated accounts with events during the applied dates. Sessions are unique account-bound browser sessions, restarted after login or 30 minutes without interaction. Module views count module entry; screen views count route changes, including different records on the same screen. Engagement counts visible time until 30 seconds after the most recent interaction. Scroll milestones are reached once per screen visit. Employee means a painter with an active in-house membership when the batch is received. Form values, passwords, OTPs, record IDs and URL parameters are never collected. Up to 90 days can be queried per report.</p></details>
    </>}
  </div>;
}

function ModuleTable({ rows, sort, onSort }) {
  return <div className="aa-table-wrap" tabIndex={0} role="region" aria-label="Module usage table"><table data-mobile-table="keep"><caption>Ranked by {sort === 'visits' ? 'module visits' : 'engagement time'}. Registered modules with no collected activity remain at zero.</caption><thead><tr><th scope="col">Module</th><th scope="col" aria-sort={sort === 'visits' ? 'descending' : 'none'}><button type="button" onClick={() => onSort('visits')}>Visits ↓</button></th><th scope="col">Users</th><th scope="col">Screen views</th><th scope="col" aria-sort={sort === 'engaged_ms' ? 'descending' : 'none'}><button type="button" onClick={() => onSort('engaged_ms')}>Engaged time ↓</button></th></tr></thead><tbody>{rows.map(row => <tr key={row.module}><th scope="row"><Link to={`/application-analytics/modules/${row.module}`}>{title(row.module)}</Link></th><td>{row.visits}</td><td>{row.users}</td><td>{row.screen_views}</td><td>{duration(row.engaged_ms)}</td></tr>)}</tbody></table></div>;
}

function OverviewCharts({ data }) {
  const active = data.modules.filter(row => row.visits > 0).slice(0,8).map(row => ({ ...row, label: title(row.module) }));
  return <><div className="aa-charts"><section className="aa-panel"><h2>Usage over time</h2>{data.trend.length ? <div className="aa-chart" role="group" aria-label="Module visits over time"><ResponsiveContainer width="100%" height="100%"><LineChart data={data.trend} accessibilityLayer><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} width={35} /><Tooltip /><Line type="monotone" dataKey="visits" name="Module visits" stroke="#3155a4" strokeWidth={2} isAnimationActive={false} /></LineChart></ResponsiveContainer></div> : <p className="aa-muted">A trend will appear once activity is collected.</p>}<details><summary>View trend data</summary><div className="aa-table-wrap"><table data-mobile-table="keep"><thead><tr><th scope="col">Date</th><th scope="col">Visits</th><th scope="col">Engaged time</th></tr></thead><tbody>{data.trend.map(row => <tr key={row.date}><td>{row.date}</td><td>{row.visits}</td><td>{duration(row.engaged_ms)}</td></tr>)}</tbody></table></div></details></section>
    <section className="aa-panel"><h2>Top-used modules</h2>{active.length ? <div className="aa-chart" role="group" aria-label="Most visited modules"><ResponsiveContainer width="100%" height="100%"><BarChart data={active} accessibilityLayer layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="visits" name="Module visits" fill="#3155a4" radius={[0,4,4,0]} isAnimationActive={false} /></BarChart></ResponsiveContainer></div> : <p className="aa-muted">Top modules will appear after the first visits.</p>}</section></div>
    <section className="aa-panel"><h2>Usage by role</h2><div className="aa-table-wrap"><table data-mobile-table="keep"><caption>Users can appear in more than one role if employment context changes during the period.</caption><thead><tr><th scope="col">Role</th><th scope="col">Active users</th><th scope="col">Visits</th><th scope="col">Engaged time</th></tr></thead><tbody>{roles.map(role => { const row = data.roles.find(item => item.role === role); return <tr key={role}><th scope="row">{title(role.toLowerCase())}</th><td>{row?.users || 0}</td><td>{row?.visits || 0}</td><td>{duration(row?.engaged_ms || 0)}</td></tr>; })}</tbody></table></div></section></>;
}

