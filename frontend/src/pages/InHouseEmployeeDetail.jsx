import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../api/client";
import { Attendance, Summary } from "./InHouseApplicators";

const currentMonth = new Date().toLocaleDateString("en-CA").slice(0, 7),
  today = new Date().toLocaleDateString("en-CA");
export default function InHouseEmployeeDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null),
    [month, setMonth] = useState(currentMonth),
    [editing, setEditing] = useState(false),
    [error, setError] = useState("");
  const [attendance, setAttendance] = useState({
    date: today,
    status: "PRESENT",
    overtime_hours: "0",
    note: "",
  });
  const [bonus, setBonus] = useState({ date: today, amount: "", note: "" });
  const load = useCallback(async () => {
    try {
      setData(
        (await api.get(`/jobs/in-house-applicators/${id}/?month=${month}`))
          .data,
      );
      setError("");
    } catch (e) {
      setError(e.response?.data?.detail || "Employee could not be loaded.");
    }
  }, [id, month]);
  useEffect(() => {
    load();
  }, [load]);
  async function save(form) {
    try {
      await api.patch(`/jobs/in-house-applicators/${id}/`, form);
      setEditing(false);
      await load();
    } catch (e) {
      setError(e.response?.data?.detail || "Profile could not be saved.");
    }
  }
  async function mark(e) {
    e.preventDefault();
    try {
      await api.post(
        `/jobs/in-house-applicators/${id}/attendance/`,
        attendance,
      );
      await load();
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          Object.values(err.response?.data || {})
            .flat()
            .join(" ") ||
          "Attendance could not be updated.",
      );
    }
  }
  async function addBonus(e) {
    e.preventDefault();
    try {
      await api.post(`/jobs/in-house-applicators/${id}/ledger/`, {
        ...bonus,
        entry_type: "BONUS",
      });
      setBonus({ date: today, amount: "", note: "" });
      await load();
      return true;
    } catch (err) {
      setError(err.response?.data?.detail || "Bonus could not be added.");
      return false;
    }
  }
  if (!data) return <p className="p-12 text-center">{error || "Loading..."}</p>;
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link to="/in-house-applicators" className="text-sm text-slate-500">
            ← Employees
          </Link>
          <p className="mt-3 text-sm font-semibold text-amber-600">
            {data.employee_code}
          </p>
          <h1 className="text-3xl font-bold">{data.name}</h1>
          <p className="mt-1 text-slate-500">
            {data.mobile} · Joined {data.joined_on}
          </p>
        </div>
        <button
          onClick={() => setEditing(!editing)}
          className="rounded-xl border px-5 py-3 font-semibold"
        >
          {editing ? "Cancel edit" : "Edit profile"}
        </button>
      </header>
      {error && (
        <p className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p>
      )}
      {editing ? <Edit data={data} onSave={save} /> : <Profile data={data} />}
      <details className="group overflow-hidden rounded-2xl border bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between p-5 font-bold hover:bg-slate-50">
          <span>Attendance entry and monthly summary</span>
          <span className="text-xl text-slate-400 transition-transform group-open:rotate-180">
            ⌄
          </span>
        </summary>
        <div className="border-t p-5">
          <h2 className="text-xl font-bold">Record attendance</h2>
          <form onSubmit={mark} className="mt-4 grid gap-3 md:grid-cols-5">
            <label className="text-xs font-semibold text-slate-600">
              Date
              <input
                className="mt-1 w-full rounded-xl border px-3 py-3 text-sm"
                type="date"
                max={today}
                value={attendance.date}
                onChange={(e) =>
                  setAttendance({ ...attendance, date: e.target.value })
                }
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Attendance
              <select
                className="mt-1 w-full rounded-xl border px-3 py-3 text-sm"
                value={attendance.status}
                onChange={(e) =>
                  setAttendance({ ...attendance, status: e.target.value })
                }
              >
                <option value="PRESENT">Full day Present</option>
                <option value="HALF_DAY">Half-day</option>
                <option value="ABSENT">Absent</option>
                <option value="LEAVE">Leave</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Overtime hours
              <input
                className="mt-1 w-full rounded-xl border px-3 py-3 text-sm"
                type="number"
                min="0"
                max="24"
                step="0.5"
                value={attendance.overtime_hours}
                onChange={(e) =>
                  setAttendance({
                    ...attendance,
                    overtime_hours: e.target.value,
                  })
                }
                placeholder="0"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Note
              <input
                className="mt-1 w-full rounded-xl border px-3 py-3 text-sm"
                value={attendance.note}
                onChange={(e) =>
                  setAttendance({ ...attendance, note: e.target.value })
                }
                placeholder="Optional note"
              />
            </label>
            <button className="self-end rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white">
              Update day
            </button>
          </form>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
            <h3 className="font-bold">Monthly attendance summary</h3>
            <input
              type="month"
              max={currentMonth}
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-xl border px-4 py-3"
            />
          </div>
          <Summary data={data.attendance_summary} />
        </div>
      </details>
      <BonusForm
        value={bonus}
        setValue={setBonus}
        onSubmit={addBonus}
        bonuses={data.ledger.filter((x) => x.entry_type === "BONUS")}
        month={month}
        setMonth={setMonth}
      />
      <Attendance
        rows={data.attendance}
        month={month}
        onSelect={(row) =>
          setAttendance({
            date: row.date,
            status: row.status,
            overtime_hours: String(row.overtime_hours || 0),
            note: row.note || "",
          })
        }
      />
    </div>
  );
}
function Profile({ data }) {
  return (
    <details className="group overflow-hidden rounded-2xl border bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between p-5 font-bold hover:bg-slate-50">
        <span>Employee details</span>
        <span className="text-xl text-slate-400 transition-transform group-open:rotate-180">
          ⌄
        </span>
      </summary>
      <div className="grid gap-4 border-t p-5 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Employee ID", data.employee_code],
          ["Date of birth", data.date_of_birth],
          ["Blood group", data.blood_group],
          ["Experience", `${data.experience_years} years`],
          ["Skills", data.skills],
          ["Salary type", data.salary_basis],
          [
            "Salary / wage",
            `₹${Number(data.salary_amount || 0).toLocaleString("en-IN")}`,
          ],
          [
            "ESI / PF",
            `${data.esi_applicable ? "ESI Yes" : "ESI No"} · ${data.pf_applicable ? "PF Yes" : "PF No"}`,
          ],
        ].map(([a, b]) => (
          <div key={a} className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs text-slate-500">{a}</p>
            <p className="mt-1 font-bold">{b || "—"}</p>
          </div>
        ))}
      </div>
    </details>
  );
}
function Edit({ data, onSave }) {
  const [form, setForm] = useState({
    name: data.name,
    employee_code: data.employee_code,
    date_of_birth: data.date_of_birth || "",
    blood_group: data.blood_group || "",
    joined_on: data.joined_on || "",
    experience_years: data.experience_years,
    skills: data.skills,
    salary_basis: data.salary_basis,
    salary_amount: data.salary_amount || "",
    esi_applicable: data.esi_applicable,
    pf_applicable: data.pf_applicable,
  });
  const bind = (n) => ({
    value: form[n],
    onChange: (e) => setForm({ ...form, [n]: e.target.value }),
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(form);
      }}
      className="rounded-2xl border bg-white p-6"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          "name",
          "date_of_birth",
          "blood_group",
          "joined_on",
          "experience_years",
          "skills",
          "salary_basis",
          "salary_amount",
        ].map((n) => (
          <label key={n} className="text-sm font-semibold capitalize">
            {n.replaceAll("_", " ")}
            <input
              {...bind(n)}
              className="mt-2 w-full rounded-xl border px-3 py-3"
            />
          </label>
        ))}
        <label>
          <input
            type="checkbox"
            checked={form.esi_applicable}
            onChange={(e) =>
              setForm({ ...form, esi_applicable: e.target.checked })
            }
          />{" "}
          ESI applicable
        </label>
        <label>
          <input
            type="checkbox"
            checked={form.pf_applicable}
            onChange={(e) =>
              setForm({ ...form, pf_applicable: e.target.checked })
            }
          />{" "}
          PF applicable
        </label>
      </div>
      <button className="mt-5 rounded-xl bg-slate-950 px-6 py-3 font-semibold text-white">
        Save changes
      </button>
    </form>
  );
}

