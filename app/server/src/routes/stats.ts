import { Router, Request, Response } from 'express';
import { getPool, sql } from '../db';
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
        (SELECT ISNULL(SUM(LeadValue), 0) FROM dbo.Leads WHERE IsDeleted = 0 AND FollowUpStatus = 'Won') AS WonValue,
        (SELECT COUNT(*) FROM dbo.Leads WHERE IsDeleted = 0 AND LeadValue IS NOT NULL AND LeadValue > 0) AS LeadsWithValueCount,
        (SELECT COUNT(*) FROM dbo.Leads WHERE IsDeleted = 0 AND (LeadValue IS NULL OR LeadValue = 0)) AS LeadsWithoutValueCount,
        (SELECT COUNT(*) FROM dbo.Leads WHERE IsDeleted = 0 AND ErpLeadNumber IS NOT NULL AND LTRIM(RTRIM(ErpLeadNumber)) <> '') AS QuotationSentCount,
        (SELECT COUNT(*) FROM dbo.Leads WHERE IsDeleted = 0 AND (ErpLeadNumber IS NULL OR LTRIM(RTRIM(ErpLeadNumber)) = '')) AS NotYetQuotedCount,
        (SELECT COUNT(*) FROM dbo.Leads WHERE IsDeleted = 0 AND FollowUpStatus = 'Awaiting Response') AS AwaitingResponseCount
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
      leadsWithValueCount: row.LeadsWithValueCount,
      leadsWithoutValueCount: row.LeadsWithoutValueCount,
      quotationSentCount: row.QuotationSentCount,
      awaitingResponseCount: row.AwaitingResponseCount,
      notYetQuotedCount: row.NotYetQuotedCount,
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

    const [byStatusResult, byPriorityResult, bySourceResult, byAssigneeResult, byGeneratorResult, byProductResult, topCustomersResult, leadAgingResult] = await Promise.all([
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
        SELECT ISNULL(NULLIF(LTRIM(RTRIM(InquiryAssignedTo)), ''), 'Unassigned') AS Assignee, COUNT(*) AS Cnt
        FROM dbo.Leads WHERE IsDeleted = 0
        GROUP BY ISNULL(NULLIF(LTRIM(RTRIM(InquiryAssignedTo)), ''), 'Unassigned')
        ORDER BY Cnt DESC
      `),
      pool.request().query(`
        SELECT ISNULL(NULLIF(LTRIM(RTRIM(LeadGeneratedBy)), ''), 'Unknown') AS Generator, COUNT(*) AS Cnt
        FROM dbo.Leads WHERE IsDeleted = 0
        GROUP BY ISNULL(NULLIF(LTRIM(RTRIM(LeadGeneratedBy)), ''), 'Unknown')
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
      // Leads per customer (every customer with at least one lead), with a won/lost split.
      pool.request().query(`
        SELECT
          C.Id AS CustomerId,
          C.CompanyName,
          COUNT(*) AS Total,
          SUM(CASE WHEN L.FollowUpStatus = 'Won' THEN 1 ELSE 0 END) AS Won,
          SUM(CASE WHEN L.FollowUpStatus = 'Lost' THEN 1 ELSE 0 END) AS Lost
        FROM dbo.Leads L JOIN dbo.Customers C ON C.Id = L.CustomerId
        WHERE L.IsDeleted = 0
        GROUP BY C.Id, C.CompanyName
        ORDER BY Total DESC, C.CompanyName ASC
      `),
      // Aging of currently-open leads, bucketed by days since received (falling
      // back to CreatedAt when ReceivedDate wasn't captured).
      pool.request().query(`
        SELECT
          CASE
            WHEN DATEDIFF(DAY, COALESCE(L.ReceivedDate, CAST(L.CreatedAt AS DATE)), CAST(SYSUTCDATETIME() AS DATE)) <= 7 THEN '0-7 days'
            WHEN DATEDIFF(DAY, COALESCE(L.ReceivedDate, CAST(L.CreatedAt AS DATE)), CAST(SYSUTCDATETIME() AS DATE)) <= 30 THEN '8-30 days'
            WHEN DATEDIFF(DAY, COALESCE(L.ReceivedDate, CAST(L.CreatedAt AS DATE)), CAST(SYSUTCDATETIME() AS DATE)) <= 60 THEN '31-60 days'
            WHEN DATEDIFF(DAY, COALESCE(L.ReceivedDate, CAST(L.CreatedAt AS DATE)), CAST(SYSUTCDATETIME() AS DATE)) <= 90 THEN '61-90 days'
            ELSE '90+ days'
          END AS Bucket,
          COUNT(*) AS Cnt
        FROM dbo.Leads L
        WHERE L.IsDeleted = 0 AND L.FollowUpStatus NOT IN ${TERMINAL_STATUSES_SQL}
        GROUP BY
          CASE
            WHEN DATEDIFF(DAY, COALESCE(L.ReceivedDate, CAST(L.CreatedAt AS DATE)), CAST(SYSUTCDATETIME() AS DATE)) <= 7 THEN '0-7 days'
            WHEN DATEDIFF(DAY, COALESCE(L.ReceivedDate, CAST(L.CreatedAt AS DATE)), CAST(SYSUTCDATETIME() AS DATE)) <= 30 THEN '8-30 days'
            WHEN DATEDIFF(DAY, COALESCE(L.ReceivedDate, CAST(L.CreatedAt AS DATE)), CAST(SYSUTCDATETIME() AS DATE)) <= 60 THEN '31-60 days'
            WHEN DATEDIFF(DAY, COALESCE(L.ReceivedDate, CAST(L.CreatedAt AS DATE)), CAST(SYSUTCDATETIME() AS DATE)) <= 90 THEN '61-90 days'
            ELSE '90+ days'
          END
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

    const generatorRows = byGeneratorResult.recordset.map((r) => ({ generator: r.Generator as string, count: r.Cnt as number }));
    const byGenerator = generatorRows.slice(0, TOP_N);
    const otherGeneratorCount = generatorRows.slice(TOP_N).reduce((sum, r) => sum + r.count, 0);
    if (otherGeneratorCount > 0) byGenerator.push({ generator: 'Other', count: otherGeneratorCount });

    const byProduct = byProductResult.recordset.slice(0, 8).map((r) => ({
      product: r.Product as string,
      total: r.Total as number,
      won: r.Won as number,
      lost: r.Lost as number,
    }));

    const leadsByCustomer = topCustomersResult.recordset.map((r) => ({
      customerId: r.CustomerId as number,
      companyName: r.CompanyName as string,
      total: r.Total as number,
      won: r.Won as number,
      lost: r.Lost as number,
    }));

    const AGING_BUCKET_ORDER = ['0-7 days', '8-30 days', '31-60 days', '61-90 days', '90+ days'];
    const countByAgingBucket = new Map<string, number>(leadAgingResult.recordset.map((r) => [r.Bucket, r.Cnt]));
    const leadAging = AGING_BUCKET_ORDER.map((bucket) => ({ bucket, count: countByAgingBucket.get(bucket) || 0 }));

    res.json({ byStatus, byPriority, bySource, byAssignee, byGenerator, byProduct, leadsByCustomer, leadAging });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

// GET /api/stats/trend?period=weekly|monthly|quarterly - enquiries received vs
// orders placed, bucketed at the requested granularity, for the dashboard trend chart.
const TREND_QUERIES: Record<string, string> = {
  weekly: `
    WITH Periods AS (
      SELECT DATEADD(WEEK, -n, DATEADD(WEEK, DATEDIFF(WEEK, 0, CAST(SYSUTCDATETIME() AS DATE)), 0)) AS PeriodStart
      FROM (SELECT TOP 12 ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1 AS n FROM sys.objects) AS Nums
    )
    SELECT
      FORMAT(P.PeriodStart, 'yyyy-MM-dd') AS PeriodKey,
      FORMAT(P.PeriodStart, 'dd MMM') AS PeriodLabel,
      (SELECT COUNT(*) FROM dbo.Leads L WHERE L.IsDeleted = 0 AND L.ReceivedDate >= P.PeriodStart AND L.ReceivedDate < DATEADD(WEEK, 1, P.PeriodStart)) AS Received,
      (SELECT COUNT(*) FROM dbo.Leads L WHERE L.IsDeleted = 0 AND L.OrderDate >= P.PeriodStart AND L.OrderDate < DATEADD(WEEK, 1, P.PeriodStart)) AS Ordered
    FROM Periods P
    ORDER BY P.PeriodStart ASC
  `,
  monthly: `
    WITH Periods AS (
      SELECT DATEADD(MONTH, -n, DATEFROMPARTS(YEAR(SYSUTCDATETIME()), MONTH(SYSUTCDATETIME()), 1)) AS PeriodStart
      FROM (SELECT TOP 12 ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1 AS n FROM sys.objects) AS Nums
    )
    SELECT
      FORMAT(P.PeriodStart, 'yyyy-MM') AS PeriodKey,
      FORMAT(P.PeriodStart, 'MMM yy') AS PeriodLabel,
      (SELECT COUNT(*) FROM dbo.Leads L WHERE L.IsDeleted = 0 AND L.ReceivedDate >= P.PeriodStart AND L.ReceivedDate < DATEADD(MONTH, 1, P.PeriodStart)) AS Received,
      (SELECT COUNT(*) FROM dbo.Leads L WHERE L.IsDeleted = 0 AND L.OrderDate >= P.PeriodStart AND L.OrderDate < DATEADD(MONTH, 1, P.PeriodStart)) AS Ordered
    FROM Periods P
    ORDER BY P.PeriodStart ASC
  `,
  quarterly: `
    WITH Periods AS (
      SELECT DATEADD(QUARTER, -n, DATEFROMPARTS(YEAR(SYSUTCDATETIME()), (DATEPART(QUARTER, SYSUTCDATETIME()) - 1) * 3 + 1, 1)) AS PeriodStart
      FROM (SELECT TOP 8 ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1 AS n FROM sys.objects) AS Nums
    )
    SELECT
      FORMAT(P.PeriodStart, 'yyyy-MM') AS PeriodKey,
      'Q' + CAST(DATEPART(QUARTER, P.PeriodStart) AS VARCHAR(1)) + ' ' + FORMAT(P.PeriodStart, 'yy') AS PeriodLabel,
      (SELECT COUNT(*) FROM dbo.Leads L WHERE L.IsDeleted = 0 AND L.ReceivedDate >= P.PeriodStart AND L.ReceivedDate < DATEADD(QUARTER, 1, P.PeriodStart)) AS Received,
      (SELECT COUNT(*) FROM dbo.Leads L WHERE L.IsDeleted = 0 AND L.OrderDate >= P.PeriodStart AND L.OrderDate < DATEADD(QUARTER, 1, P.PeriodStart)) AS Ordered
    FROM Periods P
    ORDER BY P.PeriodStart ASC
  `,
};

router.get('/trend', async (req: Request, res: Response) => {
  try {
    const period = TREND_QUERIES[req.query.period as string] ? (req.query.period as string) : 'monthly';
    const pool = await getPool();
    const result = await pool.request().query(TREND_QUERIES[period]);
    res.json(
      result.recordset.map((r) => ({
        periodKey: r.PeriodKey as string,
        periodLabel: r.PeriodLabel as string,
        received: r.Received as number,
        ordered: r.Ordered as number,
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch trend' });
  }
});

// GET /api/stats/team-trend?metric=enquiries|followups|orders&period=weekly|monthly|quarterly
// Per-person trend for the Team Performance page: how many enquiries each person
// created, follow-ups they logged, or sale orders they closed, per week/month/quarter.
interface PeriodBucket {
  key: string;
  label: string;
  start: Date;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Generates the list of period buckets to display, oldest first - the same
// window sizes as the /trend endpoint (12 weeks/months, 8 quarters).
function buildPeriodBuckets(period: string): PeriodBucket[] {
  const now = new Date();
  const buckets: PeriodBucket[] = [];

  if (period === 'weekly') {
    const dayOfWeek = now.getUTCDay();
    const daysSinceMonday = (dayOfWeek + 6) % 7;
    const thisWeekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday));
    for (let i = 11; i >= 0; i--) {
      const start = new Date(thisWeekStart);
      start.setUTCDate(start.getUTCDate() - i * 7);
      const key = `${start.getUTCFullYear()}-${pad2(start.getUTCMonth() + 1)}-${pad2(start.getUTCDate())}`;
      const label = `${pad2(start.getUTCDate())} ${MONTH_NAMES[start.getUTCMonth()]}`;
      buckets.push({ key, label, start });
    }
  } else if (period === 'quarterly') {
    const thisQuarterStartMonth = Math.floor(now.getUTCMonth() / 3) * 3;
    for (let i = 7; i >= 0; i--) {
      const totalMonth = now.getUTCFullYear() * 12 + thisQuarterStartMonth - i * 3;
      const year = Math.floor(totalMonth / 12);
      const month = totalMonth % 12;
      const start = new Date(Date.UTC(year, month, 1));
      const quarter = Math.floor(month / 3) + 1;
      const key = `${year}-${pad2(month + 1)}`;
      const label = `Q${quarter} ${String(year).slice(-2)}`;
      buckets.push({ key, label, start });
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      const totalMonth = now.getUTCFullYear() * 12 + now.getUTCMonth() - i;
      const year = Math.floor(totalMonth / 12);
      const month = totalMonth % 12;
      const start = new Date(Date.UTC(year, month, 1));
      const key = `${year}-${pad2(month + 1)}`;
      const label = `${MONTH_NAMES[month]} ${String(year).slice(-2)}`;
      buckets.push({ key, label, start });
    }
  }

  return buckets;
}

const METRIC_CONFIG: Record<string, { from: string; personExpr: string; dateExpr: string; where: string }> = {
  enquiries: {
    from: 'dbo.Leads L',
    personExpr: `ISNULL(NULLIF(LTRIM(RTRIM(L.LeadGeneratedBy)), ''), 'Unknown')`,
    dateExpr: 'COALESCE(L.ReceivedDate, CAST(L.CreatedAt AS DATE))',
    where: 'L.IsDeleted = 0',
  },
  followups: {
    from: 'dbo.Followups F JOIN dbo.Leads L ON L.Id = F.LeadId',
    personExpr: `ISNULL(NULLIF(LTRIM(RTRIM(F.FollowUpBy)), ''), 'Unknown')`,
    dateExpr: 'F.FollowUpDate',
    where: 'L.IsDeleted = 0',
  },
  orders: {
    from: 'dbo.Leads L',
    personExpr: `ISNULL(NULLIF(LTRIM(RTRIM(L.InquiryAssignedTo)), ''), 'Unassigned')`,
    dateExpr: 'L.OrderDate',
    where: 'L.IsDeleted = 0 AND L.OrderDate IS NOT NULL',
  },
};

function bucketExprFor(period: string, dateExpr: string): string {
  if (period === 'weekly') return `DATEADD(WEEK, DATEDIFF(WEEK, 0, ${dateExpr}), 0)`;
  if (period === 'quarterly') return `DATEFROMPARTS(YEAR(${dateExpr}), (DATEPART(QUARTER, ${dateExpr}) - 1) * 3 + 1, 1)`;
  return `DATEFROMPARTS(YEAR(${dateExpr}), MONTH(${dateExpr}), 1)`;
}

const TOP_PEOPLE_COUNT = 6;

router.get('/team-trend', async (req: Request, res: Response) => {
  try {
    const metricParam = req.query.metric as string;
    const metric = METRIC_CONFIG[metricParam] ? metricParam : 'enquiries';
    const periodParam = req.query.period as string;
    const period = ['weekly', 'monthly', 'quarterly'].includes(periodParam) ? periodParam : 'monthly';

    const buckets = buildPeriodBuckets(period);
    const earliestStart = buckets[0].start;
    const config = METRIC_CONFIG[metric];
    const bucketExpr = bucketExprFor(period, config.dateExpr);

    const pool = await getPool();
    const request = pool.request();
    request.input('earliestStart', sql.Date, earliestStart);
    const result = await request.query(`
      SELECT ${config.personExpr} AS Person, ${bucketExpr} AS BucketStart, COUNT(*) AS Cnt
      FROM ${config.from}
      WHERE ${config.where} AND ${config.dateExpr} >= @earliestStart
      GROUP BY ${config.personExpr}, ${bucketExpr}
    `);

    const bucketKeyFor = (d: Date) =>
      period === 'weekly'
        ? `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
        : `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;

    const totalsByPerson = new Map<string, number>();
    for (const row of result.recordset) {
      const person = row.Person as string;
      totalsByPerson.set(person, (totalsByPerson.get(person) || 0) + (row.Cnt as number));
    }
    const topPeople = [...totalsByPerson.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_PEOPLE_COUNT)
      .map(([person]) => person);
    const topPeopleSet = new Set(topPeople);
    const hasOther = [...totalsByPerson.keys()].some((p) => !topPeopleSet.has(p));

    const countsByBucketKey = new Map<string, Record<string, number>>();
    for (const bucket of buckets) countsByBucketKey.set(bucket.key, {});
    for (const row of result.recordset) {
      const key = bucketKeyFor(row.BucketStart as Date);
      const bucketCounts = countsByBucketKey.get(key);
      if (!bucketCounts) continue; // outside the requested window
      const person = row.Person as string;
      const label = topPeopleSet.has(person) ? person : 'Other';
      bucketCounts[label] = (bucketCounts[label] || 0) + (row.Cnt as number);
    }

    const people = hasOther ? [...topPeople, 'Other'] : topPeople;
    const periods = buckets.map((b) => ({
      periodKey: b.key,
      periodLabel: b.label,
      counts: countsByBucketKey.get(b.key) || {},
    }));

    res.json({ people, periods });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch team trend' });
  }
});

export default router;
