import { useContext, useEffect, useRef } from 'react';
import { UNSAFE_NavigationContext } from 'react-router-dom';
import { installDraftNavigationGuard } from '../utils/draftNavigation.js';

export default function useDraftUnsavedChanges(dirty, enabled = true) {
  const context = useContext(UNSAFE_NavigationContext);
  const current = useRef(dirty);
  current.current = dirty;
  useEffect(() => {
    if (!enabled || !context?.navigator || typeof window === 'undefined') return;
    return installDraftNavigationGuard(window, context.navigator, () => current.current);
  }, [context?.navigator, enabled]);
  return () => { current.current = false; };
}
