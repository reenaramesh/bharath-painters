import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "../../api/client";
import useAuth from "../../context/useAuth";
import useDraftUnsavedChanges from "../../hooks/useDraftUnsavedChanges";
import MobilePageBack from "../MobilePageBack";
import TasksView from "./TasksView";
import TaskFollowupWorkspace from "./TaskFollowupWorkspace";
import TaskRescheduleDialog from "./TaskRescheduleDialog";
import { calendarQuery, indiaDay, initialTaskFilters, matchesTaskDate, rowDueGroup } from "./task-calendar";
import { requestError } from "../leads/lead-format";

const rowsFrom = data => Array.isArray(data) ? data : data?.results || [];
const emptyResource = { rows: [], loading: false, error: "", count: 0, key: "" };
const initialSettings = view => ({ filters: initialTaskFilters(view), scope: view === "scheduled" ? "today" : "all", category: "all", search: "", page: 1, pageSize: 25 });

export default function Tasks() {
  const { user } = useAuth();
  return <TaskWorkspace key={user?.id || "signed-out"} user={user} />;
}

function TaskWorkspace({ user }) {
  const [view, setView] = useState("scheduled");
  const [settings, setSettings] = useState(() => ({ scheduled: initialSettings("scheduled"), customers: initialSettings("customers") }));
  const [scheduled, setScheduled] = useState({ ...emptyResource, loading: true });
  const [customers, setCustomers] = useState(emptyResource);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [completingId, setCompletingId] = useState(null);
  const [moving, setMoving] = useState(null);
  const [moveDrafts, setMoveDrafts] = useState({});
  const [followupTarget, setFollowupTarget] = useState(null);
  const [today, setToday] = useState(indiaDay);
  const asOf = useMemo(() => new Date(`${today}T12:00:00+05:30`), [today]);
  const live = useRef(true);
  const versions = useRef({ scheduled: 0, customers: 0 });
  const completionLock = useRef(false);
  const current = settings[view];
  useDraftUnsavedChanges(Object.values(moveDrafts).some(draft => draft.edited), true, { preservePathname: "/tasks" });
  const dateQuery = useMemo(() => {
    try { return { params: calendarQuery(current.filters), error: "" }; }
    catch (failure) { return { params: null, error: failure.message }; }
  }, [current.filters]);
  const customerQuery = useMemo(() => JSON.stringify({ ...(dateQuery.params || {}), search: current.search.trim(), category: current.category, page: current.page, page_size: current.pageSize }), [dateQuery.params, current.search, current.category, current.page, current.pageSize]);
  const customerQueryRef = useRef(null);
  customerQueryRef.current = view === "customers" && !dateQuery.error ? customerQuery : null;

  useEffect(() => {
    live.current = true;
    return () => { live.current = false; versions.current.scheduled += 1; versions.current.customers += 1; };
  }, []);

  const loadScheduled = useCallback(async () => {
    if (!live.current || user?.role !== "CONTRACTOR") return;
    const version = ++versions.current.scheduled;
    setScheduled(previous => ({ ...previous, loading: true, error: "" }));
    try {
      const { data } = await api.get("/quotations/tasks/");
      if (!live.current || version !== versions.current.scheduled) return;
      // Actual site visits retain their dedicated scheduling screen.
      const rows = rowsFrom(data).filter(task => task.follow_up_type !== "SITE_VISIT" && !task.is_completed && task.next_follow_up);
      setScheduled({ rows, loading: false, error: "", count: rows.length, key: "scheduled" });
    } catch (failure) {
      if (!live.current || version !== versions.current.scheduled) return;
      setScheduled(previous => ({ ...previous, ...([401, 403, 404].includes(failure.response?.status) ? { rows: [], count: 0 } : {}), loading: false, error: requestError(failure, "Scheduled follow-ups could not be refreshed. Please retry.") }));
    }
  }, [user?.role]);

  const loadCustomers = useCallback(async () => {
    if (!live.current || user?.role !== "CONTRACTOR" || view !== "customers" || dateQuery.error || customerQueryRef.current !== customerQuery) return;
    const version = ++versions.current.customers;
    const key = customerQuery;
    setCustomers(previous => ({ ...previous, loading: true, error: "" }));
    try {
      const { data } = await api.get("/quotations/customers/follow-up-candidates/", { params: JSON.parse(key) });
      if (!live.current || version !== versions.current.customers || customerQueryRef.current !== key) return;
      const lastPage = Math.max(1, Math.ceil((data.count || 0) / JSON.parse(key).page_size));
      if (JSON.parse(key).page > lastPage) {
        setSettings(previous => ({ ...previous, customers: { ...previous.customers, page: lastPage } }));
        setCustomers(previous => ({ ...previous, loading: false, error: "" }));
        return;
      }
      setCustomers({ rows: rowsFrom(data), count: data.count ?? rowsFrom(data).length, loading: false, error: "", key });
    } catch (failure) {
      if (!live.current || version !== versions.current.customers || customerQueryRef.current !== key) return;
      setCustomers(previous => ({ ...previous, ...([401, 403, 404].includes(failure.response?.status) ? { rows: [], count: 0 } : {}), loading: false, error: requestError(failure, "Customer follow-up suggestions could not be refreshed. Please retry.") }));
    }
  }, [customerQuery, dateQuery.error, user?.role, view]);

  useEffect(() => { loadScheduled(); }, [loadScheduled]);
  useEffect(() => {
    const nextMidnight = Date.parse(`${today}T00:00:00+05:30`) + 24 * 60 * 60 * 1000;
    const timer = window.setTimeout(() => setToday(indiaDay()), Math.max(50, nextMidnight - Date.now() + 50));
    return () => window.clearTimeout(timer);
  }, [today]);
  useEffect(() => {
    if (view !== "customers" || dateQuery.error) { versions.current.customers += 1; setCustomers(previous => ({ ...previous, loading: false })); return undefined; }
    const timer = window.setTimeout(loadCustomers, current.search ? 250 : 0);
    return () => { window.clearTimeout(timer); versions.current.customers += 1; };
  }, [loadCustomers, view, dateQuery.error, current.search]);

  const refresh = useCallback(async () => {
    setActionError("");
    await Promise.allSettled([loadScheduled(), ...(view === "customers" ? [loadCustomers()] : [])]);
  }, [loadScheduled, loadCustomers, view]);
  useEffect(() => {
    const focused = () => { if (document.visibilityState === "visible") { setToday(indiaDay()); refresh(); } };
    window.addEventListener("focus", focused);
    return () => window.removeEventListener("focus", focused);
  }, [refresh]);

  function changeSettings(change) {
    setSettings(previous => ({ ...previous, [view]: { ...previous[view], ...change } }));
  }
  function changeScope(scope) {
    changeSettings({ scope, page: 1, filters: { ...current.filters, date_type: "next_follow_up", period: "all" } });
  }
  const calendarRows = useMemo(() => {
    if (dateQuery.error || view !== "scheduled") return [];
    const query = settings.scheduled.search.trim().toLowerCase();
    return scheduled.rows.filter(row => matchesTaskDate(row, current.filters) && (!query || [row.customer_name, row.customer_mobile, row.customer_bharath_id, row.requirement, row.opportunity_title, row.last_service_name, row.comment].some(value => String(value || "").toLowerCase().includes(query))));
  }, [scheduled.rows, current.filters, dateQuery.error, settings.scheduled.search, view]);
  const counts = useMemo(() => calendarRows.reduce((result, row) => { result.all += 1; const group = rowDueGroup(row, asOf); if (group in result) result[group] += 1; return result; }, { all: 0, today: 0, overdue: 0, upcoming: 0 }), [calendarRows, asOf]);
  const filtered = useMemo(() => calendarRows.filter(row => current.scope === "all" || rowDueGroup(row, asOf) === current.scope)
    .sort((left, right) => Date.parse(left.next_follow_up) - Date.parse(right.next_follow_up) || Number(left.id) - Number(right.id)), [calendarRows, current.scope, asOf]);
  const customerResultsMatch = customers.key === customerQuery && !dateQuery.error;
  const total = view === "scheduled" ? filtered.length : customerResultsMatch ? customers.count : 0;
  const page = view === "scheduled" ? Math.min(current.page, Math.max(1, Math.ceil(total / current.pageSize))) : current.page;
  const rows = view === "scheduled" ? filtered.slice((page - 1) * current.pageSize, page * current.pageSize) : customerResultsMatch ? customers.rows : [];

  async function saved(message = "Follow-up saved.") {
    if (!live.current) return;
    setNotice(message); setActionError("");
    await refresh();
    if (live.current) window.requestAnimationFrame(() => {
      if (live.current && document.activeElement === document.body) document.querySelector('[data-task-results-heading]')?.focus({ preventScroll: true });
    });
  }
  async function complete(task) {
    if (completionLock.current || task.can_follow_up === false || task.is_completed || !task.next_follow_up) return;
    completionLock.current = true; setCompletingId(task.id); setActionError("");
    try {
      await api.patch(`/quotations/tasks/${task.id}/`, { is_completed: true });
      if (!live.current) return;
      setScheduled(previous => ({ ...previous, rows: previous.rows.filter(row => row.id !== task.id) }));
      await saved("Follow-up marked as done.");
    } catch (failure) { if (live.current) setActionError(requestError(failure, "The follow-up could not be completed. Please retry.")); }
    finally { completionLock.current = false; if (live.current) setCompletingId(null); }
  }
  function moveDraftChanged(draft) {
    const key = moving.id;
    setMoveDrafts(previous => { const next = { ...previous }; if (draft) next[key] = draft; else delete next[key]; return next; });
  }
  if (user?.role !== "CONTRACTOR") return <div className="tasks-page"><p role="alert">Contractor access is required for customer follow-ups.</p></div>;
  const resource = view === "scheduled" ? scheduled : customers;
  return <div className="tasks-page space-y-4">
    <MobilePageBack />
    <TasksView view={view} onViewChange={setView} filters={current.filters} onFiltersChange={filters => changeSettings({ filters, scope: "all", page: 1 })}
      scope={current.scope} onScopeChange={changeScope} category={current.category} onCategoryChange={category => changeSettings({ category, page: 1 })}
      search={current.search} onSearchChange={search => changeSettings({ search, page: 1 })} rows={rows} counts={counts} loading={resource.loading || (view === "customers" && !dateQuery.error && !resource.error && !customerResultsMatch)}
      error={dateQuery.error || actionError || resource.error} onRetry={refresh} notice={notice} onRefresh={refresh}
      page={page} pageSize={current.pageSize} total={total} onPageChange={next => changeSettings({ page: next })} onPageSizeChange={pageSize => changeSettings({ pageSize, page: 1 })}
      completingId={completingId} onComplete={complete} onMove={task => { if (task.can_follow_up !== false) setMoving(task); }} onFollowUp={setFollowupTarget} />
    <TaskFollowupWorkspace target={followupTarget} onClose={() => setFollowupTarget(null)} onSaved={saved} />
    {moving && <TaskRescheduleDialog key={moving.id} task={moving} draft={moveDrafts[moving.id]} onDraftChange={moveDraftChanged} onClose={() => setMoving(null)} onSaved={async data => {
      if (!live.current) return;
      setMoving(null); setScheduled(previous => ({ ...previous, rows: previous.rows.map(row => row.id === data.id ? { ...row, ...data } : row) }));
      await saved("Follow-up rescheduled.");
    }} />}
  </div>;
}
