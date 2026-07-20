import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db, transaction } from './db.js';
import { createSession, destroySession, requireAdmin, requireAuth, requireCsrf } from './auth.js';
import { config } from './config.js';
import { astrocartography, calculateChart, calculateSynastry, ephemeris, forecast, transitReport, TRANSIT_ASPECT_NAMES, utcOffsetAtLocalTime } from './astro.js';
import { calculateNatalAnalysis } from './natalAnalysis.js';
import type { AuthedRequest, AuthUser, BirthData } from './types.js';

export const api = Router();

const credentials = z.object({ email:z.email(), password:z.string().min(12).max(128), name:z.string().min(2).max(80).optional() });
const profileSchema = z.object({
  name:z.string().min(1).max(100), birthDate:z.iso.date(), birthTime:z.string().regex(/^\d{2}:\d{2}$/),
  place:z.string().min(2).max(150), latitude:z.number().min(-90).max(90), longitude:z.number().min(-180).max(180),
  timezone:z.number().min(-14).max(14), timezoneId:z.string().trim().min(1).max(80).nullable().optional().default(null), houseSystem:z.enum(['PLACIDUS','WHOLE_SIGN','EQUAL']).default('PLACIDUS'),
  zodiac:z.enum(['TROPICAL','SIDEREAL']).default('TROPICAL'), notes:z.string().max(4000).default(''), isPrimary:z.boolean().default(false),
});
const previewChartSchema = z.object({
  profile:profileSchema,
  mode:z.enum(['NATAL','TRANSIT']).default('NATAL'),
  targetDate:z.iso.datetime().optional(),
});

const locationQuery = z.object({ q:z.string().trim().min(3).max(100) });
type GeocodingResult = {
  id:number; name:string; latitude:number; longitude:number; country?:string;
  admin1?:string; timezone?:string;
};
const locationCache = new Map<string, { expires:number; results:unknown[] }>();

function safeUser(row: Record<string, unknown>) {
  return { id:row.id, email:row.email, name:row.name, role:row.role, status:row.status, createdAt:row.created_at };
}

api.get('/health', async (_req,res) => {
  await db.first('SELECT 1 AS ok');
  res.json({ status:'ok', service:'asterivum-api', time:new Date().toISOString() });
});
api.get('/auth/config', (_req,res) => res.json({ registrationEnabled:config.registrationEnabled }));

api.get('/locations/search', async (req,res) => {
  const parsed = locationQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error:'Enter at least three characters' });
  const key = parsed.data.q.toLocaleLowerCase();
  const cached = locationCache.get(key);
  if (cached && cached.expires > Date.now()) return res.json({ results:cached.results });

  try {
    const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
    url.searchParams.set('name', parsed.data.q);
    url.searchParams.set('count', '7');
    url.searchParams.set('language', 'en');
    url.searchParams.set('format', 'json');
    const response = await fetch(url, { signal:AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`Geocoder returned ${response.status}`);
    const payload = await response.json() as { results?:GeocodingResult[] };
    const results = (payload.results || []).map(location => ({
      id:location.id,
      name:location.name,
      label:[location.name, location.admin1, location.country].filter((part, index, all) => part && all.indexOf(part) === index).join(', '),
      latitude:location.latitude,
      longitude:location.longitude,
      timezone:location.timezone || null,
    }));
    if (locationCache.size >= 200) locationCache.delete(locationCache.keys().next().value!);
    locationCache.set(key, { expires:Date.now() + 24 * 60 * 60 * 1000, results });
    res.json({ results });
  } catch (error) {
    console.error('Location search failed', error);
    res.status(502).json({ error:'Location search is temporarily unavailable' });
  }
});

api.post('/auth/register', async (req,res) => {
  if (!config.registrationEnabled) return res.status(403).json({ error:'New account registration is currently closed' });
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success || !parsed.data.name) return res.status(400).json({ error:'Enter a valid name, email and password (12+ characters)' });
  const email = parsed.data.email.toLowerCase();
  if (await db.first('SELECT id FROM users WHERE email=?', [email])) return res.status(409).json({ error:'An account already exists for this email' });
  const hash = await bcrypt.hash(parsed.data.password, 12);
  let result;
  try { result = await db.execute('INSERT INTO users(email,password_hash,name) VALUES(?,?,?)', [email,hash,parsed.data.name]); }
  catch (error) {
    const code = (error as {code?:string}).code;
    if (code === 'ER_DUP_ENTRY' || code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error:'An account already exists for this email' });
    throw error;
  }
  const user: AuthUser = { id:result.insertId, email, name:parsed.data.name, role:'USER' };
  await createSession(res, user, req.get('user-agent'));
  res.status(201).json({ user });
});

