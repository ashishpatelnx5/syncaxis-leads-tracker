import { Router, Request, Response } from 'express';
import { config } from '../config';
import { createSessionToken, isValidSessionToken, SESSION_COOKIE, SESSION_TTL_MS } from '../auth';

const router = Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  maxAge: SESSION_TTL_MS,
};

router.post('/login', (req: Request, res: Response) => {
  const { username, password } = req.body || {};
  if (username === config.auth.username && password === config.auth.password) {
    res.cookie(SESSION_COOKIE, createSessionToken(), COOKIE_OPTIONS);
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Invalid username or password' });
});

router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
});

router.get('/me', (req: Request, res: Response) => {
  if (isValidSessionToken(req.cookies?.[SESSION_COOKIE])) return res.json({ authenticated: true });
  res.status(401).json({ authenticated: false });
});

export default router;
