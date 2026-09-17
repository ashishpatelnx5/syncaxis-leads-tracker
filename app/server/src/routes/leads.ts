import { Router, Request, Response } from 'express';
import ExcelJS from 'exceljs';
import { getPool, sql } from '../db';
import { requirePermission, actorName, LEADS_PERM } from '../auth';
import { logAudit, auditActor, diffFields } from '../audit';
import { mapLeadRow, mapFollowupRow, mapAttachmentRow, mapStageHistoryRow, CUSTOMER_JOIN_COLUMNS } from '../mappers';
import {
  CARD_COLLECTED_OPTIONS,
  FOLLOW_UP_STATUS_OPTIONS,
  PRIORITY_OPTIONS,
  LEAD_TYPE_OPTIONS,
  TERMINAL_STATUSES_SQL,
  PIPELINE_STAGES,
  STAGE_ENTRY_STATUS,
  STAGE_GATING_FIELDS,
  stageForStatus,
  stageFieldLabel,
} from '../types';

const router = Router();

const LEAD_SELECT_BASE = `
  SELECT L.*, ${CUSTOMER_JOIN_COLUMNS},
    (SELECT COUNT(*) FROM dbo.Followups F WHERE F.LeadId = L.Id) AS FollowUpCount,
    (SELECT MAX(F.FollowUpDate) FROM dbo.Followups F WHERE F.LeadId = L.Id) AS LastFollowUpDate
  FROM dbo.Leads L
  JOIN dbo.Customers C ON C.Id = L.CustomerId
`;

const SORTABLE_COLUMNS: Record<string, string> = {
  InquiryNumber: 'L.InquiryNumber',
  CompanyName: 'C.CompanyName',
  NextFollowUpDate: 'L.NextFollowUpDate',
  UpdatedAt: 'L.UpdatedAt',
  CreatedAt: 'L.CreatedAt',
  Priority: 'L.Priority',
  FollowUpStatus: 'L.FollowUpStatus',
  LeadValue: 'L.LeadValue',
  ProductInterest: 'L.ProductInterest',
  ApplicationCategory: 'L.ApplicationCategory',
  LeadGeneratedBy: 'L.LeadGeneratedBy',
  InquiryAssignedTo: 'L.InquiryAssignedTo',
};

function isValidEnum(value: unknown, options: readonly string[]): boolean {
  return typeof value === 'string' && options.includes(value);
}

// Columns diffed for the audit log on update - excludes Id/CreatedAt/UpdatedAt
// (always-changing timestamps aren't a meaningful "change") and InquiryNumber/
// LeadGeneratedBy (system-assigned/immutable, never in the SET clause) and
// UpdatedBy (redundant with the audit row's own actor field).
const LEAD_AUDIT_FIELDS = [
  'CustomerId', 'ApplicationCategory', 'ApplicationDetail', 'ProductInterest', 'CardCollected',
  'FollowUpStatus', 'Priority', 'InquirySource', 'LeadType', 'MovedToSourcePro', 'LeadValue',
  'InquiryAssignedTo', 'NextFollowUpDate', 'ErpLeadNumber', 'OrderNo', 'OrderDate', 'ReceivedDate', 'Notes',
];

