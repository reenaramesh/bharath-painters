import { useEffect, useRef, useState } from 'react';
import { Copy, KeyRound, MessageCircle, RefreshCw, UserCheck, UserRoundX } from 'lucide-react';
import api from '../api/client';
import { Dialog } from './ui/Dialog';
import { employeeRegistration } from '../utils/employeeAccount';
import { whatsappNumber } from '../utils/welcomeMessages';

export function EmployeeRegistrationBadge({ employee, compact = false }) {
  const registration = employeeRegistration(employee);
  if (!registration) return null;
  const Icon = registration.registered ? UserCheck : UserRoundX;
  if (compact) return <span role="img" aria-label={registration.label} title={registration.label} className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${registration.registered ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}><Icon size={17} aria-hidden="true" /></span>;
  return <span className={`inline-flex w-fit rounded-full px-3 py-1.5 text-xs font-semibold ${registration.registered ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{registration.label}</span>;
}

export default function EmployeeActivationAction({ employee, onUpdated, compact = false }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const requestSequence = useRef(0);
  useEffect(() => () => { requestSequence.current += 1; }, []);

  async function issueLink() {
    const sequence = ++requestSequence.current;
    setOpen(true); setLoading(true); setError(''); setUrl(''); setCopied(false);
    try {
      const { data } = await api.post(`/jobs/in-house-applicators/${employee.membership_id}/activation-link/`);
      if (!data.activation_url) throw new Error('The activation link was not returned. Please retry.');
      if (sequence === requestSequence.current) setUrl(data.activation_url);
    } catch (failure) {
      if (sequence === requestSequence.current) setError(failure.response?.data?.detail || failure.message || 'Activation link could not be prepared. Please retry.');
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }
  function close() {
    requestSequence.current += 1;
    setOpen(false); setLoading(false);
    onUpdated?.();
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setError(''); }
    catch { setError('Copy failed. Select and copy the activation link above.'); }
  }
  if (!employeeRegistration(employee)?.canResend) return null;

  return <>
    <button type="button" onClick={() => { if (!loading) issueLink(); }} aria-label={compact ? `Resend activation link for ${employee.name}` : undefined} title={compact ? 'Resend activation link' : undefined} aria-busy={loading} className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 text-sm font-semibold text-amber-900 bp-ui-action ${compact ? 'w-11 rounded-full p-0' : 'rounded-xl border border-amber-200 bg-amber-50 px-3 py-2'}`}><span className={compact ? 'inline-flex h-8 w-8 items-center justify-center rounded-full border border-amber-200 bg-amber-50' : 'inline-flex'}><KeyRound size={16} aria-hidden="true" /></span>{!compact && (loading ? 'Preparing link...' : 'Resend activation link')}</button>
    {open && <Dialog title="Employee activation link" description={employee.name} icon={KeyRound} onClose={close} className="employee-activation-dialog">
      <p className="text-sm leading-6 text-slate-600">Share this private link directly with the employee so they can set their own password. It expires in 7 days and stops working after registration.</p>
      {loading && <p role="status" className="mt-4 text-sm">Preparing activation link...</p>}
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {url && <label className="mt-4 block text-sm font-semibold">Activation link<input readOnly value={url} onFocus={event => event.target.select()} className="bp-ui-control mt-2 w-full rounded-xl border px-3 py-3 text-sm font-normal" /></label>}
      {url && <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={copyLink} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold bp-ui-action"><Copy size={16} aria-hidden="true" />{copied ? 'Copied' : 'Copy link'}</button>
        <a href={`https://wa.me/${whatsappNumber(employee.mobile)}?text=${encodeURIComponent(`Hi ${employee.name}, set your Bharath Apps employee password using this private link: ${url}`)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white"><MessageCircle size={16} aria-hidden="true" />Share on WhatsApp</a>
      </div>}
      {copied && <p role="status" className="mt-3 text-sm text-emerald-800">Activation link copied.</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-3">
        <button type="button" disabled={loading} onClick={issueLink} className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold disabled:opacity-50 bp-ui-action"><RefreshCw size={16} aria-hidden="true" />{error && !url ? 'Retry' : 'Generate new link'}</button>
        <button type="button" onClick={close} className="min-h-11 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white bp-ui-action">Done</button>
      </div>
    </Dialog>}
  </>;
}
