import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import api from '../api/client';
import ContractorProfileAdapter from './ContractorProfileAdapter';
import './ContractorProfileView.css';

export default function ContractorProfilePreviewModal({ onClose }) {
  const ref = useRef(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { const dialog = ref.current; dialog.showModal(); return () => { if (dialog.open) dialog.close(); }; }, []);
  useEffect(() => {
    let active = true;
    setError('');
    api.get('/accounts/profile-card/').then(response => { if (active) setData(response.data); })
      .catch(() => { if (active) setError('Your profile could not be loaded.'); });
    return () => { active = false; };
  }, [attempt]);
  return <dialog ref={ref} className="cp-project-dialog cp-profile-preview-dialog" onCancel={onClose} aria-label="Profile preview">
    <header><h2>Profile preview</h2><button type="button" className="cp-icon-button" onClick={onClose} aria-label="Close profile preview"><X size={20}/></button></header>
    {error ? <p role="alert" className="p-4">{error} <button type="button" className="min-h-11 px-3 underline" onClick={() => setAttempt(value => value + 1)}>Retry</button></p> : data ? <ContractorProfileAdapter data={data} own onBack={onClose} onEditProfile={onClose}/> : <p role="status" className="p-4">Loading profile…</p>}
  </dialog>;
}