// Builds the WHERE conditions for the leads list/export, binding parameters on
// the given request. Shared so the export endpoint always matches whatever
// the list endpoint would return for the same query params.
function applyLeadFilters(request: any, query: Record<string, string>): string[] {
  const { q, status, priority, leadType, assignedTo, leadGeneratedBy, customerId, cardCollected, inquirySource, productInterest, overdue, followUpDueDays, hasValue, hasErpRef, agingBucket } = query;
  const conditions: string[] = ['L.IsDeleted = 0'];

  if (q) {
    conditions.push(
      '(C.CompanyName LIKE @q OR C.ContactPersonName LIKE @q OR C.Email LIKE @q OR C.Phone LIKE @q OR L.InquiryNumber LIKE @q OR C.CustomerCode LIKE @q)'
    );
    request.input('q', sql.NVarChar, `%${q}%`);
  }
  if (status === 'OpenPipeline') {
    conditions.push(`L.FollowUpStatus NOT IN ${TERMINAL_STATUSES_SQL}`);
  } else if (status && isValidEnum(status, FOLLOW_UP_STATUS_OPTIONS)) {
    conditions.push('L.FollowUpStatus = @status');
    request.input('status', sql.NVarChar, status);
  }
  if (priority && isValidEnum(priority, PRIORITY_OPTIONS)) {
    conditions.push('L.Priority = @priority');
    request.input('priority', sql.NVarChar, priority);
  }
  if (leadType && isValidEnum(leadType, LEAD_TYPE_OPTIONS)) {
    conditions.push('L.LeadType = @leadType');
    request.input('leadType', sql.NVarChar, leadType);
  }
  if (assignedTo) {
    conditions.push('L.InquiryAssignedTo = @assignedTo');
    request.input('assignedTo', sql.NVarChar, assignedTo);
  }
  if (leadGeneratedBy) {
    conditions.push('L.LeadGeneratedBy = @leadGeneratedBy');
    request.input('leadGeneratedBy', sql.NVarChar, leadGeneratedBy);
  }
  if (customerId) {
    conditions.push('L.CustomerId = @customerId');
    request.input('customerId', sql.Int, Number(customerId));
  }
  if (cardCollected && isValidEnum(cardCollected, CARD_COLLECTED_OPTIONS)) {
    conditions.push('L.CardCollected = @cardCollected');
    request.input('cardCollected', sql.NVarChar, cardCollected);
  }
  if (inquirySource) {
    conditions.push('L.InquirySource = @inquirySource');
    request.input('inquirySource', sql.NVarChar, inquirySource);
  }
  if (productInterest) {
    conditions.push('L.ProductInterest = @productInterest');
    request.input('productInterest', sql.NVarChar, productInterest);
  }
  if (overdue === 'true') {
    conditions.push(`L.NextFollowUpDate IS NOT NULL AND L.NextFollowUpDate < CAST(SYSUTCDATETIME() AS DATE) AND L.FollowUpStatus NOT IN ${TERMINAL_STATUSES_SQL}`);
  }
  if (followUpDueDays) {
    conditions.push(
      'L.NextFollowUpDate IS NOT NULL AND L.NextFollowUpDate BETWEEN CAST(SYSUTCDATETIME() AS DATE) AND DATEADD(DAY, @followUpDueDays, CAST(SYSUTCDATETIME() AS DATE))'
    );
    request.input('followUpDueDays', sql.Int, Math.max(0, parseInt(followUpDueDays, 10) || 0));
  }
  if (hasValue === 'true') {
    conditions.push('L.LeadValue IS NOT NULL AND L.LeadValue > 0');
  } else if (hasValue === 'false') {
    conditions.push('(L.LeadValue IS NULL OR L.LeadValue = 0)');
  }
  // The actual quotation lives in the SourcePro ERP system - this app only
  // mirrors it via ErpLeadNumber, so "quotation sent" is judged by that
  // reference being on file, not by the manually-set FollowUpStatus.
  if (hasErpRef === 'true') {
    conditions.push(`L.ErpLeadNumber IS NOT NULL AND LTRIM(RTRIM(L.ErpLeadNumber)) <> ''`);
  } else if (hasErpRef === 'false') {
    conditions.push(`(L.ErpLeadNumber IS NULL OR LTRIM(RTRIM(L.ErpLeadNumber)) = '')`);
  }
  // Aging buckets mirror the dashboard's "days since received" breakdown, and
  // only apply to currently-open leads (matching how that chart is computed).
  const AGE_EXPR = 'DATEDIFF(DAY, COALESCE(L.ReceivedDate, CAST(L.CreatedAt AS DATE)), CAST(SYSUTCDATETIME() AS DATE))';
  const AGING_BUCKET_RANGES: Record<string, [number, number | null]> = {
    '0-7 days': [0, 7],
    '8-30 days': [8, 30],
    '31-60 days': [31, 60],
    '61-90 days': [61, 90],
    '90+ days': [91, null],
  };
  if (agingBucket && AGING_BUCKET_RANGES[agingBucket]) {
    const [min, max] = AGING_BUCKET_RANGES[agingBucket];
    conditions.push(`L.FollowUpStatus NOT IN ${TERMINAL_STATUSES_SQL}`);
    conditions.push(max === null ? `${AGE_EXPR} >= ${min}` : `${AGE_EXPR} BETWEEN ${min} AND ${max}`);
  }

  return conditions;
}

