import { Request } from 'express';
import { getPool, sql } from './db';

interface LogAuditParams {
  userId: number | null;
  username: string | null;
  displayName: string | null;
  action: string;
  entityType?: string | null;
  entityId?: number | null;
  success?: boolean;
  details?: unknown;
  ipAddress?: string | null;
}

// Pulls the "who" half of an audit entry from the current request - the
// logged-in session if there is one, falling back to nulls for pre-session
// events (a failed login attempt has no session yet).
export function auditActor(req: Request): Pick<LogAuditParams, 'userId' | 'username' | 'displayName' | 'ipAddress'> {
  return {
    userId: req.session?.userId ?? null,
    username: req.session?.username ?? null,
    displayName: req.session?.displayName ?? null,
    ipAddress: req.ip ?? null,
  };
}

// Writes one audit log row. Deliberately swallows its own errors - a failure
// to record an audit entry must never break the real request it's
// describing, so this logs to the console instead of throwing or rejecting.
export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    const pool = await getPool();
    await pool
      .request()
      .input('userId', sql.Int, params.userId ?? null)
      .input('username', sql.NVarChar, params.username ?? null)
      .input('displayName', sql.NVarChar, params.displayName ?? null)
      .input('action', sql.NVarChar, params.action)
      .input('entityType', sql.NVarChar, params.entityType ?? null)
      .input('entityId', sql.Int, params.entityId ?? null)
      .input('success', sql.Bit, params.success === false ? 0 : 1)
      .input('details', sql.NVarChar(sql.MAX), params.details !== undefined ? JSON.stringify(params.details) : null)
      .input('ipAddress', sql.NVarChar, params.ipAddress ?? null)
      .query(`
        INSERT INTO dbo.AuditLog (UserId, Username, DisplayName, Action, EntityType, EntityId, Success, Details, IpAddress)
        VALUES (@userId, @username, @displayName, @action, @entityType, @entityId, @success, @details, @ipAddress)
      `);
  } catch (err) {
    console.error('Failed to write audit log entry:', err);
  }
}

// Field-level before/after diff between two flat DB rows (PascalCase column
// names), restricted to `fields` so unrelated columns (Id, CreatedAt, an
// UpdatedAt stamp that always changes) never show up as noise. Dates are
// compared as ISO strings so e.g. a Date object vs. its own ISO string for
// the same instant doesn't register as a spurious change.
export function diffFields(before: Record<string, any>, after: Record<string, any>, fields: string[]): Record<string, { old: unknown; new: unknown }> {
  const changes: Record<string, { old: unknown; new: unknown }> = {};
  for (const field of fields) {
    const oldValue = before[field] ?? null;
    const newValue = after[field] ?? null;
    const oldCmp = oldValue instanceof Date ? oldValue.toISOString() : oldValue;
    const newCmp = newValue instanceof Date ? newValue.toISOString() : newValue;
    if (oldCmp !== newCmp) {
      changes[field] = { old: oldValue, new: newValue };
    }
  }
  return changes;
}
