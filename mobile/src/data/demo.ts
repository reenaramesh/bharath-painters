import type { Dashboard } from '../core/contracts';
import type { ModuleId, RecordItem, User } from '../core/navigation';
export const demoUser: User = { id: -1, role: 'CONTRACTOR', first_name: 'Bharath', is_verified: true, verification_status: 'VERIFIED' };
export const demoDashboard: Dashboard = {
  contractor_name: 'Bharath', profile_completion: { percent: 80, missing: ['Company address'] },
  counts: { customers: 24, properties: 18, quotations: 12, quotation_value: '845000', active_leads: 7, invoices: 8, due_tasks: 2, unread_messages: 3, site_visits: 2, new_requests: 1 },
  recent_customers: [{ id: 1, name: 'Ananya Rao', city: 'Bengaluru', mobile: 'Sample contact', status: 'ACTIVE' }, { id: 2, name: 'Vikram Shah', city: 'Mysuru', mobile: 'Sample contact', status: 'NEW' }],
  recent_quotations: [{ id: 1, number: 'QT-2026-042', customer: 'Ananya Rao', property: 'Whitefield residence', status: 'SENT', amount: '148500' }, { id: 2, number: 'QT-2026-043', customer: 'Vikram Shah', property: 'Lakeview apartment', status: 'DRAFT', amount: '82000' }],
  tasks: [{ id: 1, customer: 1, customer_name: 'Ananya Rao', comment: 'Discuss the exterior painting estimate', next_follow_up: '2026-10-09T05:00:00Z', overdue: true }],
  site_visits: [{ id: 1, customer_name: 'Vikram Shah', property_name: 'Lakeview apartment', scheduled_date: '2026-10-10', scheduled_time: '10:30', status: 'SCHEDULED' }],
  pipeline: [{ status: 'NEW', label: 'New', count: 3 }, { status: 'CONTACTED', label: 'Contacted', count: 4 }],
};
export const demoRecords: Record<ModuleId, RecordItem[]> = {
  customers: demoDashboard.recent_customers.map(item => ({ id: String(item.id), title: item.name, subtitle: item.city, status: item.status, note: 'Connected customer • sample record' })),
  properties: [{ id: '1', title: 'Whitefield residence', subtitle: 'Ananya Rao · Bengaluru', status: 'ACTIVE', note: '3 bedrooms · Interior and exterior painting' }, { id: '2', title: 'Lakeview apartment', subtitle: 'Vikram Shah · Mysuru', status: 'NEW' }],
  leads: [{ id: '1', title: 'Ananya Rao', subtitle: 'Exterior painting · Whitefield', status: 'CONTACTED' }, { id: '2', title: 'Priya Nair', subtitle: 'Home renovation · HSR Layout', status: 'NEW' }],
  quotations: demoDashboard.recent_quotations.map(item => ({ id: String(item.id), title: item.property, subtitle: `${item.number} · ${item.customer}`, status: item.status, amount: String(item.amount) })),
  measurements: [{ id: '1', title: 'Whitefield residence', subtitle: 'Living room · Wall surfaces', status: 'DRAFT', note: 'Property-based measurements. Area calculations are integrated in the next phase.' }],
  projects: [{ id: '1', title: 'Indiranagar residence', subtitle: 'Completed portfolio · Bengaluru', status: 'COMPLETED', note: 'Interior painting and finishing' }],
  schedules: [{ id: '1', title: 'Lakeview site visit', subtitle: '10 Oct · 10:30 AM · Vikram Shah', status: 'SCHEDULED' }, { id: '2', title: 'Whitefield painting', subtitle: '12 Oct · Interior preparation', status: 'CONFIRMED' }],
  payments: [{ id: '1', title: 'Whitefield invoice', subtitle: 'INV-2026-018 · Ananya Rao', status: 'PENDING', amount: '48500', note: 'Sample invoice amount. No payment can be collected in this prototype.' }],
  messages: [{ id: '1', title: 'Ananya Rao', subtitle: 'Can we discuss the exterior colours?', status: 'UNREAD' }, { id: '2', title: 'Vikram Shah', subtitle: 'Thank you, see you at the site visit.', status: 'READ' }],
  settings: [],
};
