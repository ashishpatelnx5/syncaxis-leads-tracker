export const CARD_COLLECTED_OPTIONS = ['Yes', 'No', 'Photo Only', 'Not Recorded'] as const;
export const FOLLOW_UP_STATUS_OPTIONS = [
  'Not Contacted',
  'Contacted',
  'Meeting Scheduled',
  'Quotation Sent',
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
  country: string | null;
  state: string | null;
  city: string | null;
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
  country?: string | null;
  state?: string | null;
  city?: string | null;
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
