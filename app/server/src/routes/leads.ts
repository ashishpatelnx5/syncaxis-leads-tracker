import { Router, Request, Response } from 'express';
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

function isValidEnum(value: unknown, options: readonly string[]): boolean {
  return typeof value === 'string' && options.includes(value);
}

// GET /api/leads - list with search/filter/sort/pagination
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      q,
      status,
      priority,
      leadType,
      assignedTo,
      customerId,
      cardCollected,
      inquirySource,
      productInterest,
      overdue,
      followUpDueDays,
      page = '1',
      pageSize = '25',
      sortBy = 'UpdatedAt',
      sortDir = 'desc',
    } = req.query as Record<string, string>;

    const allowedSort: Record<string, string> = {
      CompanyName: 'C.CompanyName',
      NextFollowUpDate: 'L.NextFollowUpDate',
      UpdatedAt: 'L.UpdatedAt',
      CreatedAt: 'L.CreatedAt',
      Priority: 'L.Priority',
      FollowUpStatus: 'L.FollowUpStatus',
      LeadValue: 'L.LeadValue',
    };
    const sortColumn = allowedSort[sortBy] || 'L.UpdatedAt';
    const direction = sortDir.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const size = Math.min(200, Math.max(1, parseInt(pageSize, 10) || 25));
    const offset = (pageNum - 1) * size;

    const pool = await getPool();
    const conditions: string[] = ['L.IsDeleted = 0'];

    function applyFilters(request: any) {
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
    }

    const countRequest = pool.request();
    applyFilters(countRequest);
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const dataRequest = pool.request();
    applyFilters(dataRequest);
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

// isUpdate=true skips the "must supply a new customer" check: on update, no
// customerId just means "keep the lead's current customer", unlike create
// where a missing customerId means a brand-new customer must be described.
function validateLeadBody(body: any, isUpdate: boolean): string | null {
  const customer = body.customer || {};
  if (!isUpdate && !body.customerId && (!customer.companyName || !String(customer.companyName).trim())) {
    return 'customer.companyName is required when creating a new customer';
  }
  if (body.cardCollected && !isValidEnum(body.cardCollected, CARD_COLLECTED_OPTIONS)) return 'Invalid cardCollected';
  if (body.followUpStatus && !isValidEnum(body.followUpStatus, FOLLOW_UP_STATUS_OPTIONS)) return 'Invalid followUpStatus';
  if (body.priority && !isValidEnum(body.priority, PRIORITY_OPTIONS)) return 'Invalid priority';
  if (body.leadType && !isValidEnum(body.leadType, LEAD_TYPE_OPTIONS)) return 'Invalid leadType';
  if (customer.email && String(customer.email).trim()) {
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(String(customer.email).trim())) return 'Invalid customer email address';
  }
  return null;
}

function bindLeadFieldInputs(request: any, body: any) {
  request.input('enquiryNumber', sql.NVarChar, body.enquiryNumber ?? null);
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

function bindCustomerFieldInputs(request: any, customer: any) {
  request.input('custCustomerCode', sql.NVarChar, customer.customerCode || null);
  request.input('custCompanyName', sql.NVarChar, customer.companyName);
  request.input('custDepartment', sql.NVarChar, customer.department || null);
  request.input('custContactPersonName', sql.NVarChar, customer.contactPersonName || null);
  request.input('custEmail', sql.NVarChar, customer.email || null);
  request.input('custPhone', sql.NVarChar, customer.phone || null);
  request.input('custCountry', sql.NVarChar, customer.country || null);
  request.input('custState', sql.NVarChar, customer.state || null);
  request.input('custCity', sql.NVarChar, customer.city || null);
}

// Resolves body.customerId / body.customer into a concrete customer id within
// the given transaction request, creating or updating the customer row as needed.
async function resolveCustomerId(transactionRequestFactory: () => any, body: any): Promise<number> {
  const customer = body.customer || {};

  if (body.customerId) {
    if (customer.companyName && String(customer.companyName).trim()) {
      const updateRequest = transactionRequestFactory();
      updateRequest.input('id', sql.Int, body.customerId);
      bindCustomerFieldInputs(updateRequest, customer);
      await updateRequest.query(`
        UPDATE dbo.Customers SET
          CustomerCode = @custCustomerCode, CompanyName = @custCompanyName, Department = @custDepartment,
          ContactPersonName = @custContactPersonName, Email = @custEmail, Phone = @custPhone,
          Country = @custCountry, State = @custState, City = @custCity, UpdatedAt = SYSUTCDATETIME()
        WHERE Id = @id
      `);
    }
    return body.customerId;
  }

  const insertRequest = transactionRequestFactory();
  bindCustomerFieldInputs(insertRequest, customer);
  const result = await insertRequest.query(`
    INSERT INTO dbo.Customers (CustomerCode, CompanyName, Department, ContactPersonName, Email, Phone, Country, State, City)
    OUTPUT INSERTED.Id
    VALUES (@custCustomerCode, @custCompanyName, @custDepartment, @custContactPersonName, @custEmail, @custPhone, @custCountry, @custState, @custCity)
  `);
  return result.recordset[0].Id;
}

// POST /api/leads - create (and, if no customerId given, the customer alongside it)
router.post('/', async (req: Request, res: Response) => {
  const validationError = validateLeadBody(req.body, false);
  if (validationError) return res.status(400).json({ error: validationError });

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const customerId = await resolveCustomerId(() => new sql.Request(transaction), req.body);

    const leadRequest = new sql.Request(transaction);
    leadRequest.input('customerId', sql.Int, customerId);
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
    await transaction.commit();

    const leadResult = await pool.request().input('id', sql.Int, newId).query(`${LEAD_SELECT_BASE} WHERE L.Id = @id`);
    res.status(201).json(mapLeadRow(leadResult.recordset[0]));
  } catch (err) {
    await transaction.rollback().catch(() => {});
    console.error(err);
    res.status(500).json({ error: 'Failed to create lead' });
  }
});

// PUT /api/leads/:id - update (and the linked customer's fields, if provided)
router.put('/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid lead id' });

  const validationError = validateLeadBody(req.body, true);
  if (validationError) return res.status(400).json({ error: validationError });

  const pool = await getPool();

  const existing = await pool.request().input('id', sql.Int, id).query('SELECT Id, CustomerId FROM dbo.Leads WHERE Id = @id AND IsDeleted = 0');
  if (!existing.recordset.length) return res.status(404).json({ error: 'Lead not found' });

  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const customerId = await resolveCustomerId(
      () => new sql.Request(transaction),
      { ...req.body, customerId: req.body.customerId || existing.recordset[0].CustomerId }
    );

    const leadRequest = new sql.Request(transaction);
    leadRequest.input('id', sql.Int, id);
    leadRequest.input('customerId', sql.Int, customerId);
    bindLeadFieldInputs(leadRequest, req.body);
    await leadRequest.query(`
      UPDATE dbo.Leads SET
        CustomerId = @customerId,
        EnquiryNumber = @enquiryNumber,
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
    await transaction.commit();

    const leadResult = await pool.request().input('id', sql.Int, id).query(`${LEAD_SELECT_BASE} WHERE L.Id = @id`);
    res.json(mapLeadRow(leadResult.recordset[0]));
  } catch (err) {
    await transaction.rollback().catch(() => {});
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
