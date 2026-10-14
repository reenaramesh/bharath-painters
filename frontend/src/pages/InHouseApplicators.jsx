import { useCallback,useEffect,useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import EmployeeQuickActions from "../components/EmployeeQuickActions";
import useMobileView from "../hooks/useMobileView.js";
import { CalendarCheck,Plus } from "lucide-react";
import api from "../api/client";
import useAuth from "../context/useAuth";

const today=new Date().toLocaleDateString("en-CA"), currentMonth=today.slice(0,7);
const errorText=(e,f)=>e.response?.data?.detail||Object.values(e.response?.data||{}).flat().join(" ")||f;
export default function InHouseApplicators(){const {user}=useAuth();return user.role==="PAINTER"?<SelfAttendance/>:<Directory/>}

function Directory() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const mobile = useMobileView();
  const [params] = useSearchParams();
  const section = params.get("section");
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    if (user?.role !== 'CONTRACTOR') return;
    api.get('/jobs/in-house-applicators/').then(({data}) => setItems(data.results || data)).catch(e => setError(errorText(e,'Employees could not be loaded.'))).finally(() => setLoading(false));
  }, [user?.role]);
  if (user?.role !== 'CONTRACTOR') return <p role="alert">Only the issuing contractor can view their employee directory.</p>;
  const rows = items.filter(item => (includeInactive || item.is_active !== false) && [item.name,item.mobile,item.employee_code,item.skills].some(value => String(value || '').toLowerCase().includes(search.trim().toLowerCase())));
  const employeeUrl = item => `/in-house-applicators/${item.membership_id}${section ? `?section=${encodeURIComponent(section)}` : ''}`;
  return <div className="employee-page space-y-5">
    <Header action={<Link to="/in-house-applicators/new" className="flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white"><Plus size={16} />Create employee</Link>} />
    <EmployeeQuickActions />
    {section && <p className="text-sm text-slate-600">Select an employee to {({attendance:'record attendance',wages:'view wages',bonus:'add an extra bonus',leaves:'record or view leave'})[section] || 'view their details'}.</p>}
    <div className="employee-list-tools"><input className="bp-ui-control" type="search" aria-label="Search employees" placeholder="Search name, mobile, ID or skills" value={search} onChange={event => setSearch(event.target.value)} /><label className="inline-flex min-h-11 items-center gap-2 text-xs"><input type="checkbox" checked={includeInactive} onChange={event => setIncludeInactive(event.target.checked)} />Include removed employees</label></div>
    {error && <Error text={error} />}
    <div className="employee-table-wrap"><table className="employee-table" data-mobile-table="keep" aria-label="Employees">
      <thead><tr><th scope="col">Employee</th><th scope="col">Contact</th><th scope="col">Salary / wage</th>{!mobile && <><th scope="col">Joining date</th><th scope="col">Status</th></>}</tr></thead>
      <tbody>{rows.map(item => <tr key={item.membership_id} tabIndex={0} aria-label={`Open employee ${item.name}`} onClick={() => navigate(employeeUrl(item))} onKeyDown={event => { if (event.target === event.currentTarget && ['Enter',' '].includes(event.key)) { event.preventDefault(); navigate(employeeUrl(item)); } }}>
        <td><Link onClick={event => event.stopPropagation()} to={employeeUrl(item)}><strong>{item.name}</strong><small>{item.employee_code || 'ID pending'}</small>{mobile && <small>Joined {item.joined_on || 'Not set'}</small>}</Link>{mobile && <span className={`employee-status ${item.is_active === false ? 'is-inactive' : ''}`}>{item.is_active === false ? 'Removed' : 'Active'}</span>}</td>
        <td><a onClick={event => event.stopPropagation()} href={`tel:${item.mobile}`}>{item.mobile || 'Not provided'}</a>{item.email && <small>{item.email}</small>}</td>
        <td data-sort-value={item.salary_amount || 0}><strong>{item.salary_amount == null ? 'Not set' : `Rs. ${Number(item.salary_amount).toLocaleString('en-IN')}`}</strong><small>{({MONTHLY:'Monthly',WEEKLY:'Weekly',DAILY:'Daily'})[item.salary_basis] || item.salary_basis || 'Not set'}</small></td>
        {!mobile && <><td>{item.joined_on || 'Not set'}</td><td><span className={`employee-status ${item.is_active === false ? 'is-inactive' : ''}`}>{item.is_active === false ? 'Removed' : 'Active'}</span></td></>}
      </tr>)}{!rows.length && <tr><td colSpan={mobile ? 3 : 5} className="p-8 text-center text-slate-500">{loading ? 'Loading employees...' : items.length ? 'No employees match this view.' : 'Create your first employee.'}</td></tr>}</tbody>
    </table></div>
  </div>;
}

