/** Shared frontend contracts. Keep network decimals as strings and derive fields from Django serializers. */
export type DecimalString = string;
export type Length = DecimalString;
export type Width = DecimalString;
export type Height = DecimalString;
export type Area = DecimalString;
export type EntityId = number;
export type Role = 'PAINTER' | 'CONTRACTOR' | 'CUSTOMER' | 'ADMIN' | 'SUPPORT';
export type VerificationStatus = 'PENDING' | 'UNDER_REVIEW' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED';
export type Permission = { key: string; allowed: boolean };
export type CustomerConnectionStatus = 'PENDING' | 'CONNECTED' | 'REJECTED' | 'RECONNECT_PENDING' | 'DISCONNECTED' | 'BLOCKED';
export type CustomerSharePurpose = 'ACTIVATION' | 'CONNECTION';
export interface SessionUser {
  id: EntityId;
  mobile: string;
  role: Role;
  verification_status?: VerificationStatus;
}

export interface CustomerRecord {
  id: EntityId;
  name: string;
  mobile: string;
  email?: string | null;
  status?: string;
  is_saved_contact?: boolean;
  connection_status?: string;
  connection_id?: EntityId | null;
}

/** Contractor-scoped CRM relationship; customer account/sharing remains a separate workflow. */
export interface ContractorCustomerConnectionRecord {
  id: EntityId;
  customer: EntityId;
  contractor: EntityId;
  status: CustomerConnectionStatus;
  requested_at: string;
  connected_at?: string | null;
  customer_status?: string;
  customer_source?: string;
  customer_client_type?: string;
  requirement?: string;
  internal_notes?: string;
  next_follow_up?: string | null;
}

export interface PropertyRecord {
  id: EntityId;
  customer: EntityId;
  name: string;
  address?: string;
  city?: string;
  pincode?: string;
  measurement_editing_available?: boolean;
}

export interface PropertyContactRecord {
  id: EntityId;
  name: string;
  mobile: string;
  email?: string;
  role?: string;
}

export type AttendanceStatus = 'PRESENT' | 'HALF_DAY' | 'ABSENT' | 'LEAVE';
export type AttendanceApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type PaymentMode = 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CARD' | 'CHEQUE' | 'OTHER';
export type MeasurementWorkArea = 'INTERIOR' | 'EXTERIOR';
export type MeasurementSurfaceType =
  | 'WALL' | 'CEILING' | 'FLOOR' | 'WOOD_WORK' | 'TILE' | 'WALLPAPER' | 'METAL' | 'GLASS'
  | 'DOOR' | 'WINDOW' | 'COLUMN' | 'BEAM' | 'GATE' | 'GRILL' | 'BALCONY_SOFFIT'
  | 'STAIR_SOFFIT' | 'PORCH_CEILING' | 'WATERPROOFING' | 'PARAPET' | 'OTHER';
export type PaintingSurfaceCategory = 'WALL' | 'CEILING' | 'TEXTURE_WALL';
export type MeasurementUnit = 'SQFT' | 'SQM' | 'METER' | 'FEET' | 'INCH' | 'NOS' | 'OTHER';
export interface MeasurementDimensions {
  length?: Length | null;
  width?: Width | null;
  height?: Height | null;
  gross_area?: Area;
  deduction_area?: Area;
  addition_area?: Area;
  net_area?: Area;
}
export type QuotationType = 'MEASUREMENT' | 'MANUAL_LUMPSUM';
export type QuotationStatus =
  | 'DRAFT' | 'SENT' | 'VIEWED' | 'ACCEPTED' | 'SCHEDULED' | 'IN_PROGRESS'
  | 'COMPLETED' | 'REJECTED' | 'EXPIRED' | 'CONVERTED' | 'CANCELLED' | 'REVISION_REQUESTED';
export type DiscountType = 'FIXED' | 'PERCENTAGE';
export type DiscountMode = 'OVERALL' | 'LINE' | 'BOTH';
export type GstMode = 'GST_EXTRA' | 'GST_INCLUDED' | 'NO_GST';

export interface MeasurementVersionRecord {
  id: EntityId;
  property: EntityId;
  contractor: EntityId | null;
  version: number;
  edit_revision?: number | null;
  status: 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'LOCKED';
  updated_at: string;
  submitted_at?: string | null;
  total_sqft?: DecimalString;
}

