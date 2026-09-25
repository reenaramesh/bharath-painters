import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { BarChart3, Bell, BriefcaseBusiness, Building2, CalendarPlus, FilePlus2, FileText, Home, ListTodo, MessageCircle, Paintbrush, Users } from "lucide-react";
import useAuth from "../context/useAuth";
import api from "../api/client";

const hiddenPatterns = [
  /^\/quotations\/new(?:-|\/|$)/,
  /^\/quotations\/\d+\/edit$/,
  /^\/properties\/\d+\/measurements$/,
];

export default function MobileBottomNav() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [counts, setCounts] = useState({ messages: 0, notifications: 0 });
  const customerMatch = user?.role === "CONTRACTOR" ? location.pathname.match(/^\/customers\/(\d+)$/) : null;
  const customerId = customerMatch?.[1];

  useEffect(() => {
    if (!user || !["CONTRACTOR", "CUSTOMER"].includes(user.role)) return undefined;
    const load = async () => {
      try {
        const [{ data: portal }, { data: notifications }] = await Promise.all([
          api.get("/quotations/portal-notifications/"),
          api.get("/quotations/notifications/"),
        ]);
        setCounts({ messages: portal.messages || 0, notifications: Math.max(notifications.unread_count || 0, notifications.pending_connection_count || 0) });
      } catch { /* navigation remains available offline */ }
    };
    load();
    const timer = window.setInterval(load, 15000);
    window.addEventListener("portal-counts-changed", load);
    return () => { window.clearInterval(timer); window.removeEventListener("portal-counts-changed", load); };
  }, [user, location.pathname]);

  const items = useMemo(() => {
    if (user?.role === "CUSTOMER") return [
      { label: "Home", icon: Home, to: "/customer-dashboard" },
      { label: "Quotations", short: "Quotes", icon: FileText, to: "/customer-quotations" },
      { label: "Properties", short: "Properties", icon: Building2, to: "/customer-properties" },
      { label: "Messages", icon: MessageCircle, to: "/messages", badge: counts.messages },
      { label: "Notifications", short: "Alerts", icon: Bell, action: () => window.dispatchEvent(new Event("bp-open-notifications")), badge: counts.notifications },
    ];
    if (user?.role === "PAINTER") return [
      { label: "Home", icon: Home, to: "/dashboard" },
      { label: "Jobs", icon: BriefcaseBusiness, to: "/jobs" },
      { label: "Assignments", short: "Work", icon: ListTodo, to: "/painter-assignments" },
      { label: "Messages", icon: MessageCircle, to: "/messages" },
      { label: "Profile", icon: Paintbrush, to: "/applicator-profile" },
    ];
    if (user?.role === "ADMIN") return [
      { label: "Home", icon: Home, to: "/dashboard" },
      { label: "Contractors", short: "Contractors", icon: Users, to: "/contractors" },
      { label: "Painters", icon: Paintbrush, to: "/painters" },
      { label: "Billing", icon: FileText, to: "/billing" },
      { label: "Reports", icon: BarChart3, to: "/reports" },
    ];
    if (user?.role !== "CONTRACTOR") return [];
    if (customerId) return [
      { label: "Home", icon: Home, to: "/dashboard" },
      { label: "Follow-up", icon: CalendarPlus, action: () => window.dispatchEvent(new Event("bp-open-customer-followup")) },
      { label: "Quotation", short: "Quote", icon: FilePlus2, to: `/quotations/new?customer=${customerId}` },
      { label: "Messages", icon: MessageCircle, to: `/messages?customer=${customerId}`, badge: counts.messages },
      { label: "Notifications", short: "Alerts", icon: Bell, action: () => window.dispatchEvent(new Event("bp-open-notifications")), badge: counts.notifications },
    ];
    return [
      { label: "Home", icon: Home, to: "/dashboard" },
      { label: "Customers", icon: Users, to: "/customers" },
      { label: "Quotation", short: "Quote", icon: FilePlus2, to: "/quotations/new" },
      { label: "Add property", short: "Property", icon: Building2, to: "/properties?action=add" },
      { label: "Follow-ups", icon: ListTodo, to: "/tasks" },
    ];
  }, [user?.role, customerId, counts.messages, counts.notifications]);

  if (!items.length || hiddenPatterns.some((pattern) => pattern.test(location.pathname))) return null;
  return <nav aria-label="Mobile quick navigation" className={`fixed inset-x-3 bottom-[max(.65rem,env(safe-area-inset-bottom))] z-40 grid ${items.length === 4 ? "grid-cols-4" : "grid-cols-5"} overflow-hidden rounded-[26px] border border-slate-200 bg-white/95 p-1.5 shadow-[0_14px_45px_rgba(15,23,42,.24)] backdrop-blur-xl md:hidden`}>
    {items.map((item) => {
      const Icon = item.icon;
      const content = <><span className="relative"><Icon className="h-5 w-5" />{item.badge > 0 && <span className="absolute -right-2.5 -top-2 min-w-4 rounded-full bg-red-500 px-1 text-center text-[9px] font-extrabold leading-4 text-white">{item.badge > 9 ? "9+" : item.badge}</span>}</span><span className="mt-1 max-w-full truncate text-[10px] font-bold leading-none">{item.short || item.label}</span></>;
      const style = "flex min-w-0 flex-col items-center justify-center rounded-[20px] px-1 py-2 text-slate-500 transition active:scale-95";
      if (item.action) return <button key={item.label} type="button" onClick={item.action} className={`${style} hover:bg-indigo-50 hover:text-indigo-700`}>{content}</button>;
      return <NavLink key={item.label} to={item.to} onClick={() => navigate(item.to)} className={({ isActive }) => `${style} ${isActive ? "bg-indigo-50 text-indigo-700" : "hover:bg-slate-50"}`}>{content}</NavLink>;
    })}
  </nav>;
}
