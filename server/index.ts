import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import {
  appendHistoryCore,
  applyAddEntry,
  applyAdjustBalance,
  applyCreateInvestment,
  applyDeleteEntry,
  applyDeleteInvestment,
  applyEnsureMonth,
  applyExitDemoReset,
  applySelectCurrency,
  applyStartOneTimeDemo,
  applyUpdateEnabledCurrencies,
  applyUpdateEntry,
  applyUpdateInvestment,
  applyUpdateMonthPlan,
  applyUpdateProfile,
} from '../shared/ledgerCore';
import { AppDatabase } from '../shared/types';
import { loadDatabase, saveDatabase } from './store';

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  loadDatabase();

  const handleMutation = (
    res: express.Response,
    fn: (db: AppDatabase) => AppDatabase
  ) => {
    try {
      const db = loadDatabase();
      const next = fn(db);
      res.json(saveDatabase(next));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error procesando solicitud';
      res.status(400).json({ error: message });
    }
  };

  app.get('/api/state', (_req, res) => {
    res.json(loadDatabase());
  });

  app.put('/api/currency/select', (req, res) => {
    handleMutation(res, (db) => applySelectCurrency(db, req.body?.currencyCode || 'CUP'));
  });

  app.put('/api/currency/enabled', (req, res) => {
    handleMutation(res, (db) =>
      applyUpdateEnabledCurrencies(db, req.body?.enabledCurrencies || ['CUP', 'USD'], req.body?.activeCurrency)
    );
  });

  app.put('/api/profile', (req, res) => {
    handleMutation(res, (db) => applyUpdateProfile(db, req.body || {}));
  });

  app.post('/api/months/:monthKey/ensure', (req, res) => {
    handleMutation(res, (db) =>
      applyEnsureMonth(db, req.params.monthKey, req.body?.bringCarryoverFrom)
    );
  });

  app.put('/api/months/:monthKey/plan', (req, res) => {
    handleMutation(res, (db) => applyUpdateMonthPlan(db, req.params.monthKey, req.body || {}));
  });

  app.post('/api/months/:monthKey/entries', (req, res) => {
    handleMutation(res, (db) => applyAddEntry(db, req.params.monthKey, req.body || {}));
  });

  app.put('/api/months/:monthKey/entries/:entryId', (req, res) => {
    handleMutation(res, (db) =>
      applyUpdateEntry(db, req.params.monthKey, req.params.entryId, req.body || {})
    );
  });

  app.delete('/api/months/:monthKey/entries/:entryId', (req, res) => {
    handleMutation(res, (db) =>
      applyDeleteEntry(db, req.params.monthKey, req.params.entryId)
    );
  });

  app.post('/api/months/:monthKey/adjust-balance', (req, res) => {
    handleMutation(res, (db) => applyAdjustBalance(db, req.params.monthKey, req.body || {}));
  });

  app.post('/api/investments', (req, res) => {
    handleMutation(res, (db) => applyCreateInvestment(db, req.body || {}));
  });

  app.put('/api/investments/:id', (req, res) => {
    handleMutation(res, (db) => applyUpdateInvestment(db, req.params.id, req.body || {}));
  });

  app.delete('/api/investments/:id', (req, res) => {
    handleMutation(res, (db) => applyDeleteInvestment(db, req.params.id));
  });

  app.post('/api/demo', (_req, res) => {
    handleMutation(res, (db) => applyStartOneTimeDemo(db));
  });

  app.post('/api/reset', (_req, res) => {
    handleMutation(res, (db) => applyExitDemoReset(db));
  });

  app.post('/api/import', (req, res) => {
    handleMutation(res, () => {
      const incoming = req.body as AppDatabase;
      if (!incoming || typeof incoming !== 'object' || !incoming.profile) {
        throw new Error('Archivo de respaldo inválido.');
      }
      appendHistoryCore(incoming, {
        eventType: 'backup_restored',
        title: 'Respaldo restaurado exitosamente',
        detail: 'Se importó el registro histórico completo de la libreta.',
      });
      return incoming;
    });
  });

  const httpServer = http.createServer(app);

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`Neon Kakeibo server running at http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
