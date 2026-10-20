// Isolated UI audit harness. Not imported by application routes. Synthetic data only.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AuthContext from '../context/auth-context.js';
import { LanguageProvider } from '../i18n/LanguageContext.jsx';
import api from '../api/client.js';
import { masters, measurement, exampleAssignments } from './quotationGrouping/fixtures.js';
import { assignmentQuotationItems } from '../utils/groupedQuotation.js';
import { quotationTotals } from '../utils/quotationPricing.js';
import '../index.css';
import '../styles/mobile-responsive.css';
import '../styles/application-ui.css';
import '../pages/customer-portal.css';
import PdfPreviewHost from '../components/PdfPreview.jsx';

const customer = { id: 1, name: 'Srinivasa Rao and Family — Long Customer Name', mobile: '9000000000', bharath_id: 'UI-CUSTOMER', connection_status: 'CONNECTED' };
const property = { id: 2, customer: 1, name: 'Bharath Residency — Block A, Third Floor', address: '123 Residential Main Road, Near Community Centre', city: 'Bengaluru', pincode: '560001' };
const line = { id: 901, room: 11, property_room_id: measurement.rooms[0].id, room_name: measurement.rooms[0].name, description: 'Prepare and paint living room walls with a durable washable finish and repair existing hairline cracks', service_category: 1, paint_type: 2, paint_brand: 1, quantity: '345.50', rate: '125.25', unit: masters.units[0].id, coats: 2, calculation_method: 'MANUAL', discount_type: 'PERCENTAGE', discount_value: '5' };
const profile = { company_name: 'Bharath UI Audit Contractor', service_areas: 'QA service area', mobile: '9000000000', office_address: property.address, quotation_terms_conditions: 'Protect existing furniture. Confirm colours before work starts. Payments follow the agreed milestones.' };
function quote(measured = false) {
  const items = measured ? assignmentQuotationItems(measurement, exampleAssignments(), masters).map((entry, index) => ({ ...entry, id: 1000 + index })) : [line, { ...line, id: 902, rate: '1250.50', quantity: '1000', description: 'Additional finishing for external surfaces and common areas', custom_unit: 'Job' }];
  const form = { discount_mode: 'BOTH', discount_type: 'PERCENTAGE', discount_value: 5, gst_mode: 'GST_EXTRA', gst_percentage: 18 };
  const totals = quotationTotals(items, form);
  const namedItems = items.map((item, index) => ({ ...item, amount: totals.lines[index].amount, service_category_name: masters.categories.find(entry => String(entry.id) === String(item.service_category))?.name, paint_type_name: masters.paintTypes.find(entry => String(entry.id) === String(item.paint_type))?.name, brand_name: masters.brands.find(entry => String(entry.id) === String(item.paint_brand))?.name, unit_name: masters.units.find(entry => String(entry.id) === String(item.unit))?.name }));
  return { id: 42, quotation_number: 'QT-2026-000042', quotation_date: '2026-10-12', updated_at: '2026-10-12T12:00:00Z', valid_until: '2026-11-12', status: 'DRAFT', can_edit: true, quotation_type: measured ? 'MEASUREMENT' : 'MANUAL_LUMPSUM', customer: 1, property: 2, customer_name: customer.name, property_name: property.name, contractor_name: profile.company_name, contractor_details: profile, measurement_record: measured ? measurement.id : null, rooms: measurement.rooms.map((room, index) => ({ ...room, id: 11 + index, property_room: room.id })), items: namedItems, ...form, subtotal: totals.subtotal, discount: totals.discount, gst_amount: totals.gst, grand_total: totals.total, terms_conditions: profile.quotation_terms_conditions, notes: 'Schedule after site readiness is confirmed.', work_duration: '15–18 days', history: [], revisions: [], version: 1 };
}

