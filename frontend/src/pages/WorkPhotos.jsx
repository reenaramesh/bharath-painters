import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Camera, Download, Image, Plus, Search, Trash2, X } from "lucide-react";
import api from "../api/client";
import useAuth from "../context/useAuth";
import { EmptyState, ErrorState, LoadingState, PageHeader, SectionCard, StatusBadge } from "../components/ui";

const stages = ["ALL", "BEFORE", "PROGRESS", "AFTER"];
const title = (value) =>
  String(value || "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

function customerStage(value) {
  return ({ BEFORE: "Before work", PROGRESS: "Work in progress", AFTER: "After work" })[value] || title(value);
}

export default function WorkPhotos() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const propertyId = searchParams.get("property_id") || "";
  const customerView = user?.role === "CUSTOMER";
  const [data, setData] = useState({ schedules: [], results: [] });
  const [schedule, setSchedule] = useState("");
  const [stage, setStage] = useState("ALL");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [files, setFiles] = useState([]);
  const [form, setForm] = useState({
    schedule: "",
    stage: "PROGRESS",
    area: "",
    caption: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const canUpload = ["CONTRACTOR", "PAINTER"].includes(user?.role);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: response } = await api.get("/jobs/work-photos/", {
        params: { ...(schedule ? { schedule } : {}), ...(propertyId ? { property_id: propertyId } : {}) },
      });
      setData(response);
      setError("");
    } catch (requestError) {
      setError(
        requestError.response?.data?.detail ||
          "Work photos could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [schedule, propertyId]);
  useEffect(() => {
    load();
  }, [load]);
  const photos = useMemo(
    () =>
      data.results.filter(
        (item) =>
          (stage === "ALL" || item.stage === stage) &&
          [
            item.quotation_number,
            item.customer,
            item.property,
            item.area,
            item.caption,
            item.uploaded_by,
          ].some((value) =>
            String(value || "")
              .toLowerCase()
              .includes(search.toLowerCase()),
          ),
      ),
    [data.results, search, stage],
  );
  const filterControls = <div className="work-photos-filters-grid grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_220px_220px]">
    <label className="flex min-w-0 items-center gap-2 rounded-xl bg-slate-50 px-4 py-3"><Search className="h-4 w-4 shrink-0 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={customerView ? "Search project or room" : "Search project, customer or area"} className="w-full min-w-0 bg-transparent text-sm outline-none" /></label>
    <select value={schedule} onChange={(event) => setSchedule(event.target.value)} className="rounded-xl border px-4 py-3 text-sm"><option value="">All projects</option>{data.schedules.map((item) => <option key={item.id} value={item.id}>{item.quotation_number} - {item.property}</option>)}</select>
    <select value={stage} onChange={(event) => setStage(event.target.value)} className="rounded-xl border px-4 py-3 text-sm">{stages.map((item) => <option key={item} value={item}>{item === "ALL" ? "All stages" : title(item)}</option>)}</select>
  </div>;
  async function upload(event) {
    event.preventDefault();
    if (!files.length) return setError("Select at least one photo.");
    setBusy(true);
    setError("");
    try {
      for (const file of files) {
        const payload = new FormData();
        Object.entries(form).forEach(([key, value]) =>
          payload.append(key, value),
        );
        payload.append("image", file);
        await api.post("/jobs/work-photos/", payload, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }
      setFiles([]);
      setForm({ schedule: "", stage: "PROGRESS", area: "", caption: "" });
      setShowForm(false);
      await load();
    } catch (requestError) {
      setError(
        Object.values(requestError.response?.data || {})
          .flat()
          .join(" ") || "Photos could not be uploaded.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove(item) {
    if (!window.confirm("Delete this work photo?")) return;
    try {
      await api.delete(`/jobs/work-photos/${item.id}/`);
      await load();
    } catch (requestError) {
      setError(
        requestError.response?.data?.detail || "Photo could not be deleted.",
      );
    }
  }
  return (
    <div className={`space-y-6 ${user?.role === "CUSTOMER" ? "customer-work-photos-page" : user?.role === "PAINTER" ? "painter-portal-page painter-work-photos-page" : ""}`}>
      {customerView ? (
        <PageHeader eyebrow="Your project updates" title="Project photos" description="See photos shared for your projects as work progresses." />
      ) : (
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-sm font-semibold text-amber-600">Project evidence</p><h1 className="mt-1 text-3xl font-bold">Work photos</h1></div>
          {canUpload && <button onClick={() => setShowForm(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white"><Plus className="h-4 w-4" />Upload photos</button>}
        </header>
      )}
      {user?.role === "PAINTER" && <section className="painter-photo-focus" aria-label="Painter photo summary"><div><span>Photos shared</span><strong>{data.results.length}</strong><small>Project evidence uploaded</small></div><div><span>In progress</span><strong>{data.results.filter((item) => item.stage === "PROGRESS").length}</strong><small>Current work updates</small></div><div className="is-complete"><span>After work</span><strong>{data.results.filter((item) => item.stage === "AFTER").length}</strong><small>Completion records</small></div></section>}
      {error && (customerView ? <ErrorState message={error} onRetry={load} /> : <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>)}
      {customerView && (
        <section className="customer-photo-journey" aria-label="Photo progress summary">
          <div>
            <span>Before work</span>
            <strong>{data.results.filter((item) => item.stage === "BEFORE").length}</strong>
          </div>
          <div className="is-progress">
            <span>Work in progress</span>
            <strong>{data.results.filter((item) => item.stage === "PROGRESS").length}</strong>
          </div>
          <div className="is-complete">
            <span>After work</span>
            <strong>{data.results.filter((item) => item.stage === "AFTER").length}</strong>
          </div>
        </section>
      )}
      {customerView ? (
        <SectionCard title="Project photos" description="Filter by project or work stage." className="work-photos-filters" bodyClassName="p-0">{filterControls}</SectionCard>
      ) : (
        <section className="overflow-hidden rounded-2xl border bg-white">{filterControls}</section>
      )}
      {customerView && loading ? <LoadingState label="Loading project photos…" /> : customerView && error ? null : photos.length ? (
        <section className="customer-work-photo-grid grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Project photos">
          {photos.map((item) => (
            <article
              key={item.id}
              className="customer-work-photo-card overflow-hidden rounded-2xl border bg-white"
            >
              <a
                href={item.image}
                target="_blank"
                rel="noreferrer"
                className="block aspect-[4/3] bg-slate-100"
              >
                <img
                  src={item.image}
                  alt={item.caption || item.area || item.stage}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              </a>
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    {customerView ? <StatusBadge status={item.stage} label={customerStage(item.stage)} tone={item.stage === "AFTER" ? "success" : item.stage === "BEFORE" ? "neutral" : "info"} /> : <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700">{title(item.stage)}</span>}
                    <h2 className="mt-3 font-bold">{item.quotation_number}</h2>
                    <p className="text-sm text-slate-500">
                      {customerView ? item.property : `${item.customer} · ${item.property}`}
                    </p>
                  </div>
                  {item.can_delete && (
                    <button
                      onClick={() => remove(item)}
                      className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                      title="Delete photo"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {item.area && (
                  <p className="mt-3 text-sm font-semibold">
                    Area: {item.area}
                  </p>
                )}
                {item.caption && (
                  <p className="mt-1 text-sm text-slate-600">{item.caption}</p>
                )}
                <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs text-slate-400">
                  <span>{customerView ? "Project update" : item.uploaded_by}</span>
                  <span>
                    {new Date(item.captured_at).toLocaleString("en-IN")}
                  </span>
                </div>
                <a
                  href={item.image}
                  download
                  className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-indigo-700"
                >
                  <Download className="h-3.5 w-3.5" />
                  Open original
                </a>
              </div>
            </article>
          ))}
        </section>
      ) : customerView ? <EmptyState title={data.results.length ? "No photos match these filters" : "No project photos yet"} description={data.results.length ? "Try another project or work stage." : "Photos shared for your projects will appear here as work progresses."} /> : <div className="rounded-2xl border bg-white p-14 text-center text-slate-400"><Image className="mx-auto h-10 w-10" /><p className="mt-3">No work photos match this view.</p></div>}
      {showForm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4">
          <form
            onSubmit={upload}
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6"
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold">Upload work photos</h2>
                
              </div>
              <button type="button" onClick={() => setShowForm(false)}>
                <X />
              </button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Project">
                <select
                  required
                  value={form.schedule}
                  onChange={(event) =>
                    setForm({ ...form, schedule: event.target.value })
                  }
                >
                  <option value="">Select scheduled project</option>
                  {data.schedules.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.quotation_number} - {item.customer} -{" "}
                      {item.property}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Stage">
                <select
                  value={form.stage}
                  onChange={(event) =>
                    setForm({ ...form, stage: event.target.value })
                  }
                >
                  <option value="BEFORE">Before work</option>
                  <option value="PROGRESS">Work in progress</option>
                  <option value="AFTER">After completion</option>
                </select>
              </Field>
              <Field label="Room / area">
                <input
                  value={form.area}
                  onChange={(event) =>
                    setForm({ ...form, area: event.target.value })
                  }
                  placeholder="Living room, exterior wall..."
                />
              </Field>
              <Field label="Caption">
                <input
                  value={form.caption}
                  onChange={(event) =>
                    setForm({ ...form, caption: event.target.value })
                  }
                  placeholder="Optional note"
                />
              </Field>
              <label className="sm:col-span-2 grid min-h-36 cursor-pointer place-items-center rounded-xl border-2 border-dashed bg-slate-50 p-5 text-center">
                <span>
                  <Camera className="mx-auto h-8 w-8 text-slate-400" />
                  <b className="mt-2 block">Choose photos</b>
                  <small className="text-slate-500">
                    JPG, PNG or camera images · maximum 10 MB each
                  </small>
                  {files.length > 0 && (
                    <span className="mt-2 block text-sm font-bold text-emerald-700">
                      {files.length} photo(s) selected
                    </span>
                  )}
                </span>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  capture="environment"
                  onChange={(event) => setFiles([...event.target.files])}
                  className="hidden"
                />
              </label>
            </div>
            <button
              disabled={busy}
              className="mt-6 w-full rounded-xl bg-slate-950 py-3 font-semibold text-white disabled:opacity-40"
            >
              {busy
                ? "Uploading..."
                : `Upload ${files.length || ""} photo${files.length === 1 ? "" : "s"}`}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="text-sm font-semibold">
      {label}
      <span className="mt-2 block [&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:px-3 [&_input]:py-3 [&_select]:w-full [&_select]:rounded-xl [&_select]:border [&_select]:px-3 [&_select]:py-3">
        {children}
      </span>
    </label>
  );
}
