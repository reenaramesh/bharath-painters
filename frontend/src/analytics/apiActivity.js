import { beginFeature, captureFeatureContext, trackFeature, trackFeatureError } from './features.js';

// Match only method/path and fixed success markers. Request bodies and URL queries are never read.
const hasId = data => Boolean(data?.id);
const rules = [
  ['get', /^\/quotations\/properties\/\d+\/measurements\/$/, ['measurement_opened']],
  ['post', /^\/quotations\/properties\/\d+\/measurements\/$/, ['measurement_added'], hasId, true],
  ['post', /^\/quotations\/measurement-records\/\d+\/submit\/$/, ['measurement_submitted'], null, true],
  ['post', /^\/quotations\/create\/$/, ['quotation_created','draft_saved'], data=>hasId(data)&&data.status==='DRAFT', true],
  ['post', /^\/quotations\/\d+\/versions\/$/, ['draft_saved'], data=>hasId(data)&&data.status==='DRAFT', true],
  ['patch', /^\/quotations\/\d+\/draft\/$/, ['draft_saved'], data=>hasId(data)&&data.status==='DRAFT', true],
  ['post', /^\/quotations\/\d+\/submit\/$/, ['quotation_submitted'], data=>data?.status==='SENT', true],
  ['get', /^\/quotations\/\d+\/pdf\/$/, ['pdf_generated']],
  ['get', /^\/jobs\/list\/$/, ['job_browsed']],
  ['post', /^\/jobs\/\d+\/apply\/$/, ['job_applied'], data=>Boolean(data?.application_id)&&data.status==='APPLIED', true],
  ['post', /^\/jobs\/create\/$/, ['job_posted'], hasId, true],
  ['post', /^\/jobs\/applications\/\d+\/accept\/$/, ['application_accepted'], null, true],
  ['post', /^\/outsourcing\/work-orders\/$/, ['work_order_created'], hasId, true],
  ['post', /^\/outsourcing\/work-orders\/\d+\/assignments\/$/, ['employee_assigned'], null, true],
  ['put', /^\/jobs\/work-schedules\/\d+\/painters\/$/, ['employee_assigned'], null, true],
  ['get', /^\/(?:jobs|outsourcing\/work-orders)\/my-assignments\/$/, ['assigned_work_opened']],
  ['post', /^\/jobs\/my-assignments\/\d+\/progress\/$/, ['assignment_updated'], null, true],
  ['get', /^\/jobs\/my-in-house-earnings\/$/, ['earnings_opened']],
  ['get', /^\/quotations\/customer-portal\/properties\/\d+\/$/, ['shared_property_opened'], data=>Boolean(data?.property?.id)],
  ['post', /^\/quotations\/customer-portal\/property-share-requests\/\d+\/respond\/$/, ['invitation_accepted'], data=>data?.status==='ACTIVE', true, true],
  ['get', /^\/quotations\/customer-portal\/quotations\/\d+\/$/, ['quotation_viewed'], hasId],
  ['post', /^\/quotations\/customer-portal\/quotations\/\d+\/action\/$/, ['quotation_accepted'], data=>data?.status==='ACCEPTED', true, true],
  ['post', /^\/accounts\/customer-reviews\/$/, ['review_submitted'], data=>Number.isInteger(data?.rating), true],
  ['post', /^\/quotations\/service-requests\/$/, ['service_request_created'], hasId, true],
  ['get', /^\/jobs\/my-in-house-employment\/$/, ['attendance_opened']],
  ['post', /^\/jobs\/in-house-applicators\/\d+\/attendance\/$/, ['check_in_submitted'], data=>hasId(data)&&data.status==='PRESENT'&&data.approval_status==='PENDING', true],
  ['post', /^\/jobs\/work-photos\/$/, ['progress_photo_uploaded'], hasId, true],
];

function match(config) {
  const path=(config.url || '').split('?')[0].replace(/^https?:\/\/[^/]+/, '').replace(/^\/api(?=\/)/,'');
  return rules.find(([method,pattern])=>method===(config.method || 'get').toLowerCase()&&pattern.test(path));
}
const errorClass = status => ({400:'validation',401:'permission',403:'permission',404:'not_found',409:'conflict',429:'rate_limited'})[status] || (status>=500 ? 'server' : status ? 'unexpected' : 'network');
function pageContext() {
  let owner;
  try { owner=JSON.parse(globalThis.localStorage?.getItem('bharath_user') || 'null')?.id; } catch { /* optional storage */ }
  return {path:globalThis.location?.pathname,owner};
}
function responseContext(tracking) {
  if (tracking.context) return tracking.context;
  const current=pageContext();
  // Initial mount reads can start before React installs the collector. Keep this
  // path/account snapshot in request memory only; it never enters an event.
  return tracking.rule[0]==='get' && current.path===tracking.page.path && current.owner===tracking.page.owner ? captureFeatureContext() : undefined;
}

export function installAnalyticsRequests(api) {
  api.interceptors.request.use(config=>{
    try {
      const rule=match(config);
      if (rule && !config._behavior) {
        const context=captureFeatureContext();
        if (context || rule[0]==='get') {
          config._behavior={rule,context,page:pageContext()};
          if (rule[4] && !rule[5]) for (const action of rule[2]) beginFeature(action);
        }
      }
    } catch { /* business requests never depend on telemetry */ }
    return config;
  });
  api.interceptors.response.use(response=>{
    try {
      const tracking=response.config._behavior;
      if (tracking && !tracking.emitted && response.status>=200 && response.status<300) {
        tracking.emitted=true;
        const context=responseContext(tracking);
        const [, , actions, success, mutation]=tracking.rule;
        if (context && (!success || success(response.data)) && !(actions[0]==='measurement_added' && response.status!==201)) {
          for (const action of actions) trackFeature(action,{once:!mutation && action!=='pdf_generated',context});
        }
      }
    } catch { /* optional telemetry */ }
    return response;
  },error=>{
    try {
      const tracking=error.config?._behavior;
      if (tracking && !tracking.rule[5] && !tracking.emitted && error.code!=='ERR_CANCELED') {
        tracking.emitted=true;
        const context=responseContext(tracking);
        if(context)for (const action of tracking.rule[2]) trackFeatureError(action,errorClass(error.response?.status),context);
      }
    } catch { /* optional telemetry */ }
    return Promise.reject(error);
  });
}
