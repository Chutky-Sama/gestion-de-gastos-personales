import express from 'express';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { createServer as createViteServer } from 'vite';
import {
  appendHistoryEvent,
  createEmptyMonth,
  createInitialDatabase,
  loadDatabase,
  populateDemoData,
  saveDatabase,
} from './store';
import {
  computeAllTimeInvestmentTotals,
  computeMonthSummary,
  formatMonthLabel,
  getTodayDateString,
  round2,
} from '../shared/calculations';
import {
  AppDatabase,
  InvestmentDefinition,
  LedgerEntry,
} from '../shared/types';

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // Ensure DB exists on startup (records Day 1 on very first launch)
  loadDatabase();

  // GET full state
  app.get('/api/state', (_req, res) => {
    const db = loadDatabase();
    res.json(db);
  });

  // PUT profile & salary
  app.put('/api/profile', (req, res) => {
    const db = loadDatabase();
    const {
      ledgerName,
      currencyCode,
      currencySymbol,
      currentSalary,
      hasManutencionesDefault,
      syncMonthKey,
    } = req.body;

    const prevSalary = db.profile.currentSalary;

    if (typeof ledgerName === 'string' && ledgerName.trim()) {
      db.profile.ledgerName = ledgerName.trim();
    }
    if (typeof currencyCode === 'string' && currencyCode.trim()) {
      db.profile.currencyCode = currencyCode.trim();
    }
    if (typeof currencySymbol === 'string' && currencySymbol.trim()) {
      db.profile.currencySymbol = currencySymbol.trim();
    }
    if (typeof hasManutencionesDefault === 'boolean') {
      db.profile.hasManutencionesDefault = hasManutencionesDefault;
    }
    if (typeof currentSalary === 'number' && !Number.isNaN(currentSalary) && currentSalary >= 0) {
      db.profile.currentSalary = round2(currentSalary);
      if (Math.abs(db.profile.currentSalary - prevSalary) > 0.009) {
        appendHistoryEvent(db, {
          monthKey: syncMonthKey,
          eventType: 'salary_updated',
          title: `Salario actual actualizado a ${db.profile.currencySymbol}${db.profile.currentSalary.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
          detail:
            prevSalary > 0
              ? `Cambio desde ${db.profile.currencySymbol}${prevSalary.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
              : 'Definición inicial de salario mensual.',
          amount: db.profile.currentSalary,
        });
      }
    }

    if (syncMonthKey && db.months[syncMonthKey] && typeof currentSalary === 'number') {
      db.months[syncMonthKey].salary = round2(currentSalary);
      db.months[syncMonthKey].updatedAt = new Date().toISOString();
    }

    saveDatabase(db);
    res.json(db);
  });

  // Ensure a month exists (optionally inheriting template & carryover)
  app.post('/api/months/:monthKey/ensure', (req, res) => {
    const db = loadDatabase();
    const { monthKey } = req.params;
    const { bringCarryoverFrom } = req.body || {};

    if (!/^\d{4}-\d{2}$/.test(monthKey)) {
      res.status(400).json({ error: 'Formato de mes inválido (YYYY-MM).' });
      return;
    }

    if (!db.months[monthKey]) {
      const sortedKeys = Object.keys(db.months)
        .filter((k) => k < monthKey)
        .sort();
      const fallbackKeys = Object.keys(db.months).sort();
      const templateKey =
        sortedKeys.length > 0
          ? sortedKeys[sortedKeys.length - 1]
          : fallbackKeys[fallbackKeys.length - 1];
      const templateMonth = templateKey ? db.months[templateKey] : undefined;

      const newMonth = createEmptyMonth(
        monthKey,
        db.profile.currentSalary,
        db.profile.hasManutencionesDefault,
        templateMonth
      );

      if (bringCarryoverFrom && db.months[bringCarryoverFrom]) {
        const allTimeInv = computeAllTimeInvestmentTotals(db);
        const prevSummary = computeMonthSummary(
          db.months[bringCarryoverFrom],
          db.investments,
          allTimeInv
        );
        newMonth.carryover = round2(prevSummary.currentGeneralBalance);
      }

      db.months[monthKey] = newMonth;
      appendHistoryEvent(db, {
        monthKey,
        eventType: 'month_opened',
        title: `Apertura de libreta: ${formatMonthLabel(monthKey)}`,
        detail: `Salario base del mes: ${db.profile.currencySymbol}${newMonth.salary.toFixed(2)}`,
        amount: newMonth.salary,
      });
      saveDatabase(db);
    } else if (bringCarryoverFrom && db.months[bringCarryoverFrom]) {
      const allTimeInv = computeAllTimeInvestmentTotals(db);
      const prevSummary = computeMonthSummary(
        db.months[bringCarryoverFrom],
        db.investments,
        allTimeInv
      );
      db.months[monthKey].carryover = round2(prevSummary.currentGeneralBalance);
      db.months[monthKey].updatedAt = new Date().toISOString();
      saveDatabase(db);
    }

    res.json(db);
  });

  // Update month plan (salary, carryover, allocations, hasManutenciones, reflection)
  app.put('/api/months/:monthKey/plan', (req, res) => {
    const db = loadDatabase();
    const { monthKey } = req.params;
    const month = db.months[monthKey];

    if (!month) {
      res.status(404).json({ error: 'El mes solicitado no existe.' });
      return;
    }

    const { salary, carryover, hasManutenciones, allocations, reflection, alsoUpdateCurrentSalary } =
      req.body;

    if (typeof salary === 'number' && !Number.isNaN(salary) && salary >= 0) {
      month.salary = round2(salary);
      if (alsoUpdateCurrentSalary) {
        const prev = db.profile.currentSalary;
        db.profile.currentSalary = round2(salary);
        if (Math.abs(prev - month.salary) > 0.009) {
          appendHistoryEvent(db, {
            monthKey,
            eventType: 'salary_updated',
            title: `Salario actual fijado en ${db.profile.currencySymbol}${month.salary.toFixed(2)}`,
            detail: `Actualizado desde la planificación de ${formatMonthLabel(monthKey)}.`,
            amount: month.salary,
          });
        }
      }
    }

    if (typeof carryover === 'number' && !Number.isNaN(carryover)) {
      month.carryover = round2(carryover);
    }

    if (typeof hasManutenciones === 'boolean') {
      month.hasManutenciones = hasManutenciones;
      db.profile.hasManutencionesDefault = hasManutenciones;
    }

    if (allocations && typeof allocations === 'object') {
      month.allocations = {
        hogar: round2(Number(allocations.hogar) || 0),
        deudas: round2(Number(allocations.deudas) || 0),
        manutenciones: round2(Number(allocations.manutenciones) || 0),
        hogarItems: Array.isArray(allocations.hogarItems) ? allocations.hogarItems : month.allocations.hogarItems,
        deudasItems: Array.isArray(allocations.deudasItems) ? allocations.deudasItems : month.allocations.deudasItems,
        manutencionesItems: Array.isArray(allocations.manutencionesItems)
          ? allocations.manutencionesItems
          : month.allocations.manutencionesItems,
        investmentTargets:
          allocations.investmentTargets && typeof allocations.investmentTargets === 'object'
            ? allocations.investmentTargets
            : month.allocations.investmentTargets,
        customEnvelopes: Array.isArray(allocations.customEnvelopes)
          ? allocations.customEnvelopes
          : month.allocations.customEnvelopes,
      };
    }

    if (reflection && typeof reflection === 'object') {
      month.reflection = {
        ...month.reflection,
        ...reflection,
      };
    }

    month.updatedAt = new Date().toISOString();
    saveDatabase(db);
    res.json(db);
  });

  // Add ledger entry to a month
  app.post('/api/months/:monthKey/entries', (req, res) => {
    const db = loadDatabase();
    const { monthKey } = req.params;
    if (!db.months[monthKey]) {
      db.months[monthKey] = createEmptyMonth(
        monthKey,
        db.profile.currentSalary,
        db.profile.hasManutencionesDefault
      );
    }
    const month = db.months[monthKey];

    const { date, type, amount, concept, division, investmentId, pillar, note } = req.body;
    const numericAmount = round2(Math.abs(Number(amount) || 0));
    if (numericAmount <= 0) {
      res.status(400).json({ error: 'El monto debe ser mayor que cero.' });
      return;
    }

    const entry: LedgerEntry = {
      id: crypto.randomUUID(),
      monthKey,
      date: typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : getTodayDateString(),
      createdAt: new Date().toISOString(),
      type: type || 'expense',
      amount: numericAmount,
      concept: (concept || '').trim() || 'Movimiento sin título',
      division: division || 'general',
      investmentId: division === 'inversiones' ? investmentId : undefined,
      pillar:
        pillar ||
        (type === 'income'
          ? 'ingreso'
          : type === 'adjustment_up' || type === 'adjustment_down'
          ? 'ajuste'
          : division === 'inversiones' || division === 'deudas'
          ? 'patrimonio'
          : 'supervivencia'),
      note: typeof note === 'string' && note.trim() ? note.trim() : undefined,
    };

    month.entries.push(entry);
    month.updatedAt = new Date().toISOString();
    saveDatabase(db);
    res.json(db);
  });

  // Edit ledger entry
  app.put('/api/months/:monthKey/entries/:entryId', (req, res) => {
    const db = loadDatabase();
    const { monthKey, entryId } = req.params;
    const month = db.months[monthKey];
    if (!month) {
      res.status(404).json({ error: 'Mes no encontrado.' });
      return;
    }

    const idx = month.entries.findIndex((e) => e.id === entryId);
    if (idx === -1) {
      res.status(404).json({ error: 'Registro no encontrado.' });
      return;
    }

    const existing = month.entries[idx];
    const { date, type, amount, concept, division, investmentId, pillar, note } = req.body;
    const numericAmount =
      amount !== undefined ? round2(Math.abs(Number(amount) || 0)) : existing.amount;
    if (numericAmount <= 0) {
      res.status(400).json({ error: 'El monto debe ser mayor que cero.' });
      return;
    }

    const nextDivision = division ?? existing.division;

    month.entries[idx] = {
      ...existing,
      date: typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : existing.date,
      type: type ?? existing.type,
      amount: numericAmount,
      concept: typeof concept === 'string' && concept.trim() ? concept.trim() : existing.concept,
      division: nextDivision,
      investmentId: nextDivision === 'inversiones' ? investmentId : undefined,
      pillar: pillar ?? existing.pillar,
      note: typeof note === 'string' ? (note.trim() || undefined) : existing.note,
    };

    month.updatedAt = new Date().toISOString();
    saveDatabase(db);
    res.json(db);
  });

  // Delete ledger entry
  app.delete('/api/months/:monthKey/entries/:entryId', (req, res) => {
    const db = loadDatabase();
    const { monthKey, entryId } = req.params;
    const month = db.months[monthKey];
    if (!month) {
      res.status(404).json({ error: 'Mes no encontrado.' });
      return;
    }

    month.entries = month.entries.filter((e) => e.id !== entryId);
    month.updatedAt = new Date().toISOString();
    saveDatabase(db);
    res.json(db);
  });

  // Direct General Money Modifier (subir o bajar dinero general del mes, o cuadrar a saldo exacto)
  app.post('/api/months/:monthKey/adjust-balance', (req, res) => {
    const db = loadDatabase();
    const { monthKey } = req.params;
    if (!db.months[monthKey]) {
      db.months[monthKey] = createEmptyMonth(
        monthKey,
        db.profile.currentSalary,
        db.profile.hasManutencionesDefault
      );
    }
    const month = db.months[monthKey];

    const { mode, delta, targetBalance, reason, date } = req.body;
    const allTimeInv = computeAllTimeInvestmentTotals(db);
    const summary = computeMonthSummary(month, db.investments, allTimeInv);

    let signedDiff = 0;
    if (mode === 'target') {
      const desired = round2(Number(targetBalance) || 0);
      signedDiff = round2(desired - summary.currentGeneralBalance);
    } else {
      signedDiff = round2(Number(delta) || 0);
    }

    if (Math.abs(signedDiff) < 0.01) {
      res.json(db);
      return;
    }

    const isUp = signedDiff > 0;
    const magnitude = round2(Math.abs(signedDiff));
    const entryConcept =
      typeof reason === 'string' && reason.trim()
        ? reason.trim()
        : mode === 'target'
        ? `Arqueo de dinero general (${isUp ? '+' : '-'}${db.profile.currencySymbol}${magnitude.toFixed(2)})`
        : isUp
        ? 'Incremento directo al dinero general del mes'
        : 'Reducción directa al dinero general del mes';

    const entry: LedgerEntry = {
      id: crypto.randomUUID(),
      monthKey,
      date: typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : getTodayDateString(),
      createdAt: new Date().toISOString(),
      type: isUp ? 'adjustment_up' : 'adjustment_down',
      amount: magnitude,
      concept: entryConcept,
      division: 'general',
      pillar: 'ajuste',
      note:
        mode === 'target'
          ? `Cuadre de saldo desde ${db.profile.currencySymbol}${summary.currentGeneralBalance.toFixed(2)} hacia ${db.profile.currencySymbol}${(summary.currentGeneralBalance + signedDiff).toFixed(2)}`
          : undefined,
    };

    month.entries.push(entry);
    month.updatedAt = new Date().toISOString();

    appendHistoryEvent(db, {
      monthKey,
      eventType: 'balance_adjusted',
      title: `${isUp ? 'Aumento' : 'Disminución'} de Dinero General (${isUp ? '+' : '-'}${db.profile.currencySymbol}${magnitude.toFixed(2)})`,
      detail: `${formatMonthLabel(monthKey)} · ${entryConcept}`,
      amount: signedDiff,
    });

    saveDatabase(db);
    res.json(db);
  });

  // Create Investment Definition
  app.post('/api/investments', (req, res) => {
    const db = loadDatabase();
    const { name, category, monthlyTarget, platform, notes, monthKey } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'El nombre de la inversión es obligatorio.' });
      return;
    }

    const target = round2(Math.max(0, Number(monthlyTarget) || 0));
    const inv: InvestmentDefinition = {
      id: crypto.randomUUID(),
      name: name.trim(),
      category: category || 'otro',
      monthlyTarget: target,
      platform: typeof platform === 'string' && platform.trim() ? platform.trim() : undefined,
      notes: typeof notes === 'string' && notes.trim() ? notes.trim() : undefined,
      active: true,
      createdAt: new Date().toISOString(),
    };

    db.investments.push(inv);

    if (monthKey && db.months[monthKey]) {
      db.months[monthKey].allocations.investmentTargets[inv.id] = target;
      db.months[monthKey].updatedAt = new Date().toISOString();
    }

    appendHistoryEvent(db, {
      monthKey,
      eventType: 'investment_created',
      title: `Nueva inversión definida: ${inv.name}`,
      detail: `Meta mensual: ${db.profile.currencySymbol}${target.toFixed(2)}${inv.platform ? ` · Plataforma: ${inv.platform}` : ''}`,
      amount: target,
    });

    saveDatabase(db);
    res.json(db);
  });

  // Update Investment Definition
  app.put('/api/investments/:id', (req, res) => {
    const db = loadDatabase();
    const { id } = req.params;
    const inv = db.investments.find((i) => i.id === id);
    if (!inv) {
      res.status(404).json({ error: 'Inversión no encontrada.' });
      return;
    }

    const { name, category, monthlyTarget, platform, notes, active, monthKey } = req.body;

    if (typeof name === 'string' && name.trim()) inv.name = name.trim();
    if (category) inv.category = category;
    if (monthlyTarget !== undefined) {
      inv.monthlyTarget = round2(Math.max(0, Number(monthlyTarget) || 0));
      if (monthKey && db.months[monthKey]) {
        db.months[monthKey].allocations.investmentTargets[inv.id] = inv.active
          ? inv.monthlyTarget
          : 0;
        db.months[monthKey].updatedAt = new Date().toISOString();
      }
    }
    if (platform !== undefined) {
      inv.platform = typeof platform === 'string' && platform.trim() ? platform.trim() : undefined;
    }
    if (notes !== undefined) {
      inv.notes = typeof notes === 'string' && notes.trim() ? notes.trim() : undefined;
    }
    if (typeof active === 'boolean') {
      inv.active = active;
      if (monthKey && db.months[monthKey] && !active) {
        delete db.months[monthKey].allocations.investmentTargets[inv.id];
      }
    }

    saveDatabase(db);
    res.json(db);
  });

  // Remove or archive Investment Definition
  app.delete('/api/investments/:id', (req, res) => {
    const db = loadDatabase();
    const { id } = req.params;
    const inv = db.investments.find((i) => i.id === id);
    if (!inv) {
      res.status(404).json({ error: 'Inversión no encontrada.' });
      return;
    }

    const hasEntries = Object.values(db.months).some((m) =>
      m.entries.some((e) => e.investmentId === id)
    );

    if (hasEntries) {
      inv.active = false;
      for (const m of Object.values(db.months)) {
        delete m.allocations.investmentTargets[id];
      }
    } else {
      db.investments = db.investments.filter((i) => i.id !== id);
      for (const m of Object.values(db.months)) {
        delete m.allocations.investmentTargets[id];
      }
    }

    appendHistoryEvent(db, {
      eventType: 'investment_removed',
      title: `Inversión retirada: ${inv.name}`,
      detail: hasEntries
        ? 'Archivada conservando el historial de aportes realizados.'
        : 'Eliminada del listado de inversiones.',
    });

    saveDatabase(db);
    res.json(db);
  });

  // Load demo data
  app.post('/api/demo', (_req, res) => {
    const current = loadDatabase();
    const demo = populateDemoData(current.firstUseDate);
    saveDatabase(demo);
    res.json(demo);
  });

  // Reset clean to Day 1
  app.post('/api/reset', (_req, res) => {
    const fresh = createInitialDatabase();
    saveDatabase(fresh);
    res.json(fresh);
  });

  // Import backup JSON
  app.post('/api/import', (req, res) => {
    const incoming = req.body as AppDatabase;
    if (!incoming || typeof incoming !== 'object' || !incoming.months || !incoming.profile) {
      res.status(400).json({ error: 'Archivo de respaldo inválido.' });
      return;
    }
    appendHistoryEvent(incoming, {
      eventType: 'backup_restored',
      title: 'Respaldo restaurado exitosamente',
      detail: 'Se importó el registro histórico completo de la libreta.',
    });
    saveDatabase(incoming);
    res.json(loadDatabase());
  });

  const httpServer = http.createServer(app);

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: {
          server: httpServer,
        },
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
