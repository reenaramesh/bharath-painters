import { Wrench } from 'lucide-react';
import { useState } from 'react';
import { resolveServiceArtwork } from '../utils/serviceArtwork';

// Unknown services deliberately get a utility symbol, never unrelated artwork.
export default function ServiceIllustration({ service, className = '', width = 72, height = 72 }) {
  const src = resolveServiceArtwork(service);
  const [failedSrc, setFailedSrc] = useState(null);
  return src && failedSrc !== src
    ? <img className={className} src={src} alt="" aria-hidden="true" width={width} height={height} decoding="async" onError={() => setFailedSrc(src)} />
    : <span className={`${className} service-art-fallback`} style={{ '--service-art-width': `${width}px`, '--service-art-height': `${height}px` }} data-missing-service-art={service || 'unspecified'} aria-hidden="true"><Wrench size={24} /></span>;
}