// GET /api/leads - list with search/filter/sort/pagination
router.get('/', requirePermission(LEADS_PERM.LEADS_VIEW), async (req: Request, res: Response) => {
  try {
    const query = req.query as Record<string, string>;
    const { page = '1', pageSize = '25', sortBy = 'UpdatedAt', sortDir = 'desc' } = query;

    const sortColumn = SORTABLE_COLUMNS[sortBy] || 'L.UpdatedAt';
    const direction = sortDir.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const size = Math.min(200, Math.max(1, parseInt(pageSize, 10) || 25));
    const offset = (pageNum - 1) * size;

    const pool = await getPool();

    const countRequest = pool.request();
    const conditions = applyLeadFilters(countRequest, query);
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const dataRequest = pool.request();
    applyLeadFilters(dataRequest, query);
    dataRequest.input('offset', sql.Int, offset);
    dataRequest.input('size', sql.Int, size);

    const [countResult, result] = await Promise.all([
      countRequest.query(`SELECT COUNT(*) AS Total FROM dbo.Leads L JOIN dbo.Customers C ON C.Id = L.CustomerId ${whereClause}`),
      dataRequest.query(`
        ${LEAD_SELECT_BASE}
        ${whereClause}
        ORDER BY ${sortColumn} ${direction}
        OFFSET @offset ROWS FETCH NEXT @size ROWS ONLY
      `),
    ]);

    res.json({
      items: result.recordset.map(mapLeadRow),
      total: countResult.recordset[0].Total as number,
      page: pageNum,
      pageSize: size,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

// GET /api/leads/export - all leads matching the current filters (no pagination)
// as an .xlsx download: frozen header row, frozen Inquiry/Company columns, and
// Excel's AutoFilter on the header so the sheet is immediately filterable.
router.get('/export', requirePermission(LEADS_PERM.LEADS_EXPORT), async (req: Request, res: Response) => {
  try {
    const query = req.query as Record<string, string>;
    const { sortBy = 'UpdatedAt', sortDir = 'desc' } = query;
    const sortColumn = SORTABLE_COLUMNS[sortBy] || 'L.UpdatedAt';
    const direction = sortDir.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const pool = await getPool();
    const request = pool.request();
    const conditions = applyLeadFilters(request, query);
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await request.query(`
      ${LEAD_SELECT_BASE}
      ${whereClause}
      ORDER BY ${sortColumn} ${direction}
    `);
    const leads = result.recordset.map(mapLeadRow);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Leads');

    sheet.columns = [
      { header: 'Inquiry Number', key: 'inquiryNumber', width: 18 },
      { header: 'Company Name', key: 'companyName', width: 28 },
      { header: 'Contact Person', key: 'contactPersonName', width: 20 },
      { header: 'Email', key: 'email', width: 26 },
      { header: 'Phone', key: 'phone', width: 15 },
      { header: 'Customer Code', key: 'customerCode', width: 14 },
      { header: 'GSTIN', key: 'gstin', width: 18 },
      { header: 'Department', key: 'department', width: 16 },
      { header: 'Address', key: 'address', width: 32 },
      { header: 'Country', key: 'country', width: 12 },
      { header: 'State', key: 'state', width: 14 },
      { header: 'City', key: 'city', width: 14 },
      { header: 'PIN', key: 'pincode', width: 10 },
      { header: 'Application Category', key: 'applicationCategory', width: 22 },
      { header: 'Application Detail', key: 'applicationDetail', width: 30 },
      { header: 'Product Interest', key: 'productInterest', width: 18 },
      { header: 'Card Collected', key: 'cardCollected', width: 14 },
      { header: 'Follow-Up Status', key: 'followUpStatus', width: 16 },
      { header: 'Priority', key: 'priority', width: 10 },
      { header: 'Inquiry Source', key: 'inquirySource', width: 18 },
      { header: 'Lead Type', key: 'leadType', width: 12 },
      { header: 'Moved to SourcePro', key: 'movedToSourcePro', width: 16 },
      { header: 'Lead Value', key: 'leadValue', width: 14 },
      { header: 'Lead Generated By', key: 'leadGeneratedBy', width: 20 },
      { header: 'Inquiry Assigned To', key: 'inquiryAssignedTo', width: 20 },
      { header: 'Next Follow-up Date', key: 'nextFollowUpDate', width: 16 },
      { header: 'ERP Lead Number', key: 'erpLeadNumber', width: 16 },
      { header: 'Order No', key: 'orderNo', width: 14 },
      { header: 'Order Date', key: 'orderDate', width: 14 },
      { header: 'Received Date', key: 'receivedDate', width: 14 },
      { header: 'No. of Follow-ups', key: 'followUpCount', width: 14 },
      { header: 'Last Follow-up Date', key: 'lastFollowUpDate', width: 16 },
      { header: 'Notes', key: 'notes', width: 40 },
      { header: 'Created At', key: 'createdAt', width: 18 },
      { header: 'Updated At', key: 'updatedAt', width: 18 },
    ];

    for (const lead of leads) {
      sheet.addRow({
        inquiryNumber: lead.inquiryNumber,
        companyName: lead.customer.companyName,
        contactPersonName: lead.customer.contactPersonName,
        email: lead.customer.email,
        phone: lead.customer.phone,
        customerCode: lead.customer.customerCode,
        gstin: lead.customer.gstin,
        department: lead.customer.department,
        address: lead.customer.address,
        country: lead.customer.country,
        state: lead.customer.state,
        city: lead.customer.city,
        pincode: lead.customer.pincode,
        applicationCategory: lead.applicationCategory,
        applicationDetail: lead.applicationDetail,
        productInterest: lead.productInterest,
        cardCollected: lead.cardCollected,
        followUpStatus: lead.followUpStatus,
        priority: lead.priority,
        inquirySource: lead.inquirySource,
        leadType: lead.leadType,
        movedToSourcePro: lead.movedToSourcePro ? 'Yes' : 'No',
        leadValue: lead.leadValue,
        leadGeneratedBy: lead.leadGeneratedBy,
        inquiryAssignedTo: lead.inquiryAssignedTo,
        nextFollowUpDate: lead.nextFollowUpDate,
        erpLeadNumber: lead.erpLeadNumber,
        orderNo: lead.orderNo,
        orderDate: lead.orderDate,
        receivedDate: lead.receivedDate,
        followUpCount: lead.followUpCount ?? 0,
        lastFollowUpDate: lead.lastFollowUpDate,
        notes: lead.notes,
        createdAt: lead.createdAt,
        updatedAt: lead.updatedAt,
      });
    }

    const THIN_GRAY_BORDER: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'FFD0D7E1' } },
      left: { style: 'thin', color: { argb: 'FFD0D7E1' } },
      bottom: { style: 'thin', color: { argb: 'FFD0D7E1' } },
      right: { style: 'thin', color: { argb: 'FFD0D7E1' } },
    };
    const BAND_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF2FB' } };

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: 'middle' };
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFADD8E6' } }; // light blue
      cell.border = THIN_GRAY_BORDER;
    });

    // Zebra-stripe the data rows and give every cell a light grid border, so
    // the sheet reads cleanly even before anyone touches the AutoFilter.
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      const isBanded = rowNumber % 2 === 0;
      row.eachCell({ includeEmpty: true }, (cell) => {
        if (isBanded) cell.fill = BAND_FILL;
        cell.border = THIN_GRAY_BORDER;
      });
    }

    // Freeze the header row and the first two columns (Inquiry Number,
    // Company Name) so they stay visible scrolling down or across.
    sheet.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }];

    // Excel's column filter dropdowns on the header row.
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: sheet.columns.length },
    };

    const filename = `Syncaxis_Leads_Export_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to export leads' });
  }
});

// GET /api/leads/pipeline?q= - every matching lead with its pipeline stage
// and full stage-entry history, for the Leads page's card/lifecycle view.
// No pagination (capped at 1000) - this view is meant to show the whole
// pipeline at a glance, not a page of it.
router.get('/pipeline', requirePermission(LEADS_PERM.LEADS_VIEW), async (req: Request, res: Response) => {
  try {
    const query = req.query as Record<string, string>;
    const pool = await getPool();

    const listRequest = pool.request();
    const conditions = applyLeadFilters(listRequest, query);
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // Deliberately skips LEAD_SELECT_BASE's FollowUpCount/LastFollowUpDate
    // correlated subqueries - the card view doesn't use them, and computing
    // them for every row (rather than a paginated slice) is expensive.
    //
    // No ORDER BY on the wide row set here on purpose: sorting rows that
    // include the NVARCHAR(MAX) Notes column made SQL Server request a huge
    // memory grant for the sort and stall for ~25s waiting on it (observed
    // as a RESOURCE_SEMAPHORE wait), even for a few hundred rows. Ordering
    // only the narrow Id list (inside the IN-subquery) is cheap; the client
    // sorts the small final result set itself instead of the DB re-sorting
    // the wide rows.
    const leadsResult = await listRequest.query(`
      SELECT L.*, ${CUSTOMER_JOIN_COLUMNS}
      FROM dbo.Leads L
      JOIN dbo.Customers C ON C.Id = L.CustomerId
      WHERE L.Id IN (
        SELECT TOP 1000 L.Id FROM dbo.Leads L JOIN dbo.Customers C ON C.Id = L.CustomerId
        ${whereClause}
        ORDER BY L.UpdatedAt DESC
      )
    `);
    const leads = leadsResult.recordset.map(mapLeadRow).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (!leads.length) return res.json([]);

    const historyRequest = pool.request();
    const idParams = leads.map((lead, i) => {
      historyRequest.input(`id${i}`, sql.Int, lead.id);
      return `@id${i}`;
    });
    const historyResult = await historyRequest.query(`
      SELECT LeadId, Stage, EnteredAt FROM dbo.LeadStageHistory WHERE LeadId IN (${idParams.join(',')}) ORDER BY EnteredAt ASC
    `);

    const historyByLead = new Map<number, ReturnType<typeof mapStageHistoryRow>[]>();
    for (const row of historyResult.recordset) {
      const list = historyByLead.get(row.LeadId) || [];
      list.push(mapStageHistoryRow(row));
      historyByLead.set(row.LeadId, list);
    }

    res.json(
      leads.map((lead) => ({
        ...lead,
        stage: stageForStatus(lead.followUpStatus),
        stageHistory: historyByLead.get(lead.id) || [],
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch pipeline' });
  }
});

// GET /api/leads/:id - single lead with follow-ups
router.get('/:id', requirePermission(LEADS_PERM.LEADS_VIEW), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid lead id' });

    const pool = await getPool();
    const leadResult = await pool
      .request()
      .input('id', sql.Int, id)
      .query(`${LEAD_SELECT_BASE} WHERE L.Id = @id AND L.IsDeleted = 0`);

    if (!leadResult.recordset.length) return res.status(404).json({ error: 'Lead not found' });

    const followupsResult = await pool
      .request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM dbo.Followups WHERE LeadId = @id ORDER BY FollowUpDate DESC, Id DESC');

    const attachmentsResult = await pool
      .request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM dbo.LeadAttachments WHERE LeadId = @id AND IsDeleted = 0 ORDER BY CreatedAt DESC');

    res.json({
      lead: mapLeadRow(leadResult.recordset[0]),
      followups: followupsResult.recordset.map(mapFollowupRow),
      attachments: attachmentsResult.recordset.map(mapAttachmentRow),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch lead' });
  }
});

// POST /api/leads/:id/advance-stage - moves a lead to the next pipeline stage
// (Inquiry -> Discovery -> Quotation -> Sales Order), one step at a time, only
// if the required fields for its *current* stage are filled in. Logs the
// transition to LeadStageHistory so the card view can show per-stage aging.
router.post('/:id/advance-stage', requirePermission(LEADS_PERM.LEADS_UPDATE), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid lead id' });

  try {
    const pool = await getPool();
    const leadResult = await pool.request().input('id', sql.Int, id).query(`${LEAD_SELECT_BASE} WHERE L.Id = @id AND L.IsDeleted = 0`);
    if (!leadResult.recordset.length) return res.status(404).json({ error: 'Lead not found' });

    const lead = mapLeadRow(leadResult.recordset[0]);
    const currentStage = stageForStatus(lead.followUpStatus);
    const currentIndex = (PIPELINE_STAGES as readonly string[]).indexOf(currentStage);
    if (currentIndex === -1) {
      return res.status(400).json({ error: 'This lead is closed and cannot be advanced.' });
    }
    if (currentIndex === PIPELINE_STAGES.length - 1) {
      return res.status(400).json({ error: 'This lead is already at the last stage.' });
    }

    const requiredFields = STAGE_GATING_FIELDS[currentStage as (typeof PIPELINE_STAGES)[number]];
    const missing = requiredFields.filter((field) => {
      const value = (lead as any)[field];
      return value === null || value === undefined || value === '';
    });
    if (missing.length) {
      return res.status(400).json({
        error: `Can't advance yet - fill in first: ${missing.map(stageFieldLabel).join(', ')}`,
        missingFields: missing,
      });
    }

    const nextStage = PIPELINE_STAGES[currentIndex + 1];
    const nextStatus = STAGE_ENTRY_STATUS[nextStage];

    await pool
      .request()
      .input('id', sql.Int, id)
      .input('followUpStatus', sql.NVarChar, nextStatus)
      .input('updatedBy', sql.NVarChar, actorName(req.session!))
      .query('UPDATE dbo.Leads SET FollowUpStatus = @followUpStatus, UpdatedBy = @updatedBy, UpdatedAt = SYSUTCDATETIME() WHERE Id = @id');
    await pool
      .request()
      .input('leadId', sql.Int, id)
      .input('stage', sql.NVarChar, nextStage)
      .query('INSERT INTO dbo.LeadStageHistory (LeadId, Stage) VALUES (@leadId, @stage)');

    const updated = await pool.request().input('id', sql.Int, id).query(`${LEAD_SELECT_BASE} WHERE L.Id = @id`);
    const historyResult = await pool
      .request()
      .input('id', sql.Int, id)
      .query('SELECT Stage, EnteredAt FROM dbo.LeadStageHistory WHERE LeadId = @id ORDER BY EnteredAt ASC');

    logAudit({
      ...auditActor(req),
      action: 'lead.advance_stage',
      entityType: 'Lead',
      entityId: id,
      details: { fromStage: currentStage, toStage: nextStage, fromStatus: lead.followUpStatus, toStatus: nextStatus },
    });

    res.json({
      ...mapLeadRow(updated.recordset[0]),
      stage: nextStage,
      stageHistory: historyResult.recordset.map(mapStageHistoryRow),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to advance lead stage' });
  }
});

