import { Router, Request, Response } from 'express';
import { getPool } from '../db';
import {
  CARD_COLLECTED_OPTIONS,
  FOLLOW_UP_STATUS_OPTIONS,
  PRIORITY_OPTIONS,
  LEAD_TYPE_OPTIONS,
} from '../types';

const router = Router();

async function distinctValues(pool: any, table: string, column: string, extraWhere = ''): Promise<string[]> {
  const result = await pool
    .request()
    .query(`SELECT DISTINCT ${column} AS v FROM dbo.${table} WHERE ${column} IS NOT NULL AND ${column} <> '' AND IsDeleted = 0 ${extraWhere} ORDER BY ${column}`);
  return result.recordset.map((r: any) => r.v);
}

// GET /api/meta - dropdown option lists for the lead/customer forms and filters
router.get('/', async (_req: Request, res: Response) => {
  try {
    const pool = await getPool();
    const [applicationCategories, inquirySources, assignees, generators, countries, states, cities] = await Promise.all([
      distinctValues(pool, 'Leads', 'ApplicationCategory'),
      distinctValues(pool, 'Leads', 'InquirySource'),
      distinctValues(pool, 'Leads', 'EnquiryAssignedTo'),
      distinctValues(pool, 'Leads', 'LeadGeneratedBy'),
      distinctValues(pool, 'Customers', 'Country'),
      distinctValues(pool, 'Customers', 'State'),
      distinctValues(pool, 'Customers', 'City'),
    ]);

    res.json({
      cardCollected: CARD_COLLECTED_OPTIONS,
      followUpStatus: FOLLOW_UP_STATUS_OPTIONS,
      priority: PRIORITY_OPTIONS,
      leadType: LEAD_TYPE_OPTIONS,
      applicationCategories,
      inquirySources,
      assignees,
      generators,
      countries,
      states,
      cities,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch metadata' });
  }
});

export default router;
