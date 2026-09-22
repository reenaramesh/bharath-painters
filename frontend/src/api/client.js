import axios from "axios";

export const API_BASE_URL =
  import.meta.env.VITE_API_URL || "/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const access = localStorage.getItem("bharath_access");
  if (access) config.headers.Authorization = `Bearer ${access}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
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
