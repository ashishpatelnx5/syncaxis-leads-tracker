import { Router, Request, Response } from 'express';
import ExcelJS from 'exceljs';
import { getPool, sql } from '../db';
import { mapLeadRow, mapFollowupRow, CUSTOMER_JOIN_COLUMNS } from '../mappers';
import {
  CARD_COLLECTED_OPTIONS,
  FOLLOW_UP_STATUS_OPTIONS,
  PRIORITY_OPTIONS,
  LEAD_TYPE_OPTIONS,
  TERMINAL_STATUSES_SQL,
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
  EnquiryNumber: 'L.EnquiryNumber',
  CompanyName: 'C.CompanyName',
  NextFollowUpDate: 'L.NextFollowUpDate',
  UpdatedAt: 'L.UpdatedAt',
  CreatedAt: 'L.CreatedAt',
  Priority: 'L.Priority',
  FollowUpStatus: 'L.FollowUpStatus',
  LeadValue: 'L.LeadValue',
  ProductInterest: 'L.ProductInterest',
  ApplicationDetail: 'L.ApplicationDetail',
  LeadGeneratedBy: 'L.LeadGeneratedBy',
  EnquiryAssignedTo: 'L.EnquiryAssignedTo',
};

function isValidEnum(value: unknown, options: readonly string[]): boolean {
  return typeof value === 'string' && options.includes(value);
}