// Leads always reference an existing customer - creating/editing customer
// records happens only through the Customer Master pages, never through a
// lead. isUpdate=true skips the customerId requirement: leaving it unset on
// an update just means "keep the lead's current customer".
function validateLeadBody(body: any, isUpdate: boolean): string | null {
  if (!isUpdate && !body.customerId) {
    return 'customerId is required - select an existing customer, or create one first from the Customers page';
  }
  if (body.cardCollected && !isValidEnum(body.cardCollected, CARD_COLLECTED_OPTIONS)) return 'Invalid cardCollected';
  if (body.followUpStatus && !isValidEnum(body.followUpStatus, FOLLOW_UP_STATUS_OPTIONS)) return 'Invalid followUpStatus';
  if (body.priority && !isValidEnum(body.priority, PRIORITY_OPTIONS)) return 'Invalid priority';
  if (body.leadType && !isValidEnum(body.leadType, LEAD_TYPE_OPTIONS)) return 'Invalid leadType';
  return null;
}

// InquiryNumber is a system-assigned identifier (SI/<fiscal year>/<sequence>) -
// never accepted from the client, only ever set here on creation, and never
// changed afterward (see bindLeadFieldInputs, which deliberately excludes it).
function currentFiscalYearCode(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1; // 1-12
  const startYear = month >= 4 ? year : year - 1;
  const endYear = startYear + 1;
  return `${String(startYear).slice(-2)}${String(endYear).slice(-2)}`;
}