function BonusForm({ value, setValue, onSubmit, bonuses, month, setMonth }) {
  const [open, setOpen] = useState(false),
    [mode, setMode] = useState("MONTH"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const rows =
    mode === "CUSTOM"
      ? bonuses.filter(
          (item) => (!from || item.date >= from) && (!to || item.date <= to),
        )
      : bonuses;
  const total = rows.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  return (
    <section className="rounded-2xl border bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Bonus</h2>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white"
        >
          + Add bonus
        </button>
      </div>
      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"
          onMouseDown={() => setOpen(false)}
        >
          <form
            onSubmit={async (e) => {
              const saved = await onSubmit(e);
              if (saved) setOpen(false);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl sm:p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold">Add employee bonus</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Enter the payment date, amount and reason.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border px-3 py-2 text-sm font-semibold"
              >
                Close
              </button>
            </div>
            <div className="mt-5 grid gap-4">
              <label className="text-sm font-semibold">
                Bonus date
                <input
                  required
                  type="date"
                  max={today}
                  value={value.date}
                  onChange={(e) => setValue({ ...value, date: e.target.value })}
                  className="mt-2 w-full rounded-xl border px-4 py-3"
                />
              </label>
              <label className="text-sm font-semibold">
                Bonus amount
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={value.amount}
                  onChange={(e) =>
                    setValue({ ...value, amount: e.target.value })
                  }
                  placeholder="₹ 0.00"
                  className="mt-2 w-full rounded-xl border px-4 py-3"
                />
              </label>
              <label className="text-sm font-semibold">
                Reason / note
                <input
                  value={value.note}
                  onChange={(e) => setValue({ ...value, note: e.target.value })}
                  placeholder="Performance bonus"
                  className="mt-2 w-full rounded-xl border px-4 py-3"
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl border px-5 py-3 font-semibold"
              >
                Cancel
              </button>
              <button className="rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white">
                Save bonus
              </button>
            </div>
          </form>
        </div>
      )}
      <div className="mt-5 flex flex-wrap gap-3">
        <input
          type="month"
          value={month}
          max={currentMonth}
          onChange={(e) => {
            setMonth(e.target.value);
            setMode("MONTH");
          }}
          className="rounded-xl border px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => setMode(mode === "CUSTOM" ? "MONTH" : "CUSTOM")}
          className="rounded-xl border px-3 py-2 text-sm font-semibold"
        >
          {mode === "CUSTOM" ? "Use month" : "Custom dates"}
        </button>
        {mode === "CUSTOM" && (
          <>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-xl border px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-xl border px-3 py-2 text-sm"
            />
          </>
        )}
      </div>
      <details className="mt-3 overflow-hidden rounded-xl border">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-amber-50 p-4">
          <span className="font-bold">Bonus transactions</span>
          <strong className="text-emerald-700">
            Total bonus ₹{total.toLocaleString("en-IN")}
          </strong>
        </summary>
        {rows.length ? (
          <div className="divide-y">
            {rows.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 p-3 text-sm"
              >
                <span>
                  <b>{item.date}</b>
                  <span className="ml-2 text-slate-500">
                    {item.note || "Bonus"}
                  </span>
                </span>
                <b className="text-emerald-700">
                  + ₹{Number(item.amount).toLocaleString("en-IN")}
                </b>
              </div>
            ))}
          </div>
        ) : (
          <p className="p-4 text-sm text-slate-400">
            No bonus transactions for this period.
          </p>
        )}
      </details>
    </section>
  );
}
