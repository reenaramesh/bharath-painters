import type {
  AttendanceRecord,
  InvoicePaymentRecord,
  MeasurementVersionRecord,
  ProjectScopeRecord,
  QuotationLineRecord,
  QuotationRecord,
  WorkAssignmentRecord,
} from './contracts.ts';
import { parseDecimalString } from './calculationSafety.ts';

export type ApiFailureKind =
  | 'VALIDATION'
  | 'AUTHENTICATION'
  | 'PERMISSION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'NETWORK'
  | 'SERVER'
  | 'UNKNOWN';

export type ApiFieldErrors = Record<string, unknown>;

export interface ApiFailure {
  kind: ApiFailureKind;
  status: number | null;
  message: string;
  fieldErrors: ApiFieldErrors;
}

export interface Page<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function positiveId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function nullableId(value: unknown): value is number | null {
  return value === null || positiveId(value);
}

function oneOf<const T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === 'string' && values.includes(value);
}

const quotationStatuses = [
  'DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED',
  'REJECTED', 'EXPIRED', 'CONVERTED', 'CANCELLED', 'REVISION_REQUESTED',
] as const;
const paymentModes = ['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'CHEQUE', 'OTHER'] as const;

export function isMeasurementVersionRecord(value: unknown): value is MeasurementVersionRecord {
  const item = record(value);
  return Boolean(item && positiveId(item.id) && positiveId(item.property) && nullableId(item.contractor)
    && Number.isSafeInteger(item.version) && (item.version as number) > 0 && typeof item.status === 'string'
    && oneOf(['DRAFT', 'IN_PROGRESS', 'COMPLETED', 'LOCKED'] as const, item.status)
    && typeof item.updated_at === 'string'
    && (item.submitted_at === undefined || item.submitted_at === null || typeof item.submitted_at === 'string')
    && (item.total_sqft === undefined || parseDecimalString(item.total_sqft, { maxDecimalPlaces: 2 }) !== null));
}

export function isInvoicePaymentRecord(value: unknown): value is InvoicePaymentRecord {
  const item = record(value);
  const sourceSchedule = item?.source_schedule ?? null;
  const sourceReceipt = item?.source_receipt ?? null;
  return Boolean(item && positiveId(item.id) && positiveId(item.invoice)
    && parseDecimalString(item.amount, { maxDecimalPlaces: 2 }) !== null && oneOf(paymentModes, item.payment_mode)
    && typeof item.received_date === 'string' && nullableId(sourceSchedule)
    && nullableId(sourceReceipt) && (sourceSchedule === null || sourceReceipt === null));
}

export function isAttendanceRecord(value: unknown): value is AttendanceRecord {
  const item = record(value);
  return Boolean(item && positiveId(item.id) && positiveId(item.membership)
    && typeof item.date === 'string' && oneOf(['PRESENT', 'HALF_DAY', 'ABSENT', 'LEAVE'] as const, item.status)
    && oneOf(['PENDING', 'APPROVED', 'REJECTED'] as const, item.approval_status)
    && typeof item.marked_at === 'string' && parseDecimalString(item.overtime_hours, { maxDecimalPlaces: 2 }) !== null
    && (item.reviewed_by === undefined || nullableId(item.reviewed_by))
    && (item.reviewed_at === undefined || item.reviewed_at === null || typeof item.reviewed_at === 'string')
    && (item.schedule === undefined || nullableId(item.schedule)));
}

export function isQuotationRecord(value: unknown): value is QuotationRecord {
  const item = record(value);
  return Boolean(item && positiveId(item.id) && typeof item.quotation_number === 'string'
    && positiveId(item.customer) && nullableId(item.property) && nullableId(item.measurement_record)
    && oneOf(['MEASUREMENT', 'MANUAL_LUMPSUM'] as const, item.quotation_type)
    && oneOf(quotationStatuses, item.status)
    && parseDecimalString(item.subtotal, { maxDecimalPlaces: 2 }) !== null && parseDecimalString(item.discount, { maxDecimalPlaces: 2 }) !== null
    && parseDecimalString(item.gst_percentage, { maxDecimalPlaces: 2 }) !== null && parseDecimalString(item.gst_amount, { maxDecimalPlaces: 2 }) !== null
    && parseDecimalString(item.grand_total, { maxDecimalPlaces: 2 }) !== null
    && oneOf(['GST_EXTRA', 'GST_INCLUDED', 'NO_GST'] as const, item.gst_mode)
    && oneOf(['OVERALL', 'LINE', 'BOTH'] as const, item.discount_mode)
    && oneOf(['FIXED', 'PERCENTAGE'] as const, item.discount_type)
    && parseDecimalString(item.discount_value, { maxDecimalPlaces: 2 }) !== null && typeof item.updated_at === 'string'
    && (item.items === undefined || (Array.isArray(item.items) && item.items.every(isQuotationLineRecord))));
}

export function isQuotationLineRecord(value: unknown): value is QuotationLineRecord {
  const item = record(value);
  return Boolean(item && positiveId(item.id) && typeof item.description === 'string'
    && (item.room === undefined || nullableId(item.room))
    && (item.calculation_method === undefined || oneOf(['AREA', 'LUMPSUM', 'MANUAL'] as const, item.calculation_method))
    && (item.quantity === undefined || item.quantity === null || parseDecimalString(item.quantity, { maxDecimalPlaces: 2 }) !== null)
    && parseDecimalString(item.rate, { maxDecimalPlaces: 2 }) !== null
    && parseDecimalString(item.amount, { maxDecimalPlaces: 2 }) !== null
    && (item.discount_amount === undefined || parseDecimalString(item.discount_amount, { maxDecimalPlaces: 2 }) !== null)
    && (item.net_amount === undefined || parseDecimalString(item.net_amount, { maxDecimalPlaces: 2 }) !== null)
    && (item.included_areas === undefined || (Array.isArray(item.included_areas) && item.included_areas.every((area) => typeof area === 'string'))));
}

export function isWorkAssignmentRecord(value: unknown): value is WorkAssignmentRecord {
  const item = record(value);
  return Boolean(item && positiveId(item.id) && positiveId(item.schedule) && positiveId(item.painter)
    && oneOf(['ASSIGNED', 'ACCEPTED', 'DECLINED', 'RELEASED', 'IN_PROGRESS', 'COMPLETED'] as const, item.status)
    && oneOf(['DAILY', 'WEEKLY'] as const, item.wage_type)
    && (item.agreed_wage === null || parseDecimalString(item.agreed_wage, { maxDecimalPlaces: 2 }) !== null)
    && (item.source_application === undefined || nullableId(item.source_application))
    && (item.source_booking === undefined || nullableId(item.source_booking)));
}

export function isProjectScopeRecord(value: unknown): value is ProjectScopeRecord {
  const item = record(value);
  if (!item || !positiveId(item.id) || !positiveId(item.quotation) || typeof item.title !== 'string'
      || !oneOf(['PROPOSED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const, item.status)
      || !oneOf(['INTERNAL', 'OUTSOURCED'] as const, item.handling)
      || (item.completed_quantity !== undefined && parseDecimalString(item.completed_quantity, { maxDecimalPlaces: 2 }) === null)) return false;
  const quotationItem = item.source_quotation_item;
  const workChangeItem = item.source_work_change_item;
  if (quotationItem === undefined && workChangeItem === undefined) return true;
  return nullableId(quotationItem) && nullableId(workChangeItem)
    && (quotationItem === null || workChangeItem === null);
}

function fieldErrors(value: unknown): ApiFieldErrors {
  const source = record(value);
  if (!source) return {};
  const result: ApiFieldErrors = {};
  for (const [key, raw] of Object.entries(source)) {
    if (key === 'detail' || key === 'message' || key === 'code' || key === 'errors') continue;
    result[key] = raw;
  }
  return result;
}

function messageFrom(data: unknown, fallback: string): string {
  if (typeof data === 'string' && data.trim()) return data.trim();
  const source = record(data);
  for (const key of ['detail', 'message', 'error']) {
    const candidate = source?.[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  const errors = source?.errors;
  if (typeof errors === 'string' && errors.trim()) return errors.trim();
  return fallback;
}

export function normalizeApiError(error: unknown): ApiFailure {
  const source = record(error);
  const response = record(source?.response);
  const rawStatus = response?.status ?? source?.status;
  const status = typeof rawStatus === 'number' && Number.isInteger(rawStatus) ? rawStatus : null;
  const responseData = response?.data;
  const message = messageFrom(
    responseData,
    typeof source?.message === 'string' && source.message.trim()
      ? source.message.trim()
      : status === null ? 'The request could not be completed.' : `Request failed (${status}).`,
  );
  let kind: ApiFailureKind = 'UNKNOWN';
  if (status === 400 || status === 422) kind = 'VALIDATION';
  else if (status === 401) kind = 'AUTHENTICATION';
  else if (status === 403) kind = 'PERMISSION';
  else if (status === 404) kind = 'NOT_FOUND';
  else if (status === 409 || status === 412) kind = 'CONFLICT';
  else if (status !== null && status >= 500) kind = 'SERVER';
  else if (status === 0 || (status === null && Boolean(source?.request || source?.isNetworkError))) kind = 'NETWORK';
  return { kind, status, message, fieldErrors: fieldErrors(responseData) };
}

export function parsePage<T>(value: unknown, isItem: (item: unknown) => item is T): Page<T> | null {
  if (Array.isArray(value)) {
    if (!value.every(isItem)) return null;
    return { count: value.length, next: null, previous: null, results: value };
  }
  const source = record(value);
  if (!source || !Array.isArray(source.results) || !source.results.every(isItem)) return null;
  const count = source.count;
  const next = source.next;
  const previous = source.previous;
  if (!Number.isSafeInteger(count) || (count as number) < 0) return null;
  if (next !== null && typeof next !== 'string') return null;
  if (previous !== null && typeof previous !== 'string') return null;
  return { count: count as number, next: next as string | null, previous: previous as string | null, results: source.results };
}

export function parseApiData<T>(value: unknown, isValue: (candidate: unknown) => candidate is T): T | null {
  return isValue(value) ? value : null;
}