async function generateNextInquiryNumber(pool: any): Promise<string> {
  const prefix = `SI/${currentFiscalYearCode()}/`; // e.g. "SI/2627/"
  const request = pool.request();
  request.input('prefixMatch', sql.NVarChar, `${prefix}%`);
  request.input('prefixLen', sql.Int, prefix.length);
  const result = await request.query(`
    SELECT MAX(CAST(SUBSTRING(InquiryNumber, @prefixLen + 1, 10) AS INT)) AS MaxNum
    FROM dbo.Leads
    WHERE InquiryNumber LIKE @prefixMatch AND ISNUMERIC(SUBSTRING(InquiryNumber, @prefixLen + 1, 10)) = 1
  `);
  const nextNum = (result.recordset[0].MaxNum || 0) + 1;
  return `${prefix}${nextNum}`;
}

// Whenever a lead's status crosses into a different pipeline stage (not just
// a status change within the same stage, e.g. Quotation Sent -> Awaiting
// Response), log it - so the card view's aging stays accurate even for
// status changes made through the regular edit form or a follow-up entry,
// not just the gated /advance-stage action.
export async function logStageChangeIfNeeded(pool: any, leadId: number, previousStatus: string, newStatus: string): Promise<void> {
  const previousStage = stageForStatus(previousStatus);
  const newStage = stageForStatus(newStatus);
  if (previousStage === newStage) return;
  await pool
    .request()
    .input('leadId', sql.Int, leadId)
    .input('stage', sql.NVarChar, newStage)
    .query('INSERT INTO dbo.LeadStageHistory (LeadId, Stage) VALUES (@leadId, @stage)');
}