function SelfAttendance(){const [params]=useSearchParams();const [data,setData]=useState(null),[month,setMonth]=useState(currentMonth),[site,setSite]=useState(""),[error,setError]=useState("");const load=useCallback(async()=>{try{setData((await api.get(`/jobs/my-in-house-employment/?month=${month}`)).data);setError("");}catch(e){setError(errorText(e,"Employment record could not be loaded."));}},[month]);useEffect(()=>{load();},[load]);async function present(){try{await api.post(`/jobs/in-house-applicators/${data.membership_id}/attendance/`,{date:today,status:"PRESENT",schedule:site});await load();}catch(e){setError(errorText(e,"Attendance could not be marked."));}}return <div className="employee-page space-y-6"><Header/><EmployeeQuickActions/>{error&&<Error text={error}/>} {data&&<><section className="rounded-2xl border bg-white p-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm text-slate-500">{data.employee_code}</p><h2 className="text-2xl font-bold bp-ui-section-heading">{data.name}</h2></div><input type="month" value={month} onChange={e=>setMonth(e.target.value)} className="rounded-xl border px-4 py-3 bp-ui-control"/></div><Summary data={data.attendance_summary}/></section><section className="rounded-2xl border bg-white p-6"><h2 className="flex items-center gap-2 font-bold bp-ui-section-heading"><CalendarCheck className="h-5 w-5"/>Today’s site check-in</h2><div className="mt-4 flex flex-col gap-3 sm:flex-row"><select value={site} onChange={e=>setSite(e.target.value)} className="flex-1 rounded-xl border px-4 py-3 bp-ui-control"><option value="">Select assigned site</option>{data.assignments.map(x=><option key={x.id} value={x.schedule}>{x.quotation_number} · {x.property_name}</option>)}</select><button disabled={!site} onClick={present} className="rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white disabled:opacity-40 bp-ui-action">Mark Present</button></div></section>{params.get("section")==="leaves" && <section className="rounded-xl border bg-white p-4"><h2 className="font-semibold bp-ui-section-heading">Leave records</h2>{data.attendance.filter(row=>row.status==="LEAVE").map(row=><p key={row.id} className="border-b py-3 text-sm">{row.date} {row.note}</p>)}{!data.attendance.some(row=>row.status==="LEAVE") && <p className="mt-3 text-sm text-slate-500">No leave recorded for this month.</p>}</section>}<Attendance rows={data.attendance} month={month}/></>}</div>}
export function Summary({data={}}){return <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">{[["Present",data.present,"emerald"],["Half-day",data.half_day,"amber"],["Absent",data.absent,"red"],["Leave",data.leave,"blue"],["Overtime",`${data.overtime_hours||0} hrs`,"violet"]].map(([a,b,c])=><div key={a} className={`rounded-xl bg-${c}-50 p-4`}><p className="text-xs text-slate-500">{a}</p><p className="mt-1 text-2xl font-bold">{b||0}</p></div>)}</div>}
export function Attendance({rows=[],month=currentMonth,onSelect}){const [year,number]=month.split("-").map(Number);const first=new Date(year,number-1,1),offset=(first.getDay()+6)%7,days=new Date(year,number,0).getDate();const cells=Array.from({length:42},(_,i)=>{const day=i-offset+1;return day>0&&day<=days?day:null});const records=new Map(rows.map(row=>[Number(row.date.slice(8,10)),row]));const styles={PRESENT:"bg-emerald-100 text-emerald-800",HALF_DAY:"bg-amber-100 text-amber-800",ABSENT:"bg-red-100 text-red-700",LEAVE:"bg-blue-100 text-blue-700"};return <section className="attendance-calendar rounded-2xl border bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold bp-ui-section-heading">Attendance calendar</h2><p className="text-sm text-slate-500">{first.toLocaleDateString("en-GB",{month:"long",year:"numeric"})}</p></div><div className="flex flex-wrap gap-3 text-xs"><Key color="bg-emerald-500" text="Present"/><Key color="bg-amber-500" text="Half-day"/><Key color="bg-red-500" text="Absent"/><Key color="bg-blue-500" text="Leave"/></div></div><div className="mx-auto mt-5 max-w-xl"><div className="grid grid-cols-7 text-center text-xs font-bold text-slate-500">{["Mo","Tu","We","Th","Fr","Sa","Su"].map(x=><span key={x} className="py-2">{x}</span>)}</div><div className="attendance-calendar-grid grid grid-cols-7 gap-2">{cells.map((day,index)=>{const row=records.get(day);return day?<button type="button" key={day} onClick={()=>onSelect?.(row||{date:`${month}-${String(day).padStart(2,"0")}`,status:"PRESENT",overtime_hours:0,note:""})} className={(`attendance-day relative mx-auto grid h-11 w-11 place-items-center rounded-full text-sm font-semibold ${row?styles[row.status]:"text-slate-500 hover:bg-slate-100"}`) + " bp-ui-action"} title={row?`${row.status}${Number(row.overtime_hours)>0?` · ${row.overtime_hours} overtime hours`:""}`:"No attendance"}>{day}{Number(row?.overtime_hours)>0&&<i className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-violet-600 px-1 text-[9px] not-italic text-white">OT</i>}</button>:<span key={`empty-${index}`} className="h-11"/>})}</div></div></section>}
function Key({color,text}){return <span className="flex items-center gap-1.5"><i className={`h-2.5 w-2.5 rounded-full ${color}`}/>{text}</span>}
function Header({action}){return <header className="flex flex-wrap items-end justify-between gap-4 bp-ui-page-header"><div><p className="text-sm font-semibold text-amber-600">Permanent workforce</p><h1 className="mt-1 text-3xl font-bold bp-ui-page-title">Employees</h1></div>{action}</header>}
function Error({text}){return <p className="rounded-xl bg-red-50 p-4 text-red-700">{text}</p>}
