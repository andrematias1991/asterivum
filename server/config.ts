import { z } from 'zod';

const booleanValue = z.string().optional().transform(value => value === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z.string().url().optional(),
  DATABASE_PATH: z.string().optional(),
  DATABASE_SSL: booleanValue,
  SESSION_SECRET: z.string().min(32).optional(),
  APP_ORIGIN: z.url().optional(),
  COOKIE_DOMAIN: z.string().regex(/^\.?[a-z0-9.-]+$/i).optional(),
  ALLOW_REGISTRATION: booleanValue,
  ADMIN_EMAIL: z.email().optional(),
  ADMIN_INITIAL_PASSWORD: z.string().min(14).optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.issues.map(issue => issue.path.join('.') + ': ' + issue.message).join('; ')}`);
}

if (parsed.data.NODE_ENV === 'production') {
  if (!parsed.data.DATABASE_URL?.startsWith('mysql')) throw new Error('DATABASE_URL must be a MySQL connection URL in production');
  if (!parsed.data.SESSION_SECRET) throw new Error('SESSION_SECRET (at least 32 characters) is required in production');
  if (!parsed.data.APP_ORIGIN?.startsWith('https://')) throw new Error('APP_ORIGIN must be the HTTPS frontend origin in production');
  if (Boolean(parsed.data.ADMIN_EMAIL) !== Boolean(parsed.data.ADMIN_INITIAL_PASSWORD)) {
    throw new Error('ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD must be supplied together');
  }
}

export const config = {
  ...parsed.data,
  isProduction: parsed.data.NODE_ENV === 'production',
  sessionSecret: parsed.data.SESSION_SECRET || 'development-only-session-secret-32-characters',
  registrationEnabled: parsed.data.ALLOW_REGISTRATION || parsed.data.NODE_ENV !== 'production',
  appOrigin: parsed.data.APP_ORIGIN || 'http://localhost:5173',
  cookieDomain: parsed.data.COOKIE_DOMAIN,
};
