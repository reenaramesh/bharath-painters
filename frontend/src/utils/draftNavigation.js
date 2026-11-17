import { cancelConfirmation, confirmAction } from './confirmAction.js';

const controllers = new WeakMap();
const wrappers = new WeakMap();
// Replaying through an older guard wrapper must not open another popup.
let replayDepth = 0;
// Every guard observing the resumed pop shares this permission for its dispatch.
const permittedHistoryTargets = new WeakMap();
const question = 'Are you sure you want to discard these unsaved Draft changes?';

function replay(action) {
  replayDepth += 1;
  try { return action(); }
  finally { replayDepth -= 1; }
}

function unwrap(method) {
  let metadata = wrappers.get(method);
  while (metadata && !metadata.guard.active) {
    method = metadata.original;
    metadata = wrappers.get(method);
  }
  return method;
}

function shouldWarnFor(guard, navigation) {
  if (!guard.shouldWarn()) return false;
  if (!guard.preservePathname || !navigation) return true;
  const normalize = value => (value || "/").replace(/\/$/, "") || "/";
  return normalize(navigation.pathname) !== normalize(guard.preservePathname);
}

function createController(browser) {
  const state = { browser, guards: new Set(), index: browser.history.state?.idx, pending: null, restoring: null };
  const dirtyGuard = navigation => [...state.guards].find(guard => guard.active && shouldWarnFor(guard, navigation));

  function dispose() {
    if (state.guards.size || state.restoring) return;
    browser.removeEventListener('beforeunload', unload);
    browser.removeEventListener('popstate', pop, true);
    if (controllers.get(browser) === state) controllers.delete(browser);
  }

  function permit(token, target) {
    if (!Number.isInteger(target)) return;
    permittedHistoryTargets.set(browser, { index: target, key: token.targetKey });
  }

  function resumeConfirmed(token) {
    if (state.pending !== token || !token.guard.active) return;
    try {
      if (token.method === 'go') permit(token, token.targetIndex);
      replay(token.resume);
      if (token.method !== 'go') state.index = browser.history.state?.idx;
    } finally {
      if (state.pending === token) state.pending = null;
    }
  }

  async function decide(token) {
    const yes = await confirmAction({ question, owner: token.guard.owner });
    if (state.pending !== token || !token.guard.active) return;
    if (!yes) { state.pending = null; return; }
    // A duplicate browser traversal may still be returning to the source entry.
    // Never apply the approved delta from that temporary history position.
    if (state.restoring) { token.confirmed = true; return; }
    resumeConfirmed(token);
  }

  function unload(event) {
    if (!dirtyGuard()) return;
    event.preventDefault(); event.returnValue = '';
  }

  function pop(event) {
    const next = event.state?.idx;
    const permission = permittedHistoryTargets.get(browser);
    if (permission && next === permission.index && (permission.key === undefined || permission.key === event.state?.key)) {
      state.index = next;
      Promise.resolve().then(() => {
        if (permittedHistoryTargets.get(browser) === permission) permittedHistoryTargets.delete(browser);
      });
      return;
    }
    if (permission) permittedHistoryTargets.delete(browser);

    if (state.restoring) {
      const restoration = state.restoring;
      if (next === restoration.index) {
        // The router never saw the attempted traversal or this restoration.
        event.stopImmediatePropagation();
        state.index = next;
        state.restoring = null;
        if (state.pending?.confirmed) {
          resumeConfirmed(state.pending);
        } else if (restoration.token && state.pending === restoration.token && restoration.token.guard.active) {
          void decide(restoration.token);
        }
        dispose();
        return;
      }
      if (Number.isInteger(next)) {
        // Further Back/Forward clicks during restoration are not new intents.
        event.stopImmediatePropagation();
        browser.history.go(restoration.index - next);
        return;
      }
      // Entries without router indexes cannot be safely reversed. Preserve the
      // existing pass-through behavior rather than inventing history entries.
      const token = state.pending;
      state.restoring = null;
      state.pending = null;
      if (token) cancelConfirmation(token.guard.owner);
      state.index = next;
      dispose();
      return;
    }

    const guard = dirtyGuard({ pathname: browser.location?.pathname });
    if ((guard || state.pending) && Number.isInteger(state.index) && Number.isInteger(next) && next !== state.index) {
      event.stopImmediatePropagation();
      const origin = state.index;
      let token = null;
      if (!state.pending && guard) {
        token = { guard, method: 'go', targetIndex: next, targetKey: event.state?.key,
          resume: () => browser.history.go(next - origin) };
        state.pending = token;
      }
      state.restoring = { index: origin, token };
      // Restore first. Only its pop event is allowed to open the async popup.
      browser.history.go(origin - next);
      return;
    }
    state.index = next;
  }

  state.navigate = (guard, method, original, navigator, args) => {
    if (replayDepth || !guard.active) {
      const result = original.apply(navigator, args);
      if (method !== 'go') state.index = browser.history.state?.idx;
      return result;
    }
    if (state.pending || state.restoring) return;
    permittedHistoryTargets.delete(browser);
    // go(0) reloads the document; the native beforeunload guard owns that case.
    let navigation;
    if (guard.preservePathname && method !== 'go') {
      const target = args[0];
      try {
        const url = typeof target === 'string' ? new URL(target, browser.location.href)
          : new URL(target?.pathname || browser.location.pathname, browser.location.href);
        if (url.origin === browser.location.origin) navigation = { pathname: url.pathname };
      } catch { /* Unknown destinations keep the normal discard protection. */ }
    }
    if (!shouldWarnFor(guard, navigation) || (method === 'go' && Number(args[0]) === 0)) {
      const result = original.apply(navigator, args);
      if (method !== 'go') state.index = browser.history.state?.idx;
      return result;
    }
    const delta = Number(args[0]);
    const token = { guard, method, resume: () => original.apply(navigator, args),
      targetIndex: method === 'go' && Number.isInteger(state.index) && Number.isInteger(delta) ? state.index + delta : undefined };
    state.pending = token;
    return decide(token);
  };
  state.remove = guard => {
    state.guards.delete(guard);
    if (state.pending?.guard === guard) {
      state.pending = null;
      cancelConfirmation(guard.owner);
    }
    dispose();
  };
  browser.addEventListener('beforeunload', unload);
  browser.addEventListener('popstate', pop, true);
  return state;
}

export function installDraftNavigationGuard(browser, navigator, shouldWarn, options = {}) {
  let state = controllers.get(browser);
  if (!state) { state = createController(browser); controllers.set(browser, state); }
  const guard = { active: true, shouldWarn, preservePathname: options.preservePathname, owner: Symbol('draft-navigation') };
  state.guards.add(guard);
  const installed = {};
  for (const method of ['push', 'replace', 'go']) {
    const original = navigator[method];
    const wrapper = (...args) => state.navigate(guard, method, original, navigator, args);
    wrappers.set(wrapper, { original, guard });
    installed[method] = wrapper;
    navigator[method] = wrapper;
  }
  return () => {
    if (!guard.active) return;
    guard.active = false;
    state.remove(guard);
    for (const method of Object.keys(installed)) navigator[method] = unwrap(navigator[method]);
  };
}
