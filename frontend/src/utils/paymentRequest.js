/** Keep one request identity through an uncertain result and overlapping clicks. */
export function createPaymentSender(send) {
  let current = null;
  let inFlight = null;
  return function submit(url, payload) {
    if (inFlight?.url === url) return inFlight.promise;
    if (current?.url !== url) current = { url, key: globalThis.crypto.randomUUID() };
    const request = current;
    const promise = Promise.resolve()
      .then(() => send(url, { ...payload, idempotency_key: request.key }))
      .then(result => {
        if (current === request) current = null;
        return result;
      })
      .finally(() => {
        if (inFlight?.promise === promise) inFlight = null;
      });
    inFlight = { url, promise };
    return promise;
  };
}