// Builds the WHERE conditions for the leads list/export, binding parameters on
// the given request. Shared so the export endpoint always matches whatever
// the list endpoint would return for the same query params.
function applyLeadFilters(request: any, query: Record<string, string>): string[] {
  const { q, status, priority, leadType, assignedTo, leadGeneratedBy, customerId, cardCollected, inquirySource, productInterest, overdue, followUpDueDays, hasValue, hasErpRef } = query;
  const conditions: string[] = ['L.IsDeleted = 0'];

  if (q) {
    conditions.push(
      '(C.CompanyName LIKE @q OR C.ContactPersonName LIKE @q OR C.Email LIKE @q OR C.Phone LIKE @q OR L.EnquiryNumber LIKE @q OR C.CustomerCode LIKE @q)'
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
    conditions.push('L.EnquiryAssignedTo = @assignedTo');
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

  return conditions;
}

// GET /api/leads - list with search/filter/sort/pagination
router.get('/', async (req: Request, res: Response) => {
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
// as an .xlsx download: frozen header row, frozen Enquiry/Company columns, and
// Excel's AutoFilter on the header so the sheet is immediately filterable.
router.get('/export', async (req: Request, res: Response) => {
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
      { header: 'Enquiry Number', key: 'enquiryNumber', width: 18 },
      { header: 'Company Name', key: 'companyName', width: 28 },
      { header: 'Contact Person', key: 'contactPersonName', width: 20 },
      { header: 'Email', key: 'email', width: 26 },
      { header: 'Phone', key: 'phone', width: 15 },
      { header: 'Customer Code', key: 'customerCode', width: 14 },
      { header: 'GSTIN', key: 'gstin', width: 18 },
      { header: 'Department', key: 'department', width: 16 },
      { header: 'Country', key: 'country', width: 12 },
      { header: 'State', key: 'state', width: 14 },
      { header: 'City', key: 'city', width: 14 },
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
      { header: 'Enquiry Assigned To', key: 'enquiryAssignedTo', width: 20 },
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
        enquiryNumber: lead.enquiryNumber,
        companyName: lead.customer.companyName,
        contactPersonName: lead.customer.contactPersonName,
        email: lead.customer.email,
        phone: lead.customer.phone,
        customerCode: lead.customer.customerCode,
        gstin: lead.customer.gstin,
        department: lead.customer.department,
        country: lead.customer.country,
        state: lead.customer.state,
        city: lead.customer.city,
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
        enquiryAssignedTo: lead.enquiryAssignedTo,
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

    // Freeze the header row and the first two columns (Enquiry Number,
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

// GET /api/leads/:id - single lead with follow-ups
router.get('/:id', async (req: Request, res: Response) => {
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

    res.json({
      lead: mapLeadRow(leadResult.recordset[0]),
      followups: followupsResult.recordset.map(mapFollowupRow),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch lead' });
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

// EnquiryNumber is a system-assigned identifier (SI/<fiscal year>/<sequence>) -
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

async function generateNextEnquiryNumber(pool: any): Promise<string> {
  const prefix = `SI/${currentFiscalYearCode()}/`; // e.g. "SI/2627/"
  const request = pool.request();
  request.input('prefixMatch', sql.NVarChar, `${prefix}%`);
  request.input('prefixLen', sql.Int, prefix.length);
  const result = await request.query(`
    SELECT MAX(CAST(SUBSTRING(EnquiryNumber, @prefixLen + 1, 10) AS INT)) AS MaxNum
    FROM dbo.Leads
    WHERE EnquiryNumber LIKE @prefixMatch AND ISNUMERIC(SUBSTRING(EnquiryNumber, @prefixLen + 1, 10)) = 1
  `);
  const nextNum = (result.recordset[0].MaxNum || 0) + 1;
  return `${prefix}${nextNum}`;
}

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
  request.input('leadGeneratedBy', sql.NVarChar, body.leadGeneratedBy ?? null);
  request.input('enquiryAssignedTo', sql.NVarChar, body.enquiryAssignedTo ?? null);
  request.input('nextFollowUpDate', sql.Date, body.nextFollowUpDate || null);
  request.input('erpLeadNumber', sql.NVarChar, body.erpLeadNumber ?? null);
  request.input('orderNo', sql.NVarChar, body.orderNo ?? null);
  request.input('orderDate', sql.Date, body.orderDate || null);
  request.input('receivedDate', sql.Date, body.receivedDate || null);
  request.input('notes', sql.NVarChar(sql.MAX), body.notes ?? null);
}

// POST /api/leads - create against an existing customer
router.post('/', async (req: Request, res: Response) => {
  const validationError = validateLeadBody(req.body, false);
  if (validationError) return res.status(400).json({ error: validationError });

  try {
    const pool = await getPool();

    const customerExists = await pool.request().input('id', sql.Int, req.body.customerId).query('SELECT Id FROM dbo.Customers WHERE Id = @id AND IsDeleted = 0');
    if (!customerExists.recordset.length) return res.status(400).json({ error: 'Customer not found' });

    const enquiryNumber = await generateNextEnquiryNumber(pool);

    const leadRequest = pool.request();
    leadRequest.input('customerId', sql.Int, req.body.customerId);
    leadRequest.input('enquiryNumber', sql.NVarChar, enquiryNumber);
    bindLeadFieldInputs(leadRequest, req.body);
    const result = await leadRequest.query(`
      INSERT INTO dbo.Leads (
        CustomerId, EnquiryNumber, ApplicationCategory, ApplicationDetail, ProductInterest, CardCollected,
        FollowUpStatus, Priority, InquirySource, LeadType, MovedToSourcePro, LeadValue,
        LeadGeneratedBy, EnquiryAssignedTo, NextFollowUpDate, ErpLeadNumber, OrderNo, OrderDate, ReceivedDate, Notes
      )
      OUTPUT INSERTED.Id
      VALUES (
        @customerId, @enquiryNumber, @applicationCategory, @applicationDetail, @productInterest, @cardCollected,
        @followUpStatus, @priority, @inquirySource, @leadType, @movedToSourcePro, @leadValue,
        @leadGeneratedBy, @enquiryAssignedTo, @nextFollowUpDate, @erpLeadNumber, @orderNo, @orderDate, @receivedDate, @notes
      )
    `);
    const newId = result.recordset[0].Id;

    const leadResult = await pool.request().input('id', sql.Int, newId).query(`${LEAD_SELECT_BASE} WHERE L.Id = @id`);
    res.status(201).json(mapLeadRow(leadResult.recordset[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create lead' });
  }
});

// PUT /api/leads/:id - update (customerId, if provided, must be an existing customer)
router.put('/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid lead id' });

  const validationError = validateLeadBody(req.body, true);
  if (validationError) return res.status(400).json({ error: validationError });

  try {
    const pool = await getPool();

    const existing = await pool.request().input('id', sql.Int, id).query('SELECT Id, CustomerId FROM dbo.Leads WHERE Id = @id AND IsDeleted = 0');
    if (!existing.recordset.length) return res.status(404).json({ error: 'Lead not found' });

    const customerId = req.body.customerId || existing.recordset[0].CustomerId;
    if (req.body.customerId) {
      const customerExists = await pool.request().input('id', sql.Int, customerId).query('SELECT Id FROM dbo.Customers WHERE Id = @id AND IsDeleted = 0');
      if (!customerExists.recordset.length) return res.status(400).json({ error: 'Customer not found' });
    }

    const leadRequest = pool.request();
    leadRequest.input('id', sql.Int, id);
    leadRequest.input('customerId', sql.Int, customerId);
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
        LeadGeneratedBy = @leadGeneratedBy,
        EnquiryAssignedTo = @enquiryAssignedTo,
        NextFollowUpDate = @nextFollowUpDate,
        ErpLeadNumber = @erpLeadNumber,
        OrderNo = @orderNo,
        OrderDate = @orderDate,
        ReceivedDate = @receivedDate,
        Notes = @notes,
        UpdatedAt = SYSUTCDATETIME()
      WHERE Id = @id
    `);

    const leadResult = await pool.request().input('id', sql.Int, id).query(`${LEAD_SELECT_BASE} WHERE L.Id = @id`);
    res.json(mapLeadRow(leadResult.recordset[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update lead' });
  }
});

// DELETE /api/leads/:id - soft delete
router.delete('/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid lead id' });

  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.Int, id)
      .query('UPDATE dbo.Leads SET IsDeleted = 1, UpdatedAt = SYSUTCDATETIME() WHERE Id = @id AND IsDeleted = 0');

    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Lead not found' });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete lead' });
  }
});

export default router;
