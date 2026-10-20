export function callBookingIntent(search) {
  const params = new URLSearchParams(search);
  const id = params.get('event') || '';
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) return null;
  return { id: Number(id), book: params.get('action') === 'book' };
}

export function bookingPayload(form) {
  const when = new Date(`${form.date}T${form.time}`);
  if (!form.date || !form.time || Number.isNaN(when.getTime())) throw new Error('Choose a valid visit date and time.');
  return { next_follow_up: when.toISOString(), comment: form.comment.trim() };
}

export function bookedVisitUrl(event) {
  const when = new Date(event.booked_visit?.next_follow_up);
  const params = new URLSearchParams({ followup: String(event.booked_follow_up) });
  if (!Number.isNaN(when.getTime())) params.set('date', `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}`);
  return `/site-visits?${params}`;
}

// Canonical customer creation owns duplicate identity and consent behavior.
export async function bookCallVisit(api, { event, customer, form, onPrepared = () => {}, onLinked = () => {} }) {
  const payload = bookingPayload(form);
  let linked = event;
  let contact = customer;
  if (!linked.matched_customer) {
    if (!contact?.id) {
      const { data: resolution } = await api.post(`/call-inbox/events/${event.id}/add-customer/`, {});
      if (resolution.action === 'OPEN') {
        linked = { ...event, matched_customer: resolution.customer_id, customer_name: resolution.customer_name };
        onLinked(linked);
      } else {
        const { data } = await api.post('/quotations/customers/', { name: form.name.trim(), mobile: event.phone_number });
        contact = data;
        onPrepared(contact);
      }
    }
    if (!linked.matched_customer) {
      const { data } = await api.post(`/call-inbox/events/${event.id}/link-customer/`, { customer_id: contact.id });
      linked = { ...event, ...data, matched_customer: contact.id };
      onLinked(linked);
    }
  }
  try {
    const { data } = await api.post(`/call-inbox/events/${event.id}/book-site-visit/`, payload);
    return { status: 'booked', event: { ...linked, ...data } };
  } catch (error) {
    if (error.response?.data?.code !== 'CUSTOMER_APPROVAL_REQUIRED') throw error;
    let share = contact?.share_link ? contact : null;
    if (!share) {
      try { share = (await api.post(`/quotations/customers/${linked.matched_customer}/share-link/`, {})).data; }
      catch { /* The existing customer page offers the allowed request/reconnect actions. */ }
    }
    return { status: 'pending', event: linked, share, detail: error.response.data.detail };
  }
}
