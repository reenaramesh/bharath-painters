import { useEffect, useRef } from 'react';
import { enterSurface } from './premiumMotion';

export default function PremiumRouteFrame({ routeKey, children }) {
  const element = useRef(null);
  useEffect(() => {
    let dispose = enterSurface(element.current);
    // Observe only the immediate Suspense/page root replacement, not form edits.
    const observer = new MutationObserver(() => {
      dispose();
      dispose = enterSurface(element.current);
    });
    if (element.current) observer.observe(element.current, { childList: true });
    return () => { observer.disconnect(); dispose(); };
  }, [routeKey]);
  return <div ref={element} className="bp-premium-route-frame">{children}</div>;
}
