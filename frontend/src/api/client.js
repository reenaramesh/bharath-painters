import axios from "axios";

export const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD
    ? "https://bharath-painters-api.onrender.com/api"
    : "/api");

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

export const pdfRequests = new WeakMap();
function dashboardLanguage() {
  try {
    const user = JSON.parse(localStorage.getItem("bharath_user") || "null");
    const code = user ? localStorage.getItem(`bp-language-user-${user.id}`) || user.preferred_language : localStorage.getItem("bp-visitor-language");
    return ["en", "kn", "te", "hi", "ta"].includes(code) ? code : "en";
  } catch { return "en"; }
}

function localizedDocument(config) {
  const path = new URL(config.url || '', window.location.origin).pathname.replace(/^\/api(?=\/)/, '');
  return config.responseType === "blob" && (
    /^\/quotations\/.*(?:\/pdf\/|\/receipt\/|\/preview-pdf\/)$/.test(path)
    || /^\/jobs\/work-schedules\/\d+\/advance-receipt\/$/.test(path)
    || /^\/billing\/(?:customer-finance\/receipts|contractor-revenue\/receipts|project-receipts)\/\d+\/pdf\/$/.test(path)
    || /^\/billing\/package-requests\/\d+\/document\/$/.test(path)
    || /^\/accounts\/profile-card\/[^/]+\/pdf\/$/.test(path)
  );
}

api.interceptors.request.use((config) => {
  const access = localStorage.getItem("bharath_access");
  if (access) config.headers.Authorization = `Bearer ${access}`;
  if (localizedDocument(config)) config.params = { ...config.params, document_language: config.params?.document_language || dashboardLanguage() };
  return config;
});

api.interceptors.response.use(
  (response) => {
    if (localizedDocument(response.config) && response.data instanceof Blob) {
      pdfRequests.set(response.data, response.config);
    }
    return response;
  },
  async (error) => {
    const request = error.config;
    const refresh = localStorage.getItem("bharath_refresh");

    if (error.response?.status === 401 && refresh && !request._retried) {
      request._retried = true;
      try {
        const { data } = await axios.post(
          `${api.defaults.baseURL}/accounts/token/refresh/`,
          { refresh },
        );
        localStorage.setItem("bharath_access", data.access);
        request.headers.Authorization = `Bearer ${data.access}`;
        return api(request);
      } catch {
        localStorage.removeItem("bharath_access");
        localStorage.removeItem("bharath_refresh");
        localStorage.removeItem("bharath_user");
        window.dispatchEvent(new Event("bharath-session-expired"));
      }
    }
    return Promise.reject(error);
  },
);

export default api;
