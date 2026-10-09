import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuth from '../context/useAuth';
import ContractorProfileView from './ContractorProfileView';
import { loadContractorPublicProfile } from '../utils/contractorPublicProfile';
import { mapContractorProfile } from '../utils/contractorProfileMapping';
import { API_BASE_URL } from '../api/client';

export default function ContractorProfileAdapter({ profile, data: suppliedData, own = false, contextActions = {}, onBack, onEditProfile }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true;
    setData(null); setError('');
    if (!suppliedData && profile?.bharath_id) {
      loadContractorPublicProfile(profile.bharath_id).then(value => { if (active) setData(value); })
        .catch(() => { if (active) setError('The full profile could not be loaded. Available details are shown.'); });
    }
    return () => { active = false; };
  }, [suppliedData, profile?.bharath_id, retry]);
  const resolved = suppliedData || data;
  if (!resolved && (!profile || (!error && profile.bharath_id))) return <ContractorProfileSkeleton />;
  const isOwnProfile = user?.role === 'CONTRACTOR' && (
    (own && !!suppliedData) ||
    (profile?.id != null && String(profile.id) === String(user.id)) ||
    (resolved?.digital_card?.bharath_id && resolved.digital_card.bharath_id === user.bharath_id)
  );
  const presentation = mapContractorProfile(resolved, profile, { isOwnProfile });
  const card = resolved?.digital_card;
  const phone = String(card?.mobile || profile?.mobile || '').replace(/[^+\d]/g, '');
  const publicPath = resolved?.profile_url || (profile?.bharath_id
    ? `${API_BASE_URL.replace(/\/$/, '')}/accounts/verify-page/${encodeURIComponent(profile.bharath_id)}/` : null);
  const publicUrl = publicPath ? new URL(publicPath, window.location.origin).href : null;
  function saveContact() {
    const escape = value => String(value || '').replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
    const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${escape(presentation.name)}`, `TEL;TYPE=WORK,VOICE:${phone}`];
    if (publicUrl) lines.push(`URL:${escape(publicUrl)}`);
    lines.push('END:VCARD');
    const url = URL.createObjectURL(new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/vcard;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'contractor-contact.vcf';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: presentation.name, url: publicUrl });
      else { await navigator.clipboard.writeText(publicUrl); setNotice('Profile link copied.'); }
    } catch (err) { if (err.name !== 'AbortError') setNotice('The profile link could not be shared. Try again.'); }
  }
  const requestHref = contextActions.assignHref || contextActions.quoteHref;
  return <>
    {error && <p role="status">{error} <button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button></p>}
    <ContractorProfileView profile={presentation} isOwnProfile={isOwnProfile}
      onBack={onBack || (() => window.history.state?.idx > 0 ? navigate(-1) : navigate(user?.role === 'CUSTOMER' ? '/customer-dashboard' : '/contractor-network'))}
      onShare={publicUrl ? share : undefined}
      onCall={phone ? () => { window.location.href = `tel:${phone}`; } : undefined}
      onSaveContact={phone ? saveContact : undefined}
      onMessage={isOwnProfile ? () => navigate('/messages') : contextActions.onMessage ? () => { if (!contextActions.busy) contextActions.onMessage(); } : undefined}
      onRequestQuote={isOwnProfile ? () => navigate('/service-requests') : requestHref ? service => {
        const target = new URL(requestHref, window.location.origin);
        if (contextActions.quoteHref) target.searchParams.set('appointment', '1');
        if (service?.name) target.searchParams.set('service', service.name);
        navigate(`${target.pathname}${target.search}`);
      } : undefined}
      requestActionLabel={isOwnProfile ? 'Appointments' : contextActions.assignHref ? 'Assign Work' : 'Book Appointment'}
      onEditProfile={onEditProfile || (() => navigate('/settings'))}
      onEditSocial={key => {
        if (onEditProfile) onEditProfile();
        const field = {facebook:'facebook_url',instagram:'instagram_url',pinterest:'pinterest_url',google_business:'google_business_url',whatsapp:'whatsapp_number'}[key] || key;
        navigate(`/settings?tab=business&social=${encodeURIComponent(field)}#social-links`);
      }}
    />
    {notice && <p role="status">{notice}</p>}
  </>;
}

export function ContractorProfileSkeleton() {
  return <div className="contractor-profile-shell" role="status"><div className="cp-empty">Loading contractor profile…</div></div>;
}
