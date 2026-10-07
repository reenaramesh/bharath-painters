import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronDown, Pencil, Phone, Plus, Search, X } from "lucide-react";
import api from "../api/client";
import MobilePageBack from "../components/MobilePageBack";

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [completing, setCompleting] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ next_follow_up: "", comment: "" });
  const [customers, setCustomers] = useState([]);
  const [showAddTask, setShowAddTask] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [newTask, setNewTask] = useState({ follow_up_type: "CALL", next_follow_up: "", comment: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/quotations/tasks/");
      setTasks((data.results || data).filter((task) => task.follow_up_type !== "SITE_VISIT"));
      setError("");
    } catch (requestError) {
      setError(requestError.response?.status === 401
        ? "Your session expired. Please sign in again."
        : "Follow-up tasks could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api.get("/quotations/customers/")
      .then(({ data }) => setCustomers(data.results || data))
      .catch(() => setCustomers([]));
  }, []);

  const groups = useMemo(() => {
    const result = { overdue: [], today: [], upcoming: [] };
    const now = new Date();
    const today = dayKey(now);
    tasks.forEach((task) => {
      const due = new Date(task.next_follow_up);
      const key = dayKey(due);
      if (key < today) result.overdue.push(task);
      else if (key === today) result.today.push(task);
      else result.upcoming.push(task);
    });
    return result;
  }, [tasks]);

  async function complete(task) {
    setCompleting(task.id);
    try {
      await api.patch(`/quotations/tasks/${task.id}/`, { is_completed: true });
      setTasks((current) => current.filter((item) => item.id !== task.id));
    } catch {
      setError("The task could not be completed.");
    } finally {
      setCompleting(null);
    }
  }

  function startEditing(task, date = new Date(task.next_follow_up)) {
    setEditing(task);
    setEditForm({ next_follow_up: toLocalInput(date), comment: task.comment || "" });
  }

  function chooseQuickTime(option) {
    const date = new Date();
    if (option === "two-hours") date.setHours(date.getHours() + 2);
    if (option === "tomorrow") date.setDate(date.getDate() + 1);
    setEditForm((current) => ({ ...current, next_follow_up: toLocalInput(date) }));
  }

  async function saveSchedule(event) {
    event.preventDefault();
    setCompleting(editing.id);
    try {
      const { data } = await api.patch(`/quotations/tasks/${editing.id}/`, {
        next_follow_up: new Date(editForm.next_follow_up).toISOString(),
        comment: editForm.comment,
      });
      setTasks((current) => current.map((task) => task.id === data.id ? data : task));
      setEditing(null);
      setError("");
    } catch (requestError) {
      setError(Object.values(requestError.response?.data || {}).flat().join(" ") || "The task could not be rescheduled.");
    } finally {
      setCompleting(null);
    }
  }

  const customerMatches = customers.filter((customer) => {
    const query = customerSearch.trim().toLowerCase();
    return !query || [customer.name, customer.mobile, customer.bharath_id, customer.city]
      .some((value) => String(value || "").toLowerCase().includes(query));
  }).slice(0, 8);

  function chooseNewQuickTime(option) {
    const date = new Date();
    if (option === "two-hours") date.setHours(date.getHours() + 2);
    if (option === "tomorrow") date.setDate(date.getDate() + 1);
    setNewTask((current) => ({ ...current, next_follow_up: toLocalInput(date) }));
  }

  async function addTask(event) {
    event.preventDefault();
    if (!selectedCustomer) {
      setError("Select a customer for the task.");
      return;
    }
    setAddingTask(true);
    try {
      await api.post(`/quotations/customers/${selectedCustomer.id}/follow-ups/`, {
        ...newTask,
        next_follow_up: new Date(newTask.next_follow_up).toISOString(),
      });
      setShowAddTask(false);
      setSelectedCustomer(null);
      setCustomerSearch("");
      setNewTask({ follow_up_type: "CALL", next_follow_up: "", comment: "" });
      setError("");
      await load();
    } catch (requestError) {
      setError(Object.values(requestError.response?.data || {}).flat().join(" ") || "The task could not be created.");
    } finally {
      setAddingTask(false);
    }
  }

  return (
    <div className="space-y-6">
      <MobilePageBack />
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm font-semibold text-amber-600">Customer follow-ups</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">Tasks</h1>
          </div>
        <button type="button" onClick={() => setShowAddTask(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white"><Plus className="h-4 w-4" />Add task</button>
      </header>

      {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error} <button onClick={load} className="ml-2 font-semibold">Retry</button></div>}

      <div className="grid gap-4 sm:grid-cols-3">
        <CountCard label="Overdue" value={groups.overdue.length} tone="red" />
        <CountCard label="Due today" value={groups.today.length} tone="amber" />
        <CountCard label="Upcoming" value={groups.upcoming.length} tone="blue" />
      </div>

      {loading ? <p className="rounded-2xl border bg-white p-12 text-center text-slate-500">Loading tasks...</p> : (
        <div className="space-y-5">
          <TaskGroup title="Overdue" tasks={groups.overdue} completing={completing} onComplete={complete} onEdit={startEditing} empty="No overdue follow-ups." />
          <TaskGroup title="Today" tasks={groups.today} completing={completing} onComplete={complete} onEdit={startEditing} empty="No follow-ups scheduled for today." />
          <TaskGroup title="Upcoming" tasks={groups.upcoming} completing={completing} onComplete={complete} onEdit={startEditing} empty="No upcoming follow-ups." />
        </div>
      )}
      {editing && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"><form onSubmit={saveSchedule} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"><div className="flex items-start justify-between"><div><h2 className="text-xl font-bold">Reschedule follow-up</h2><p className="mt-1 text-sm text-slate-500">{editing.customer_name}</p></div><button type="button" onClick={() => setEditing(null)} className="rounded-lg p-2 hover:bg-slate-100"><X className="h-5 w-5" /></button></div><div className="mt-5 flex flex-wrap gap-2"><button type="button" onClick={() => chooseQuickTime("two-hours")} className="rounded-xl border px-3 py-2 text-sm font-semibold">2 hours later</button><button type="button" onClick={() => chooseQuickTime("tomorrow")} className="rounded-xl border px-3 py-2 text-sm font-semibold">Tomorrow</button></div><label className="mt-5 block text-sm font-semibold text-slate-700">Callback date and time<input required type="datetime-local" value={editForm.next_follow_up} onChange={(event) => setEditForm({ ...editForm, next_follow_up: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 font-normal outline-none focus:border-slate-900" /></label><label className="mt-4 block text-sm font-semibold text-slate-700">Task note<textarea rows="3" value={editForm.comment} onChange={(event) => setEditForm({ ...editForm, comment: event.target.value })} className="mt-2 w-full resize-none rounded-xl border border-slate-300 px-3 py-3 font-normal outline-none focus:border-slate-900" /></label><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setEditing(null)} className="rounded-xl border px-4 py-2.5 text-sm font-semibold">Cancel</button><button disabled={completing === editing.id} className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Save schedule</button></div></form></div>}
      {showAddTask && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"><form onSubmit={addTask} className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><h2 className="text-xl font-bold">Add customer follow-up</h2></div><button type="button" onClick={() => setShowAddTask(false)} className="rounded-lg p-2 hover:bg-slate-100"><X className="h-5 w-5" /></button></div><div className="relative mt-5"><label className="text-sm font-semibold text-slate-700">Customer *</label><div className="mt-2 flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-3"><Search className="h-4 w-4 text-slate-400" /><input value={customerSearch} onChange={(event) => { setCustomerSearch(event.target.value); setSelectedCustomer(null); }} placeholder="Search name, mobile or Customer ID" className="w-full outline-none" /></div>{!selectedCustomer && <div className="mt-1 max-h-48 overflow-y-auto rounded-xl border bg-white p-1 shadow-lg">{customerMatches.length ? customerMatches.map((customer) => <button key={customer.id} type="button" onClick={() => { setSelectedCustomer(customer); setCustomerSearch(`${customer.name} · ${customer.mobile}`); }} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50"><b className="text-sm">{customer.name}</b><p className="text-xs text-slate-500">{[customer.bharath_id, customer.mobile, customer.city].filter(Boolean).join(" · ")}</p></button>) : <p className="p-3 text-sm text-slate-400">No matching customers.</p>}</div>}</div><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-slate-700">Follow-up type<select value={newTask.follow_up_type} onChange={(event) => setNewTask({ ...newTask, follow_up_type: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 font-normal"><option value="CALL">Call</option><option value="WHATSAPP">WhatsApp</option><option value="MEETING">Meeting</option><option value="SITE_VISIT">Site visit</option><option value="NOTE">Note</option></select></label><label className="text-sm font-semibold text-slate-700">Date and time *<input required type="datetime-local" min={toLocalInput(new Date())} value={newTask.next_follow_up} onChange={(event) => setNewTask({ ...newTask, next_follow_up: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 font-normal" /></label></div><div className="mt-3 flex gap-2"><button type="button" onClick={() => chooseNewQuickTime("two-hours")} className="rounded-lg border px-3 py-2 text-xs font-semibold">2 hours later</button><button type="button" onClick={() => chooseNewQuickTime("tomorrow")} className="rounded-lg border px-3 py-2 text-xs font-semibold">Tomorrow</button></div><label className="mt-4 block text-sm font-semibold text-slate-700">Task note *<textarea required rows="3" value={newTask.comment} onChange={(event) => setNewTask({ ...newTask, comment: event.target.value })} placeholder="What needs to be discussed?" className="mt-2 w-full resize-none rounded-xl border border-slate-300 px-3 py-3 font-normal" /></label><div className="mt-6 flex justify-end gap-3 border-t pt-4"><button type="button" onClick={() => setShowAddTask(false)} className="rounded-xl border px-4 py-2.5 text-sm font-semibold">Cancel</button><button disabled={addingTask} className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{addingTask ? "Saving..." : "Add task"}</button></div></form></div>}
    </div>
  );
}

function TaskGroup({ title, tasks, completing, onComplete, onEdit, empty }) {
  const [open, setOpen] = useState(false);
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between px-5 py-4 text-left">
      <span className="font-bold text-slate-900">{title}</span>
      <span className="flex items-center gap-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold">{tasks.length}</span><ChevronDown className={`h-5 w-5 transition ${open ? "rotate-180" : ""}`} /></span>
    </button>
    {open && (tasks.length ? <div className="overflow-x-auto border-t"><table className="w-full min-w-[920px] text-left text-sm"><thead className="bg-slate-100 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Follow-up</th><th className="px-4 py-3">Date and time</th><th className="px-4 py-3">Mobile</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y">{tasks.map((task) => <tr key={task.id} className="odd:bg-white even:bg-slate-50/70 hover:bg-blue-50/60"><td className="px-4 py-4"><Link to={`/customers/${task.customer}`} className="font-semibold text-slate-900 hover:text-amber-700">{task.customer_name}</Link></td><td className="px-4 py-4 text-slate-600">{task.comment || task.follow_up_type.replaceAll("_", " ")}</td><td data-sort-value={task.next_follow_up} className="px-4 py-4 whitespace-nowrap">{new Date(task.next_follow_up).toLocaleString()}</td><td className="px-4 py-4"><a href={`tel:${task.customer_mobile}`} className="inline-flex items-center gap-1 hover:text-emerald-700"><Phone className="h-3.5 w-3.5" />{task.customer_mobile}</a></td><td className="px-4 py-4"><div className="flex justify-end gap-2"><button onClick={() => onEdit(task)} className="flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold"><Pencil className="h-3.5 w-3.5" />Reschedule</button><button disabled={completing === task.id} onClick={() => onComplete(task)} className="flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Check className="h-3.5 w-3.5" />Complete</button></div></td></tr>)}</tbody></table></div> : <p className="border-t p-7 text-center text-sm text-slate-400">{empty}</p>)}
  </section>;
}

function CountCard({ label, value, tone }) {
  const colors = { red: "bg-red-50 text-red-700", amber: "bg-amber-50 text-amber-700", blue: "bg-blue-50 text-blue-700" };
  return <div className={`rounded-2xl p-5 ${colors[tone]}`}><p className="text-sm font-semibold">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p></div>;
}

function dayKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toLocalInput(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
