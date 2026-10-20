import { useCallback, useEffect, useState } from "react";
import {
  BriefcaseBusiness,
  CalendarDays,
  Crosshair,
  Eye,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/client";
import { Dialog } from "../components/ui/Dialog";
import useAuth from "../context/useAuth";
import { useLanguage } from "../i18n/LanguageContext";
import IndiaLocationPicker from "../components/IndiaLocationPicker";
import { getMobileLocation } from "../utils/indiaLocation";
import MobilePageBack from "../components/MobilePageBack";
import WorkNetworkTabs from "../components/WorkNetworkTabs";
import HiringWorkspaceNav from "../components/HiringWorkspaceNav";
import AssignHiringOutcomeDialog from "../components/AssignHiringOutcomeDialog";
import { EmptyState, ErrorState, PageHeader, SectionCard, StatusBadge } from "../components/ui";
import "./jobs-schedules.css";
import {
  APPLICATOR_AVAILABILITY_PATH,
  paintingSkillOptions as skillOptions,
} from "../constants/workNetwork";

const empty = {
  title: "",
  description: "",
  service_type: "Interior painting",
  location: "",
  city: "",
  pincode: "",
  state: "",
  latitude: null,
  longitude: null,
  radius_km: 10,
  location_source: "MANUAL",
  job_type: "DAILY",
  number_of_painters: 1,
  required_experience: 0,
  required_skills: "",
  daily_wage: "",
  weekly_wage: "",
  start_date: "",
  estimated_days: 1,
};
export default function Jobs() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const contractor = user?.role === "CONTRACTOR";
  const [jobs, setJobs] = useState([]);
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("");
  const [searchGeo, setSearchGeo] = useState({ latitude: null, longitude: null, radius_km: 10 });
  const [locating, setLocating] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showForm, setShowForm] = useState(contractor && searchParams.get("post") === "1");
  const [form, setForm] = useState(empty);
  const [applications, setApplications] = useState({});
  const [detailJob, setDetailJob] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [availabilityCount, setAvailabilityCount] = useState(null);
  const [assignmentSourceId, setAssignmentSourceId] = useState(null);

  useEffect(() => {
    if (contractor) {
      if (searchParams.get("post") === "1") setShowForm(true);
      return;
    }
    setShowForm(false);
    if (searchParams.get("post")) {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.delete("post");
        return next;
      }, { replace: true });
    }
  }, [contractor, searchParams, setSearchParams]);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("post");
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const openForm = useCallback(() => {
    setShowForm(true);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("post", "1");
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/jobs/list/", {
        params: {
          search: search || undefined,
          location: location || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          latitude: searchGeo.latitude ?? undefined,
          longitude: searchGeo.longitude ?? undefined,
          radius_km: searchGeo.radius_km,
        },
      });
      setJobs(data.jobs || []);
      setError("");
    } catch (err) {
      setError(readError(err, "Jobs could not be loaded."));
    }
  }, [search, location, dateFrom, dateTo, searchGeo]);

  async function useNearbyJobs() {
    setLocating(true);
    try {
      const current = await getMobileLocation();
      setSearchGeo((old) => ({ ...old, latitude: current.latitude, longitude: current.longitude }));
      setLocation("");
      setError("");
    } catch (requestError) {
      setError(requestError.message || "Location permission was not granted.");
    } finally {
      setLocating(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/jobs/seeking/", { params: { page_size: 1 } })
      .then(({ data }) => {
        if (cancelled) return;
        setAvailabilityCount(Array.isArray(data) ? data.length : data?.count ?? null);
      })
      .catch(() => {
        if (!cancelled) setAvailabilityCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function createJob(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.post("/jobs/create/", {
        ...form,
        number_of_painters: Number(form.number_of_painters),
        required_experience: Number(form.required_experience),
        estimated_days: Number(form.estimated_days),
        daily_wage: form.job_type === "DAILY" ? form.daily_wage || null : null,
        weekly_wage:
          form.job_type === "WEEKLY" ? form.weekly_wage || null : null,
      });
      closeForm();
      setForm(empty);
      await load();
    } catch (err) {
      setError(readError(err, "Job could not be posted."));
    } finally {
      setSaving(false);
    }
  }

  async function apply(job) {
    const message = prompt(
      "Add a short message for the contractor:",
      "I am available for this work.",
    );
    if (message === null) return;
    setSaving(true);
    try {
      await api.post(`/jobs/${job.id}/apply/`, { message });
      setDetailJob((current) => current?.id === job.id ? { ...current, has_applied: true } : current);
      await load();
    } catch (err) {
      setError(readError(err, "Application could not be submitted."));
    } finally {
      setSaving(false);
    }
  }

  async function viewApplications(job) {
    try {
      const { data } = await api.get(`/jobs/${job.id}/applications/`);
      setApplications((current) => ({
        ...current,
        [job.id]: data.applications || [],
      }));
      setDetailJob(job);
    } catch (err) {
      setError(readError(err, "Applications could not be loaded."));
    }
  }

  async function decide(jobId, applicationId, action) {
    setSaving(true);
    try {
      await api.post(`/jobs/applications/${applicationId}/${action}/`);
      const { data } = await api.get(`/jobs/${jobId}/applications/`);
      setApplications((current) => ({
        ...current,
        [jobId]: data.applications || [],
      }));
      await load();
    } catch (err) {
      setError(readError(err, `Application could not be ${action}ed.`));
    } finally {
      setSaving(false);
    }
  }

  async function refreshApplications(jobId) {
    const { data } = await api.get(`/jobs/${jobId}/applications/`);
    setApplications((current) => ({ ...current, [jobId]: data.applications || [] }));
    await load();
  }

  async function cancelAssignment(jobId, application, action = "CANCEL") {
    const defaultReason = action === "APPROVE" ? application.cancellation_reason : "Customer cancelled the service";
    const reason = prompt("Reason for cancellation:", defaultReason || "");
    if (reason === null || !reason.trim()) return;
    setSaving(true);
    try {
      await api.post(`/jobs/applications/${application.application_id}/cancellation/`, { action, reason });
      await refreshApplications(jobId);
    } catch (err) {
      setError(readError(err, "Assignment could not be cancelled."));
    } finally {
      setSaving(false);
    }
  }

  async function keepAssignment(jobId, applicationId) {
    setSaving(true);
    try {
      await api.post(`/jobs/applications/${applicationId}/cancellation/`, { action: "REJECT" });
      await refreshApplications(jobId);
    } catch (err) {
      setError(readError(err, "Cancellation request could not be declined."));
    } finally {
      setSaving(false);
    }
  }

  async function rateApplication(jobId, applicationId) {
    const rating = prompt("Optional rating for the Paint Applicator (1 to 5):", "5");
    if (rating === null || rating === "") return;
    const review = prompt("Optional feedback:", "") ?? "";
    setSaving(true);
    try {
      await api.post(`/jobs/applications/${applicationId}/rating/`, { rating, review });
      await refreshApplications(jobId);
    } catch (err) {
      setError(readError(err, "Rating could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  async function respondToTransfer(jobId, transferId, action) {
    setSaving(true);
    try {
      await api.post(`/jobs/transfers/${transferId}/respond/`, { action });
      await refreshApplications(jobId);
    } catch (err) {
      setError(readError(err, "Transfer request could not be answered."));
    } finally {
      setSaving(false);
    }
  }

  async function requestReassign(jobId, applicationId, targetJobId) {
    const reason = prompt("Reason for transferring this Paint Applicator:", "Available for the other requirement");
    if (reason === null) return;
    setSaving(true);
    try {
      await api.post(`/jobs/applications/${applicationId}/reassign/`, {
        target_job_id: Number(targetJobId),
        reason,
      });
      await refreshApplications(jobId);
    } catch (err) {
      setError(readError(err, "Transfer request could not be sent."));
    } finally {
      setSaving(false);
    }
  }

  async function openConversation(params) {
    try {
      let conversation;
      if (params.painter_id) {
        const { data } = await api.post("/quotations/chat/conversations/", {
          painter: params.painter_id,
        });
        conversation = data;
      } else {
        const { data } = await api.get("/quotations/chat/conversations/", { params });
        conversation = data.find((item) => item.contractor_id === Number(params.contractor_id));
      }
      if (!conversation) throw new Error("Conversation was not created.");
      navigate(`/messages?conversation=${conversation.id}`);
    } catch (err) {
      setError(readError(err, "Conversation could not be opened."));
    }
  }

  const transferTargets = jobs
    .filter(
      (job) =>
        ["OPEN", "PARTIALLY_FILLED"].includes(job.status) && job.id !== detailJob?.id,
    )
    .map((job) => ({ id: job.id, label: `${job.title} · ${job.start_date || "No start date"}` }));

  return (
    <div className="space-y-6 jobs-schedules-page bp-jobs-page">
      <MobilePageBack />
      <PageHeader eyebrow="Work network" title={t(contractor ? "Jobs & Applications" : "Available Jobs")} description="Review job requirements, applications and available work." actions={<div className="flex flex-wrap gap-2">
          <Link
            to={APPLICATOR_AVAILABILITY_PATH}
            className="bp-button bp-button-secondary inline-flex items-center gap-2"
          >
            <Users className="h-4 w-4" />
            {t(contractor ? "Find Paint Applicators" : "Post my availability")}
          </Link>
          {contractor && (
            <button
              onClick={openForm}
              className="bp-button bp-button-primary inline-flex items-center gap-2 bp-ui-action"
            >
              <Plus className="h-4 w-4" />
              {t("Post requirement")}
            </button>
          )}
      </div>} />
      <HiringWorkspaceNav />
      <WorkNetworkTabs
        pathname={pathname}
        contractor={contractor}
        requirementsCount={jobs.length}
        availabilityCount={availabilityCount}
      />

      {error && <ErrorState message={error} onRetry={load} className="min-h-0 rounded-2xl border border-red-100 bg-white p-5" />}
      <SectionCard title="Job requirements"  className="job-list-card" bodyClassName="p-0">
        <div className="grid gap-3 border-b p-4 md:grid-cols-2 xl:grid-cols-5">
          <label className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search service, skill or job"
              className="w-full bg-transparent text-sm outline-none bp-ui-control"
            />
          </label>
          <label className="rounded-xl bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500">
            Available from
            <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="mt-1 block w-full bg-transparent text-sm font-normal text-slate-900 outline-none bp-ui-control" />
          </label>
          <label className="rounded-xl bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500">
            Available until
            <input type="date" min={dateFrom || undefined} value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="mt-1 block w-full bg-transparent text-sm font-normal text-slate-900 outline-none bp-ui-control" />
          </label>
          <label className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3">
            <MapPin className="h-4 w-4 text-slate-400" />
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="City, area or PIN code"
              className="w-full bg-transparent text-sm outline-none bp-ui-control"
            />
          </label>
          <div className="flex gap-2 md:col-span-2 xl:col-span-5">
            <button type="button" onClick={useNearbyJobs} disabled={locating} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 bp-ui-action">
              <Crosshair className="h-4 w-4" />{locating ? "Finding..." : "Jobs near my mobile location"}
            </button>
            <select value={searchGeo.radius_km} onChange={(event) => setSearchGeo((old) => ({ ...old, radius_km: Number(event.target.value) }))} className="rounded-xl border bg-white px-3 text-sm font-semibold bp-ui-control">
              {[5, 10, 15, 25, 50, 100].map((radius) => <option key={radius} value={radius}>{radius} km</option>)}
            </select>
            {searchGeo.latitude != null && <button type="button" onClick={() => setSearchGeo((old) => ({ ...old, latitude: null, longitude: null }))} className="rounded-xl border px-3 text-sm font-semibold bp-ui-action">Show all locations</button>}
          </div>
        </div>
        {jobs.length ? (
          <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-4">
            {jobs.map((job) => (
              <article key={job.id} className="flex min-h-[320px] flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-lg">
                <div className="flex h-full flex-col gap-4">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-slate-950 text-white">
                    <BriefcaseBusiness className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-bold bp-ui-section-heading">{job.title}</h2>
                      <StatusBadge status={job.status} label={labelStatus(job.status)} tone={jobStatusTone(job.status)} />
                      <Badge>{job.job_type}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {contractor
                        ? `${job.applications_count} applications`
                        : `Contractor: ${job.contractor_name}`}
                    </p>
                    {!contractor && <p className="mt-1 text-xs font-semibold text-slate-600">{job.contractor_bharath_id || "Contractor ID pending"} · {job.contractor_mobile}</p>}
                    <p className="mt-2 line-clamp-3 text-sm text-slate-600">
                      {job.description ||
                        job.required_skills ||
                        job.service_type}
                    </p>
                    <div className="job-card-facts mt-3 flex flex-wrap gap-4 text-sm text-slate-600">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {job.location}, {job.city}
                        {job.pincode ? ` · ${job.pincode}` : ""}
                      </span>
                      {job.distance_km != null && <b className="text-blue-700">{job.distance_km} km away</b>}
                      <span className="flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5" />
                         {formatJobDate(job.start_date)} · {job.estimated_days} days
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {job.number_of_painters} Paint Applicator
                        {job.number_of_painters === 1 ? "" : "s"}
                      </span>
                      <b>
                        ₹
                        {Number(
                          job.job_type === "DAILY"
                            ? job.daily_wage || 0
                            : job.weekly_wage || 0,
                        ).toLocaleString("en-IN")}{" "}
                        / {job.job_type.toLowerCase()}
                      </b>
                    </div>
                  </div>
                  <div className="mt-auto pt-2">
                  {contractor ? (
                      <button
                        onClick={() => viewApplications(job)}
                        className="job-primary-action flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold bp-ui-action"
                      >
                        <Eye className="h-4 w-4" /> Manage applicants
                    </button>
                  ) : (
                      <button onClick={() => setDetailJob(job)} className="job-primary-action flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold bp-ui-action">
                      <Eye className="h-4 w-4" /> View details
                    </button>
                  )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="job-empty-state p-6 text-center sm:p-10">
            <EmptyState title={contractor ? "No requirements found" : "No available jobs found"}  />
            {contractor ? (
              <button
                onClick={openForm}
                className="job-primary-action mt-4 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold bp-ui-action"
              >
                <Plus className="h-4 w-4" />
                {t("Post requirement")}
              </button>
            ) : (
              <Link
                to={APPLICATOR_AVAILABILITY_PATH}
                className="mt-4 inline-flex items-center gap-2 rounded-xl border px-5 py-3 text-sm font-semibold"
              >
                <Users className="h-4 w-4" />
                {t("Post my availability")}
              </Link>
            )}
          </div>
        )}
      </SectionCard>
      {showForm && contractor && (
        <JobForm
          error={error}
          form={form}
          setForm={setForm}
          saving={saving}
          onClose={closeForm}
          onSubmit={createJob}
        />
      )}
      {detailJob && (
        <JobDetailModal
          error={error}
          job={detailJob}
          contractor={contractor}
          saving={saving}
          applications={applications[detailJob.id] || []}
          onClose={() => {
            setDetailJob(null);
          }}
          onApply={() => apply(detailJob)}
          onCall={() => window.location.href = `tel:${detailJob.contractor_mobile}`}
          onMessage={() => openConversation({ contractor_id: detailJob.contractor_id })}
          onDecide={(id, action) => decide(detailJob.id, id, action)}
          onCancel={(item, action) => cancelAssignment(detailJob.id, item, action)}
          onKeep={(id) => keepAssignment(detailJob.id, id)}
          onPainterMessage={(painterId) => openConversation({ painter_id: painterId })}
          onRate={(id) => rateApplication(detailJob.id, id)}
          onTransferResponse={(transferId, action) => respondToTransfer(detailJob.id, transferId, action)}
          onReassign={(applicationId, targetJobId) => requestReassign(detailJob.id, applicationId, targetJobId)}
          onAssignToProject={(applicationId) => { setDetailJob(null); setAssignmentSourceId(applicationId); }}
          transferTargets={transferTargets}
        />
      )}
      {assignmentSourceId && <AssignHiringOutcomeDialog sourceType="application" sourceId={assignmentSourceId} onClose={() => setAssignmentSourceId(null)} />}
    </div>
  );
}

function JobDetailModal({ job, contractor, saving, applications, onClose, onApply, onCall, onMessage, onDecide, onCancel, onKeep, onPainterMessage, onRate, onTransferResponse, onReassign, onAssignToProject, transferTargets, error }) {
  const wage = job.job_type === "DAILY" ? job.daily_wage : job.weekly_wage;
  return (
    <Dialog title={job.title} description={contractor ? `${job.applications_count} applications` : job.contractor_name} icon={BriefcaseBusiness} size="xl" closeLabel="Close job details" closeOnBackdrop onClose={onClose}>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap items-center gap-2"><StatusBadge status={job.status} label={labelStatus(job.status)} tone={jobStatusTone(job.status)} /><Badge>{job.job_type}</Badge></div>
        <div className="p-5 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Detail label="Location" value={[job.location, job.city, job.pincode].filter(Boolean).join(", ")} />
            <Detail label="Work starts" value={job.start_date || "Not specified"} />
            <Detail label="Duration" value={`${job.estimated_days || 1} day(s)`} />
            <Detail label="Applicators needed" value={job.number_of_painters || 1} />
            <Detail label="Experience" value={`${job.required_experience || 0}+ years`} />
            <Detail label="Work radius" value={`${job.radius_km || 10} km`} />
            <Detail label="Wage" value={wage ? `₹${Number(wage).toLocaleString("en-IN")} / ${String(job.job_type || "").toLowerCase()}` : "Discuss with contractor"} />
            {!contractor && <Detail label="Contractor ID" value={job.contractor_bharath_id || "Pending"} />}
          </div>
          <div className="mt-5 rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Required skills</p>
            <p className="mt-2 text-sm font-semibold text-slate-700">{job.required_skills || job.service_type || "General painting work"}</p>
            {job.description && <p className="mt-3 text-sm leading-6 text-slate-600">{job.description}</p>}
          </div>
          {contractor ? (
            <ApplicationList items={applications} saving={saving} onDecide={onDecide} onCancel={onCancel} onKeep={onKeep} onMessage={onPainterMessage} onRate={onRate} onTransferResponse={onTransferResponse} onReassign={onReassign} onAssignToProject={onAssignToProject} transferTargets={transferTargets} />
          ) : (
            <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <button type="button" onClick={onCall} className="inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-bold bp-ui-action"><Phone className="h-4 w-4" /> Call</button>
              <button type="button" onClick={onMessage} className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-3 text-sm font-bold text-blue-700 bp-ui-action"><MessageCircle className="h-4 w-4" /> Message</button>
              <button type="button" disabled={saving || job.has_applied} onClick={onApply} className="col-span-2 rounded-xl bg-slate-950 px-3 py-3 text-sm font-bold text-white disabled:bg-emerald-100 disabled:text-emerald-700 sm:col-span-1 bp-ui-action">{job.has_applied ? "Applied" : "Apply"}</button>
            </div>
          )}
        </div>
    </Dialog>
  );
}

function Detail({ label, value }) {
  return <div className="rounded-2xl border bg-white p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 font-bold text-slate-800">{value}</p></div>;
}

function ApplicationList({ items, saving, onDecide, onCancel, onKeep, onMessage, onRate, onTransferResponse, onReassign, onAssignToProject, transferTargets }) {
  const [targets, setTargets] = useState({});
  const selectableTargets = transferTargets || [];
  return (
          <div className="job-applications-panel mt-5 rounded-xl bg-slate-50 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">Applicants</h3><span className="text-sm text-slate-500">{items.length} {items.length === 1 ? "response" : "responses"}</span></div>
      {items.length ? (
        <div className="mt-3 divide-y rounded-xl border bg-white">
          {items.map((item) => (
            <div
              key={item.application_id}
              className="flex flex-col gap-3 p-4 md:flex-row md:items-center"
            >
              <div className="flex-1">
                <p className="font-semibold">
                  {item.painter_name || item.mobile}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {item.bharath_id} · {item.experience_years || 0} years ·{" "}
                  {item.mobile}
                </p>
                {item.message && (
                  <p className="mt-2 text-sm text-slate-600">{item.message}</p>
                )}
                {item.cancellation_reason && (
                  <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">Reason: {item.cancellation_reason}</p>
                )}
                {item.transfer_request && <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900"><p className="font-bold">Transfer requested: {item.transfer_request.target_job}</p><p className="mt-1">{item.transfer_request.target_start_date} to {item.transfer_request.target_end_date} · {item.transfer_request.reason}</p>{item.transfer_request.can_respond ? <div className="mt-2 flex gap-2"><button disabled={saving} onClick={() => onTransferResponse(item.transfer_request.id, "REJECT")} className="rounded-lg border border-blue-300 bg-white px-3 py-1.5 font-bold bp-ui-action">Decline</button><button disabled={saving} onClick={() => onTransferResponse(item.transfer_request.id, "ACCEPT")} className="rounded-lg bg-blue-700 px-3 py-1.5 font-bold text-white bp-ui-action">Accept transfer</button></div> : <p className="mt-2 font-bold">Waiting for Paint Applicator approval</p>}</div>}
              </div>
              <StatusBadge status={item.status} label={labelStatus(item.status)} tone={applicationTone(item.status)} />
              <div className="flex gap-2">
                <a href={`tel:${item.mobile}`} title={`Call ${item.mobile}`} className="grid h-10 w-10 place-items-center rounded-lg border bp-ui-icon-action"><Phone className="h-4 w-4"/></a>
                <button onClick={() => onMessage(item.painter_id)} title="Message applicator" className="grid h-10 w-10 place-items-center rounded-lg border border-blue-200 bg-blue-50 text-blue-700 bp-ui-icon-action"><MessageCircle className="h-4 w-4"/></button>
              </div>
              {item.status === "APPLIED" && (
                <div className="flex gap-2">
                  <button
                    disabled={saving}
                    onClick={() => onDecide(item.application_id, "reject")}
                    className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 bp-ui-action"
                  >
                    Reject
                  </button>
                  <button
                    disabled={saving}
                    onClick={() => onDecide(item.application_id, "accept")}
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white bp-ui-action"
                  >
                    Accept
                  </button>
                </div>
              )}
              {item.status === "ACCEPTED" && !item.transfer_request && (
                <div className="flex flex-wrap items-center gap-2">
                  <button disabled={saving} onClick={() => onAssignToProject(item.application_id)} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white bp-ui-action">Assign to project</button>
                  {selectableTargets.length > 0 && <>
                    <select value={targets[item.application_id] || ""} onChange={(event) => setTargets((old) => ({ ...old, [item.application_id]: event.target.value }))} className="rounded-lg border bg-white px-3 py-2 text-sm bp-ui-control">
                      <option value="">Request transfer to job</option>
                      {selectableTargets.map((job) => <option key={job.id} value={job.id}>{job.label}</option>)}
                    </select>
                    <button disabled={saving || !targets[item.application_id]} onClick={() => onReassign(item.application_id, targets[item.application_id])} className="rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700 disabled:opacity-40 bp-ui-action">Send request</button>
                  </>}
                  <button disabled={saving} onClick={() => onCancel(item, "CANCEL")} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 bp-ui-action">Cancel assignment</button>
                </div>
              )}
              {item.status === "CANCELLATION_REQUESTED" && (
                <div className="flex gap-2">
                  <button disabled={saving} onClick={() => onKeep(item.application_id)} className="rounded-lg border px-3 py-2 text-sm font-semibold bp-ui-action">Keep assignment</button>
                  <button disabled={saving} onClick={() => onCancel(item, "APPROVE")} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white bp-ui-action">Approve cancellation</button>
                </div>
              )}
              {item.status === "CANCELLED" && !item.contractor_rating && (
                <button disabled={saving} onClick={() => onRate(item.application_id)} className="rounded-lg border px-3 py-2 text-sm font-semibold bp-ui-action">Rate applicator (optional)</button>
              )}
              {item.contractor_rating && <span className="text-sm font-bold text-amber-600">★ {item.contractor_rating}/5</span>}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-400">No applications yet.</p>
      )}
    </div>
  );
}

function JobForm({ form, setForm, saving, onClose, onSubmit, error }) {
  const { t } = useLanguage();
  const input = "mt-2 w-full rounded-xl border px-3 py-3 font-normal";
  const field = (name) => ({
    value: form[name],
    onChange: (e) => setForm({ ...form, [name]: e.target.value }),
  });
  const selectedSkills = new Set(String(form.required_skills || "").split(",").map((value) => value.trim()).filter(Boolean));
  const toggleSkill = (skill) => {
    const next = new Set(selectedSkills);
    if (next.has(skill)) next.delete(skill); else next.add(skill);
    setForm({ ...form, required_skills: [...next].join(", ") });
  };
  return (
    <Dialog title={t("Post requirement")} icon={BriefcaseBusiness} size="lg" closeLabel="Close post requirement form" onClose={onClose}>
      <form onSubmit={onSubmit}>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Job title">
            <input required {...field("title")} className={(input) + " bp-ui-control"} />
          </Field>
          <Field label="Service type">
            <input required {...field("service_type")} className={(input) + " bp-ui-control"} />
          </Field>
          <IndiaLocationPicker value={form} onChange={setForm} required title="Job site location" />
          <Field label="Start date">
            <input
              required
              type="date"
              {...field("start_date")}
              className={(input) + " bp-ui-control"}
            />
          </Field>
          <Field label="Payment type">
            <select {...field("job_type")} className={(input) + " bp-ui-control"}>
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
            </select>
          </Field>
          <Field
            label={form.job_type === "DAILY" ? "Daily wage" : "Weekly wage"}
          >
            <input
              required
              type="number"
              min="0"
              {...field(
                form.job_type === "DAILY" ? "daily_wage" : "weekly_wage",
              )}
              className={(input) + " bp-ui-control"}
            />
          </Field>
          <Field label="Paint Applicators required">
            <input
              required
              type="number"
              min="1"
              {...field("number_of_painters")}
              className={(input) + " bp-ui-control"}
            />
          </Field>
          <Field label="Minimum experience (years)">
            <input
              type="number"
              min="0"
              {...field("required_experience")}
              className={(input) + " bp-ui-control"}
            />
          </Field>
          <Field label="Estimated days">
            <input
              required
              type="number"
              min="1"
              {...field("estimated_days")}
              className={(input) + " bp-ui-control"}
            />
          </Field>
          <div className="sm:col-span-2">
            <p className="text-sm font-semibold">Required skills</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {skillOptions.map((skill) => <button type="button" key={skill} onClick={() => toggleSkill(skill)} className={(`rounded-xl border px-3 py-2.5 text-left text-sm font-semibold ${selectedSkills.has(skill) ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "bg-white text-slate-600"}`) + " bp-ui-action"}>{selectedSkills.has(skill) ? "✓ " : ""}{skill}</button>)}
            </div>
          </div>
          <Field label="Description" wide>
            <textarea rows="3" {...field("description")} className={(input) + " bp-ui-control"} />
          </Field>
        </div>
        <button
          disabled={saving || !form.required_skills || !form.location || !form.city}
          className="mt-6 w-full rounded-xl bg-slate-950 py-3 font-semibold text-white disabled:opacity-50 bp-ui-action"
        >
          {saving ? "Posting..." : t("Post requirement")}
        </button>
      </form>
    </Dialog>
  );
}
function Field({ label, wide, children }) {
  return (
    <label className={`text-sm font-semibold ${wide ? "sm:col-span-2" : ""}`}>
      {label}
      {children}
    </label>
  );
}
function Badge({ children }) {
  return (
    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
      {String(children).replaceAll("_", " ")}
    </span>
  );
}
function labelStatus(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
function jobStatusTone(value) {
  if (["FILLED", "COMPLETED"].includes(value)) return "success";
  if (["CANCELLED"].includes(value)) return "danger";
  if (["PARTIALLY_FILLED"].includes(value)) return "warning";
  if (["OPEN", "IN_PROGRESS"].includes(value)) return "info";
  return "neutral";
}
function applicationTone(value) {
  if (["ACCEPTED", "COMPLETED"].includes(value)) return "success";
  if (["REJECTED", "CANCELLED"].includes(value)) return "danger";
  if (["CANCELLATION_REQUESTED"].includes(value)) return "warning";
  if (["APPLIED", "ASSIGNED", "IN_PROGRESS"].includes(value)) return "info";
  return "neutral";
}
function formatJobDate(value) {
  if (!value) return "Date not set";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
function readError(error, fallback) {
  const data = error.response?.data;
  return (
    data?.error ||
    data?.detail ||
    Object.values(data || {})
      .flat()
      .join(" ") ||
    fallback
  );
}
