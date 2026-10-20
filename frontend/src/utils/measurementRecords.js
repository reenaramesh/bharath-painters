/** @typedef {{ id: number | string, contractor: number | string, status: string, submitted_at?: string | null }} EditableMeasurementRecord */

/** @param {number | string} propertyId @param {EditableMeasurementRecord[]} records @param {number | string} contractorId @param {number | string} [preferredId] @returns {string} */
export function continueMeasurementPath(propertyId, records, contractorId, preferredId = '') {
  const editable = records.filter(record => String(record.contractor) === String(contractorId)
    && ['DRAFT', 'IN_PROGRESS'].includes(record.status) && !record.submitted_at);
  const record = editable.find(entry => String(entry.id) === String(preferredId)) || editable[0];
  return `/properties/${propertyId}/measurements?${record ? `measurement=${record.id}` : 'new=1'}`;
}
