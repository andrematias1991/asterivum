import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { api } from './routes.js';
import { config } from './config.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({
    contentSecurityPolicy:{ directives:{
      defaultSrc:["'self'"], scriptSrc:["'self'"], styleSrc:["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:["'self'", 'https://fonts.gstatic.com'], imgSrc:["'self'", 'data:', 'blob:'], connectSrc:["'self'"],
      objectSrc:["'none'"], frameAncestors:["'none'"], baseUri:["'self'"], formAction:["'self'"],
    }},
    crossOriginEmbedderPolicy:false,
  }));
  app.use(cors({
    origin: (origin, callback) => callback(null, !origin || origin === config.appOrigin),
    credentials: true,
    methods: ['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'],
    allowedHeaders: ['Content-Type','X-CSRF-Token','X-App-Language'],
    maxAge: 86400,
  }));
  app.use(cookieParser());
  app.use(express.json({ limit:'1mb' }));

  const authLimiter = rateLimit({ windowMs:15*60*1000, limit:10, standardHeaders:'draft-8', legacyHeaders:false, message:{ error:'Too many attempts; try again later' } });
  const publicComputeLimiter = rateLimit({ windowMs:60*1000, limit:30, standardHeaders:'draft-8', legacyHeaders:false, message:{ error:'Too many requests; slow down' } });
  const apiLimiter = rateLimit({ windowMs:60*1000, limit:240, standardHeaders:'draft-8', legacyHeaders:false, message:{ error:'Too many requests; slow down' } });
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);
  app.use('/api/charts/preview', publicComputeLimiter);
  app.use('/api/ephemeris', publicComputeLimiter);
  app.use('/api/locations/search', publicComputeLimiter);
  app.use('/api', apiLimiter, api);

  const publicDir = resolve('build/public');
  if (existsSync(publicDir)) {
    app.use(express.static(publicDir, { maxAge:config.isProduction ? '1d' : 0, index:false }));
    app.get('*splat', (_req,res) => res.sendFile(resolve(publicDir,'index.html')));
  }
  app.use((_req,res) => res.status(404).json({ error:'Not found' }));
  app.use((err:Error,_req:express.Request,res:express.Response,_next:express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error:'Something went wrong' });
  });
  return app;
}
