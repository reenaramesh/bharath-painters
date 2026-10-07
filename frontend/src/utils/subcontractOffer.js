export function offerServices(quotation) {
  return (quotation?.items || []).map(item => ({
    id: item.id,
    title: item.description || item.service_name || 'Service',
    category: item.service_category_name || 'Other services',
    service: item.service_name || '',
    quantity: item.quantity,
    unit: item.unit_name || '',
  }));
}

export function offerPayload(form, selectedIds) {
  if (!selectedIds.length) throw new Error('Select at least one quotation service.');
  return {
    quotation: Number(form.quotation),
    receiving_contractor: Number(form.receiving_contractor),
    project_title: form.project_title,
    agreed_scope_summary: form.agreed_scope_summary || '',
    instructions: form.instructions || '',
    site_address: form.site_address || '',
    required_start_date: form.required_start_date || null,
    required_end_date: form.required_end_date || null,
    quotation_item_ids: selectedIds,
  };
}

export async function sendScopeOffer(api, payload, draftId, onDraftCreated) {
  let id = draftId;
  const delivered = data => data.status === 'SENT' || Boolean(data.sent_at);
  if (id) {
    const { data } = await api.get(`/outsourcing/work-orders/${id}/`);
    if (delivered(data)) return { data };
  }
  if (!id) {
    const { data } = await api.post('/outsourcing/work-orders/', payload);
    id = data.id;
    onDraftCreated(id);
  }
  try {
    return await api.post(`/outsourcing/work-orders/${id}/transition/`, { status: 'SENT' });
  } catch (error) {
    // A timeout does not prove the server failed to commit the send.
    try {
      const { data } = await api.get(`/outsourcing/work-orders/${id}/`);
      if (delivered(data)) return { data };
    } catch { /* Keep the original send error when status cannot be confirmed. */ }
    throw error;
  }
}
