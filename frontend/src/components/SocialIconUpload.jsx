import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';

export default function SocialIconUpload({ value, label, onChange, onError }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  async function select(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 4 * 1024 * 1024) { onError('Choose a PNG, JPG or WebP icon smaller than 4 MB.'); return; }
    setBusy(true);
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
      const canvas = document.createElement('canvas'); canvas.width = 48; canvas.height = 48;
      const scale = Math.min(48 / image.width, 48 / image.height);
      canvas.getContext('2d').drawImage(image, (48 - image.width * scale) / 2, (48 - image.height * scale) / 2, image.width * scale, image.height * scale);
      onChange(canvas.toDataURL('image/png'));
    } catch { onError('This image could not be opened. Choose another icon.'); }
    finally { URL.revokeObjectURL(url); setBusy(false); }
  }
  return <div className="msp-custom-icon"><span>Upload icon</span><button type="button" disabled={busy} aria-label={`Upload icon for ${label}`} title={`Upload icon for ${label}`} onClick={() => ref.current?.click()}>{value ? <img src={value} alt=""/> : <Upload size={18}/>}</button><input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label={`Choose ${label} icon`} onChange={select}/></div>;
}