export interface MeasurementRoomRecord extends MeasurementDimensions {
  id: EntityId;
  property: EntityId;
  measurement_record?: EntityId | null;
  measurement_revision?: number | null;
  name: string;
  painting_area?: 'INTERIOR' | 'EXTERIOR' | 'OTHER' | '';
  length?: DecimalString | null;
  width?: DecimalString | null;
  height?: DecimalString | null;
}

export interface MeasurementOpeningRecord {
  id: EntityId;
  opening_type: string;
  width: DecimalString;
  height: DecimalString;
  effect: 'DEDUCT' | 'ADD';
  area: DecimalString;
  effective_deduction: DecimalString;
  measurement_revision?: number | null;
}

export interface MeasurementSurfaceRecord extends MeasurementDimensions {
  id: EntityId;
  property: EntityId;
  measurement_record?: EntityId | null;
  measurement_revision?: number | null;
  room?: EntityId | null;
  work_area: MeasurementWorkArea;
  surface_type: MeasurementSurfaceType;
  name: string;
  area_group_name?: string;
  length: Length;
  breadth: Width;
  manual_area: Area;
  quantity: number;
  paintable_sides: number;
  gross_area: DecimalString;
  deduction_area: DecimalString;
  addition_area: DecimalString;
  net_area: DecimalString;
  total: DecimalString;
  openings?: MeasurementOpeningRecord[];
  updated_at: string;
}

export interface MeasurementSurfaceCreateRequest {
  idempotency_key?: string;
  expected_revision?: number;
  work_area: MeasurementWorkArea;
  surface_type: string;
  name: string;
  area_group_name?: string;
  length: DecimalString;
  breadth: DecimalString;
  manual_area: DecimalString;
  quantity: number;
  paintable_sides: number;
  room: number | null;
}

export interface MeasurementSurfaceUpdateRequest extends Partial<MeasurementSurfaceCreateRequest> {
  expected_updated_at?: string;
}

export interface QuotationCalculationContract {
  subtotal: DecimalString;
  discount: DecimalString;
  gst_percentage: DecimalString;
  gst_amount: DecimalString;
  grand_total: DecimalString;
}

export interface QuotationLineRecord extends Omit<QuotationLineItemDraft, 'quantity' | 'calculation_method'> {
  id: EntityId;
  room?: EntityId | null;
  service_type?: EntityId | null;
  service_category?: EntityId | null;
  line_type?: string;
  description: string;
  coats?: number | null;
  included_areas?: string[];
  calculation_method?: 'AREA' | 'LUMPSUM' | 'MANUAL';
  quantity?: DecimalString | null;
  unit?: EntityId | null;
  rate: DecimalString;
  amount: DecimalString;
  discount_amount?: DecimalString;
  net_amount?: DecimalString;
}

export interface QuotationRecord extends QuotationCalculationContract {
  id: EntityId;
  quotation_number: string;
  customer: EntityId;
  property: EntityId | null;
  measurement_record: EntityId | null;
  quotation_type: QuotationType;
  status: QuotationStatus;
  discount_mode: DiscountMode;
  discount_type: DiscountType;
  discount_value: DecimalString;
  gst_mode: GstMode;
  items?: QuotationLineRecord[];
  updated_at: string;
}

export type MeasurementQuotationRecord = QuotationRecord & { quotation_type: 'MEASUREMENT' };
export type ManualLumpSumQuotationRecord = QuotationRecord & { quotation_type: 'MANUAL_LUMPSUM' };

export interface QuotationLineItemDraft {
  description: string;
  quantity: DecimalString;
  rate: DecimalString;
  calculation_method?: 'AREA' | 'LUMPSUM' | 'MANUAL';
  discount_type?: DiscountType;
  discount_value?: DecimalString;
}

export interface QuotationDraftCreateRequest {
  customer: number;
  property?: number | null;
  measurement_record?: number | null;
  quotation_type: QuotationType;
  discount_mode?: DiscountMode;
  discount_type?: DiscountType;
  discount_value?: DecimalString;
  gst_mode?: GstMode;
  gst_percentage?: DecimalString;
  notes?: string;
  terms_conditions?: string;
  items?: QuotationLineItemDraft[];
}

export type QuotationApiRecord = MeasurementQuotationRecord | ManualLumpSumQuotationRecord;

