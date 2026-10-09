import type { User } from './navigation';
import type { Tokens } from './api';
export type Session = Tokens & { user: User };
export type Dashboard = {
  contractor_name: string;
  profile_completion: { percent: number; missing: string[] };
  counts: { customers: number; properties: number; quotations: number; quotation_value: number | string; active_leads: number; invoices: number; due_tasks: number; unread_messages: number; site_visits: number; new_requests: number };
  recent_customers: { id: number; name: string; mobile: string; city: string; status: string }[];
  recent_quotations: { id: number; number: string; customer: string; property: string; status: string; amount: string | number }[];
  tasks: { id: number; customer: number; customer_name: string; comment: string; next_follow_up: string; overdue: boolean }[];
  site_visits: { id: number | string; customer_name: string; property_name: string; scheduled_date: string; scheduled_time: string | null; status: string }[];
  pipeline: { status: string; label: string; count: number }[];
};
