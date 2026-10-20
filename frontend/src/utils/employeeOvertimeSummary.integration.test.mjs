import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import React from "react";
import { act, create } from "react-test-renderer";
import { transformWithOxc } from "vite";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const yearRow = { month: "2026-10", days_worked: 1, earning: "900", overtime_hours: "2", overtime_pay: "200", advance_deduction: "50", adjustments: "-100", total_earning: "950", adjustment_entries: [] };
const apiUrl = moduleUrl(`export default { get: async () => ({data:{wage_year_summary:${JSON.stringify({ months: [yearRow], totals: yearRow })}}}) };`);
async function loadComponent(name) {
  const url = new URL(`../components/${name}.jsx`, import.meta.url);
  const transformed = await transformWithOxc(await readFile(url, "utf8"), url.pathname, { jsx: { runtime: "automatic" } });
  const stubs = {
    "../api/client": apiUrl,
    "../context/useAuth": moduleUrl('export default () => ({user:{role:"CONTRACTOR",is_verified:true}});'),
    "./EmployeeOvertimeSettings": moduleUrl('export default () => null;'),
    "./EmployeeOvertimeSettings.jsx": moduleUrl('export default () => null;'),
    "react-router-dom": moduleUrl(`import React from ${JSON.stringify(import.meta.resolve("react"))}; export const Link = ({to,children}) => React.createElement("a",{href:to},children);`),
  };
  const code = transformed.code.replace(/from\s+(["'])([^"']+)\1/g, (_all, _quote, path) => `from ${JSON.stringify(stubs[path] || (path.startsWith(".") ? new URL(path, url).href : import.meta.resolve(path)))}`);
  return (await import(moduleUrl(code))).default;
}
const Register = await loadComponent("EmployeePayrollWorkspace");
const Wages = await loadComponent("EmployeeWages");
const text = node => typeof node === "string" ? node : (node.children || []).map(text).join("");
const employee = { membership_id: 7, employee_code: "EMP-7", name: "Overtime Employee", salary_amount: "800", payroll_summary: { earned_days: 1, day_wage: "800", total: "800", overtime_hours: "4", overtime_pay: "400" } };

test("monthly register separates base and OT, keeps historical rates and selected-month links", async () => {
  let view;
  await act(async () => { view = create(React.createElement(Register, { section: "wages", employees: [employee], month: "2026-10", onMonthChange() {} })); });
  const headings = view.root.findAllByType("th").map(text);
  for (const heading of ["Base wages", "OT hours", "OT pay", "Total"]) assert.ok(headings.includes(heading), heading);
  const cells = view.root.findByType("tbody").findAllByType("td").map(text);
  assert.deepEqual(cells.slice(-4), ["₹800", "4 hrs", "₹400", "₹1,200"]);
  assert.equal(view.root.findByType("a").props.href, "/in-house-applicators/7?section=wages&month=2026-10");
  await act(async () => view.update(React.createElement(Register, { section: "wages", employees: [{ ...employee, payroll_summary: {...employee.payroll_summary, day_wage_varies: true, gross_total: "0"} }], month: "2026-10", onMonthChange() {} })));
  assert.ok(text(view.toJSON()).includes("Varies"));
  assert.equal(view.root.findByType("tbody").findAllByType("td").at(-1).children[0], "₹0");
  await act(async () => view.unmount());
});

test("employee month and year show OT pay separately and preserve total after corrections", async () => {
  const data = { ...employee, salary_basis: "DAILY", attendance: [{status:"PRESENT",approval_status:"APPROVED",overtime_hours:"2"}], ledger: [
    {id:1,entry_type:"EARNING",amount:"900"}, {id:2,entry_type:"OVERTIME",amount:"400"}, {id:3,entry_type:"CREDIT_ADJUSTMENT",amount:"200",attendance_component:"OVERTIME"}, {id:4,entry_type:"ADVANCE",amount:"50"}, {id:5,entry_type:"PAYMENT",amount:"600"}, {id:6,entry_type:"CREDIT_ADJUSTMENT",amount:"100",attendance_component:"BASE"},
  ] };
  let view;
  await act(async () => { view = create(React.createElement(Wages, {data,month:"2026-10",onSaved() {},setMonth() {}})); });
  const month = view.root.findByProps({"aria-label":"Monthly employee wage summary"});
  assert.ok(month.findAllByType("th").map(text).includes("OT pay"));
  assert.ok(month.findAllByType("th").map(text).includes("Base adjustments"));
  assert.deepEqual(month.findByType("tbody").findAllByType("td").map(text).slice(-5), ["2 hrs","₹200","₹50","₹-100","₹950"]);
  assert.ok(text(view.toJSON()).includes("View 2 adjustments"));
  await act(async () => view.root.findAllByType("button").find(button => text(button) === "Year").props.onClick());
  const year = view.root.findByProps({"aria-label":"Yearly employee wage summary for 2026"});
  assert.ok(year.findAllByType("th").map(text).includes("OT pay"));
  assert.ok(text(year.findByType("tfoot")).includes("₹200"));
  assert.equal(text(year.findByType("tfoot").findAllByType("td").at(-1)), "₹950");
  await act(async () => view.unmount());
});

test("register retains name/ID search and the bonus and leave views", async () => {
  let view;
  const props = { employees: [{...employee,payroll_summary:{...employee.payroll_summary,bonus_total:"125",leave_days:"1.5"}}],month:"2026-10",onMonthChange() {} };
  await act(async () => { view = create(React.createElement(Register,{...props,section:"wages"})); });
  const search = view.root.findByProps({type:"search"});
  await act(async () => search.props.onChange({target:{value:"EMP-7"}}));
  assert.equal(view.root.findAllByType("a").length,1);
  await act(async () => search.props.onChange({target:{value:"Overtime Employee"}}));
  assert.equal(view.root.findAllByType("a").length,1);
  await act(async () => search.props.onChange({target:{value:"missing"}}));
  assert.equal(view.root.findAllByType("a").length,0);
  assert.equal(view.root.findByType("tbody").findByType("td").props.colSpan,9);
  await act(async () => search.props.onChange({target:{value:""}}));
  await act(async () => view.update(React.createElement(Register,{...props,section:"bonus"})));
  assert.equal(text(view.root.findByType("tbody").findAllByType("td").at(-1)),"₹125");
  assert.equal(view.root.findByType("a").props.href,"/in-house-applicators/7?section=bonus&month=2026-10");
  await act(async () => view.update(React.createElement(Register,{...props,section:"leaves"})));
  assert.equal(text(view.root.findByType("tbody").findAllByType("td").at(-1)),"1.5");
  await act(async () => view.unmount());
});
