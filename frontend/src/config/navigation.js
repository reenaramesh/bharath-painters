import {
  LayoutDashboard, Users, Building2, Target, CalendarCheck, FileText,
  CalendarClock, ListTodo, Handshake, Network, BriefcaseBusiness,
  ReceiptText, WalletCards, MessageCircle, CircleHelp, ClipboardList,
  Settings, Wrench, BarChart3, Camera, Palette, Activity, CreditCard,
  Star, UserPlus, UserRound, ShieldCheck, Package, Ruler,
} from "lucide-react";

export const GROUPS = ["Overview", "Quick Actions", "Customers & Sales", "Work Management", "People & Network", "Finance", "Communication", "Business Setup"];
const C = ["CONTRACTOR"], E = ["PAINTER"], A = ["ADMIN"], U = ["CUSTOMER"], S = ["SUPPORT"];
const all = [...C, ...E, ...A, ...U, ...S];
const workers = [...C, ...E];
// Shared by the live sidebar and its development preview.
const item = (id, label, route, icon, group, roles, options = {}) => ({ id, label, route, icon, group, roles, ...options });
export const NAVIGATION = [
  item("dashboard", "Dashboard", "/dashboard", LayoutDashboard, "Overview", [...C, ...E, ...A], { aliases: ["/applicator"] }),
  item("customer-dashboard", "Dashboard", "/customer-dashboard", LayoutDashboard, "Overview", U),
  item("add-customer", "Add Customer", "/customers?action=add", UserPlus, "Quick Actions", C),
  item("add-property", "Add Property", "/properties?action=add", Building2, "Quick Actions", C),
  item("new-quotation", "New Quotation", "/quotations/new", FileText, "Quick Actions", C),
  item("calculator", "Area Calculator", "/properties?calculator=1", Ruler, "Quick Actions", C),
  item("customers", "Customers", "/customers", Users, "Customers & Sales", C),
  item("properties", "Properties & Measurements", "/properties", Building2, "Customers & Sales", C, { aliases: ["/measurement-trial"], description: "Measurements and area calculator stay inside each property; no duplicate sidebar destination." }),
  item("leads", "Leads", "/leads", Target, "Customers & Sales", C),
  item("site-visits", "Site Visits", "/site-visits", CalendarCheck, "Customers & Sales", C),
  item("quotations", "Quotations", "/quotations", FileText, "Customers & Sales", C, { verified: true }),
  item("customer-properties", "My Properties", "/customer-properties", Building2, "Customers & Sales", U),
  item("customer-quotations", "My Quotations", "/customer-quotations", FileText, "Customers & Sales", U),
  item("measurement-access", "Shared Measurements", "/measurement-access", Ruler, "Customers & Sales", U, { badge: "measurement_access" }),
  item("projects", "Completed Projects", "/completed-projects", BriefcaseBusiness, "Work Management", C, { verified: true, description: "Existing completed-project portfolio. This is not an all-projects screen." }),
  item("schedules", "Work Schedules", "/work-schedules", CalendarClock, "Work Management", [...C, ...U], { badge: "work_updates" }),
  item("work-changes", "Work Changes", "/work-changes", ClipboardList, "Work Management", [...C, ...U]),
  item("work-reschedules", "Work Reschedules", "/work-reschedules", CalendarClock, "Work Management", C),
  item("tasks", "Tasks", "/tasks", ListTodo, "Work Management", C, { badge: "tasks" }),
  item("subcontracts", "Outsourced & Received Work", "/subcontract-work-orders", Handshake, "Work Management", C, { verified: true, description: "One existing screen for work sent and received, with status filters. Billing stays in the work-order detail." }),
  item("assignments", "My Assignments", "/painter-assignments", ClipboardList, "Work Management", E),
  item("availability", "Availability & Calendar", "/applicator-availability", CalendarClock, "Work Management", E, { employment: "freelance" }),
  item("completed", "Completed Work", "/completed-work", CalendarCheck, "Work Management", [...C, ...U]),
  item("photos", "Work Photos", "/work-photos", Camera, "Work Management", [...C, ...E, ...U, ...A]),
  item("reviews", "Ratings & Reviews", "/work-reviews", Star, "Work Management", workers),
  item("employees", "My Employees", "/in-house-applicators", Users, "People & Network", C),
  item("employment", "My Employment", "/in-house-applicators", BriefcaseBusiness, "People & Network", E, { employment: "in-house" }),
  item("network", "Contractor Network", "/contractor-network", Network, "People & Network", C, { verified: true }),
  item("jobs", "Job Posts & Applications", "/jobs", BriefcaseBusiness, "People & Network", C, { aliases: ["/painter-seeking"], description: "Work Network tabs include job posts and available professionals." }),
  item("available-work", "Available Work", "/jobs", BriefcaseBusiness, "People & Network", E, { aliases: ["/painter-seeking"], employment: "freelance" }),
  item("job-activity", "Applications & Invitations", "/job-activity", ClipboardList, "People & Network", workers),
  item("referrals", "Team Referrals", "/applicator-team", UserPlus, "People & Network", C),
  item("bookings", "Bookings & Requests", "/applicator-bookings", CalendarCheck, "People & Network", workers, { badge: "applicator_bookings", employmentByRole: { PAINTER: "freelance" }, aliases: ["/find-painter"] }),
  item("contractors", "Contractors", "/contractors", BriefcaseBusiness, "People & Network", A),
  item("professionals", "Employees & Professionals", "/painters", Users, "People & Network", A),
  item("connections-admin", "Customer Connections", "/customer-connections", Network, "People & Network", A),
  item("connections", "My Contractors", "/customer/connections", Network, "People & Network", U, { badge: "connection_requests", aliases: ["/customer/connection-requests"] }),
  item("customer-reviews", "Review Contractors", "/customer-reviews", Star, "People & Network", U),
  item("invoices", "Invoices", "/invoices", FileText, "Finance", C, { verified: true }),
  item("receipts", "Customer Payments & Revenue", "/contractor-revenue", ReceiptText, "Finance", C, { verified: true }),
  item("earnings", "My Payments", "/in-house-earnings", WalletCards, "Finance", E, { description: "Existing earnings screen; eligibility and records remain controlled by the backend." }),
  item("customer-invoices", "Payments & Invoices", "/customer-invoices", ReceiptText, "Finance", U),
  item("billing", "Billing", "/billing", CreditCard, "Finance", A),
  item("revenue", "Subscription Revenue", "/revenue", BarChart3, "Finance", A),
  item("messages", "Messages", "/messages", MessageCircle, "Communication", [...C, ...E, ...U], { badge: "messages" }),
  item("requests", "Service Requests", "/service-requests", ClipboardList, "Communication", [...C, ...U], { badge: "service_requests" }),
  item("support", "Support Tickets", "/support-tickets", CircleHelp, "Communication", all, { badge: "support_tickets" }),
  item("recovery", "Recovery Center", "/support-workspace", ShieldCheck, "Communication", S),
  item("support-staff", "Support Staff", "/support-staff", Users, "Communication", A),
  item("services", "Services & Rates", "/master-services", Wrench, "Business Setup", C),
  item("catalogue", "Service Catalogue & Master Data", "/master-services", Wrench, "Business Setup", A),
  item("reports", "Reports", "/reports", BarChart3, "Business Setup", [...C, ...A]),
  item("settings", "Settings", "/settings", Settings, "Business Setup", workers, { aliases: ["/provider-profile", "/applicator-profile", "/appearance"], description: "Business/personal details, trade, branding and appearance remain together in the merged Settings page." }),
  item("theme", "Theme Settings", "/contractor-theme", Palette, "Business Setup", C),
  item("subscription", "Subscription", "/my-packages", CreditCard, "Business Setup", workers),
  item("packages", "Packages", "/packages", Package, "Business Setup", A),
  item("integrations", "API Settings", "/admin-integrations", Wrench, "Business Setup", A),
  item("colors", "Colors & Shades", "/colors-shades", Palette, "Business Setup", [...C, ...E, ...U]),
  item("activity", "Activity Log", "/activity-log", Activity, "Business Setup", [...C, ...E, ...U, ...A]),
  item("appearance", "Appearance", "/appearance", Palette, "Business Setup", [...E, ...U, ...A, ...S]),
  item("profile", "Digital Profile", "/profile", UserRound, "Account", [...C, ...E, ...A, ...S]),
  item("customer-profile", "My Profile", "/customer/profile", UserRound, "Account", U),
  item("security", "Account Security", "/account-security", ShieldCheck, "Account", all),
].map((entry, order) => ({ ...entry, order }));

export function visibleNavigation(role, employment = "freelance") {
  return NAVIGATION.filter((entry) => entry.roles.includes(role)
    && (!entry.employment || entry.employment === employment)
    && (!entry.employmentByRole?.[role] || entry.employmentByRole[role] === employment)).sort((a, b) => a.order - b.order);
}

export function activeNavigation(entries, route) {
  const pathname = route.split("?")[0].replace(/\/+$/, "") || "/";
  const params = new URLSearchParams(route.split("?")[1] || "");
  const matchLength = (entry) => Math.max(...[entry.route, ...(entry.aliases || [])].map((base) => {
    const [basePath, query] = base.split("?");
    if (query && [...new URLSearchParams(query)].some(([key, value]) => params.get(key) !== value)) return -1;
    return pathname === basePath || (!query && pathname.startsWith(`${basePath}/`)) ? base.length : -1;
  }));
  return entries.filter((entry) => matchLength(entry) >= 0)
    .sort((a, b) => matchLength(b) - matchLength(a) || Number(b.route === pathname) - Number(a.route === pathname))[0];
}
