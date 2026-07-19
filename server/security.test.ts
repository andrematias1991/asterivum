import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const testDirectory = mkdtempSync(join(tmpdir(), 'astralis-security-'));
process.env.NODE_ENV = 'test';
process.env.ALLOW_REGISTRATION = 'true';
process.env.DATABASE_PATH = join(testDirectory, 'test.db');

let agent: ReturnType<typeof request.agent>;
let closeDatabase: () => Promise<void>;

beforeAll(async () => {
  const database = await import('./db.js');
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
    const cookies = registration.headers['set-cookie'] as unknown as string[];
    expect(cookies.some(value => value.startsWith('astralis_session=') && value.includes('HttpOnly'))).toBe(true);

    expect((await agent.get('/api/me')).status).toBe(200);
    expect((await agent.post('/api/profiles').send({})).status).toBe(403);

    const csrf = cookies.find(value => value.startsWith('astralis_csrf='))!.split(';')[0].split('=')[1];
    expect((await agent.post('/api/auth/logout').set('X-CSRF-Token', csrf)).status).toBe(204);
    expect((await agent.get('/api/me')).status).toBe(401);
  });

  it('rejects short passwords', async () => {
    const response = await request((await import('./app.js')).createApp()).post('/api/auth/register').send({ name:'Short Password', email:'short@example.test', password:'short123' });
    expect(response.status).toBe(400);
  });
});
