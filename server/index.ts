import express from 'express';
import fs from 'node:fs';
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
  applyExecuteCurrencyExchange,
  applyExitDemoReset,
  applySelectCurrency,
  applyStartOneTimeDemo,
  applyUpdateEnabledCurrencies,
  applyUpdateEntry,
  applyUpdateExchangeRate,
  applyUpdateInvestment,
  applyUpdateMonthPlan,
  applyUpdateProfile,
} from '../shared/ledgerCore';
import { AppDatabase, AutoBackupConfig, BackupFileEntry } from '../shared/types';
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

  app.put('/api/exchange/rate', (req, res) => {
    handleMutation(res, (db) => applyUpdateExchangeRate(db, req.body || {}));
  });

  app.post('/api/exchange/execute', (req, res) => {
    handleMutation(res, (db) => applyExecuteCurrencyExchange(db, req.body || {}));
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

  // Web/Dev preview mirror of the Desktop Auto-Backup API
  const backupCfgPath = path.resolve(process.cwd(), 'data', 'backup-config.json');
  const defaultBackupDir = path.resolve(process.cwd(), 'data', 'respaldos_automaticos');

  const listRecentBackups = (dirPath: string): BackupFileEntry[] => {
    try {
      if (!fs.existsSync(dirPath)) return [];
      return fs
        .readdirSync(dirPath)
        .filter((f) => f.startsWith('Salva_Kakeibo_2') && f.endsWith('.json'))
        .map((fileName) => {
          const st = fs.statSync(path.join(dirPath, fileName));
          return {
            fileName,
            sizeBytes: st.size,
            modifiedAt: st.mtime.toISOString().replace('T', ' ').slice(0, 19),
          };
        })
        .sort((a, b) => b.fileName.localeCompare(a.fileName))
        .slice(0, 20);
    } catch {
      return [];
    }
  };

  const readWebBackupConfig = (): AutoBackupConfig => {
    const base: AutoBackupConfig = {
      enabled: false,
      frequency: 'weekly',
      dayOfWeek: 6,
      dayOfMonth: 1,
      hour: 20,
      minute: 0,
      targetDir: defaultBackupDir,
      maxBackups: 12,
      runOnStartupIfMissed: true,
      taskRegistered: false,
    };
    try {
      if (fs.existsSync(backupCfgPath)) {
        const parsed = JSON.parse(fs.readFileSync(backupCfgPath, 'utf8'));
        Object.assign(base, parsed);
      }
    } catch {
      // ignore
    }
    base.recentBackups = listRecentBackups(base.targetDir);
    return base;
  };

  const saveWebBackupConfig = (cfg: AutoBackupConfig): AutoBackupConfig => {
    fs.mkdirSync(path.dirname(backupCfgPath), { recursive: true });
    const { recentBackups: _ignored, ...toWrite } = cfg;
    fs.writeFileSync(backupCfgPath, JSON.stringify(toWrite, null, 2), 'utf8');
    return { ...toWrite, recentBackups: listRecentBackups(cfg.targetDir) };
  };

  app.get('/api/backup/config', (_req, res) => {
    res.json(readWebBackupConfig());
  });

  app.put('/api/backup/config', (req, res) => {
    try {
      const prev = readWebBackupConfig();
      const body = req.body || {};
      const next: AutoBackupConfig = {
        ...prev,
        enabled: typeof body.enabled === 'boolean' ? body.enabled : prev.enabled,
        frequency:
          body.frequency === 'daily' || body.frequency === 'weekly' || body.frequency === 'monthly'
            ? body.frequency
            : prev.frequency,
        dayOfWeek: Math.min(7, Math.max(1, Number(body.dayOfWeek ?? prev.dayOfWeek) || 6)),
        dayOfMonth: Math.min(28, Math.max(1, Number(body.dayOfMonth ?? prev.dayOfMonth) || 1)),
        hour: Math.min(23, Math.max(0, Number(body.hour ?? prev.hour) || 0)),
        minute: Math.min(59, Math.max(0, Number(body.minute ?? prev.minute) || 0)),
        targetDir:
          typeof body.targetDir === 'string' && body.targetDir.trim()
            ? body.targetDir.trim()
            : prev.targetDir,
        maxBackups: Math.min(100, Math.max(2, Number(body.maxBackups ?? prev.maxBackups) || 12)),
        runOnStartupIfMissed:
          typeof body.runOnStartupIfMissed === 'boolean'
            ? body.runOnStartupIfMissed
            : prev.runOnStartupIfMissed,
        taskRegistered: Boolean(body.enabled ?? prev.enabled),
      };
      res.json(saveWebBackupConfig(next));
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Error guardando configuración' });
    }
  });

  app.post('/api/backup/run-now', (_req, res) => {
    try {
      const cfg = readWebBackupConfig();
      fs.mkdirSync(cfg.targetDir, { recursive: true });
      const db = loadDatabase();
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(
        now.getHours()
      )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const fileName = `Salva_Kakeibo_${stamp}.json`;
      const fullPath = path.join(cfg.targetDir, fileName);
      const serialized = JSON.stringify(db, null, 2);
      fs.writeFileSync(fullPath, serialized, 'utf8');
      fs.writeFileSync(path.join(cfg.targetDir, 'Salva_Kakeibo_Ultima.json'), serialized, 'utf8');

      // Rotate older backups beyond maxBackups
      const datedFiles = fs
        .readdirSync(cfg.targetDir)
        .filter((f) => f.startsWith('Salva_Kakeibo_2') && f.endsWith('.json'))
        .sort();
      while (datedFiles.length > cfg.maxBackups) {
        const oldest = datedFiles.shift();
        if (oldest) fs.unlinkSync(path.join(cfg.targetDir, oldest));
      }

      cfg.lastBackupAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(
        now.getHours()
      )}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      cfg.lastBackupFile = fullPath;
      cfg.lastError = '';
      const saved = saveWebBackupConfig(cfg);
      res.json({ ok: true, filePath: fullPath, config: saved });
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Error creando salva' });
    }
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
