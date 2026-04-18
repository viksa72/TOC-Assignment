import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import simulateRouter from './routes/simulate';
import presetsRouter  from './routes/presets';

const app: Application = express();
const PORT = process.env.PORT ?? 3001;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '1mb' }));

// Request logger
app.use((req: Request, _res: Response, next: NextFunction): void => {
  console.log(`[${new Date().toISOString()}]  ${req.method}  ${req.path}`);
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/simulate', simulateRouter);
app.use('/api/presets',  presetsRouter);

// Health check
app.get('/api/health', (_req: Request, res: Response): void => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// 404 fallback
app.use((_req: Request, res: Response): void => {
  res.status(404).json({ error: 'Route not found.' });
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction): void => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: 'Internal server error.', detail: err.message });
});

// ── Boot ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('  ⚙️  Turing Machine API');
  console.log(`  🚀  http://localhost:${PORT}`);
  console.log('');
  console.log('  POST /api/simulate  — run full simulation');
  console.log('  POST /api/simulate/step — single step (stateless)');
  console.log('  GET  /api/presets   — list all presets');
  console.log('  GET  /api/presets/:id');
  console.log('  POST /api/presets   — save custom preset');
  console.log('');
});

export default app;
