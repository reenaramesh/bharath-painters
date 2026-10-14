import { attendanceMonthDays, localDateKey } from "../utils/employeeAttendance.js";

export default function AttendanceDateSelection({ month, onMonthChange, dates, onChange, records = [], disabled }) {
  const days = attendanceMonthDays(month);
  const saved = new Map(records.map(row => [row.date, row.status]));
  const [year, number] = month.split("-").map(Number);
  const offset = (new Date(year, number - 1, 1).getDay() + 6) % 7;
  const toggle = date => onChange(dates.includes(date) ? dates.filter(value => value !== date) : [...dates, date]);
  return <fieldset className="attendance-date-selection" disabled={disabled}>
    <legend>Select attendance days</legend>
    <div className="attendance-selection-toolbar"><label>Month<input className="bp-ui-control" type="month" max={localDateKey().slice(0,7)} value={month} onChange={event => onMonthChange(event.target.value)} /></label><button className="bp-ui-action" type="button" onClick={() => onChange(days.filter(day => day.selectable).map(day => day.date))}>Select all past days</button><button className="bp-ui-action" type="button" onClick={() => onChange([])}>Clear</button></div>
    <div className="attendance-checkbox-calendar">
      {["Mo","Tu","We","Th","Fr","Sa","Su"].map(day => <span className="attendance-weekday" key={day}>{day}</span>)}
      {Array.from({length:offset}, (_, index) => <span key={`blank-${index}`} />)}
      {days.map(day => <label key={day.date} className={day.selectable ? dates.includes(day.date) ? "is-selected" : "" : "is-future"} title={saved.get(day.date) || "No saved attendance"}><input type="checkbox" aria-label={`Attendance ${day.date}`} disabled={!day.selectable} checked={dates.includes(day.date)} onChange={() => toggle(day.date)} /><span>{day.day}</span>{saved.has(day.date) && <small>{saved.get(day.date).replaceAll("_", " ")}</small>}</label>)}
    </div>
    <p>{dates.length} day{dates.length === 1 ? "" : "s"} selected. Status, overtime hours and note apply to each selected day. Saved attendance is updated only for checked days.</p>
  </fieldset>;
}
