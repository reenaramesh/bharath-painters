// Area allocation belongs to the quotation, never to the measurement record.
export function availableWallArea(originalArea, surfaces, parentId, editingId) {
  const allocated = surfaces
    .filter((surface) => surface.parent_field_id === parentId && (!editingId || surface.field_id !== editingId))
    .reduce((total, surface) => total + Number(surface.quantity), 0);
  return Math.max(0, Math.round((Number(originalArea) - allocated) * 100) / 100);
}
