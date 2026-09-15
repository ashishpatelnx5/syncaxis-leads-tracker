import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { config } from './config';

export const SESSION_COOKIE = 'syncaxis_session';
// Hard cap on a session's lifetime - matches the Portal's own JWT expiry
// (JWT_EXPIRES_IN, default 8h there). Independent of the re-verify interval
// below: this is the outer bound even if the Portal is unreachable the whole
// time and every re-verify attempt is treated as a grace-period pass.
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const REVERIFY_INTERVAL_MS = 5 * 60 * 1000;

export interface SessionRecord {
  portalToken: string;
  userId: number;
  username: string;
  displayName: string;
  hasAccess: boolean;
  hasAdminAccess: boolean;
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

// In-memory only - same as the session this replaces, nothing persists
// across a restart, so everyone just signs back in (a few seconds, since the
// Portal itself is the one doing the real authentication work).
const sessions = new Map<string, SessionRecord>();

export function createSession(data: Omit<SessionRecord, 'lastVerifiedAt' | 'expiresAt'>): string {
  const id = crypto.randomBytes(32).toString('hex');
  sessions.set(id, { ...data, lastVerifiedAt: Date.now(), expiresAt: Date.now() + SESSION_TTL_MS });
  return id;
}

export function destroySession(sessionId: string | undefined): void {
  if (sessionId) sessions.delete(sessionId);
}

export function accessFromPortalUser(user: any): { hasAccess: boolean; hasAdminAccess: boolean } {
  const applications: string[] = user?.permissions?.applications || [];
  const pages: string[] = user?.permissions?.pages || [];
  return {
    hasAccess: !!user?.isAdmin || applications.includes('leads-tracker'),
    hasAdminAccess: !!user?.isAdmin || pages.includes('admin-leads-tracker'),
  };
}

// Re-checks a session against the Portal, no more often than
// REVERIFY_INTERVAL_MS - so an admin revoking access in the Portal takes
// effect within a few minutes, not just at the user's next login, without
// hitting the Portal on every single request. If the Portal is unreachable
// (network blip, restart), the cached session is trusted until its hard
// expiry rather than logging everyone out over it; an explicit "session
// invalid" or "access revoked" response from the Portal ends it immediately.
async function reverifyWithPortal(session: SessionRecord): Promise<'ok' | 'revoked'> {
  try {
    const res = await fetch(`${config.portal.apiUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${session.portalToken}` },
    });
    if (res.status === 401) return 'revoked';
    if (!res.ok) return 'ok'; // Portal hiccup (5xx) - keep the cached session

    const body: any = await res.json();
    const { hasAccess, hasAdminAccess } = accessFromPortalUser(body.user);
    if (!hasAccess) return 'revoked';

    session.hasAccess = hasAccess;
    session.hasAdminAccess = hasAdminAccess;
    session.displayName = body.user?.displayName || session.displayName;
    session.lastVerifiedAt = Date.now();
    return 'ok';
  } catch (err) {
    console.error('Portal re-verification failed - keeping cached session until it expires:', err);
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
    const outcome = await reverifyWithPortal(session);
    if (outcome === 'revoked') {
      destroySession(sessionId);
      return res.status(401).json({ error: 'Your session is no longer valid - please sign in again.' });
    }
  }

  req.session = session;
  next();
}

// For routes only Leads Tracker "admins" (Portal role granting the
// admin-leads-tracker page permission, or full Portal admin) may use -
// currently the delete endpoints under Admin > Leads/Customers.
export function requireLeadsTrackerAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.hasAdminAccess) return res.status(403).json({ error: 'Admin access required.' });
  next();
}
