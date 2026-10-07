export function distanceKm(a, b) {
  const radians = (value) => Number(value) * Math.PI / 180;
  const lat = radians(b.latitude - a.latitude);
  const lng = radians(b.longitude - a.longitude);
  const h = Math.sin(lat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(lng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function postcodeLocations(engine, value) {
  const pins = [...new Set(String(value || "").match(/\b[1-9]\d{5}\b/g) || [])];
  return pins.flatMap((pin) => {
    const result = engine.getByPincode(pin);
    return result.success ? result.data.data : [];
  }).filter((point) => point.latitude != null && point.longitude != null && Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude)));
}

export function filterContractors(directory, hiddenIds, filters, distances = {}) {
  const includes = (values, query) => values.some((value) => String(value || "").toLowerCase().includes(query.trim().toLowerCase()));
  const phone = (value) => String(value || "").replace(/\D/g, "");
  return directory.filter((row) => !hiddenIds.has(row.id))
    .filter((row) => includes([row.company_name, row.owner_name, row.bharath_id, row.mobile], filters.search) || (/^[+\d\s().-]+$/.test(filters.search.trim()) && Boolean(phone(filters.search)) && phone(row.mobile).includes(phone(filters.search))))
    .filter((row) => includes([row.work_skills, ...(row.services || [])], filters.work))
    .filter((row) => filters.radius || includes([row.service_areas, row.office_address, row.base_location], filters.location))
    .filter((row) => !filters.radius || Number.isFinite(distances[row.id]) && distances[row.id] <= Number(filters.radius))
    .sort((a, b) => filters.radius ? distances[a.id] - distances[b.id] : 0);
}
