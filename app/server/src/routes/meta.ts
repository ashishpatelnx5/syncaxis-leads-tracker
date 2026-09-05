import { Router, Request, Response } from 'express';
import { getPool } from '../db';
import {
  CARD_COLLECTED_OPTIONS,
  FOLLOW_UP_STATUS_OPTIONS,
  PRIORITY_OPTIONS,
  LEAD_TYPE_OPTIONS,
} from '../types';

const router = Router();

async function distinctValues(pool: any, column: string): Promise<string[]> {
  const result = await pool
    .request()
    .query(`SELECT DISTINCT ${column} AS v FROM dbo.Leads WHERE ${column} IS NOT NULL AND ${column} <> '' AND IsDeleted = 0 ORDER BY ${column}`);
  return result.recordset.map((r: any) => r.v);
}

// GET /api/meta - dropdown option lists for the lead form and filters
router.get('/', async (_req: Request, res: Response) => {
  try {
    const pool = await getPool();
    const [applicationCategories, inquirySources, assignees, generators] = await Promise.all([
      distinctValues(pool, 'ApplicationCategory'),
      distinctValues(pool, 'InquirySource'),
      distinctValues(pool, 'EnquiryAssignedTo'),
      distinctValues(pool, 'LeadGeneratedBy'),
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
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch metadata' });
  }
});

export default router;
