const TYPES = ['WALL', 'CEILING', 'DOOR', 'WINDOW'];
export const measurementBucket = (surface) => TYPES.includes(surface.surface_type) ? surface.surface_type : 'OTHER';
export const hasMeasurement = (surface) => Number(surface.gross_area || 0) > 0
  || Number(surface.net_area || 0) > 0 || Number(surface.deduction_area || 0) > 0 || Number(surface.addition_area || 0) > 0;

export function quotationMeasurementTables(measurement) {
  const rows = measurement.rooms.map((room) => ({ ...room,
    surfaces: measurement.surfaces.filter((surface) => String(surface.room) === String(room.id)),
  }));
  const unassigned = new Map();
  for (const surface of measurement.surfaces.filter((surface) => !surface.room)) {
    const name = surface.area_group_name || (surface.work_area === 'EXTERIOR' ? 'Exterior' : 'General area');
    const key = `${surface.work_area || 'INTERIOR'}:${name}`;
    if (!unassigned.has(key)) unassigned.set(key, {id:`area:${key}`,name,surfaces:[]});
    unassigned.get(key).surfaces.push(surface);
  }
  rows.push(...unassigned.values());
  return [
    {title:'Walls & Ceilings',types:['WALL','CEILING']},
    {title:'Doors, Windows & Other Surfaces',types:['DOOR','WINDOW','OTHER']},
  ].map((table) => ({...table,
    types:table.types.filter((type) => rows.some((row) => row.surfaces.some((surface) => measurementBucket(surface) === type && hasMeasurement(surface)))),
    rows:rows.filter((row) => row.surfaces.some((surface) => table.types.includes(measurementBucket(surface)) && hasMeasurement(surface))),
  })).filter((table) => table.rows.length && table.types.length);
}

export function measuredTotal(row, type) {
  return row.surfaces.filter((surface) => measurementBucket(surface) === type)
    .reduce((total, surface) => total + Number(surface.net_area || 0), 0);
}
