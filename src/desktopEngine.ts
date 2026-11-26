import {
  computeAllTimeInvestmentTotals,
  computeMonthSummary,
  formatMonthLabel,
  getCurrentMonthKey,
  getTodayDateString,
  round2,
} from '../shared/calculations';
import {
  AppDatabase,
  EntryType,
  HistoricalEvent,
  InvestmentCategory,
  InvestmentDefinition,
  KakeiboPillar,
  LedgerEntry,
  MonthAllocations,
  MonthRecord,
  MonthReflection,
} from '../shared/types';

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createEmptyMonthClient(
  monthKey: string,
  salary: number,
  hasManutenciones: boolean,
  templateMonth?: MonthRecord
): MonthRecord {
  const now = new Date().toISOString();
  return {
    monthKey,
    salary,
    carryover: 0,
    hasManutenciones: templateMonth ? templateMonth.hasManutenciones : hasManutenciones,
    allocations: {
      hogar: templateMonth ? templateMonth.allocations.hogar : 0,
      deudas: templateMonth ? templateMonth.allocations.deudas : 0,
      manutenciones: templateMonth ? templateMonth.allocations.manutenciones : 0,
      hogarItems: templateMonth
        ? templateMonth.allocations.hogarItems.map((i) => ({ ...i, id: makeId() }))
        : [],
      deudasItems: templateMonth
        ? templateMonth.allocations.deudasItems.map((i) => ({ ...i, id: makeId() }))
        : [],
      manutencionesItems: templateMonth
        ? templateMonth.allocations.manutencionesItems.map((i) => ({ ...i, id: makeId() }))
        : [],
      investmentTargets: templateMonth ? { ...templateMonth.allocations.investmentTargets } : {},
      customEnvelopes: templateMonth
        ? templateMonth.allocations.customEnvelopes.map((c) => ({ ...c }))
        : [],
    },
    reflection: {
      howMuchCanISave: '',
      improvementPlan: '',
      closingNotes: '',
      mood: '',
    },
    entries: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createInitialDatabaseClient(): AppDatabase {
  const now = new Date().toISOString();
  const currentMonth = getCurrentMonthKey();

  return {
    version: 1,
    firstUseDate: now,
    lastUpdatedAt: now,
    profile: {
      ledgerName: 'Mi Libreta Kakeibo',
      currencyCode: 'USD',
      currencySymbol: '$',
      currentSalary: 0,
      hasManutencionesDefault: false,
    },
    investments: [],
    months: {
      [currentMonth]: createEmptyMonthClient(currentMonth, 0, false),
    },
    historyLog: [
      {
        id: makeId(),
        timestamp: now,
        monthKey: currentMonth,
        eventType: 'first_day',
        title: 'Día 1 · Inicio de la Libreta Personal',
        detail:
          'Se inauguró el registro histórico permanente en tu computadora (estilo Kakeibo · Gagyebu · Ji Zhang Ben).',
      },
    ],
  };
}

function normalizeDb(db: AppDatabase): AppDatabase {
  const now = new Date().toISOString();
  if (!db.firstUseDate) db.firstUseDate = now;
  if (!db.profile) {
    db.profile = {
      ledgerName: 'Mi Libreta Kakeibo',
      currencyCode: 'USD',
      currencySymbol: '$',
      currentSalary: 0,
      hasManutencionesDefault: false,
    };
  }
  if (!Array.isArray(db.investments)) db.investments = [];
  if (!db.months || typeof db.months !== 'object') db.months = {};
  if (!Array.isArray(db.historyLog)) db.historyLog = [];

  const currentMonth = getCurrentMonthKey();
  if (!db.months[currentMonth]) {
    const sortedKeys = Object.keys(db.months).sort();
    const prevTemplate =
      sortedKeys.length > 0 ? db.months[sortedKeys[sortedKeys.length - 1]] : undefined;
    db.months[currentMonth] = createEmptyMonthClient(
      currentMonth,
      db.profile.currentSalary,
      db.profile.hasManutencionesDefault,
      prevTemplate
    );
  }
  return db;
}

function appendHistory(
  db: AppDatabase,
  event: Omit<HistoricalEvent, 'id' | 'timestamp'>
): void {
  db.historyLog.unshift({
    id: makeId(),
    timestamp: new Date().toISOString(),
    ...event,
  });
  if (db.historyLog.length > 1000) {
    db.historyLog = db.historyLog.slice(0, 1000);
  }
}

function createDemoDatabase(existingFirstUseDate?: string): AppDatabase {
  const now = new Date().toISOString();
  const firstUseDate = existingFirstUseDate || now;
  const monthKey = getCurrentMonthKey();
  const today = getTodayDateString();
  const [y, m] = monthKey.split('-');
  const dayPrefix = `${y}-${m}`;

  const invEtfId = makeId();
  const invBtcId = makeId();
  const invFondoId = makeId();

  return {
    version: 1,
    firstUseDate,
    lastUpdatedAt: now,
    profile: {
      ledgerName: 'Mi Libreta Kakeibo',
      currencyCode: 'USD',
      currencySymbol: '$',
      currentSalary: 2400,
      hasManutencionesDefault: true,
    },
    investments: [
      {
        id: invEtfId,
        name: 'ETF S&P 500 (VOO)',
        category: 'acciones_etf',
        monthlyTarget: 200,
        platform: 'Broker Internacional',
        active: true,
        createdAt: now,
      },
      {
        id: invBtcId,
        name: 'Bitcoin (DCA Mensual)',
        category: 'cripto',
        monthlyTarget: 100,
        platform: 'Wallet Fría',
        active: true,
        createdAt: now,
      },
      {
        id: invFondoId,
        name: 'Fondo de Emergencia Remunerado',
        category: 'renta_fija',
        monthlyTarget: 150,
        platform: 'Cuenta Alto Rendimiento',
        active: true,
        createdAt: now,
      },
    ],
    months: {
      [monthKey]: {
        monthKey,
        salary: 2400,
        carryover: 0,
        hasManutenciones: true,
        allocations: {
          hogar: 850,
          deudas: 320,
          manutenciones: 250,
          hogarItems: [
            { id: makeId(), name: 'Alquiler / Vivienda', amount: 500 },
            { id: makeId(), name: 'Supermercado y Despensa', amount: 230 },
            { id: makeId(), name: 'Luz, Agua e Internet', amount: 120 },
          ],
          deudasItems: [
            { id: makeId(), name: 'Tarjeta de Crédito', amount: 170 },
            { id: makeId(), name: 'Cuota Préstamo Personal', amount: 150 },
          ],
          manutencionesItems: [{ id: makeId(), name: 'Apoyo familiar mensual', amount: 250 }],
          investmentTargets: {
            [invEtfId]: 200,
            [invBtcId]: 100,
            [invFondoId]: 150,
          },
          customEnvelopes: [],
        },
        reflection: {
          howMuchCanISave: 'Invertir $450 fijos este mes y cuidar el dinero de bolsillo en salidas.',
          improvementPlan: 'Revisar suscripciones digitales y cocinar más en casa entre semana.',
          closingNotes: '',
          mood: 'excelente',
        },
        entries: [
          {
            id: makeId(),
            monthKey,
            date: `${dayPrefix}-01`,
            createdAt: new Date(Date.now() - 500000).toISOString(),
            type: 'expense',
            amount: 500,
            concept: 'Pago de alquiler del mes',
            division: 'hogar',
            pillar: 'supervivencia',
            note: 'Pago puntual el primer día',
          },
          {
            id: makeId(),
            monthKey,
            date: `${dayPrefix}-03`,
            createdAt: new Date(Date.now() - 400000).toISOString(),
            type: 'expense',
            amount: 170,
            concept: 'Abono mensual Tarjeta de Crédito',
            division: 'deudas',
            pillar: 'patrimonio',
          },
          {
            id: makeId(),
            monthKey,
            date: `${dayPrefix}-05`,
            createdAt: new Date(Date.now() - 300000).toISOString(),
            type: 'expense',
            amount: 200,
            concept: 'Compra mensual ETF S&P 500',
            division: 'inversiones',
            investmentId: invEtfId,
            pillar: 'patrimonio',
            note: 'Aporte programado de inversión',
          },
          {
            id: makeId(),
            monthKey,
            date: `${dayPrefix}-08`,
            createdAt: new Date(Date.now() - 200000).toISOString(),
            type: 'income',
            amount: 180,
            concept: 'Trabajo extra freelance de fin de semana',
            division: 'general',
            pillar: 'ingreso',
            note: 'Incrementa el dinero general del mes',
          },
          {
            id: makeId(),
            monthKey,
            date: today,
            createdAt: new Date(Date.now() - 100000).toISOString(),
            type: 'expense',
            amount: 38,
            concept: 'Cena ramen y café con amigos',
            division: 'bolsillo',
            pillar: 'opcional',
            note: 'Gasto consciente dentro del sobre de bolsillo',
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
    },
    historyLog: [
      {
        id: makeId(),
        timestamp: now,
        monthKey,
        eventType: 'salary_updated',
        title: 'Datos de ejemplo cargados ($2,400/mes)',
        detail: 'Configuración demostrativa con Hogar, Deudas, Manutenciones, 3 Inversiones y Bolsillo.',
        amount: 2400,
      },
      {
        id: makeId(),
        timestamp: firstUseDate,
        monthKey,
        eventType: 'first_day',
        title: 'Día 1 · Inicio de la Libreta Personal',
        detail: 'Registro permanente activado desde el primer día de uso.',
      },
    ],
  };
}

let cachedDb: AppDatabase | null = null;

async function loadDesktopDb(): Promise<AppDatabase> {
  if (cachedDb) return structuredClone(cachedDb);
  const res = await fetch('/api/desktop/db');
  if (res.ok) {
    const text = await res.text();
    if (text && text.trim() && text.trim() !== 'null') {
      try {
        const parsed = JSON.parse(text) as AppDatabase;
        cachedDb = normalizeDb(parsed);
        return structuredClone(cachedDb);
      } catch {
        // Fallback to fresh init if file was empty
      }
    }
  }
  const initial = createInitialDatabaseClient();
  await saveDesktopDb(initial);
  return structuredClone(initial);
}

async function saveDesktopDb(db: AppDatabase): Promise<AppDatabase> {
  db.lastUpdatedAt = new Date().toISOString();
  const normalized = normalizeDb(db);
  cachedDb = structuredClone(normalized);

  const res = await fetch('/api/desktop/db', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(normalized, null, 2),
  });
  if (!res.ok) {
    throw new Error('No se pudo guardar en el disco local.');
  }
  try {
    localStorage.setItem('neon_kakeibo_mirror_v1', JSON.stringify(normalized));
  } catch {
    // Ignore storage quota
  }
  return structuredClone(normalized);
}

export const desktopEngine = {
  async getState(): Promise<AppDatabase> {
    return loadDesktopDb();
  },

  async updateProfile(payload: {
    ledgerName?: string;
    currencyCode?: string;
    currencySymbol?: string;
    currentSalary?: number;
    hasManutencionesDefault?: boolean;
    syncMonthKey?: string;
  }): Promise<AppDatabase> {
    const db = await loadDesktopDb();
    const prevSalary = db.profile.currentSalary;

    if (typeof payload.ledgerName === 'string' && payload.ledgerName.trim()) {
      db.profile.ledgerName = payload.ledgerName.trim();
    }
    if (typeof payload.currencyCode === 'string' && payload.currencyCode.trim()) {
      db.profile.currencyCode = payload.currencyCode.trim();
    }
    if (typeof payload.currencySymbol === 'string' && payload.currencySymbol.trim()) {
      db.profile.currencySymbol = payload.currencySymbol.trim();
    }
    if (typeof payload.hasManutencionesDefault === 'boolean') {
      db.profile.hasManutencionesDefault = payload.hasManutencionesDefault;
    }
    if (
      typeof payload.currentSalary === 'number' &&
      !Number.isNaN(payload.currentSalary) &&
      payload.currentSalary >= 0
    ) {
      db.profile.currentSalary = round2(payload.currentSalary);
      if (Math.abs(db.profile.currentSalary - prevSalary) > 0.009) {
        appendHistory(db, {
          monthKey: payload.syncMonthKey,
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

    if (
      payload.syncMonthKey &&
      db.months[payload.syncMonthKey] &&
      typeof payload.currentSalary === 'number'
    ) {
      db.months[payload.syncMonthKey].salary = round2(payload.currentSalary);
      db.months[payload.syncMonthKey].updatedAt = new Date().toISOString();
    }

    return saveDesktopDb(db);
  },

  async ensureMonth(monthKey: string, bringCarryoverFrom?: string): Promise<AppDatabase> {
    const db = await loadDesktopDb();
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

      const newMonth = createEmptyMonthClient(
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
      appendHistory(db, {
        monthKey,
        eventType: 'month_opened',
        title: `Apertura de libreta: ${formatMonthLabel(monthKey)}`,
        detail: `Salario base del mes: ${db.profile.currencySymbol}${newMonth.salary.toFixed(2)}`,
        amount: newMonth.salary,
      });
      return saveDesktopDb(db);
    }

    if (bringCarryoverFrom && db.months[bringCarryoverFrom]) {
      const allTimeInv = computeAllTimeInvestmentTotals(db);
      const prevSummary = computeMonthSummary(
        db.months[bringCarryoverFrom],
        db.investments,
        allTimeInv
      );
      db.months[monthKey].carryover = round2(prevSummary.currentGeneralBalance);
      db.months[monthKey].updatedAt = new Date().toISOString();
      return saveDesktopDb(db);
    }

    return db;
  },

  async updateMonthPlan(
    monthKey: string,
    payload: {
      salary?: number;
      carryover?: number;
      hasManutenciones?: boolean;
      allocations?: MonthAllocations;
      reflection?: Partial<MonthReflection>;
      alsoUpdateCurrentSalary?: boolean;
    }
  ): Promise<AppDatabase> {
    const db = await loadDesktopDb();
    const month = db.months[monthKey];
    if (!month) throw new Error('El mes solicitado no existe.');

    if (typeof payload.salary === 'number' && !Number.isNaN(payload.salary) && payload.salary >= 0) {
      month.salary = round2(payload.salary);
      if (payload.alsoUpdateCurrentSalary) {
        const prev = db.profile.currentSalary;
        db.profile.currentSalary = round2(payload.salary);
        if (Math.abs(prev - month.salary) > 0.009) {
          appendHistory(db, {
            monthKey,
            eventType: 'salary_updated',
            title: `Salario actual fijado en ${db.profile.currencySymbol}${month.salary.toFixed(2)}`,
            detail: `Actualizado desde la planificación de ${formatMonthLabel(monthKey)}.`,
            amount: month.salary,
          });
        }
      }
    }

    if (typeof payload.carryover === 'number' && !Number.isNaN(payload.carryover)) {
      month.carryover = round2(payload.carryover);
    }

    if (typeof payload.hasManutenciones === 'boolean') {
      month.hasManutenciones = payload.hasManutenciones;
      db.profile.hasManutencionesDefault = payload.hasManutenciones;
    }

    if (payload.allocations) {
      month.allocations = {
        hogar: round2(Number(payload.allocations.hogar) || 0),
        deudas: round2(Number(payload.allocations.deudas) || 0),
        manutenciones: round2(Number(payload.allocations.manutenciones) || 0),
        hogarItems: Array.isArray(payload.allocations.hogarItems)
          ? payload.allocations.hogarItems
          : month.allocations.hogarItems,
        deudasItems: Array.isArray(payload.allocations.deudasItems)
          ? payload.allocations.deudasItems
          : month.allocations.deudasItems,
        manutencionesItems: Array.isArray(payload.allocations.manutencionesItems)
          ? payload.allocations.manutencionesItems
          : month.allocations.manutencionesItems,
        investmentTargets:
          payload.allocations.investmentTargets &&
          typeof payload.allocations.investmentTargets === 'object'
            ? payload.allocations.investmentTargets
            : month.allocations.investmentTargets,
        customEnvelopes: Array.isArray(payload.allocations.customEnvelopes)
          ? payload.allocations.customEnvelopes
          : month.allocations.customEnvelopes,
      };
    }

    if (payload.reflection) {
      month.reflection = { ...month.reflection, ...payload.reflection };
    }

    month.updatedAt = new Date().toISOString();
    return saveDesktopDb(db);
  },

  async addEntry(
    monthKey: string,
    payload: {
      date: string;
      type: EntryType;
      amount: number;
      concept: string;
      division: string;
      investmentId?: string;
      pillar: KakeiboPillar;
      note?: string;
    }
  ): Promise<AppDatabase> {
    const db = await loadDesktopDb();
    if (!db.months[monthKey]) {
      db.months[monthKey] = createEmptyMonthClient(
        monthKey,
        db.profile.currentSalary,
        db.profile.hasManutencionesDefault
      );
    }
    const month = db.months[monthKey];
    const numericAmount = round2(Math.abs(Number(payload.amount) || 0));
    if (numericAmount <= 0) throw new Error('El monto debe ser mayor que cero.');

    const entry: LedgerEntry = {
      id: makeId(),
      monthKey,
      date:
        typeof payload.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payload.date)
          ? payload.date
          : getTodayDateString(),
      createdAt: new Date().toISOString(),
      type: payload.type || 'expense',
      amount: numericAmount,
      concept: (payload.concept || '').trim() || 'Movimiento sin título',
      division: payload.division || 'general',
      investmentId: payload.division === 'inversiones' ? payload.investmentId : undefined,
      pillar: payload.pillar || 'supervivencia',
      note: payload.note?.trim() || undefined,
    };

    month.entries.push(entry);
    month.updatedAt = new Date().toISOString();
    return saveDesktopDb(db);
  },

  async updateEntry(
    monthKey: string,
    entryId: string,
    payload: {
      date?: string;
      type?: EntryType;
      amount?: number;
      concept?: string;
      division?: string;
      investmentId?: string;
      pillar?: KakeiboPillar;
      note?: string;
    }
  ): Promise<AppDatabase> {
    const db = await loadDesktopDb();
    const month = db.months[monthKey];
    if (!month) throw new Error('Mes no encontrado.');
    const idx = month.entries.findIndex((e) => e.id === entryId);
    if (idx === -1) throw new Error('Registro no encontrado.');

    const existing = month.entries[idx];
    const numericAmount =
      payload.amount !== undefined
        ? round2(Math.abs(Number(payload.amount) || 0))
        : existing.amount;
    const nextDivision = payload.division ?? existing.division;

    month.entries[idx] = {
      ...existing,
      date:
        typeof payload.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payload.date)
          ? payload.date
          : existing.date,
      type: payload.type ?? existing.type,
      amount: numericAmount,
      concept: payload.concept?.trim() || existing.concept,
      division: nextDivision,
      investmentId: nextDivision === 'inversiones' ? payload.investmentId : undefined,
      pillar: payload.pillar ?? existing.pillar,
      note: typeof payload.note === 'string' ? payload.note.trim() || undefined : existing.note,
    };
    month.updatedAt = new Date().toISOString();
    return saveDesktopDb(db);
  },

  async deleteEntry(monthKey: string, entryId: string): Promise<AppDatabase> {
    const db = await loadDesktopDb();
    const month = db.months[monthKey];
    if (!month) throw new Error('Mes no encontrado.');
    month.entries = month.entries.filter((e) => e.id !== entryId);
    month.updatedAt = new Date().toISOString();
    return saveDesktopDb(db);
  },

  async adjustGeneralBalance(
    monthKey: string,
    payload: {
      mode: 'delta' | 'target';
      delta?: number;
      targetBalance?: number;
      reason?: string;
      date?: string;
    }
  ): Promise<AppDatabase> {
    const db = await loadDesktopDb();
    if (!db.months[monthKey]) {
      db.months[monthKey] = createEmptyMonthClient(
        monthKey,
        db.profile.currentSalary,
        db.profile.hasManutencionesDefault
      );
    }
    const month = db.months[monthKey];
    const allTimeInv = computeAllTimeInvestmentTotals(db);
    const summary = computeMonthSummary(month, db.investments, allTimeInv);

    let signedDiff = 0;
    if (payload.mode === 'target') {
      const desired = round2(Number(payload.targetBalance) || 0);
      signedDiff = round2(desired - summary.currentGeneralBalance);
    } else {
      signedDiff = round2(Number(payload.delta) || 0);
    }

    if (Math.abs(signedDiff) < 0.01) return db;

    const isUp = signedDiff > 0;
    const magnitude = round2(Math.abs(signedDiff));
    const entryConcept =
      payload.reason?.trim() ||
      (payload.mode === 'target'
        ? `Arqueo de dinero general (${isUp ? '+' : '-'}${db.profile.currencySymbol}${magnitude.toFixed(2)})`
        : isUp
        ? 'Incremento directo al dinero general del mes'
        : 'Reducción directa al dinero general del mes');

    month.entries.push({
      id: makeId(),
      monthKey,
      date:
        typeof payload.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payload.date)
          ? payload.date
          : getTodayDateString(),
      createdAt: new Date().toISOString(),
      type: isUp ? 'adjustment_up' : 'adjustment_down',
      amount: magnitude,
      concept: entryConcept,
      division: 'general',
      pillar: 'ajuste',
      note:
        payload.mode === 'target'
          ? `Cuadre de saldo desde ${db.profile.currencySymbol}${summary.currentGeneralBalance.toFixed(2)} hacia ${db.profile.currencySymbol}${(summary.currentGeneralBalance + signedDiff).toFixed(2)}`
          : undefined,
    });
    month.updatedAt = new Date().toISOString();

    appendHistory(db, {
      monthKey,
      eventType: 'balance_adjusted',
      title: `${isUp ? 'Aumento' : 'Disminución'} de Dinero General (${isUp ? '+' : '-'}${db.profile.currencySymbol}${magnitude.toFixed(2)})`,
      detail: `${formatMonthLabel(monthKey)} · ${entryConcept}`,
      amount: signedDiff,
    });

    return saveDesktopDb(db);
  },

  async createInvestment(payload: {
    name: string;
    category: InvestmentCategory;
    monthlyTarget: number;
    platform?: string;
    notes?: string;
    monthKey?: string;
  }): Promise<AppDatabase> {
    const db = await loadDesktopDb();
    const target = round2(Math.max(0, Number(payload.monthlyTarget) || 0));
    const inv: InvestmentDefinition = {
      id: makeId(),
      name: payload.name.trim(),
      category: payload.category || 'otro',
      monthlyTarget: target,
      platform: payload.platform?.trim() || undefined,
      notes: payload.notes?.trim() || undefined,
      active: true,
      createdAt: new Date().toISOString(),
    };

    db.investments.push(inv);
    if (payload.monthKey && db.months[payload.monthKey]) {
      db.months[payload.monthKey].allocations.investmentTargets[inv.id] = target;
      db.months[payload.monthKey].updatedAt = new Date().toISOString();
    }

    appendHistory(db, {
      monthKey: payload.monthKey,
      eventType: 'investment_created',
      title: `Nueva inversión definida: ${inv.name}`,
      detail: `Meta mensual: ${db.profile.currencySymbol}${target.toFixed(2)}${inv.platform ? ` · Plataforma: ${inv.platform}` : ''}`,
      amount: target,
    });

    return saveDesktopDb(db);
  },

  async updateInvestment(
    id: string,
    payload: {
      name?: string;
      category?: InvestmentCategory;
      monthlyTarget?: number;
      platform?: string;
      notes?: string;
      active?: boolean;
      monthKey?: string;
    }
  ): Promise<AppDatabase> {
    const db = await loadDesktopDb();
    const inv = db.investments.find((i) => i.id === id);
    if (!inv) throw new Error('Inversión no encontrada.');

    if (typeof payload.name === 'string' && payload.name.trim()) inv.name = payload.name.trim();
    if (payload.category) inv.category = payload.category;
    if (payload.monthlyTarget !== undefined) {
      inv.monthlyTarget = round2(Math.max(0, Number(payload.monthlyTarget) || 0));
      if (payload.monthKey && db.months[payload.monthKey]) {
        db.months[payload.monthKey].allocations.investmentTargets[inv.id] = inv.active
          ? inv.monthlyTarget
          : 0;
        db.months[payload.monthKey].updatedAt = new Date().toISOString();
      }
    }
    if (payload.platform !== undefined) inv.platform = payload.platform.trim() || undefined;
    if (payload.notes !== undefined) inv.notes = payload.notes.trim() || undefined;
    if (typeof payload.active === 'boolean') {
      inv.active = payload.active;
      if (payload.monthKey && db.months[payload.monthKey] && !payload.active) {
        delete db.months[payload.monthKey].allocations.investmentTargets[inv.id];
      }
    }

    return saveDesktopDb(db);
  },

  async deleteInvestment(id: string): Promise<AppDatabase> {
    const db = await loadDesktopDb();
    const inv = db.investments.find((i) => i.id === id);
    if (!inv) throw new Error('Inversión no encontrada.');

    const hasEntries = Object.values(db.months).some((m) =>
      m.entries.some((e) => e.investmentId === id)
    );

    if (hasEntries) {
      inv.active = false;
    } else {
      db.investments = db.investments.filter((i) => i.id !== id);
    }

    for (const m of Object.values(db.months)) {
      delete m.allocations.investmentTargets[id];
    }

    appendHistory(db, {
      eventType: 'investment_removed',
      title: `Inversión retirada: ${inv.name}`,
      detail: hasEntries
        ? 'Archivada conservando el historial de aportes realizados.'
        : 'Eliminada del listado de inversiones.',
    });

    return saveDesktopDb(db);
  },

  async loadDemo(): Promise<AppDatabase> {
    const current = await loadDesktopDb();
    const demo = createDemoDatabase(current.firstUseDate);
    return saveDesktopDb(demo);
  },

  async resetDatabase(): Promise<AppDatabase> {
    const fresh = createInitialDatabaseClient();
    return saveDesktopDb(fresh);
  },

  async importBackup(incoming: AppDatabase): Promise<AppDatabase> {
    appendHistory(incoming, {
      eventType: 'backup_restored',
      title: 'Respaldo restaurado exitosamente',
      detail: 'Se importó el registro histórico completo de la libreta.',
    });
    return saveDesktopDb(incoming);
  },
};
