export const CONTRACTOR_HIRING_IDS = ['jobs', 'job-activity', 'bookings', 'painter-contacts', 'referrals'];

// Group the already-authorized destinations for sidebar presentation only.
// Keep the source navigation unchanged for permissions and workspace sections.
export function consolidateHiringNavigation(entries, role) {
  if (role !== 'CONTRACTOR') return entries;
  const sections = CONTRACTOR_HIRING_IDS.map(id => entries.find(entry => entry.id === id)).filter(Boolean);
  if (!sections.length) return entries;
  const primary = sections[0];
  const combined = {
    ...primary,
    id: 'hiring-workspace',
    label: 'Jobs & Applications',
    aliases: [...new Set(sections.flatMap(entry => [entry.route, ...(entry.aliases || [])]))].filter(route => route !== primary.route),
    searchTerms: sections.map(entry => entry.label).join(' '),
    sections,
    badge: sections.find(entry => entry.id === 'bookings')?.badge,
  };
  let inserted = false;
  return entries.flatMap(entry => {
    if (!CONTRACTOR_HIRING_IDS.includes(entry.id)) return [entry];
    if (inserted) return [];
    inserted = true;
    return [combined];
  });
}

export function consolidateScheduleNavigation(entries, role) {
  if (!["CONTRACTOR", "CUSTOMER"].includes(role)) return entries;
  const sections = entries.filter(entry => ["schedules", "completed"].includes(entry.id));
  if (sections.length < 2) return entries;
  const primary = sections.find(entry => entry.id === "schedules");
  return entries.flatMap(entry => entry.id === "completed" ? [] : entry.id === "schedules" ? [{
    ...primary,
    id: "schedule-workspace",
    label: "Work schedules",
    aliases: [...new Set(sections.flatMap(section => [section.route, ...(section.aliases || [])]))].filter(route => route !== primary.route),
    searchTerms: sections.map(section => section.label).join(" "),
    sections,
  }] : [entry]);
}
