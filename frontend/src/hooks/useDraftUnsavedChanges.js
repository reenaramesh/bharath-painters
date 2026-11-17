import { useContext, useEffect, useRef } from 'react';
import { UNSAFE_NavigationContext } from 'react-router-dom';
import { installDraftNavigationGuard } from '../utils/draftNavigation.js';

export default function useDraftUnsavedChanges(dirty, enabled = true, { preservePathname } = {}) {
  const context = useContext(UNSAFE_NavigationContext);
  const current = useRef(dirty);
  current.current = dirty;
  const active = useRef(enabled);
  active.current = enabled;
  useEffect(() => {
    if (!enabled || !context?.navigator || typeof window === 'undefined') return;
    return installDraftNavigationGuard(window, context.navigator, () => active.current && current.current, { preservePathname });
  }, [context?.navigator, enabled, preservePathname]);
  return () => { current.current = false; };
}
