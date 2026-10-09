export type Role = 'CONTRACTOR' | 'CUSTOMER' | 'PAINTER' | 'ADMIN' | 'SUPPORT';
export type User = { id: number; role: Role; first_name?: string; display_name?: string; mobile?: string; is_verified: boolean; verification_status: string; preferred_language?: string };
export type ModuleId = 'customers' | 'properties' | 'leads' | 'quotations' | 'measurements' | 'projects' | 'schedules' | 'payments' | 'messages' | 'settings';
export type RecordItem = { id: string; title: string; subtitle: string; status: string; amount?: string; note?: string };
export const modules: { id: ModuleId; label: string; icon: string; description: string; menu: string; verified?: boolean }[] = [
  { id: 'customers', label: 'Customers', icon: 'account-group-outline', description: 'People and connections', menu: 'customers' },
  { id: 'properties', label: 'Properties', icon: 'home-city-outline', description: 'Sites and shared access', menu: 'properties' },
  { id: 'leads', label: 'Leads', icon: 'bullseye-arrow', description: 'Your next opportunity', menu: 'leads' },
  { id: 'quotations', label: 'Quotations', icon: 'file-document-outline', description: 'Estimates and decisions', menu: 'quotations', verified: true },
  { id: 'measurements', label: 'Measurements', icon: 'ruler-square', description: 'Room and surface areas', menu: 'properties' },
  { id: 'projects', label: 'Projects', icon: 'briefcase-outline', description: 'Completed project portfolio', menu: 'projects', verified: true },
  { id: 'schedules', label: 'Schedules', icon: 'calendar-outline', description: 'Upcoming commitments', menu: 'schedules' },
  { id: 'payments', label: 'Payments', icon: 'wallet-outline', description: 'Invoices and receipts', menu: 'receipts', verified: true },
  { id: 'messages', label: 'Messages', icon: 'message-text-outline', description: 'Customer conversations', menu: 'messages' },
  { id: 'settings', label: 'Settings', icon: 'cog-outline', description: 'Business and appearance', menu: 'settings' },
];
export function roleDestination(role: string): '/(contractor)' | '/role' { return role === 'CONTRACTOR' ? '/(contractor)' : '/role'; }
export function canOpenModule(user: Pick<User, 'role' | 'is_verified' | 'verification_status'>, id: string, disabled: string[]): boolean {
  const entry = modules.find(item => item.id === id);
  return !!entry && user.role === 'CONTRACTOR' && !disabled.includes(entry.menu)
    && (!entry.verified || (user.is_verified && user.verification_status === 'VERIFIED'));
}
export function filterRecords<T extends RecordItem>(items: T[], query: string): T[] {
  const words = query.trim().toLocaleLowerCase('en-IN').split(/\s+/).filter(Boolean);
  return items.filter(item => words.every(word => `${item.title} ${item.subtitle} ${item.status}`.toLocaleLowerCase('en-IN').includes(word)));
}
export function formatINR(amount: string | number): string {
  const value = Number(amount);
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number.isFinite(value) ? value : 0);
}