api.post('/auth/login', async (req,res) => {
  const parsed = credentials.omit({ name:true }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error:'Enter a valid email and password' });
  const row = await db.first<Record<string,unknown>>('SELECT * FROM users WHERE email=?', [parsed.data.email.toLowerCase()]);
  if (!row || row.status !== 'ACTIVE' || !await bcrypt.compare(parsed.data.password, String(row.password_hash))) return res.status(401).json({ error:'Email or password is incorrect' });
  const user = safeUser(row) as AuthUser;
  await createSession(res, user, req.get('user-agent'));
  res.json({ user });
});

api.get('/me', requireAuth, (req:AuthedRequest,res) => res.json({ user:req.user }));
api.post('/auth/logout', requireAuth, requireCsrf, async (req:AuthedRequest,res) => { await destroySession(req,res); res.status(204).end(); });

api.get('/profiles', requireAuth, async (req:AuthedRequest,res) => {
  const rows = await db.query(`SELECT id,name,birth_date AS birthDate,birth_time AS birthTime,place,latitude,longitude,timezone,timezone_id AS timezoneId,
    house_system AS houseSystem,zodiac,notes,is_primary AS isPrimary,created_at AS createdAt FROM birth_profiles WHERE user_id=? ORDER BY is_primary DESC,updated_at DESC`, [req.user!.id]);
  res.json({ profiles:rows });
});

api.post('/profiles', requireAuth, requireCsrf, async (req:AuthedRequest,res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error:'Birth profile is incomplete or invalid', details:z.flattenError(parsed.error) });
  const p = parsed.data;
  const result = await transaction(async tx => {
    if (p.isPrimary) await tx.execute('UPDATE birth_profiles SET is_primary=0 WHERE user_id=?', [req.user!.id]);
    return tx.execute(`INSERT INTO birth_profiles(user_id,name,birth_date,birth_time,place,latitude,longitude,timezone,timezone_id,house_system,zodiac,notes,is_primary)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`, [req.user!.id,p.name,p.birthDate,p.birthTime,p.place,p.latitude,p.longitude,p.timezone,p.timezoneId,p.houseSystem,p.zodiac,p.notes,p.isPrimary?1:0]);
  });
  res.status(201).json({ id:result.insertId });
});

api.put('/profiles/:id', requireAuth, requireCsrf, async (req:AuthedRequest,res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error:'Birth profile is incomplete or invalid' });
  const p = parsed.data, id = Number(req.params.id);
  const result = await transaction(async tx => {
    if (!await tx.first('SELECT id FROM birth_profiles WHERE id=? AND user_id=?', [id,req.user!.id])) return { insertId:0, affectedRows:0 };
    if (p.isPrimary) await tx.execute('UPDATE birth_profiles SET is_primary=0 WHERE user_id=?', [req.user!.id]);
    return tx.execute(`UPDATE birth_profiles SET name=?,birth_date=?,birth_time=?,place=?,latitude=?,longitude=?,timezone=?,timezone_id=?,house_system=?,zodiac=?,notes=?,is_primary=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?`,
      [p.name,p.birthDate,p.birthTime,p.place,p.latitude,p.longitude,p.timezone,p.timezoneId,p.houseSystem,p.zodiac,p.notes,p.isPrimary?1:0,id,req.user!.id]);
  });
  if (!result.affectedRows) return res.status(404).json({ error:'Profile not found' });
  res.json({ ok:true });
});

api.delete('/profiles/:id', requireAuth, requireCsrf, async (req:AuthedRequest,res) => {
  const result = await db.execute('DELETE FROM birth_profiles WHERE id=? AND user_id=?', [Number(req.params.id),req.user!.id]);
  if (!result.affectedRows) return res.status(404).json({ error:'Profile not found' });
  res.json({ ok:true });
});

async function ownedProfile(req: AuthedRequest) {
  return db.first<BirthData>(`SELECT name,birth_date AS birthDate,birth_time AS birthTime,place,latitude,longitude,timezone,timezone_id AS timezoneId,house_system AS houseSystem,zodiac
    FROM birth_profiles WHERE id=? AND user_id=?`, [Number(req.params.id),req.user!.id]);
}

