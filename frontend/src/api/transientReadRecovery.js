import { CanceledError } from "axios";

const gatewayStatuses = new Set([502, 503, 504]);
const connectionErrors = new Set(["ERR_NETWORK", "ECONNREFUSED", "ECONNRESET", "ECONNABORTED", "ETIMEDOUT"]);

function waitForRetry(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new CanceledError("Read request canceled")); return; }
    const cancel = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      reject(new CanceledError("Read request canceled"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", cancel);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", cancel, { once: true });
  });
}

// Recover brief gateway/connection failures without replaying application mutations.
export function installTransientReadRecovery(client) {
  return client.interceptors.response.use(undefined, async (error) => {
    const request = error.config;
    const attempts = Number(request?._transientReadAttempts || 0);
    const readOnly = ["get", "head"].includes(request?.method?.toLowerCase());
    const transient = gatewayStatuses.has(error.response?.status)
      || (!error.response && connectionErrors.has(error.code));
    if (!request || !readOnly || !transient || attempts >= 2 || request.signal?.aborted) {
      return Promise.reject(error);
    }
    await waitForRetry(300 * (2 ** attempts), request.signal);
    return client.request({ ...request, _transientReadAttempts: attempts + 1 });
  });
}
