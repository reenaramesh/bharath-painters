import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown, Layers, LogOut, PanelLeftClose, PanelLeftOpen, Search, X } from "lucide-react";
import useAuth from "../context/useAuth";
import api from "../api/client";
import { useLanguage } from "../i18n/LanguageContext";
import { GROUPS, activeNavigation, visibleNavigation } from "../config/navigation";
import ShareAppButton from "./ShareAppButton";
import "./sidebar.css";

function readGroups(key) {
  try { const value = JSON.parse(localStorage.getItem(key)); return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  catch { return {}; }
}

export default function Sidebar({ collapsed = false, onToggle = () => {}, mobileOpen = false, closeMobile, backgroundRef, openerRef, employmentStatus = "loading" }) {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const [counts, setCounts] = useState({});
  const [flyout, setFlyout] = useState(null);
  const [menuSearch, setMenuSearch] = useState("");
  const searchRef = useRef(null), focusSearchRef = useRef(false);
  const drawerRef = useRef(null), flyoutRef = useRef(null);
  const preferenceKey = `bp-sidebar-groups-${user?.id || "guest"}-${user?.role || "unknown"}`;
  const [groupPreferences, setGroupPreferences] = useState(() => ({ key: preferenceKey, closed: readGroups(preferenceKey) }));
  const closed = groupPreferences.key === preferenceKey ? groupPreferences.closed : readGroups(preferenceKey);
  const entries = visibleNavigation(user?.role, employmentStatus);
  const active = activeNavigation(entries, `${location.pathname}${location.search}`);
  const searchWords = menuSearch.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const searching = searchWords.length > 0;
  const matchingEntries = entries.filter((entry) => {
    const text = `${entry.label} ${t(`navigation:${entry.id}`, { defaultValue: entry.label })} ${entry.group} ${t(entry.group)}`.toLocaleLowerCase();
    return searchWords.every((word) => text.includes(word));
  });
  const groups = GROUPS.filter((group) => matchingEntries.some((entry) => entry.group === group));
  const account = matchingEntries.filter((entry) => entry.group === "Account");
  const rail = collapsed && !mobileOpen;

  useEffect(() => {
    if (!rail && focusSearchRef.current) {
      focusSearchRef.current = false;
      searchRef.current?.focus();
    }
  }, [rail]);

  useEffect(() => {
    let current = true;
    const loadCounts = async () => {
      const results = await Promise.allSettled([
        api.get("/quotations/portal-notifications/"),
        ["CONTRACTOR", "PAINTER"].includes(user?.role) && employmentStatus !== "loading" && employmentStatus !== "unavailable"
          ? api.get("/jobs/applicator-bookings/") : Promise.resolve({ data: {} }),
      ]);
      if (!current) return;
      setCounts((previous) => ({
        ...previous,
        ...(results[0].status === "fulfilled" ? results[0].value.data : {}),
        ...(results[1].status === "fulfilled" ? { applicator_bookings: results[1].value.data.notification_count || 0 } : {}),
      }));
    };
    setCounts({});
    loadCounts();
    const timer = window.setInterval(loadCounts, 15000);
    window.addEventListener("focus", loadCounts);
    window.addEventListener("portal-counts-changed", loadCounts);
    return () => { current = false; window.clearInterval(timer); window.removeEventListener("focus", loadCounts); window.removeEventListener("portal-counts-changed", loadCounts); };
  }, [user?.id, user?.role, employmentStatus, location.pathname]);

  // Close after navigation commits, rather than cancelling an unsaved-change blocker.
  useEffect(() => { closeMobile(); setFlyout(null); }, [location.key, closeMobile]);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    const background = backgroundRef.current;
    const opener = openerRef.current;
    const previousInert = background.inert;
    document.body.style.overflow = "hidden";
    background.inert = true;
    drawerRef.current.querySelector("button")?.focus();
    const trapFocus = (event) => {
      if (document.querySelector("[data-share-app-dialog]")) return;
      if (event.key === "Escape") { event.preventDefault(); closeMobile(); return; }
      if (event.key !== "Tab") return;
      const elements = [...drawerRef.current.querySelectorAll("a[href], button, input, select, textarea, [tabindex='0']")].filter((element) => element.getClientRects().length && !element.disabled);
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    const breakpoint = window.matchMedia("(min-width: 1024px)");
    const onResize = () => { if (breakpoint.matches) closeMobile(); };
    document.addEventListener("keydown", trapFocus);
    breakpoint.addEventListener("change", onResize);
    return () => {
      background.inert = previousInert;
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", trapFocus);
      breakpoint.removeEventListener("change", onResize);
      opener?.focus();
    };
  }, [mobileOpen, closeMobile, backgroundRef, openerRef]);

  useEffect(() => {
    if (flyout === null || !rail) return undefined;
    flyoutRef.current?.querySelector("a")?.focus();
    const dismiss = (event) => {
      if (event.type === "keydown" && event.key !== "Escape") return;
      if (event.type !== "keydown" && (flyoutRef.current?.contains(event.target) || event.target.closest("[data-nav-group]"))) return;
      if (event.type === "keydown") document.getElementById(`sidebar-group-${flyout}`)?.focus();
      setFlyout(null);
    };
    document.addEventListener("keydown", dismiss);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("focusin", dismiss);
    return () => { document.removeEventListener("keydown", dismiss); document.removeEventListener("pointerdown", dismiss); document.removeEventListener("focusin", dismiss); };
  }, [flyout, rail]);

  const toggleGroup = (group) => {
    const next = { ...closed, [group]: !closed[group] };
    setGroupPreferences({ key: preferenceKey, closed: next });
    try { localStorage.setItem(preferenceKey, JSON.stringify(next)); } catch { /* Navigation works without storage. */ }
  };
  const toggleRail = useCallback(() => { setFlyout(null); onToggle(); }, [onToggle]);
  const renderLink = (entry, iconOnly = false) => {
    const Icon = entry.icon;
    const count = Math.max(0, Number(counts[entry.badge]) || 0);
    const selected = active?.id === entry.id;
    const translatedLabel = t(`navigation:${entry.id}`, { defaultValue: entry.label });
    return <Link key={entry.id} to={entry.route} data-destination={entry.route} className={`ws-nav-link ${iconOnly ? "ws-nav-icon" : ""} ${selected ? "is-active" : ""}`} aria-current={selected ? "page" : undefined} aria-label={iconOnly ? translatedLabel : undefined}>
      <Icon size={20} aria-hidden="true" /><span className={iconOnly ? "ws-nav-tooltip" : "ws-nav-label"}>{translatedLabel}</span>
      {count > 0 && <span className="ws-nav-badge" aria-label={`${count} ${t("pending updates")}`}>{count > 99 ? "99+" : count}</span>}
    </Link>;
  };
  const workspace = user?.role === "ADMIN" ? "Administration" : user?.role === "CUSTOMER" ? "Customer portal" : user?.role === "SUPPORT" ? "Support portal" : user?.branding?.workspace_name || "Bharath Apps";
  return <>
    {mobileOpen && <div className="ws-nav-backdrop" onClick={closeMobile} aria-hidden="true" />}
    <aside ref={drawerRef} id="workspace-navigation" className={`bp-navigation-surface bp-workspace-nav ${rail ? "is-rail" : ""} ${mobileOpen ? "is-mobile-open" : ""}`} role={mobileOpen ? "dialog" : undefined} aria-modal={mobileOpen ? true : undefined} aria-label={t("Workspace navigation")}>
      <header className="ws-nav-brand"><span className="ws-nav-logo"><Layers size={22} aria-hidden="true" /></span><div className="ws-nav-expanded"><strong>Bharath Apps</strong><span title={workspace}>{workspace}</span></div><button type="button" className="ws-nav-mobile-close" onClick={closeMobile} aria-label={t("Close navigation")}><X size={20} /></button></header>
      <button type="button" className="ws-nav-collapse" onClick={toggleRail} aria-label={t(collapsed ? "Expand sidebar" : "Collapse sidebar")} aria-expanded={!collapsed}><span>{collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}</span><span className="ws-nav-expanded">{t("Collapse sidebar")}</span></button>
      {rail ? <button type="button" className="ws-nav-search-open ws-nav-collapse" aria-label={t("Search menu")} onClick={() => { focusSearchRef.current = true; setFlyout(null); onToggle(); }}><Search size={19} /><span className="ws-nav-tooltip">{t("Search menu")}</span></button> : <div className="ws-nav-search">
        <Search size={17} aria-hidden="true" />
        <input ref={searchRef} type="search" value={menuSearch} onChange={(event) => { setMenuSearch(event.target.value); setFlyout(null); }} onKeyDown={(event) => { if (event.key === "Escape" && menuSearch) { event.stopPropagation(); setMenuSearch(""); } }} placeholder={t("Search menu")} aria-label={t("Search menu")} aria-controls="workspace-menu-results" autoComplete="off" />
        {menuSearch && <button type="button" aria-label={t("Clear menu search")} onClick={() => { setMenuSearch(""); searchRef.current?.focus(); }}><X size={16} /></button>}
      </div>}
      <nav id="workspace-menu-results" className="ws-nav-scroll minimia-scroll" aria-label={t("Main navigation")}>
        {employmentStatus === "loading" && <p className="ws-nav-status" role="status">{rail ? <span className="ws-nav-loading" aria-label={t("Loading employment")} /> : t("Loading employment…")}</p>}
        {employmentStatus === "unavailable" && !rail && <p className="ws-nav-status" role="status">{t("Employment unavailable. Reconnect to refresh work options.")}</p>}
        {!entries.length && <p className="ws-nav-status" role="status">{rail ? "—" : t("No modules available.")}</p>}
        {searching && !matchingEntries.length && <p className="ws-nav-status" role="status">{t("No matching menu items.")}</p>}
        {groups.map((group, index) => {
          const children = matchingEntries.filter((entry) => entry.group === group);
          const GroupIcon = children[0].icon;
          const open = searching || active?.group === group || !closed[group];
          const groupCount = children.reduce((total, entry) => total + Math.max(0, Number(counts[entry.badge]) || 0), 0);
          return <section key={group} className="ws-nav-group"><button type="button" id={`sidebar-group-${index}`} data-nav-group className={`ws-nav-group-trigger ${active?.group === group ? "has-active" : ""}`} disabled={searching && !rail} aria-label={rail ? t(group) : undefined} aria-expanded={rail ? flyout === index : open} aria-controls={`sidebar-items-${index}`} onClick={() => rail ? setFlyout(flyout === index ? null : index) : toggleGroup(group)}>
            {rail ? <><GroupIcon size={20} aria-hidden="true" /><span className="ws-nav-tooltip">{t(group)}</span>{groupCount > 0 && <span className="ws-nav-group-dot" aria-label={`${groupCount} ${t("pending updates")}`}>{groupCount > 99 ? "99+" : groupCount}</span>}</> : <><span>{t(group)}</span><ChevronDown size={16} className={open ? "is-open" : ""} aria-hidden="true" /></>}
          </button>{!rail && <div id={`sidebar-items-${index}`} hidden={!open}>{children.map((entry) => renderLink(entry))}</div>}</section>;
        })}
      </nav>
      <footer className="ws-nav-account">
        {account.map((entry) => renderLink(entry, rail))}
        <ShareAppButton collapsed={rail} sidebar />
        <button type="button" className={`ws-nav-link ws-nav-logout ${rail ? "ws-nav-icon" : ""}`} aria-label={t("Logout")} onClick={logout}><LogOut size={19} aria-hidden="true" /><span className={rail ? "ws-nav-tooltip" : "ws-nav-label"}>{t("Logout")}</span></button>
      </footer>
    </aside>
    {rail && flyout !== null && groups[flyout] && <section className="bp-navigation-surface ws-nav-flyout" ref={flyoutRef} aria-label={t(`${groups[flyout]} navigation`)} id={`sidebar-items-${flyout}`}><header><strong>{t(groups[flyout])}</strong><button type="button" aria-label={t("Close group menu")} onClick={() => { document.getElementById(`sidebar-group-${flyout}`)?.focus(); setFlyout(null); }}><X size={18} /></button></header><nav>{matchingEntries.filter((entry) => entry.group === groups[flyout]).map((entry) => renderLink(entry))}</nav></section>}
  </>;
}
