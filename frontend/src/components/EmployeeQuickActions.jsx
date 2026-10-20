import { Link, useLocation } from "react-router-dom";
import { BadgeIndianRupee, CalendarCheck, CalendarDays, Users, Wallet } from "lucide-react";
import useAuth from "../context/useAuth";
import "./employee-workspace.css";

export default function EmployeeQuickActions({ employeeId }) {
  const { user } = useAuth();
  const location = useLocation();
  const section = new URLSearchParams(location.search).get("section");
  const root = employeeId ? `/in-house-applicators/${employeeId}` : "/in-house-applicators";
  const painter = user?.role === "PAINTER";
  const attendanceTo = painter ? `${root}?section=attendance` : "/in-house-applicators?section=attendance";
  const wagesTo = painter ? "/in-house-earnings" : "/in-house-applicators?section=wages";
  const actions = [
    ...(!painter ? [
      ["Employees", Users, "/in-house-applicators", !employeeId && !section && location.pathname === "/in-house-applicators"],
    ] : []),
    ["Attendance", CalendarCheck, attendanceTo, section === "attendance" || (painter && !section && location.pathname === root)],
    ["Wages", Wallet, wagesTo, section === "wages" || (location.pathname === "/in-house-earnings" && section !== "bonus")],
    ["Extra bonus", BadgeIndianRupee, painter ? "/in-house-earnings?section=bonus" : `${root}?section=bonus`, section === "bonus"],
    ["Leaves", CalendarDays, `${root}?section=leaves`, section === "leaves"],
  ];
  return <nav className="employee-quick-actions" aria-label="Employee quick actions" tabIndex={0}>
    {actions.map(([label, Icon, to, active]) => <Link key={label} to={to} aria-current={active ? "page" : undefined}><Icon size={17} aria-hidden="true" /><span>{label}</span></Link>)}
  </nav>;
}
