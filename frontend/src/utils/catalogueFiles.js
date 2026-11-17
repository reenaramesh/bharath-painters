import api, { API_BASE_URL } from '../api/client';
import { previewPdf } from '../components/PdfPreview';
import { lockBodyScroll } from './bodyScrollLock';
import '../components/catalogues/catalogue-sharing.css';

const MAX_SIZE = 10 * 1024 * 1024;
const MIME_EXTENSIONS = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// Resolve API-relative paths without ever sending the auth header to a third party.
export function catalogueApiUrl(path) {
  const value = String(path || '');
  const internal = /^\/quotations\/catalogues\/(?:\d+\/versions\/\d+\/file\/)?(?:\?[^#]*)?$/;
  if (internal.test(value)) return value;
  const base = new URL(`${String(api.defaults.baseURL || API_BASE_URL).replace(/\/$/, '')}/`, window.location.origin);
  const url = new URL(value, base);
  const cataloguePath = `${base.pathname.replace(/\/$/, '')}/quotations/catalogues/`;
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== base.origin || url.username || url.password || url.hash || !url.pathname.startsWith(cataloguePath)) {
    throw new Error('This private catalogue file is unavailable. Refresh the library and try again.');
  }
  return url.href;
}

function viewer() {
  try { return JSON.parse(localStorage.getItem('bharath_user') || 'null')?.id; }
  catch { return undefined; }
}

function safeFileName(value, type) {
  let name = String(value || `catalogue.${MIME_EXTENSIONS[type]}`).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').slice(0, 180);
  if (!name || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(name)) name = `catalogue-${name || 'file'}`;
  if (!/\.(pdf|jpe?g|png|webp)$/i.test(name)) name += `.${MIME_EXTENSIONS[type]}`;
  return name;
}

async function loadFile(item) {
  const version = item?.current_version;
  if (!version?.file_url) throw new Error('No file is available for this catalogue. Refresh the library.');
  const expected = String(version.content_type || '').toLowerCase().split(';')[0];
  if (!MIME_EXTENSIONS[expected]) throw new Error('Only PDF, JPG, PNG and WebP files can be opened.');
  if (Number(version.size) > MAX_SIZE) throw new Error('Catalogue files must be 10 MB or smaller.');
  const owner = viewer();
  const { data } = await api.get(catalogueApiUrl(version.file_url), { responseType: 'blob' });
  if (viewer() !== owner) throw new Error('Your account changed. Open the catalogue again from your current account.');
  if (!(data instanceof Blob) || data.size > MAX_SIZE || !data.size) throw new Error('The catalogue file could not be opened. Refresh and try again.');
  const received = String(data.type || '').toLowerCase().split(';')[0];
  if (received && received !== 'application/octet-stream' && received !== expected) throw new Error('The catalogue file format has changed. Refresh the library before opening it.');
  const blob = data.type === expected ? data : new Blob([data], { type: expected });
  return { blob, type: expected, name: safeFileName(version.file_name || item.title, expected) };
}

function saveFile({ blob, name }) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.hidden = true;
  document.body.appendChild(link);
  try { link.click(); }
  finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

export async function downloadCatalogue(item) {
  saveFile(await loadFile(item));
  return { notice: 'Download requested. You can attach the saved file manually in WhatsApp or another app.' };
}

export async function previewCatalogue(item) {
  const file = await loadFile(item);
  if (file.type === 'application/pdf') {
    previewPdf(file.blob, file.name, { modal: true });
    return {};
  }
  const dialog = document.createElement('dialog');
  if (typeof dialog.showModal !== 'function') {
    saveFile(file);
    return { notice: 'Image preview is unavailable in this browser. Download requested so you can open the file.' };
  }
  const opener = document.activeElement;
  const owner = viewer();
  const url = URL.createObjectURL(file.blob);
  const release = lockBodyScroll();
  let cleaned = false;
  const sessionChanged = () => { if (viewer() !== owner && dialog.open) dialog.close(); };
  const sessionExpired = () => { if (dialog.open) dialog.close(); };
  const observer = new MutationObserver(sessionChanged);
  const clean = () => {
    if (cleaned) return;
    cleaned = true;
    observer.disconnect();
    window.removeEventListener('storage', sessionChanged);
    window.removeEventListener('focus', sessionChanged);
    window.removeEventListener('bharath-session-expired', sessionExpired);
    URL.revokeObjectURL(url);
    dialog.remove();
    release();
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  };
  dialog.className = 'catalogue-image-preview';
  dialog.setAttribute('aria-label', item.title || file.name);
  dialog.setAttribute('data-popup-protection', 'readonly');
  const heading = document.createElement('h2');
  heading.textContent = item.title || file.name;
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Close preview';
  close.addEventListener('click', () => dialog.close());
  const image = document.createElement('img');
  image.src = url;
  image.alt = item.title || file.name;
  dialog.append(heading, close, image);
  dialog.addEventListener('close', clean, { once: true });
  dialog.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); dialog.close(); }
    if (event.key === 'Tab') { event.preventDefault(); close.focus(); }
  });
  for (const name of ['click', 'pointerdown', 'mousedown', 'touchstart']) dialog.addEventListener(name, event => event.stopPropagation());
  document.body.appendChild(dialog);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('storage', sessionChanged);
  window.addEventListener('focus', sessionChanged);
  window.addEventListener('bharath-session-expired', sessionExpired);
  try { dialog.showModal(); close.focus({ preventScroll: true }); }
  catch (failure) { clean(); throw failure; }
  return {};
}

export async function shareCatalogueFile(item) {
  const file = await loadFile(item);
  const files = [new File([file.blob], file.name, { type: file.type })];
  try {
    if (navigator.canShare?.({ files }) && typeof navigator.share === 'function') {
      await navigator.share({ files, title: item.title || file.name });
      return { notice: 'The file share action finished. Delivery is managed by the app you selected.' };
    }
  } catch (failure) {
    if (failure.name === 'AbortError') return { notice: 'File sharing cancelled.' };
    // Some browsers require a fresh user gesture after the authenticated fetch.
  }
  saveFile(file);
  return { notice: 'File sharing is unavailable here. Download requested; attach the saved file manually in WhatsApp or another app.' };
}
