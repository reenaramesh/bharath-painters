// Use saved master IDs where available; existing custom_unit supports other MOUs.
const commonUnits = ['Nos', 'Items', 'Lts', 'Dozens', 'Sq ft', 'Litres', 'Kg', 'Packet', 'Box'];
const normalized = name => String(name || '').toLowerCase().replace(/[.\s]/g, '');
export function quotationUnitOptions(units, item) {
  const options = units.map(unit => ({ value: String(unit.id), name: unit.name }));
  if (item.unit && !options.some(option => option.value === String(item.unit))) options.unshift({ value: String(item.unit), name: item.unit_name || 'Saved MOU' });
  for (const name of commonUnits) if (!units.some(unit => normalized(unit.name) === normalized(name))) options.push({ value: `custom:${name}`, name });
  if (item.custom_unit && !options.some(option => option.value === `custom:${item.custom_unit}`)) options.push({ value: `custom:${item.custom_unit}`, name: `${item.custom_unit} (saved)` });
  return options;
}
