import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import api from '../api/client';
import { Button, SectionCard } from './ui';
import { monthlyCollections } from '../utils/monthlyCollections.js';
import { formatINRAmount } from '../types/financialDisplay.ts';
import './dashboard-revenue-chart.css';

// The existing revenue endpoint serializes Decimal totals as JSON numbers.
const money=value=>formatINRAmount(value == null ? null : String(value)) ?? '—';

export default function DashboardRevenueChart({ refreshKey }) {
  const year=new Date().getFullYear();
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(false);
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    let current=true;
    setLoading(true);setError(false);
    api.get('/billing/contractor-revenue/',{params:{year}}).then(response=>{
      if(current) setData(response.data);
    }).catch(()=>{if(current)setError(true);}).finally(()=>{if(current)setLoading(false);});
    return ()=>{current=false;};
  },[year,refreshKey,retry]);
  const bars=monthlyCollections(data?.receipts,year);
  return <SectionCard title="Revenue & payments" className="contractor-panel dashboard-revenue-card" bodyClassName="dashboard-revenue-body" action={<Link className="contractor-panel-link" to="/contractor-revenue?register=collected">Payment register<ArrowRight size={14} aria-hidden="true" /></Link>}>
    {loading && !data ? <p role="status">Loading collections…</p> : <>
      {error && <div role="alert" className="dashboard-revenue-error"><p>{data ? 'Could not refresh collections. Showing the last loaded totals.' : 'Collections could not be loaded.'}</p><Button variant="secondary" disabled={loading} onClick={()=>setRetry(value=>value+1)}>Retry</Button></div>}
      {data && <>
        <p className="dashboard-revenue-caption">Collected in {year}</p>
        <strong className="dashboard-revenue-total">{money(data.total_collected)}</strong>
        <p className="dashboard-revenue-breakdown">{money(data.advance_received)} in advances · {money(data.invoice_payments)} against invoices</p>
        <div className="dashboard-revenue-bars" role="list" aria-label={`Monthly collections in ${year}`}>
          {bars.map(bar=><div role="listitem" className="dashboard-revenue-month" key={bar.month} tabIndex={0} aria-label={`${bar.label}: ₹${bar.amount}`} title={`${bar.label}: ₹${bar.amount}`}><div className="dashboard-revenue-track" aria-hidden="true"><span style={{height:`${bar.height}%`}} /></div><span aria-hidden="true">{bar.label}</span><span className="dashboard-revenue-tooltip" aria-hidden="true">₹{bar.amount}</span></div>)}
        </div>
        {bars.every(bar=>bar.height===0) && <p className="dashboard-revenue-caption">No collections recorded this year.</p>}
      </>}
    </>}
  </SectionCard>;
}
