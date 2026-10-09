import api from '../api/client';

// Read the same public presentation data used by the shared verification page.
// DOMParser keeps the document inert: none of its scripts or markup is mounted.
export async function loadContractorPublicProfile(bharathId) {
  const { data: html } = await api.get(`/accounts/verify-page/${encodeURIComponent(bharathId)}/`, { responseType: 'text' });
  const document = new DOMParser().parseFromString(html, 'text/html');
  const read = (id) => {
    const node = document.getElementById(id);
    if (!node || node.type !== 'application/json') throw new Error('This verified contractor profile is unavailable.');
    return JSON.parse(node.textContent);
  };
  const card = read('contractor-profile-data');
  if (!card.verified || card.bharath_id !== bharathId) throw new Error('This contractor profile is not currently verified.');
  return {
    digital_card: card,
    qr_image: read('contractor-profile-qr'),
    profile_url: read('contractor-profile-url'),
    pdf_url: read('contractor-profile-pdf'),
    share_text: `${card.title} — ${card.bharath_id}`,
  };
}
