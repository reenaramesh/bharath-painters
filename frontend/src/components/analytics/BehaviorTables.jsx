import { displayDuration, displayTime, activityLabel } from '../../analytics/presentation.js';
import { Children, isValidElement } from 'react';

export function AnalyticsTable({label,heads,children}) {
  const rows=Children.toArray(children).filter(isValidElement);
  return <div className="aa-table-wrap aa-responsive-records" role="region" aria-label={label} tabIndex={0}>
    <table data-mobile-table="keep"><caption>{label}</caption><thead><tr>{heads.map(head=><th scope="col" key={head}>{head}</th>)}</tr></thead><tbody>{children}</tbody></table>
    <div className="aa-mobile-records"><p className="aa-muted">{label}</p><ul>{rows.map((row,index)=><li key={row.key || index}><dl>{Children.toArray(row.props.children).filter(isValidElement).map((cell,column)=><div key={column}><dt>{heads[column]}</dt><dd>{cell.props.children}</dd></div>)}</dl></li>)}</ul></div>
  </div>;
}
export function Pagination({page,more,onPage,label}) {
  return <nav className="aa-pagination" aria-label={label}><button type="button" disabled={page<=1} onClick={()=>onPage(page-1)}>Previous</button><span>Page {page}</span><button type="button" disabled={!more} onClick={()=>onPage(page+1)}>Next</button></nav>;
}
export function UserActivityTable({rows,onSelect}) {
  return <AnalyticsTable label="Users with recorded activity" heads={['Bharath ID','Account role','Observed roles','Sessions','Engaged time','Last activity']}>
    {rows.map(row=><tr key={row.id}><th scope="row"><button type="button" onClick={()=>onSelect(row)}>{row.bharath_id || 'ID not assigned'}</button></th><td>{row.role}</td><td>{row.roles.join(', ')}</td><td>{row.sessions}</td><td>{displayDuration(row.engaged_ms)}</td><td>{displayTime(row.last_seen)}</td></tr>)}
  </AnalyticsTable>;
}
export function SessionTable({rows,selected,onSelect}) {
  return <AnalyticsTable label="Sessions in the applied filters" heads={['Session','Bharath ID','Device','Roles','Started','Engaged time','End state']}>
    {rows.map(row=><tr key={row.id}><th scope="row"><button type="button" aria-pressed={selected===row.id} onClick={()=>onSelect(row.id)} title={row.id}>{row.id.slice(0,8)}</button></th><td>{row.bharath_id || 'ID not assigned'}</td><td>{row.device}</td><td>{row.roles.join(', ')}</td><td>{displayTime(row.started_at)}</td><td>{displayDuration(row.engaged_ms)}</td><td>{row.status==='inferred_timeout'?'Inferred inactivity timeout':row.status==='ended'?`Ended · ${row.end_reason}`:'Active / incomplete'}{row.ended_at && <small className="aa-block">{displayTime(row.ended_at)}</small>}</td></tr>)}
  </AnalyticsTable>;
}
export function ActivityTimeline({events,actions}) {
  if (!events.length) return <p className="aa-muted">No timeline events match these filters.</p>;
  return <ol className="aa-timeline">{events.map(event=><li key={event.id}>
    <div className="aa-event-time"><time dateTime={event.occurred_at}>{displayTime(event.occurred_at)}</time><small>{event.role} · {event.session_id.slice(0,8)}</small></div>
    <div><strong>{activityLabel(event,actions)}</strong><p>{event.screen}</p>
      {event.previous_screen && <small>From {event.previous_screen}</small>}
      {event.duration_ms>0 && <small>{displayDuration(event.duration_ms)} active on this screen</small>}
      {event.milestone>0 && <small>{event.milestone}% scroll depth</small>}
      {event.reason && <small>{event.reason.replaceAll('_',' ')}</small>}
    </div>
  </li>)}</ol>;
}
export function ScreenTable({rows}) {
  return <AnalyticsTable label="Ranked screens · engagement uses all matching records" heads={['Screen','Views','Users','Engaged time']}>
    {rows.map(row=><tr key={row.screen}><th scope="row">{row.screen}</th><td>{row.views}</td><td>{row.users}</td><td>{displayDuration(row.engaged_ms)}</td></tr>)}
  </AnalyticsTable>;
}
