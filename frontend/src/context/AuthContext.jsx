import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../api/client";
import AuthContext from "./auth-context";

export function AuthProvider({ children }) {
  const [menuVisibility, setMenuVisibility] = useState({});
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("bharath_user");
    if (!saved) return null;
    try {
      return JSON.parse(saved);
    } catch {
      localStorage.removeItem("bharath_user");
      localStorage.removeItem("bharath_access");
      localStorage.removeItem("bharath_refresh");
      return null;
    }
  });

  async function login(identifier, password) {
    const { data } = await api.post("/accounts/login/", { identifier, password });
    localStorage.setItem("bharath_access", data.access);
    localStorage.setItem("bharath_refresh", data.refresh);
    localStorage.setItem("bharath_user", JSON.stringify(data.user));
    localStorage.setItem(`bp-language-user-${data.user.id}`, data.user.preferred_language || "en");
    sessionStorage.removeItem(`bp-connection-reminder-${data.user?.id || "guest"}`);
    setUser(data.user);
    return data.user;
  }

  const acceptSession = useCallback((data) => {
    localStorage.setItem("bharath_access", data.access);
    localStorage.setItem("bharath_refresh", data.refresh);
    localStorage.setItem("bharath_user", JSON.stringify(data.user));
    localStorage.setItem(`bp-language-user-${data.user.id}`, data.user.preferred_language || "en");
    sessionStorage.removeItem(`bp-connection-reminder-${data.user?.id || "guest"}`);
    setUser(data.user);
    return data.user;
  }, []);

  const googleLogin = useCallback(async (credential) => {
    const { data } = await api.post("/accounts/google-login/", { credential });
    return acceptSession(data);
  }, [acceptSession]);

  async function logout() {
    try {
      const registration = await navigator.serviceWorker?.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await api.delete("/quotations/push-subscription/", { data: { endpoint: subscription.endpoint }, timeout: 2500 }).catch(() => {});
        await subscription.unsubscribe();
      }
    } catch { /* logout still completes if push cleanup is unavailable */ }
    localStorage.removeItem("bharath_access");
    localStorage.removeItem("bharath_refresh");
    localStorage.removeItem("bharath_user");
    setUser(null);
  }

  useEffect(() => {
    const sessionExpired = () => setUser(null);
    window.addEventListener("bharath-session-expired", sessionExpired);
    return () => window.removeEventListener("bharath-session-expired", sessionExpired);
  }, []);

  const refreshUser = useCallback(async () => {
    const { data } = await api.get("/accounts/me/");
    localStorage.setItem("bharath_user", JSON.stringify(data));
    setUser(data);
    return data;
  }, []);

  useEffect(() => {
    if (localStorage.getItem("bharath_access")) refreshUser().catch(() => {});
  }, [refreshUser]);

  useEffect(() => {
    if (!user?.id) { setMenuVisibility({}); return; }
    let active = true;
    const load = () => api.get("/accounts/menu-visibility/").then(({ data }) => { if (active) setMenuVisibility(data); }).catch(() => {});
    load();
    const timer = window.setInterval(load, 60000);
    window.addEventListener("focus", load);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", load); };
  }, [user?.id]);

  const value = useMemo(() => ({ user, menuVisibility, setMenuVisibility, login, googleLogin, acceptSession, logout, refreshUser }), [user, menuVisibility, googleLogin, acceptSession, refreshUser]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
