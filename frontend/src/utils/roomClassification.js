export const ROOM_CATEGORIES = [['INTERIOR', 'Interior'], ['EXTERIOR', 'Exterior'], ['OTHER', 'Others']];
export const roomCategoryLabel = value => ROOM_CATEGORIES.find(([id]) => id === value)?.[1] || 'Others';
export function roomCategory(room, surfaces = [], masters = []) {
  if (ROOM_CATEGORIES.some(([id]) => id === room?.painting_area)) return room.painting_area;
  const measured = [...new Set(surfaces.filter(surface => String(surface.room) === String(room?.id)).map(surface => surface.work_area).filter(Boolean))];
  if (measured.length === 1) return measured[0];
  if (measured.length > 1) return 'OTHER';
  return masters.find(master => String(master.id) === String(room?.room_type))?.painting_area || 'OTHER';
}
