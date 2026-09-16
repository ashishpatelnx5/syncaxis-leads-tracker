import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchPipeline, advanceLeadStage } from '../api';
import type { PipelineLead, PipelineStage } from '../types';
import { PIPELINE_STAGES } from '../types';
import { PriorityBadge } from './StatusBadge';
import { formatInr } from '../utils/format';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';
import { useAuth } from '../auth/AuthContext';
import { LEADS_PERM } from '../permissions';

const STAGE_LABELS: Record<(typeof PIPELINE_STAGES)[number], string> = {
  Inquiry: 'Inquiry',
  Discovery: 'Discovery',
  Quotation: 'Quotation',
  SalesOrder: 'Sales Order',
};

const TERMINAL_STATUSES = ['Won', 'Lost', 'Not Relevant'];
const TODAY = new Date().toISOString().slice(0, 10);

function isOverdue(lead: PipelineLead): boolean {
  return !!lead.nextFollowUpDate && lead.nextFollowUpDate < TODAY && !TERMINAL_STATUSES.includes(lead.followUpStatus);
}

function daysBetween(startIso: string, endMs: number): number {
  return Math.max(0, Math.floor((endMs - new Date(startIso).getTime()) / 86400000));
}

// How many days a lead spent in each stage it has already passed through
// (from one history entry to the next), keyed by stage. The current/ongoing
// stage isn't included here - it's rendered separately as "so far".
function stageDurations(lead: PipelineLead): Partial<Record<PipelineStage, number>> {
  const result: Partial<Record<PipelineStage, number>> = {};
  const history = lead.stageHistory;
  for (let i = 0; i < history.length - 1; i++) {
    result[history[i].stage] = daysBetween(history[i].enteredAt, new Date(history[i + 1].enteredAt).getTime());
  }
  return result;
}

function currentStageEnteredAt(lead: PipelineLead): string | null {
  return lead.stageHistory.length ? lead.stageHistory[lead.stageHistory.length - 1].enteredAt : null;
}

