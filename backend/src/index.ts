import express from 'express';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { db } from './db';
import { authRouter } from './routes/auth';
import { adminRouter } from './routes/admin';
import { pmRouter } from './routes/pm';
import { pgmRouter } from './routes/pgm';
import { cxoRouter } from './routes/cxo';
import { projectsRouter } from './routes/projects';
import { raidRouter } from './routes/raid';
import { milestoneStatusesRouter } from './routes/milestoneStatuses';
import { registerSocketHandlers } from './realtime';
import { startMsCron, syncMsEmployees } from './ms-sync';
import { seedAdminUser } from './scripts/seedAdmin';

const app = express();
const httpServer = createServer(app);

const corsOrigin = config.cors.devMode
  ? (_origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => cb(null, true)
  : config.cors.origin;

const io = new SocketServer(httpServer, {
  cors: { origin: corsOrigin, methods: ['GET', 'POST'], credentials: true },
});

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self';");
  next();
});
app.use(cookieParser());
app.use(express.json());

app.use('/auth', authRouter);
app.use('/admin', adminRouter);
app.use('/pm', pmRouter);
app.use('/pgm', pgmRouter);
app.use('/cxo', cxoRouter);
app.use('/projects', projectsRouter);
app.use('/projects', raidRouter);
app.use('/milestone-statuses', milestoneStatusesRouter);

app.get('/health', async (_req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', db: 'unreachable' });
  }
});

// One-time setup endpoint — disabled in production. Only available in development.
if (config.nodeEnv === 'development') {
  app.post('/setup/seed-admin', async (req, res) => {
    const secret = process.env['SETUP_SECRET'];
    if (!secret || req.headers['x-setup-secret'] !== secret) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    try {
      await seedAdminUser();
      res.json({ success: true, message: 'Admin user seeded successfully.' });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });
}

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

registerSocketHandlers(io);

export { io };

httpServer.listen(config.port, async () => {
  console.log(`Server running on port ${config.port} [${config.nodeEnv}]`);

  if (process.env['SEED_ADMIN_ON_START'] === 'true') {
    try {
      await seedAdminUser();
    } catch (err) {
      console.error('Startup seed failed:', err);
    }
  }

  startMsCron();
  setTimeout(() => {
    void syncMsEmployees();
  }, 2000);
});
