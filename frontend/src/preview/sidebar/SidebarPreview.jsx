import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Menu, X, ChevronDown, PanelLeftClose, PanelLeftOpen, LogOut, Layers, ExternalLink, ArrowRight, Moon, Sun } from "lucide-react";
import { GROUPS, activeNavigation, visibleNavigation } from "./navigation";
import "./sidebar-preview.css";

const MOCK_COUNTS = { messages: 4, work_updates: 2, support_tickets: 1, connection_requests: 3, applicator_bookings: 2 };
function preference(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

export default function SidebarPreview() {
  const [params, setParams] = useSearchParams();
  const role = ["CONTRACTOR", "PAINTER", "CUSTOMER", "ADMIN", "SUPPORT"].includes(params.get("role")) ? params.get("role") : "CONTRACTOR";
  const [employment, setEmployment] = useState("freelance");
  const [collapsed, setCollapsed] = useState(() => preference("bp-nav-preview-collapsed", false));
  const [closed, setClosed] = useState(() => preference("bp-nav-preview-groups", {}));
  const [mobile, setMobile] = useState(false);
  const [flyout, setFlyout] = useState(null);
  const [dark, setDark] = useState(false);
  const [state, setState] = useState("ready");
  const [longName, setLongName] = useState(false);
  const [notice, setNotice] = useState("");
  const opener = useRef(null), drawer = useRef(null), background = useRef(null), flyoutRef = useRef(null);
  const entries = visibleNavigation(role, employment);
  const route = params.get("page") || (role === "CUSTOMER" ? "/customer-dashboard" : role === "SUPPORT" ? "/support-tickets" : "/dashboard");
  const active = activeNavigation(entries, route);
  const groups = GROUPS.filter((group) => entries.some((entry) => entry.group === group));
  const account = entries.filter((entry) => entry.group === "Account");
  const rail = collapsed && !mobile;

  useEffect(() => {
    try { localStorage.setItem("bp-nav-preview-collapsed", JSON.stringify(collapsed)); localStorage.setItem("bp-nav-preview-groups", JSON.stringify(closed)); } catch { /* Preferences are optional in private browsing. */ }
  }, [collapsed, closed]);

  useEffect(() => {
    if (!mobile) return undefined;
    const previousOverflow = document.body.style.overflow;
    const priorFocus = document.activeElement;
    const backgroundElement = background.current;
    const openerElement = opener.current;
    document.body.style.overflow = "hidden";
    backgroundElement.inert = true;
    drawer.current.querySelector("button")?.focus();
    const trap = (event) => {
      if (event.key === "Escape") { setMobile(false); return; }
      if (event.key !== "Tab") return;
      const elements = [...drawer.current.querySelectorAll("button, a[href]")].filter((el) => el.getClientRects().length && !el.disabled);
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", trap);
    const breakpoint = window.matchMedia("(min-width: 1024px)");
    const resize = () => { if (breakpoint.matches) setMobile(false); };
    breakpoint.addEventListener("change", resize);
    return () => {
      document.body.style.overflow = previousOverflow;
      backgroundElement.inert = false;
      document.removeEventListener("keydown", trap);
      breakpoint.removeEventListener("change", resize);
      (openerElement || priorFocus)?.focus();
    };
  }, [mobile]);

  useEffect(() => {
    if (!flyout) return undefined;
    flyoutRef.current?.querySelector("button")?.focus();
    const dismiss = (event) => {
      if (event.type === "keydown" && event.key !== "Escape") return;
      if (event.type === "pointerdown" && (flyoutRef.current?.contains(event.target) || event.target.closest("[data-group-trigger]"))) return;
      if (event.type === "keydown") document.getElementById(`group-${flyout}`)?.focus();
      setFlyout(null);
    };
    document.addEventListener("keydown", dismiss); document.addEventListener("pointerdown", dismiss);
    return () => { document.removeEventListener("keydown", dismiss); document.removeEventListener("pointerdown", dismiss); };
  }, [flyout]);

  const update = (values) => {
    const next = new URLSearchParams(params);
    Object.entries(values).forEach(([key, value]) => next.set(key, value));
    setParams(next);
    setMobile(false); setFlyout(null); setNotice("");
  };
  const select = (entry) => update({ page: entry.route });
  const toggleGroup = (group) => setClosed((current) => ({ ...current, [group]: !current[group] }));
  const navItem = (entry) => {
    const Icon = entry.icon, count = MOCK_COUNTS[entry.badge];
    return <button key={entry.id} className={`navp-item ${active?.id === entry.id ? "is-active" : ""}`} aria-current={active?.id === entry.id ? "page" : undefined} onClick={() => select(entry)} data-destination={entry.route}>
      <Icon size={19} aria-hidden="true" /><span>{entry.label}</span>{count > 0 && <span className="navp-badge" aria-label={`${count} mock notifications`}>{count}</span>}
    </button>;
  };
  const workspace = role === "ADMIN" ? "Administration" : role === "CUSTOMER" ? "Customer portal" : role === "SUPPORT" ? "Support portal" : longName ? "Bengaluru Complete Plumbing, Cleaning & Property Maintenance Specialists" : "Bharath Plumbing";

  return <div className={`navp ${dark ? "navp-dark" : ""}`}>
    {mobile && <div className="navp-backdrop" onClick={() => setMobile(false)} aria-hidden="true" />}
    <aside ref={drawer} className={`navp-sidebar ${rail ? "is-rail" : ""} ${mobile ? "is-mobile-open" : ""}`} role={mobile ? "dialog" : undefined} aria-modal={mobile ? true : undefined} aria-label="Workspace navigation" id="preview-navigation">
      <header className="navp-brand"><span className="navp-logo"><Layers size={22} /></span><div className="navp-expanded"><strong>Bharath Apps</strong><span title={workspace}>{workspace}</span></div><button className="navp-mobile-close" aria-label="Close navigation" onClick={() => setMobile(false)}><X size={20} /></button></header>
      <button className="navp-collapse" onClick={() => { setCollapsed(!collapsed); setFlyout(null); }} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}<span className="navp-expanded">Collapse sidebar</span></button>
      <nav className="navp-scroll" aria-label={`${role === "PAINTER" ? "Employee" : role.toLowerCase()} menu`}>
        {state === "loading" ? <div role="status" aria-label="Loading navigation" className="navp-skeleton">{[1, 2, 3, 4, 5].map((n) => <div key={n} />)}<span className="navp-expanded">Loading navigation…</span></div> : state === "empty" ? <p className="navp-empty" role="status">{rail ? "—" : "No modules available for this workspace."}</p> : groups.map((group) => {
          const children = entries.filter((entry) => entry.group === group);
          const open = active?.group === group || !closed[group];
          const GroupIcon = children[0].icon;
          return <section key={group} className="navp-group">
            <button id={`group-${group}`} data-group-trigger className={`navp-group-trigger ${active?.group === group ? "has-active" : ""}`} aria-label={rail ? group : undefined} aria-expanded={rail ? flyout === group : open} aria-controls={`items-${group}`} onClick={() => rail ? setFlyout(flyout === group ? null : group) : toggleGroup(group)}>
              {rail ? <><GroupIcon size={21} aria-hidden="true" /><span role="tooltip" className="navp-tooltip">{group}</span></> : <><span>{group}</span><ChevronDown size={14} className={open ? "is-open" : ""} /></>}
            </button>
            {!rail && open && <div id={`items-${group}`}>{children.map(navItem)}</div>}
          </section>;
        })}
      </nav>
      <footer className="navp-account">
        {account.map((entry) => {
          const Icon = entry.icon;
          return rail ? <button key={entry.id} className={`navp-icon-button ${active?.id === entry.id ? "is-active" : ""}`} aria-label={entry.label} aria-current={active?.id === entry.id ? "page" : undefined} onClick={() => select(entry)}><Icon size={20} /><span role="tooltip" className="navp-tooltip">{entry.label}</span></button> : navItem(entry);
        })}
        <button className={rail ? "navp-icon-button" : "navp-item"} aria-label="Log out preview" onClick={() => { setNotice("Preview logout simulated. Your real account is still signed in."); setMobile(false); }}><LogOut size={19} /><span className={rail ? "navp-tooltip" : ""}>Log out</span></button>
      </footer>
    </aside>
    {rail && flyout && <section className="navp-flyout" ref={flyoutRef} aria-label={`${flyout} navigation`} id={`items-${flyout}`}><div className="navp-flyout-title"><strong>{flyout}</strong><button aria-label="Close group menu" onClick={() => { document.getElementById(`group-${flyout}`)?.focus(); setFlyout(null); }}><X size={18} /></button></div>{entries.filter((entry) => entry.group === flyout).map(navItem)}</section>}
    <div ref={background} className="navp-main">
      <header className="navp-topbar"><button ref={opener} className="navp-hamburger" aria-label="Open navigation" aria-expanded={mobile} aria-controls="preview-navigation" onClick={() => setMobile(true)}><Menu size={22} /></button><div><strong>Navigation design preview</strong><span>Interactive proposal · mock badges · no API writes</span></div><button aria-label={dark ? "Use light appearance" : "Use dark appearance"} onClick={() => setDark(!dark)}>{dark ? <Sun size={20} /> : <Moon size={20} />}</button></header>
      <main>
        <div className="navp-heading"><p className="navp-eyebrow">Bharath Apps / {active?.group || "Parent flow"}</p><h1>{active?.label || "Route inspection"}</h1><p>Explore the proposed navigation before it replaces the current sidebar.</p></div>
        <section className="navp-card navp-controls" aria-label="Preview controls">
          <label>Role<select aria-label="Role" value={role} onChange={(event) => update({ role: event.target.value, page: event.target.value === "CUSTOMER" ? "/customer-dashboard" : event.target.value === "SUPPORT" ? "/support-tickets" : "/dashboard" })}><option value="CONTRACTOR">Contractor</option><option value="PAINTER">Employee</option><option value="CUSTOMER">Customer</option><option value="ADMIN">Admin</option><option value="SUPPORT">Support</option></select></label>
          {role === "PAINTER" && <label>Employment<select aria-label="Employment" value={employment} onChange={(event) => { setEmployment(event.target.value); update({ page: "/dashboard" }); }}><option value="freelance">Independent</option><option value="in-house">In-house employee</option></select></label>}
          <label>Navigation state<select aria-label="Navigation state" value={state} onChange={(event) => setState(event.target.value)}><option value="ready">Ready</option><option value="loading">Loading</option><option value="empty">Empty</option></select></label>
          <label className="navp-checkbox"><input type="checkbox" checked={longName} onChange={(event) => setLongName(event.target.checked)} />Long workspace name</label>
        </section>
        {notice && <p role="status" className="navp-notice">{notice}</p>}
        <section className="navp-card navp-destination"><span className="navp-tag">Existing application destination</span><h2>{active?.label || "No matching menu item"}</h2><code>{route}</code><p>{active?.description || "This existing module keeps its forms, permissions and parent/detail flows. The preview changes navigation only."}</p>{active?.verified && <p className="navp-muted">Backend verification requirements continue to apply.</p>}<a href={active?.route || "/dashboard"} target="_blank" rel="noreferrer">Open existing module <ExternalLink size={16} /></a></section>
        <div className="navp-grid"><section className="navp-card"><h2>Try route-aware highlighting</h2><p>Detail, creation and edit routes highlight their parent. Matching respects URL segment boundaries.</p><div className="navp-tests">{(role === "CONTRACTOR" ? ["/customers/42/quotations", "/properties/42/measurements", "/quotations/42/edit", "/subcontract-work-orders/42", "/in-house-applicators/new", "/settings?tab=company"] : role === "CUSTOMER" ? ["/customer-properties/42", "/customer-quotations/42"] : ["/messages", "/account-security"]).map((path) => <button key={path} onClick={() => update({ page: path })}><span>{path}</span><ArrowRight size={16} /></button>)}</div></section><section className="navp-card"><h2>Mapped, not invented</h2><ul><li>Work outsourced and received share one destination.</li><li>Business Profile is a Settings section.</li><li>Measurements belong to Properties.</li><li>Payments to contractors belong to work-order details.</li><li>No standalone Expenses or Notifications route exists.</li><li>Badge numbers are mock counts for review.</li></ul><p className="navp-muted">Menu visibility is not an authorization boundary. Existing authentication and backend permissions remain authoritative.</p></section></div>
        <section className="navp-card"><h2>{role === "PAINTER" ? "Employee" : role.toLowerCase()} destination inventory</h2><div className="navp-inventory">{entries.map((entry) => <button key={entry.id} onClick={() => select(entry)}><span>{entry.label}</span><code>{entry.route}</code></button>)}</div></section>
      </main>
    </div>
  </div>;
}