async function profileById(id:number, userId:number) {
  return db.first<BirthData>(`SELECT name,birth_date AS birthDate,birth_time AS birthTime,place,latitude,longitude,timezone,timezone_id AS timezoneId,house_system AS houseSystem,zodiac
    FROM birth_profiles WHERE id=? AND user_id=?`, [id,userId]);
}

api.post('/locations/offset', (req,res) => {
  const parsed = z.object({
    date:z.iso.date(), time:z.string().regex(/^\d{2}:\d{2}$/), timezoneId:z.string().trim().min(1).max(80),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error:'Invalid date or timezone' });
  try {
    res.json({ offset:utcOffsetAtLocalTime(parsed.data.date, parsed.data.time, parsed.data.timezoneId) });
  } catch {
    res.status(400).json({ error:'Unknown timezone' });
  }
});

api.post('/charts/preview', (req,res) => {
  const parsed = previewChartSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error:'Birth profile is incomplete or invalid', details:z.flattenError(parsed.error) });
  const target = parsed.data.targetDate ? new Date(parsed.data.targetDate) : undefined;
  res.json({ chart:calculateChart(parsed.data.profile,parsed.data.mode,target) });
});

api.get('/charts/:id', requireAuth, async (req:AuthedRequest,res) => {
  const profile = await ownedProfile(req);
  if (!profile) return res.status(404).json({ error:'Profile not found' });
  const mode = z.enum(['NATAL','TRANSIT','PROGRESSION']).catch('NATAL').parse(req.query.mode);
  const target = req.query.date ? new Date(String(req.query.date)) : undefined;
  res.json({ chart:calculateChart(profile,mode,target) });
});

api.get('/natal-analysis/:id', requireAuth, async (req:AuthedRequest,res) => {
  const profile = await ownedProfile(req);
  if (!profile) return res.status(404).json({ error:'Profile not found' });
  res.json({ analysis:calculateNatalAnalysis(profile,req.get('x-app-language') === 'pt-PT' ? 'pt-PT':'en') });
});

api.get('/synastry', requireAuth, async (req:AuthedRequest,res) => {
  const firstId = Number(req.query.firstId), secondId = Number(req.query.secondId);
  if (!Number.isInteger(firstId) || !Number.isInteger(secondId) || firstId === secondId) return res.status(400).json({ error:'Choose two different birth profiles' });
  const [first, second] = await Promise.all([profileById(firstId,req.user!.id), profileById(secondId,req.user!.id)]);
  if (!first || !second) return res.status(404).json({ error:'Profile not found' });
  res.json(calculateSynastry(first,second,req.get('x-app-language') === 'pt-PT' ? 'pt-PT':'en'));
});

api.get('/astrocartography/:id', requireAuth, async (req:AuthedRequest,res) => {
  const profile = await ownedProfile(req);
  if (!profile) return res.status(404).json({ error:'Profile not found' });
  res.json(astrocartography(profile));
});

api.get('/ephemeris', (req,res) => {
  const start = new Date(String(req.query.start || new Date().toISOString()));
  const end = new Date(String(req.query.end || new Date(start.getTime()+30*86400000).toISOString()));
  const step = Math.max(1,Math.min(31,Number(req.query.step)||1));
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start || end.getTime()-start.getTime()>3*366*86400000) return res.status(400).json({ error:'Choose a valid range of up to three years' });
  res.json({ rows:ephemeris(start,end,step,req.query.zodiac === 'SIDEREAL' ? 'SIDEREAL':'TROPICAL') });
});

api.get('/forecasts/:id', requireAuth, async (req:AuthedRequest,res) => {
  const profile = await ownedProfile(req);
  if (!profile) return res.status(404).json({ error:'Profile not found' });
  const start = new Date(String(req.query.start || new Date().toISOString()));
  const end = new Date(String(req.query.end || new Date(start.getTime()+365*86400000).toISOString()));
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start || end.getTime()-start.getTime()>3*366*86400000) return res.status(400).json({ error:'Choose a valid range of up to three years' });
  res.json({ events:forecast(profile,start,end,Number(req.query.step)||1) });
});

