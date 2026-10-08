const measured = (group) => group.gross > 0 || group.deduction > 0 || group.addition > 0;

export function measurementRoomTable(areas, summaries) {
  const columns = new Map();
  const rows = areas.flatMap((area) => {
    const summary = summaries.get(String(area.id));
    const groups = (summary?.groups || []).filter((group) => measured(group)
      || [...(group.deductions || []), ...(group.additions || [])].some((opening) => Number(opening.area) > 0));
    if (!groups.length) return [];
    const values = {};
    for (const group of groups) {
      if (!measured(group)) continue;
      columns.set(group.key, { key: group.key, label: group.label });
      values[group.key] = group.net;
    }
    for (const group of groups) {
      for (const opening of [...(group.deductions || []), ...(group.additions || [])]) {
        if (opening.linked_surface && opening.opening_type in values) continue;
        const amount = Number(opening.area || 0);
        if (amount <= 0) continue;
        const key = `OPENING:${opening.opening_type}`;
        const type = String(opening.opening_type || 'Other').toLowerCase().replaceAll('_', ' ');
        columns.set(key, {key, label: `${type.charAt(0).toUpperCase()}${type.slice(1)} openings`});
        values[key] = (values[key] || 0) + amount;
      }
    }
    return [{ id: area.id, name: area.name, values, net: summary.net }];
  });
  return {
    columns: [...columns.values()], rows,
    totals: Object.fromEntries([...columns.keys()].map((key) => [key, rows.reduce((sum, row) => sum + (row.values[key] || 0), 0)])),
    net: rows.reduce((sum, row) => sum + row.net, 0),
  };
}
