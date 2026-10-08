import {
  ArrowLeft,
  Bell,
  ChevronDown,
  Home,
  LogOut,
  Menu,
  Search,
  Settings,
  UserRound,
} from "lucide-react";
import useAuth from "../context/useAuth";
import { useLocation, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import api from "../api/client";
import PushAlertControl from "./PushAlertControl";
import LanguageSelector from "./LanguageSelector";
import { useLanguage } from "../i18n/LanguageContext";
import { ScriptKnownText } from '../i18n/ScriptText';
import { resolveBackTarget } from "../utils/navigation";

export default function Topbar({ openMenu, toggleSidebar, sidebarCollapsed = false, menuButtonRef, mobileMenuOpen = false }) {
  const { user, logout } = useAuth();
  const { language, t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [desktopLayout, setDesktopLayout] = useState(() => window.matchMedia("(min-width: 1024px)").matches);
  const profileMenuRef = useRef(null);
  useEffect(() => {
    const breakpoint = window.matchMedia("(min-width: 1024px)");
    const sync = () => setDesktopLayout(breakpoint.matches);
    sync();
    breakpoint.addEventListener("change", sync);
    return () => breakpoint.removeEventListener("change", sync);
  }, []);
  const loadNotifications = useCallback(async () => {
    try {
      const { data } = await api.get("/quotations/notifications/", { params: { display_script: language } });
      setNotifications(data.results || []);
      setUnread(Math.max(data.unread_count || 0, data.pending_connection_count || 0));
    } catch {
      /* keep header usable */
    }
  }, [language]);
  useEffect(() => {
    loadNotifications();
    const timer = window.setInterval(loadNotifications, 15000);
    const openNotifications = () => { setProfileOpen(false); setOpen(true); loadNotifications(); };
    window.addEventListener("bp-open-notifications", openNotifications);
    return () => { window.clearInterval(timer); window.removeEventListener("bp-open-notifications", openNotifications); };
  }, [loadNotifications]);
  useEffect(() => {
    if (!profileOpen) return undefined;
    const closeOutside = (event) => {
      if (!profileMenuRef.current?.contains(event.target)) setProfileOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [profileOpen]);
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
    setOpen(false);
    if (!item.is_read) {
      try { await api.patch("/quotations/notifications/", { id: item.id }); }
      catch { /* viewing the destination should still work if this update fails */ }
    }
    await loadNotifications();
    if (item.link) navigate(item.link);
  }
  async function readAll() {
    await api.patch("/quotations/notifications/", {});
    await loadNotifications();
  }
  const name =
    user?.display_name ||
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
    user?.mobile ||
    "User";
  const page =
    location.pathname.split("/").filter(Boolean).pop()?.replaceAll("-", " ") ||
    "dashboard";
  const crumbs = location.pathname
    .split("/")
    .filter(Boolean)
    .map((part) => part.replaceAll("-", " "));
  const dashboardPath = user?.role === "CUSTOMER" ? "/customer-dashboard" : "/dashboard";
  const isDashboardHome = ["/dashboard", "/customer-dashboard", "/applicator"].includes(location.pathname);
  const navigationExpanded = desktopLayout ? !sidebarCollapsed : mobileMenuOpen;
  const navigationLabel = desktopLayout
    ? sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
    : mobileMenuOpen ? "Close navigation" : "Open navigation";
  const goBack = () => {
    const { target } = resolveBackTarget({
      location,
      fallback: dashboardPath,
      explicitReturn: location.state?.returnTo || location.state?.customerPath,
    });
    navigate(target);
  };
  return (
    <header className="bp-topbar flex items-center justify-between px-3 sm:px-4 md:px-7">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
        <button
          type="button"
          ref={menuButtonRef}
          onClick={() =>
            window.innerWidth >= 1024 ? toggleSidebar() : openMenu()
          }
          aria-label={t(navigationLabel)}
          aria-controls="workspace-navigation"
          aria-expanded={navigationExpanded}
          className="bp-shell-icon-button"
        >
          <Menu className="w-5 h-5" />
        </button>
        {!isDashboardHome && (
          <button
            type="button"
            onClick={goBack}
            aria-label="Go back"
            title="Back"
            className="bp-shell-icon-button"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => navigate(dashboardPath)}
          aria-label="Home"
          title="Home"
          className="bp-shell-icon-button hidden md:grid"
        >
          <Home className="h-5 w-5" />
        </button>

        <p className="max-w-[170px] truncate text-sm font-semibold capitalize text-[var(--bp-ink)] md:hidden">
          {page}
        </p>
        <div className="hidden items-center gap-2 md:flex">
          <div className="mr-4 hidden min-w-36 lg:block">
            <p className="text-xs font-semibold capitalize text-[var(--bp-muted)]">
              {t("Workspace")}{" "}
              {crumbs.length > 1 && (
                <span> / {crumbs.slice(0, -1).join(" / ")}</span>
              )}
            </p>
            <p className="mt-0.5 text-sm font-semibold capitalize text-[var(--bp-ink)]">
              {page}
            </p>
          </div>
          <div className="bp-topbar-search relative flex w-56 items-center gap-2 border px-3.5 py-2.5 lg:w-72">
            <Search className="w-4 h-4 shrink-0 text-[var(--bp-muted)]" aria-hidden="true" />

            <input
              type="search"
              aria-label={t("Search customers, quotations, and properties")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search customers, quotes, properties..."
              className="w-full min-w-0 bg-transparent text-sm"
            />
            {results.length > 0 && (
              <div className="absolute left-0 top-12 z-50 w-[min(26.25rem,calc(100vw-2rem))] overflow-hidden rounded-xl border bg-[var(--bp-card)] shadow-2xl">
                {results.map((item, index) => (
                  <button
                    key={`${item.type}-${item.link}-${index}`}
                    onClick={() => chooseResult(item)}
                    className="flex w-full items-center gap-3 border-b px-4 py-3 text-left hover:bg-slate-50"
                  >
                    <span className="rounded-md bg-[color-mix(in_srgb,var(--app-primary,#176b9b)_10%,white)] px-2 py-1 text-xs font-bold uppercase text-[var(--app-primary,#176b9b)]">
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

      <div className="flex shrink-0 items-center gap-1 sm:gap-3 xl:gap-4">
        <LanguageSelector compact />
        <div className="relative shrink-0">
          <button
            type="button"
            aria-label={t("Notifications")}
            aria-controls="topbar-notifications-panel"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="bp-shell-icon-button relative"
          >
            <Bell className="w-5 h-5 text-slate-600" />
            {unread > 0 && (
              <span aria-label={`${unread} unread notifications`} className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1.5 py-0.5 text-center text-xs font-bold text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </button>
          {open && (
            <div id="topbar-notifications-panel" className="fixed inset-x-3 top-16 z-50 max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-2xl border border-[var(--bp-line)] bg-[var(--bp-card)] shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[380px] sm:max-h-[min(80vh,560px)]">
              <div className="flex items-center justify-between border-b p-4">
                <div>
                  <h2 className="font-bold">{t("Notifications")}</h2>
                  <p className="text-sm text-[var(--bp-muted)]">{unread} unread</p>
                </div>
                {unread > 0 && (
                  <button
                    onClick={readAll}
                    className="min-h-11 rounded-lg px-3 text-sm font-semibold text-[var(--app-primary,var(--bp-brand))] hover:bg-[var(--bp-color-surface-muted)]"
                  >
                      {t("Mark all read")}
                  </button>
                )}
              </div>
              <PushAlertControl userId={user?.id} />
              <div className="max-h-[420px] overflow-y-auto">
                {notifications.length ? (
                  notifications.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => readNotification(item)}
                      className={`block w-full border-b p-4 text-left hover:bg-slate-50 ${item.is_read ? "bg-white" : "bg-indigo-50/60"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <strong className="min-w-0 break-words text-sm">{item.event_type === "MESSAGE" ? "New message" : <ScriptKnownText source={item.title} />}</strong>
                        {!item.is_read && <span className="bp-topbar-unread shrink-0">Unread</span>}
                      </div>
                      <p className="mt-1 line-clamp-2 break-words text-sm text-[var(--bp-muted)]">
                        {item.event_type === "MESSAGE" ? "Open your inbox to view it." : <ScriptKnownText source={item.message} />}
                      </p>
                      <p className="mt-2 text-xs text-[var(--bp-muted)]">
                        {new Date(item.created_at).toLocaleString()}
                      </p>
                    </button>
                  ))
                ) : (
                  <div className="p-10 text-center text-sm text-[var(--bp-muted)]">
                    No notifications yet.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div ref={profileMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setProfileOpen((value) => !value)}
            aria-label={t("Profile menu")}
            aria-expanded={profileOpen}
            aria-controls="topbar-profile-menu"
            className="bp-topbar-profile flex items-center gap-2 text-left hover:bg-[var(--bp-color-surface-muted)]"
          >
            <div className="bp-topbar-avatar flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold shadow-sm ring-2 ring-white">
              {name.charAt(0).toUpperCase()}
            </div>

            <div className="hidden sm:block">
              <p className="max-w-40 truncate whitespace-nowrap text-xs font-semibold text-slate-900" title={name}>{name}</p>

              <p className="whitespace-nowrap text-[10px] font-medium uppercase tracking-normal text-slate-500">
                {user?.role?.toLowerCase() || "Member"} portal
              </p>
            </div>
            <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
          </button>
          {profileOpen && (
            <div id="topbar-profile-menu" className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-2xl border border-[var(--bp-line)] bg-[var(--bp-card)] shadow-2xl">
              <div className="border-b p-4">
                <p className="font-bold">{name}</p>
                <p className="mt-1 text-sm text-[var(--bp-muted)]">
                  {user?.mobile} · {user?.role}
                </p>
                {user?.bharath_id && (
                  <p className="mt-1 text-sm font-semibold text-[var(--app-primary,var(--bp-brand))]">
                    {user.bharath_id}
                  </p>
                )}
              </div>
              <div className="p-2">
                {["CONTRACTOR", "PAINTER", "CUSTOMER"].includes(user?.role) && (
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      navigate(["CONTRACTOR", "PAINTER"].includes(user?.role) ? "/settings" : "/appearance");
                    }}
                    className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-[var(--bp-color-surface-muted)]"
                  >
                    <Settings className="h-4 w-4" />
                    {t("Profile settings")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    navigate("/profile");
                  }}
                  className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-[var(--bp-color-surface-muted)]"
                >
                  <UserRound className="h-4 w-4" />
                  {t("My account")}
                </button>
                <button
                  type="button"
                  onClick={logout}
                  className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[var(--bp-color-danger)] hover:bg-[var(--bp-color-danger-surface)]"
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
