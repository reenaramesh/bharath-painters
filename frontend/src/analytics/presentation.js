export const displayTitle = value => String(value || '').replaceAll('-', ' ').replaceAll('_',' ').replace(/\b\w/g, letter=>letter.toUpperCase());
export const displayDuration = ms => `${Math.floor((ms || 0)/60000)}m ${Math.floor((ms || 0)/1000)%60}s`;
export const displayTime = value => new Date(value).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'});
export const displayRate = value => value == null ? '—' : `${(value*100).toFixed(1)}%`;
export function activityLabel(event, actions={}) {
  const action=actions[event.action] || displayTitle(event.action);
  if (event.kind==='feature_action') return action;
  if (event.kind==='workflow_started') return `Started · ${action}`;
  if (event.kind==='workflow_completed') return `Completed · ${action}`;
  if (event.kind==='workflow_abandoned') return `Abandoned · ${action}`;
  if (event.kind==='error') return `${action} · ${event.error_code} error`;
  return displayTitle(event.kind);
}
export function journeyLayout(input) {
  const links=[...input].sort((a,b)=>b.count-a.count).slice(0,16);
  const sources=[...new Set(links.map(row=>row.source))];
  const targets=[...new Set(links.map(row=>row.target))];
  const height=Math.max(180,Math.max(sources.length,targets.length)*54);
  const y=(entries,key)=>28+entries.indexOf(key)*54;
  return {height,sources:sources.map(key=>({key,y:y(sources,key)})),targets:targets.map(key=>({key,y:y(targets,key)})),
    links:links.map(row=>({...row,y1:y(sources,row.source),y2:y(targets,row.target)}))};
}
