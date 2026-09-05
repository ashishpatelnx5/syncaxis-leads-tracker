import type { Lead, Followup, LeadListResponse, CustomerListResponse, MetaResponse, Customer, CustomerInput } from './types';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // ignore parse errors
    }
    throw new ApiError(message, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export function login(username: string, password: string): Promise<{ ok: true }> {
  return request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
}

export function logout(): Promise<{ ok: true }> {
  return request('/auth/logout', { method: 'POST' });
}

export function fetchSession(): Promise<{ authenticated: true }> {
  return request('/auth/me');
}

export interface Stats {
  totalLeads: number;
  totalCustomers: number;
  statesReached: number;
  openPipelineCount: number;
  wonCount: number;
  lostCount: number;
  notContactedCount: number;
  hotCount: number;
  cardsCollectedCount: number;
  followUpsDueSoon: number;
  overdueCount: number;
  conversionRate: number;
  totalLeadValue: number;
  openPipelineValue: number;
  wonValue: number;
  avgDealSize: number;
}

export function fetchStats(): Promise<Stats> {
  return request('/stats');
}

export interface DashboardStats {
  byStatus: { status: string; count: number }[];
  byPriority: { priority: string; count: number }[];
  bySource: { source: string; count: number }[];
  byAssignee: { assignee: string; count: number }[];
  byProduct: { product: string; total: number; won: number; lost: number }[];
  monthlyTrend: { month: string; received: number; ordered: number }[];
}

export function fetchDashboardStats(): Promise<DashboardStats> {
  return request('/stats/dashboard');
}

export interface LeadFilters {
  q?: string;
  status?: string;
  priority?: string;
  leadType?: string;
  assignedTo?: string;
  customerId?: number;
  cardCollected?: string;
  inquirySource?: string;
  productInterest?: string;
  overdue?: boolean;
  followUpDueDays?: number;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export interface LeadInput {
  customerId?: number | null;
  customer: CustomerInput;
  enquiryNumber?: string | null;
  applicationCategory?: string | null;
  applicationDetail?: string | null;
  productInterest?: string | null;
  cardCollected?: string;
  followUpStatus?: string;
  priority?: string;
  inquirySource?: string | null;
  leadType?: string;
  movedToSourcePro?: boolean;
  leadValue?: number | null;
  leadGeneratedBy?: string | null;
  enquiryAssignedTo?: string | null;
  nextFollowUpDate?: string | null;
  erpLeadNumber?: string | null;
  orderNo?: string | null;
  orderDate?: string | null;
  receivedDate?: string | null;
  notes?: string | null;
}

export function fetchLeads(filters: LeadFilters): Promise<LeadListResponse> {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  return request(`/leads?${params.toString()}`);
}

export function fetchLead(id: number): Promise<{ lead: Lead; followups: Followup[] }> {
  return request(`/leads/${id}`);
}

export function createLead(data: LeadInput): Promise<Lead> {
  return request('/leads', { method: 'POST', body: JSON.stringify(data) });
}

export function updateLead(id: number, data: LeadInput): Promise<Lead> {
  return request(`/leads/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteLead(id: number): Promise<void> {
  return request(`/leads/${id}`, { method: 'DELETE' });
}

export function addFollowup(
  leadId: number,
  data: { followUpDate: string; followUpBy?: string; note?: string; newStatus?: string; nextFollowUpDate?: string }
): Promise<Followup> {
  return request(`/leads/${leadId}/followups`, { method: 'POST', body: JSON.stringify(data) });
}

export function deleteFollowup(id: number): Promise<void> {
  return request(`/followups/${id}`, { method: 'DELETE' });
}

export function fetchMeta(): Promise<MetaResponse> {
  return request('/meta');
}

export function searchCustomers(q: string, pageSize = 10): Promise<CustomerListResponse> {
  const params = new URLSearchParams({ q, pageSize: String(pageSize) });
  return request(`/customers?${params.toString()}`);
}

export function fetchCustomers(page = 1, pageSize = 25, q = ''): Promise<CustomerListResponse> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (q) params.set('q', q);
  return request(`/customers?${params.toString()}`);
}

export function fetchCustomer(id: number): Promise<{ customer: Customer; leads: Lead[] }> {
  return request(`/customers/${id}`);
}

export function createCustomer(data: CustomerInput): Promise<Customer> {
  return request('/customers', { method: 'POST', body: JSON.stringify(data) });
}

export function updateCustomer(id: number, data: CustomerInput): Promise<Customer> {
  return request(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}
