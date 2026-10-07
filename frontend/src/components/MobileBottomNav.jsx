import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { BarChart3, Bell, Building2, CalendarPlus, FilePlus2, FileText, Home, ListTodo, MessageCircle, Users } from "lucide-react";
import useAuth from "../context/useAuth";
import api from "../api/client";
import { visibleNavigation } from "../config/navigation";
import { useLanguage } from "../i18n/LanguageContext";

const hiddenPatterns = [
  /^\/quotations\/new(?:-|\/|$)/,
  /^\/quotations\/\d+\/edit$/,
  /^\/properties\/\d+\/measurements$/,
];

export default function MobileBottomNav({ employmentStatus = "loading" }) {
  const { t } = useLanguage();
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
    if (user?.role === "PAINTER") {
      const navigation = visibleNavigation("PAINTER", employmentStatus);
      const work = navigation.find((entry) => entry.id === (employmentStatus === "in-house" ? "employment" : "available-work"));
      const settings = navigation.find((entry) => entry.id === "settings");
      return [
      { label: "Home", icon: Home, to: "/dashboard" },
      ...(work ? [{ label: work.label, short: employmentStatus === "in-house" ? "Employment" : "Jobs", icon: work.icon, to: work.route }] : []),
      { label: "Assignments", short: "Work", icon: ListTodo, to: "/painter-assignments" },
      { label: "Messages", icon: MessageCircle, to: "/messages" },
      { label: settings.label, icon: settings.icon, to: settings.route },
    ];
    }
    if (user?.role === "ADMIN") return [
      { label: "Home", icon: Home, to: "/dashboard" },
      { label: "Contractors", short: "Contractors", icon: Users, to: "/contractors" },
      { label: "Professionals", short: "People", icon: Users, to: "/painters" },
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
  }, [user?.role, employmentStatus, customerId, counts.messages, counts.notifications]);

  if (!items.length || hiddenPatterns.some((pattern) => pattern.test(location.pathname))) return null;
  return <nav aria-label="Mobile quick navigation" className={`bp-mobile-bottom-nav fixed inset-x-3 bottom-[max(.65rem,env(safe-area-inset-bottom))] z-40 grid ${items.length === 4 ? "grid-cols-4" : "grid-cols-5"} overflow-hidden md:hidden`}>
    {items.map((item) => {
      const Icon = item.icon;
      const accessibleLabel = `${t(item.label)}${item.badge > 0 ? `, ${item.badge}` : ""}`;
      const content = <><span className="relative"><Icon className="h-5 w-5" aria-hidden="true" />{item.badge > 0 && <span className="bp-mobile-nav-badge absolute -right-2 -top-2" aria-label={`${item.badge}`}>{item.badge > 9 ? "9+" : item.badge}</span>}</span><span className="max-w-full truncate text-xs font-bold leading-tight">{t(item.label)}</span></>;
      if (item.action) return <button key={item.label} type="button" aria-label={accessibleLabel} onClick={item.action} className="bp-mobile-nav-item">{content}</button>;
      return <NavLink key={item.label} to={item.to} aria-label={accessibleLabel} onClick={() => navigate(item.to)} className={({ isActive }) => `bp-mobile-nav-item ${isActive ? "is-active" : ""}`}>{content}</NavLink>;
    })}
  </nav>;
}
