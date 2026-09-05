import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { config } from './config';

export const SESSION_COOKIE = 'syncaxis_session';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function sign(payload: string): string {
  return crypto.createHmac('sha256', config.auth.sessionSecret).update(payload).digest('hex');
}

export function createSessionToken(): string {
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = String(expires);
  return `${payload}.${sign(payload)}`;
}

export function isValidSessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  const expected = sign(payload);
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature);
  if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) return false;
  return Number(payload) > Date.now();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (isValidSessionToken(req.cookies?.[SESSION_COOKIE])) return next();
  res.status(401).json({ error: 'Not authenticated' });
}
