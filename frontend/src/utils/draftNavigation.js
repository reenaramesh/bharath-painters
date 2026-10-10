export function installDraftNavigationGuard(browser, navigator, shouldWarn) {
  const message = 'You have unsaved Draft changes. Leave without saving?';
  const originals = {};
  let index = browser.history.state?.idx;
  let allowedPop = false;
  for (const method of ['push', 'replace', 'go']) {
    originals[method] = navigator[method];
    navigator[method] = (...args) => {
      if (shouldWarn() && !browser.confirm(message)) return;
      if (method === 'go') allowedPop = true;
      const result = originals[method].apply(navigator, args);
      if (method !== 'go') index = browser.history.state?.idx;
      return result;
    };
  }
  const unload = (event) => {
    if (!shouldWarn()) return;
    event.preventDefault(); event.returnValue = '';
  };
  const pop = (event) => {
    const next = event.state?.idx;
    if (allowedPop) { allowedPop = false; index = next; return; }
    if (shouldWarn() && Number.isInteger(index) && Number.isInteger(next) && !browser.confirm(message)) {
      event.stopImmediatePropagation();
      allowedPop = true;
      browser.history.go(index - next);
      return;
    }
    index = next;
  };
  browser.addEventListener('beforeunload', unload);
  browser.addEventListener('popstate', pop, true);
  return () => {
    for (const method of Object.keys(originals)) navigator[method] = originals[method];
    browser.removeEventListener('beforeunload', unload);
    browser.removeEventListener('popstate', pop, true);
  };
}