function LeadPipelineCard({ lead, onAdvance }: { lead: PipelineLead; onAdvance: (id: number) => Promise<string | null> }) {
  const navigate = useNavigate();
  const { can } = useAuth();
  const canAdvance = can(LEADS_PERM.LEADS_UPDATE);
  const [advancing, setAdvancing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stageIndex = (PIPELINE_STAGES as readonly string[]).indexOf(lead.stage);
  const isClosed = lead.stage === 'Closed';
  const durations = stageDurations(lead);
  const enteredCurrentAt = currentStageEnteredAt(lead);
  const daysInCurrentStage = enteredCurrentAt ? daysBetween(enteredCurrentAt, Date.now()) : null;

  async function handleAdvanceClick(e: React.MouseEvent, targetIndex: number) {
    e.stopPropagation();
    if (advancing || targetIndex !== stageIndex + 1) return;
    setAdvancing(true);
    setError(null);
    const message = await onAdvance(lead.id);
    setError(message);
    setAdvancing(false);
  }

  return (
    <div className="lead-pipeline-card" onClick={() => navigate(`/leads/${lead.id}`)}>
      <div className="lead-card-top">
        <span className="lead-card-company">{lead.customer.companyName}</span>
        <PriorityBadge priority={lead.priority} />
      </div>
      <div className="lead-card-meta">{lead.inquiryNumber || '-'}</div>
      {lead.leadValue !== null && <div className="lead-card-value">{formatInr(lead.leadValue)}</div>}

      {isClosed ? (
        <div className={`lead-card-closed lead-card-closed-${lead.followUpStatus === 'Lost' ? 'lost' : 'not-relevant'}`}>
          Closed — {lead.followUpStatus}
        </div>
      ) : (
        <div className="lead-stepper">
          {PIPELINE_STAGES.map((stage, i) => {
            const state = i < stageIndex ? 'done' : i === stageIndex ? 'current' : 'future';
            const isNextClickable = i === stageIndex + 1 && canAdvance;
            return (
              <div className="lead-stepper-step" key={stage}>
                <div className="lead-stepper-marker-row">
                  <span
                    className={`lead-stepper-dot lead-stepper-dot-${state}${isNextClickable ? ' clickable' : ''}`}
                    onClick={isNextClickable ? (e) => handleAdvanceClick(e, i) : undefined}
                    title={isNextClickable ? `Advance to ${STAGE_LABELS[stage]}` : STAGE_LABELS[stage]}
                  />
                  {i < PIPELINE_STAGES.length - 1 && (
                    <span className={`lead-stepper-line lead-stepper-line-${i < stageIndex ? 'done' : 'future'}`}>
                      {durations[stage] !== undefined && <span className="lead-stepper-days">{durations[stage]}d</span>}
                    </span>
                  )}
                </div>
                <span className={`lead-stepper-label${state === 'current' ? ' current' : ''}`}>{STAGE_LABELS[stage]}</span>
              </div>
            );
          })}
        </div>
      )}

      {!isClosed && (
        <div className="lead-card-stage-status">
          Currently: <strong>{STAGE_LABELS[PIPELINE_STAGES[stageIndex]]}</strong>
          {daysInCurrentStage !== null && ` — ${daysInCurrentStage}d in this stage so far`}
        </div>
      )}

      {advancing && <div className="hint-text">Advancing...</div>}
      {error && <div className="lead-card-error">{error}</div>}

      <div className="lead-card-bottom">
        <span className={`lead-card-followup${isOverdue(lead) ? ' text-bad' : ''}`}>
          {lead.nextFollowUpDate ? `Next: ${lead.nextFollowUpDate}` : 'No follow-up set'}
        </span>
        {lead.inquiryAssignedTo && <span className="lead-card-assignee">{lead.inquiryAssignedTo}</span>}
      </div>
    </div>
  );
}

export function LeadsBoard() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [leads, setLeads] = useState<PipelineLead[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load(query: string) {
    setLoading(true);
    setError(null);
    fetchPipeline(query)
      // The API doesn't sort server-side (sorting the wide row set was
      // pathologically slow on some SQL Server setups) - sort the small
      // result set here instead, most recently updated first.
      .then((items) => setLeads([...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    load(q);
  }

  function scroll(direction: 1 | -1) {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' });
  }

  // Returns an error message on failure (shown on the card), or null on success.
  async function handleAdvance(id: number): Promise<string | null> {
    try {
      const updated = await advanceLeadStage(id);
      setLeads((prev) => prev.map((l) => (l.id === id ? updated : l)));
      return null;
    } catch (err: any) {
      return err.message;
    }
  }

  return (
    <div>
      <form className="filter-bar" onSubmit={handleSearchSubmit}>
        <input
          type="text"
          placeholder="Search company, contact, email, phone, inquiry #..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="search-input"
        />
        <button type="submit" className="btn">Search</button>
      </form>
      <p className="hint-text">Click the next stage's dot on a card to advance it. Quotations are generated in SourcePro ERP - advancing here just updates the status, not the ERP reference.</p>

      {error && <div className="alert alert-error">{error}</div>}
      {loading && <p className="hint-text">Loading...</p>}
      {!loading && !leads.length && <p className="empty-state">No leads found.</p>}

      {!loading && !!leads.length && (
        <div className="lead-carousel">
          <button type="button" className="attachment-carousel-arrow attachment-carousel-arrow-left lead-carousel-arrow" onClick={() => scroll(-1)} aria-label="Scroll left">
            <ChevronLeftIcon />
          </button>

          <div className="lead-carousel-track" ref={trackRef}>
            {leads.map((lead) => (
              <LeadPipelineCard key={lead.id} lead={lead} onAdvance={handleAdvance} />
            ))}
          </div>

          <button type="button" className="attachment-carousel-arrow attachment-carousel-arrow-right lead-carousel-arrow" onClick={() => scroll(1)} aria-label="Scroll right">
            <ChevronRightIcon />
          </button>
        </div>
      )}
    </div>
  );
}
