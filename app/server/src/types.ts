export const CARD_COLLECTED_OPTIONS = ['Yes', 'No', 'Photo Only', 'Not Recorded'] as const;
export const FOLLOW_UP_STATUS_OPTIONS = [
  'Not Contacted',
  'Contacted',
  'Meeting Scheduled',
  'Quotation Sent',
  'Awaiting Response',
  'Won',
  'Lost',
  'Not Relevant',
] as const;
export const PRIORITY_OPTIONS = ['Hot', 'Warm', 'Cold'] as const;
export const LEAD_TYPE_OPTIONS = ['Project', 'Trading', 'Other'] as const;

// Statuses that mean a lead is no longer active in the pipeline. Used wherever
// "open pipeline" / "overdue" needs to exclude closed leads, so the business
// rule for "closed" lives in exactly one place.
export const TERMINAL_STATUSES = ['Won', 'Lost', 'Not Relevant'] as const;
export const TERMINAL_STATUSES_SQL = `(${TERMINAL_STATUSES.map((s) => `'${s}'`).join(',')})`;

// The Leads pipeline/board view groups FollowUpStatus into four sequential
// stages (plus a terminal Closed bucket for Lost/Not Relevant) - this is the
// single source of truth for that grouping, the status a lead is set to when
// it advances into a stage, and what must be filled in before leaving one.
export const PIPELINE_STAGES = ['Enquiry', 'Discovery', 'Quotation', 'SalesOrder'] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number] | 'Closed';

export const STAGE_STATUSES: Record<PipelineStage, readonly FollowUpStatus[]> = {
  Enquiry: ['Not Contacted', 'Contacted'],
  Discovery: ['Meeting Scheduled'],
  Quotation: ['Quotation Sent', 'Awaiting Response'],
  SalesOrder: ['Won'],
  Closed: ['Lost', 'Not Relevant'],
};

export const STAGE_ENTRY_STATUS: Record<(typeof PIPELINE_STAGES)[number], FollowUpStatus> = {
  Enquiry: 'Contacted',
  Discovery: 'Meeting Scheduled',
  Quotation: 'Quotation Sent',
  SalesOrder: 'Won',
};

// Lead fields (as used in the API request/response body, camelCase) that must
// be filled in before a lead can leave this stage for the next one.
export const STAGE_GATING_FIELDS: Record<(typeof PIPELINE_STAGES)[number], string[]> = {
  Enquiry: ['productInterest', 'applicationDetail'],
  Discovery: ['leadValue'],
  Quotation: ['erpLeadNumber', 'orderNo'],
  SalesOrder: [],
};

const STAGE_FIELD_LABELS: Record<string, string> = {
  productInterest: 'Product Interest',
  applicationDetail: 'Application Detail',
  leadValue: 'Lead Value',
  erpLeadNumber: 'ERP Lead Number',
  orderNo: 'Order No',
};

export function stageFieldLabel(field: string): string {
  return STAGE_FIELD_LABELS[field] || field;
}

export function stageForStatus(status: string): PipelineStage {
  for (const stage of Object.keys(STAGE_STATUSES) as PipelineStage[]) {
    if ((STAGE_STATUSES[stage] as readonly string[]).includes(status)) return stage;
  }
  return 'Closed';
}

export interface LeadStageHistoryEntry {
  stage: PipelineStage;
  enteredAt: string;
}

export type CardCollected = (typeof CARD_COLLECTED_OPTIONS)[number];
export type FollowUpStatus = (typeof FOLLOW_UP_STATUS_OPTIONS)[number];
export type Priority = (typeof PRIORITY_OPTIONS)[number];
export type LeadType = (typeof LEAD_TYPE_OPTIONS)[number];

export interface Customer {
  id: number;
  customerCode: string | null;
  companyName: string;
  department: string | null;
  contactPersonName: string | null;
  email: string | null;
  phone: string | null;
  gstin: string | null;
  address: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  pincode: string | null;
  addedBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  leadCount?: number;
}

export interface CustomerInput {
  customerCode?: string | null;
  companyName: string;
  department?: string | null;
  contactPersonName?: string | null;
  email?: string | null;
  phone?: string | null;
  gstin?: string | null;
  address?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  pincode?: string | null;
}

export interface Lead {
  id: number;
  customerId: number;
  customer: Customer;
  enquiryNumber: string | null;
  applicationCategory: string | null;
  applicationDetail: string | null;
  productInterest: string | null;
  cardCollected: CardCollected;
  followUpStatus: FollowUpStatus;
  priority: Priority;
  inquirySource: string | null;
  leadType: LeadType;
  movedToSourcePro: boolean;
  leadValue: number | null;
  leadGeneratedBy: string | null;
  enquiryAssignedTo: string | null;
  updatedBy: string | null;
  nextFollowUpDate: string | null;
  erpLeadNumber: string | null;
  orderNo: string | null;
  orderDate: string | null;
  receivedDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  followUpCount?: number;
  lastFollowUpDate?: string | null;
}

export interface Followup {
  id: number;
  leadId: number;
  followUpDate: string;
  followUpBy: string | null;
  note: string | null;
  createdAt: string;
}

export interface LeadAttachment {
  id: number;
  leadId: number;
  fileName: string;
  contentType: string;
  fileSizeBytes: number;
  uploadedBy: string | null;
  createdAt: string;
}
