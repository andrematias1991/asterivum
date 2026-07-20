import type { NextFunction, Response } from 'express';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { db } from './db.js';
import { config } from './config.js';
import type { AuthedRequest, AuthUser } from './types.js';

const SESSION_COOKIE = 'astralis_session';
const CSRF_COOKIE = 'astralis_csrf';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

function hash(value: string) { return createHmac('sha256', config.sessionSecret).update(value).digest('hex'); }
function databaseTime(date: Date) { return date.toISOString().slice(0, 19).replace('T', ' '); }
function cookieOptions(httpOnly: boolean) {
  return { httpOnly, secure:config.isProduction, sameSite:'lax' as const, path:'/', maxAge:SESSION_MS, domain:config.cookieDomain };
}

export async function createSession(res: Response, user: AuthUser, userAgent = '') {
  const token = randomBytes(32).toString('base64url');
  const csrf = randomBytes(32).toString('base64url');
  await db.execute('INSERT INTO sessions(token_hash,user_id,csrf_hash,expires_at,user_agent) VALUES(?,?,?,?,?)', [
    hash(token), user.id, hash(csrf), databaseTime(new Date(Date.now() + SESSION_MS)), userAgent.slice(0, 255),
  ]);
  res.cookie(SESSION_COOKIE, token, cookieOptions(true));
  res.cookie(CSRF_COOKIE, csrf, cookieOptions(false));
  return csrf;
}

export function csrfToken(req:AuthedRequest) { return req.cookies?.[CSRF_COOKIE] as string|undefined; }

export async function destroySession(req: AuthedRequest, res: Response) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) await db.execute('DELETE FROM sessions WHERE token_hash=?', [hash(token)]);
  const options = { secure:config.isProduction, sameSite:'lax' as const, path:'/', domain:config.cookieDomain };
  res.clearCookie(SESSION_COOKIE, { ...options, httpOnly:true });
  res.clearCookie(CSRF_COOKIE, { ...options, httpOnly:false });
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) return res.status(401).json({ error:'Authentication required' });
    const row = await db.first<AuthUser & { status:string; csrf_hash:string }>(`SELECT u.id,u.email,u.name,u.role,u.status,s.csrf_hash
      FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>CURRENT_TIMESTAMP`, [hash(token)]);
    if (!row || row.status !== 'ACTIVE') return res.status(401).json({ error:'Invalid or expired session' });
    req.user = { id:Number(row.id), email:row.email, name:row.name, role:row.role };
    req.sessionTokenHash = hash(token);
    req.csrfHash = row.csrf_hash;
    void db.execute('UPDATE sessions SET last_seen_at=CURRENT_TIMESTAMP WHERE token_hash=?', [req.sessionTokenHash]).catch(() => undefined);
    next();
  } catch (error) { next(error); }
}

export function requireCsrf(req: AuthedRequest, res: Response, next: NextFunction) {
  if (['GET','HEAD','OPTIONS'].includes(req.method)) return next();
  const header = req.get('x-csrf-token');
  const cookie = req.cookies?.[CSRF_COOKIE];
  if (!header || !cookie || !req.csrfHash) return res.status(403).json({ error:'Invalid security token; refresh and try again' });
  const expected = Buffer.from(req.csrfHash, 'hex');
  const actual = Buffer.from(hash(header), 'hex');
  if (header !== cookie || expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return res.status(403).json({ error:'Invalid security token; refresh and try again' });
  }
  next();
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== 'ADMIN') return res.status(403).json({ error:'Administrator access required' });
  next();
}
