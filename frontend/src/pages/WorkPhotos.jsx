import { useCallback, useEffect, useMemo, useState } from "react";
import { Camera, Download, Image, Plus, Search, Trash2, X } from "lucide-react";
import api from "../api/client";
import useAuth from "../context/useAuth";

const stages = ["ALL", "BEFORE", "PROGRESS", "AFTER"];
const title = (value) =>
  String(value || "")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function WorkPhotos() {
  const { user } = useAuth();
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
  const canUpload = ["CONTRACTOR", "PAINTER"].includes(user?.role);
  const load = useCallback(async () => {
    try {
      const { data: response } = await api.get("/jobs/work-photos/", {
        params: schedule ? { schedule } : {},
      });
      setData(response);
      setError("");
    } catch (requestError) {
      setError(
        requestError.response?.data?.detail ||
          "Work photos could not be loaded.",
      );
    }
  }, [schedule]);
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
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-amber-600">
            Project evidence
          </p>
          <h1 className="mt-1 text-3xl font-bold">Work photos</h1>
          <p className="mt-2 text-slate-500">
            Keep before, progress and after photos organized against each
            scheduled project.
          </p>
        </div>
        {canUpload && (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            Upload photos
          </button>
        )}
      </header>
      {error && (
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
      )}
      <section className="grid gap-3 rounded-2xl border bg-white p-4 md:grid-cols-[1fr_220px_220px]">
        <label className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search project, customer or area"
            className="w-full bg-transparent text-sm outline-none"
          />
        </label>
        <select
          value={schedule}
          onChange={(event) => setSchedule(event.target.value)}
          className="rounded-xl border px-4 py-3 text-sm"
        >
          <option value="">All projects</option>
          {data.schedules.map((item) => (
            <option key={item.id} value={item.id}>
              {item.quotation_number} - {item.property}
            </option>
          ))}
        </select>
        <select
          value={stage}
          onChange={(event) => setStage(event.target.value)}
          className="rounded-xl border px-4 py-3 text-sm"
        >
          {stages.map((item) => (
            <option key={item} value={item}>
              {item === "ALL" ? "All stages" : title(item)}
            </option>
          ))}
        </select>
      </section>
      {photos.length ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {photos.map((item) => (
            <article
              key={item.id}
              className="overflow-hidden rounded-2xl border bg-white"
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
                  className="h-full w-full object-cover"
                />
              </a>
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700">
                      {title(item.stage)}
                    </span>
                    <h2 className="mt-3 font-bold">{item.quotation_number}</h2>
                    <p className="text-sm text-slate-500">
                      {item.customer} · {item.property}
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
                  <span>{item.uploaded_by}</span>
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
      ) : (
        <div className="rounded-2xl border bg-white p-14 text-center text-slate-400">
          <Image className="mx-auto h-10 w-10" />
          <p className="mt-3">No work photos match this view.</p>
        </div>
      )}
      {showForm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4">
          <form
            onSubmit={upload}
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6"
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold">Upload work photos</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Select several photos to save them under the same project
                  stage.
                </p>
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
