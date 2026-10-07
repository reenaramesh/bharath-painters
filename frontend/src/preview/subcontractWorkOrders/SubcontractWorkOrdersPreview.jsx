import { useMemo, useState } from "react";
import {
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  Crosshair,
  Clock3,
  Filter,
  MapPin,
  LocateFixed,
  Search,
  SlidersHorizontal,
  UsersRound,
  X,
} from "lucide-react";
import "./subcontract-work-orders-preview.css";

const SAMPLE_CONTRACTORS = [
  {
    id: 1,
    company_name: "Greenline Contractors",
    owner_name: "Ravi Kumar",
    bharath_id: "BP-2048",
    service_areas: "Whitefield, Marathahalli, Varthur",
    office_address: "Whitefield, Bengaluru",
    years_in_business: 8,
    number_of_painters: 12,
    pin_code: "560066",
    services: ["Interior painting", "Exterior painting", "Waterproofing"],
    initials: "GC",
    color: "teal",
  },
  {
    id: 2,
    company_name: "CityCoat Painters",
    owner_name: "Ananya Rao",
    bharath_id: "BP-3172",
    service_areas: "Jayanagar, JP Nagar, Banashankari",
    office_address: "Jayanagar, Bengaluru",
    years_in_business: 5,
    number_of_painters: 6,
    pin_code: "560041",
    services: ["Interior painting", "Texture & design", "Wood finishing"],
    initials: "CC",
    color: "blue",
  },
  {
    id: 3,
    company_name: "Everest Paint & Care",
    owner_name: "Mohammed Irfan",
    bharath_id: "BP-1259",
    service_areas: "Electronic City, Bommanahalli, HSR Layout",
    office_address: "Electronic City, Bengaluru",
    years_in_business: 11,
    number_of_painters: 18,
    pin_code: "560100",
    services: ["Exterior painting", "Waterproofing", "Commercial projects"],
    initials: "EP",
    color: "orange",
  },
  {
    id: 4,
    company_name: "Northstar Finishes",
    owner_name: "Kavya Shetty",
    bharath_id: "BP-4091",
    service_areas: "Yelahanka, Hebbal, Sahakara Nagar",
    office_address: "Yelahanka, Bengaluru",
    years_in_business: 4,
    number_of_painters: 5,
    pin_code: "560064",
    services: ["Interior painting", "Wood finishing"],
    initials: "NF",
    color: "purple",
  },
];

const SERVICE_OPTIONS = [
  "Interior painting",
  "Exterior painting",
  "Waterproofing",
  "Texture & design",
  "Wood finishing",
  "Commercial projects",
];

// Neighborhood-level coordinates for the fictional Bengaluru preview dataset.
// Production distance search should use a trusted PIN-code geocoding source.
const DEMO_PIN_COORDINATES = {
  "560001": [12.9766, 77.5993],
  "560066": [12.9698, 77.75],
  "560041": [12.925, 77.5838],
  "560100": [12.8399, 77.677],
  "560064": [13.1007, 77.5963],
};

