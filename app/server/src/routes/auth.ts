import { Router, Request, Response as ExpressResponse } from 'express';
import { config } from '../config';
import { accessFromIamUser, createSession, destroySession, hasAnyLeadsAccess, hasPermission, requireAuth, LEADS_PERM, SESSION_COOKIE, SESSION_TTL_MS } from '../auth';

const router = Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  maxAge: SESSION_TTL_MS,
};

// Shared by /login and /sso: both end up with the same {token, user} shape
// from syncaxis-iam (a normal login there, or a handoff-code exchange here) -
// this is the one place that turns that into a Leads Tracker session.
function establishSession(data: any, res: ExpressResponse): void {
  const { perms, isFullAccess } = accessFromIamUser(data.user);
  if (!hasAnyLeadsAccess({ perms, isFullAccess })) {
    res.status(403).json({
      error: 'Sorry! You don\'t have access to this Portal. Please contact Administrator.',
    });
    return;
  }

  const sessionId = createSession({
    iamToken: data.token,
    userId: data.user.id,
    username: data.user.username,
    displayName: data.user.displayName,
    perms,
    isFullAccess,
  });

  res.cookie(SESSION_COOKIE, sessionId, COOKIE_OPTIONS);
  res.json({
    username: data.user.username,
    displayName: data.user.displayName,
    isAdmin: hasPermission({ perms, isFullAccess }, LEADS_PERM.ADMIN_MANAGE),
    perms,
    isFullAccess,
  });
}

// POST /api/auth/login - proxies to syncaxis-iam server-to-server (never
// from the browser), so this app never sees, stores, or validates a
// password itself. syncaxis-iam's account lockout, per-user credentials, and
// permission matrix (leads.* keys) are the single source of truth for who
// can sign in here at all, and what they can do once in.
router.post('/login', async (req: Request, res: ExpressResponse) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required.' });

  let iamRes: Response;
  try {
    iamRes = await fetch(`${config.iam.apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
  } catch (err) {
    console.error('syncaxis-iam unreachable during login:', err);
    return res.status(503).json({ error: 'Cannot reach the sign-in service right now. Please try again shortly.' });
  }

  const data: any = await iamRes.json().catch(() => ({}));
  if (!iamRes.ok) {
    // Relay syncaxis-iam's own message as-is (invalid credentials, locked account, etc).
    return res.status(iamRes.status).json({ error: data.error || 'Login failed.' });
  }

  establishSession(data, res);
});

// POST /api/auth/sso - true SSO: exchanges a short-lived, single-use code
// (minted by syncaxis-iam when the user clicks the "Inquiry Portal" tile on
// Company Portal, which itself just proxies the mint call) for a real login,
// server-to-server - so a user already signed in to the Portal never sees a
// second login screen here.
router.post('/sso', async (req: Request, res: ExpressResponse) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Missing sign-in code.' });

  let iamRes: Response;
  try {
    iamRes = await fetch(`${config.iam.apiUrl}/auth/sso/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
  } catch (err) {
    console.error('syncaxis-iam unreachable during SSO exchange:', err);
    return res.status(503).json({ error: 'Cannot reach the sign-in service right now. Please try again shortly.' });
  }

  const data: any = await iamRes.json().catch(() => ({}));
  if (!iamRes.ok) {
    return res.status(iamRes.status).json({ error: data.error || 'Sign-in link is no longer valid - please try again from the Portal.' });
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
    isAdmin: hasPermission(req.session!, LEADS_PERM.ADMIN_MANAGE),
    perms: req.session!.perms,
    isFullAccess: req.session!.isFullAccess,
  });
});

export default router;
