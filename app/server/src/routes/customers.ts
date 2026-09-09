import { Router, Request, Response } from 'express';
import { getPool, sql } from '../db';
import { mapCustomerRow, mapLeadRow, CUSTOMER_JOIN_COLUMNS } from '../mappers';

const router = Router();

const CUSTOMER_SELECT_BASE = `
  SELECT C.*,
    (SELECT COUNT(*) FROM dbo.Leads L WHERE L.CustomerId = C.Id AND L.IsDeleted = 0) AS LeadCount
  FROM dbo.Customers C
`;

// Maps a client-facing sort key to the SQL expression to order by. LeadCount
// is a computed subquery column, not a plain table column, so it's ordered by
// the same subquery expression rather than an alias.
const CUSTOMER_SORTABLE_COLUMNS: Record<string, string> = {
  CompanyName: 'C.CompanyName',
  ContactPersonName: 'C.ContactPersonName',
  City: 'C.City',
  LeadCount: '(SELECT COUNT(*) FROM dbo.Leads L WHERE L.CustomerId = C.Id AND L.IsDeleted = 0)',
};

// GET /api/customers?q=&limit= - search for the lead-form picker and the customer list page
router.get('/', async (req: Request, res: Response) => {
  try {
    const { q, page = '1', pageSize = '25', sortBy = 'CompanyName', sortDir = 'asc' } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const size = Math.min(50, Math.max(1, parseInt(pageSize, 10) || 25));
    const offset = (pageNum - 1) * size;
    const orderColumn = CUSTOMER_SORTABLE_COLUMNS[sortBy] || CUSTOMER_SORTABLE_COLUMNS.CompanyName;
    const orderDir = sortDir === 'desc' ? 'DESC' : 'ASC';

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
      ORDER BY ${orderColumn} ${orderDir}
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

// CustomerCode is a system-assigned identifier (CUST-000001, CUST-000002, ...)
// - never accepted from the client, only ever set here on creation.
async function generateNextCustomerCode(pool: any): Promise<string> {
  const result = await pool.request().query(`
    SELECT MAX(CAST(SUBSTRING(CustomerCode, 6, 10) AS INT)) AS MaxNum
    FROM dbo.Customers
    WHERE CustomerCode LIKE 'CUST-%' AND ISNUMERIC(SUBSTRING(CustomerCode, 6, 10)) = 1
  `);
  const nextNum = (result.recordset[0].MaxNum || 0) + 1;
  return `CUST-${String(nextNum).padStart(6, '0')}`;
}

function bindCustomerInputs(request: any, body: any) {
  request.input('companyName', sql.NVarChar, body.companyName);
  request.input('department', sql.NVarChar, body.department || null);
  request.input('contactPersonName', sql.NVarChar, body.contactPersonName || null);
  request.input('email', sql.NVarChar, body.email || null);
  request.input('phone', sql.NVarChar, body.phone || null);
  request.input('gstin', sql.NVarChar, body.gstin ? String(body.gstin).trim().toUpperCase() : null);
  request.input('address', sql.NVarChar, body.address || null);
  request.input('country', sql.NVarChar, body.country || null);
  request.input('state', sql.NVarChar, body.state || null);
  request.input('city', sql.NVarChar, body.city || null);
  request.input('pincode', sql.NVarChar, body.pincode || null);
}

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

function validateGstin(body: any): string | null {
  if (!body.gstin) return null;
  const value = String(body.gstin).trim().toUpperCase();
  if (!GSTIN_PATTERN.test(value)) return 'Invalid GSTIN - expected a 15-character GST number (e.g. 27ABCDE1234F1Z5)';
  return null;
}

// POST /api/customers - create a standalone customer record
router.post('/', async (req: Request, res: Response) => {
  if (!req.body.companyName || !String(req.body.companyName).trim()) {
    return res.status(400).json({ error: 'companyName is required' });
  }
  if (req.body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(req.body.email).trim())) {
    return res.status(400).json({ error: 'Invalid email address' });
  }
  const gstinError = validateGstin(req.body);
  if (gstinError) return res.status(400).json({ error: gstinError });

  try {
    const pool = await getPool();
    const customerCode = await generateNextCustomerCode(pool);

    const request = pool.request();
    request.input('customerCode', sql.NVarChar, customerCode);
    bindCustomerInputs(request, req.body);
    const result = await request.query(`
      INSERT INTO dbo.Customers (CustomerCode, CompanyName, Department, ContactPersonName, Email, Phone, GSTIN, Address, Country, State, City, Pincode)
      OUTPUT INSERTED.Id
      VALUES (@customerCode, @companyName, @department, @contactPersonName, @email, @phone, @gstin, @address, @country, @state, @city, @pincode)
    `);
    const newId = result.recordset[0].Id;
    const customerResult = await pool.request().input('id', sql.Int, newId).query(`${CUSTOMER_SELECT_BASE} WHERE C.Id = @id`);
    res.status(201).json(mapCustomerRow(customerResult.recordset[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

// PUT /api/customers/:id - update (CustomerCode is intentionally not
// updatable here - it's not in bindCustomerInputs or the SET clause below)
router.put('/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid customer id' });
  if (!req.body.companyName || !String(req.body.companyName).trim()) {
    return res.status(400).json({ error: 'companyName is required' });
  }
  if (req.body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(req.body.email).trim())) {
    return res.status(400).json({ error: 'Invalid email address' });
  }
  const gstinError = validateGstin(req.body);
  if (gstinError) return res.status(400).json({ error: gstinError });

  try {
    const pool = await getPool();
    const existing = await pool.request().input('id', sql.Int, id).query('SELECT Id FROM dbo.Customers WHERE Id = @id AND IsDeleted = 0');
    if (!existing.recordset.length) return res.status(404).json({ error: 'Customer not found' });

    const request = pool.request();
    request.input('id', sql.Int, id);
    bindCustomerInputs(request, req.body);
    await request.query(`
      UPDATE dbo.Customers SET
        CompanyName = @companyName, Department = @department,
        ContactPersonName = @contactPersonName, Email = @email, Phone = @phone, GSTIN = @gstin, Address = @address,
        Country = @country, State = @state, City = @city, Pincode = @pincode, UpdatedAt = SYSUTCDATETIME()
      WHERE Id = @id
    `);

    const customerResult = await pool.request().input('id', sql.Int, id).query(`${CUSTOMER_SELECT_BASE} WHERE C.Id = @id`);
    res.json(mapCustomerRow(customerResult.recordset[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

// DELETE /api/customers/:id - soft delete (Admin only). Blocked while the
// customer still has active leads, so a lead never points at a hidden customer.
router.delete('/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid customer id' });

  try {
    const pool = await getPool();
    const existing = await pool.request().input('id', sql.Int, id).query('SELECT Id FROM dbo.Customers WHERE Id = @id AND IsDeleted = 0');
    if (!existing.recordset.length) return res.status(404).json({ error: 'Customer not found' });

    const leadCount = await pool.request().input('id', sql.Int, id).query('SELECT COUNT(*) AS Cnt FROM dbo.Leads WHERE CustomerId = @id AND IsDeleted = 0');
    if (leadCount.recordset[0].Cnt > 0) {
      return res.status(400).json({ error: `Can't delete - this customer still has ${leadCount.recordset[0].Cnt} lead(s). Delete or reassign those first.` });
    }

    await pool.request().input('id', sql.Int, id).query('UPDATE dbo.Customers SET IsDeleted = 1, UpdatedAt = SYSUTCDATETIME() WHERE Id = @id');
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete customer' });
  }
});

export default router;