function distanceBetweenPins(firstPin, secondPin) {
  const first = DEMO_PIN_COORDINATES[firstPin];
  const second = DEMO_PIN_COORDINATES[secondPin];
  if (!first || !second) return null;
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const [lat1, lon1] = first.map(radians);
  const [lat2, lon2] = second.map(radians);
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export default function SubcontractWorkOrdersPreview() {
  const [search, setSearch] = useState("");
  const [selectedServices, setSelectedServices] = useState([]);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [nearbyOpen, setNearbyOpen] = useState(false);
  const [pinCode, setPinCode] = useState("560001");
  const [radiusKm, setRadiusKm] = useState(25);
  const [nearbyApplied, setNearbyApplied] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [selected, setSelected] = useState(null);
  const [requested, setRequested] = useState([]);
  const [locationsOpen, setLocationsOpen] = useState(null);
  const [notice, setNotice] = useState("");

  const visibleContractors = useMemo(() => {
    const query = search.trim().toLowerCase();
    return SAMPLE_CONTRACTORS.filter((contractor) => {
      const matchesQuery = !query || [
        contractor.company_name,
        contractor.owner_name,
        contractor.bharath_id,
        contractor.service_areas,
      ].some((value) => value.toLowerCase().includes(query));
      const matchesService = selectedServices.length === 0 || selectedServices.some((service) => contractor.services.includes(service));
      const distance = nearbyApplied ? distanceBetweenPins(pinCode, contractor.pin_code) : null;
      const matchesDistance = !nearbyApplied || (distance !== null && distance <= radiusKm);
      return matchesQuery && matchesService && matchesDistance;
    });
  }, [nearbyApplied, pinCode, radiusKm, search, selectedServices]);

  const toggleService = (service) => {
    setSelectedServices((current) => current.includes(service)
      ? current.filter((item) => item !== service)
      : [...current, service]);
  };

  const applyNearby = () => {
    if (!/^\d{6}$/.test(pinCode)) {
      setLocationError("Enter a valid 6-digit PIN code.");
      return;
    }
    if (!DEMO_PIN_COORDINATES[pinCode]) {
      setLocationError("For this preview, try PIN 560001, 560066, 560041, 560100 or 560064.");
      return;
    }
    setLocationError("");
    setNearbyApplied(true);
    setNearbyOpen(false);
  };

  const useDemoLocation = () => {
    setPinCode("560001");
    setLocationError("");
    setNearbyApplied(true);
    setNearbyOpen(false);
  };

  const clearFilters = () => {
    setSearch("");
    setSelectedServices([]);
    setNearbyApplied(false);
    setLocationError("");
  };

  const requestConnection = (contractor) => {
    setRequested((current) => current.includes(contractor.id) ? current : [...current, contractor.id]);
    setNotice(`Connection request previewed for ${contractor.company_name}. No request was sent.`);
    setSelected(null);
  };

  return (
    <main className="swo-preview">
      <div className="swo-preview__topbar">
        <a className="swo-preview__brand" href="/dashboard" onClick={(event) => event.preventDefault()}>
          <span className="swo-preview__brand-mark"><BriefcaseBusiness size={19} /></span>
          <span><strong>Bharath Apps</strong><small>Contractor workspace</small></span>
        </a>
        <span className="swo-preview__preview-pill"><span /> Design preview · Sample profiles</span>
      </div>

      <div className="swo-preview__content">
        <a href="/dashboard" onClick={(event) => event.preventDefault()} className="swo-preview__back">
          <ArrowLeft size={16} /> Workspace
        </a>

        <header className="swo-preview__hero">
          <div>
            <p className="swo-preview__eyebrow">OUTSOURCING · WORK ORDERS</p>
            <h1>Find the right contractor for your next project.</h1>
            <p className="swo-preview__intro">
              Explore verified professionals, check where they work, and build trusted partnerships before sharing a job.
            </p>
          </div>
          <div className="swo-preview__hero-art" aria-hidden="true">
            <span className="swo-preview__art-orbit swo-preview__art-orbit--one" />
            <span className="swo-preview__art-orbit swo-preview__art-orbit--two" />
            <span className="swo-preview__art-icon"><Building2 size={34} /></span>
            <span className="swo-preview__art-dot swo-preview__art-dot--one"><Check size={13} /></span>
            <span className="swo-preview__art-dot swo-preview__art-dot--two"><UsersRound size={15} /></span>
          </div>
        </header>

        <section className="swo-preview__section" aria-labelledby="swo-directory-title">
          <div className="swo-preview__section-heading">
            <div>
              <p className="swo-preview__section-kicker">YOUR CONTRACTOR NETWORK</p>
              <h2 id="swo-directory-title">Find your project partner</h2>
              <p>Filter by the work you need and find verified partners near your project PIN.</p>
            </div>
            <button type="button" className="swo-preview__sort" onClick={() => setNotice("Contractors are shown alphabetically in this preview.")}>
              <ArrowDownUp size={15} /> A–Z <ChevronDown size={14} />
            </button>
          </div>

          <div className="swo-preview__filters">
            <label className="swo-preview__search">
              <Search size={18} aria-hidden="true" />
              <span className="swo-preview__visually-hidden">Search contractors</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Company, owner, Bharath ID or area" />
              {search && <button type="button" aria-label="Clear search" onClick={() => setSearch("")}><X size={15} /></button>}
            </label>
            <div className="swo-preview__filter-wrap">
              <button type="button" className={`swo-preview__filter-button ${selectedServices.length ? "is-active" : ""}`} aria-expanded={servicesOpen} onClick={() => { setServicesOpen((value) => !value); setNearbyOpen(false); }}>
                <SlidersHorizontal size={16} /> Services {selectedServices.length > 0 && <span className="swo-preview__filter-count">{selectedServices.length}</span>} <ChevronDown size={14} />
              </button>
              {servicesOpen && <div className="swo-preview__popover swo-preview__services-popover">
                <div className="swo-preview__popover-heading"><strong>Filter by service</strong><button type="button" onClick={() => setServicesOpen(false)} aria-label="Close service filters"><X size={15} /></button></div>
                {SERVICE_OPTIONS.map((service) => <label className="swo-preview__service-option" key={service}><input type="checkbox" checked={selectedServices.includes(service)} onChange={() => toggleService(service)} /><span>{service}</span></label>)}
                <div className="swo-preview__popover-footer"><span>{selectedServices.length ? `${selectedServices.length} selected` : "Any service"}<button type="button" className="swo-preview__popover-clear" onClick={() => setSelectedServices([])}>Clear</button></span><button type="button" onClick={() => setServicesOpen(false)}>Done</button></div>
              </div>}
            </div>
            <div className="swo-preview__filter-wrap">
              <button type="button" className={`swo-preview__filter-button ${nearbyApplied ? "is-active" : ""}`} aria-expanded={nearbyOpen} onClick={() => { setNearbyOpen((value) => !value); setServicesOpen(false); }}>
                <MapPin size={16} /> {nearbyApplied ? `${radiusKm} km · ${pinCode}` : "Nearby"} <ChevronDown size={14} />
              </button>
              {nearbyOpen && <div className="swo-preview__popover swo-preview__nearby-popover">
                <div className="swo-preview__popover-heading"><strong>Search around a PIN</strong><button type="button" onClick={() => setNearbyOpen(false)} aria-label="Close nearby filter"><X size={15} /></button></div>
                <label className="swo-preview__pin-field"><span>Project PIN code</span><div><MapPin size={15} /><input inputMode="numeric" maxLength={6} value={pinCode} onChange={(event) => { setPinCode(event.target.value.replace(/\D/g, "")); setLocationError(""); }} placeholder="e.g. 560001" /></div></label>
                <button type="button" className="swo-preview__use-location" onClick={useDemoLocation}><LocateFixed size={15} /> Use my location <small>Demo</small></button>
                <label className="swo-preview__radius"><span><span>Search radius</span><strong>{radiusKm} km</strong></span><input type="range" min="1" max="100" value={radiusKm} onChange={(event) => setRadiusKm(Number(event.target.value))} style={{ "--swo-range-progress": `${((radiusKm - 1) / 99) * 100}%` }} /><span className="swo-preview__range-labels"><span>1 km</span><span>100 km</span></span></label>
                {locationError && <p className="swo-preview__location-error" role="alert">{locationError}</p>}
                <button type="button" className="swo-preview__apply-nearby" onClick={applyNearby}><Crosshair size={15} /> Show contractors nearby</button>
              </div>}
            </div>
            {nearbyApplied && <button type="button" className="swo-preview__clear-nearby" onClick={() => setNearbyApplied(false)} aria-label="Clear nearby filter"><X size={14} /> Clear location</button>}
          </div>

          <div className="swo-preview__result-count">
            <span>{visibleContractors.length} contractors</span>
            <span>{nearbyApplied ? `Within ${radiusKm} km of ${pinCode}` : "Verified business profiles"}</span>
          </div>

          {selectedServices.length > 0 && <div className="swo-preview__active-filters">{selectedServices.map((service) => <button type="button" key={service} onClick={() => toggleService(service)}>{service}<X size={13} /></button>)}<button type="button" className="swo-preview__clear-services" onClick={() => setSelectedServices([])}>Clear services</button></div>}

          {visibleContractors.length ? (
            <div className="swo-preview__grid">
              {visibleContractors.map((contractor) => (
                <ContractorCard
                  key={contractor.id}
                  contractor={contractor}
                  requested={requested.includes(contractor.id)}
                  locationsOpen={locationsOpen}
                  setLocationsOpen={setLocationsOpen}
                  distance={nearbyApplied ? distanceBetweenPins(pinCode, contractor.pin_code) : null}
                  onView={() => setSelected(contractor)}
                  onRequest={() => requestConnection(contractor)}
                />
              ))}
            </div>
          ) : (
            <div className="swo-preview__empty">
              <span><Filter size={21} /></span>
              <strong>No matching contractors</strong>
              <p>Widen your radius, change your services, or clear filters to see more partners.</p>
              <button type="button" onClick={clearFilters}>Clear all filters</button>
            </div>
          )}
        </section>

        <section className="swo-preview__footer-card">
          <span className="swo-preview__footer-icon"><CheckCircle2 size={19} /></span>
          <div><strong>Work stays private until you connect</strong><p>Only approved connections can receive work-order invitations.</p></div>
          <ArrowRight className="swo-preview__footer-arrow" size={19} />
        </section>

        <footer className="swo-preview__footnote">
          <Clock3 size={14} /> Preview only · PIN distances use sample Bengaluru locations. No requests are sent.
        </footer>
      </div>

      {notice && <div role="status" className="swo-preview__toast"><CheckCircle2 size={17} />{notice}<button onClick={() => setNotice("")} aria-label="Dismiss notification"><X size={16} /></button></div>}

      {selected && (
        <div className="swo-preview__overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
          <section className="swo-preview__profile" role="dialog" aria-modal="true" aria-labelledby="swo-profile-title">
            <button type="button" className="swo-preview__close" aria-label="Close profile" onClick={() => setSelected(null)}><X size={19} /></button>
            <div className={`swo-preview__profile-cover swo-preview__profile-cover--${selected.color}`} />
            <div className="swo-preview__profile-body">
              <div className={`swo-preview__avatar swo-preview__avatar--${selected.color} swo-preview__avatar--large`}>{selected.initials}</div>
              <div className="swo-preview__profile-title-row">
                <div><p className="swo-preview__profile-kicker">VERIFIED CONTRACTOR</p><h2 id="swo-profile-title">{selected.company_name}</h2></div>
                <BadgeCheck size={24} className="swo-preview__verified-icon" aria-label="Verified" />
              </div>
              <p className="swo-preview__profile-owner">Owned by {selected.owner_name} <span>·</span> {selected.bharath_id}</p>
              <div className="swo-preview__profile-stats">
                <ProfileStat value={`${selected.years_in_business} yrs`} label="In business" />
                <ProfileStat value={selected.number_of_painters} label="Team members" />
                <ProfileStat value="Verified" label="Business status" />
              </div>
              <div className="swo-preview__profile-detail"><span><MapPin size={16} /> Service areas</span><strong>{selected.service_areas}</strong></div>
              <div className="swo-preview__profile-detail"><span><BriefcaseBusiness size={16} /> Services</span><strong>{selected.services.join(", ")}</strong></div>
              <div className="swo-preview__profile-detail"><span><Building2 size={16} /> Office</span><strong>{selected.office_address}</strong></div>
              <p className="swo-preview__profile-note">Connect to coordinate directly and send subcontract work orders. They’ll need to accept your request first.</p>
              <div className="swo-preview__profile-actions">
                <button type="button" className="swo-preview__secondary" onClick={() => setSelected(null)}>Close</button>
                <button type="button" className="swo-preview__primary" onClick={() => requestConnection(selected)} disabled={requested.includes(selected.id)}>
                  {requested.includes(selected.id) ? <><Check size={16} /> Request sent</> : <>Request connection <ArrowRight size={16} /></>}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function ContractorCard({ contractor, requested, locationsOpen, setLocationsOpen, distance, onView, onRequest }) {
  const areas = contractor.service_areas.split(",").map((area) => area.trim()).filter(Boolean);

  return (
    <article className={`swo-preview__contractor-card swo-preview__contractor-card--${contractor.color}`}>
      <div className="swo-preview__card-content">
        <div className="swo-preview__profile-row">
          <div className={`swo-preview__avatar swo-preview__avatar--${contractor.color}`}>
            {contractor.profile_image_url
              ? <img src={contractor.profile_image_url} alt={`${contractor.company_name} profile`} />
              : <span aria-hidden="true">{contractor.initials}</span>}
          </div>
          <div className="swo-preview__profile-copy">
            <span className="swo-preview__verified-pill"><BadgeCheck size={14} /> Verified</span>
            <h3>{contractor.company_name}</h3>
            <p className="swo-preview__owner">{contractor.owner_name} <span>·</span> {contractor.bharath_id}</p>
            <div className="swo-preview__card-facts">
              <span><BriefcaseBusiness size={15} /><strong>{contractor.years_in_business} yrs</strong></span>
              <span><UsersRound size={15} /><strong>{contractor.number_of_painters} painters</strong></span>
              {distance !== null && <span className="swo-preview__distance"><MapPin size={14} /><strong>{distance} km</strong></span>}
            </div>
          </div>
        </div>

        <div className="swo-preview__location">
          <button
            type="button"
            className={`swo-preview__location-chip ${areas.length > 1 ? "is-list" : ""}`}
            aria-expanded={locationsOpen === contractor.id}
            aria-label={`${areas.length} service areas for ${contractor.company_name}`}
            onClick={() => setLocationsOpen((current) => (current === contractor.id ? null : contractor.id))}
          >
            <MapPin size={13} />
            <span>{areas.length} {areas.length === 1 ? "area" : "areas"}</span>
            {areas.length > 1 && <ChevronDown size={13} className={locationsOpen === contractor.id ? "is-open" : ""} />}
          </button>
          {locationsOpen === contractor.id && (
            <ul className="swo-preview__location-list">
              {areas.map((area, index) => (
                <li key={area}>
                  <MapPin size={12} />
                  <span>{area}</span>
                  {distance !== null && <small>{Math.max(0, distance + (index - 1) * 4)} km</small>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="swo-preview__service-tags" aria-label="Services offered">
          {contractor.services.map((service) => <span key={service}>{service}</span>)}
        </div>

        <div className="swo-preview__card-actions">
          <button type="button" className="swo-preview__view" onClick={onView}>View profile</button>
          <button type="button" className="swo-preview__primary" onClick={onRequest} disabled={requested}>
            {requested ? <><Check size={15} /> Request sent</> : <>Connect <ArrowRight size={15} /></>}
          </button>
        </div>
      </div>
    </article>
  );
}

function ProfileStat({ value, label }) {
  return <div><strong>{value}</strong><span>{label}</span></div>;
}
