import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import React from "react";
import { create, act } from "react-test-renderer";
import { transformWithOxc } from "vite";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const text = node => typeof node === "string" ? node : (node?.children || []).map(text).join("");
const button = (view, name) => view.root.findAllByType("button").find(node => text(node) === name);
const stub = `import React from ${JSON.stringify(import.meta.resolve("react"))};
export const api={get:async path=>({data:globalThis.__salesGet(path)}),patch:async(path,payload)=>{globalThis.__salesWrites.push([path,payload]);return globalThis.__salesPatch(path,payload);}};
export const useMobileView=()=>false;
export const useAuth=()=>({user:{id:2,role:'CONTRACTOR'}});
export const useSearchParams=()=>[globalThis.__salesParams];
const navigate=path=>globalThis.__salesNavigation.push(path);export const useNavigate=()=>navigate;
export const Link=({to,children,...props})=>React.createElement('a',{href:to,...props},children);
export const ContractorDialog=({title,children})=>React.createElement('div',{role:'dialog'},title,children);
export const Dialog=ContractorDialog;
export const Button=({children,variant,loading,...props})=>React.createElement('button',props,children);
export const PageHeader=({title,actions})=>React.createElement('header',null,title,actions);
export const SectionCard=({title,description,children})=>React.createElement('section',null,title,description,children);
export const ErrorState=({message})=>React.createElement('p',{role:'alert'},message);
export const EmptyState=({title})=>React.createElement('p',null,title);
export const StatusBadge=({status})=>React.createElement('span',null,status);
export const MobilePageBack=()=>null;export const ScheduleWorkspaceNav=()=>null;export const previewPdf=()=>{};`;
const stubUrl = `data:text/javascript;base64,${Buffer.from(stub).toString("base64")}`;
async function page(name) {
  const url = new URL(`../pages/${name}.jsx`, import.meta.url);
  let source = (await fs.readFile(url, "utf8")).replace(/^import ["'][^"']+\.css["'];$/gm, "");
  for (const name of ["api", "useMobileView", "useAuth", "ContractorDialog", "MobilePageBack", "ScheduleWorkspaceNav"]) {
    source = source.replace(new RegExp('import '+name+' from ["\'][^"\']+["\'];'), `import {${name}} from ${JSON.stringify(stubUrl)};`);
  }
  if (source.includes('import ScheduleApprovalMethod')) {
    const componentUrl = new URL('../components/ScheduleApprovalMethod.jsx', import.meta.url);
    const component = await transformWithOxc(await fs.readFile(componentUrl, 'utf8'), componentUrl.pathname, { jsx: { runtime: "automatic" } });
    const compiled = component.code.replace(/from\s+(["'])([^"']+)\1/g, (_m, _q, name) => `from ${JSON.stringify(import.meta.resolve(name))}`);
    const componentModule = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
    source = source.replace(/import ScheduleApprovalMethod from ["'][^"']+["'];/, `import ScheduleApprovalMethod from ${JSON.stringify(componentModule)};`);
  }
  const transformed = await transformWithOxc(source, url.pathname, { jsx: { runtime: "automatic" } });
  const code = transformed.code.replace(/from\s+(["'])([^"']+)\1/g, (_m, _q, name) => `from ${JSON.stringify(name === "react-router-dom" || name.endsWith("/ui") || name.endsWith("/ui/Dialog") || name.endsWith("/PdfPreview") ? stubUrl : name.startsWith("data:") ? name : name.startsWith(".") ? new URL(name.endsWith(".js") ? name : name + ".js", url).href : import.meta.resolve(name))}`);
  return (await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`)).default;
}
const SiteVisits = await page("SiteVisits");
const WorkSchedules = await page("WorkSchedules");
const WorkReschedules = await page("WorkReschedules");
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
function reset(query = "") {
  globalThis.__salesParams = new URLSearchParams(query);
  globalThis.__salesNavigation = [];
  globalThis.__salesWrites = [];
  globalThis.__salesPatch = async () => ({data:{}});
  globalThis.__salesGet = () => [];
  globalThis.window = { setInterval:()=>1,clearInterval:()=>{},addEventListener:()=>{},removeEventListener:()=>{} };
}
async function mount(Page) { let view; await act(async () => { view = create(React.createElement(Page)); }); return view; }
const visit = () => ({id:9,customer:4,customer_name:"Anita",property:8,opportunity:12,status:"SCHEDULED",scheduled_date:today()});
const schedule = () => ({id:6,quotation:9,quotation_number:"Q9",status:"CONFIRMED",payment_status:"NOT_REQUESTED",start_date:"2000-01-01",end_date:"2000-01-02",painters:[],contractor_accepted:true,customer_accepted:true});

test("schedule has one painter management control and keeps advance actions in details", async () => {
  reset();
  const current = {...schedule(), start_date:today(), end_date:today(), scheduling_mode:"CONTRACTOR", painters:[{id:7,name:"Ravi",status:"ACCEPTED"}]};
  globalThis.__salesGet = path => path.startsWith("/jobs/work-schedules/") ? [current] : [];
  const view = await mount(WorkSchedules);
  assert.equal(view.root.findAllByType("button").filter(node => text(node) === "Manage painters").length, 1);
  assert.equal(button(view,"Assign Paint Applicators"), undefined);
  assert.ok(text(view.toJSON()).includes("Ravi"));
  assert.equal(button(view,"Request advance"), undefined);
  await act(async () => button(view,"View details").props.onClick());
  assert.ok(button(view,"Request advance"));
  assert.ok(button(view,"Payment received directly"));
  await act(async () => view.unmount());
});

test("reschedules exposes a retry that recovers from a failed list request", async () => {
  reset();
  globalThis.__salesGet = () => { throw new Error("Connection unavailable"); };
  const view = await mount(WorkReschedules);
  assert.ok(text(view.root.findByProps({role:"alert"})).includes("Schedules could not be loaded."));
  globalThis.__salesGet = () => [{...schedule(),customer:"Anita",property:"Home"}];
  await act(async () => button(view,"Retry loading schedules").props.onClick());
  assert.equal(view.root.findAllByProps({role:"alert"}).length,0);
  assert.ok(text(view.toJSON()).includes("Anita"));
  await act(async () => view.unmount());
});

test("site-visit page waits for PATCH and retains a recoverable error without navigating", async () => {
  reset(); const current = visit();
  globalThis.__salesGet = path => path.startsWith("/quotations/site-visits/") ? [current] : [];
  let reject; globalThis.__salesPatch = () => new Promise((_resolve, fail) => { reject = fail; });
  const view = await mount(SiteVisits);
  let pending;
  await act(async () => { pending = button(view,"Complete & create quotation").props.onClick(); });
  assert.deepEqual(globalThis.__salesNavigation, []);
  assert.deepEqual(globalThis.__salesWrites, [["/quotations/site-visits/9/",{status:"COMPLETED"}]]);
  await act(async () => { reject({response:{data:{detail:"Try again"}}}); await pending; });
  assert.deepEqual(globalThis.__salesNavigation, []);
  assert.equal(text(view.root.findByProps({role:"alert"})), "Try again");
  assert.ok(button(view,"Complete & create quotation"));
  await act(async () => view.unmount());
});

test("completed visits resume an owned measurement without another completion", async () => {
  reset(); const current = {...visit(),status:"COMPLETED"};
  globalThis.__salesGet = path => path.startsWith("/quotations/site-visits/") ? [current] : path.endsWith("/measurement-records/") ? [{id:31,contractor:2,status:"DRAFT"}] : [];
  const view = await mount(SiteVisits);
  await act(async () => button(view,"Completed / Past (1)").props.onClick());
  await act(async () => button(view,"Open measurement").props.onClick());
  assert.deepEqual(globalThis.__salesNavigation,["/properties/8/measurements?measurement=31"]);
  assert.deepEqual(globalThis.__salesWrites,[]);
  await act(async () => view.unmount());
});

test("synthetic followup completion preserves customer and offers no invented measurement property", async () => {
  reset();
  globalThis.__salesGet = path => path.startsWith("/quotations/tasks/") ? [{id:5,customer:4,customer_name:"Anita",follow_up_type:"SITE_VISIT",next_follow_up:new Date().toISOString()}] : [];
  const view = await mount(SiteVisits);
  assert.equal(button(view,"Complete & open measurement"),undefined);
  await act(async () => button(view,"Complete & create quotation").props.onClick());
  assert.deepEqual(globalThis.__salesWrites,[["/quotations/tasks/5/",{is_completed:true}]]);
  assert.deepEqual(globalThis.__salesNavigation,["/quotations/new?customer=4"]);
  await act(async () => view.unmount());
});

test("schedule query expands current advance actions and clears dates without a proposal", async () => {
  reset("quotation=9"); const current=schedule();
  globalThis.__salesGet = path => path.startsWith("/jobs/work-schedules/") ? [current] : path.startsWith("/quotations/") ? [{id:9,status:"SCHEDULED"}] : [];
  const view = await mount(WorkSchedules);
  assert.equal(view.root.findAllByProps({role:"dialog"}).length,0);
  assert.ok(button(view,"Request advance"));
  assert.equal(view.root.findByProps({"aria-label":"Filter schedule dates"}).props.value,"ALL");
  assert.deepEqual(globalThis.__salesWrites,[]);
  await act(async () => view.unmount());
});

test("pending work dates cannot expose an advance request through the query handoff", async () => {
  reset("quotation=9");
  globalThis.__salesGet = path => path.startsWith("/jobs/work-schedules/") ? [{...schedule(),status:"PENDING"}] : [];
  const view = await mount(WorkSchedules);
  assert.equal(button(view,"Request advance"),undefined);
  assert.equal(button(view,"Set advance"),undefined);
  await act(async () => view.unmount());
});

test("only a current unscheduled accepted quotation opens the proposal", async () => {
  reset("quotation=10");
  globalThis.__salesGet = path => path.startsWith("/quotations/") ? [{id:10,status:"ACCEPTED",quotation_number:"Q10"}] : [];
  const view = await mount(WorkSchedules);
  assert.equal(view.root.findAllByProps({role:"dialog"}).length,1);
  assert.deepEqual(globalThis.__salesWrites,[]);
  await act(async () => view.unmount());
});

test("a booked followup date opens the matching visit and marks its row", async () => {
  reset("followup=5&date=2099-10-07");
  globalThis.__salesGet = path => path.startsWith("/quotations/tasks/") ? [{id:5,customer:4,customer_name:"Anita",follow_up_type:"SITE_VISIT",next_follow_up:new Date(2099,9,7,9).toISOString()}] : [];
  const view = await mount(SiteVisits);
  assert.equal(view.root.findByProps({"aria-label":"Filter site visits by date"}).props.value,"2099-10-07");
  assert.ok(button(view,"Complete & create quotation"));
  assert.equal(view.root.findByType("article").props["aria-current"],"true");
  await act(async () => view.root.findByProps({"aria-label":"Filter site visits by date"}).props.onChange({target:{value:""}}));
  assert.equal(view.root.findByProps({"aria-label":"Filter site visits by date"}).props.value,"");
  await act(async () => view.unmount());
});

test("kickoff full queue contains every valid quotation without completed schedule clutter", async () => {
  reset("queue=kickoff");
  const quotations=Array.from({length:12},(_,index)=>({id:index+10,status:"ACCEPTED",quotation_number:`Q${index+10}`}));
  globalThis.__salesGet = path => path.startsWith("/quotations/") ? quotations : path.startsWith("/jobs/work-schedules/") ? [{...schedule(),status:"COMPLETED"}] : [];
  const view=await mount(WorkSchedules);
  assert.equal(view.root.findAllByType("button").filter(node=>text(node)==="Propose work dates").length,12);
  assert.equal(text(view.root).includes("Completed schedules"),false);
  assert.equal(view.root.findAllByProps({role:"dialog"}).length,0);
  await act(async () => view.unmount());
});

test("a past booked visit remains overdue until explicit completion", async () => {
  reset("followup=5&date=2000-10-07");
  globalThis.__salesGet = path => path.startsWith("/quotations/tasks/") ? [{id:5,customer:4,follow_up_type:"SITE_VISIT",next_follow_up:new Date(2000,9,7,9).toISOString()}] : [];
  const view=await mount(SiteVisits);
  assert.ok(button(view,"Complete & create quotation"));
  assert.deepEqual(globalThis.__salesWrites,[]);
  await act(async () => view.unmount());
});

test("kickoff schedule filter counts match the advance attention queue", async () => {
  reset("queue=kickoff");
  globalThis.__salesGet = path => path.startsWith("/jobs/work-schedules/") ? [{...schedule(),payment_status:"CONFIRMED"}] : [];
  const view=await mount(WorkSchedules);
  assert.ok(button(view,"All 0"));
  await act(async () => view.unmount());
});
