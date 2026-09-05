import { Router, Request, Response } from 'express';
import { getPool } from '../db';
import { FOLLOW_UP_STATUS_OPTIONS, PRIORITY_OPTIONS, TERMINAL_STATUSES_SQL } from '../types';

const router = Router();

// GET /api/stats - KPI tiles for the leads dashboard header
router.get('/', async (_req: Request, res: Response) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT
        (SELECT COUNT(*) FROM dbo.Leads WHERE IsDeleted = 0) AS TotalLeads,
        (SELECT COUNT(*) FROM dbo.Customers WHERE IsDeleted = 0) AS TotalCustomers,
        (SELECT COUNT(DISTINCT C.State) FROM dbo.Leads L JOIN dbo.Customers C ON C.Id = L.CustomerId WHERE L.IsDeleted = 0 AND C.State IS NOT NULL AND C.State <> '') AS StatesReached,
        (SELECT COUNT(*) FROM dbo.Leads WHERE IsDeleted = 0 AND FollowUpStatus NOT IN ${TERMINAL_STATUSES_SQL}) AS OpenPipelineCount,
        (SELECT COUNT(*) FROM dbo.Leads WHERE IsDeleted = 0 AND FollowUpStatus = 'Won') AS WonCount,
        (SELECT COUNT(*) FROM dbo.Leads WHERE IsDeleted = 0 AND FollowUpStatus = 'Lost') AS LostCount,
        (SELECT COUNT(*) FROM dbo.Leads WHERE IsDeleted = 0 AND FollowUpStatus = 'Not Contacted') AS NotContactedCount,
        (SELECT COUNT(*) FROM dbo.Leads WHERE IsDeleted = 0 AND Priority = 'Hot') AS HotCount,
        (SELECT COUNT(*) FROM dbo.Leads WHERE IsDeleted = 0 AND CardCollected = 'Yes') AS CardsCollectedCount,
        (SELECT COUNT(*) FROM dbo.Leads WHERE IsDeleted = 0 AND NextFollowUpDate IS NOT NULL
          AND NextFollowUpDate BETWEEN CAST(SYSUTCDATETIME() AS DATE) AND DATEADD(DAY, 7, CAST(SYSUTCDATETIME() AS DATE))) AS FollowUpsDueSoon,
        (SELECT COUNT(*) FROM dbo.Leads WHERE IsDeleted = 0 AND NextFollowUpDate IS NOT NULL
          AND NextFollowUpDate < CAST(SYSUTCDATETIME() AS DATE) AND FollowUpStatus NOT IN ${TERMINAL_STATUSES_SQL}) AS OverdueCount,
        (SELECT ISNULL(SUM(LeadValue), 0) FROM dbo.Leads WHERE IsDeleted = 0) AS TotalLeadValue,
        (SELECT ISNULL(SUM(LeadValue), 0) FROM dbo.Leads WHERE IsDeleted = 0 AND FollowUpStatus NOT IN ${TERMINAL_STATUSES_SQL}) AS OpenPipelineValue,
        (SELECT ISNULL(SUM(LeadValue), 0) FROM dbo.Leads WHERE IsDeleted = 0 AND FollowUpStatus = 'Won') AS WonValue
    `);
    const row = result.recordset[0];
    const wonCount = row.WonCount as number;
    const wonValue = Number(row.WonValue);
    res.json({
      totalLeads: row.TotalLeads,
      totalCustomers: row.TotalCustomers,
      statesReached: row.StatesReached,
      openPipelineCount: row.OpenPipelineCount,
      wonCount,
      lostCount: row.LostCount,
      notContactedCount: row.NotContactedCount,
      hotCount: row.HotCount,
      cardsCollectedCount: row.CardsCollectedCount,
      followUpsDueSoon: row.FollowUpsDueSoon,
      overdueCount: row.OverdueCount,
      conversionRate: row.TotalLeads > 0 ? wonCount / row.TotalLeads : 0,
      totalLeadValue: Number(row.TotalLeadValue),
      openPipelineValue: Number(row.OpenPipelineValue),
      wonValue,
      avgDealSize: wonCount > 0 ? wonValue / wonCount : 0,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/stats/dashboard - aggregates for the management report homepage.
// The five breakdowns and the trend are independent of each other, so they
// run as concurrent pooled queries instead of one after another.
router.get('/dashboard', async (_req: Request, res: Response) => {
  try {
    const pool = await getPool();

    const [byStatusResult, byPriorityResult, bySourceResult, byAssigneeResult, byProductResult, trendResult] = await Promise.all([
      pool.request().query(`
        SELECT FollowUpStatus, COUNT(*) AS Cnt FROM dbo.Leads WHERE IsDeleted = 0 GROUP BY FollowUpStatus
      `),
      pool.request().query(`
        SELECT Priority, COUNT(*) AS Cnt FROM dbo.Leads WHERE IsDeleted = 0 GROUP BY Priority
      `),
      pool.request().query(`
        SELECT ISNULL(NULLIF(LTRIM(RTRIM(InquirySource)), ''), 'Not Specified') AS Source, COUNT(*) AS Cnt
        FROM dbo.Leads WHERE IsDeleted = 0
        GROUP BY ISNULL(NULLIF(LTRIM(RTRIM(InquirySource)), ''), 'Not Specified')
        ORDER BY Cnt DESC
      `),
      pool.request().query(`
        SELECT ISNULL(NULLIF(LTRIM(RTRIM(EnquiryAssignedTo)), ''), 'Unassigned') AS Assignee, COUNT(*) AS Cnt
        FROM dbo.Leads WHERE IsDeleted = 0
        GROUP BY ISNULL(NULLIF(LTRIM(RTRIM(EnquiryAssignedTo)), ''), 'Unassigned')
        ORDER BY Cnt DESC
      `),
      pool.request().query(`
        SELECT
          ISNULL(NULLIF(LTRIM(RTRIM(ProductInterest)), ''), 'Not Specified') AS Product,
          COUNT(*) AS Total,
          SUM(CASE WHEN FollowUpStatus = 'Won' THEN 1 ELSE 0 END) AS Won,
          SUM(CASE WHEN FollowUpStatus = 'Lost' THEN 1 ELSE 0 END) AS Lost
        FROM dbo.Leads WHERE IsDeleted = 0
        GROUP BY ISNULL(NULLIF(LTRIM(RTRIM(ProductInterest)), ''), 'Not Specified')
        ORDER BY Total DESC
      `),
      // Monthly trend: enquiries received vs orders placed, last 12 calendar months.
      pool.request().query(`
        WITH Months AS (
          SELECT DATEADD(MONTH, -n, DATEFROMPARTS(YEAR(SYSUTCDATETIME()), MONTH(SYSUTCDATETIME()), 1)) AS MonthStart
          FROM (SELECT TOP 12 ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1 AS n FROM sys.objects) AS Nums
        )
        SELECT
          FORMAT(M.MonthStart, 'yyyy-MM') AS Month,
          (SELECT COUNT(*) FROM dbo.Leads L WHERE L.IsDeleted = 0 AND L.ReceivedDate >= M.MonthStart AND L.ReceivedDate < DATEADD(MONTH, 1, M.MonthStart)) AS Received,
          (SELECT COUNT(*) FROM dbo.Leads L WHERE L.IsDeleted = 0 AND L.OrderDate >= M.MonthStart AND L.OrderDate < DATEADD(MONTH, 1, M.MonthStart)) AS Ordered
        FROM Months M
        ORDER BY M.MonthStart ASC
      `),
    ]);

    const countByStatus = new Map<string, number>(byStatusResult.recordset.map((r) => [r.FollowUpStatus, r.Cnt]));
    const byStatus = FOLLOW_UP_STATUS_OPTIONS.map((status) => ({ status, count: countByStatus.get(status) || 0 }));

    const countByPriority = new Map<string, number>(byPriorityResult.recordset.map((r) => [r.Priority, r.Cnt]));
    const byPriority = PRIORITY_OPTIONS.map((priority) => ({ priority, count: countByPriority.get(priority) || 0 }));

    const sourceRows = bySourceResult.recordset.map((r) => ({ source: r.Source as string, count: r.Cnt as number }));
    const bySource = sourceRows.slice(0, 6);

    const assigneeRows = byAssigneeResult.recordset.map((r) => ({ assignee: r.Assignee as string, count: r.Cnt as number }));
    const TOP_N = 8;
    const byAssignee = assigneeRows.slice(0, TOP_N);
    const otherAssigneeCount = assigneeRows.slice(TOP_N).reduce((sum, r) => sum + r.count, 0);
    if (otherAssigneeCount > 0) byAssignee.push({ assignee: 'Other', count: otherAssigneeCount });

    const byProduct = byProductResult.recordset.slice(0, 8).map((r) => ({
      product: r.Product as string,
      total: r.Total as number,
      won: r.Won as number,
      lost: r.Lost as number,
    }));

    const monthlyTrend = trendResult.recordset.map((r) => ({ month: r.Month, received: r.Received, ordered: r.Ordered }));

    res.json({ byStatus, byPriority, bySource, byAssignee, byProduct, monthlyTrend });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

export default router;
