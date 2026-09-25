import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import { Outlet } from "react-router-dom";
import { useState } from "react";
import GlobalTableSorting from "../components/GlobalTableSorting";
import MobileTableDialogs from "../components/MobileTableDialogs";
import CustomerConnectionPrompt from "../components/CustomerConnectionPrompt";
import MobileBottomNav from "../components/MobileBottomNav";

export default function DashboardLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
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
    <div className="minimia-shell flex min-h-screen overflow-x-hidden bg-[#f5f7fb]">
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
