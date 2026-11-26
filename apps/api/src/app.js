import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { config } from './config.js';
import { query } from './db.js';
import { errorHandler, notFound } from './errors.js';
import { authenticate } from './middleware/auth.js';
import { accountsRouter } from './modules/accounts/routes.js';
import { adminRouter } from './modules/admin/routes.js';
import { affairsRouter } from './modules/affairs/routes.js';
import { authRouter } from './modules/auth/routes.js';
import { communityRouter } from './modules/community/routes.js';
import { directoryRouter } from './modules/directory/routes.js';
import { familiesRouter } from './modules/families/routes.js';
import { historyRouter } from './modules/history/routes.js';
import { homeRouter } from './modules/home/routes.js';
import { importRouter } from './modules/import/routes.js';
import { mediaRouter } from './modules/media/routes.js';
import { notificationsRouter } from './modules/notifications/routes.js';
import { peopleRouter } from './modules/people/routes.js';
import { proposalsRouter } from './modules/proposals/routes.js';
import { relationshipsRouter } from './modules/relationships/routes.js';

// Built website (npm run build). Served by this server when hosting on a normal
// Node host such as Render; on Vercel the website is served by Vercel itself.
const WEB_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');

export function createApp({ rateLimits = true, serveWeb = false } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // Security headers for the API only: helmet's strict default policy would block
  // the website's own scripts, map tiles and Supabase calls.
  app.use('/api', helmet());
  app.use(cors({ origin: config.corsOrigins, credentials: false }));
  app.use('/api/v1/import', express.json({ limit: '4mb' }));
  app.use(express.json({ limit: '1mb' }));
  app.use((req, res, next) => {
    req.id = req.get('x-request-id')?.slice(0, 64) || randomUUID();
    res.set('x-request-id', req.id);
    next();
  });

  if (rateLimits) {
    app.use('/api', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }));
    // Stricter limit on writes.
    app.use('/api', rateLimit({
      windowMs: 60_000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false,
      skip: (req) => req.method === 'GET',
    }));
  }

  app.get('/api/health', async (_req, res) => {
    await query('SELECT 1');
    res.json({ ok: true });
  });

  const v1 = express.Router();
  v1.use(authenticate);
  v1.use('/auth', authRouter);
  v1.use('/home', homeRouter);
  v1.use('/people', peopleRouter);
  v1.use('/families', familiesRouter);
  v1.use('/relationships', relationshipsRouter);
  v1.use('/proposals', proposalsRouter);
  v1.use('/history', historyRouter);
  v1.use('/directory', directoryRouter);
  v1.use('/community', communityRouter);
  v1.use('/affairs', affairsRouter);
  v1.use('/accounts', accountsRouter);
  v1.use('/import', importRouter);
  v1.use('/admin', adminRouter);
  v1.use('/media', mediaRouter);
  v1.use('/notifications', notificationsRouter);
  app.use('/api/v1', v1);

  if (serveWeb && existsSync(path.join(WEB_DIST, 'index.html'))) {
    const webHeaders = (res) => {
      res.set({
        'X-Robots-Tag': 'noindex, nofollow',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      });
    };
    // Hashed files under /assets never change: cache them for a year.
    app.use('/assets', express.static(path.join(WEB_DIST, 'assets'), {
      immutable: true, maxAge: '1y', setHeaders: webHeaders,
    }));
    app.use(express.static(path.join(WEB_DIST, '.'), { index: false, setHeaders: webHeaders }));
    // Any other page address (no file extension) is a route of the single-page app;
    // a missing file such as an old /assets/x.js gets a plain 404 instead.
    app.get(/^\/(?!api\/)[^.]*$/, (_req, res) => {
      webHeaders(res);
      res.set('Cache-Control', 'no-cache').sendFile(path.join(WEB_DIST, 'index.html'));
    });
  }

  app.use((_req, _res, next) => next(notFound('Endpoint')));
  app.use(errorHandler);
  return app;
}