export async function mountAudit(name, { measured = false, review = false, state = 'loaded', create = false, status = 'DRAFT', legacy = false, exterior = false, generalService = false } = {}) {
  const data = quote(measured);
  if (generalService) {
    const serviceState={groups:[],specials:[],rates:{'review-service':20},services:[{id:'review-service',name:'Painting',room_id:measurement.rooms[0].id,room_name:measurement.rooms[0].name,surface:'WALL',quantity:2,unit:masters.units[0].id,spec:{service_category:masters.categories[0].id,description:'Wall crack repair',coats:1}}]};
    data.items=assignmentQuotationItems(measurement,serviceState,masters).map((item,index)=>({...item,id:5000+index}));
    const totals=quotationTotals(data.items,data); Object.assign(data,{subtotal:totals.subtotal,discount:totals.discount,gst_amount:totals.gst,grand_total:totals.total});
  }
  if (legacy || exterior) data.measurement_record = null;
  if (legacy) data.items = quote(false).items;
  const site = { ...property, measurement_type: exterior ? 'EXTERIOR' : 'INTERIOR' };
  data.status = status;
  data.property_access = { permissions: { request_quotation_changes: true, approve_quotations: true } };
  const records = [{ id: measurement.id, reference_no: 'MEASUREMENT-UI', measured_on: '2026-10-12', total_sqft: 1200, version: measurement.version }];
  api.get = async path => {
    if (state === 'loading') return new Promise(() => {});
    if (state === 'error') throw new Error('Synthetic network failure');
    let result = [];
    const mappings = { 'service-categories': masters.categories, 'service-types': masters.services, 'paint-types': masters.paintTypes, 'work-descriptions': masters.descriptions || [], brands: masters.brands, colors: [], units: masters.units, areas: [], 'contractor-profile': profile, 'measurement-records': records, measurements: exterior ? measurement.surfaces.map(surface => ({ ...surface, work_area: 'EXTERIOR' })) : measurement.surfaces, rooms: measurement.rooms };
    const segment = path.split('/').filter(Boolean).at(-1);
    if (mappings[segment]) result = mappings[segment];
    else if (/customers\/1\/$/.test(path)) result = { ...customer, properties: [property], quotations: [data] };
    else if (/properties\/2\/$/.test(path)) result = site;
    else if (segment === 'customers') result = [customer];
    else if (segment === 'properties') result = [site];
    else if (segment === 'quotations' || path === '/quotations/') result = [data];
    else if (/42\/$/.test(path)) result = data;
    if (state === 'empty' && Array.isArray(result)) result = [];
    return { data: result };
  };
  api.post = api.patch = api.delete = async () => { throw new Error('UI audit prevents persistence'); };
  const { default: Screen } = await import(name === 'SpecialWallSheet' ? '../components/SpecialWallSheet.jsx' : `../pages/${name}.jsx`);
  const builder = name === 'QuotationBuilder';
  const route = builder ? `/quotations/new-${measured ? 'measured' : 'manual'}` : name === 'CustomerQuotationHistory' ? '/customers/1/quotations' : name === 'CustomerQuotation' ? '/customer-quotations/42' : name === 'CustomerQuotations' ? '/customer-quotations' : name === 'Quotations' ? '/quotations' : `/quotations/42${name === 'QuotationEdit' ? '/edit' : ''}`;
  const user = { id: 999999, role: 'CONTRACTOR', name: 'UI audit' };
  localStorage.clear();
  localStorage.setItem('bharath_user', JSON.stringify(user));
  const root = createRoot(document.getElementById('check'));
  const screen = React.createElement(Screen, name === 'SpecialWallSheet' ? { parent: { quantity: 150, room_name: 'Living room', field_id: 'ui-wall' }, walls: [], masters, onClose: () => root.unmount(), onSave: () => {}, onDelete: () => {} } : builder ? { initialQuotation: create ? null : data } : {});
  const routes = React.createElement(Routes, null, React.createElement(Route, { path: route.replace('/42', '/:id').replace('/customers/1/', '/customers/:id/'), element: screen }));
  const portal = ['CustomerQuotation', 'CustomerQuotations'].includes(name);
  const content = React.createElement('main', { className: 'bp-page-container quotation-audit-host', style: { padding: '16px', maxWidth: '1440px', margin: 'auto' } }, routes, React.createElement(PdfPreviewHost));
  const shell = React.createElement('div', { className: `bp-ui minimia-shell ${portal ? 'customer-shell' : 'contractor-shell'}` }, content);
  const router = React.createElement(MemoryRouter, { initialEntries: [{ pathname: route, state: review ? { resumeReview: true } : {} }] }, shell);
  root.render(React.createElement(AuthContext.Provider, { value: { user } }, React.createElement(LanguageProvider, null, router)));
}
