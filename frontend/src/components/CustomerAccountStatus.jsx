import { StatusBadge } from './ui';
import { customerAccountStatus } from '../utils/customerActivation';

export default function CustomerAccountStatus({ customer, compact = false }) {
  const state = customerAccountStatus(customer);
  if (!state) return null;
  if (compact) {
    if (state.canResend) return null;
    const disabled = state.tone === 'danger';
    return <span className={`crm-customer-activation-action inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap text-[11px] font-medium ${disabled ? 'text-red-700' : 'text-emerald-700'}`} data-customer-account-status title={[state.label, state.activity].filter(Boolean).join(' · ')}>
      <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full border-2 ring-2 ring-offset-1 ${disabled ? 'border-red-600 bg-red-600 ring-red-100' : 'border-emerald-600 bg-emerald-600 ring-emerald-100'}`} />
      {disabled ? 'Disabled' : 'Active'}
      {state.activity && <span className="sr-only">{state.activity}</span>}
    </span>;
  }
  return <div className="mt-2 flex flex-wrap items-center gap-2" data-customer-account-status title={[state.label, state.activity].filter(Boolean).join(' · ')}>
    <StatusBadge label={state.label} tone={state.tone} className="crm-compact-badge" />
    {state.activity && <span className="text-[11px] text-slate-500">{state.activity}</span>}
  </div>;
}
