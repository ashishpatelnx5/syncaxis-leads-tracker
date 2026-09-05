export type CardCollected = 'Yes' | 'No' | 'Photo Only' | 'Not Recorded';
export type FollowUpStatus =
  | 'Not Contacted'
  | 'Contacted'
  | 'Meeting Scheduled'
  | 'Quotation Sent'
  | 'Won'
  | 'Lost'
  | 'Not Relevant';
export type Priority = 'Hot' | 'Warm' | 'Cold';
export type LeadType = 'Project' | 'Trading' | 'Other';

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

export type CustomerInput = Omit<Customer, 'id' | 'createdAt' | 'updatedAt' | 'leadCount'>;

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

export interface LeadListResponse {
  items: Lead[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CustomerListResponse {
  items: Customer[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MetaResponse {
  cardCollected: CardCollected[];
  followUpStatus: FollowUpStatus[];
  priority: Priority[];
  leadType: LeadType[];
  applicationCategories: string[];
  inquirySources: string[];
  assignees: string[];
  generators: string[];
}
