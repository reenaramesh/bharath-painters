function listFrom(result) {
  if (result.status !== 'fulfilled') return null;
  const data = result.value.data;
  return Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : null;
}

/** Keep unavailable dependent sections separate from a failed property request. */
export async function loadPropertyDetail(api, id) {
  const [property, roomsResult, surfacesResult, recordsResult, customersResult] = await Promise.allSettled([
    api.get(`/quotations/properties/${id}/`),
    api.get(`/quotations/properties/${id}/rooms/`),
    api.get(`/quotations/properties/${id}/measurements/`),
    api.get(`/quotations/properties/${id}/measurement-records/`),
    api.get('/quotations/customers/'),
  ]);
  if (property.status === 'rejected') throw property.reason;
  const rooms = listFrom(roomsResult);
  const measurements = listFrom(surfacesResult);
  const measurementRecords = listFrom(recordsResult);
  const customers = listFrom(customersResult);
  return {
    property: property.value.data,
    rooms: rooms || [],
    measurements: measurements || [],
    measurementRecords: measurementRecords || [],
    customers: customers || [],
    measurementError: [rooms, measurements, measurementRecords].includes(null)
      ? 'Saved Area Calculations could not be loaded.' : '',
    customerError: customers === null ? 'Customer details could not be loaded.' : '',
  };
}
