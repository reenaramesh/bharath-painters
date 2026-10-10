// Submit saved snapshots rather than replacing them with current measurement defaults.
export function draftSavePayload(quotation, form, rooms, items) {
  const { status: _status, ...metadata } = form;
  return {
    ...metadata, expected_updated_at: quotation.updated_at, rooms,
    items: items.map((item) => {
      const { room, room_index: _oldIndex, property_room, custom_room_name, ...line } = item;
      const propertyId = property_room || (typeof room === 'string' && room.startsWith('property-') ? room.slice(9) : null);
      let index = room != null ? rooms.findIndex((entry) => entry.id != null && String(entry.id) === String(room)) : -1;
      if (index < 0 && propertyId) index = rooms.findIndex((entry) => entry.property_room != null && String(entry.property_room) === String(propertyId));
      if (index < 0 && custom_room_name) index = rooms.findIndex((entry) => !entry.property_room && entry.name.toLowerCase() === custom_room_name.toLowerCase());
      if ((room != null || propertyId || custom_room_name) && index < 0) throw new Error('A line references a room that is no longer selected. Review the room selections.');
      return { ...line, ...(index >= 0 ? { room_index: index } : { room: null }) };
    }),
    valid_until: form.valid_until || null,
    discount_value: Number(form.discount_value) || 0,
    gst_percentage: Number(form.gst_percentage) || 0,
  };
}

export function draftSaveError(error) {
  if (error.response?.status >= 500 || (typeof error.response?.data === 'string' && /^\s*</.test(error.response.data))) {
    return 'Draft could not be saved. Your edits are still available here. Try again.';
  }
  const flatten = (value) => typeof value === 'string' ? value : value && typeof value === 'object'
    ? Object.values(value).flatMap(flatten).join(' ') : '';
  return flatten(error.response?.data) || error.message || 'Draft could not be saved. Your edits are still available here.';
}