// LeadGeneratedBy and UpdatedBy are attribution fields, not free-text input -
// they're bound separately in the POST/PUT handlers below (from the logged-in
// session), never from the request body.
function bindLeadFieldInputs(request: any, body: any) {
  request.input('applicationCategory', sql.NVarChar, body.applicationCategory ?? null);
  request.input('applicationDetail', sql.NVarChar, body.applicationDetail ?? null);
  request.input('productInterest', sql.NVarChar, body.productInterest ?? null);
  request.input('cardCollected', sql.NVarChar, body.cardCollected ?? 'Not Recorded');
  request.input('followUpStatus', sql.NVarChar, body.followUpStatus ?? 'Not Contacted');
  request.input('priority', sql.NVarChar, body.priority ?? 'Warm');
  request.input('inquirySource', sql.NVarChar, body.inquirySource ?? null);
  request.input('leadType', sql.NVarChar, body.leadType ?? 'Other');
  request.input('movedToSourcePro', sql.Bit, !!body.movedToSourcePro);
  request.input('leadValue', sql.Decimal(18, 2), body.leadValue ?? null);
  request.input('inquiryAssignedTo', sql.NVarChar, body.inquiryAssignedTo ?? null);
  request.input('nextFollowUpDate', sql.Date, body.nextFollowUpDate || null);
  request.input('erpLeadNumber', sql.NVarChar, body.erpLeadNumber ?? null);
  request.input('orderNo', sql.NVarChar, body.orderNo ?? null);
  request.input('orderDate', sql.Date, body.orderDate || null);
  request.input('receivedDate', sql.Date, body.receivedDate || null);
  request.input('notes', sql.NVarChar(sql.MAX), body.notes ?? null);
}

