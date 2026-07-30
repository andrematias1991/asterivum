import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const testDirectory = mkdtempSync(join(tmpdir(), 'astralis-security-'));
process.env.NODE_ENV = 'test';
process.env.ALLOW_REGISTRATION = 'true';
process.env.DATABASE_PATH = join(testDirectory, 'test.db');
process.env.UPLOAD_DIRECTORY = join(testDirectory, 'uploads');

let agent: ReturnType<typeof request.agent>;
let closeDatabase: () => Promise<void>;
let databaseModule: typeof import('./db.js');

beforeAll(async () => {
  const database = await import('./db.js');
  databaseModule = database;
  const { createApp } = await import('./app.js');
  await database.initializeDatabase();
  closeDatabase = database.closeDatabase;
  agent = request.agent(createApp());
});

afterAll(async () => {
  await closeDatabase();
  rmSync(testDirectory, { recursive:true, force:true });
});

describe('session security', () => {
  it('offers basic chart tools publicly while keeping detailed analysis private', async () => {
    const app = (await import('./app.js')).createApp();
    const preview = await request(app).post('/api/charts/preview').send({
      mode:'NATAL',
      profile:{
        name:'Guest chart',birthDate:'1991-09-19',birthTime:'04:35',place:'Faro, Portugal',
        latitude:37.0194,longitude:-7.9304,timezone:-8,timezoneId:'Europe/Lisbon',
        houseSystem:'PLACIDUS',zodiac:'TROPICAL',notes:'',isPrimary:false,
      },
    });
    expect(preview.status).toBe(200);
    expect(preview.body.chart.mode).toBe('NATAL');
    expect(preview.body.chart.planets).toHaveLength(13);
    expect(preview.body.chart.natalDate).toBe('1991-09-19T03:35:00.000Z');
    const missingTimezone = await request(app).post('/api/charts/preview').send({
      mode:'NATAL',
      profile:{
        name:'Invalid location',birthDate:'1991-09-19',birthTime:'04:35',place:'Typed only',
        latitude:37.0194,longitude:-7.9304,timezone:1,
        houseSystem:'PLACIDUS',zodiac:'TROPICAL',notes:'',isPrimary:false,
      },
    });
    expect(missingTimezone.status).toBe(400);
    expect((await request(app).get('/api/ephemeris?start=2026-01-01&end=2026-01-03&step=1')).status).toBe(200);
    expect((await request(app).get('/api/natal-analysis/1')).status).toBe(401);
    expect((await request(app).get('/api/astrocartography/1')).status).toBe(401);
  });

  it('allows credentialed requests only from the configured frontend', async () => {
    const app = (await import('./app.js')).createApp();
    const allowed = await request(app).options('/api/me').set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'GET');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const rejected = await request(app).get('/api/me').set('Origin', 'https://malicious.example');
    expect(rejected.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('creates an HttpOnly session and requires CSRF for writes', async () => {
    const registration = await agent.post('/api/auth/register').send({ name:'Security Test', email:'security@example.test', password:'CorrectHorseBattery12!' });
    expect(registration.status).toBe(201);
    expect(registration.body.token).toBeUndefined();
    expect(registration.body.csrfToken).toEqual(expect.any(String));
    const cookies = registration.headers['set-cookie'] as unknown as string[];
    expect(cookies.some(value => value.startsWith('astralis_session=') && value.includes('HttpOnly'))).toBe(true);

    expect((await agent.get('/api/me')).status).toBe(200);
    expect((await agent.post('/api/profiles').send({})).status).toBe(403);

    const csrf = registration.body.csrfToken;
    expect((await agent.post('/api/auth/logout').set('X-CSRF-Token', csrf)).status).toBe(204);
    expect((await agent.get('/api/me')).status).toBe(401);
  });

  it('supports opaque bearer sessions for the native mobile client', async () => {
    const app=(await import('./app.js')).createApp();
    const registration=await request(app).post('/api/auth/register').set('X-Client-Platform','mobile').send({
      name:'Mobile Test',email:'mobile@example.test',password:'CorrectHorseBattery12!',
    });
    expect(registration.status).toBe(201);
    expect(registration.body.sessionToken).toEqual(expect.any(String));
    expect(registration.headers['set-cookie']).toBeUndefined();
    const authorization=`Bearer ${registration.body.sessionToken}`;
    expect((await request(app).get('/api/me').set('Authorization',authorization)).status).toBe(200);
    const profile=await request(app).post('/api/profiles').set('Authorization',authorization).send({
      name:'Mobile Native',birthDate:'1991-09-19',birthTime:'04:35',place:'Faro, Portugal',
      latitude:37.0194,longitude:-7.9304,timezone:-8,timezoneId:'Europe/Lisbon',houseSystem:'PLACIDUS',zodiac:'TROPICAL',notes:'',isPrimary:true,
    });
    expect(profile.status).toBe(201);
    const profiles=await request(app).get('/api/profiles').set('Authorization',authorization);
    expect(profiles.body.profiles[0].timezone).toBe(1);
    expect((await request(app).post('/api/auth/logout').set('Authorization',authorization)).status).toBe(204);
    expect((await request(app).get('/api/me').set('Authorization',authorization)).status).toBe(401);
  });

  it('rejects short passwords', async () => {
    const response = await request((await import('./app.js')).createApp()).post('/api/auth/register').send({ name:'Short Password', email:'short@example.test', password:'short123' });
    expect(response.status).toBe(400);
  });

  it('stores private chart annotation sessions with profile ownership checks', async () => {
    const app=(await import('./app.js')).createApp();
    const registration=await request(app).post('/api/auth/register').set('X-Client-Platform','mobile').send({
      name:'Teacher',email:'teacher@example.test',password:'CorrectHorseBattery12!',
    });
    const authorization=`Bearer ${registration.body.sessionToken}`;
    const createdProfile=await request(app).post('/api/profiles').set('Authorization',authorization).send({
      name:'Class chart',birthDate:'1991-09-19',birthTime:'04:35',place:'Faro, Portugal',
      latitude:37.0194,longitude:-7.9304,timezone:1,timezoneId:'Europe/Lisbon',houseSystem:'PLACIDUS',zodiac:'TROPICAL',notes:'',isPrimary:true,
    });
    const session=await request(app).post('/api/annotations').set('Authorization',authorization).send({
      title:'House one lesson',
      context:{profileId:createdProfile.body.id,mode:'NATAL'},
      annotations:[
        {id:'arrow-1',type:'ARROW',start:{x:80,y:280},end:{x:145,y:280},color:'#b1324d',width:3},
        {id:'text-1',type:'TEXT',position:{x:90,y:260},text:'Ascendant',color:'#b1324d',size:16},
      ],
    });
    expect(session.status).toBe(201);
    const loaded=await request(app).get(`/api/annotations/${session.body.id}`).set('Authorization',authorization);
    expect(loaded.body.annotation.annotations).toHaveLength(2);
    expect(loaded.body.annotation.chartContext.mode).toBe('NATAL');
  });

  it('keeps provider listings private until an administrator approves a revision', async () => {
    const app=(await import('./app.js')).createApp();
    const specialties=await request(app).get('/api/directory/specialties');
    const acupuncture=specialties.body.specialties.find((item:{slug:string})=>item.slug==='acupuncture');
    expect(acupuncture.regulated).toBeTruthy();

    const providerRegistration=await request(app).post('/api/auth/register').set('X-Client-Platform','mobile').send({
      name:'Provider',email:'provider@example.test',password:'CorrectHorseBattery12!',
    });
    await databaseModule.db.execute(
      "UPDATE users SET account_type='PROFESSIONAL', verification_status='VERIFIED' WHERE email=?",
      ['provider@example.test'],
    );
    const providerAuth=`Bearer ${providerRegistration.body.sessionToken}`;
    const payload={
      listingType:'PRACTITIONER',name:'Lisbon Practice',summary:'Complementary care in central Lisbon.',
      description:'A professional complementary-care practice with appointments by prior booking.',
      email:'hello@example.test',phone:'+351 210 000 000',website:'https://example.test',languages:['Português','English'],
      specialtyIds:[acupuncture.id],credentials:[],
      locations:[{label:'Lisboa, Portugal',address:'Private address 10',city:'Lisboa',region:'Lisboa',country:'Portugal',postalCode:'1000-001',latitude:38.7169,longitude:-9.1399,markerPrecision:'APPROXIMATE',isPrimary:true,imageId:null as number|null}],
      publishEmail:true,publishPhone:false,
    };
    const draft=await request(app).post('/api/directory/listings').set('Authorization',providerAuth).send(payload);
    expect(draft.status).toBe(201);
    const onePixelPng=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
    const image=await request(app).post(`/api/directory/listings/${draft.body.id}/image`).set('Authorization',providerAuth)
      .field('altText','Lisbon practice entrance').attach('image',onePixelPng,{filename:'practice.png',contentType:'image/png'});
    expect(image.status).toBe(201);
    expect(image.body.image.url).toMatch(/^\/uploads\/listings\/.+\.webp$/);
    payload.locations[0].imageId=image.body.image.id;
    const confirmations={confirmAccuracy:true,confirmPublication:true,confirmClaims:true};
    expect((await request(app).post(`/api/directory/listings/${draft.body.id}/submit`).set('Authorization',providerAuth).send(confirmations)).status).toBe(400);

    payload.credentials=[{specialtyId:acupuncture.id,title:'Acupuncturist',issuer:'Professional body',registrationNumber:'CP-12345'}] as never[];
    expect((await request(app).put(`/api/directory/listings/${draft.body.id}`).set('Authorization',providerAuth).send(payload)).status).toBe(200);
    expect((await request(app).post(`/api/directory/listings/${draft.body.id}/submit`).set('Authorization',providerAuth).send(confirmations)).status).toBe(202);
    expect((await request(app).get('/api/directory/listings')).body.listings).toHaveLength(0);

    const adminRegistration=await request(app).post('/api/auth/register').set('X-Client-Platform','mobile').send({
      name:'Directory Admin',email:'directory-admin@example.test',password:'CorrectHorseBattery12!',
    });
    await databaseModule.db.execute("UPDATE users SET role='ADMIN' WHERE email=?",['directory-admin@example.test']);
    const adminAuth=`Bearer ${adminRegistration.body.sessionToken}`;
    const queue=await request(app).get('/api/admin/directory').set('Authorization',adminAuth);
    expect(queue.status).toBe(200);
    expect(queue.body.revisions).toHaveLength(1);
    expect((await request(app).post(`/api/admin/directory/${queue.body.revisions[0].id}/decision`).set('Authorization',adminAuth).send({action:'APPROVE',note:'Credentials supplied'})).status).toBe(200);

    const publicDirectory=await request(app).get('/api/directory/listings');
    expect(publicDirectory.body.listings).toHaveLength(1);
    const published=publicDirectory.body.listings[0];
    expect(published.locations[0].latitude).toBe(38.72);
    expect(published.locations[0].address).toBe('');
    expect(published.email).toBe('hello@example.test');
    expect(published.phone).toBe('');
    expect(published.locations[0].imageUrl).toBe(image.body.image.url);
    expect(published.credentials[0].registrationNumber).toBeUndefined();
    expect((await request(app).post(`/api/admin/directory/listings/${draft.body.id}/status`).set('Authorization',adminAuth).send({action:'SUSPEND',note:'Temporary safety review'})).status).toBe(200);
    expect((await request(app).get('/api/directory/listings')).body.listings).toHaveLength(0);
    expect((await request(app).post(`/api/admin/directory/listings/${draft.body.id}/status`).set('Authorization',adminAuth).send({action:'RESTORE',note:'Review complete'})).status).toBe(200);
    expect((await request(app).get('/api/directory/listings')).body.listings).toHaveLength(1);
  });

  it('tracks aggregate activity and moderates account and specialty suggestions', async () => {
    const app=(await import('./app.js')).createApp();
    expect((await request(app).post('/api/analytics/page-view').send({pageKey:'directory'})).status).toBe(204);

    const memberRegistration=await request(app).post('/api/auth/register').set('X-Client-Platform','mobile').send({
      name:'Account Applicant',email:'applicant@example.test',password:'CorrectHorseBattery12!',
    });
    const memberAuth=`Bearer ${memberRegistration.body.sessionToken}`;
    expect((await request(app).post('/api/analytics/page-view').set('Authorization',memberAuth).send({pageKey:'directory'})).status).toBe(204);
    expect((await request(app).post('/api/account/type-request').set('Authorization',memberAuth).send({
      accountType:'PROFESSIONAL',message:'I provide astrology consultations and can supply professional practice details.',
    })).status).toBe(202);
    const suggestion=await request(app).post('/api/directory/suggestions').set('Authorization',memberAuth).send({
      kind:'NEW_SPECIALTY',suggestedNameEn:'Forest Therapy',suggestedNamePt:'Terapia da Floresta',
      message:'Please consider this option for qualified nature-based practitioners.',
    });
    expect(suggestion.status).toBe(201);

    const adminRegistration=await request(app).post('/api/auth/register').set('X-Client-Platform','mobile').send({
      name:'Platform Admin',email:'platform-admin@example.test',password:'CorrectHorseBattery12!',
    });
    await databaseModule.db.execute("UPDATE users SET role='ADMIN' WHERE email=?",['platform-admin@example.test']);
    const adminAuth=`Bearer ${adminRegistration.body.sessionToken}`;
    const platform=await request(app).get('/api/admin/platform').set('Authorization',adminAuth);
    expect(platform.status).toBe(200);
    expect(platform.body.pageViews.find((item:{pageKey:string})=>item.pageKey==='directory')).toMatchObject({anonymousCount:1,authenticatedCount:1});
    expect(platform.body.accountRequests.some((item:{email:string})=>item.email==='applicant@example.test')).toBe(true);
    expect(platform.body.suggestions.some((item:{id:number})=>item.id===suggestion.body.id)).toBe(true);

    expect((await request(app).post(`/api/admin/account-requests/${memberRegistration.body.user.id}`).set('Authorization',adminAuth).send({action:'APPROVE',note:'Details reviewed'})).status).toBe(200);
    const refreshed=await request(app).get('/api/me').set('Authorization',memberAuth);
    expect(refreshed.body.user).toMatchObject({accountType:'PROFESSIONAL',verificationStatus:'VERIFIED'});
    expect((await request(app).post(`/api/admin/suggestions/${suggestion.body.id}/decision`).set('Authorization',adminAuth).send({action:'APPROVE',note:'Added',iconKey:'leaf'})).status).toBe(200);
    const specialties=await request(app).get('/api/directory/specialties');
    expect(specialties.body.specialties.find((item:{slug:string})=>item.slug==='forest-therapy')).toMatchObject({iconKey:'leaf'});
  });
});