api.get('/transit-reports/:id', requireAuth, async (req:AuthedRequest,res) => {
  const profile = await ownedProfile(req);
  if (!profile) return res.status(404).json({ error:'Profile not found' });
  const start = new Date(String(req.query.start || new Date().toISOString()));
  const end = new Date(String(req.query.end || new Date(start.getTime()+365*86400000).toISOString()));
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start || end.getTime()-start.getTime()>3*366*86400000) return res.status(400).json({ error:'Choose a valid range of up to three years' });
  const scope = req.query.scope === 'ALL' ? 'ALL' : 'SLOW';
  const orb = Math.max(0.5, Math.min(5, Number(req.query.orb) || 3));
  const requested = String(req.query.aspects || '').split(',').filter(Boolean);
  const aspects = requested.filter(name => TRANSIT_ASPECT_NAMES.includes(name));
  res.json({ events:transitReport(profile,start,end,{ scope,orb,aspects,language:req.get('x-app-language') === 'pt-PT' ? 'pt-PT':'en' }), meta:{ scope,orb,start:start.toISOString(),end:end.toISOString() } });
});

api.post('/reports', requireAuth, requireCsrf, async (req:AuthedRequest,res) => {
  const parsed = z.object({ profileId:z.number().int().positive().nullable(), title:z.string().min(1).max(150), kind:z.string().min(1).max(40), payload:z.unknown() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error:'Invalid report' });
  const r = parsed.data;
  if (r.profileId && !await profileById(r.profileId, req.user!.id)) return res.status(404).json({ error:'Profile not found' });
  const result = await db.execute('INSERT INTO saved_reports(user_id,profile_id,title,kind,payload) VALUES(?,?,?,?,?)', [req.user!.id,r.profileId,r.title,r.kind,JSON.stringify(r.payload)]);
  res.status(201).json({ id:result.insertId });
});

api.get('/reports', requireAuth, async (req:AuthedRequest,res) => res.json({ reports:await db.query('SELECT id,profile_id AS profileId,title,kind,created_at AS createdAt FROM saved_reports WHERE user_id=? ORDER BY created_at DESC', [req.user!.id]) }));

api.get('/admin/overview', requireAuth, requireAdmin, async (_req,res) => {
  const since = new Date(Date.now() - 30*86400000).toISOString().slice(0,19).replace('T',' ');
  const [usersCount, profilesCount, reportsCount, activeCount, users] = await Promise.all([
    db.first<{n:number}>('SELECT count(*) n FROM users'),
    db.first<{n:number}>('SELECT count(*) n FROM birth_profiles'),
    db.first<{n:number}>('SELECT count(*) n FROM saved_reports'),
    db.first<{n:number}>('SELECT count(*) n FROM users WHERE created_at >= ?', [since]),
    db.query(`SELECT id,email,name,role,status,created_at AS createdAt,
      (SELECT count(*) FROM birth_profiles p WHERE p.user_id=users.id) profileCount FROM users ORDER BY created_at DESC LIMIT 100`),
  ]);
  const stats = {
    users:usersCount?.n || 0, profiles:profilesCount?.n || 0, reports:reportsCount?.n || 0, active30d:activeCount?.n || 0,
  };
  res.json({ stats,users });
});

api.patch('/admin/users/:id', requireAuth, requireCsrf, requireAdmin, async (req:AuthedRequest,res) => {
  const parsed = z.object({ status:z.enum(['ACTIVE','SUSPENDED']).optional(), role:z.enum(['USER','ADMIN']).optional() }).safeParse(req.body);
  if (!parsed.success || (!parsed.data.status && !parsed.data.role)) return res.status(400).json({ error:'No valid account change supplied' });
  if (Number(req.params.id) === req.user!.id && parsed.data.status === 'SUSPENDED') return res.status(400).json({ error:'You cannot suspend your own account' });
  const current = await db.first<{status:string;role:string}>('SELECT status,role FROM users WHERE id=?', [Number(req.params.id)]);
  if (!current) return res.status(404).json({ error:'User not found' });
  const removesActiveAdmin = current.role === 'ADMIN' && current.status === 'ACTIVE' && (parsed.data.role === 'USER' || parsed.data.status === 'SUSPENDED');
  if (removesActiveAdmin) {
    const activeAdmins = await db.first<{n:number}>("SELECT count(*) n FROM users WHERE role='ADMIN' AND status='ACTIVE'");
    if ((activeAdmins?.n || 0) <= 1) return res.status(400).json({ error:'Create another active administrator before removing the last one' });
  }
  await db.execute('UPDATE users SET status=?,role=? WHERE id=?', [parsed.data.status||current.status,parsed.data.role||current.role,Number(req.params.id)]);
  res.json({ ok:true });
});
