import useMobileView from "../hooks/useMobileView.js";
import { recentFirst } from "../utils/workspaceLists.js";
import "./mobile-workspace.css";
import "./tasks.css";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, Check, Pencil, Phone, Plus, Search } from "lucide-react";
import api from "../api/client";
import MobilePageBack from "../components/MobilePageBack";
import ContractorDialog from "../components/ContractorDialog";
import { Button, PageHeader } from "../components/ui";

export default function Tasks() {
  const customerInputId = useId();
  const mobile = useMobileView();
  const [taskView, setTaskView] = useState("ALL");
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
    (mobile ? recentFirst(tasks, ["created_at", "follow_up_date", "next_follow_up"]) : tasks).forEach((task) => {
      const due = new Date(task.next_follow_up);
      const key = dayKey(due);
      if (key < today) result.overdue.push(task);
      else if (key === today) result.today.push(task);
      else result.upcoming.push(task);
    });
    return result;
  }, [tasks, mobile]);

  const mobileTasks = taskView === "ALL"
    ? recentFirst(tasks, ["created_at", "follow_up_date", "next_follow_up"])
    : groups[taskView];

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
    <div className="tasks-page space-y-6">
      <MobilePageBack />
      <PageHeader eyebrow="Customer follow-ups" title="Tasks" description="Plan callbacks, reschedule follow-ups and keep customer conversations moving." actions={<Button onClick={() => setShowAddTask(true)}><Plus size={17} aria-hidden="true" />Add task</Button>} />

      {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error} <button onClick={load} className="ml-2 font-semibold bp-ui-action">Retry</button></div>}

      <section className="mobile-task-summary mobile-square-summary md:hidden" aria-label="Task status filters">
        {[['ALL','All tasks',tasks.length,'slate'],['overdue','Overdue',groups.overdue.length,'red'],['today','Due today',groups.today.length,'amber'],['upcoming','Upcoming',groups.upcoming.length,'blue']].map(([key,label,count,tone]) => <button key={key} type="button" className={(`mobile-square-stat tone-${tone}`) + " bp-ui-action"} aria-pressed={taskView === key} onClick={() => setTaskView(key)}><span>{label}</span><strong>{count}</strong></button>)}
      </section>
      {!loading && <section className="follow-up-mobile-results md:hidden" aria-label="Follow-up tasks">
        <div className="follow-up-card-grid">
          {mobileTasks.map((task) => <FollowUpCard key={task.id} task={task} dueGroup={taskDueGroup(task)} completing={completing} onComplete={complete} onEdit={startEditing} />)}
        </div>
        {mobileTasks.length === 0 && <p className="mobile-list-empty">No follow-up tasks in this view.</p>}
      </section>}
      <div className="hidden gap-4 md:grid md:grid-cols-3">
        <CountCard label="Overdue" value={groups.overdue.length} tone="red" />
        <CountCard label="Due today" value={groups.today.length} tone="amber" />
        <CountCard label="Upcoming" value={groups.upcoming.length} tone="blue" />
      </div>

      {loading ? <p className="rounded-2xl border bg-white p-12 text-center text-slate-500">Loading tasks...</p> : (
        <div className="hidden space-y-5 md:block">
          <TaskGroup title="Overdue" tone="overdue" tasks={groups.overdue} completing={completing} onComplete={complete} onEdit={startEditing} empty="No overdue follow-ups." />
          <TaskGroup title="Today" tone="today" tasks={groups.today} completing={completing} onComplete={complete} onEdit={startEditing} empty="No follow-ups scheduled for today." />
          <TaskGroup title="Upcoming" tone="upcoming" tasks={groups.upcoming} completing={completing} onComplete={complete} onEdit={startEditing} empty="No upcoming follow-ups." />
        </div>
      )}
      {editing && <ContractorDialog title="Reschedule follow-up" icon={CalendarClock} size="md" onClose={() => setEditing(null)} description={<>{editing.customer_name}</>}><form onSubmit={saveSchedule}>
{error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
<div className="mt-5 flex flex-wrap gap-2"><button type="button" onClick={() => chooseQuickTime("two-hours")} className="rounded-xl border px-3 py-2 text-sm font-semibold bp-ui-action">2 hours later</button><button type="button" onClick={() => chooseQuickTime("tomorrow")} className="rounded-xl border px-3 py-2 text-sm font-semibold bp-ui-action">Tomorrow</button></div><label className="mt-5 block text-sm font-semibold text-slate-700">Callback date and time<input required type="datetime-local" value={editForm.next_follow_up} onChange={(event) => setEditForm({ ...editForm, next_follow_up: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 font-normal outline-none focus:border-slate-900 bp-ui-control" /></label><label className="mt-4 block text-sm font-semibold text-slate-700">Task note<textarea rows="3" value={editForm.comment} onChange={(event) => setEditForm({ ...editForm, comment: event.target.value })} className="mt-2 w-full resize-none rounded-xl border border-slate-300 px-3 py-3 font-normal outline-none focus:border-slate-900 bp-ui-control" /></label><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setEditing(null)} className="rounded-xl border px-4 py-2.5 text-sm font-semibold bp-ui-action">Cancel</button><button disabled={completing === editing.id} className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 bp-ui-action">Save schedule</button></div></form></ContractorDialog>}
      {showAddTask && <ContractorDialog title="Add customer follow-up" icon={CalendarClock} size="md" onClose={() => setShowAddTask(false)}><form onSubmit={addTask}>
{error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
<div className="relative mt-5"><label htmlFor={customerInputId} className="text-sm font-semibold text-slate-700">Customer *</label><div className="mt-2 flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-3"><Search className="h-4 w-4 text-slate-400" /><input id={customerInputId} value={customerSearch} onChange={(event) => { setCustomerSearch(event.target.value); setSelectedCustomer(null); }} placeholder="Search name, mobile or Customer ID" className="w-full outline-none bp-ui-control" /></div>{!selectedCustomer && <div className="mt-1 max-h-48 overflow-y-auto rounded-xl border bg-white p-1 shadow-lg">{customerMatches.length ? customerMatches.map((customer) => <button key={customer.id} type="button" onClick={() => { setSelectedCustomer(customer); setCustomerSearch(`${customer.name} · ${customer.mobile}`); }} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50 bp-ui-action"><b className="text-sm">{customer.name}</b><p className="text-xs text-slate-500">{[customer.bharath_id, customer.mobile, customer.city].filter(Boolean).join(" · ")}</p></button>) : <p className="p-3 text-sm text-slate-400">No matching customers.</p>}</div>}</div><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-slate-700">Follow-up type<select value={newTask.follow_up_type} onChange={(event) => setNewTask({ ...newTask, follow_up_type: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 font-normal bp-ui-control"><option value="CALL">Call</option><option value="WHATSAPP">WhatsApp</option><option value="MEETING">Meeting</option><option value="SITE_VISIT">Site visit</option><option value="NOTE">Note</option></select></label><label className="text-sm font-semibold text-slate-700">Date and time *<input required type="datetime-local" min={toLocalInput(new Date())} value={newTask.next_follow_up} onChange={(event) => setNewTask({ ...newTask, next_follow_up: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 font-normal bp-ui-control" /></label></div><div className="mt-3 flex gap-2"><button type="button" onClick={() => chooseNewQuickTime("two-hours")} className="rounded-lg border px-3 py-2 text-xs font-semibold bp-ui-action">2 hours later</button><button type="button" onClick={() => chooseNewQuickTime("tomorrow")} className="rounded-lg border px-3 py-2 text-xs font-semibold bp-ui-action">Tomorrow</button></div><label className="mt-4 block text-sm font-semibold text-slate-700">Task note *<textarea required rows="3" value={newTask.comment} onChange={(event) => setNewTask({ ...newTask, comment: event.target.value })} placeholder="What needs to be discussed?" className="mt-2 w-full resize-none rounded-xl border border-slate-300 px-3 py-3 font-normal bp-ui-control" /></label><div className="mt-6 flex justify-end gap-3 border-t pt-4"><button type="button" onClick={() => setShowAddTask(false)} className="rounded-xl border px-4 py-2.5 text-sm font-semibold bp-ui-action">Cancel</button><button disabled={addingTask} className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 bp-ui-action">{addingTask ? "Saving..." : "Add task"}</button></div></form></ContractorDialog>}
    </div>
  );
}

function TaskGroup({ title, tone, tasks, completing, onComplete, onEdit, empty }) {
  return <section className="follow-up-group" aria-label={`${title} follow-ups`}>
    <header className={`follow-up-group-heading is-${tone}`}>
      <h2>{title}</h2>
      <span>{tasks.length}</span>
    </header>
    {tasks.length ? <div className="follow-up-card-grid">
      {tasks.map((task) => <FollowUpCard key={task.id} task={task} dueGroup={tone} completing={completing} onComplete={onComplete} onEdit={onEdit} />)}
    </div> : <p className="follow-up-empty">{empty}</p>}
  </section>;
}

function FollowUpCard({ task, dueGroup, completing, onComplete, onEdit }) {
  const dueLabel = { overdue: "Overdue", today: "Due today", upcoming: "Upcoming" }[dueGroup];
  const followUpType = task.follow_up_type.replaceAll("_", " ");
  const fullNote = String(task.comment || "").trim();
  const hasLongNote = fullNote.length > 55;
  const notePreview = hasLongNote ? `${fullNote.slice(0, 52).trimEnd()}…` : fullNote || "No task note";
  const busy = completing === task.id;
  return <article className={`follow-up-card is-${dueGroup}`}>
    <div className="follow-up-card-top">
      <span className="follow-up-type">{followUpType}</span>
      <span className={`follow-up-due is-${dueGroup}`}>{dueLabel}</span>
    </div>
    <Link to={`/customers/${task.customer}`} className="follow-up-customer">{task.customer_name}</Link>
    <time className="follow-up-date" dateTime={task.next_follow_up}>
      {new Date(task.next_follow_up).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
    </time>
    <p className={`follow-up-note${hasLongNote ? " is-preview" : ""}`}>{notePreview}</p>
    {hasLongNote && <details className="follow-up-full-note">
      <summary>Read full note</summary>
      <p>{fullNote}</p>
    </details>}
    <div className="follow-up-card-actions" aria-label={`Actions for ${task.customer_name}`}>
      <a className="follow-up-icon-action" href={task.customer_mobile ? `tel:${task.customer_mobile}` : undefined} aria-label={task.customer_mobile ? `Call ${task.customer_name}` : `No phone number for ${task.customer_name}`} aria-disabled={!task.customer_mobile} title="Call customer">
        <Phone size={17} aria-hidden="true" /><span>Call</span>
      </a>
      <button className="follow-up-icon-action bp-ui-action" type="button" onClick={() => onEdit(task)} aria-label={`Reschedule ${task.customer_name}`} title="Reschedule follow-up">
        <Pencil size={17} aria-hidden="true" /><span>Move</span>
      </button>
      <button className="follow-up-icon-action is-complete bp-ui-action" type="button" disabled={busy} onClick={() => onComplete(task)} aria-label={`Complete follow-up for ${task.customer_name}`} title="Complete follow-up">
        <Check size={17} aria-hidden="true" /><span>{busy ? "Saving" : "Done"}</span>
      </button>
    </div>
  </article>;
}

function taskDueGroup(task) {
  const key = dayKey(new Date(task.next_follow_up));
  const today = dayKey(new Date());
  return key < today ? "overdue" : key === today ? "today" : "upcoming";
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
