import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Send, X } from "lucide-react";
import "./contractor-network.css";
import api from "../api/client";
import useAuth from "../context/useAuth";
import ContractorInvitation from "../components/ContractorInvitation";
import { ContractorContactLinks } from '../components/ContractorProfileDetails';
import ContractorProfileAdapter from "../components/ContractorProfileAdapter";
import ContractorNetworkProfile from "../components/ContractorNetworkProfile";
import { EmptyState, ErrorState, LoadingState, StatusBadge } from "../components/ui";
import { apiErrorMessage, connectionCounterparty } from "../utils/subcontract";
import { getLocationEngine, getMobileLocation } from "../utils/indiaLocation";
import { distanceKm, filterContractors, postcodeLocations } from "../utils/contractorSearch";

const TABS = [
  { value: "CONNECTED", label: "Contractors" },
  { value: "PENDING", label: "Requests" },
  { value: "HISTORY", label: "History" },
];

const DISCOVER_METHODS = [
  ["SEARCH", "Searched on the platform"],
  ["COMPLETED_WORK", "We worked together before"],
  ["INVITATION", "They invited me"],
  ["REFERRAL", "Referred by someone"],
];

export default function ContractorNetwork() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [directory, setDirectory] = useState([]);
  const [workOrders, setWorkOrders] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [tab, setTab] = useState("CONNECTED");
  const [requesting, setRequesting] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    return api
      .get("/quotations/contractor-connections/")
      .then(({ data }) => {
        setRows(Array.isArray(data) ? data : []);
        setError("");
      })
      .catch((err) => setError(apiErrorMessage(err, "Your network could not be loaded.")))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    api.get('/accounts/contractors/').then(({data}) => setDirectory(Array.isArray(data) ? data : data?.results || [])).catch(() => {});
    api.get('/outsourcing/work-orders/').then(({data}) => setWorkOrders(Array.isArray(data) ? data : data?.next ? null : data?.results || [])).catch(() => {});
  }, [load]);
  const rowDetails = (row) => {
    const profile = directory.find(item => item.id === connectionCounterparty(row).id) || (row.viewer_authority === 'RECIPIENT' ? row.requester_details : null);
    const orders = workOrders?.filter(item => item.connection === row.id);
    return {profile, stats: {completed: orders ? orders.filter(item => item.status === 'COMPLETED').length : row.completed_work_orders, active: orders ? orders.filter(item => ['ACCEPTED','SCHEDULED','IN_PROGRESS','CORRECTION_REQUESTED','SUBMITTED_FOR_REVIEW'].includes(item.status)).length : null}};
  };

  const act = async (connection, action, extra = {}) => {
    setActionError("");
    setBusy(true);
    try {
      await api.post(
        `/quotations/contractor-connections/${connection.id}/${action}/`,
        extra,
      );
      await load();
      return true;
    } catch (err) {
      setActionError(apiErrorMessage(err, "That request could not be completed."));
      return false;
    } finally {
      setBusy(false);
    }
  };

  // Asking again is a new request, not an accept, because only the other side
  // is allowed to accept a connection.
  const requestAgain = async (connection) => {
    setActionError("");
    setBusy(true);
    try {
      await api.post("/quotations/contractor-connections/", {
        recipient: connectionCounterparty(connection).id,
        message: "",
        discover_method: "SEARCH",
      });
      await load();
      return true;
    } catch (err) {
      setActionError(apiErrorMessage(err, "That request could not be sent again."));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const grouped = useMemo(
    () => ({
      CONNECTED: rows.filter((row) => row.status === "CONNECTED"),
      PENDING: rows.filter((row) => row.status === "PENDING"),
      HISTORY: rows.filter((row) => ["REJECTED", "DISCONNECTED", "BLOCKED"].includes(row.status)),
    }),
    [rows],
  );

  const incoming = grouped.PENDING.filter((row) => row.viewer_authority === "RECIPIENT").length;
  const isContractor = user?.role === "CONTRACTOR";

  return (
    <div className="contractor-network-page space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-amber-600">Outsourcing</p>
          <h1 className="mt-1 text-3xl font-bold">Contractor Network</h1>
          
        </div>
        {isContractor && (
          <button
            onClick={() => setRequesting(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white"
          >
            <Search className="h-4 w-4" /> Find contractor
          </button>
        )}
      </header>

      {isContractor && <ContractorInvitation user={user} />}

      {error && <ErrorState message={error} onRetry={load} />}

      {!error && (
        <>
          {actionError && (
            <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{actionError}</p>
          )}

          <div className="flex flex-wrap gap-2">
            {TABS.map((option) => {
              const count = grouped[option.value].length;
              return (
                <button
                  key={option.value}
                  onClick={() => setTab(option.value)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${
                    tab === option.value
                      ? "bg-slate-900 text-white"
                      : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {option.label}
                  {option.value === "PENDING" && incoming > 0 ? (
                    <span className="ml-2 rounded-full bg-amber-500 px-2 py-0.5 text-xs text-white">
                      {incoming} new
                    </span>
                  ) : (
                    <span className="ml-2 text-xs opacity-70">{count}</span>
                  )}
                </button>
              );
            })}
          </div>

          {loading ? (
            <LoadingState label="Loading your network…" />
          ) : tab === "PENDING" ? (
            <div className="space-y-4">
              {[['Requests received', grouped.PENDING.filter(row => row.viewer_authority === 'RECIPIENT')], ['Requests sent', grouped.PENDING.filter(row => row.viewer_authority === 'REQUESTER')]].map(([title, requests]) => <section key={title} className="space-y-3"><h2 className="text-base font-bold">{title} <span className="text-sm font-normal text-slate-500">({requests.length})</span></h2>{requests.length ? requests.map(row => <NetworkListRow key={row.id} {...rowDetails(row)} row={row} busy={busy} onView={(action) => { setActionError(''); setViewing({row,action}); }} onAccept={() => act(row,'accept')} />) : <p className="rounded-xl border bg-white p-4 text-sm text-slate-500">No {title.toLowerCase()}.</p>}</section>)}
            </div>
          ) : grouped[tab].length === 0 ? (
            <EmptyState
              title={tab === "CONNECTED" ? "No contractors yet" : "No history yet"}
              description={
                tab === "CONNECTED"
                  ? "Find a contractor, review their profile and send a connection request."
                  : "Nothing to show here."
              }
            />
          ) : (
            <div className="space-y-3">
              {grouped[tab].map((row) => (
                <NetworkListRow
                  key={row.id}
                  {...rowDetails(row)}
                  row={row}
                  busy={busy}
                  onView={(action) => { setActionError(''); setViewing({row,action}); }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {viewing && <ContractorNetworkProfile {...rowDetails(viewing.row)} row={viewing.row} initialAction={viewing.action} busy={busy} error={actionError} onClose={() => setViewing(null)} onAct={async (...args) => { if (await act(...args)) setViewing(null); }} onRequestAgain={async (...args) => { if (await requestAgain(...args)) setViewing(null); }} />}

      {requesting && (
        <RequestConnection
          existing={rows}
          user={user}
          onClose={() => setRequesting(false)}
          onCreated={() => {
            setRequesting(false);
            setTab("PENDING");
            load();
          }}
        />
      )}
    </div>
  );
}

function NetworkListRow({row,profile,stats,busy,onView,onAccept}) {
  const other=connectionCounterparty(row);
  const received=row.status==='PENDING' && row.viewer_authority==='RECIPIENT';
  return <article className="network-list-row flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4">
    <div className="min-w-0 flex-1"><h3 className="break-words text-sm font-bold">{other.label}</h3><p className="mt-1 text-xs text-slate-500">{row.status==='CONNECTED' ? profile?.service_areas || profile?.work_skills || '' : row.status==='PENDING' ? received ? 'Request received' : 'Request sent · Waiting for acceptance' : row.status.replaceAll('_',' ')}</p></div>
    {row.status === 'CONNECTED' && <div className="network-list-summary"><dl><div><dt>Completed</dt><dd>{stats?.completed ?? '—'}</dd></div><div><dt>Active projects</dt><dd>{stats?.active ?? '—'}</dd></div></dl><p>Projects together</p><ContractorContactLinks mobile={profile?.mobile} /></div>}
    <div className="flex flex-wrap items-center gap-2">{row.status !== 'CONNECTED' && <StatusBadge status={row.status} />}<button type="button" onClick={() => onView(null)} className="network-view-link">View profile</button>{received && <><button type="button" disabled={busy} onClick={onAccept} className="min-h-11 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Accept</button><button type="button" disabled={busy} onClick={() => onView('reject')} className="min-h-11 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50">Reject</button></>}</div>
  </article>;
}

function RequestConnection({ existing, user, onClose, onCreated }) {
  const dialogRef = useRef(null);
  const backRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);
  const [directory, setDirectory] = useState([]);
  const [search, setSearch] = useState("");
  const [work, setWork] = useState("");
  const [location, setLocation] = useState("");
  const [locationChoices, setLocationChoices] = useState([]);
  const [radius, setRadius] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({ search: "", work: "", location: "", radius: "" });
  const [origin, setOrigin] = useState(null);
  const [distances, setDistances] = useState({});
  const [locating, setLocating] = useState(false);
  const [distanceLoading, setDistanceLoading] = useState(false);
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [locationError, setLocationError] = useState("");
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ message: "", discover_method: "SEARCH" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (selected) backRef.current?.focus();
  }, [selected]);

  useEffect(() => {
    api
      .get("/accounts/contractors/")
      .then(({ data }) => setDirectory(Array.isArray(data) ? data : data?.results || []))
      .catch(() => setError("Contractors could not be loaded. Close this window and try again."))
      .finally(() => setDirectoryLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setDistances({});
    if (!appliedFilters.radius || !origin) { setDistanceLoading(false); return; }
    setDistanceLoading(true);
    getLocationEngine().then((engine) => {
      const next = {};
      for (const row of directory) {
        const points = postcodeLocations(engine, `${row.office_address || ""} ${row.base_location || ""}`);
        if (points.length) next[row.id] = Math.min(...points.map((point) => distanceKm(origin, point)));
      }
      if (!cancelled) setDistances(next);
    }).catch(() => {
      if (!cancelled) setLocationError("Distance lookup could not load. Try again or clear the distance filter.");
    }).finally(() => { if (!cancelled) setDistanceLoading(false); });
    return () => { cancelled = true; };
  }, [directory, origin, appliedFilters.radius]);

  const locate = async (useGps) => {
    setLocating(true);
    setLocationError("");
    setSelected(null);
    setOrigin(null);
    try {
      if (useGps) {
        const point = await getMobileLocation();
        setOrigin({ ...point, label: "your current location" });
        setLocation("");
        setLocationChoices([]);
      } else {
        const query = location.trim();
        if (!query) throw new Error("Enter an area, city or PIN code, or use your current location.");
        const engine = await getLocationEngine();
        if (!/^[1-9]\d{5}$/.test(query)) {
          const result = engine.search(query, { limit: 20 });
          const choices = result.success ? result.data.data.filter((point) => point.latitude != null && point.longitude != null) : [];
          setLocationChoices(choices);
          if (!choices.length) throw new Error("Location not found. Try a more specific area or six-digit PIN code.");
          setLocationError("Choose your starting location below, then search.");
          return false;
        }
        setLocationChoices([]);
        const points = postcodeLocations(engine, query);
        if (!points.length) throw new Error("No coordinates found for this PIN code. Try your current location.");
        setOrigin({
          latitude: points.reduce((sum, point) => sum + Number(point.latitude), 0) / points.length,
          longitude: points.reduce((sum, point) => sum + Number(point.longitude), 0) / points.length,
          label: `PIN ${query}`,
        });
      }
      return true;
    } catch (err) {
      setLocationError(err.code === 1 ? "Location access was denied. Use a PIN code instead." : err.message || "Location could not be found.");
      return false;
    } finally { setLocating(false); }
  };

  // You cannot connect with yourself, and the directory includes your own entry.
  const hiddenIds = useMemo(
    () =>
      new Set([
        user?.id,
        ...existing
          .filter((row) => row.status !== "BLOCKED")
          .map((row) => connectionCounterparty(row).id),
      ]),
    [existing, user],
  );

  const matches = useMemo(() => filterContractors(directory, hiddenIds, appliedFilters, distances), [directory, hiddenIds, appliedFilters, distances]);
  const searchingDistance = Boolean(appliedFilters.radius && (!origin || locating || distanceLoading));

  const runSearch = async (event) => {
    event.preventDefault();
    setSelected(null);
    setLocationError("");
    if (radius && !origin && !await locate(false)) return;
    setAppliedFilters({ search, work, location, radius });
  };

  const clearSearch = () => {
    setSearch(""); setWork(""); setLocation(""); setRadius(""); setLocationChoices([]);
    setOrigin(null); setSelected(null); setLocationError("");
    setAppliedFilters({ search: "", work: "", location: "", radius: "" });
  };

  useEffect(() => {
    if (selected && (searchingDistance || !matches.some((row) => row.id === selected.id))) setSelected(null);
  }, [selected, matches, searchingDistance]);

  const submit = async (event) => {
    event.preventDefault();
    if (!selected || searchingDistance || !matches.some((row) => row.id === selected.id)) return;
    setError("");
    setBusy(true);
    try {
      await api.post("/quotations/contractor-connections/", {
        recipient: selected.id,
        message: form.message,
        discover_method: form.discover_method,
      });
      onCreated();
    } catch (err) {
      setError(apiErrorMessage(err, "That request could not be sent."));
    } finally {
      setBusy(false);
    }
  };

  return (
      <dialog ref={dialogRef} onCancel={onClose} aria-labelledby="connection-dialog-title" className="connection-dialog network-profile-dialog network-portfolio-dialog">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b px-4 py-4 sm:px-6">
          <div>
            <h2 id="connection-dialog-title" className="text-xl font-bold">{selected ? 'Contractor profile' : 'Find contractor'}</h2>
            <p className="mt-1 text-sm text-slate-500">Review their work and service areas before sending a connection request.</p>
            
          </div>
          <button type="button" onClick={onClose} aria-label="Close connection window" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border text-slate-500 hover:bg-slate-50">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto px-4 py-4 sm:px-6">
        {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {!selected && <>
        <form onSubmit={runSearch} className="rounded-2xl border border-slate-200 p-4">
        <h3 className="mb-3 font-bold">Find a contractor</h3>

        <div className="grid gap-3 sm:grid-cols-2">
        <label><span className="mb-1 block text-sm font-semibold">Company, owner, ID or phone</span><input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Name, ID or full / partial phone number"
        /></label>
        <label><span className="mb-1 block text-sm font-semibold">Type of work</span><input value={work} onChange={(event) => setWork(event.target.value)} placeholder="Painting, waterproofing, plumbing…" /></label>
        <label className="sm:col-span-2"><span className="mb-1 block text-sm font-semibold">Location / service area / PIN code</span><input value={location} onChange={(event) => { setLocation(event.target.value); setOrigin(null); setLocationChoices([]); setSelected(null); setLocationError(""); }} placeholder="Area, city or six-digit PIN code" /><span className="mt-1 block text-xs text-slate-500">With a distance selected, this is the starting location for nearby contractors.</span></label>
        </div>
        <div className="mt-3 rounded-xl bg-slate-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="contractor-distance" className="text-sm font-semibold">Distance</label>
            <output htmlFor="contractor-distance" className="rounded-lg bg-blue-100 px-3 py-1 text-sm font-bold text-blue-800">{radius ? `Within ${radius} km` : "Any distance"}</output>
          </div>
          <input
            id="contractor-distance"
            type="range"
            min="1"
            max="100"
            step="1"
            value={radius || 100}
            aria-valuetext={`${radius || 100} kilometres`}
            onChange={(event) => { setRadius(event.target.value); setSelected(null); setLocationError(""); }}
            className="contractor-distance-slider mt-2"
          />
          <div className="flex items-center justify-between text-xs text-slate-500"><span>1 km</span><span>100 km</span></div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">Slide to choose a distance, then search.</p>
            <button type="button" onClick={() => { setRadius(""); setSelected(null); setLocationError(""); }} className="rounded-lg border bg-white px-3 py-2 text-xs font-semibold">Any distance</button>
          </div>
          {radius && <>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <button type="button" disabled={locating} onClick={() => locate(true)} className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50">Use my location</button>
            </div>
            <p className="mt-2 text-xs text-slate-500">{locating ? "Finding your location…" : origin ? `Searching from ${origin.label}. ` : "Choose a starting location. "}Distances are approximate, based on the contractor’s office PIN code. Profiles without a located PIN code are excluded.</p>
          </>}
          {locationError && <p role="alert" className="mt-2 text-sm text-red-700">{locationError}</p>}
          {radius && locationChoices.length > 0 && <div className="mt-3 max-h-40 space-y-2 overflow-y-auto" aria-label="Matching starting locations">
            {locationChoices.map((point, index) => <button key={`${point.pincode}-${index}`} type="button" onClick={() => { setOrigin({ latitude: Number(point.latitude), longitude: Number(point.longitude), label: `${point.area}, ${point.district} ${point.pincode}` }); setLocationChoices([]); setLocationError(""); }} className="block w-full rounded-lg border bg-white px-3 py-2 text-left text-sm hover:bg-blue-50">{point.area}, {point.district}, {point.state} · {point.pincode}</button>)}
          </div>}
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={clearSearch} disabled={locating} className="min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50">Clear filters</button>
          <button type="submit" disabled={directoryLoading || locating || busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#176b9b] px-5 py-2 text-sm font-bold text-white hover:bg-[#12577f] disabled:opacity-50"><Search className="h-4 w-4" />{locating ? "Searching…" : "Find contractor"}</button>
        </div>
        </form>
        <div className="mt-4 rounded-2xl border border-slate-200 p-4">
          
          <ContractorInvitation user={user} />
        </div>
        <p className="mt-3 text-sm text-slate-500" role="status">{directoryLoading ? "Loading contractors…" : searchingDistance ? (distanceLoading ? "Checking distances…" : "Choose a starting location to find nearby contractors.") : `${matches.length} contractors found`}</p>

        <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
          {!directoryLoading && !searchingDistance && matches.map((row) => (
            <article key={row.id} className="rounded-xl border p-3">
            <div className="min-w-0"><h3 className="font-bold">{row.company_name || row.owner_name}</h3><p className="text-sm text-slate-600">{row.owner_name}</p><p className="text-xs text-slate-600">{row.service_areas}</p><p className="text-xs text-slate-600">{[...(row.services || []),row.work_skills].filter(Boolean).join(', ')}</p></div>
            <button type="button" onClick={() => setSelected(row)} className="mt-2 min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold text-[var(--app-primary)]" aria-label={`View profile of ${row.company_name || row.owner_name}`}>View profile</button>
            </article>
          ))}
          {!directoryLoading && !searchingDistance && matches.length === 0 && (
            <p className="rounded-xl border border-dashed p-4 text-sm text-slate-500">
              No verified contractors match that search.
            </p>
          )}
        </div>

        </>}
        {selected && <>
          <button ref={backRef} type="button" onClick={() => setSelected(null)} className="network-back">Back to contractors</button>
          <ContractorProfileAdapter profile={selected} onBack={() => setSelected(null)} />
        <div className="mt-4 space-y-3">
          <p className="text-sm text-slate-600">Connect with this contractor to work together.</p>
          <details><summary className="text-sm font-semibold cursor-pointer py-2">Add a message (optional)</summary>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">How did you find them</span>
            <select
              value={form.discover_method}
              onChange={(event) => setForm({ ...form, discover_method: event.target.value })}
            >
              {DISCOVER_METHODS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Message</span>
            
            <textarea
              rows={3}
              maxLength={2000}
              value={form.message}
              onChange={(event) => setForm({ ...form, message: event.target.value })}
              placeholder="We need a waterproofing partner for terrace work in Whitefield."
            />
          </label></details>
        </div>
        </>}
        </div>

        <div className="network-request-footer flex shrink-0 flex-wrap justify-end gap-2 border-t bg-slate-50 px-4 py-4 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border px-4 py-2.5 text-sm font-semibold"
          >
            Cancel
          </button>
          {selected && <button
            type="button"
            onClick={submit}
            disabled={busy || !selected || searchingDistance}
            className="inline-flex min-w-0 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white disabled:bg-slate-300"
          >
            <Send className="h-4 w-4" />
            {busy ? "Sending…" : "Send request"}
          </button>}
        </div>
      </dialog>
  );
}