export interface PaymentRecordRequest {
  document_type: 'QUOTATION' | 'INVOICE';
  quotation?: number;
  invoice?: number;
  amount: DecimalString;
  payment_mode: PaymentMode;
  payment_reference?: string;
  received_date: string;
  idempotency_key: string;
}

export interface AttendanceRecord {
  id: EntityId;
  membership: EntityId;
  date: string;
  status: AttendanceStatus;
  approval_status: AttendanceApprovalStatus;
  marked_at: string;
  overtime_hours: DecimalString;
  reviewed_by?: EntityId | null;
  reviewed_at?: string | null;
  schedule?: EntityId | null;
}

export type SalaryBasis = 'MONTHLY' | 'WEEKLY' | 'DAILY';
export type EmploymentType = 'FLEXIBLE' | 'IN_HOUSE';
export type WorkScheduleStatus = 'PENDING' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type WorkSchedulePaymentStatus = 'NOT_REQUESTED' | 'AWAITING_PAYMENT' | 'PENDING_CONFIRMATION' | 'CONFIRMED';
export type WorkAssignmentStatus = 'ASSIGNED' | 'ACCEPTED' | 'DECLINED' | 'RELEASED' | 'IN_PROGRESS' | 'COMPLETED';
export type JobStatus = 'OPEN' | 'PARTIALLY_FILLED' | 'FILLED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type JobApplicationStatus = 'APPLIED' | 'ACCEPTED' | 'CANCELLATION_REQUESTED' | 'CANCELLED' | 'REJECTED' | 'WITHDRAWN' | 'COMPLETED';
export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED' | 'CLOSED';
export type WageLedgerEntryType = 'EARNING' | 'BONUS' | 'PAYMENT' | 'ADVANCE' | 'DEBIT_ADJUSTMENT' | 'CREDIT_ADJUSTMENT';
export type WageAmountStage = 'ESTIMATED' | 'ATTENDANCE_PENDING' | 'APPROVED' | 'POSTED' | 'PAID';

export interface JobRecord {
  id: EntityId; contractor: EntityId; title: string; service_type: string; location: string; city: string;
  job_type: 'DAILY' | 'WEEKLY'; number_of_painters: number; start_date: string; estimated_days: number;
  daily_wage?: DecimalString | null; weekly_wage?: DecimalString | null; status: JobStatus;
}

export interface WorkScheduleRecord {
  id: EntityId; quotation: EntityId; proposed_start_date: string; proposed_end_date: string;
  advance_amount?: DecimalString | null; payment_status: WorkSchedulePaymentStatus;
  status: WorkScheduleStatus; customer_accepted: boolean; contractor_accepted: boolean;
}

export interface PainterRecord { id: EntityId; name: string; mobile?: string; }
export interface TeamMembershipRecord {
  id: EntityId;
  contractor: EntityId;
  painter: EntityId;
  employment_type: EmploymentType;
  salary_basis: SalaryBasis;
  salary_amount: DecimalString | null;
  is_active: boolean;
}
export interface PainterSeekingPostRecord {
  id: EntityId; painter: EntityId; title: string; preferred_location: string; available_from: string;
  available_until?: string | null; wage_type: 'DAILY' | 'WEEKLY' | 'NEGOTIABLE';
  expected_wage?: DecimalString | null; status: 'ACTIVE' | 'CLOSED';
}
export interface JobApplicationRecord {
  id: EntityId; job: EntityId; painter: EntityId; status: JobApplicationStatus; applied_at: string;
}
export interface PainterBookingRecord {
  id: EntityId; contractor: EntityId; applicator: EntityId; status: BookingStatus;
  start_date: string; end_date: string; agreed_wage: DecimalString | null;
}
export interface WorkAssignmentRecord {
  id: EntityId; schedule: EntityId; painter: EntityId; status: WorkAssignmentStatus;
  wage_type: 'DAILY' | 'WEEKLY'; agreed_wage: DecimalString | null;
  source_application?: EntityId | null; source_booking?: EntityId | null;
}
export interface WageLedgerRecord {
  id: EntityId; membership: EntityId; date: string; entry_type: WageLedgerEntryType;
  amount: DecimalString; schedule?: EntityId | null;
  source_attendance?: EntityId | null; source_attendance_adjustment?: EntityId | null;
}

/** The backend uses one ledger for earnings, bonuses, advances, payments and adjustments. */
export type EmployeeEarningRecord = WageLedgerRecord & { entry_type: 'EARNING' };
export type EmployeeAdvanceRecord = WageLedgerRecord & { entry_type: 'ADVANCE' };

