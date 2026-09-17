import { Router, Request, Response } from 'express';
import { getPool, sql } from '../db';
import { mapAuditLogRow } from '../mappers';
import { requirePermission, LEADS_PERM } from '../auth';

const router = Router();

// Every route here is admin-only - gated once for the whole router rather
// than per-route, same pattern as stats.ts.
router.use(requirePermission(LEADS_PERM.ADMIN_MANAGE));

// Builds the WHERE conditions for the audit log list, binding parameters on
// the given request - shared so count and data queries always agree.
function applyAuditFilters(request: any, query: Record<string, string>): string[] {
  const { username, action, entityType, success, dateFrom, dateTo, q } = query;
  const conditions: string[] = [];

  if (username) {
    conditions.push('Username = @username');
    request.input('username', sql.NVarChar, username);
  }
  if (action) {
    conditions.push('Action = @action');
    request.input('action', sql.NVarChar, action);
  }
  if (entityType) {
    conditions.push('EntityType = @entityType');
    request.input('entityType', sql.NVarChar, entityType);
  }
  if (success === 'true') {
    conditions.push('Success = 1');
  } else if (success === 'false') {
    conditions.push('Success = 0');
  }
  if (dateFrom) {
    conditions.push('CreatedAt >= @dateFrom');
    request.input('dateFrom', sql.DateTime2, new Date(dateFrom));
  }
  if (dateTo) {
    // Inclusive of the whole day passed in, not just up to midnight at its start.
    conditions.push('CreatedAt < DATEADD(DAY, 1, @dateTo)');
    request.input('dateTo', sql.DateTime2, new Date(dateTo));
  }
  if (q) {
    conditions.push("(Username LIKE @q OR DisplayName LIKE @q OR Action LIKE @q OR CAST(Details AS NVARCHAR(MAX)) LIKE @q)");
    request.input('q', sql.NVarChar, `%${q}%`);
  }

  return conditions;
}

// GET /api/audit-log - paginated, filterable activity trail (admin only)
router.get('/', async (req: Request, res: Response) => {
  try {
    const query = req.query as Record<string, string>;
    const { page = '1', pageSize = '50' } = query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const size = Math.min(200, Math.max(1, parseInt(pageSize, 10) || 50));
    const offset = (pageNum - 1) * size;

    const pool = await getPool();

    const countRequest = pool.request();
    const conditions = applyAuditFilters(countRequest, query);
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const dataRequest = pool.request();
    applyAuditFilters(dataRequest, query);
    dataRequest.input('offset', sql.Int, offset);
    dataRequest.input('size', sql.Int, size);

    const [countResult, result] = await Promise.all([
      countRequest.query(`SELECT COUNT(*) AS Total FROM dbo.AuditLog ${whereClause}`),
      dataRequest.query(`
        SELECT * FROM dbo.AuditLog
        ${whereClause}
        ORDER BY CreatedAt DESC
        OFFSET @offset ROWS FETCH NEXT @size ROWS ONLY
      `),
    ]);

    res.json({
      items: result.recordset.map(mapAuditLogRow),
      total: countResult.recordset[0].Total as number,
      page: pageNum,
      pageSize: size,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

// GET /api/audit-log/actions - distinct action values seen so far, for the
// filter dropdown (so it only ever offers actions that actually occur).
router.get('/actions', async (_req: Request, res: Response) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT DISTINCT Action FROM dbo.AuditLog ORDER BY Action');
    res.json(result.recordset.map((r: any) => r.Action as string));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch audit log actions' });
  }
});

export default router;
