export type WorkSchedule = { id: number; quotation: number; property: string; customer: string; start_date: string; end_date: string; status: string };
export function parseSchedules(value: unknown): WorkSchedule[] {
  if (!Array.isArray(value)) throw new Error('Work schedules unavailable');
  return value.map(row => {
    if (!row || typeof row !== 'object' || typeof row.id !== 'number' || typeof row.quotation !== 'number' || typeof row.status !== 'string' || typeof row.start_date !== 'string' || typeof row.end_date !== 'string') throw new Error('Invalid schedule');
    return { id: row.id, quotation: row.quotation, property: String(row.property || ''), customer: String(row.customer || ''), start_date: row.start_date, end_date: row.end_date, status: row.status };
  });
}
export function indiaDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function activeProjects(rows: WorkSchedule[]): number {
  return new Set(rows.filter(row => ['CONFIRMED', 'IN_PROGRESS'].includes(row.status)).map(row => row.quotation)).size;
}
export function publicImage(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? value : null; } catch { return null; }
}
