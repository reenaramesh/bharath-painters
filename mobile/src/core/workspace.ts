import type { Dashboard } from './contracts.ts';
import { parseSchedules, publicImage, type WorkSchedule } from './dashboardPresentation.ts';

export type BusinessProfile = { company_name: string; owner_name: string; office_address: string; service_areas: string };
export type Workspace = { dashboard: Dashboard; profile: BusinessProfile | null; profileError: string | null; schedules: WorkSchedule[] | null; scheduleError: string | null; avatar: string | null };
type Reader = { get<T>(path: string): Promise<T> };

export function parseDashboard(value: unknown): Dashboard {
  if (!value || typeof value !== 'object') throw new Error('Your workspace could not be loaded. Please retry.');
  const d = value as Dashboard;
  const counts = ['customers', 'properties', 'quotations', 'active_leads', 'invoices', 'due_tasks', 'unread_messages', 'site_visits', 'new_requests'] as const;
  if (typeof d.contractor_name !== 'string' || !d.counts || counts.some(key => !Number.isFinite(d.counts[key]) || d.counts[key] < 0)
    || !['string', 'number'].includes(typeof d.counts.quotation_value) || !Number.isFinite(Number(d.counts.quotation_value))
    || !d.profile_completion || !Number.isFinite(d.profile_completion.percent)
    || [d.tasks, d.site_visits, d.pipeline, d.recent_customers, d.recent_quotations].some(rows => !Array.isArray(rows))) {
    throw new Error('Your workspace could not be loaded. Please retry.');
  }
  return d;
}

/** Only keep business summary fields; do not cache profile bank/document fields. */
function parseProfile(value: unknown): BusinessProfile {
  if (!value || typeof value !== 'object') throw new Error('Invalid business profile');
  const source = value as Record<string, unknown>;
  return Object.fromEntries(['company_name', 'owner_name', 'office_address', 'service_areas'].map(key => [key, typeof source[key] === 'string' ? source[key] : ''])) as BusinessProfile;
}

export class WorkspaceRepository {
  private cached: { owner: number; value: Workspace; at: number } | null = null;
  private pending: { owner: number; promise: Promise<Workspace> } | null = null;
  private version = 0;
  private readonly api: Reader;
  private readonly now: () => number;
  constructor(api: Reader, now: () => number = Date.now) { this.api = api; this.now = now; }
  clear() { this.version++; this.cached = null; this.pending = null; }
  load(owner: number, force = false): Promise<Workspace> {
    if (this.pending?.owner === owner) return this.pending.promise;
    if (!force && this.cached?.owner === owner && this.now() - this.cached.at < 60_000) return Promise.resolve(this.cached.value);
    const version = this.version;
    const promise = this.fetch().then(value => {
      if (version !== this.version) throw new Error('Your session has changed.');
      this.cached = { owner, value, at: this.now() }; return value;
    }).finally(() => { if (this.pending?.promise === promise) this.pending = null; });
    this.pending = { owner, promise }; return promise;
  }
  private async fetch(): Promise<Workspace> {
    const [dashboard, profile, schedules, identity] = await Promise.allSettled([
      this.api.get<unknown>('/quotations/contractor-crm/dashboard/'),
      this.api.get<unknown>('/accounts/contractor-profile/'),
      this.api.get<unknown>('/jobs/work-schedules/'),
      this.api.get<{ digital_card?: { owner_photo?: string } }>('/accounts/profile-card/'),
    ]);
    if (dashboard.status === 'rejected') throw dashboard.reason;
    let business: BusinessProfile | null = null;
    if (profile.status === 'fulfilled') { try { business = parseProfile(profile.value); } catch {} }
    let work: WorkSchedule[] | null = null;
    if (schedules.status === 'fulfilled') { try { work = parseSchedules(schedules.value); } catch {} }
    return { dashboard: parseDashboard(dashboard.value), profile: business, profileError: business ? null : 'Business profile unavailable. Pull down to retry.', schedules: work, scheduleError: work ? null : 'Work schedules unavailable. Pull down to retry.', avatar: identity.status === 'fulfilled' ? publicImage(identity.value?.digital_card?.owner_photo) : null };
  }
}
