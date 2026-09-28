import useAuth from "../context/useAuth";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import { Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import api from "../api/client";
import GlobalTableSorting from "../components/GlobalTableSorting";
import MobileTableDialogs from "../components/MobileTableDialogs";
import CustomerConnectionPrompt from "../components/CustomerConnectionPrompt";
import MobileBottomNav from "../components/MobileBottomNav";
import "../pages/contractor-dashboard.css";

export default function DashboardLayout() {
  const { user } = useAuth();
  const contractorWorkspace = user?.role === "CONTRACTOR";
  const themedWorkspace = ["CONTRACTOR", "PAINTER", "CUSTOMER", "ADMIN"].includes(user?.role);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [appColors, setAppColors] = useState(null);
  useEffect(() => {
    if (!themedWorkspace) return undefined;
    let active = true;
    const updateColors = (colors) => {
      const primary = colors.app_primary_color || "#176B9B";
      const channels = [1, 3, 5].map((index) => parseInt(primary.slice(index, index + 2), 16) / 255);
      const luminance = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
      if (active) setAppColors({
        "--app-primary": primary,
        "--app-accent": colors.app_accent_color || "#508398",
        "--app-on-primary": luminance[0] * 0.2126 + luminance[1] * 0.7152 + luminance[2] * 0.0722 > 0.18 ? "#172033" : "#ffffff",
      });
    };
    if (contractorWorkspace) api.get("/accounts/contractor-profile/").then(({ data }) => updateColors(data)).catch(() => {});
    else updateColors(user);
    const onThemeChange = (event) => updateColors(event.detail);
    window.addEventListener("bp-app-theme-changed", onThemeChange);
    return () => { active = false; window.removeEventListener("bp-app-theme-changed", onThemeChange); };
  }, [contractorWorkspace, themedWorkspace, user?.id, user?.app_primary_color, user?.app_accent_color]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("bp-sidebar-collapsed") === "1",
  );
  const toggleSidebar = () =>
    setSidebarCollapsed((value) => {
      const next = !value;
      localStorage.setItem("bp-sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  return (
    <div style={themedWorkspace ? appColors || undefined : undefined} className={`minimia-shell flex min-h-screen overflow-x-hidden bg-[#f5f7fb] ${themedWorkspace ? "contractor-shell" : ""} ${user?.role === "ADMIN" ? "admin-shell" : ""}`}>
      <GlobalTableSorting />
      <MobileTableDialogs />
      <CustomerConnectionPrompt />
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={toggleSidebar}
        mobileOpen={mobileNavOpen}
        closeMobile={() => setMobileNavOpen(false)}
      />

      <div className="min-w-0 flex-1">
        <Topbar
          openMenu={() => setMobileNavOpen(true)}
          toggleSidebar={toggleSidebar}
        />

        <main className="mx-auto max-w-[1640px] px-3 pb-28 pt-4 sm:px-4 md:p-6 xl:p-8">
          <Outlet />
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
}
