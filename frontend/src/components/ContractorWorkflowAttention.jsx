import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarClock, CheckCircle2, Coins, FileText, Phone, ReceiptText } from 'lucide-react';
import api from '../api/client';
import { formatINRAmount } from '../types/financialDisplay.ts';
import { mergeAttentionRows } from '../utils/workflowAttention.js';
import { Button, EmptyState, SectionCard, StatCard } from './ui';

const stages = {
  PROPOSE_DATES: 'Propose work dates', CONFIRM_DATES: 'Await date confirmation',
  REQUEST_ADVANCE: 'Request kickoff advance', AWAITING_PAYMENT: 'Advance requested',
  CONFIRM_ADVANCE: 'Confirm advance receipt', REVIEW_ADVANCE: 'Review advance',
};
const definitions = [
  ['completed_projects', 'Completed projects awaiting invoice', '/quotations', FileText],
  ['kickoff', 'Kickoff queue', '/work-schedules', CalendarClock],
  ['subcontract_reviews', 'Subcontract work awaiting review', '/subcontract-work-orders', CheckCircle2],
  ['additional_work', 'Additional work awaiting decision', '/subcontract-work-orders', ReceiptText],
  ['calls', 'New enquiries and missed calls', '/call-inbox', Phone],
];

function queues(data = {}) {
  data = data || {};
  return {
    completed_projects: data.completed_projects || { count: 0, items: [] },
    kickoff: data.kickoff || { count: 0, items: [] },
    subcontract_reviews: { count: data.subcontracts?.review_count || 0, items: data.subcontracts?.reviews || [], has_more: data.subcontracts?.review_has_more },
    additional_work: { count: data.subcontracts?.additional_work_count || 0, items: data.subcontracts?.additional_work || [], has_more: data.subcontracts?.additional_work_has_more },
    calls: data.calls || { count: 0, items: [] },
  };
}

export default function ContractorWorkflowAttention({ attention, visible, children }) {
  const [lists, setLists] = useState(() => queues(attention));
  const [pages, setPages] = useState({});
  const [busy, setBusy] = useState('');
  const [failure, setFailure] = useState(null);
  const version = useRef(0);
  useEffect(() => {
    version.current += 1;
    setLists(queues(attention)); setPages({}); setBusy(''); setFailure(null);
    return () => { version.current += 1; };
  }, [attention]);

  async function more(key) {
    const current = version.current;
    const page = (pages[key] || 1) + 1;
    setBusy(key); setFailure(null);
    try {
      const { data } = await api.get('/quotations/contractor-crm/workflow-attention/', { params: { page } });
      if (current !== version.current) return;
      const next = queues(data)[key];
      setLists(previous => ({ ...previous, [key]: { ...next, items: mergeAttentionRows(previous[key].items, next.items) } }));
      setPages(previous => ({ ...previous, [key]: page }));
    } catch {
      if (current === version.current) setFailure({ key, message: 'More items could not be loaded. Please retry.' });
    } finally { if (current === version.current) setBusy(''); }
  }
  if (!attention) return children ? children({ balances: null, queues: null }) : null;
  const finance = attention.finance || {};
  const financeCards = [
    ['Outstanding invoices', finance.outstanding_total, 'All unpaid invoice balances', '/invoices?collections=outstanding', '/invoices'],
    ['Overdue collections', finance.overdue_total, `${finance.overdue_count || 0} overdue invoices; included in outstanding`, '/invoices?collections=overdue', '/invoices'],
    ['Advances awaiting payment', finance.pending_advance_total, 'Requested kickoff advances', '/work-schedules?queue=kickoff', '/work-schedules'],
    ['Advances awaiting confirmation', finance.pending_confirmation_total, 'Customer submitted; confirm receipt', '/work-schedules?queue=kickoff', '/work-schedules'],
  ].filter(card => visible(card[4]));
  const activeQueues = definitions.filter(([key, , route]) => visible(route) && lists[key].count > 0);
  const balances = financeCards.length > 0 ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Collection balances">
      {financeCards.map(([label, amount, hint, to]) => <Link key={label} to={to} className="contractor-stat-link" aria-label={`${label}: ${formatINRAmount(amount || '0')}. ${hint}`}><StatCard icon={Coins} label={label} value={formatINRAmount(amount || '0')} hint={hint} /></Link>)}
    </div> : null;
  const queueContent = <div className="contractor-workflow-queues" aria-label="Workflow actions">
    {activeQueues.map(([key, title, , Icon]) => {
      const queue = lists[key];
      return <SectionCard key={key} title={`${title} (${queue.count})`} className={`contractor-panel contractor-workflow-queue contractor-workflow-${key}`} bodyClassName="space-y-2">
        <ul className="space-y-2">
          {queue.items.map(row => <li key={row.key ?? row.id}>
            <Link to={row.url} className="flex min-h-11 min-w-0 items-center gap-3 rounded-xl border border-slate-200 p-3 hover:bg-slate-50">
              <Icon size={19} className="shrink-0 text-blue-700" aria-hidden="true" />
              <span className="min-w-0 flex-1"><strong className="block break-words text-sm">{row.customer_name || row.project_title || row.display_name || row.reference}</strong><span className="mt-1 block break-words text-xs text-slate-600">{row.property_name || row.description || row.phone_number || row.reference || row.number}</span><span className="mt-1 block text-xs font-semibold text-blue-800">{key === 'kickoff' ? stages[row.stage] || 'Review kickoff' : key === 'completed_projects' ? 'Prepare final invoice' : key === 'calls' ? 'Convert & book site visit' : key === 'additional_work' ? 'Review additional work' : 'Review submitted work'}</span></span>
              <span className="flex max-w-[40%] shrink-0 flex-col items-end gap-2 break-all text-right text-xs font-semibold tabular-nums">{(row.amount ?? row.estimated_amount) !== undefined && <span>{key === 'additional_work' ? 'Estimated ' : ''}{formatINRAmount(row.amount ?? row.estimated_amount)}</span>}<ArrowRight size={17} aria-hidden="true" /></span>
            </Link>
          </li>)}
        </ul>
        {failure?.key === key && <p role="alert" className="text-sm text-red-700">{failure.message}</p>}
        {queue.has_more && <Button variant="secondary" disabled={Boolean(busy)} onClick={() => more(key)}>{busy === key ? 'Loading...' : `Show more ${title.toLowerCase()}`}</Button>}
      </SectionCard>;
    })}
    {!activeQueues.length && <SectionCard title="Next steps" className="contractor-panel"><EmptyState title="No pending workflow actions" description="Completed projects, kickoff actions, subcontract reviews and new caller enquiries will appear here." /></SectionCard>}
  </div>;
  return children ? children({ balances, queues: queueContent }) : <section className="space-y-5" aria-label="Collections and workflow attention">{balances}{queueContent}</section>;
}
