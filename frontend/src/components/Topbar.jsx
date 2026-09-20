import {
  Bell,
  ChevronDown,
  LogOut,
  Menu,
  Search,
  Settings,
  UserRound,
  Languages,
} from "lucide-react";
import useAuth from "../context/useAuth";
import { useLocation, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import api from "../api/client";
import { languages, useLanguage } from "../i18n/LanguageContext";

export default function Topbar({ openMenu, toggleSidebar }) {
  const { user, logout, refreshUser } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  useEffect(() => {
    if (user?.preferred_language && user.preferred_language !== language) setLanguage(user.preferred_language);
  }, [language, setLanguage, user?.preferred_language]);
  async function chooseLanguage(value) {
    setLanguage(value);
    try {
      await api.patch("/accounts/me/", { preferred_language: value });
      await refreshUser();
    } catch {
      /* local preference remains available if the account update is temporarily offline */
    }
  }
  const loadNotifications = useCallback(async () => {
    try {
      const { data } = await api.get("/quotations/notifications/");
      setNotifications(data.results || []);
      setUnread(Math.max(data.unread_count || 0, data.pending_connection_count || 0));
    } catch {
      /* keep header usable */
    }
  }, []);
  useEffect(() => {
    loadNotifications();
    const timer = window.setInterval(loadNotifications, 15000);
    return () => window.clearInterval(timer);
  }, [loadNotifications]);
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(
      () =>
        api
          .get("/quotations/global-search/", { params: { q: query } })
          .then(({ data }) => setResults(data))
          .catch(() => setResults([])),
      250,
    );
    return () => window.clearTimeout(timer);
  }, [query]);
  function chooseResult(item) {
    setQuery("");
    setResults([]);
    navigate(item.link);
  }
  async function readNotification(item) {
    if (!item.is_read)
      await api.patch("/quotations/notifications/", { id: item.id });
    setOpen(false);
    await loadNotifications();
    if (item.link) navigate(item.link);
  }
  async function readAll() {
    await api.patch("/quotations/notifications/", {});
    await loadNotifications();
  }
  const name =
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") || "User";
  const page =
    location.pathname.split("/").filter(Boolean).pop()?.replaceAll("-", " ") ||
    "dashboard";
  const crumbs = location.pathname
    .split("/")
    .filter(Boolean)
    .map((part) => part.replaceAll("-", " "));
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-3 shadow-sm shadow-slate-200/70 backdrop-blur-xl sm:h-[72px] sm:px-4 md:px-7">
      <div className="flex min-w-0 items-center gap-2 sm:gap-4">
        <button
          onClick={() =>
            window.innerWidth >= 1024 ? toggleSidebar() : openMenu()
          }
          aria-label="Open navigation"
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
        >
          <Menu className="w-5 h-5" />
        </button>

        <p className="max-w-[170px] truncate text-sm font-semibold capitalize text-slate-800 md:hidden">
          {page}
        </p>
        <div className="hidden items-center gap-2 md:flex">
          <div className="mr-4 hidden min-w-36 lg:block">
            <p className="text-[11px] font-semibold capitalize text-slate-400">
              Dashboard{" "}
              {crumbs.length > 1 && (
                <span> / {crumbs.slice(0, -1).join(" / ")}</span>
              )}
            </p>
            <p className="mt-0.5 text-sm font-semibold capitalize text-slate-800">
              {page}
            </p>
          </div>
          <div className="relative flex w-72 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 shadow-sm transition focus-within:border-indigo-500 focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgb(99_102_241_/_0.12)]">
            <Search className="w-4 h-4 text-slate-500" />

            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search customers, quotes, properties..."
              className="bg-transparent outline-none text-sm w-full"
            />
            {results.length > 0 && (
              <div className="absolute left-0 top-12 z-50 w-[420px] overflow-hidden rounded-xl border bg-white shadow-2xl">
                {results.map((item, index) => (
                  <button
                    key={`${item.type}-${item.link}-${index}`}
                    onClick={() => chooseResult(item)}
                    className="flex w-full items-center gap-3 border-b px-4 py-3 text-left hover:bg-slate-50"
                  >
                    <span className="rounded-md bg-indigo-50 px-2 py-1 text-[10px] font-bold uppercase text-indigo-600">
                      {item.type}
                    </span>
                    <span>
                      <b className="block text-sm">{item.title}</b>
                      <small className="text-slate-500">{item.subtitle}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-4">
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-2 text-slate-600 shadow-sm" title={t("Language")}>
          <Languages className="h-4 w-4 shrink-0" />
          <select value={language} onChange={(event) => chooseLanguage(event.target.value)} aria-label={t("Language")} className="max-w-24 bg-transparent text-xs font-semibold outline-none sm:max-w-32">
            {languages.map(([code, nativeName, englishName]) => <option key={code} value={code}>{nativeName} · {englishName}</option>)}
          </select>
        </label>
        <div className="relative">
          <button
            onClick={() => setOpen((value) => !value)}
            className="relative rounded-lg border border-transparent p-2.5 hover:border-slate-200 hover:bg-slate-100"
          >
            <Bell className="w-5 h-5 text-slate-600" />
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-500 px-1.5 py-0.5 text-center text-[10px] font-bold text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </button>
          {open && (
            <div className="absolute right-0 top-12 z-50 w-[min(92vw,380px)] overflow-hidden rounded-2xl border bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b p-4">
                <div>
                  <h2 className="font-bold">{t("Notifications")}</h2>
                  <p className="text-xs text-slate-500">{unread} unread</p>
                </div>
                {unread > 0 && (
                  <button
                    onClick={readAll}
                    className="text-xs font-semibold text-indigo-600"
                  >
                      {t("Mark all read")}
                  </button>
                )}
              </div>
              <div className="max-h-[420px] overflow-y-auto">
                {notifications.length ? (
                  notifications.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => readNotification(item)}
                      className={`block w-full border-b p-4 text-left hover:bg-slate-50 ${item.is_read ? "bg-white" : "bg-indigo-50/60"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <strong className="text-sm">{item.title}</strong>
                        {!item.is_read && (
                          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-indigo-600" />
                        )}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                        {item.message}
                      </p>
                      <p className="mt-2 text-[10px] text-slate-400">
                        {new Date(item.created_at).toLocaleString()}
                      </p>
                    </button>
                  ))
                ) : (
                  <div className="p-10 text-center text-sm text-slate-400">
                    No notifications yet.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="relative">
          <button
            onClick={() => setProfileOpen((value) => !value)}
            aria-expanded={profileOpen}
            className="flex items-center gap-2 rounded-xl p-1.5 text-left hover:bg-slate-100"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-sm font-bold text-white shadow-md shadow-indigo-500/30 ring-2 ring-white">
              {name.charAt(0).toUpperCase()}
            </div>

            <div className="hidden sm:block">
              <p className="text-sm font-semibold text-slate-900">{name}</p>

              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                {user?.role?.toLowerCase() || "Member"} portal
              </p>
            </div>
            <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
          </button>
          {profileOpen && (
            <div className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-2xl border bg-white shadow-2xl">
              <div className="border-b p-4">
                <p className="font-bold">{name}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {user?.mobile} · {user?.role}
                </p>
                {user?.bharath_id && (
                  <p className="mt-1 text-xs font-semibold text-indigo-600">
                    {user.bharath_id}
                  </p>
                )}
              </div>
              <div className="p-2">
                {user?.role === "CONTRACTOR" && (
                  <button
                    onClick={() => {
                      setProfileOpen(false);
                      navigate("/settings");
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-slate-50"
                  >
                    <Settings className="h-4 w-4" />
                    {t("Profile settings")}
                  </button>
                )}
                <button
                  onClick={() => {
                    setProfileOpen(false);
                    navigate(
                      user?.role === "PAINTER" ? "/applicator-profile" : "/profile",
                    );
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-slate-50"
                >
                  <UserRound className="h-4 w-4" />
                  {t("My account")}
                </button>
                <button
                  onClick={logout}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50"
                >
                  <LogOut className="h-4 w-4" />
                  {t("Logout")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
