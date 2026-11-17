// One application confirmation at a time. Extra requests are declined, never queued.
let host = null;
let pending = null;
let sequence = 0;

function finish(answer, notify = true) {
  if (!pending) return;
  const request = pending;
  pending = null;
  if (notify) host?.show(null);
  request.resolve(Boolean(answer));
}

export function installConfirmationHost(show, getScope) {
  finish(false);
  const registration = { show, getScope };
  host = registration;
  return () => {
    if (host !== registration) return;
    finish(false, false);
    host = null;
  };
}

export function confirmAction({ question, detail = "", owner } = {}) {
  if (!host || pending || !question) return Promise.resolve(false);
  return new Promise(resolve => {
    const request = { id: ++sequence, question, detail, owner, scope: host.getScope(), resolve };
    pending = request;
    host.show({ id: request.id, question, detail });
  });
}

export function settleConfirmation(id, answer) {
  if (!pending || pending.id !== id) return;
  finish(answer && host?.getScope() === pending.scope);
}

export function cancelConfirmation(owner) {
  if (pending && (owner === undefined || pending.owner === owner)) finish(false);
}
