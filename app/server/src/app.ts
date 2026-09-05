import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import leadsRouter from './routes/leads';
import followupsRouter from './routes/followups';
import metaRouter from './routes/meta';
import customersRouter from './routes/customers';
import statsRouter from './routes/stats';
import authRouter from './routes/auth';
import { requireAuth } from './auth';

export function createApp() {
  const app = express();

  app.use(cors({ origin: true, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api/auth', authRouter);

  app.use('/api/leads', requireAuth, leadsRouter);
  app.use('/api', requireAuth, followupsRouter);
  app.use('/api/meta', requireAuth, metaRouter);
  app.use('/api/customers', requireAuth, customersRouter);
  app.use('/api/stats', requireAuth, statsRouter);

  // __dirname is server/src in dev and server/dist once compiled (both one
  // level under server/), so two levels up reaches the repo root either way.
  const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });

  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
