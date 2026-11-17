import { useSearchParams, Link } from "react-router-dom";
import EmployeeQuickActions from "../components/EmployeeQuickActions";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Clock3, IndianRupee, WalletCards } from "lucide-react";
import api from "../api/client";
import { ErrorState, LoadingState, PageHeader, StatCard } from "../components/ui";
import { formatINRAmount } from "../types/financialDisplay";
import "./painter-workspace-ui.css";

const currentMonth = new Date().toLocaleDateString("en-CA").slice(0, 7);
// Legacy earnings APIs return numbers as well as decimal strings. Convert only
// for display; the shared formatter deliberately accepts decimal strings only.
const money = value => formatINRAmount(typeof value === "number"
  ? (Number.isFinite(value) ? value.toFixed(2) : "")
  : String(value ?? "0")) ?? "\u2014";

export default function InHouseEarnings() {
  const [params] = useSearchParams();
  const section = params.get("section");
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [employments, setEmployments] = useState([]);
  const [membershipId, setMembershipId] = useState("");
  const [contextLoaded, setContextLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const version = useRef(0);
  useEffect(() => {
    let active = true;
    api.get("/jobs/my-in-house-employment/").then(({data: employment}) => {
      if (!active) return;
      setEmployments(employment.employments || [employment]);
      setMembershipId(String(employment.membership_id || ""));
    }).catch(() => { if (active) setEmployments([]); })
      .finally(() => { if (active) setContextLoaded(true); });
    return () => { active = false; };
  }, []);
  const load = useCallback(async () => {
    const requestId = ++version.current;
    setLoading(true);
    try {
      const membership = membershipId ? `&membership_id=${encodeURIComponent(membershipId)}` : "";
      const { data: result } = await api.get(`/jobs/my-in-house-earnings/?month=${month}${membership}`);
      if (requestId === version.current) { setData(result); setError(""); }
    } catch (failure) {
      if (requestId === version.current) setError(failure.response?.data?.detail || "Earnings could not be loaded.");
    } finally { if (requestId === version.current) setLoading(false); }
  }, [month, membershipId]);
  useEffect(() => {
    if (contextLoaded) load();
    return () => { version.current += 1; };
  }, [load, contextLoaded]);
  useEffect(() => {
    if (section === "bonus" && data) document.getElementById("employee-bonus")?.scrollIntoView({block: "start"});
  }, [section, data]);
  const weeks = useMemo(() => groupWeeks(data?.attendance || []), [data]);
  const marketplace = data?.earning_type === "MARKETPLACE";
  const rows = data?.attendance || [];
  return <div className="employee-page space-y-6">
    {data && (marketplace ? <nav className="employee-quick-actions" aria-label="Painter earnings navigation">
      <Link to="/painter-assignments">My assignments</Link><Link to="/job-activity?section=HISTORY">Work history</Link><Link to="/in-house-earnings" aria-current={!section ? "page" : undefined}>Earnings</Link>
      <Link to="/in-house-earnings?section=bonus" aria-current={section === "bonus" ? "page" : undefined}>Bonuses</Link>
    </nav> : <EmployeeQuickActions />)}
    <PageHeader eyebrow={marketplace ? "Applicator assignments" : "In-house employment"} title="My Earnings"
      description={marketplace ? "Review earnings from your assignments and recorded bonuses." : "Review your monthly earnings, attendance and recorded bonuses."}
      actions={<div className="flex flex-wrap gap-3">
        {employments.length > 1 && <label className="text-sm font-semibold">Employer<select aria-label="Select employer payroll records" value={membershipId} onChange={e => setMembershipId(e.target.value)} className="ml-2 rounded-xl border px-3 py-3 bp-ui-control">{employments.map(item => <option key={item.membership_id} value={item.membership_id}>{item.contractor_name}</option>)}</select></label>}
        <input aria-label="Earnings month" type="month" value={month} onChange={e => setMonth(e.target.value)} className="rounded-xl border px-4 py-3 bp-ui-control" />
      </div>} />
    {error && <ErrorState message={error} onRetry={load} />}
    {loading && <LoadingState label={data ? "Refreshing earnings..." : "Loading earnings..."} />}
    {data && <>
      <section className="rounded-2xl border bg-white p-6">
        <div><p className="break-words text-sm text-slate-500">{data.employee_code}{" \u00b7 "}{data.employee_name}{data.contractor_name ? ` \u00b7 ${data.contractor_name}` : ""}</p>
          <p className="mt-1 font-semibold">{marketplace ? "Earnings based on agreed assignment wages." : `Salary: ${money(data.salary_amount)} / ${label(data.salary_basis)}`}</p>
        </div>
        <div className={`mt-5 grid grid-cols-2 gap-3 ${marketplace ? "lg:grid-cols-4" : "lg:grid-cols-5"}`}>
          <Card icon={WalletCards} title="Total this month" value={money(data.earned_amount)} tone="emerald" />
          <Card icon={IndianRupee} title={marketplace ? "Assignment earnings" : "Attendance earning"} value={money(data.attendance_earning)} tone="blue" />
          <Card icon={IndianRupee} title="Bonus" value={money(data.bonus_total)} tone="amber" />
          <Card icon={CalendarDays} title={marketplace ? "Assignment days" : "Payable days"} value={data.payable_days} tone="blue" />
          {!marketplace && <Card icon={Clock3} title="Overtime" value={`${data.overtime_hours} hrs`} tone="violet" />}
        </div>
      </section>
      <section className="overflow-hidden rounded-2xl border bg-white">
        <h2 className="border-b p-5 font-bold bp-ui-section-heading">{marketplace ? "Assignment earnings" : "Weekly earning breakdown"}</h2>
        {marketplace ? <div className="divide-y">
          {rows.map(row => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div className="min-w-0"><p className="break-words font-semibold">{row.quotation_number || "Assignment"}</p>
              <p className="text-sm text-slate-600">{row.contractor || "Contractor"}</p>
              {row.can_view_project !== false && row.property && <p className="text-sm text-slate-600">{row.property}</p>}
              <p className="mt-1 text-xs text-slate-500">{row.date}{row.end_date ? ` to ${row.end_date}` : ""}{" \u00b7 "}{row.units} days</p>
            </div><strong>{money(row.earning)}</strong>
          </div>)}
          {!rows.length && <p className="p-8 text-center text-sm text-slate-500">No assignment earnings for this month.</p>}
        </div> : <>
          <div className="employee-weekly-row grid grid-cols-[1fr_120px_150px_110px] gap-3 bg-slate-50 px-5 py-3 text-xs font-bold uppercase text-slate-500"><span>Week</span><span>Payable days</span><span>Earned</span><span>Overtime</span></div>
          {weeks.map(week => <div key={week.key} className="employee-weekly-row grid grid-cols-[1fr_120px_150px_110px] gap-3 border-t px-5 py-4 text-sm"><b>{week.start} to {week.end}</b><span>{week.units}</span><span className="font-bold text-emerald-700">{money(week.earning)}</span><span>{week.overtime} hrs</span></div>)}
          {!weeks.length && <p className="p-8 text-center text-sm text-slate-500">No attendance earnings for this month.</p>}
        </>}
      </section>
      {data.earning_type === "IN_HOUSE" && <section className="overflow-hidden rounded-2xl border bg-white">
        <h2 className="border-b p-5 font-bold bp-ui-section-heading">Recorded wages and payments</h2>
        <div className="grid gap-4 border-b p-5 sm:grid-cols-3"><div><span className="text-sm text-slate-500">Payments</span><p className="font-bold text-emerald-700">{money(data.payments_total)}</p></div><div><span className="text-sm text-slate-500">Advances</span><p className="font-bold text-amber-700">{money(data.advances_total)}</p></div><div><span className="text-sm text-slate-500">Outstanding balance</span><p className="font-bold">{money(data.outstanding_balance)}</p></div></div>
        {!data.ledger?.length && <p className="p-5 text-sm text-slate-500">No wage ledger entries for this month.</p>}
        {data.ledger?.map(row => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4"><div><b>{row.entry_type.replaceAll("_", " ")}</b><p className="text-xs text-slate-500">{row.date}{row.note ? ` \u00b7 ${row.note}` : ""}</p>{row.reference && <p className="text-xs text-slate-500">Reference: {row.reference}</p>}</div><strong>{money(row.amount)}</strong></div>)}
      </section>}
      <section id="employee-bonus" className="scroll-mt-20 overflow-hidden rounded-2xl border bg-white">
        <h2 className="border-b p-5 font-bold bp-ui-section-heading">Bonuses received</h2>
        {!data.bonuses.length && <p className="p-5 text-sm text-slate-500">No bonus recorded for this month.</p>}
        {data.bonuses.map(item => <div key={item.id} className="flex items-center justify-between gap-4 border-t px-5 py-4"><div><b>{item.note || "Performance bonus"}</b><p className="text-xs text-slate-500">{item.date}</p></div><strong className="text-emerald-700">+ {money(item.amount)}</strong></div>)}
      </section>
    </>}
  </div>;
}

function groupWeeks(rows){const groups={};for(const row of rows){const date=new Date(`${row.date}T00:00:00`),day=(date.getDay()+6)%7,start=new Date(date);start.setDate(date.getDate()-day);const end=new Date(start);end.setDate(start.getDate()+6);const key=start.toLocaleDateString("en-CA");groups[key]||={key,start:start.toLocaleDateString("en-GB"),end:end.toLocaleDateString("en-GB"),units:0,earning:0,overtime:0};groups[key].units+=Number(row.units);groups[key].earning+=Number(row.earning);groups[key].overtime+=Number(row.overtime_hours)}return Object.values(groups)}
function Card({icon:Icon,title,value,tone}){return <StatCard icon={Icon} label={title} value={value} tone={({emerald:"success",blue:"info",amber:"warning",violet:"brand"})[tone]}/>}

function label(value){return {MONTHLY:"Fixed monthly salary",WEEKLY:"Weekly wage",DAILY:"Daily wage"}[value]||value}
