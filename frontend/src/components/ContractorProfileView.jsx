import React, { useMemo, useState, useRef, useEffect } from "react";
import { Paintbrush, House, Building2, Droplets, Hammer, CalendarDays, Images, Globe, MessageCircle, ContactRound, Download, X } from "lucide-react";
import "./ContractorProfileView.css";
import { profileImageStyle } from "../utils/profileImagePosition";

const DEFAULT_TABS = ["Overview", "Services", "Projects", "Reviews"];

const Icon = ({ type }) => {
  const paths = {
    back: (
      <>
        <path d="M15 18l-6-6 6-6" />
      </>
    ),
    share: (
      <>
        <circle cx="18" cy="5" r="2" />
        <circle cx="6" cy="12" r="2" />
        <circle cx="18" cy="19" r="2" />
        <path d="M8 11l8-5M8 13l8 5" />
      </>
    ),
    phone: (
      <path d="M6.6 10.8a15.6 15.6 0 006.6 6.6l2.2-2.2a1.5 1.5 0 011.5-.36c1.1.36 2.3.56 3.5.56a1.5 1.5 0 011.5 1.5v3.5a1.5 1.5 0 01-1.5 1.5C10.2 21.9 2.1 13.8 2.1 3.6A1.5 1.5 0 013.6 2.1h3.5a1.5 1.5 0 011.5 1.5c0 1.2.2 2.4.56 3.5a1.5 1.5 0 01-.36 1.5z" />
    ),
    message: (
      <>
        <path d="M21 15a4 4 0 01-4 4H8l-5 3V7a4 4 0 014-4h10a4 4 0 014 4z" />
        <path d="M8 10h.01M12 10h.01M16 10h.01" />
      </>
    ),
    quote: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </>
    ),
    location: (
      <>
        <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1116 0z" />
        <circle cx="12" cy="10" r="2.4" />
      </>
    ),
    experience: (
      <>
        <rect x="4" y="6" width="16" height="14" rx="2" />
        <path d="M9 6V4h6v2M4 11h16" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <circle cx="17" cy="9" r="2" />
        <path d="M3 20c.4-4 2.4-6 6-6s5.6 2 6 6M15 15c3 0 5 1.7 5.5 5" />
      </>
    ),
    projects: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 7h8M8 11h8M8 15h5" />
      </>
    ),
  };

  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="cp-icon"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[type]}
    </svg>
  );
};

const initials = (name = "") =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

