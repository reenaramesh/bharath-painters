import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, BriefcaseBusiness } from 'lucide-react';
import api from '../../api/client';
import useAuth from '../../context/useAuth';
import { menuRouteEnabled } from '../../utils/menuVisibility';
import { StatusBadge } from '../ui';
import { PremiumDashboardPanel, PremiumDashboardEmpty, PremiumDashboardIcon } from './PremiumDashboardComponents';

const sources = {
  jobs: { title: 'Recent jobs', path: '/jobs', endpoint: '/jobs/list/', error: 'Jobs could not be loaded.', empty: 'No current jobs', description: 'Your current job posts will appear here.', icon: BriefcaseBusiness },
  activity: { title: 'Recent activity', path: '/activity-log', endpoint: '/quotations/activity-logs/', error: 'Activity could not be loaded.', empty: 'No recent activity', description: 'Your recorded account actions will appear here.', icon: Activity },
};

function displayDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
}

function WorkspaceSource({ kind, refreshKey }) {
  const source = sources[kind];
  const [state, setState] = useState({ loading: true, error: false, rows: [] });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setState({ loading: true, error: false, rows: [] });
    // Neither existing endpoint accepts page-size controls. Both return newest
    // first; retain only the four display records, never activity metadata.
    api.get(source.endpoint, { signal: controller.signal }).then(({ data }) => {
      if (!active) return;
      const records = kind === 'jobs' ? data?.jobs : Array.isArray(data) ? data : data?.results;
      const rows = (Array.isArray(records) ? records : []).slice(0, 4).map(row => kind === 'jobs'
        ? { id: row.id, title: row.title, city: row.city, status: row.status }
        : { id: row.id, action: row.action_display || row.action, module: row.module, date: displayDate(row.created_at) });
      setState({ loading: false, error: false, rows });
    }).catch(() => {
      if (active) setState({ loading: false, error: true, rows: [] });
    });
    return () => { active = false; controller.abort(); };
  }, [kind, source.endpoint, refreshKey, retry]);

  return <PremiumDashboardPanel title={source.title} className="pilot-workspace-feed" action={<Link className="contractor-panel-link" to={source.path}>View all</Link>}>
    {state.loading ? <p role="status">Loading {source.title.toLowerCase()}…</p> : state.error ? <div role="alert"><p>{source.error}</p><button type="button" className="bp-button bp-button-secondary" aria-label={`Retry ${source.title.toLowerCase()}`} onClick={() => setRetry(value => value + 1)}>Retry</button></div> : !state.rows.length ? <PremiumDashboardEmpty title={source.empty} description={source.description} /> : <ul className="pilot-feed-list">{state.rows.map((row, index) => <li key={row.id ?? index}>
      <Link className="pilot-feed-row" to={source.path}>
        <PremiumDashboardIcon icon={source.icon} tone={kind === 'jobs' ? 'purple' : 'blue'} />
        <span className="pilot-feed-copy"><strong>{kind === 'jobs' ? row.title || 'Job post' : [row.action, row.module].filter(Boolean).join(' · ') || 'Recorded activity'}</strong><span>{kind === 'jobs' ? row.city || 'Open jobs to view details' : row.date}</span></span>
        {kind === 'jobs' && row.status && <StatusBadge status={row.status} />}
      </Link>
    </li>)}</ul>}
  </PremiumDashboardPanel>;
}

export default function ContractorWorkspaceFeed({ refreshKey }) {
  const { user, menuVisibility } = useAuth();
  if (user?.role !== 'CONTRACTOR') return null;
  return <>{Object.entries(sources).filter(([, source]) => menuRouteEnabled(user.role, menuVisibility, source.path)).map(([kind]) => <WorkspaceSource key={`${user.id}:${kind}`} kind={kind} refreshKey={refreshKey} />)}</>;
}
