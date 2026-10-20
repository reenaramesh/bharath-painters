import {
  LayoutDashboard, Users, Building2, Target, CalendarCheck, FileText, Phone,
  CalendarClock, ListTodo, Handshake, Network, BriefcaseBusiness,
  ReceiptText, WalletCards, MessageCircle, CircleHelp, ClipboardList,
  Settings, Wrench, BarChart3, Camera, Palette, Activity, CreditCard,
  Star, UserPlus, UserRound, ShieldCheck, Package, Ruler,
} from "lucide-react";

export const GROUPS = ["Overview", "Customers & CRM", "Properties & Measurements", "Quotations", "Work Management", "Portfolio / Showcase", "My Employees", "Hiring & Network", "Find Work", "My Work", "B2B Subcontracting", "Finance", "Communication", "People & Network", "Business Setup", "Settings"];
const C = ["CONTRACTOR"], E = ["PAINTER"], A = ["ADMIN"], U = ["CUSTOMER"], S = ["SUPPORT"];
const all = [...C, ...E, ...A, ...U, ...S];
const workers = [...C, ...E];
// Shared by the live sidebar and its development preview.
const item = (id, label, route, icon, group, roles, options = {}) => ({ id, label, route, icon, group, roles, ...options });
export const NAVIGATION = [
  item("dashboard", "Dashboard", "/dashboard", LayoutDashboard, "Overview", [...C, ...E, ...A], { aliases: ["/applicator"] }),
  item("customer-dashboard", "Dashboard", "/customer-dashboard", LayoutDashboard, "Overview", U),
  item("customers", "Customers", "/customers", Users, "Customers & CRM", C),
  item("opportunities", "Leads", "/opportunities", Target, "Customers & CRM", C),
  item("tasks", "Follow-ups & Tasks", "/tasks", ListTodo, "Customers & CRM", C, { badge: "tasks", description: "Customer follow-up tasks remain an independent feature." }),
  item("call-inbox", "Call Inbox", "/call-inbox", Phone, "Customers & CRM", C),
  item("site-visits", "Site Visits", "/site-visits", CalendarCheck, "Customers & CRM", C),
  item("properties", "Properties", "/properties", Building2, "Properties & Measurements", C, { aliases: ["/measurement-trial"], description: "Property measurements, saved records and area calculator." }),
  item("customer-properties", "My Properties", "/customer-properties", Building2, "Properties & Measurements", U),
  item("measurement-access", "Shared Measurements", "/measurement-access", Ruler, "Properties & Measurements", U, { badge: "measurement_access" }),
  item("quotations", "Quotations", "/quotations", FileText, "Quotations", C, { verified: true }),
  item("customer-quotations", "My Quotations", "/customer-quotations", FileText, "Quotations", U),
  item("projects", "Portfolio / Showcase", "/completed-projects", BriefcaseBusiness, "Portfolio / Showcase", C, { verified: true, description: "Public profile projects and showcase entries, separate from operational completed work." }),
  item("schedules", "Schedules & Reschedules", "/work-schedules", CalendarClock, "Work Management", [...C, ...U], { aliases: ["/work-reschedules"], badge: "work_updates" }),
  item("work-changes", "Work Changes", "/work-changes", ClipboardList, "Work Management", [...C, ...U]),
  item("subcontracts", "Work Orders", "/subcontract-work-orders", Handshake, "B2B Subcontracting", C, { verified: true, description: "Work sent and received, with status filters. Billing stays in the work-order detail." }),
  item("assignments", "My Assignments", "/painter-assignments", ClipboardList, "My Work", E),
  item("painter-history", "Work History", "/job-activity?section=HISTORY", CalendarCheck, "My Work", E),
  item("availability", "Availability & Calendar", "/applicator-availability", CalendarClock, "Find Work", E, { employment: "freelance" }),
  item("completed", "Completed Work", "/completed-work", CalendarCheck, "Work Management", [...C, ...U]),
  item("photos", "Work Photos", "/work-photos", Camera, "Work Management", [...C, ...E, ...U, ...A]),
  item("reviews", "Ratings & Reviews", "/work-reviews", Star, "Work Management", workers),
  item("employees", "Employees & Attendance", "/in-house-applicators", Users, "My Employees", C),
  item("painter-contacts", "Painter Contacts", "/painter-contacts", Palette, "Hiring & Network", C, { aliases: ["/painters/contacts"], description: "Your private painter contacts, including contacts shared from Truecaller." }),
  item("employment", "My Employment", "/in-house-applicators", BriefcaseBusiness, "My Work", E, { employment: "in-house" }),
  item("network", "Contractor Network", "/contractor-network", Network, "B2B Subcontracting", C, { verified: true }),
  item("jobs", "Jobs", "/jobs", BriefcaseBusiness, "Hiring & Network", C, { aliases: ["/painter-seeking"], description: "Manage job posts and view available professionals." }),
  item("available-work", "Available Jobs", "/jobs", BriefcaseBusiness, "Find Work", E, { aliases: ["/painter-seeking"], employment: "freelance" }),
  item("job-activity", "Applications & Invitations", "/job-activity", ClipboardList, "Hiring & Network", C),
  item("painter-applications", "My Applications", "/job-activity", ClipboardList, "Find Work", E, { employment: "freelance" }),
  item("painter-bookings", "Booking Requests", "/applicator-bookings", CalendarCheck, "Find Work", E, { badge: "applicator_bookings", employment: "freelance" }),
  item("referrals", "Contacts & Referrals", "/applicator-team", UserPlus, "Hiring & Network", C),
  item("bookings", "Bookings & Requests", "/applicator-bookings", CalendarCheck, "Hiring & Network", C, { badge: "applicator_bookings", aliases: ["/find-painter"] }),
  item("contractors", "Contractors", "/contractors", BriefcaseBusiness, "People & Network", A),
  item("professionals", "Employees & Professionals", "/painters", Users, "People & Network", A),
  item("connections-admin", "Customer Connections", "/customer-connections", Network, "People & Network", A),
  item("connections", "My Contractors", "/customer/connections", Network, "People & Network", U, { badge: "connection_requests", aliases: ["/customer/connection-requests"] }),
  item("customer-reviews", "Review Contractors", "/customer-reviews", Star, "People & Network", U),
  item("invoices", "Invoices", "/invoices", FileText, "Finance", C, { verified: true }),
  item("receipts", "Customer Payments & Revenue", "/contractor-revenue", ReceiptText, "Finance", C, { verified: true }),
  item("earnings", "My Earnings", "/in-house-earnings", WalletCards, "My Work", E, { description: "Existing earnings screen; eligibility and records remain controlled by the backend." }),
  item("customer-invoices", "Approved Projects & Payments", "/customer-invoices", ReceiptText, "Finance", U),
  item("billing", "Billing", "/billing", CreditCard, "Finance", A),
  item("revenue", "Subscription Revenue", "/revenue", BarChart3, "Finance", A),
  item("messages", "Messages", "/messages", MessageCircle, "Communication", [...C, ...E, ...U], { badge: "messages" }),
  item("requests", "Service Requests", "/service-requests", ClipboardList, "Communication", [...C, ...U], { badge: "service_requests" }),
  item("support", "Support Tickets", "/support-tickets", CircleHelp, "Communication", all, { badge: "support_tickets" }),
  item("recovery", "Recovery Center", "/support-workspace", ShieldCheck, "Communication", S),
  item("support-staff", "Support Staff", "/support-staff", Users, "Communication", A),
  item("services", "Services & Rates", "/master-services", Wrench, "Settings", C),
  item("catalogue", "Service Catalogue & Master Data", "/master-services", Wrench, "Business Setup", A),
  item("reports", "Reports", "/reports", BarChart3, "Business Setup", [...C, ...A]),
  item("settings", "Settings", "/settings", Settings, "Settings", workers, { aliases: ["/provider-profile", "/applicator-profile", "/appearance", "/contractor-theme"], description: "Business/personal details, trade, branding and appearance remain together in the merged Settings page." }),
  item("subscription", "Subscription", "/my-packages", CreditCard, "Business Setup", workers),
  item("packages", "Packages", "/packages", Package, "Business Setup", A),
  item("integrations", "API Settings", "/admin-integrations", Wrench, "Business Setup", A),
  item("colors", "Colors & Shades", "/colors-shades", Palette, "Business Setup", [...C, ...E, ...U]),
  item("activity", "Activity Log", "/activity-log", Activity, "Business Setup", [...C, ...E, ...U, ...A]),
  item("appearance", "Appearance", "/appearance", Palette, "Settings", [...U, ...A, ...S]),
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
