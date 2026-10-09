import { Building2, MapPin, Phone, MessageCircle } from 'lucide-react';

export function ContractorContactLinks({ mobile }) {
  const digits = String(mobile || '').replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return <span className="text-xs text-slate-500">Phone not provided</span>;
  const international = digits.length === 10 ? `91${digits}` : digits;
  return <div className="network-contact-links">
    <a href={`tel:+${international}`} aria-label={`Call ${mobile}`}><Phone size={16} /> Call</a>
    <a href={`https://wa.me/${international}`} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${mobile}`}><MessageCircle size={16} /> WhatsApp</a>
  </div>;
}

export default function ContractorProfileDetails({ profile, label, stats }) {
  const work = [...(profile?.services || []), profile?.work_skills].filter(Boolean).join(', ');
  return <section className="network-profile-details" aria-label="Contractor work details">
    <div className="network-profile-identity">
      <div className="network-profile-avatar">{profile?.company_logo || profile?.profile_photo ? <img src={profile.company_logo || profile.profile_photo} alt="" /> : <Building2 size={28} />}</div>
      <div className="min-w-0"><h3>{profile?.company_name || label || 'Contractor'}</h3><p>{profile?.owner_name}</p>{profile?.bharath_id && <p className="text-xs">{profile.bharath_id}</p>}</div>
    </div>
    <ContractorContactLinks mobile={profile?.mobile} />
    {stats && <dl className="network-project-counts"><div><dt>Completed</dt><dd>{stats.completed ?? '—'}</dd></div><div><dt>Active projects</dt><dd>{stats.active ?? '—'}</dd></div><p>Projects together</p></dl>}
    <dl className="network-profile-fields">
      <div><dt>What they do</dt><dd>{work || 'Work details not provided.'}</dd></div>
      <div><dt><MapPin size={16} /> Where they work</dt><dd>{profile?.service_areas || profile?.base_location || 'Service areas not provided.'}</dd></div>
      <div><dt>Office / base location</dt><dd>{profile?.office_address || profile?.base_location || 'Office location not provided.'}</dd></div>
      <div><dt>Experience &amp; team</dt><dd>{profile?.years_in_business ? `${profile.years_in_business} years in business` : 'Experience not provided'}{profile?.number_of_painters ? ` · ${profile.number_of_painters} painters` : ''}</dd></div>
    </dl>
  </section>;
}
