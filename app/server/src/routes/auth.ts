import { Router, Request, Response as ExpressResponse } from 'express';
import { config } from '../config';
import { accessFromPortalUser, createSession, destroySession, requireAuth, SESSION_COOKIE, SESSION_TTL_MS } from '../auth';

const router = Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  maxAge: SESSION_TTL_MS,
};

// Shared by /login and /sso: both end up with the same {token, user} shape
// from the Portal (a normal login there, or a handoff-code exchange here) -
// this is the one place that turns that into a Leads Tracker session.
function establishSession(data: any, res: ExpressResponse): void {
  const { hasAccess, hasAdminAccess } = accessFromPortalUser(data.user);
  if (!hasAccess) {
    res.status(403).json({
      error: 'Sorry! You don\'t have access to this Portal. Please contact Administrator.',
    });
    return;
  }

  const sessionId = createSession({
    portalToken: data.token,
    userId: data.user.id,
    username: data.user.username,
    displayName: data.user.displayName,
    hasAccess,
    hasAdminAccess,
  });

  res.cookie(SESSION_COOKIE, sessionId, COOKIE_OPTIONS);
  res.json({ username: data.user.username, displayName: data.user.displayName, isAdmin: hasAdminAccess });
}

// POST /api/auth/login - proxies to the Syncaxis Company Portal server-to-
// server (never from the browser), so this app never sees, stores, or
// validates a password itself. The Portal's account lockout, per-user
// credentials, and RBAC (Admin > Roles, "leads-tracker" application +
// "admin-leads-tracker" page permissions) are the single source of truth for
// who can sign in here at all, and who additionally gets admin access.
router.post('/login', async (req: Request, res: ExpressResponse) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required.' });

  let portalRes: Response;
  try {
    portalRes = await fetch(`${config.portal.apiUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
  } catch (err) {
    console.error('Portal unreachable during login:', err);
    return res.status(503).json({ error: 'Cannot reach the Syncaxis Company Portal right now. Please try again shortly.' });
  }

  const data: any = await portalRes.json().catch(() => ({}));
  if (!portalRes.ok) {
    // Relay the Portal's own message as-is (invalid credentials, locked account, etc).
    return res.status(portalRes.status).json({ error: data.error || 'Login failed.' });
  }

  establishSession(data, res);
});

// POST /api/auth/sso - true SSO: exchanges a short-lived, single-use code
// (minted by the Portal when the user clicks the "Leads Tracker" tile there)
// for a real login, server-to-server - so a user already signed in to the
// Portal never sees a second login screen here.
router.post('/sso', async (req: Request, res: ExpressResponse) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Missing sign-in code.' });

  let portalRes: Response;
  try {
    portalRes = await fetch(`${config.portal.apiUrl}/api/auth/sso/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
  } catch (err) {
    console.error('Portal unreachable during SSO exchange:', err);
    return res.status(503).json({ error: 'Cannot reach the Syncaxis Company Portal right now. Please try again shortly.' });
  }

  const data: any = await portalRes.json().catch(() => ({}));
  if (!portalRes.ok) {
    return res.status(portalRes.status).json({ error: data.error || 'Sign-in link is no longer valid - please try again from the Portal.' });
  }

  establishSession(data, res);
});

router.post('/logout', (req: Request, res: ExpressResponse) => {
  destroySession(req.cookies?.[SESSION_COOKIE]);
  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req: Request, res: ExpressResponse) => {
  res.json({
    username: req.session!.username,
    displayName: req.session!.displayName,
    isAdmin: req.session!.hasAdminAccess,
  });
});

export default router;
