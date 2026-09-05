import { Router, Request, Response } from 'express';
import { getPool, sql } from '../db';
import { mapCustomerRow, mapLeadRow, CUSTOMER_JOIN_COLUMNS } from '../mappers';

const router = Router();

const CUSTOMER_SELECT_BASE = `
  SELECT C.*,
    (SELECT COUNT(*) FROM dbo.Leads L WHERE L.CustomerId = C.Id AND L.IsDeleted = 0) AS LeadCount
  FROM dbo.Customers C
`;

// GET /api/customers?q=&limit= - search for the lead-form picker and the customer list page
router.get('/', async (req: Request, res: Response) => {
  try {
    const { q, page = '1', pageSize = '25' } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const size = Math.min(50, Math.max(1, parseInt(pageSize, 10) || 25));
    const offset = (pageNum - 1) * size;

    const pool = await getPool();
    const conditions = ['C.IsDeleted = 0'];
    const request = pool.request();

    if (q) {
      conditions.push(
        '(C.CompanyName LIKE @q OR C.ContactPersonName LIKE @q OR C.Email LIKE @q OR C.Phone LIKE @q OR C.CustomerCode LIKE @q)'
      );
      request.input('q', sql.NVarChar, `%${q}%`);
    }
    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countResult = await request.query(`SELECT COUNT(*) AS Total FROM dbo.Customers C ${whereClause}`);
    const total = countResult.recordset[0].Total as number;

    const dataRequest = pool.request();
    if (q) dataRequest.input('q', sql.NVarChar, `%${q}%`);
    dataRequest.input('offset', sql.Int, offset);
    dataRequest.input('size', sql.Int, size);

    const result = await dataRequest.query(`
      ${CUSTOMER_SELECT_BASE}
      ${whereClause}
      ORDER BY C.CompanyName ASC
      OFFSET @offset ROWS FETCH NEXT @size ROWS ONLY
    `);

    res.json({ items: result.recordset.map(mapCustomerRow), total, page: pageNum, pageSize: size });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// GET /api/customers/:id - customer detail plus their leads
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid customer id' });

    const pool = await getPool();
    const customerResult = await pool
      .request()
      .input('id', sql.Int, id)
      .query(`${CUSTOMER_SELECT_BASE} WHERE C.Id = @id AND C.IsDeleted = 0`);

    if (!customerResult.recordset.length) return res.status(404).json({ error: 'Customer not found' });

    const leadsResult = await pool.request().input('id', sql.Int, id).query(`
      SELECT L.*, ${CUSTOMER_JOIN_COLUMNS}
      FROM dbo.Leads L
      JOIN dbo.Customers C ON C.Id = L.CustomerId
      WHERE L.CustomerId = @id AND L.IsDeleted = 0
      ORDER BY L.UpdatedAt DESC
    `);

    res.json({
      customer: mapCustomerRow(customerResult.recordset[0]),
      leads: leadsResult.recordset.map(mapLeadRow),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch customer' });
  }
});

function bindCustomerInputs(request: any, body: any) {
  request.input('customerCode', sql.NVarChar, body.customerCode || null);
  request.input('companyName', sql.NVarChar, body.companyName);
  request.input('department', sql.NVarChar, body.department || null);
  request.input('contactPersonName', sql.NVarChar, body.contactPersonName || null);
  request.input('email', sql.NVarChar, body.email || null);
  request.input('phone', sql.NVarChar, body.phone || null);
  request.input('country', sql.NVarChar, body.country || null);
  request.input('state', sql.NVarChar, body.state || null);
  request.input('city', sql.NVarChar, body.city || null);
}

// POST /api/customers - create a standalone customer record
router.post('/', async (req: Request, res: Response) => {
  if (!req.body.companyName || !String(req.body.companyName).trim()) {
    return res.status(400).json({ error: 'companyName is required' });
  }
  if (req.body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(req.body.email).trim())) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  try {
    const pool = await getPool();
    const request = pool.request();
    bindCustomerInputs(request, req.body);
    const result = await request.query(`
      INSERT INTO dbo.Customers (CustomerCode, CompanyName, Department, ContactPersonName, Email, Phone, Country, State, City)
      OUTPUT INSERTED.Id
      VALUES (@customerCode, @companyName, @department, @contactPersonName, @email, @phone, @country, @state, @city)
    `);
    const newId = result.recordset[0].Id;
    const customerResult = await pool.request().input('id', sql.Int, newId).query(`${CUSTOMER_SELECT_BASE} WHERE C.Id = @id`);
    res.status(201).json(mapCustomerRow(customerResult.recordset[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

// PUT /api/customers/:id - update
router.put('/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid customer id' });
  if (!req.body.companyName || !String(req.body.companyName).trim()) {
    return res.status(400).json({ error: 'companyName is required' });
  }
  if (req.body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(req.body.email).trim())) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  try {
    const pool = await getPool();
    const existing = await pool.request().input('id', sql.Int, id).query('SELECT Id FROM dbo.Customers WHERE Id = @id AND IsDeleted = 0');
    if (!existing.recordset.length) return res.status(404).json({ error: 'Customer not found' });

    const request = pool.request();
    request.input('id', sql.Int, id);
    bindCustomerInputs(request, req.body);
    await request.query(`
      UPDATE dbo.Customers SET
        CustomerCode = @customerCode, CompanyName = @companyName, Department = @department,
        ContactPersonName = @contactPersonName, Email = @email, Phone = @phone,
        Country = @country, State = @state, City = @city, UpdatedAt = SYSUTCDATETIME()
      WHERE Id = @id
    `);

    const customerResult = await pool.request().input('id', sql.Int, id).query(`${CUSTOMER_SELECT_BASE} WHERE C.Id = @id`);
    res.json(mapCustomerRow(customerResult.recordset[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

export default router;
