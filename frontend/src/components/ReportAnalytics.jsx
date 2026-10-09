import { useState } from 'react';
import { monthlyReportSeries, userReportSeries, reportLabel } from '../utils/reportAnalytics';
import '../pages/report-analytics.css';

const money=value=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(value||0);
const monthLabel=value=>new Date(value).toLocaleDateString('en-IN',{month:'short',year:'2-digit'});
const colors=['var(--ra-blue)','var(--ra-green)','var(--ra-amber)','var(--ra-purple)','var(--ra-rose)','var(--ra-teal)'];

function Panel({title,description,children,className=''}) {
  return <section className={`ra-panel ${className}`}><header><h2>{title}</h2><p>{description}</p></header>{children}</section>;
}
function Bars({rows}) {
  const max=Math.max(1,...rows.map(row=>Number(row.value)||0));
  return rows.length ? <ul className="ra-bars">{rows.map((row,index)=><li key={row.label}><div><span>{row.label}</span><strong>{row.value}</strong></div><span className="ra-track" aria-hidden="true"><span style={{width:`${Math.max(0,row.value)/max*100}%`,background:colors[index%colors.length]}} /></span></li>)}</ul> : <p className="ra-empty">No data available yet.</p>;
}
function PieChart({rows,name}) {
  const [selectedLabel,setSelectedLabel]=useState(null);
  const total=rows.reduce((sum,row)=>sum+Number(row.value||0),0);
  const selected=rows.find(row=>row.label===selectedLabel)||rows[0];
  let offset=0;
  const stops=rows.map((row,index)=>{const start=offset;offset+=total?Number(row.value)/total*100:0;return `${colors[index%colors.length]} ${start}% ${offset}%`;});
  if (!total) return <p className="ra-empty">No data available yet.</p>;
  return <div className="ra-pie-layout">
    <div className="ra-pie" role="img" aria-label={`${name}: ${rows.map(row=>`${row.label} ${row.value}`).join(', ')}`} style={{background:`conic-gradient(${stops.join(',')})`}}>
      <div className="ra-pie-center" aria-hidden="true"><strong>{total.toLocaleString('en-IN')}</strong><span>Total</span></div>
    </div>
    <div><ul className="ra-pie-legend">{rows.map((row,index)=><li key={row.label}><button type="button" aria-pressed={selected?.label===row.label} onClick={()=>setSelectedLabel(row.label)}>
      <span className="ra-dot" style={{background:colors[index%colors.length]}} aria-hidden="true" /><span>{row.label}</span><strong>{row.value}</strong><small>{(Number(row.value)/total*100).toFixed(1)}%</small>
    </button></li>)}</ul><p className="ra-pie-detail" aria-live="polite"><strong>{selected?.label}</strong> · {selected?.value} of {total} · {(Number(selected?.value)/total*100).toFixed(1)}%</p></div>
  </div>;
}
function MonthlyChart({rows}) {
  const [limit,setLimit]=useState('6');
  const [selectedMonth,setSelectedMonth]=useState(null);
  const months=monthlyReportSeries(rows).slice(-Number(limit));
  const max=Math.max(1,...months.flatMap(row=>[row.billed,row.paid]));
  const selected=months.find(row=>row.month===selectedMonth)||months.at(-1);
  return <Panel title="Monthly invoice performance" description="Compare billed amounts with payments recorded against those invoices." className="ra-monthly-side">
    <div className="ra-chart-toolbar"><div className="ra-inline-legend"><span><i className="ra-dot" style={{background:colors[0]}} />Billed</span><span><i className="ra-dot" style={{background:colors[1]}} />Received</span></div><label>Period <select value={limit} onChange={event=>setLimit(event.target.value)}><option value="6">Latest 6 months</option><option value="12">Latest 12 months</option></select></label></div>
    {months.length ? <><p className="ra-axis-note">Scale: {money(max)} · Select a month for exact amounts</p><div className="ra-months">{months.map(row=><button key={row.month} type="button" className="ra-month" aria-pressed={selected.month===row.month} aria-label={`${monthLabel(row.month)}: billed ${money(row.billed)}, received ${money(row.paid)}`} onClick={()=>setSelectedMonth(row.month)}><span>{monthLabel(row.month)}</span><span className="ra-month-bars" aria-hidden="true"><span style={{width:`${Math.max(0,row.billed)/max*100}%`,background:colors[0]}} /><span style={{width:`${Math.max(0,row.paid)/max*100}%`,background:colors[1]}} /></span></button>)}</div><div className="ra-month-detail" aria-live="polite"><strong>{monthLabel(selected.month)}</strong><span>Billed <b>{money(selected.billed)}</b></span><span>Received <b>{money(selected.paid)}</b></span><span>Balance <b>{money(selected.due)}</b></span></div></> : <p className="ra-empty">Monthly charts will appear when invoices are recorded.</p>}
  </Panel>;
}
export default function ReportAnalytics({report,users,admin,userError,onRetry}) {
  const series=userReportSeries(users);
  const summary=report.summary||{};
  return <div className="report-analytics">
    {admin && (series ? <>
      <Panel title="User overview" description="Select a category to see its share of directory records."><PieChart rows={series.roles} name="User distribution" /></Panel>
      <Panel title="Account verification" description="Verification status across contractors and employees."><Bars rows={series.verification} /></Panel>
      <Panel title="Customer pipeline" description="Customer records grouped by their current status."><Bars rows={series.customers} /></Panel>
      <Panel title="Employee availability" description="The current availability of your workforce."><Bars rows={series.availability} /></Panel>
    </> : <Panel title="User analytics" description={userError || 'Loading user reports…'}>{userError && <button className="ra-retry" type="button" onClick={onRetry}>Retry user analytics</button>}</Panel>)}
    <div className="ra-performance-layout">
    <div className="ra-performance-main">
    <Panel title="Quotation pipeline" description="Select a stage to see its share of quotations."><PieChart name="Quotation distribution" rows={(report.quotation_statuses||[]).map(row=>({label:reportLabel(row.status),value:row.count}))} /></Panel>
    <Panel title="Project progress" description="Active and completed projects from the operations report.">{admin ? <Bars rows={[{label:'Active',value:summary.active_projects||0},{label:'Completed',value:summary.completed_projects||0}]} /> : <PieChart name="Project distribution" rows={[{label:'Active',value:summary.active_projects||0},{label:'Completed',value:summary.completed_projects||0}]} />}</Panel>
    </div>
    <MonthlyChart rows={report.monthly||[]} />
    </div>
    <Panel title="Payment overview" description="Exact invoiced, received and outstanding totals." className="ra-wide"><div className="ra-finance">{[['Invoiced',summary.invoiced],['Received',summary.received],['Outstanding',summary.outstanding]].map(([label,value],index)=><div key={label}><span className="ra-dot" style={{background:colors[index]}} /><span>{label}</span><strong>{money(value)}</strong></div>)}</div></Panel>
  </div>;
}
