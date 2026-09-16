import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { config } from './config';

export const SESSION_COOKIE = 'syncaxis_session';
// Hard cap on a session's lifetime - matches syncaxis-iam's own JWT expiry.
// Independent of the re-verify interval below: this is the outer bound even
// if syncaxis-iam is unreachable the whole time and every re-verify attempt
// is treated as a grace-period pass.
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const REVERIFY_INTERVAL_MS = 5 * 60 * 1000;

export interface SessionRecord {
  iamToken: string;
  userId: number;
  username: string;
  displayName: string;
  perms: string[];
  isFullAccess: boolean;
  lastVerifiedAt: number;
  expiresAt: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      session?: SessionRecord;
    }
  }
}

// In-memory only - nothing persists across a restart, so everyone just signs
// back in (a few seconds, since syncaxis-iam itself is the one doing the
// real authentication work).
const sessions = new Map<string, SessionRecord>();

export function createSession(data: Omit<SessionRecord, 'lastVerifiedAt' | 'expiresAt'>): string {
  const id = crypto.randomBytes(32).toString('hex');
  sessions.set(id, { ...data, lastVerifiedAt: Date.now(), expiresAt: Date.now() + SESSION_TTL_MS });
  return id;
}

export function destroySession(sessionId: string | undefined): void {
  if (sessionId) sessions.delete(sessionId);
}

// The name written into attribution fields (LeadGeneratedBy, AddedBy,
// UpdatedBy, FollowUpBy, UploadedBy) when a user creates/edits a record.
// Falls back to username on the rare chance the identity provider ever sends
// a blank displayName, so attribution never silently writes an empty string.
export function actorName(session: SessionRecord): string {
  return session.displayName || session.username;
}

export function accessFromIamUser(user: any): { perms: string[]; isFullAccess: boolean } {
  return { perms: user?.perms || [], isFullAccess: !!user?.isFullAccess };
}

// Every leads.* permission key this app checks against, in one place - a
// typo in a route's requirePermission(...) call becomes a compile error
// (unknown property) instead of a silent runtime permission gap.
export const LEADS_PERM = {
  LEADS_VIEW: 'leads.leads.view',
  LEADS_CREATE: 'leads.leads.create',
  LEADS_UPDATE: 'leads.leads.update',
  LEADS_DELETE: 'leads.leads.delete',
  LEADS_EXPORT: 'leads.leads.export',
  CUSTOMERS_VIEW: 'leads.customers.view',
  CUSTOMERS_CREATE: 'leads.customers.create',
  CUSTOMERS_UPDATE: 'leads.customers.update',
  CUSTOMERS_DELETE: 'leads.customers.delete',
  ADMIN_MANAGE: 'leads.admin.manage',
} as const;

// Takes just the two fields it needs (not a full SessionRecord), same as
// hasAnyLeadsAccess below - so it can be called right after a login/SSO
// exchange too, before a session object exists.
export function hasPermission(access: { perms: string[]; isFullAccess: boolean }, key: string): boolean {
  return access.isFullAccess || access.perms.includes(key);
}

// "Can this user open Leads Tracker at all" - replaces the old Portal
// application-flag check - is now "do they hold any leads.* permission".
// Takes just the two fields it needs (not a full SessionRecord) so it can be
// called before a session exists yet, e.g. right after a login/SSO exchange.
export function hasAnyLeadsAccess(access: { perms: string[]; isFullAccess: boolean }): boolean {
  return access.isFullAccess || access.perms.some((p) => p.startsWith('leads.'));
}

export function requirePermission(key: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session || !hasPermission(req.session, key)) {
      return res.status(403).json({ error: 'You do not have access to this.' });
    }
    next();
  };
}

// Re-checks a session against syncaxis-iam, no more often than
// REVERIFY_INTERVAL_MS - so a permission grant/revoke or deactivation in
// syncaxis-iam takes effect within a few minutes, not just at the user's
// next login, without hitting syncaxis-iam on every single request. If
// syncaxis-iam is unreachable (network blip, restart), the cached session is
// trusted until its hard expiry rather than logging everyone out over it; an
// explicit "session invalid" or "access revoked" response ends it immediately.
async function reverifyWithIam(session: SessionRecord): Promise<'ok' | 'revoked'> {
  try {
    const res = await fetch(`${config.iam.apiUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${session.iamToken}` },
    });
    if (res.status === 401) return 'revoked';
    if (!res.ok) return 'ok'; // syncaxis-iam hiccup (5xx) - keep the cached session

    const body: any = await res.json();
    const { perms, isFullAccess } = accessFromIamUser(body.user);
    if (!hasAnyLeadsAccess({ perms, isFullAccess })) return 'revoked';

    session.perms = perms;
    session.isFullAccess = isFullAccess;
    session.displayName = body.user?.displayName || session.displayName;
    session.lastVerifiedAt = Date.now();
    return 'ok';
  } catch (err) {
    console.error('syncaxis-iam re-verification failed - keeping cached session until it expires:', err);
    return 'ok';
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const sessionId = req.cookies?.[SESSION_COOKIE];
  const session = sessionId ? sessions.get(sessionId) : undefined;
  if (!session || session.expiresAt < Date.now()) {
    destroySession(sessionId);
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (Date.now() - session.lastVerifiedAt > REVERIFY_INTERVAL_MS) {
    const outcome = await reverifyWithIam(session);
    if (outcome === 'revoked') {
      destroySession(sessionId);
      return res.status(401).json({ error: 'Your session is no longer valid - please sign in again.' });
    }
  }

  req.session = session;
  next();
}
