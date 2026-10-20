import type { ModuleId, RecordItem } from './navigation.ts';

export type NativeRecord = RecordItem & {
  phone?: string;
  location: string;
  image?: string;
  reference: string;
  customerId?: string;
  propertyId?: string;
  progress?: number;
  details: { label: string; value: string }[];
};
type Row = Record<string, unknown>;
const value = (item: unknown): string => typeof item === 'string' || typeof item === 'number' ? String(item) : '';
const nestedName = (item: unknown): string => item && typeof item === 'object' ? value((item as Row).name || (item as Row).title) : value(item);

const endpoints: Record<Exclude<ModuleId, 'settings'>, string> = {
  customers: '/quotations/customers/',
  properties: '/quotations/properties/',
  leads: '/quotations/leads/',
  quotations: '/quotations/',
  measurements: '/quotations/properties/',
  projects: '/jobs/work-schedules/',
  schedules: '/jobs/work-schedules/',
  payments: '/quotations/invoices/',
  messages: '/quotations/chat/conversations/',
  subcontracts: '/outsourcing/work-orders/',
  employees: '/jobs/in-house-applicators/',
  'wage-register': '/jobs/wage-register/',
};

export function modulePath(module: ModuleId) {
  if (module === 'settings') throw new Error('Settings uses account APIs');
  return endpoints[module];
}

export function filterWorkOrders<T extends { status: string }>(items: T[], filter: string): T[] {
  if (filter === 'ALL') return items;
  if (filter === 'ACTIVE') return items.filter(item => ['ACCEPTED', 'SCHEDULED', 'IN_PROGRESS', 'CORRECTION_REQUESTED'].includes(item.status));
  return items.filter(item => item.status === filter);
}

export function moduleDetailPath(module: ModuleId, id: string) {
  const root = modulePath(module);
  if (module === 'measurements') return `${root}${encodeURIComponent(id)}/measurement-records/`;
  if (module === 'messages') return `${root}${encodeURIComponent(id)}/messages/`;
  if (module === 'subcontracts') return `${root}${encodeURIComponent(id)}/`;
  if (module === 'schedules' && id.startsWith('visit-')) return `/quotations/site-visits/${encodeURIComponent(id.slice(6))}/`;
  if (module === 'schedules' || module === 'projects') return root;
  return `${root}${encodeURIComponent(id)}/`;
}

export function parseModulePage(input: unknown, module: ModuleId): { rows: NativeRecord[]; next: boolean } {
  const page = input as { results?: unknown; next?: unknown } | null;
  const rows = Array.isArray(input) ? input : page?.results;
  if (!Array.isArray(rows)) throw new Error('These records could not be loaded. Please retry.');
  return { rows: rows.map(raw => mapRecord(raw, module)), next: !Array.isArray(input) && !!page?.next };
}

