import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, UserCheck } from 'lucide-react';
import api from '../api/client';

export default function RegisteredEmployeeSearch({ selected, onSelect, onClear }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    setResults([]); setError('');
    if (selected || query.trim().length < 3) { setLoading(false); return; }
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const { data } = await api.get('/jobs/in-house-applicators/registered-search/', { params: { search: query.trim() }, signal: controller.signal });
        if (!Array.isArray(data)) throw new Error('Search results could not be read. Please retry.');
        if (active) setResults(data);
      } catch (failure) {
        if (active && !controller.signal.aborted) setError(failure.response?.data?.detail || failure.message || 'Registered accounts could not be searched. Please retry.');
      } finally { if (active) setLoading(false); }
    }, 300);
    return () => { active = false; window.clearTimeout(timer); controller.abort(); };
  }, [query, selected, retry]);

  return <section className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4 sm:p-5" aria-label="Find an existing employee account">
    <h2 className="flex items-center gap-2 text-lg font-bold"><UserCheck size={20} aria-hidden="true" />Add a registered painter</h2>
    <p className="mt-2 text-sm leading-6 text-slate-600">Search an existing account, then fill in the remaining employment details. You can also enter a new employee below.</p>
    {selected ? <div className="mt-4 rounded-xl border border-emerald-200 bg-white p-4">
      <p role="status" className="text-sm font-semibold text-emerald-800">Registered account selected</p>
      <p className="mt-2 break-words font-semibold">{selected.name}</p><p className="break-words text-sm text-slate-600">{selected.mobile}{selected.bharath_id ? ` · ${selected.bharath_id}` : ''}</p>
      <p className="mt-2 text-sm text-slate-600">Their existing login and profile are preserved. Complete the remaining employment details below.</p>
      <button type="button" onClick={() => { setQuery(''); onClear(); }} className="mt-3 min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold bp-ui-action">Choose another or enter a new employee</button>
    </div> : <>
      <label className="mt-4 block text-sm font-semibold">Search registered painter
        <div className="relative mt-2"><Search size={18} className="pointer-events-none absolute left-3 top-3.5 text-slate-500" aria-hidden="true" /><input className="bp-ui-control w-full pl-10 text-sm placeholder:text-xs" type="search" maxLength={80} value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, mobile or ID" aria-describedby="employee-search-help" /></div>
      </label>
      <p id="employee-search-help" className="mt-2 text-xs text-slate-600">Enter at least 3 characters. Only active, verified accounts with completed registration are shown.</p>
      {loading && <p role="status" className="mt-3 text-sm">Searching registered painters...</p>}
      {error && <div className="mt-3"><p role="alert" className="text-sm text-red-800">{error}</p><button type="button" onClick={() => setRetry(value => value + 1)} className="mt-2 min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold bp-ui-action">Retry search</button></div>}
      {!loading && !error && query.trim().length >= 3 && !results.length && <p role="status" className="mt-3 text-sm text-slate-600">No registered painters match this search. Try another name or number, or enter a new employee below.</p>}
      {!!results.length && <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto" aria-label="Registered painter search results">
        {results.map(painter => <li key={painter.id} className="rounded-xl border border-slate-200 bg-white p-3">
          {painter.employee_membership_id ? <div><p className="break-words font-semibold">{painter.name}</p><p className="break-words text-sm text-slate-600">{painter.mobile} · Already in your workforce</p><Link to={`/in-house-applicators/${painter.employee_membership_id}`} className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-blue-800" aria-label={`View employee ${painter.name}`}>View employee</Link></div>
            : <button type="button" onClick={() => onSelect(painter)} aria-label={`Select registered painter ${painter.name}`} className="flex min-h-11 w-full flex-col gap-1 rounded-lg px-1 py-2 text-left bp-ui-action"><span className="break-words font-semibold">{painter.name}</span><span className="break-words text-sm text-slate-600">{painter.mobile}{painter.bharath_id ? ` · ${painter.bharath_id}` : ''}</span><span className="text-xs font-semibold text-emerald-800">Registered · Select account</span></button>}
        </li>)}
      </ul>}
    </>}
  </section>;
}
