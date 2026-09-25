import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../api/client";
import AuthContext from "./auth-context";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("bharath_user");
    return saved ? JSON.parse(saved) : null;
  });

  async function login(mobile, password) {
    const { data } = await api.post("/accounts/login/", { mobile, password });
    localStorage.setItem("bharath_access", data.access);
    localStorage.setItem("bharath_refresh", data.refresh);
    localStorage.setItem("bharath_user", JSON.stringify(data.user));
    sessionStorage.removeItem(`bp-connection-reminder-${data.user?.id || "guest"}`);
    setUser(data.user);
    return data.user;
  }

  const acceptSession = useCallback((data) => {
    localStorage.setItem("bharath_access", data.access);
    localStorage.setItem("bharath_refresh", data.refresh);
    localStorage.setItem("bharath_user", JSON.stringify(data.user));
    sessionStorage.removeItem(`bp-connection-reminder-${data.user?.id || "guest"}`);
    setUser(data.user);
    return data.user;
  }, []);

  function logout() {
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

  const value = useMemo(() => ({ user, login, acceptSession, logout, refreshUser }), [user, acceptSession, refreshUser]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
