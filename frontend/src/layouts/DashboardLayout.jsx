import useAuth from "../context/useAuth";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import { Outlet, useLocation } from "react-router-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import api from "../api/client";
import GlobalTableSorting from "../components/GlobalTableSorting";
import MobileTableDialogs from "../components/MobileTableDialogs";
import CustomerConnectionPrompt from "../components/CustomerConnectionPrompt";
import MobileBottomNav from "../components/MobileBottomNav";
import FloatingQuickActions from "../components/FloatingQuickActions";
import useEmploymentStatus from "../hooks/useEmploymentStatus";
import { resolveAppTheme } from "../utils/appTheme";
import "../pages/contractor-dashboard.css";
import "../pages/customer-portal.css";

export default function DashboardLayout() {
  const { user } = useAuth();
  const employmentStatus = useEmploymentStatus(user);
  const pathname = useLocation().pathname;
  const messagesPage = pathname === "/messages";
  const contractorWorkspace = user?.role === "CONTRACTOR";
  const premiumContractorDashboard = contractorWorkspace && pathname === "/dashboard";
  const premiumContractorQuotationWorkspace = contractorWorkspace && (pathname === "/quotations" || pathname.startsWith("/quotations/"));
  const themedWorkspace = ["CONTRACTOR", "PAINTER", "CUSTOMER", "ADMIN", "SUPPORT"].includes(user?.role);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const navigationOpenerRef = useRef(null);
  const navigationBackgroundRef = useRef(null);
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);
  const [appColors, setAppColors] = useState(null);
  useEffect(() => {
    if (!themedWorkspace) return undefined;
    let active = true;
    const updateColors = (colors) => {
      const theme = resolveAppTheme(colors);
      const primary = theme.app_primary_color;
      const channels = [1, 3, 5].map((index) => parseInt(primary.slice(index, index + 2), 16) / 255);
      const luminance = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
      if (active) setAppColors({
        "--app-primary": primary,
        "--app-accent": theme.app_accent_color,
        "--app-on-primary": luminance[0] * 0.2126 + luminance[1] * 0.7152 + luminance[2] * 0.0722 > 0.18 ? "#172033" : "#ffffff",
      });
    };
    const fallbackColors = { app_primary_color: user?.app_primary_color, app_accent_color: user?.app_accent_color };
    if (contractorWorkspace) api.get("/accounts/contractor-profile/").then(({ data }) => updateColors(data)).catch(() => {});
    else api.get("/accounts/me/").then(({ data }) => updateColors(data)).catch(() => updateColors(fallbackColors));
    const onThemeChange = (event) => updateColors(event.detail);
    window.addEventListener("bp-app-theme-changed", onThemeChange);
    return () => { active = false; window.removeEventListener("bp-app-theme-changed", onThemeChange); };
  }, [contractorWorkspace, themedWorkspace, user?.id, user?.app_primary_color, user?.app_accent_color]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => { try { return localStorage.getItem("bp-sidebar-collapsed") === "1"; } catch { return false; } },
  );
  const toggleSidebar = () =>
    setSidebarCollapsed((value) => {
      const next = !value;
      try { localStorage.setItem("bp-sidebar-collapsed", next ? "1" : "0"); } catch { /* Collapse still works without storage. */ }
      return next;
    });
  return (
    <div style={themedWorkspace ? appColors || undefined : undefined} className={`bp-ui minimia-shell flex min-h-screen overflow-x-clip bg-[#f5f7fb] ${messagesPage ? "h-dvh overflow-y-hidden" : ""} ${themedWorkspace ? "contractor-shell" : ""} ${premiumContractorDashboard ? "bp-contractor-mosaic" : ""} ${premiumContractorQuotationWorkspace ? "bp-contractor-quotation" : ""} ${user?.role === "PAINTER" ? "painter-shell" : ""} ${user?.role === "CUSTOMER" ? "customer-shell" : ""} ${user?.role === "ADMIN" ? "admin-shell" : ""}`}>
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={toggleSidebar}
        mobileOpen={mobileNavOpen}
        closeMobile={closeMobileNav}
        backgroundRef={navigationBackgroundRef}
        openerRef={navigationOpenerRef}
        employmentStatus={employmentStatus}
      />

      <div ref={navigationBackgroundRef} className={`min-w-0 flex-1 ${messagesPage ? "flex min-h-0 flex-col" : ""}`}>
        <GlobalTableSorting />
        <MobileTableDialogs />
        <CustomerConnectionPrompt />
        <Topbar
          openMenu={() => setMobileNavOpen(true)}
          toggleSidebar={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
          menuButtonRef={navigationOpenerRef}
          mobileMenuOpen={mobileNavOpen}
        />

        <main className={`bp-page-container w-full pb-28 pt-4 md:py-6 xl:py-8 ${messagesPage ? "flex min-h-0 flex-1 flex-col overflow-hidden !pb-24 md:!pb-6 xl:!pb-8" : ""}`}>
          <Outlet context={{ employmentStatus }} />
        </main>
        <MobileBottomNav employmentStatus={employmentStatus} />
        <FloatingQuickActions key={pathname} employmentStatus={employmentStatus} pathname={pathname} />
      </div>
    </div>
  );
}