export function mapRecord(raw: unknown, module: ModuleId): NativeRecord {
  if (!raw || typeof raw !== 'object' || !value((raw as Row).id)) throw new Error('Invalid record');
  const row = raw as Row;
  const customerValue = row.customer_details || row.customer;
  const customer = customerValue && typeof customerValue === 'object' ? customerValue as Row : null;
  const propertyValue = row.property_details || row.property;
  const property = propertyValue && typeof propertyValue === 'object' ? propertyValue as Row : null;
  const workOrder = module === 'subcontracts';
  const authority = value(row.viewer_authority);
  const counterparty = authority === 'MAIN' ? value(row.receiving_contractor_name) : value(row.main_contractor_name);
  const direction = authority === 'MAIN' ? 'You sent this work' : authority === 'RECEIVING' ? 'You received this work' : '';
  const title = value((workOrder && row.project_title) || row.name || row.property_name || row.opportunity_title || nestedName(propertyValue) || row.customer_name || row.customer || row.title || row.other_name || row.quotation_number || row.invoice_number || row.reference_no) || `${module.slice(0, -1)} ${value(row.id)}`;
  const location = value(row.city || row.locality || row.location || row.address || row.property_type || row.property);
  const reference = value(workOrder ? row.reference : row.quotation_number || row.invoice_number || row.reference_no || row.bharath_id || row.id);
  const rawAmount = workOrder ? row.agreed_amount : row.grand_total ?? row.total_amount ?? row.amount_due ?? row.total;
  const amount = workOrder && !(Number(rawAmount) > 0) ? undefined : rawAmount;
  const rawImage = value(row.photo || row.image || row.profile_photo || row.logo);
  const fields: [string, unknown][] = [
    ['Customer', row.customer_name || customer?.name || row.customer],
    ['Property', row.property_name || nestedName(row.property)],
    ['Address', row.address || row.billing_address || row.locality],
    ['Phone', row.mobile || row.customer_mobile || row.other_mobile],
    ['Status', row.status || row.stage],
    ['Date', row.scheduled_date || row.start_date || row.created_at],
    ['Time', row.scheduled_time],
    ['End date', row.end_date],
    ['Due date', row.due_date],
    ['Balance due', row.balance_due],
    ['Services', row.work_completed || row.service_type_name],
    ['Next follow-up', row.next_follow_up],
    ['Latest message', row.last_message],
    ['Last message at', row.last_message_at],
    ['Measured on', row.measured_on],
    ['Total area', row.total_sqft ? `${value(row.total_sqft)} sqft` : ''],
    ['Rooms', row.room_count],
    ['Measured surfaces', row.surface_count],
  ];
  if (workOrder) {
    fields.unshift(
      ['Work order', row.reference], ['Direction', direction], ['Contractor', counterparty],
      ['Quotation reference', row.quotation_reference], ['Site address', row.site_address],
      ['Required from', row.required_start_date], ['Required by', row.required_end_date],
      ['Agreed scope', row.agreed_scope_summary], ['Instructions', row.instructions],
    );
    const scopes = Array.isArray(row.scopes) ? row.scopes as Row[] : [];
    scopes.forEach((scope, index) => {
      const service = value(scope.title_snapshot || scope.work_description_snapshot || scope.category_name_snapshot || 'Shared scope');
      const quantity = value(scope.quantity);
      const unit = value(scope.unit_name_snapshot);
      fields.push([`Scope ${index + 1}`, [service, quantity && `${quantity}${unit ? ` ${unit}` : ''}`].filter(Boolean).join(' · ')]);
    });
  }
  if (module === 'quotations') {
    const quotationType = value(row.quotation_type);
    const gstMode = value(row.gst_mode).replaceAll('_', ' ');
    const items = Array.isArray(row.items) ? row.items as Row[] : [];
    fields.unshift(
      ['Quotation type', quotationType ? quotationType.replaceAll('_', ' ') : ''],
      ['Quotation date', row.quotation_date],
      ['Valid until', row.valid_until],
      ['Measurement record', row.measurement_record],
      ['Subtotal', row.subtotal],
      ['Discount', row.discount_amount ?? row.discount],
      ['GST', row.gst_percentage != null ? `${value(row.gst_percentage)}%${gstMode ? ` · ${gstMode}` : ''}` : ''],
      ['GST amount', row.gst_amount],
      ['Grand total', row.grand_total],
    );
    items.forEach((line, index) => {
      const description = value(line.description || line.service_type_name || line.service_name_snapshot) || `Quotation line ${index + 1}`;
      const quantity = value(line.quantity);
      const unit = value(line.custom_unit || line.unit_name_snapshot || line.unit);
      const rate = value(line.rate);
      const amount = value(line.amount);
      fields.push([`Line ${index + 1}`, [description, quantity && `${quantity}${unit ? ` ${unit}` : ''}`, rate && `₹${rate}`, amount && `₹${amount}`].filter(Boolean).join(' · ')]);
    });
    if (typeof row.notes === 'string' && row.notes.trim()) fields.push(['Notes', row.notes]);
  }
  const details = fields.filter(([, item]) => value(item)).map(([label, item]) => ({ label, value: value(item) }));
  const subtitle = workOrder
    ? [direction, counterparty, value(row.quotation_reference)].filter(Boolean).join(' · ')
    : [value(row.customer_name || customer?.name || (typeof row.customer === 'string' ? row.customer : '')), value(row.quotation_number || row.invoice_number), location].filter(Boolean).join(' · ');
  return {
    id: value(row.id), title,
    subtitle: subtitle || value(row.last_message || row.description || row.service_type_name || row.property_type),
    status: value(row.status || row.stage) || (module === 'messages' ? Number(row.unread_count) > 0 ? 'UNREAD' : 'READ' : 'ACTIVE'),
    amount: typeof amount === 'number' || typeof amount === 'string' ? String(amount) : undefined,
    phone: value(row.mobile || row.customer_mobile || row.other_mobile) || undefined,
    location, reference,
    image: /^https?:\/\//.test(rawImage) ? rawImage : undefined,
    customerId: value(row.customer_id || customer?.id) || undefined,
    propertyId: value(row.property_id || property?.id) || undefined,
    progress: typeof row.progress_percentage === 'number' ? row.progress_percentage : undefined,
    details,
  };
}
