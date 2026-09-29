import {
  LayoutDashboard,
  FileText,
  Users,
  Building2,
  BriefcaseBusiness,
  Palette,
  Camera,
  BarChart3,
  Settings,
  Wrench,
  ListTodo,
  CalendarClock,
  MessageCircle,
  ClipboardList,
  CircleHelp,
  Target,
  CalendarCheck,
  Ruler,
  LogOut,
  UserRoundCheck,
  Star,
  CreditCard,
  Package,
  IndianRupee,
  ReceiptText,
  Activity,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  UserPlus,
  Calculator,
  ShieldCheck,
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import useAuth from "../context/useAuth";
import api from "../api/client";
import { useLanguage } from "../i18n/LanguageContext";

const menuItems = [
  { label: "CRM Dashboard", icon: LayoutDashboard, to: "/dashboard" },
  { label: "Customers", icon: Users, to: "/customers" },
  { label: "Properties", icon: Building2, to: "/properties" },
  { label: "Quotations", icon: FileText, to: "/quotations" },
  {
    label: "Work Schedules",
    icon: CalendarClock,
    to: "/work-schedules",
    badge: "work_updates",
  },
  { label: "Tasks", icon: ListTodo, to: "/tasks", badge: "tasks" },
  {
    label: "Messages",
    icon: MessageCircle,
    to: "/messages",
    badge: "messages",
  },
  { label: "Opportunities", icon: Target, to: "/opportunities" },
  { label: "Subscription", icon: CreditCard, to: "/my-packages" },
  { label: "Invoices", icon: IndianRupee, to: "/invoices" },
  { label: "Revenue & Receipts", icon: ReceiptText, to: "/contractor-revenue" },
  { label: "Post Job", icon: BriefcaseBusiness, to: "/jobs?post=1" },
  {
    label: "Requests",
    icon: ClipboardList,
    to: "/service-requests",
    badge: "service_requests",
  },
  {
    label: "Support Desk",
    icon: CircleHelp,
    to: "/support-tickets",
    badge: "support_tickets",
  },
  {
    label: "Area Calculator",
    icon: Ruler,
    to: "/properties?calculator=1",
  },
  { label: "Master Data", icon: Wrench, to: "/master-services" },
  { label: "Refer Painter", icon: UserPlus, to: "/applicator-team" },
  { label: "Job Activity", icon: Activity, to: "/job-activity" },
  { label: "Ratings & Reviews", icon: Star, to: "/work-reviews" },
  {
    label: "Employees",
    icon: UserRoundCheck,
    to: "/in-house-applicators",
  },
  { label: "Completed Work", icon: CalendarCheck, to: "/completed-work" },
  { label: "Completed Projects", icon: BriefcaseBusiness, to: "/completed-projects" },
  { label: "Applicator Availability", icon: Users, to: "/painter-seeking" },
  {
    label: "Book Applicator",
    icon: CalendarClock,
    to: "/applicator-bookings",
    badge: "applicator_bookings",
  },
  { label: "Work Photos", icon: Camera, to: "/work-photos" },
  { label: "Colors & Shades", icon: Palette, to: "/colors-shades" },
  { label: "Reports", icon: BarChart3, to: "/reports" },
  { label: "Activity Log", icon: Activity, to: "/activity-log" },
];

const painterMenuItems = [
  { label: "Dashboard", icon: LayoutDashboard, to: "/dashboard" },
  { label: "Activity Log", icon: Activity, to: "/activity-log" },
  { label: "Subscription", icon: CreditCard, to: "/my-packages" },
  { label: "My Employment", icon: UserRoundCheck, to: "/in-house-applicators" },
  { label: "My Earnings", icon: BarChart3, to: "/in-house-earnings" },
  { label: "Ratings & Reviews", icon: Star, to: "/work-reviews" },
  { label: "My Assignments", icon: ClipboardList, to: "/painter-assignments" },
  { label: "Work Photos", icon: Camera, to: "/work-photos" },
  { label: "Colors & Shades", icon: Palette, to: "/colors-shades" },
  { label: "Available Jobs", icon: BriefcaseBusiness, to: "/jobs" },
  { label: "Job Activity", icon: Activity, to: "/job-activity" },
  { label: "Post Job Seeking", icon: Users, to: "/painter-seeking" },
  { label: "My Profile", icon: Palette, to: "/applicator-profile" },
  {
    label: "My Availability",
    icon: CalendarClock,
    to: "/applicator-availability",
  },
  {
    label: "Booking Requests",
    icon: CalendarClock,
    to: "/applicator-bookings",
    badge: "applicator_bookings",
  },
  {
    label: "Messages",
    icon: MessageCircle,
    to: "/messages",
    badge: "messages",
  },
  {
    label: "Support Desk",
    icon: CircleHelp,
    to: "/support-tickets",
    badge: "support_tickets",
  },
];

const adminMenuItems = [
  { label: "Dashboard", icon: LayoutDashboard, to: "/dashboard" },
  { label: "Contractors", icon: BriefcaseBusiness, to: "/contractors" },
  { label: "Paint Applicators", icon: Palette, to: "/painters" },
  { label: "Customer Connections", icon: UserRoundCheck, to: "/customer-connections" },
  { label: "Packages", icon: Package, to: "/packages" },
  { label: "Billing", icon: CreditCard, to: "/billing" },
  { label: "Subscription Revenue", icon: IndianRupee, to: "/revenue" },
  { label: "Master Data", icon: Wrench, to: "/master-services" },
  { label: "Work Photos", icon: Camera, to: "/work-photos" },
  {
    label: "Support Desk",
    icon: CircleHelp,
    to: "/support-tickets",
    badge: "support_tickets",
  },
  { label: "Reports", icon: BarChart3, to: "/reports" },
  { label: "Activity Log", icon: Activity, to: "/activity-log" },
];

const customerMenuItems = [
  { label: "Dashboard", icon: LayoutDashboard, to: "/customer-dashboard" },
  { label: "My Profile", icon: UserRoundCheck, to: "/customer/profile" },
  { label: "Appearance", icon: Palette, to: "/appearance" },
  { label: "My Contractors", icon: UserRoundCheck, to: "/customer/connections", badge: "connection_requests" },
  { label: "Activity Log", icon: Activity, to: "/activity-log" },
  { label: "My Quotations", icon: FileText, to: "/customer-quotations" },
  { label: "Review Contractors", icon: Star, to: "/customer-reviews" },
  { label: "Payments & Invoices", icon: FileText, to: "/customer-invoices" },
  { label: "My Properties", icon: Building2, to: "/customer-properties" },
  { label: "Work Photos", icon: Camera, to: "/work-photos" },
  { label: "Colors & Shades", icon: Palette, to: "/colors-shades" },
  {
    label: "Work Schedule",
    icon: CalendarClock,
    to: "/work-schedules",
    badge: "work_updates",
  },
  { label: "Completed Work", icon: CalendarCheck, to: "/completed-work" },
  {
    label: "Messages",
    icon: MessageCircle,
    to: "/messages",
    badge: "messages",
  },
  {
    label: "Service Requests",
    icon: ClipboardList,
    to: "/service-requests",
    badge: "service_requests",
  },
  {
    label: "Support Desk",
    icon: CircleHelp,
    to: "/support-tickets",
    badge: "support_tickets",
  },
  {
    label: "Share Area Calculation",
    icon: Ruler,
    to: "/measurement-access",
    badge: "measurement_access",
  },
];

export default function Sidebar({
  collapsed = false,
  onToggle = () => {},
  mobileOpen = false,
  closeMobile = () => {},
}) {
  const { t } = useLanguage();
  const { user, logout } = useAuth();
  const location = useLocation();
  const [counts, setCounts] = useState({});
  const [isInHouse, setIsInHouse] = useState(
    user?.role === "PAINTER" ? null : false,
  );
  useEffect(() => {
    if (user?.role !== "PAINTER") return;
    api
      .get("/jobs/my-in-house-employment/")
      .then(() => setIsInHouse(true))
      .catch(() => setIsInHouse(false));
  }, [user]);
  const loadCounts = useCallback(async () => {
    if (!user) return;
    try {
      if (user.role === "PAINTER" && !isInHouse) {
        const { data } = await api.get("/jobs/applicator-bookings/");
        setCounts({ applicator_bookings: data.notification_count || 0 });
      } else {
        const [{ data: portal }, { data: bookings }] = await Promise.all([
          api.get("/quotations/portal-notifications/"),
          api.get("/jobs/applicator-bookings/").catch(() => ({ data: {} })),
        ]);
        setCounts({
          ...portal,
          applicator_bookings: bookings.notification_count || 0,
        });
      }
    } catch {
      /* keep navigation usable */
    }
  }, [user, isInHouse]);
  useEffect(() => {
    loadCounts();
    const timer = window.setInterval(loadCounts, 15000);
    window.addEventListener("focus", loadCounts);
    window.addEventListener("portal-counts-changed", loadCounts);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", loadCounts);
      window.removeEventListener("portal-counts-changed", loadCounts);
    };
  }, [loadCounts, location.pathname]);
  const hiddenForInHouse = new Set([
    "/jobs",
    "/painter-seeking",
    "/applicator-availability",
    "/applicator-bookings",
  ]);
  const employmentOnly = new Set(["/in-house-applicators"]);
  const painterItems =
    isInHouse !== false
      ? painterMenuItems.filter((item) => !hiddenForInHouse.has(item.to))
      : painterMenuItems.filter((item) => !employmentOnly.has(item.to));
  const visibleItems =
    user?.role === "ADMIN"
      ? adminMenuItems
      : user?.role === "CUSTOMER"
        ? customerMenuItems
        : user?.role === "PAINTER"
          ? painterItems
          : menuItems;
  return (
    <>
      {mobileOpen && (
        <button
          aria-label="Close navigation"
          onClick={closeMobile}
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
        />
      )}
      <aside
        className={`bp-sidebar fixed inset-y-0 left-0 z-50 flex h-screen w-[280px] max-w-[86vw] shrink-0 flex-col border-r bg-white shadow-2xl transition-all duration-200 lg:sticky lg:top-0 lg:translate-x-0 lg:shadow-none ${collapsed ? "lg:w-[84px]" : "lg:w-[268px]"} ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="border-b border-slate-200 px-5 py-[18px]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-lg shadow-indigo-500/30 ring-1 ring-white/40">
              <Palette className="w-5 h-5 text-white" />
            </div>

            <div className={collapsed ? "lg:hidden" : ""}>
              <h1 className="font-bold text-slate-950">Bharath Painters</h1>

              <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                {user?.role === "ADMIN"
                  ? "Admin Portal"
                  : user?.role === "CUSTOMER"
                    ? "Customer Portal"
                    : user?.role === "PAINTER"
                      ? "Paint Applicator Portal"
                      : "Contractor Portal"}
              </p>
            </div>
          </div>
        </div>

        {user?.role === "CONTRACTOR" && !collapsed && (
          <div className="grid grid-cols-2 gap-2 border-b border-slate-200 p-3">
            <NavLink to="/customers?action=add" onClick={closeMobile} className="flex items-center gap-2 rounded-xl bg-indigo-50 px-3 py-2.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100"><UserPlus className="h-4 w-4" />Add Customer</NavLink>
            <NavLink to="/properties?action=add" onClick={closeMobile} className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs font-bold text-amber-800 hover:bg-amber-100"><Building2 className="h-4 w-4" />Add Property</NavLink>
            <NavLink to="/quotations/new" onClick={closeMobile} className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100"><Plus className="h-4 w-4" />{t("Quotation")}</NavLink>
            <NavLink to="/properties?calculator=1" onClick={closeMobile} className="flex items-center gap-2 rounded-xl bg-violet-50 px-3 py-2.5 text-xs font-bold text-violet-700 hover:bg-violet-100"><Calculator className="h-4 w-4" />{t("Calculator")}</NavLink>
          </div>
        )}

        <nav className="minimia-scroll flex-1 overflow-y-auto px-3 py-4">
          {groupNavigation(visibleItems).map((group) => (
            <div key={group.label} className="mb-4">
              <p
                className={`px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 ${collapsed ? "lg:text-center lg:text-[0]" : ""}`}
              >
                {collapsed ? (
                  <span className="hidden lg:inline">•</span>
                ) : (
                  t(group.label)
                )}
              </p>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const count = item.badge ? counts[item.badge] || 0 : 0;

                  return (
                    <NavLink
                      key={item.label}
                      to={item.to}
                      title={collapsed ? t(item.label) : undefined}
                      onClick={closeMobile}
                      className={({ isActive }) =>
                        `group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-all duration-200 ${
                          isActive
                            ? "bg-gradient-to-r from-indigo-50 to-violet-50 text-indigo-700 shadow-sm before:absolute before:left-0 before:top-1/2 before:h-5 before:-translate-y-1/2 before:w-1 before:rounded-r-full before:bg-gradient-to-b before:from-indigo-500 before:to-violet-500"
                            : count > 0
                              ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                              : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                        }`
                      }
                    >
                      <Icon className="h-[18px] w-[18px]" />
                      <span
                        className={`flex-1 ${collapsed ? "lg:hidden" : ""}`}
                      >
                        {t(item.label)}
                      </span>
                      {count > 0 && (
                        <span
                          className={`min-w-6 rounded-full bg-red-500 px-2 py-0.5 text-center text-xs font-bold text-white ${collapsed ? "lg:absolute lg:right-0 lg:top-0 lg:min-w-4 lg:px-1 lg:text-[9px]" : ""}`}
                        >
                          {count > 99 ? "99+" : count}
                        </span>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="space-y-1 border-t border-slate-200 px-3 py-4">
          {["CUSTOMER", "CONTRACTOR", "PAINTER"].includes(user?.role) && (
            <NavLink
              to="/account-security"
              onClick={closeMobile}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-950"
            >
              <ShieldCheck className="h-5 w-5" />
              <span className={collapsed ? "lg:hidden" : ""}>Account Security</span>
            </NavLink>
          )}
          {["CONTRACTOR", "PAINTER"].includes(user?.role) && (
            <NavLink
              to={user?.role === "CONTRACTOR" ? "/settings" : "/appearance"}
              onClick={closeMobile}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-950"
            >
              <Settings className="w-5 h-5" />
              <span className={collapsed ? "lg:hidden" : ""}>{user?.role === "CONTRACTOR" ? "Company Details" : "Settings"}</span>
            </NavLink>
          )}
          {user?.role === "CONTRACTOR" && (
            <NavLink
              to="/contractor-theme"
              onClick={closeMobile}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-950"
            >
              <Palette className="h-5 w-5" />
              <span className={collapsed ? "lg:hidden" : ""}>Theme Settings</span>
            </NavLink>
          )}

          <button
            onClick={onToggle}
            className="hidden w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-600 hover:bg-slate-100 lg:flex"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-5 w-5" />
            ) : (
              <PanelLeftClose className="h-5 w-5" />
            )}
            <span className={collapsed ? "lg:hidden" : ""}>Collapse menu</span>
          </button>

          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-red-400 hover:bg-red-500/10"
          >
            <LogOut className="w-5 h-5" />
            <span className={collapsed ? "lg:hidden" : ""}>{t("Logout")}</span>
          </button>
        </div>
      </aside>
    </>
  );
}

const routeGroups = {
  Dashboard: new Set(["/dashboard", "/customer-dashboard"]),
  CRM: new Set(["/customer/connections", "/customers", "/properties", "/quotations", "/work-schedules", "/tasks", "/messages"]),
  Sales: new Set(["/opportunities", "/opportunities/new", "/site-visits", "/customers", "/quotations", "/leads"]),
  Work: new Set([
    "/tasks",
    "/service-requests",
    "/jobs",
    "/painter-assignments",
    "/work-schedules",
    "/completed-work",
    "/completed-projects",
    "/work-photos",
    "/colors-shades",
  ]),
  People: new Set([
    "/customers",
    "/contractors",
    "/painters",
    "/in-house-applicators",
    "/job-activity",
  ]),
  Business: new Set([
    "/customer-reviews",
    "/quotations",
    "/customer-quotations",
    "/invoices",
    "/customer-invoices",
    "/contractor-revenue",
    "/customer-properties",
    "/properties",
    "/measurement-access",
  ]),
  "Painter Network": new Set([
    "/jobs?post=1",
    "/applicator-team",
    "/painter-seeking",
    "/applicator-bookings",
    "/applicator-profile",
    "/applicator-availability",
    "/work-reviews",
    "/in-house-earnings",
  ]),
  Support: new Set(["/messages", "/support-tickets"]),
  Administration: new Set([
    "/packages",
    "/billing",
    "/revenue",
    "/master-services",
    "/reports",
    "/activity-log",
    "/my-packages",
  ]),
};
function groupNavigation(items) {
  const groups = [];
  for (const item of items) {
    const label =
      Object.entries(routeGroups).find(([, routes]) =>
        routes.has(item.to),
      )?.[0] || "More";
    let group = groups.find((entry) => entry.label === label);
    if (!group) {
      group = { label, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  const order = [
    "Dashboard",
    "CRM",
    "Work",
    "People",
    "Business",
    "Painter Network",
    "Support",
    "Administration",
    "More",
  ];
  return groups.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
}
