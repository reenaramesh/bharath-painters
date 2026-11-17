const INDIA_ZONE = "Asia/Kolkata";
const DATE_FIELDS = {
  next_follow_up: "next_follow_up",
  last_contact: "last_contact_at",
  last_service: "last_service_date",
};

function calendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1000 || year > 9999 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

/** Return the calendar day in India; a date-only value already is a calendar day. */
export function indiaDay(value = new Date()) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return calendarDate(value) ? value : "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && !calendarDate(value.slice(0, 10))) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: INDIA_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  const key = `${part("year").padStart(4, "0")}-${part("month")}-${part("day")}`;
  return calendarDate(key) ? key : "";
}

export function initialTaskFilters(view = "scheduled") {
  return {
    date_type: view === "customers" ? "last_contact" : "next_follow_up",
    period: "all", anchor: indiaDay(), date_from: "", date_to: "",
  };
}

function utcKey(date) {
  return date.toISOString().slice(0, 10);
}

/** Inclusive calendar-day bounds. The API owns conversion to India midnight. */
export function calendarQuery(filters) {
  const { date_type, period, anchor, date_from, date_to } = filters;
  if (!DATE_FIELDS[date_type]) throw new Error("Choose a date to filter by.");
  const query = { date_type };
  if (period === "all") return query;
  if (period === "missing") return { ...query, missing_date: 1 };
  if (period === "custom") {
    if (!calendarDate(date_from) || !calendarDate(date_to)) throw new Error("Choose a valid start and end date (years 1000–9999).");
    if (date_from > date_to) throw new Error("The end date must be on or after the start date.");
    return { ...query, date_from, date_to };
  }
  const selected = calendarDate(anchor);
  if (!selected) throw new Error("Choose a valid date or year (1000–9999).");
  const start = new Date(selected);
  const end = new Date(selected);
  if (period === "week") {
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    end.setTime(start.getTime());
    end.setUTCDate(end.getUTCDate() + 6);
  } else if (period === "month") {
    start.setUTCDate(1);
    end.setUTCMonth(end.getUTCMonth() + 1, 0);
  } else if (period === "year") {
    start.setUTCMonth(0, 1);
    end.setUTCMonth(11, 31);
  } else if (period !== "day") {
    throw new Error("Choose a calendar period.");
  }
  const from = utcKey(start);
  const to = utcKey(end);
  if (!calendarDate(from) || !calendarDate(to)) throw new Error("Choose a period wholly within years 1000–9999.");
  return { ...query, date_from: from, date_to: to };
}

export function matchesTaskDate(row, filters) {
  const query = calendarQuery(filters);
  const day = indiaDay(row[DATE_FIELDS[filters.date_type]] ?? null);
  if (query.missing_date) return !day;
  if (!query.date_from) return true;
  return !!day && day >= query.date_from && day <= query.date_to;
}

export function rowDueGroup(row, now = new Date()) {
  const due = indiaDay(row.next_follow_up ?? null);
  const today = indiaDay(now);
  if (!due || !today) return "none";
  return due < today ? "overdue" : due === today ? "today" : "upcoming";
}

export function formatTaskDate(value, { includeTime = false } = {}) {
  const key = indiaDay(value ?? null);
  if (!key) return "";
  const dateOnly = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = dateOnly ? new Date(`${key}T12:00:00+05:30`) : new Date(value);
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: INDIA_ZONE, day: "numeric", month: "short", year: "numeric",
    ...(includeTime && !dateOnly ? { hour: "numeric", minute: "2-digit", timeZoneName: "short" } : {}),
  }).format(date);
}
