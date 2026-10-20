import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/client';
import { ContractorContactLinks } from '../components/ContractorProfileDetails';
import { Paintbrush } from 'lucide-react';
import HiringWorkspaceNav from '../components/HiringWorkspaceNav';
import './contractor-network.css';

export default function PainterContactDetail() {
  const { id } = useParams();
  const [contact, setContact] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api.get(`/accounts/painter-contacts/${id}/`).then(({ data }) => { if (active) setContact(data); })
      .catch(() => { if (active) setError('Painter contact is unavailable or you do not have access.'); });
    return () => { active = false; };
  }, [id]);
  return <section className="contractor-network-page space-y-4 rounded-2xl border bg-white p-6">
    <HiringWorkspaceNav />
    <Link to="/painter-contacts" className="inline-block py-3 text-blue-700 underline">Back to Painters</Link>
    {error ? <p role="alert">{error}</p> : !contact ? <p role="status">Loading contact…</p> : <>
      <div className="network-profile-details" aria-label="Painter contact details">
        <div className="network-profile-identity"><div className="network-profile-avatar"><Paintbrush size={28} aria-hidden="true" /></div><div className="min-w-0"><h1 className="break-words text-2xl font-bold">{contact.name}</h1><p>Painter contact · Unverified</p></div></div>
        <ContractorContactLinks mobile={contact.mobile} />
        <dl className="network-profile-fields"><div><dt>Mobile Number</dt><dd>{contact.mobile}</dd></div><div><dt>Remarks</dt><dd className="whitespace-pre-wrap break-words">{contact.remarks || 'No remarks added.'}</dd></div></dl>
      </div>
    </>}
  </section>;
}
