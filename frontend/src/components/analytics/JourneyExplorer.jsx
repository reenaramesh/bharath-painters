import { journeyLayout, displayTitle } from '../../analytics/presentation.js';
import { AnalyticsTable } from './BehaviorTables.jsx';

export default function JourneyExplorer({journey,actions}) {
  const layout=journeyLayout(journey.links);
  const label=value=>value.startsWith('action:') ? actions[value.slice(7)] || displayTitle(value.slice(7)) : value.replace(/^screen:/,'');
  return <section className="aa-panel"><h2>Journey exploration</h2>
    <p className="aa-muted">Observed steps within each session. Arrows show the next recorded screen or feature action; repeated visits can form loops. {journey.sessions_considered} sessions · {journey.events_considered} events considered.</p>
    {journey.truncated && <p role="status" className="aa-coverage">This diagram is limited to 200 sessions or 20,000 events. Narrow the dates or choose a user/session for full coverage.</p>}
    {!layout.links.length ? <p className="aa-muted">A path appears after at least two different screens or actions are recorded in the same session.</p> : <>
      <div className="aa-journey-key"><span>Recorded step</span><span>Next recorded step</span></div>
      <svg className="aa-journey" viewBox={`0 0 760 ${layout.height}`} role="img" aria-label="Observed user journey transitions">
        <defs><marker id="aa-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" /></marker></defs>
        {layout.links.map(link=><path key={`${link.source}:${link.target}`} d={`M 260 ${link.y1} C 350 ${link.y1}, 410 ${link.y2}, 500 ${link.y2}`} fill="none" stroke="currentColor" strokeOpacity=".3" strokeWidth={Math.min(12,2+Math.sqrt(link.count)*2)} markerEnd="url(#aa-arrow)"><title>{label(link.source)} → {label(link.target)}: {link.count}</title></path>)}
        {[...layout.sources.map(node=>({...node,x:0})),...layout.targets.map(node=>({...node,x:500}))].map(node=><g key={`${node.x}:${node.key}`}><rect x={node.x} y={node.y-20} width="260" height="40" rx="8" fill="#edf2fa" /><text x={node.x+12} y={node.y+4} fill="#172033" fontSize="12"><title>{label(node.key)}</title>{label(node.key).length>34?`${label(node.key).slice(0,33)}…`:label(node.key)}</text></g>)}
      </svg><div className="aa-journey-mobile">{layout.links.map(link=><div key={`${link.source}:${link.target}`}><span>{label(link.source)}</span><b>↓ {link.count} transitions</b><span>{label(link.target)}</span></div>)}</div><p className="aa-muted">Diagram shows the 16 busiest transitions. The table contains every transition in the considered sessions.</p>
      <AnalyticsTable label="Observed transitions" heads={['From','To','Transitions']}>{journey.links.map(row=><tr key={`${row.source}:${row.target}`}><th scope="row">{label(row.source)}</th><td>{label(row.target)}</td><td>{row.count}</td></tr>)}</AnalyticsTable>
    </>}
    <div className="aa-charts aa-journey-outcomes"><div><h3>Observed exits</h3>{journey.exits.length ? <ul>{journey.exits.map(row=><li key={row.screen}>{row.screen} <b>{row.count}</b></li>)}</ul>:<p className="aa-muted">No observed exits in this selection.</p>}</div><div><h3>Completed workflows</h3>{journey.completed.length ? <ul>{journey.completed.map(row=><li key={row.action}>{actions[row.action] || row.action} <b>{row.count}</b></li>)}</ul>:<p className="aa-muted">No completed workflows recorded in this selection.</p>}</div></div>
  </section>;
}