// POST /api/leads - create against an existing customer
router.post('/', requirePermission(LEADS_PERM.LEADS_CREATE), async (req: Request, res: Response) => {
  const validationError = validateLeadBody(req.body, false);
  if (validationError) return res.status(400).json({ error: validationError });

  try {
    const pool = await getPool();

    const customerExists = await pool.request().input('id', sql.Int, req.body.customerId).query('SELECT Id FROM dbo.Customers WHERE Id = @id AND IsDeleted = 0');
    if (!customerExists.recordset.length) return res.status(400).json({ error: 'Customer not found' });

    const inquiryNumber = await generateNextInquiryNumber(pool);

    const leadRequest = pool.request();
    leadRequest.input('customerId', sql.Int, req.body.customerId);
    leadRequest.input('inquiryNumber', sql.NVarChar, inquiryNumber);
    leadRequest.input('leadGeneratedBy', sql.NVarChar, actorName(req.session!));
    bindLeadFieldInputs(leadRequest, req.body);
    const result = await leadRequest.query(`
      INSERT INTO dbo.Leads (
        CustomerId, InquiryNumber, ApplicationCategory, ApplicationDetail, ProductInterest, CardCollected,
        FollowUpStatus, Priority, InquirySource, LeadType, MovedToSourcePro, LeadValue,
        LeadGeneratedBy, InquiryAssignedTo, NextFollowUpDate, ErpLeadNumber, OrderNo, OrderDate, ReceivedDate, Notes
      )
      OUTPUT INSERTED.Id
      VALUES (
        @customerId, @inquiryNumber, @applicationCategory, @applicationDetail, @productInterest, @cardCollected,
        @followUpStatus, @priority, @inquirySource, @leadType, @movedToSourcePro, @leadValue,
        @leadGeneratedBy, @inquiryAssignedTo, @nextFollowUpDate, @erpLeadNumber, @orderNo, @orderDate, @receivedDate, @notes
      )
    `);
    const newId = result.recordset[0].Id;

    const initialStage = stageForStatus(req.body.followUpStatus || 'Not Contacted');
    await pool
      .request()
      .input('leadId', sql.Int, newId)
      .input('stage', sql.NVarChar, initialStage)
      .query('INSERT INTO dbo.LeadStageHistory (LeadId, Stage) VALUES (@leadId, @stage)');

    const leadResult = await pool.request().input('id', sql.Int, newId).query(`${LEAD_SELECT_BASE} WHERE L.Id = @id`);
    const created = mapLeadRow(leadResult.recordset[0]);

    logAudit({ ...auditActor(req), action: 'lead.create', entityType: 'Lead', entityId: newId, details: { created } });

    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create lead' });
  }
});

