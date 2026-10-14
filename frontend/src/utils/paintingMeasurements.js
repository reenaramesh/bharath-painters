export const paintingArea = surface => surface.work_area || 'INTERIOR';
export function combinedSurfaceCategoryTotals(surfaces) {
  const totals = surfaceCategoryTotals(surfaces);
  const categories = new Map();
  for (const entry of totals.categories) {
    categories.set(entry.surface, (categories.get(entry.surface) || 0) + entry.quantity);
  }
  return { categories: [...categories].map(([surface, quantity]) => ({surface, quantity: Math.round(quantity * 100) / 100})), overall: totals.overall };
}
export const paintingProcessLabel = value => ({ PAINT_ONLY: 'Paint Only', PRIMER_PAINT: 'Primer + Paint', PUTTY_PRIMER_PAINT: 'Putty + Primer + Paint' }[value] || 'Saved specifications');
export function surfaceCategoryTotals(surfaces) {
  const categories = new Map();
  for (const surface of surfaces) {
    const work_area = paintingArea(surface);
    const type = surface.surface_type === 'OTHER' ? `OTHER:${surface.area_group_name || surface.name || 'Other surface'}` : surface.surface_type;
    const key = `${work_area}:${type}`;
    const quantity = Number(surface.net_area);
    if (!Number.isFinite(quantity) || quantity < 0) continue;
    if (!categories.has(key)) categories.set(key, { work_area, surface: type, quantity: 0 });
    categories.get(key).quantity += quantity;
  }
  return { categories: [...categories.values()].map(entry => ({ ...entry, quantity: Math.round(entry.quantity * 100) / 100 })), overall: Math.round([...categories.values()].reduce((sum, entry) => sum + entry.quantity, 0) * 100) / 100 };
}
