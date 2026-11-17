import { animate as animateMini } from 'motion/mini';

/** DOM presentation only: no remount, content parsing, focus or network effects. */
export function enterSurface(element, { preference = globalThis.window?.matchMedia?.('(prefers-reduced-motion: reduce)'), animate = animateMini } = {}) {
  if (!element || !preference || preference.matches) return () => {};
  const playback = animate(element, { opacity: [.72, 1] }, { duration: .24, ease: [.2, 0, 0, 1] });
  const cancel = () => playback.cancel();
  const changed = () => { if (preference.matches) cancel(); };
  preference.addEventListener('change', changed);
  return () => { cancel(); preference.removeEventListener('change', changed); };
}