// PUT /api/leads/:id - update (customerId, if provided, must be an existing customer)
router.put('/:id', requirePermission(LEADS_PERM.LEADS_UPDATE), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid lead id' });

  const validationError = validateLeadBody(req.body, true);
  if (validationError) return res.status(400).json({ error: validationError });

  try {
    const pool = await getPool();

    const existing = await pool.request().input('id', sql.Int, id).query('SELECT * FROM dbo.Leads WHERE Id = @id AND IsDeleted = 0');
    if (!existing.recordset.length) return res.status(404).json({ error: 'Lead not found' });

    const customerId = req.body.customerId || existing.recordset[0].CustomerId;
    if (req.body.customerId) {
      const customerExists = await pool.request().input('id', sql.Int, customerId).query('SELECT Id FROM dbo.Customers WHERE Id = @id AND IsDeleted = 0');
      if (!customerExists.recordset.length) return res.status(400).json({ error: 'Customer not found' });
    }

    const leadRequest = pool.request();
    leadRequest.input('id', sql.Int, id);
    leadRequest.input('customerId', sql.Int, customerId);
    leadRequest.input('updatedBy', sql.NVarChar, actorName(req.session!));
    bindLeadFieldInputs(leadRequest, req.body);
    await leadRequest.query(`
      UPDATE dbo.Leads SET
        CustomerId = @customerId,
        ApplicationCategory = @applicationCategory,
        ApplicationDetail = @applicationDetail,
        ProductInterest = @productInterest,
        CardCollected = @cardCollected,
        FollowUpStatus = @followUpStatus,
        Priority = @priority,
        InquirySource = @inquirySource,
        LeadType = @leadType,
        MovedToSourcePro = @movedToSourcePro,
        LeadValue = @leadValue,
        InquiryAssignedTo = @inquiryAssignedTo,
        NextFollowUpDate = @nextFollowUpDate,
        ErpLeadNumber = @erpLeadNumber,
        OrderNo = @orderNo,
        OrderDate = @orderDate,
        ReceivedDate = @receivedDate,
        Notes = @notes,
        UpdatedBy = @updatedBy,
        UpdatedAt = SYSUTCDATETIME()
      WHERE Id = @id
    `);

    await logStageChangeIfNeeded(pool, id, existing.recordset[0].FollowUpStatus, req.body.followUpStatus ?? 'Not Contacted');

    const afterRaw = await pool.request().input('id', sql.Int, id).query('SELECT * FROM dbo.Leads WHERE Id = @id');
    const changes = diffFields(existing.recordset[0], afterRaw.recordset[0], LEAD_AUDIT_FIELDS);
    if (Object.keys(changes).length) {
      logAudit({ ...auditActor(req), action: 'lead.update', entityType: 'Lead', entityId: id, details: { changes } });
    }

    const leadResult = await pool.request().input('id', sql.Int, id).query(`${LEAD_SELECT_BASE} WHERE L.Id = @id`);
    res.json(mapLeadRow(leadResult.recordset[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update lead' });
  }
});

// DELETE /api/leads/:id - soft delete
router.delete('/:id', requirePermission(LEADS_PERM.LEADS_DELETE), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid lead id' });

  try {
    const pool = await getPool();
    const summary = await pool.request().input('id', sql.Int, id).query('SELECT InquiryNumber, CustomerId FROM dbo.Leads WHERE Id = @id AND IsDeleted = 0');

    const result = await pool
      .request()
      .input('id', sql.Int, id)
      .query('UPDATE dbo.Leads SET IsDeleted = 1, UpdatedAt = SYSUTCDATETIME() WHERE Id = @id AND IsDeleted = 0');

    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Lead not found' });

    logAudit({
      ...auditActor(req),
      action: 'lead.delete',
      entityType: 'Lead',
      entityId: id,
      details: { inquiryNumber: summary.recordset[0]?.InquiryNumber ?? null, customerId: summary.recordset[0]?.CustomerId ?? null },
    });

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete lead' });
  }
});

export default router;