export type ProjectScopeStatus = 'PROPOSED' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type ProjectScopeHandling = 'INTERNAL' | 'OUTSOURCED';
export interface ProjectScopeRecordBase {
  id: EntityId; quotation: EntityId; title: string; status: ProjectScopeStatus;
  handling: ProjectScopeHandling; completed_quantity?: DecimalString;
}
/** The serializer may omit both links on a pre-activation/permission-filtered response. */
export type ProjectScopeRecord = ProjectScopeRecordBase & (
  | { source_quotation_item?: undefined; source_work_change_item?: undefined }
  | { source_quotation_item: EntityId; source_work_change_item: null }
  | { source_quotation_item: null; source_work_change_item: EntityId }
  | { source_quotation_item: null; source_work_change_item: null }
);
export type SubcontractWorkOrderStatus =
  | 'DRAFT' | 'SENT' | 'ACCEPTED' | 'DECLINED' | 'SCHEDULED' | 'IN_PROGRESS'
  | 'SUBMITTED_FOR_REVIEW' | 'CORRECTION_REQUESTED' | 'COMPLETED' | 'CANCELLED' | 'WITHDRAWN';
export interface SubcontractScopeRecord {
  id: EntityId; work_order: EntityId; project_scope: EntityId | null;
  source_quotation_item: EntityId | null; title_snapshot: string; quantity: DecimalString;
  unit_rate?: DecimalString;
}
export interface WorkOrderCompletionRecord {
  id: EntityId; work_order: EntityId; status: SubcontractWorkOrderStatus;
  approved_at?: string | null; completed_scopes?: Array<{ scope: EntityId; reported_quantity: DecimalString; accepted_quantity: DecimalString }>;
}

export type InvoiceStatus = 'ISSUED' | 'PART_PAID' | 'PAID' | 'CANCELLED';
export type ReceiptSource =
  | { kind: 'WORK_SCHEDULE'; id: EntityId }
  | { kind: 'PROJECT_RECEIPT'; id: EntityId }
  | { kind: 'UNALLOCATED' };
export interface CustomerAdvanceRecord { id: EntityId; amount: DecimalString; received_date: string; }
export interface ProjectReceiptRecord {
  id: EntityId; contractor: EntityId; quotation: EntityId; receipt_number: string; amount: DecimalString;
  payment_mode: PaymentMode; received_date: string; payment_reference?: string; notes?: string;
}
export interface InvoiceRecord {
  id: EntityId; invoice_number: string; customer: EntityId; status: InvoiceStatus;
  subtotal: DecimalString; discount: DecimalString; gst_amount: DecimalString;
  grand_total: DecimalString; amount_paid: DecimalString; balance_due?: DecimalString;
}
export interface InvoicePaymentRecord {
  id: EntityId; invoice: EntityId; amount: DecimalString; payment_mode: PaymentMode;
  received_date: string; source_schedule?: EntityId | null; source_receipt?: EntityId | null;
}

export interface ProjectFinanceSummary {
  project_value: DecimalString | null;
  project_total_paid: DecimalString | null;
  project_balance_due: DecimalString | null;
  permissions: { view_invoices: boolean; view_payments: boolean };
}

export type OfflineOperationStatus = 'PENDING' | 'SYNCED' | 'CONFLICT' | 'AUTH_REQUIRED';
export type OfflineRecordKind = 'measurement' | 'attendance';
export interface WebOfflineOperationContract {
  id: string;
  dedupeKey: string;
  actorId: EntityId;
  kind: OfflineRecordKind;
  endpoint: string;
  method: 'POST' | 'PATCH';
  payload?: Record<string, unknown> | null;
  reviewPath: string | null;
  expectedVersion: number | null;
  state: OfflineOperationStatus;
  attempts: number;
  createdAt: string;
  syncedAt?: string;
  lastError: string;
}

export interface MobileOfflineOperationContract {
  id: string;
  clientMutationId: string;
  actorId: EntityId;
  kind: OfflineRecordKind;
  endpoint: string;
  payload: unknown;
  expectedVersion: string | null;
  expectedRevision?: number | null;
  revisionDependsOn?: string | null;
  dependsOn: string | null;
  localReference: string | null;
  result: unknown;
  state: OfflineOperationStatus;
  attempts: number;
  retryAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastError: string;
}
