// Development-only browser audit. Actual components, isolated API fixtures, no persistence.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,Route,Routes} from 'react-router-dom';
import AuthContext from '../../context/auth-context.js';
import {LanguageProvider} from '../../i18n/LanguageContext.jsx';
import DashboardLayout from '../../layouts/DashboardLayout.jsx';
import api from '../../api/client.js';
import '../../index.css';
import '../../i18n/fonts.css';
import '../../styles/mobile-responsive.css';
import '../../styles/application-ui.css';
import '../../styles/reference-theme.css';
import '../../styles/role-dashboards.css';

const user={id:999990,name:'Bharath UI Sample',role:'CONTRACTOR',preferred_language:'en',branding:{employee_singular_label:'Employee'}};
const customer={id:999991,name:'Srinivasa Rao & Family',mobile:'9000000000',bharath_id:'UI-SAMPLE',is_active:true,connection_status:'CONNECTED',status:'ACTIVE',city:'Bengaluru',email:'preview@example.invalid',properties:[],quotations:[]};
const property={id:999992,name:'Bharath Residency — Block A, Third Floor',customer:customer.id,customer_name:customer.name,address:'Residential Main Road',city:'Bengaluru',pincode:'560001',rooms:[],measurements:[],updated_at:'2026-10-13T09:00:00Z'};
const counts={customers:24,properties:12,quotations:8,invoices:6,quotation_value:125000,active_leads:3,due_tasks:0,contractors:2,applicators:0,messages:0,active_work:0,assigned:3,in_progress:2,completed:7,total:12,active_contractors:2};
const dashboard={name:user.name,contractor_name:user.name,customer_name:customer.name,counts,profile_completion:{percent:100},recent_quotations:[],recent_properties:[],recent_completed:[],recent_customers:[],new_requests:[],upcoming_work:[],tasks:[],pipeline:[],recent_requests:[],recent_tickets:[],my_contractors:[],properties:[],active_work:[],assignments:[],customers:[],contractors:[],applicators:[],messages:[],quotations:[]};
let root;
export async function mountLiveScreen(name,role='CONTRACTOR',route='/dashboard',language='en',theme='custom'){
  if(!import.meta.env.DEV)throw new Error('Audit harness is development only.');
  root?.unmount();
  document.body.classList.add('bp-ui');
  const currentUser={...user,role,preferred_language:language};
  const colors=theme==='default'?{app_primary_color:'#2563EB',app_accent_color:'#F59E0B'}:{app_primary_color:'#245b75',app_accent_color:'#508398'};
  api.get=async path=>{
    let data=[];
    if(path.includes('admin-dashboard')||path.endsWith('/dashboard/')||path.endsWith('/applicator-dashboard/'))data=dashboard;
    else if(name==='PropertyDetail'&&path.endsWith('/measurement-records/'))data=[1,2].map(id=>({id,contractor:user.id,reference_no:`BPM-UI-${id}`,status:'IN_PROGRESS',measured_on:'2026-10-14',total_sqft:1000,room_count:2,surface_count:2,can_combine:true}));
    else if(name==='PropertyDetail'&&path===`/quotations/properties/${property.id}/`)data=property;
    else if(path.includes('business-settings'))data={company:{company_name:'Bharath UI Sample',mobile:'9000000000',email:'preview@example.invalid',company_logo_position:{x:50,y:50},profile_photo_position:{x:50,y:50},app_primary_color:'#245b75',app_accent_color:'#508398'},provider:{core_service:null,additional_services:[],service_claims:[],branding:{}}};
    else if(path.includes('contractor-profile')||path==='/accounts/me/')data={...currentUser,company_name:'Bharath UI Sample',...colors};
    else if(path.includes('notifications'))data={results:[],unread_count:0};
    else if(path==='/jobs/reports/')data={summary:{},monthly:[],quotation_statuses:[],upcoming:[]};
    else if(path.includes('connection-requests'))data={results:[]};
    else if(path.includes('menu-visibility'))data={};
    else if(path.includes('billing/status'))data={subscription:null,plan:null};
    else if(path.includes('customer-finance'))data={total_paid:48000,balance_due:5000,advance_credit:0,invoices:[],receipts:[]};
    else if(path.includes('my-in-house-employment'))data={employment_status:'ACTIVE',contractor_name:'Sample Contractor'};
    else if(/customers\/$/.test(path))data=[customer];
    else if(/properties\/$/.test(path))data=[property];
    else if(/customers\/999991\/$/.test(path))data={...customer,properties:[property]};
    else if(path.includes('provider-profile')||path.includes('applicator-profile'))data=currentUser;
    return {data};
  };
  api.post=api.patch=api.put=api.delete=async()=>{throw new Error('Application UI audit prevents API mutations.');};
  const {default:Screen}=await import(`../../pages/${name}.jsx`);
  const element=name==='ContractorDashboard'?React.createElement(Screen,{data:dashboard,onRefresh:()=>{}}):React.createElement(Screen);
  const publicScreen=['Login','Register','CustomerRegister','ForgotPassword'].includes(name);
  const screenRoute=React.createElement(Route,{path:route.replace(/\/\d+(?=\/|$)/g,'/:id'),element});
  const routes=React.createElement(Routes,null,publicScreen?screenRoute:React.createElement(Route,{element:React.createElement(DashboardLayout)},screenRoute));
  root=createRoot(document.getElementById('check'));
  root.render(React.createElement(AuthContext.Provider,{value:{user:publicScreen?null:currentUser,menuVisibility:{},logout:()=>{},login:async()=>currentUser}},React.createElement(LanguageProvider,null,React.createElement(MemoryRouter,{initialEntries:[route]},routes))));
}
