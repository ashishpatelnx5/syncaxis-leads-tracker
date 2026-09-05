import { Lead, Followup, Customer } from './types';

// Shared by any query that joins Customers alongside another table - keeps the
// Cust_* aliasing in one place for mapCustomerRow/mapLeadRow to rely on.
export const CUSTOMER_JOIN_COLUMNS = `
    C.Id AS Cust_Id, C.CustomerCode AS Cust_CustomerCode, C.CompanyName AS Cust_CompanyName,
    C.Department AS Cust_Department, C.ContactPersonName AS Cust_ContactPersonName,
    C.Email AS Cust_Email, C.Phone AS Cust_Phone, C.Country AS Cust_Country,
    C.State AS Cust_State, C.City AS Cust_City, C.CreatedAt AS Cust_CreatedAt, C.UpdatedAt AS Cust_UpdatedAt
`;

function toIsoDate(v: unknown): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v as string);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function toIsoDateTime(v: unknown): string {
  const d = v instanceof Date ? v : new Date(v as string);
  return d.toISOString();
}

export function mapCustomerRow(row: any): Customer {
  return {
    id: row.Id,
    customerCode: row.CustomerCode,
    companyName: row.CompanyName,
    department: row.Department,
    contactPersonName: row.ContactPersonName,
    email: row.Email,
    phone: row.Phone,
    country: row.Country,
    state: row.State,
    city: row.City,
    createdAt: toIsoDateTime(row.CreatedAt),
    updatedAt: toIsoDateTime(row.UpdatedAt),
    leadCount: row.LeadCount !== undefined ? Number(row.LeadCount) : undefined,
  };
}

// Maps a row from a query that joins Leads (unprefixed columns) with
// Customers aliased as Cust_* (see LEAD_SELECT_BASE in routes/leads.ts).
export function mapLeadRow(row: any): Lead {
  return {
    id: row.Id,
    customerId: row.CustomerId,
    customer: {
      id: row.Cust_Id,
      customerCode: row.Cust_CustomerCode,
      companyName: row.Cust_CompanyName,
      department: row.Cust_Department,
      contactPersonName: row.Cust_ContactPersonName,
      email: row.Cust_Email,
      phone: row.Cust_Phone,
      country: row.Cust_Country,
      state: row.Cust_State,
      city: row.Cust_City,
      createdAt: toIsoDateTime(row.Cust_CreatedAt),
      updatedAt: toIsoDateTime(row.Cust_UpdatedAt),
    },
    enquiryNumber: row.EnquiryNumber,
    applicationCategory: row.ApplicationCategory,
    applicationDetail: row.ApplicationDetail,
    productInterest: row.ProductInterest,
    cardCollected: row.CardCollected,
    followUpStatus: row.FollowUpStatus,
    priority: row.Priority,
    inquirySource: row.InquirySource,
    leadType: row.LeadType,
    movedToSourcePro: !!row.MovedToSourcePro,
    leadValue: row.LeadValue !== null && row.LeadValue !== undefined ? Number(row.LeadValue) : null,
    leadGeneratedBy: row.LeadGeneratedBy,
    enquiryAssignedTo: row.EnquiryAssignedTo,
    nextFollowUpDate: toIsoDate(row.NextFollowUpDate),
    erpLeadNumber: row.ErpLeadNumber,
    orderNo: row.OrderNo,
    orderDate: toIsoDate(row.OrderDate),
    receivedDate: toIsoDate(row.ReceivedDate),
    notes: row.Notes,
    createdAt: toIsoDateTime(row.CreatedAt),
    updatedAt: toIsoDateTime(row.UpdatedAt),
    followUpCount: row.FollowUpCount !== undefined ? Number(row.FollowUpCount) : undefined,
    lastFollowUpDate: row.LastFollowUpDate !== undefined ? toIsoDate(row.LastFollowUpDate) : undefined,
  };
}

export function mapFollowupRow(row: any): Followup {
  return {
    id: row.Id,
    leadId: row.LeadId,
    followUpDate: toIsoDate(row.FollowUpDate) as string,
    followUpBy: row.FollowUpBy,
    note: row.Note,
    createdAt: toIsoDateTime(row.CreatedAt),
  };
}
