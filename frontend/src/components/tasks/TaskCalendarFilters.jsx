import { useId } from "react";
import { calendarQuery, formatTaskDate, indiaDay } from "./task-calendar";

const PERIODS = [
  ["all", "All dates"], ["day", "Day"], ["week", "Week"], ["month", "Month"],
  ["year", "Year"], ["custom", "Custom range"], ["missing", "No date recorded"],
];

export default function TaskCalendarFilters({ filters, onFiltersChange }) {
  const id = useId();
  let query;
  let error = "";
  try { query = calendarQuery(filters); } catch (cause) { error = cause.message; }
  const update = (changes) => onFiltersChange({ ...filters, ...changes });
  const inputProps = {
    className: "bp-ui-control", "aria-invalid": error ? true : undefined,
    "aria-describedby": `${id}-help${error ? ` ${id}-error` : ""}`,
  };
  const period = filters.period;
  return <fieldset className="task-calendar">
    <legend>Calendar filter</legend>
    <div className="task-calendar-controls">
      <label className="task-field" htmlFor={`${id}-type`}>
        <span>Filter by</span>
        <select id={`${id}-type`} className="bp-ui-control" value={filters.date_type} onChange={(event) => update({ date_type: event.target.value })}>
          <option value="next_follow_up">Next follow-up</option>
          <option value="last_contact">Last contact attempt</option>
          <option value="last_service">Last service provided</option>
        </select>
      </label>
      <label className="task-field" htmlFor={`${id}-period`}>
        <span>Period</span>
        <select id={`${id}-period`} className="bp-ui-control" value={period} onChange={(event) => update({ period: event.target.value, anchor: filters.anchor || indiaDay() })}>
          {PERIODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      {(period === "day" || period === "week") && <label className="task-field" htmlFor={`${id}-anchor`}>
        <span>{period === "week" ? "Week containing (required)" : "Date (required)"}</span>
        <input {...inputProps} id={`${id}-anchor`} type="date" required min="1000-01-01" max="9999-12-31" value={filters.anchor} onChange={(event) => update({ anchor: event.target.value })} />
      </label>}
      {period === "month" && <label className="task-field" htmlFor={`${id}-month`}>
        <span>Month (required)</span>
        <input {...inputProps} id={`${id}-month`} type="month" required min="1000-01" max="9999-12" value={filters.anchor.slice(0, 7)} onChange={(event) => update({ anchor: event.target.value ? `${event.target.value}-01` : "" })} />
      </label>}
      {period === "year" && <label className="task-field" htmlFor={`${id}-year`}>
        <span>Year (required)</span>
        <input {...inputProps} id={`${id}-year`} type="number" inputMode="numeric" required min="1000" max="9999" step="1" value={filters.anchor.split("-")[0]} onChange={(event) => update({ anchor: event.target.value ? `${event.target.value}-01-01` : "" })} />
      </label>}
      {period === "custom" && <>
        <label className="task-field" htmlFor={`${id}-from`}><span>From (required)</span>
          <input {...inputProps} id={`${id}-from`} type="date" required min="1000-01-01" max="9999-12-31" value={filters.date_from} onChange={(event) => update({ date_from: event.target.value })} />
        </label>
        <label className="task-field" htmlFor={`${id}-to`}><span>To (required)</span>
          <input {...inputProps} id={`${id}-to`} type="date" required min="1000-01-01" max="9999-12-31" value={filters.date_to} onChange={(event) => update({ date_to: event.target.value })} />
        </label>
      </>}
    </div>
    <p className="task-help" id={`${id}-help`}>
      {period === "missing" ? "Includes customers with no recorded date for the selected field." :
        query?.date_from ? `${formatTaskDate(query.date_from)} – ${formatTaskDate(query.date_to)} · inclusive dates in India (IST).${period === "week" ? " Weeks run Monday to Sunday." : ""}` :
          "Dates use India time (IST). All dates includes records without a date."}
    </p>
    {error && <p className="task-filter-error" id={`${id}-error`} role="alert">{error} Correct the dates to update the results.</p>}
  </fieldset>;
}
