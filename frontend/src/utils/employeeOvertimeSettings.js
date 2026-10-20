const decimal = /^\d+(?:\.\d{1,6})?$/;

export function overtimeSettingsDraft(settings, today) {
  return {
    overtime_rate_per_hour: settings.overtime_rate_per_hour == null ? "" : String(settings.overtime_rate_per_hour),
    effective_from: settings.overtime_effective_from || today,
  };
}

export function overtimeSettingsPayload(draft, today) {
  const wage = draft.overtime_rate_per_hour.trim();
  if (wage !== "" && !validRate(wage)) throw new Error("Enter a valid OT hourly rate of zero or more, with up to two decimal places (or preserve an existing fractional rate).");
  const date = draft.effective_from;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date || date > today) throw new Error("Select a valid effective date on or before today.");
  return { overtime_rate_per_hour: wage === "" ? null : wage, effective_from: date };
}

function fraction(value) {
  const [whole, part = ""] = String(value).split(".");
  return [BigInt(whole + part), 10n ** BigInt(part.length)];
}
// Historical rates can contain exact fractions of a rupee. Preserve their
// precision through the existing storage adapter instead of rounding on save.
function validRate(value) {
  if (value.length > 32 || !decimal.test(value)) return false;
  const [numerator, denominator] = fraction(value);
  return numerator * 800n % denominator === 0n && numerator * 800n <= 9999999999n * denominator;
}
function roundedMoney(numerator, denominator) {
  const cents = (numerator * 100n * 2n + denominator) / (2n * denominator);
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}
function displayRate(value) {
  const [whole, part = ""] = String(value).split(".");
  return `${whole}.${part.replace(/0+$/, "").padEnd(2, "0")}`;
}

export function overtimeSettingsPreview(draft, settings) {
  const wage = draft.overtime_rate_per_hour.trim();
  if (wage === "") {
    const rate = settings.overtime_fallback_hourly_rate ?? (settings.overtime_rate_source !== "DAY_WAGE" ? settings.overtime_hourly_rate : null);
    if (rate == null || !/^\d+(?:\.\d+)?$/.test(String(rate))) return null;
    const [numerator, denominator] = fraction(rate);
    return { hourly: displayRate(rate), fourHours: roundedMoney(numerator * 4n, denominator), fallback: true };
  }
  if (!validRate(wage)) return null;
  const [numerator, denominator] = fraction(wage);
  return { hourly: displayRate(wage), fourHours: roundedMoney(numerator * 4n, denominator), fallback: false };
}
