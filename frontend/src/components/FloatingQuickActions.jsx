import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck, ListTodo, MessageCircle, Plus, X } from "lucide-react";
import useAuth from "../context/useAuth";
import { visibleNavigation } from "../config/navigation";
import { menuRouteEnabled } from "../utils/menuVisibility";
import "./floating-quick-actions.css";

export default function FloatingQuickActions({ employmentStatus }) {
  const { user, menuVisibility } = useAuth();
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const toggle = useRef(null);
  const id = useId();
  const routes = new Set(visibleNavigation(user?.role, employmentStatus).map(entry => entry.route));
  const items = [["Messages", "/messages", MessageCircle], ["Follow-ups", "/tasks", ListTodo], ["Site visits", "/site-visits", CalendarCheck]]
    .filter(([,path]) => routes.has(path) && menuRouteEnabled(user?.role, menuVisibility, path));
  useEffect(() => {
    if (!open) return;
    function dismiss(event) {
      if (event.type === "keydown") {
        if (event.key !== "Escape") return;
        event.preventDefault(); setOpen(false); toggle.current?.focus();
      } else if (!root.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", dismiss);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", dismiss); };
  }, [open]);
  if (!items.length) return null;
  return <div ref={root} className="bp-floating-actions">
    {open && <nav id={id} aria-label="Floating quick actions" className="bp-floating-actions-list">
      {items.map(([label,path,Icon]) => <Link key={path} to={path} onClick={() => setOpen(false)} aria-label={label} title={label}><span className="bp-floating-action-label">{label}</span><span className="bp-floating-action-icon"><Icon size={17} aria-hidden="true" /></span></Link>)}
    </nav>}
    <button ref={toggle} type="button" onClick={() => setOpen(value => !value)} aria-label={open ? "Close quick actions" : "Open quick actions"} aria-expanded={open} aria-controls={open ? id : undefined} title="Quick actions" className="bp-floating-actions-toggle bp-ui-action"><span>{open ? <X size={19} aria-hidden="true" /> : <Plus size={20} aria-hidden="true" />}</span></button>
  </div>;
}
