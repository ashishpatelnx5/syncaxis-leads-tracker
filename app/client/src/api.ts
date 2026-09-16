import type { Lead, Followup, Attachment, LeadListResponse, CustomerListResponse, MetaResponse, Customer, CustomerInput, PipelineLead } from './types';

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

export interface SessionUser {
  username: string;
  displayName: string;
  isAdmin: boolean;
  perms: string[];
  isFullAccess: boolean;
}

export function login(username: string, password: string): Promise<SessionUser> {
  return request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
}

// True SSO: exchanges a short-lived code (minted by the Portal when the user
// clicks the Leads Tracker tile there) for a session, without a password.
export function ssoLogin(code: string): Promise<SessionUser> {
  return request('/auth/sso', { method: 'POST', body: JSON.stringify({ code }) });
}

export function logout(): Promise<{ ok: true }> {
  return request('/auth/logout', { method: 'POST' });
}

export function fetchSession(): Promise<SessionUser> {
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
  leadsWithValueCount: number;
  leadsWithoutValueCount: number;
  quotationSentCount: number;
  awaitingResponseCount: number;
  notYetQuotedCount: number;
}

export function fetchStats(): Promise<Stats> {
  return request('/stats');
}

export interface DashboardStats {
  byStatus: { status: string; count: number }[];
  byPriority: { priority: string; count: number }[];
  bySource: { source: string; count: number }[];
  byAssignee: { assignee: string; count: number }[];
  byGenerator: { generator: string; count: number }[];
  byProduct: { product: string; total: number; won: number; lost: number }[];
  leadsByCustomer: { customerId: number; companyName: string; total: number; won: number; lost: number }[];
  leadAging: { bucket: string; count: number }[];
}

export function fetchDashboardStats(): Promise<DashboardStats> {
  return request('/stats/dashboard');
}

export type TrendPeriod = 'weekly' | 'monthly' | 'quarterly';

export interface TrendPoint {
  periodKey: string;
  periodLabel: string;
  received: number;
  ordered: number;
}

export function fetchTrend(period: TrendPeriod): Promise<TrendPoint[]> {
  return request(`/stats/trend?period=${period}`);
}

export type TeamTrendMetric = 'enquiries' | 'followups' | 'orders';

export interface TeamTrendPeriod {
  periodKey: string;
  periodLabel: string;
  counts: Record<string, number>;
}

export interface TeamTrend {
  people: string[];
  periods: TeamTrendPeriod[];
}

export function fetchTeamTrend(metric: TeamTrendMetric, period: TrendPeriod): Promise<TeamTrend> {
  return request(`/stats/team-trend?metric=${metric}&period=${period}`);
}

export interface LeadFilters {
  q?: string;
  status?: string;
  priority?: string;
  leadType?: string;
  assignedTo?: string;
  leadGeneratedBy?: string;
  customerId?: number;
  cardCollected?: string;
  inquirySource?: string;
  productInterest?: string;
  overdue?: boolean;
  followUpDueDays?: number;
  hasValue?: boolean;
  hasErpRef?: boolean;
  agingBucket?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

// Leads always reference an existing customer - customerId is required.
// Customer records are created/edited only via the Customer Master pages.
export interface LeadInput {
  customerId: number;
  inquiryNumber?: string | null;
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
  inquiryAssignedTo?: string | null;
  nextFollowUpDate?: string | null;
  erpLeadNumber?: string | null;
  orderNo?: string | null;
  orderDate?: string | null;
  receivedDate?: string | null;
  notes?: string | null;
}

function toLeadFilterParams(filters: LeadFilters): URLSearchParams {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  return params;
}

export function fetchLeads(filters: LeadFilters): Promise<LeadListResponse> {
  return request(`/leads?${toLeadFilterParams(filters).toString()}`);
}

// Downloads an .xlsx of every lead matching `filters` (no pagination) by
// triggering a browser save, rather than returning parsed JSON like the rest
// of this module - the response body here is a binary file, not data to render.
export async function exportLeads(filters: LeadFilters): Promise<void> {
  const res = await fetch(`/api/leads/export?${toLeadFilterParams(filters).toString()}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    let message = `Export failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // ignore parse errors
    }
    throw new ApiError(message, res.status);
  }

  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match ? match[1] : 'Syncaxis_Leads_Export.xlsx';

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function fetchLead(id: number): Promise<{ lead: Lead; followups: Followup[]; attachments: Attachment[] }> {
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

// The Leads page's card/lifecycle view: every matching lead with its
// pipeline stage and full stage-entry history (for per-stage aging).
export function fetchPipeline(q?: string): Promise<PipelineLead[]> {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  return request(`/leads/pipeline?${params.toString()}`);
}

// Moves a lead to the next pipeline stage - rejected (400, with a message)
// if the required fields for its current stage aren't filled in yet.
export function advanceLeadStage(id: number): Promise<PipelineLead> {
  return request(`/leads/${id}/advance-stage`, { method: 'POST' });
}

export function addFollowup(
  leadId: number,
  data: { followUpDate: string; note?: string; newStatus?: string; nextFollowUpDate?: string }
): Promise<Followup> {
  return request(`/leads/${leadId}/followups`, { method: 'POST', body: JSON.stringify(data) });
}

export function deleteFollowup(id: number): Promise<void> {
  return request(`/followups/${id}`, { method: 'DELETE' });
}

// Uploads use FormData (not JSON), so this bypasses the `request` helper's
// Content-Type: application/json header - the browser sets the multipart
// boundary itself.
export async function uploadAttachments(leadId: number, files: File[]): Promise<Attachment[]> {
  const form = new FormData();
  files.forEach((file) => form.append('files', file));

  const res = await fetch(`/api/leads/${leadId}/attachments`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  if (!res.ok) {
    let message = `Upload failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // ignore parse errors
    }
    throw new ApiError(message, res.status);
  }
  return res.json();
}

export function deleteAttachment(id: number): Promise<void> {
  return request(`/attachments/${id}`, { method: 'DELETE' });
}

export function attachmentFileUrl(id: number): string {
  return `/api/attachments/${id}/file`;
}

export function fetchMeta(): Promise<MetaResponse> {
  return request('/meta');
}

export function searchCustomers(q: string, pageSize = 10): Promise<CustomerListResponse> {
  const params = new URLSearchParams({ q, pageSize: String(pageSize) });
  return request(`/customers?${params.toString()}`);
}

export function fetchCustomers(
  page = 1,
  pageSize = 25,
  q = '',
  sortBy?: string,
  sortDir?: 'asc' | 'desc'
): Promise<CustomerListResponse> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (q) params.set('q', q);
  if (sortBy) params.set('sortBy', sortBy);
  if (sortDir) params.set('sortDir', sortDir);
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

export function deleteCustomer(id: number): Promise<void> {
  return request(`/customers/${id}`, { method: 'DELETE' });
}