export default function ContractorProfileView({
  profile,
  onBack,
  onShare,
  onCall,
  onSaveContact,
  onMessage,
  onRequestQuote,
  onEditProfile,
  onEditSocial,
  isOwnProfile = false,
  requestActionLabel = "Request Quote",
}) {
  const [tab, setTab] = useState("Overview");
  const [aboutExpanded, setAboutExpanded] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const profileRef = useRef(null);
  const downloadingRef = useRef(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadNotice, setDownloadNotice] = useState('');
  const [shareFile, setShareFile] = useState(null);
  useEffect(() => { setShareFile(null); }, [profile, tab, aboutExpanded]);

  async function downloadPng(shareImage = false) {
    if (!profileRef.current || downloadingRef.current) return;
    downloadingRef.current = true;
    setDownloading(true); setDownloadNotice('Preparing profile PNG…');
    try {
      const { toBlob } = await import('html-to-image');
      await document.fonts.ready;
      const node = profileRef.current;
      await Promise.all([...node.querySelectorAll('img')].map(image => image.decode()));
      const blob = await toBlob(node, {
        pixelRatio: 2,
        backgroundColor: getComputedStyle(node).backgroundColor,
        filter: element => !element.hasAttribute?.('data-png-exclude'),
      });
      if (!blob) throw new Error('Empty PNG');
      const filename = `${String(profile.name || 'contractor-profile').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80)}.png`;
      const file = new File([blob], filename, { type: 'image/png' });
      if (shareImage && navigator.canShare?.({ files: [file] })) {
        setShareFile(file);
        setDownloadNotice('Profile image ready. Tap Share PNG again to choose an app.');
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloadNotice(shareImage ? 'Image sharing is unavailable in this browser. PNG downloaded so you can share it manually.' : 'Profile PNG downloaded.');
    } catch {
      setDownloadNotice('Could not download the profile PNG. Check that profile images have loaded and try again.');
    } finally {
      downloadingRef.current = false; setDownloading(false);
    }
  }

  async function sharePng() {
    if (!shareFile) { await downloadPng(true); return; }
    try {
      await navigator.share({ files: [shareFile], title: profile.name || 'Contractor profile' });
      setDownloadNotice('Profile image shared.');
    } catch (error) {
      if (error.name !== 'AbortError') setDownloadNotice('Could not share the image. Try again or use Download PNG.');
    }
  }

  const services = profile?.services || [];
  const projects = profile?.projects || [];
  const serviceAreas = profile?.serviceAreas || [];
  const reviews = profile?.reviews || [];

  const hasStats = useMemo(
    () =>
      profile?.establishedYear ||
      profile?.teamSize ||
      profile?.projectsCompleted ||
      profile?.serviceAreaLabel,
    [profile]
  );

  if (!profile) {
    return (
      <div className="contractor-profile-shell">
        <div className="cp-empty">
          <h2>Contractor profile unavailable</h2>
          <p>We couldn't load this contractor profile.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="contractor-profile-shell">
      {downloadNotice && <p role="status" className="cp-download-status">{downloadNotice}</p>}
      <article ref={profileRef} className="contractor-profile">
        <header className="cp-topbar">
          <button className="cp-icon-button" onClick={onBack} aria-label="Back">
            <Icon type="back" />
          </button>

          <h1>Contractor Profile</h1>

          <div className="cp-topbar-actions">
          <button type="button" className="cp-icon-button" data-png-exclude onClick={() => downloadPng()} disabled={downloading} aria-label="Download profile as PNG" title={downloading ? 'Preparing PNG' : 'Download profile as PNG'}><Download className="cp-icon"/></button>
          <button type="button" className="cp-icon-button" data-png-exclude onClick={sharePng} disabled={downloading} aria-label="Share profile as PNG" title="Share PNG"><Images className="cp-icon"/></button>

          {onShare && <button
            className="cp-icon-button"
            onClick={onShare}
            aria-label="Share contractor profile"
            title="Share profile link"
          >
            <Icon type="share" />
          </button>}
          </div>
        </header>

        <section className="cp-hero">
          {profile.coverImage ? (
            <img
              src={profile.coverImage}
              alt=""
              className="cp-cover-image"
              style={profile.coverPosition ? profileImageStyle(profile.coverPosition) : undefined}
            />
          ) : (
            <div className="cp-cover-placeholder" />
          )}

          {profile.galleryCount > 1 && (
            <span className="cp-image-count">
              1/{profile.galleryCount}
            </span>
          )}
        </section>

        <section className="cp-identity">
          <div className="cp-avatar-row">
            <div className="cp-avatar" style={profile.avatarShape === 'rectangle' ? { borderRadius: 12 } : undefined}>
              {profile.avatar ? (
                <img src={profile.avatar} alt={profile.name} style={profile.avatarPosition ? profileImageStyle(profile.avatarPosition) : undefined} />
              ) : (
                <span>{initials(profile.name)}</span>
              )}
            </div>

            {profile.verified && (
              <span className="cp-verified">
                <span className="cp-check">✓</span>
                Verified
              </span>
            )}
            {isOwnProfile && <button className="cp-btn cp-btn-primary cp-edit-btn cp-edit-top" onClick={onEditProfile}>Edit Profile</button>}
          </div>

          <div className="cp-identity-content">
            <div className="cp-name-group">
              <h2>{profile.name}</h2>
            </div>
            {profile.contractorType && <p className="cp-category">{profile.contractorType}</p>}

            <div className="cp-meta-row">
              {profile.establishedYear != null && (
                <span className="cp-meta">
                  <Icon type="experience" />
                  Since {profile.establishedYear}
                </span>
              )}
            </div>

            {profile.location && (
              <div className="cp-location">
                <Icon type="location" />
                <span>{profile.location}</span>
              </div>
            )}

            {profile.availability && (
              <span className={`cp-availability ${profile.availabilityTone || ""}`}>
                {profile.availability}
              </span>
            )}
          </div>

          <div className="cp-profile-review-line" id="cp-profile-reviews">
            {profile.rating != null && Number.isFinite(Number(profile.rating)) && <span className="cp-profile-rating" aria-label={`Review rating ${profile.rating} out of 5`}>
              <span>Review Rating</span>
              <span className="cp-rating-stars" aria-hidden="true">{'\u2605'.repeat(Math.min(5, Math.max(0, Math.floor(Number(profile.rating))))) + '\u2606'.repeat(5 - Math.min(5, Math.max(0, Math.floor(Number(profile.rating)))))}</span>
              <strong>{profile.rating}/5</strong>
            </span>}
            <button type="button" className="cp-icon-button cp-gallery-placeholder" aria-label="Gallery (coming soon)" aria-disabled="true" title="Gallery (coming soon)"><Images className="cp-icon" /></button>
          </div>

          <ProfileSocialLinks links={profile.socialLinks || []} own={isOwnProfile} onEdit={onEditSocial}/>
          <div className="cp-actions cp-actions-icons">
            <button type="button" aria-label="Call" className="cp-btn cp-btn-primary" onClick={onCall} disabled={!onCall} title={onCall ? 'Call' : 'Public phone unavailable'}><Icon type="phone"/></button>
            <button type="button" aria-label="Message" className="cp-btn cp-btn-secondary" onClick={onMessage} disabled={!onMessage} title={onMessage ? 'Message' : 'Message is available to connected customers'}><Icon type="message"/></button>
            <button type="button" aria-label={requestActionLabel} className="cp-btn cp-btn-primary" onClick={onRequestQuote} disabled={!onRequestQuote} title={onRequestQuote ? requestActionLabel : 'Appointments are available to connected customers'}>{['Book Appointment', 'Appointments'].includes(requestActionLabel) ? <CalendarDays className="cp-icon"/> : <Icon type="quote"/>}</button>
            {onSaveContact && <button type="button" aria-label="Save contact" title="Save contact" className="cp-btn cp-btn-secondary" onClick={onSaveContact}><ContactRound className="cp-icon"/></button>}
          </div>

        </section>

        <nav className="cp-tabs" aria-label="Contractor profile sections">
          {DEFAULT_TABS.map((item) => (
            <button
              key={item}
              className={`cp-tab ${tab === item ? "active" : ""}`}
              onClick={() => setTab(item)}
            >
              {item}
            </button>
          ))}
        </nav>

        <main className="cp-content">
          {tab === "Overview" && (
            <>
              {profile.about && (
                <section className="cp-section">
                  <h3>About</h3>
                  <p className={aboutExpanded ? "" : "cp-about-collapsed"}>
                    {profile.about}
                  </p>

                  {profile.about.length > 150 && (
                    <button
                      className="cp-text-link"
                      onClick={() => setAboutExpanded((value) => !value)}
                    >
                      {aboutExpanded ? "Show less" : "Read more"}
                    </button>
                  )}
                </section>
              )}

              {hasStats && (
                <section className="cp-stats">
                  {profile.establishedYear != null && (
                    <div className="cp-stat">
                      <Icon type="experience" />
                      <strong>{profile.establishedYear}</strong>
                      <span>Established</span>
                    </div>
                  )}

                  {profile.teamSize != null && (
                    <div className="cp-stat">
                      <Icon type="users" />
                      <strong>{profile.teamSize}</strong>
                      <span>Team Members</span>
                    </div>
                  )}

                  {profile.projectsCompleted != null && (
                    <div className="cp-stat">
                      <Icon type="projects" />
                      <strong>{profile.projectsCompleted}+</strong>
                      <span>Projects Completed</span>
                    </div>
                  )}

                  {profile.serviceAreaLabel && (
                    <div className="cp-stat">
                      <Icon type="location" />
                      <strong>{profile.serviceAreaLabel}</strong>
                      <span>Service Area</span>
                    </div>
                  )}
                </section>
              )}

              <ProfileServices services={services} onViewAll={() => setTab("Services")} />
              {serviceAreas.length > 0 && <section className="cp-section cp-service-areas" aria-label="Service areas"><h3>Service areas</h3><div className="cp-area-chips">{serviceAreas.map(area => <span className="cp-area-chip" key={area}>{area}</span>)}</div></section>}

              <ProfileProjects projects={projects} onViewAll={() => setProjectsOpen(true)} />

              {profile.verifications?.length > 0 && (
                <section className="cp-section">
                  <h3>Trust & Verification</h3>

                  <div className="cp-verification-list">
                    {profile.verifications.map((item) => (
                      <div className="cp-verification-item" key={item}>
                        <span>✓</span>
                        {item}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {tab === "Services" && (
            <section className="cp-section">
              <h3>Services</h3>

              {services.length ? (
                <div className="cp-service-list">
                  {services.map((service) => (
                    <article className="cp-service-detail" key={service.id || service.name}>
                      <div className="cp-service-icon">
                        <ServiceIcon service={service} />
                      </div>

                      <div className="cp-service-detail-copy">
                        <strong>{service.name}</strong>

                        {service.description && <p>{service.description}</p>}

                        {service.price && (
                          <div className="cp-service-price">
                            {service.offerPrice && (
                              <span className="cp-old-price">
                                {service.price}
                              </span>
                            )}

                            <strong>{service.offerPrice || service.price}</strong>

                            {service.unit && <span>/ {service.unit}</span>}
                          </div>
                        )}
                      </div>

                      {!isOwnProfile && onRequestQuote && (
                        <button
                          className="cp-service-quote"
                          onClick={() => onRequestQuote?.(service)}
                        >
                          {requestActionLabel === 'Book Appointment' && <CalendarDays className="cp-icon" />}
                          {requestActionLabel}
                        </button>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState text="No services added yet." />
              )}
            </section>
          )}

          {tab === "Projects" && (
            <section className="cp-section">
              <h3>Projects</h3>

              {projects.length ? (
                <ProjectList projects={projects} />
              ) : (
                <EmptyState text="No completed projects added yet." />
              )}
            </section>
          )}


          {tab === "Reviews" && <ProfileReviews reviews={reviews} />}
        </main>
      </article>
      {projectsOpen && <ProjectsPopup projects={projects} onClose={() => setProjectsOpen(false)} />}
    </div>
  );
}

function ProfileReviews({ reviews }) {
  return <section className="cp-section">
    <h3>Customer Reviews</h3>
    {reviews.length ? <div className="cp-review-list">
      {reviews.map(review => <article className="cp-review-list-row" key={review.id}>
        <div className="cp-review-head"><strong>{review.customerName || 'Customer'}</strong><span>{'\u2605'} {review.rating}/5</span></div>
        {review.date && <small>{review.date}</small>}
        {review.text && <p>{review.text}</p>}
      </article>)}
    </div> : <EmptyState text="No reviews yet." />}
  </section>;
}

function ProfileServices({ services, onViewAll }) {
  if (!services.length) return null;

  return (
    <section className="cp-section">
      <div className="cp-section-heading">
        <h3>Services Offered</h3>
        <button className="cp-text-link" onClick={onViewAll}>
          View All
        </button>
      </div>

      <div className="cp-service-grid">
        {services.slice(0, 6).map((service) => (
          <button type="button" className="cp-service-card" key={service.id || service.name} onClick={onViewAll} aria-label={`View ${service.name} service details`}>
            <span className="cp-service-icon"><ServiceIcon service={service} /></span>
            <span>{service.name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ProfileProjects({ projects, onViewAll }) {
  if (!projects.length) return null;

  return (
    <section className="cp-section">
      <div className="cp-section-heading">
        <h3>Recent Projects</h3>
        <button className="cp-text-link" onClick={onViewAll}>
          View All
        </button>
      </div>

      <ProjectList projects={projects.slice(0, 4)} />
    </section>
  );
}

function ProjectList({ projects }) {
  const showAddress = projects.some(project => project.address);
  const showServices = projects.some(project => project.services);
  return <table className="cp-project-list" data-mobile-table="keep">
    <thead><tr><th scope="col">Building name</th>{showAddress && <th scope="col">Address</th>}{showServices && <th scope="col">Services</th>}</tr></thead>
    <tbody>{projects.map(project => <tr key={project.id || project.title}>
      <th scope="row">{project.buildingName || project.title}</th>
      {showAddress && <td>{project.address}</td>}
      {showServices && <td>{project.services}</td>}
    </tr>)}</tbody>
  </table>;
}

function EmptyState({ text }) {
  return <div className="cp-empty-inline">{text}</div>;
}

function ProjectsPopup({ projects, onClose }) {
  const ref = useRef(null);
  useEffect(() => { const dialog = ref.current; dialog.showModal(); return () => { if (dialog.open) dialog.close(); }; }, []);
  return <dialog ref={ref} className="cp-project-dialog" onCancel={onClose} aria-labelledby="cp-project-popup-title">
    <header><h2 id="cp-project-popup-title">Completed projects</h2><button type="button" className="cp-icon-button" onClick={onClose} aria-label="Close projects"><X size={20}/></button></header>
    <div><ProjectList projects={projects}/></div>
  </dialog>;
}

function SocialIcon({ kind }) {
  if (kind === 'whatsapp') return <MessageCircle className="cp-icon"/>;
  if (kind === 'google_business') return <Icon type="location"/>;
  if (kind === 'facebook') return <svg viewBox="0 0 24 24" className="cp-icon" aria-hidden="true"><path d="M14 22v-9h3l.5-4H14V7c0-1 .3-2 2-2h2V1h-3c-4 0-5 2.5-5 6v2H7v4h3v9z" fill="currentColor"/></svg>;
  if (kind === 'instagram') return <svg viewBox="0 0 24 24" className="cp-icon" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>;
  if (kind === 'pinterest') return <svg viewBox="0 0 24 24" className="cp-icon" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><path d="M9 20l3-13h3a3 3 0 010 6h-4"/></svg>;
  return <Globe className="cp-icon"/>;
}

function ServiceIcon({ service }) {
  const name = String(service.name || '').toLowerCase();
  const Glyph = /water|plumb/.test(name) ? Droplets : /wood|carpent/.test(name) ? Hammer : /exterior|building/.test(name) ? Building2 : /interior|home/.test(name) ? House : Paintbrush;
  return <Glyph className="cp-icon" />;
}

function ProfileSocialLinks({ links }) {
  const items = links.filter(link => link.url);
  if (!items.length) return null;
  return <div className="cp-social-links" aria-label="Social links">{items.map(link => <a key={`${link.key}-${link.url}`} href={link.url} aria-label={link.label} title={link.label} rel="noopener noreferrer">{link.icon ? <img src={link.icon} alt=""/> : <SocialIcon kind={link.key}/>}</a>)}</div>;
}
