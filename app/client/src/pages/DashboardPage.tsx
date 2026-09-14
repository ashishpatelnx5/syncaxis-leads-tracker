import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchStats, fetchDashboardStats } from '../api';
import type { Stats, DashboardStats } from '../api';
import { KpiTile } from '../components/KpiTile';
import { formatInr } from '../utils/format';
import { BreakdownBars } from '../components/BreakdownBars';
import { TrendChart } from '../charts/TrendChart';

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

const TOP_CUSTOMERS_COUNT = 8;

export function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [dash, setDash] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState('');
  const [showAllCustomers, setShowAllCustomers] = useState(false);

  function load() {
    Promise.all([fetchStats(), fetchDashboardStats()])
      .then(([s, d]) => {
        setStats(s);
        setDash(d);
        setUpdatedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Dashboard</h1>
        <div className="page-header-actions">
          {updatedAt && <span className="hint-text" style={{ margin: 0, alignSelf: 'center' }}>Updated {updatedAt}</span>}
          <button className="btn" onClick={load}>Refresh</button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {stats && (
        <>
          <h2 className="dashboard-section-title">Pipeline Overview</h2>
          <div className="kpi-grid">
            <KpiTile label="Total Leads" value={String(stats.totalLeads)} sublabel="all enquiries on file" to="/leads" accent="blue" />
            <KpiTile label="Open Pipeline" value={String(stats.openPipelineCount)} sublabel="still in progress" to="/leads?status=OpenPipeline" accent="blue" />
            <KpiTile label="Won" value={String(stats.wonCount)} sublabel={`${pct(stats.wonCount / Math.max(1, stats.totalLeads))} of leads`} to="/leads?status=Won" accent="green" />
            <KpiTile label="Lost" value={String(stats.lostCount)} sublabel={`${pct(stats.lostCount / Math.max(1, stats.totalLeads))} of leads`} to="/leads?status=Lost" accent="red" />
            <KpiTile label="Conversion Rate" value={pct(stats.conversionRate)} sublabel="won ÷ total leads" to="/leads?status=Won" accent="green" />
            <KpiTile label="Not Contacted" value={String(stats.notContactedCount)} sublabel="no outreach yet" to={`/leads?status=${encodeURIComponent('Not Contacted')}`} accent="amber" />
          </div>

          <h2 className="dashboard-section-title">Financial Snapshot</h2>
          <div className="kpi-grid">
            <KpiTile label="Open Pipeline Value" value={formatInr(stats.openPipelineValue)} sublabel="potential, still open" to="/leads?status=OpenPipeline&sortBy=LeadValue&sortDir=desc" accent="blue" />
            <KpiTile label="Won Value" value={formatInr(stats.wonValue)} sublabel={`${stats.wonCount} won leads`} to="/leads?status=Won&sortBy=LeadValue&sortDir=desc" accent="green" />
            <KpiTile label="Average Deal Size" value={formatInr(stats.avgDealSize)} sublabel="per won lead" to="/leads?status=Won&sortBy=LeadValue&sortDir=desc" accent="teal" />
            <KpiTile label="Total Lead Value" value={formatInr(stats.totalLeadValue)} sublabel="all leads valued" to="/leads?sortBy=LeadValue&sortDir=desc" accent="violet" />
          </div>

          <h2 className="dashboard-section-title">Quotation Pipeline</h2>
          <p className="hint-text" style={{ marginTop: -8, marginBottom: 12 }}>
            Quotations are generated in SourcePro ERP - this app only mirrors the ERP Lead Number as a reference, so "sent" below means an ERP reference is on file, not the manually-set status.
          </p>
          <div className="kpi-grid">
            <KpiTile label="Quotation Sent" value={String(stats.quotationSentCount)} sublabel="has an ERP Lead Number on file" to="/leads?hasErpRef=true" accent="violet" />
            <KpiTile label="Awaiting Response" value={String(stats.awaitingResponseCount)} sublabel="under negotiation (per follow-up status)" to={`/leads?status=${encodeURIComponent('Awaiting Response')}`} accent="amber" />
            <KpiTile label="Quotation Not Sent" value={String(stats.notYetQuotedCount)} sublabel="no ERP reference yet" to="/leads?hasErpRef=false" accent="teal" />
            <KpiTile label="Priced Leads" value={String(stats.leadsWithValueCount)} sublabel="have a lead value set" to="/leads?hasValue=true&sortBy=LeadValue&sortDir=desc" accent="blue" />
            <KpiTile label="Missing a Value" value={String(stats.leadsWithoutValueCount)} sublabel="no price entered yet" to="/leads?hasValue=false" accent="amber" />
          </div>

          <h2 className="dashboard-section-title">Operational Health</h2>
          <div className="kpi-grid">
            <KpiTile label="Hot Leads" value={String(stats.hotCount)} sublabel="high priority" to="/leads?priority=Hot" accent="amber" />
            <KpiTile label="Follow-ups Due (7 days)" value={String(stats.followUpsDueSoon)} sublabel="coming up" to="/leads?followUpDueDays=7" accent="teal" />
            <KpiTile label="Overdue Follow-ups" value={String(stats.overdueCount)} sublabel="past due, still open" to="/leads?overdue=true" accent="red" />
            <KpiTile label="Cards Collected" value={String(stats.cardsCollectedCount)} sublabel={`${pct(stats.cardsCollectedCount / Math.max(1, stats.totalLeads))} of leads`} to="/leads?cardCollected=Yes" accent="blue" />
            <KpiTile label="States Reached" value={String(stats.statesReached)} sublabel="geographic spread" to="/customers" accent="violet" />
            <KpiTile label="Total Customers" value={String(stats.totalCustomers)} sublabel="customer master" to="/customers" accent="blue" />
          </div>
        </>
      )}

      {dash && (
        <>
          <h2 className="dashboard-section-title">Breakdowns &amp; Trends</h2>
          <div className="dashboard-grid">
            <section className="detail-section">
              <h2>Leads by Status</h2>
              <BreakdownBars items={dash.byStatus.map((d) => ({ label: d.status, value: d.count, to: `/leads?status=${encodeURIComponent(d.status)}` }))} />
            </section>

            <section className="detail-section">
              <h2>Leads by Priority</h2>
              <BreakdownBars items={dash.byPriority.map((d) => ({ label: d.priority, value: d.count, to: `/leads?priority=${encodeURIComponent(d.priority)}` }))} />
            </section>

            <section className="detail-section">
              <h2>Leads by Inquiry Source</h2>
              <BreakdownBars items={dash.bySource.map((d) => ({ label: d.source, value: d.count, to: `/leads?inquirySource=${encodeURIComponent(d.source)}` }))} />
            </section>

            <section className="detail-section detail-section-wide">
              <h2>Product Interest — Win/Loss</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Product</th><th>Total</th><th>Won</th><th>Lost</th></tr>
                  </thead>
                  <tbody>
                    {dash.byProduct.map((p) => (
                      <tr key={p.product}>
                        <td><Link to={`/leads?productInterest=${encodeURIComponent(p.product)}`}>{p.product}</Link></td>
                        <td>{p.total}</td>
                        <td className="text-good">{p.won}</td>
                        <td className="text-bad">{p.lost}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="detail-section">
              <h2>Lead Aging (Open Leads)</h2>
              <BreakdownBars items={dash.leadAging.map((a) => ({ label: a.bucket, value: a.count, to: `/leads?agingBucket=${encodeURIComponent(a.bucket)}` }))} />
            </section>

            <section className="detail-section detail-section-wide">
              <h2>Enquiries vs Orders Trend</h2>
              <TrendChart />
            </section>
          </div>

          <div className="page-header" style={{ marginTop: 22, marginBottom: 8 }}>
            <h2 className="dashboard-section-title" style={{ margin: 0 }}>Leads by Customer</h2>
            <button className="btn" onClick={() => setShowAllCustomers((v) => !v)}>
              {showAllCustomers ? 'Show Top ' + TOP_CUSTOMERS_COUNT : `Show All (${dash.leadsByCustomer.length})`}
            </button>
          </div>
          <section className="detail-section">
            <div className={showAllCustomers ? 'table-wrap table-wrap-scroll' : 'table-wrap'}>
              <table>
                <thead>
                  <tr><th>Customer</th><th>Total</th><th>Won</th><th>Lost</th></tr>
                </thead>
                <tbody>
                  {(showAllCustomers ? dash.leadsByCustomer : dash.leadsByCustomer.slice(0, TOP_CUSTOMERS_COUNT)).map((c) => (
                    <tr key={c.customerId}>
                      <td><Link to={`/leads?customerId=${c.customerId}`}>{c.companyName}</Link></td>
                      <td>{c.total}</td>
                      <td className="text-good">{c.won}</td>
                      <td className="text-bad">{c.lost}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
