import { useEffect, useState } from 'react';
import { MapPin, Plus } from 'lucide-react';
import { getLocationEngine } from '../utils/indiaLocation';

export default function ServiceLocationLookup({ onAdd }) {
  const [query, setQuery] = useState('');
  const [choices, setChoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setChoices([]); setError(''); setLoading(false);
    const value = query.trim();
    if (value.length < 3 || (/^\d+$/.test(value) && value.length !== 6)) return;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const engine = await getLocationEngine();
        const result = /^[1-9]\d{5}$/.test(value) ? engine.getByPincode(value) : engine.search(value, { limit: 20 });
        const rows = result.success ? result.data.data : [];
        if (active) { setChoices([...new Map(rows.map(row => [`${row.area}:${row.district}:${row.pincode}`, row])).values()]); if (!rows.length) setError('No matching locations. Try another PIN or a more specific area.'); }
      } catch { if (active) setError('Location lookup is unavailable. Retry or enter coverage areas manually below.'); }
      finally { if (active) setLoading(false); }
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [query, attempt]);
  return <div className="msp-location-lookup">
    <label><span>Find service location by PIN or name</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') event.preventDefault(); }} placeholder="Enter a six-digit PIN or area name" /></label>
    {loading && <p role="status">Finding locations…</p>}
    {error && <p role="status">{error} <button type="button" className="msp-secondary" onClick={() => setAttempt(value => value + 1)}>Retry</button></p>}
    {choices.length > 0 && <div className="msp-location-results" aria-label="Matching service locations">{choices.map(row => <button type="button" key={`${row.area}:${row.district}:${row.pincode}`} onClick={() => onAdd(row)}><MapPin size={16}/><span><strong>{row.area}</strong><small>{row.district}, {row.state} · PIN {row.pincode}</small></span><Plus size={16}/></button>)}</div>}
  </div>;
}
