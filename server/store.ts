import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  AppDatabase,
  HistoricalEvent,
  MonthRecord,
} from '../shared/types';
import { getCurrentMonthKey, getTodayDateString } from '../shared/calculations';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'kakeibo-store.json');
const DB_TMP_PATH = path.join(DATA_DIR, 'kakeibo-store.tmp.json');
const DB_BAK_PATH = path.join(DATA_DIR, 'kakeibo-store.bak.json');

export function createEmptyMonth(
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
        ? templateMonth.allocations.hogarItems.map((i) => ({ ...i, id: crypto.randomUUID() }))
        : [],
      deudasItems: templateMonth
        ? templateMonth.allocations.deudasItems.map((i) => ({ ...i, id: crypto.randomUUID() }))
        : [],
      manutencionesItems: templateMonth
        ? templateMonth.allocations.manutencionesItems.map((i) => ({
            ...i,
            id: crypto.randomUUID(),
          }))
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

export function createInitialDatabase(): AppDatabase {
  const now = new Date().toISOString();
  const currentMonth = getCurrentMonthKey();

  const firstEvent: HistoricalEvent = {
    id: crypto.randomUUID(),
    timestamp: now,
    monthKey: currentMonth,
    eventType: 'first_day',
    title: 'Día 1 · Inicio de la Libreta Personal',
    detail:
      'Se inauguró el registro histórico permanente de finanzas mensuales (estilo Kakeibo · Gagyebu · Ji Zhang Ben).',
  };

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
      [currentMonth]: createEmptyMonth(currentMonth, 0, false),
    },
    historyLog: [firstEvent],
  };
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function loadDatabase(): AppDatabase {
  ensureDataDir();
  if (!fs.existsSync(DB_PATH)) {
    const initial = createInitialDatabase();
    saveDatabase(initial);
    return initial;
  }

  try {
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as AppDatabase;
    return normalizeDatabase(parsed);
  } catch (err) {
    if (fs.existsSync(DB_BAK_PATH)) {
      const bakRaw = fs.readFileSync(DB_BAK_PATH, 'utf-8');
      const parsedBak = JSON.parse(bakRaw) as AppDatabase;
      return normalizeDatabase(parsedBak);
    }
    const fresh = createInitialDatabase();
    saveDatabase(fresh);
    return fresh;
  }
}

export function saveDatabase(db: AppDatabase): AppDatabase {
  ensureDataDir();
  db.lastUpdatedAt = new Date().toISOString();
  const serialized = JSON.stringify(db, null, 2);

  if (fs.existsSync(DB_PATH)) {
    try {
      fs.copyFileSync(DB_PATH, DB_BAK_PATH);
    } catch {
      // Ignore backup copy errors
    }
  }

  fs.writeFileSync(DB_TMP_PATH, serialized, 'utf-8');
  fs.renameSync(DB_TMP_PATH, DB_PATH);
  return db;
}

function normalizeDatabase(db: AppDatabase): AppDatabase {
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
    db.months[currentMonth] = createEmptyMonth(
      currentMonth,
      db.profile.currentSalary,
      db.profile.hasManutencionesDefault,
      prevTemplate
    );
  }

  return db;
}

export function appendHistoryEvent(
  db: AppDatabase,
  event: Omit<HistoricalEvent, 'id' | 'timestamp'>
): void {
  db.historyLog.unshift({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...event,
  });
  // Keep up to 1000 historical milestone events
  if (db.historyLog.length > 1000) {
    db.historyLog = db.historyLog.slice(0, 1000);
  }
}

export function populateDemoData(existingFirstUseDate?: string): AppDatabase {
  const now = new Date().toISOString();
  const firstUseDate = existingFirstUseDate || now;
  const monthKey = getCurrentMonthKey();
  const today = getTodayDateString();
  const [y, m] = monthKey.split('-');
  const dayPrefix = `${y}-${m}`;

  const invEtfId = crypto.randomUUID();
  const invBtcId = crypto.randomUUID();
  const invFondoId = crypto.randomUUID();

  const demoMonth: MonthRecord = {
    monthKey,
    salary: 2400,
    carryover: 0,
    hasManutenciones: true,
    allocations: {
      hogar: 850,
      deudas: 320,
      manutenciones: 250,
      hogarItems: [
        { id: crypto.randomUUID(), name: 'Alquiler / Vivienda', amount: 500 },
        { id: crypto.randomUUID(), name: 'Supermercado y Despensa', amount: 230 },
        { id: crypto.randomUUID(), name: 'Luz, Agua e Internet', amount: 120 },
      ],
      deudasItems: [
        { id: crypto.randomUUID(), name: 'Tarjeta de Crédito', amount: 170 },
        { id: crypto.randomUUID(), name: 'Cuota Préstamo Personal', amount: 150 },
      ],
      manutencionesItems: [
        { id: crypto.randomUUID(), name: 'Apoyo familiar mensual', amount: 250 },
      ],
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
        id: crypto.randomUUID(),
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
        id: crypto.randomUUID(),
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
        id: crypto.randomUUID(),
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
        id: crypto.randomUUID(),
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
        id: crypto.randomUUID(),
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
  };

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
      [monthKey]: demoMonth,
    },
    historyLog: [
      {
        id: crypto.randomUUID(),
        timestamp: now,
        monthKey,
        eventType: 'salary_updated',
        title: 'Datos de ejemplo cargados ($2,400/mes)',
        detail: 'Configuración demostrativa con Hogar, Deudas, Manutenciones, 3 Inversiones y Bolsillo.',
        amount: 2400,
      },
      {
        id: crypto.randomUUID(),
        timestamp: firstUseDate,
        monthKey,
        eventType: 'first_day',
        title: 'Día 1 · Inicio de la Libreta Personal',
        detail: 'Registro permanente activado desde el primer día de uso.',
      },
    ],
  };
}
