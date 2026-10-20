import { useLayoutEffect, useRef } from "react";

export function revealWorkspaceLink(navigation, link) {
  if (!navigation || !link) return;
  const viewport = navigation.getBoundingClientRect();
  const item = link.getBoundingClientRect();
  if (item.left < viewport.left) navigation.scrollLeft += item.left - viewport.left;
  else if (item.right > viewport.right) navigation.scrollLeft += item.right - viewport.right;
}

// Route changes only move the strip horizontally; page scroll and keyboard focus stay intact.
export default function useWorkspaceTabs(activeKey) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const navigation = ref.current;
    if (!navigation) return;
    const topbar = navigation.closest('.bp-ui')?.querySelector('.bp-topbar');
    const previous = navigation.previousElementSibling;
    const precedingTabs = previous?.classList.contains('bp-workspace-tabs') ? previous : null;
    const update = () => {
      navigation.style.setProperty('--bp-workspace-top', `${(topbar?.getBoundingClientRect().height || 0) + (precedingTabs?.getBoundingClientRect().height || 0)}px`);
      revealWorkspaceLink(navigation, navigation.querySelector('[aria-current="page"]'));
    };
    const focus = event => revealWorkspaceLink(navigation, event.target.closest('a'));
    update();
    navigation.addEventListener('focusin', focus);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    [navigation, topbar, precedingTabs].filter(Boolean).forEach(element => observer?.observe(element));
    return () => { observer?.disconnect(); navigation.removeEventListener('focusin', focus); };
  }, [activeKey]);
  return ref;
}
