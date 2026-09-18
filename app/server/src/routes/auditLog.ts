import { Router, Request, Response } from 'express';
import { getPool, sql } from '../db';
import { mapAuditLogRow } from '../mappers';
import { requirePermission, LEADS_PERM } from '../auth';

const router = Router();

// Every route here is admin-only - gated once for the whole router rather
// than per-route, same pattern as stats.ts.
router.use(requirePermission(LEADS_PERM.ADMIN_MANAGE));

// GET /api/audit-log - paginated activity trail (admin only). One free-text
// search box covers everything worth filtering by - who, what action, what
// entity type, from what IP, or any word inside the details JSON - rather
// than a separate control per column.
router.get('/', async (req: Request, res: Response) => {
  try {
    const query = req.query as Record<string, string>;
    const { page = '1', pageSize = '50', q } = query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const size = Math.min(200, Math.max(1, parseInt(pageSize, 10) || 50));
    const offset = (pageNum - 1) * size;

    const pool = await getPool();

    const conditions: string[] = [];
    const countRequest = pool.request();
    const dataRequest = pool.request();

    if (q) {
      const clause = '(Username LIKE @q OR DisplayName LIKE @q OR Action LIKE @q OR EntityType LIKE @q OR IpAddress LIKE @q OR CAST(Details AS NVARCHAR(MAX)) LIKE @q)';
      conditions.push(clause);
      countRequest.input('q', sql.NVarChar, `%${q}%`);
      dataRequest.input('q', sql.NVarChar, `%${q}%`);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

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

export default router;
