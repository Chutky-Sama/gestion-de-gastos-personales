import {
  computeAllTimeInvestmentTotals,
  computeMonthSummary,
  formatMonthLabel,
  getCurrentMonthKey,
  getTodayDateString,
  hasRealUserData,
  resolveMonthOpeningSplits,
  round2,
} from './calculations';
import { findCurrencyOption } from './currencies';
import {
  AppDatabase,
  CurrencyLedgerWorkspace,
  EntryType,
  ExchangeControlState,
  HistoricalEvent,
  InvestmentCategory,
  InvestmentDefinition,
  KakeiboPillar,
  LedgerEntry,
  ManualCurrencyRate,
  MonthAllocations,
  MonthRecord,
  MonthReflection,
  PaymentMethod,
  TransferDirection,
} from './types';

export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

export function createEmptyMonthCore(
  monthKey: string,
  salaryEfectivo: number,
  salaryTransferencia: number,
  hasManutenciones: boolean,
  templateMonth?: MonthRecord
): MonthRecord {
  const now = new Date().toISOString();
  const salEf = round2(Math.max(0, salaryEfectivo || 0));
  const salTr = round2(Math.max(0, salaryTransferencia || 0));
  return {
    monthKey,
    salary: round2(salEf + salTr),
    salaryEfectivo: salEf,
    salaryTransferencia: salTr,
    carryover: 0,
    carryoverEfectivo: 0,
    carryoverTransferencia: 0,
    hasManutenciones: templateMonth ? templateMonth.hasManutenciones : hasManutenciones,
    allocations: {
      hogar: templateMonth ? templateMonth.allocations.hogar : 0,
      deudas: templateMonth ? templateMonth.allocations.deudas : 0,
      manutenciones: templateMonth ? templateMonth.allocations.manutenciones : 0,
      hogarItems: templateMonth
        ? templateMonth.allocations.hogarItems.map((i) => ({ ...i, id: generateId() }))
        : [],
      deudasItems: templateMonth
        ? templateMonth.allocations.deudasItems.map((i) => ({ ...i, id: generateId() }))
        : [],
      manutencionesItems: templateMonth
        ? templateMonth.allocations.manutencionesItems.map((i) => ({ ...i, id: generateId() }))
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

export function createEmptyCurrencyWorkspace(code: string): CurrencyLedgerWorkspace {
  const opt = findCurrencyOption(code);
  const currentMonth = getCurrentMonthKey();
  return {
    currencyCode: opt.code,
    currencySymbol: opt.symbol,
    currentSalary: 0,
    currentSalaryEfectivo: 0,
    currentSalaryTransferencia: 0,
    hasManutencionesDefault: false,
    investments: [],
    months: {
      [currentMonth]: createEmptyMonthCore(currentMonth, 0, 0, false),
    },
  };
}

export function createInitialExchangeControl(nowIso?: string): ExchangeControlState {
  const now = nowIso || new Date().toISOString();
  const makeEmptyRate = (code: string): ManualCurrencyRate => ({
    currencyCode: code,
    rateEfectivo: 0,
    rateTransferencia: 0,
    useSeparateChannels: false,
    updatedAt: now,
  });

  return {
    baseCurrency: 'CUP',
    rates: {
      USD: makeEmptyRate('USD'),
      MLC: makeEmptyRate('MLC'),
      EUR: makeEmptyRate('EUR'),
    },
    rateHistory: [],
    operations: [],
  };
}

export function createInitialDatabaseCore(opts?: {
  demoUsed?: boolean;
  demoResetUsed?: boolean;
}): AppDatabase {
  const now = new Date().toISOString();
  const currentMonth = getCurrentMonthKey();

  const cupWs = createEmptyCurrencyWorkspace('CUP');
  const usdWs = createEmptyCurrencyWorkspace('USD');

  const db: AppDatabase = {
    version: 2,
    firstUseDate: now,
    lastUpdatedAt: now,
    demoUsed: Boolean(opts?.demoUsed),
    isDemoActive: false,
    demoResetUsed: Boolean(opts?.demoResetUsed),
    profile: {
      ledgerName: 'Mi Libreta Kakeibo',
      currencyCode: 'CUP',
      currencySymbol: cupWs.currencySymbol,
      enabledCurrencies: ['CUP', 'USD'],
      currentSalary: 0,
      currentSalaryEfectivo: 0,
      currentSalaryTransferencia: 0,
      hasManutencionesDefault: false,
    },
    investments: cupWs.investments,
    months: cupWs.months,
    currencyWorkspaces: {
      CUP: cupWs,
      USD: usdWs,
    },
    exchangeControl: createInitialExchangeControl(now),
    historyLog: [
      {
        id: generateId(),
        timestamp: now,
        monthKey: currentMonth,
        currencyCode: 'CUP',
        eventType: 'first_day',
        title: 'Día 1 · Inicio de tu Libreta Personal',
        detail:
          'Registro permanente activado en paralelo para Efectivo y Transferencia (CUP y USD listos).',
      },
    ],
  };

  return syncActiveWorkspaceMirrors(db);
}

export function syncActiveWorkspaceMirrors(db: AppDatabase): AppDatabase {
  const activeCode = db.profile.currencyCode || 'CUP';
  if (!db.currencyWorkspaces[activeCode]) {
    db.currencyWorkspaces[activeCode] = createEmptyCurrencyWorkspace(activeCode);
  }
  const ws = db.currencyWorkspaces[activeCode];

  const currentMonth = getCurrentMonthKey();
  if (!ws.months[currentMonth]) {
    const sortedKeys = Object.keys(ws.months).sort();
    const prevTemplate =
      sortedKeys.length > 0 ? ws.months[sortedKeys[sortedKeys.length - 1]] : undefined;
    ws.months[currentMonth] = createEmptyMonthCore(
      currentMonth,
      ws.currentSalaryEfectivo,
      ws.currentSalaryTransferencia,
      ws.hasManutencionesDefault,
      prevTemplate
    );
  }

  db.profile.currencySymbol = ws.currencySymbol;
  db.profile.currentSalaryEfectivo = round2(ws.currentSalaryEfectivo || 0);
  db.profile.currentSalaryTransferencia = round2(ws.currentSalaryTransferencia || 0);
  db.profile.currentSalary = round2(
    db.profile.currentSalaryEfectivo + db.profile.currentSalaryTransferencia
  );
  ws.currentSalary = db.profile.currentSalary;
  db.profile.hasManutencionesDefault = ws.hasManutencionesDefault;

  db.investments = ws.investments;
  db.months = ws.months;
  return db;
}

function normalizeMonthRecord(m: MonthRecord): MonthRecord {
  const splits = resolveMonthOpeningSplits(m);
  m.salaryEfectivo = splits.salaryEfectivo;
  m.salaryTransferencia = splits.salaryTransferencia;
  m.salary = splits.salaryTotal;
  m.carryoverEfectivo = splits.carryoverEfectivo;
  m.carryoverTransferencia = splits.carryoverTransferencia;
  m.carryover = splits.carryoverTotal;

  if (!Array.isArray(m.entries)) m.entries = [];
  m.entries = m.entries.map((e) => ({
    ...e,
    paymentMethod: e.paymentMethod === 'transferencia' ? 'transferencia' : 'efectivo',
  }));
  return m;
}

export function normalizeDatabaseCore(raw: Partial<AppDatabase>): AppDatabase {
  const now = new Date().toISOString();
  const db = raw as AppDatabase;

  if (!db.firstUseDate) db.firstUseDate = now;
  if (typeof db.demoUsed !== 'boolean') db.demoUsed = false;
  if (typeof db.isDemoActive !== 'boolean') db.isDemoActive = false;
  if (typeof db.demoResetUsed !== 'boolean') db.demoResetUsed = false;
  if (!Array.isArray(db.historyLog)) db.historyLog = [];

  if (!db.profile) {
    db.profile = {
      ledgerName: 'Mi Libreta Kakeibo',
      currencyCode: 'CUP',
      currencySymbol: '$',
      enabledCurrencies: ['CUP', 'USD'],
      currentSalary: 0,
      currentSalaryEfectivo: 0,
      currentSalaryTransferencia: 0,
      hasManutencionesDefault: false,
    };
  }

  if (!Array.isArray(db.profile.enabledCurrencies) || db.profile.enabledCurrencies.length === 0) {
    const initialCodes = ['CUP', 'USD'];
    if (db.profile.currencyCode && !initialCodes.includes(db.profile.currencyCode)) {
      initialCodes.unshift(db.profile.currencyCode);
    }
    db.profile.enabledCurrencies = initialCodes;
  }

  // Migrate v1 database into currencyWorkspaces if needed
  if (!db.currencyWorkspaces || typeof db.currencyWorkspaces !== 'object') {
    db.currencyWorkspaces = {};
    const legacyCode = db.profile.currencyCode || 'USD';
    const opt = findCurrencyOption(legacyCode);
    const legacySalEf =
      db.profile.currentSalaryEfectivo !== undefined
        ? Number(db.profile.currentSalaryEfectivo) || 0
        : Number(db.profile.currentSalary) || 0;
    const legacySalTr = Number(db.profile.currentSalaryTransferencia) || 0;

    const migratedMonths: Record<string, MonthRecord> = {};
    if (db.months && typeof db.months === 'object') {
      for (const [mk, mRec] of Object.entries(db.months)) {
        migratedMonths[mk] = normalizeMonthRecord(mRec);
      }
    }

    const hasLegacyContent =
      legacySalEf + legacySalTr > 0 ||
      (Array.isArray(db.investments) && db.investments.length > 0) ||
      Object.values(migratedMonths).some((m) => m.salary > 0 || m.entries.length > 0);

    db.currencyWorkspaces[legacyCode] = {
      currencyCode: legacyCode,
      currencySymbol: db.profile.currencySymbol || opt.symbol,
      currentSalary: round2(legacySalEf + legacySalTr),
      currentSalaryEfectivo: round2(legacySalEf),
      currentSalaryTransferencia: round2(legacySalTr),
      hasManutencionesDefault: Boolean(db.profile.hasManutencionesDefault),
      investments: Array.isArray(db.investments) ? db.investments : [],
      months: migratedMonths,
    };

    if (!hasLegacyContent) {
      db.profile.currencyCode = 'CUP';
    }
  }

  // Ensure enabled currencies exist in currencyWorkspaces
  for (const code of db.profile.enabledCurrencies) {
    if (!db.currencyWorkspaces[code]) {
      db.currencyWorkspaces[code] = createEmptyCurrencyWorkspace(code);
    } else {
      const ws = db.currencyWorkspaces[code];
      const opt = findCurrencyOption(code);
      if (!ws.currencySymbol) ws.currencySymbol = opt.symbol;
      if (!Array.isArray(ws.investments)) ws.investments = [];
      if (!ws.months || typeof ws.months !== 'object') ws.months = {};
      for (const mk of Object.keys(ws.months)) {
        ws.months[mk] = normalizeMonthRecord(ws.months[mk]);
      }
    }
  }

  if (!db.profile.enabledCurrencies.includes(db.profile.currencyCode)) {
    db.profile.currencyCode = db.profile.enabledCurrencies[0] || 'CUP';
  }

  // Normalize 100% offline ExchangeControlState (Base CUP)
  if (!db.exchangeControl || typeof db.exchangeControl !== 'object') {
    db.exchangeControl = createInitialExchangeControl(now);
  } else {
    db.exchangeControl.baseCurrency = 'CUP';
    if (!db.exchangeControl.rates || typeof db.exchangeControl.rates !== 'object') {
      db.exchangeControl.rates = {};
    }
    if (!Array.isArray(db.exchangeControl.rateHistory)) {
      db.exchangeControl.rateHistory = [];
    }
    if (!Array.isArray(db.exchangeControl.operations)) {
      db.exchangeControl.operations = [];
    }

    const defaultBoardCodes = Array.from(
      new Set([
        'USD',
        'MLC',
        'EUR',
        ...db.profile.enabledCurrencies.filter((c) => c !== 'CUP'),
        ...Object.keys(db.exchangeControl.rates),
      ])
    ).filter((c) => c && c !== 'CUP');

    for (const code of defaultBoardCodes) {
      const existing = db.exchangeControl.rates[code];
      if (!existing) {
        db.exchangeControl.rates[code] = {
          currencyCode: code,
          rateEfectivo: 0,
          rateTransferencia: 0,
          useSeparateChannels: false,
          updatedAt: now,
        };
      } else {
        const ef = round2(Math.max(0, Number(existing.rateEfectivo) || 0));
        const useSep = Boolean(existing.useSeparateChannels);
        const tr = useSep
          ? round2(Math.max(0, Number(existing.rateTransferencia) || 0))
          : ef;
        db.exchangeControl.rates[code] = {
          currencyCode: code,
          rateEfectivo: ef,
          rateTransferencia: tr,
          useSeparateChannels: useSep,
          updatedAt: existing.updatedAt || now,
          note: existing.note,
        };
      }
    }
  }

  db.version = 2;
  syncActiveWorkspaceMirrors(db);

  // Lock demoUsed automatically if real user data already exists
  if (!db.isDemoActive && hasRealUserData(db)) {
    db.demoUsed = true;
  }

  return db;
}

export function appendHistoryCore(
  db: AppDatabase,
  event: Omit<HistoricalEvent, 'id' | 'timestamp'>
): void {
  db.historyLog.unshift({
    id: generateId(),
    timestamp: new Date().toISOString(),
    ...event,
  });
  if (db.historyLog.length > 1000) {
    db.historyLog = db.historyLog.slice(0, 1000);
  }
}

function lockDemoIfRealMutation(db: AppDatabase): void {
  if (!db.isDemoActive) {
    db.demoUsed = true;
  }
}

export function canStartDemo(db: AppDatabase): boolean {
  return !db.demoUsed && !db.isDemoActive && !hasRealUserData(db);
}

export function canExitDemoReset(db: AppDatabase): boolean {
  return db.isDemoActive === true && db.demoResetUsed === false;
}

export function getActiveWorkspace(db: AppDatabase): CurrencyLedgerWorkspace {
  const code = db.profile?.currencyCode || 'CUP';
  if (db.currencyWorkspaces && db.currencyWorkspaces[code]) {
    return db.currencyWorkspaces[code];
  }
  const first = Object.values(db.currencyWorkspaces || {})[0];
  return first || createEmptyCurrencyWorkspace(code);
}

export function applySelectCurrency(db: AppDatabase, currencyCode: string): AppDatabase {
  const opt = findCurrencyOption(currencyCode);
  if (!db.profile.enabledCurrencies.includes(opt.code)) {
    db.profile.enabledCurrencies.push(opt.code);
  }
  if (!db.currencyWorkspaces[opt.code]) {
    db.currencyWorkspaces[opt.code] = createEmptyCurrencyWorkspace(opt.code);
  }
  db.profile.currencyCode = opt.code;
  return syncActiveWorkspaceMirrors(db);
}

export function applyUpdateEnabledCurrencies(
  db: AppDatabase,
  codes: string[],
  activeCode?: string
): AppDatabase {
  const clean = Array.from(new Set(codes.filter(Boolean)));
  if (clean.length === 0) clean.push('CUP');

  db.profile.enabledCurrencies = clean;
  for (const c of clean) {
    if (!db.currencyWorkspaces[c]) {
      db.currencyWorkspaces[c] = createEmptyCurrencyWorkspace(c);
    }
  }
  if (activeCode && clean.includes(activeCode)) {
    db.profile.currencyCode = activeCode;
  } else if (!clean.includes(db.profile.currencyCode)) {
    db.profile.currencyCode = clean[0];
  }
  return syncActiveWorkspaceMirrors(db);
}

export function applyUpdateProfile(
  db: AppDatabase,
  payload: {
    ledgerName?: string;
    currencyCode?: string;
    enabledCurrencies?: string[];
    currentSalaryEfectivo?: number;
    currentSalaryTransferencia?: number;
    currentSalary?: number;
    hasManutencionesDefault?: boolean;
    syncMonthKey?: string;
  }
): AppDatabase {
  if (Array.isArray(payload.enabledCurrencies) && payload.enabledCurrencies.length > 0) {
    applyUpdateEnabledCurrencies(db, payload.enabledCurrencies, payload.currencyCode);
  } else if (payload.currencyCode) {
    applySelectCurrency(db, payload.currencyCode);
  }

  const ws = db.currencyWorkspaces[db.profile.currencyCode];
  const prevTotal = round2(ws.currentSalaryEfectivo + ws.currentSalaryTransferencia);

  if (typeof payload.ledgerName === 'string' && payload.ledgerName.trim()) {
    db.profile.ledgerName = payload.ledgerName.trim();
  }

  if (typeof payload.hasManutencionesDefault === 'boolean') {
    ws.hasManutencionesDefault = payload.hasManutencionesDefault;
  }

  if (
    payload.currentSalaryEfectivo !== undefined ||
    payload.currentSalaryTransferencia !== undefined
  ) {
    ws.currentSalaryEfectivo = round2(Math.max(0, Number(payload.currentSalaryEfectivo) || 0));
    ws.currentSalaryTransferencia = round2(
      Math.max(0, Number(payload.currentSalaryTransferencia) || 0)
    );
    ws.currentSalary = round2(ws.currentSalaryEfectivo + ws.currentSalaryTransferencia);
  } else if (typeof payload.currentSalary === 'number' && payload.currentSalary >= 0) {
    ws.currentSalaryEfectivo = round2(payload.currentSalary);
    ws.currentSalaryTransferencia = 0;
    ws.currentSalary = round2(payload.currentSalary);
  }

  const newTotal = ws.currentSalary;
  if (newTotal > 0) {
    lockDemoIfRealMutation(db);
  }

  if (Math.abs(newTotal - prevTotal) > 0.009) {
    appendHistoryCore(db, {
      monthKey: payload.syncMonthKey,
      currencyCode: ws.currencyCode,
      eventType: 'salary_updated',
      title: `Salario (${ws.currencyCode}) fijado en ${ws.currencySymbol}${newTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      detail: `Efectivo: ${ws.currencySymbol}${ws.currentSalaryEfectivo.toFixed(2)} · Transferencia: ${ws.currencySymbol}${ws.currentSalaryTransferencia.toFixed(2)}`,
      amount: newTotal,
    });
  }

  if (payload.syncMonthKey && ws.months[payload.syncMonthKey]) {
    const m = ws.months[payload.syncMonthKey];
    m.salaryEfectivo = ws.currentSalaryEfectivo;
    m.salaryTransferencia = ws.currentSalaryTransferencia;
    m.salary = ws.currentSalary;
    if (typeof payload.hasManutencionesDefault === 'boolean') {
      m.hasManutenciones = payload.hasManutencionesDefault;
    }
    m.updatedAt = new Date().toISOString();
  }

  return syncActiveWorkspaceMirrors(db);
}

export function applyEnsureMonth(
  db: AppDatabase,
  monthKey: string,
  bringCarryoverFrom?: string
): AppDatabase {
  const ws = db.currencyWorkspaces[db.profile.currencyCode];

  if (!ws.months[monthKey]) {
    const sortedKeys = Object.keys(ws.months)
      .filter((k) => k < monthKey)
      .sort();
    const fallbackKeys = Object.keys(ws.months).sort();
    const templateKey =
      sortedKeys.length > 0
        ? sortedKeys[sortedKeys.length - 1]
        : fallbackKeys[fallbackKeys.length - 1];
    const templateMonth = templateKey ? ws.months[templateKey] : undefined;

    const newMonth = createEmptyMonthCore(
      monthKey,
      ws.currentSalaryEfectivo,
      ws.currentSalaryTransferencia,
      ws.hasManutencionesDefault,
      templateMonth
    );

    if (bringCarryoverFrom && ws.months[bringCarryoverFrom]) {
      const allTimeInv = computeAllTimeInvestmentTotals(ws.months, ws.investments);
      const prevSummary = computeMonthSummary(
        ws.months[bringCarryoverFrom],
        ws.investments,
        allTimeInv
      );
      newMonth.carryoverEfectivo = round2(prevSummary.currentEfectivoBalance);
      newMonth.carryoverTransferencia = round2(prevSummary.currentTransferenciaBalance);
      newMonth.carryover = round2(
        newMonth.carryoverEfectivo + newMonth.carryoverTransferencia
      );
    }

    ws.months[monthKey] = newMonth;
    appendHistoryCore(db, {
      monthKey,
      currencyCode: ws.currencyCode,
      eventType: 'month_opened',
      title: `Apertura (${ws.currencyCode}): ${formatMonthLabel(monthKey)}`,
      detail: `Efectivo base: ${ws.currencySymbol}${newMonth.salaryEfectivo.toFixed(2)} · Transf. base: ${ws.currencySymbol}${newMonth.salaryTransferencia.toFixed(2)}`,
      amount: newMonth.salary,
    });
  } else if (bringCarryoverFrom && ws.months[bringCarryoverFrom]) {
    const allTimeInv = computeAllTimeInvestmentTotals(ws.months, ws.investments);
    const prevSummary = computeMonthSummary(
      ws.months[bringCarryoverFrom],
      ws.investments,
      allTimeInv
    );
    const m = ws.months[monthKey];
    m.carryoverEfectivo = round2(prevSummary.currentEfectivoBalance);
    m.carryoverTransferencia = round2(prevSummary.currentTransferenciaBalance);
    m.carryover = round2(m.carryoverEfectivo + m.carryoverTransferencia);
    m.updatedAt = new Date().toISOString();
  }

  return syncActiveWorkspaceMirrors(db);
}

export function applyUpdateMonthPlan(
  db: AppDatabase,
  monthKey: string,
  payload: {
    salary?: number;
    salaryEfectivo?: number;
    salaryTransferencia?: number;
    carryover?: number;
    carryoverEfectivo?: number;
    carryoverTransferencia?: number;
    hasManutenciones?: boolean;
    allocations?: MonthAllocations;
    reflection?: Partial<MonthReflection>;
    alsoUpdateCurrentSalary?: boolean;
  }
): AppDatabase {
  const ws = db.currencyWorkspaces[db.profile.currencyCode];
  const month = ws.months[monthKey];
  if (!month) throw new Error('El mes solicitado no existe.');

  lockDemoIfRealMutation(db);

  if (payload.salaryEfectivo !== undefined || payload.salaryTransferencia !== undefined) {
    month.salaryEfectivo = round2(
      Math.max(0, Number(payload.salaryEfectivo ?? month.salaryEfectivo) || 0)
    );
    month.salaryTransferencia = round2(
      Math.max(0, Number(payload.salaryTransferencia ?? month.salaryTransferencia) || 0)
    );
    month.salary = round2(month.salaryEfectivo + month.salaryTransferencia);
  } else if (typeof payload.salary === 'number' && payload.salary >= 0) {
    month.salaryEfectivo = round2(payload.salary);
    month.salaryTransferencia = 0;
    month.salary = round2(payload.salary);
  }

  if (payload.alsoUpdateCurrentSalary) {
    const prev = ws.currentSalary;
    ws.currentSalaryEfectivo = month.salaryEfectivo;
    ws.currentSalaryTransferencia = month.salaryTransferencia;
    ws.currentSalary = month.salary;
    if (Math.abs(prev - month.salary) > 0.009) {
      appendHistoryCore(db, {
        monthKey,
        currencyCode: ws.currencyCode,
        eventType: 'salary_updated',
        title: `Salario actual (${ws.currencyCode}) actualizado a ${ws.currencySymbol}${month.salary.toFixed(2)}`,
        detail: `Efectivo: ${ws.currencySymbol}${month.salaryEfectivo.toFixed(2)} · Transferencia: ${ws.currencySymbol}${month.salaryTransferencia.toFixed(2)}`,
        amount: month.salary,
      });
    }
  }

  if (payload.carryoverEfectivo !== undefined || payload.carryoverTransferencia !== undefined) {
    month.carryoverEfectivo = round2(
      Number(payload.carryoverEfectivo ?? month.carryoverEfectivo) || 0
    );
    month.carryoverTransferencia = round2(
      Number(payload.carryoverTransferencia ?? month.carryoverTransferencia) || 0
    );
    month.carryover = round2(month.carryoverEfectivo + month.carryoverTransferencia);
  } else if (typeof payload.carryover === 'number') {
    month.carryoverEfectivo = round2(payload.carryover);
    month.carryoverTransferencia = 0;
    month.carryover = round2(payload.carryover);
  }

  if (typeof payload.hasManutenciones === 'boolean') {
    month.hasManutenciones = payload.hasManutenciones;
    ws.hasManutencionesDefault = payload.hasManutenciones;
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
  return syncActiveWorkspaceMirrors(db);
}

export function applyAddEntry(
  db: AppDatabase,
  monthKey: string,
  payload: {
    date: string;
    type: EntryType;
    amount: number;
    paymentMethod?: PaymentMethod;
    transferDirection?: TransferDirection;
    transferFee?: number;
    concept: string;
    division: string;
    investmentId?: string;
    pillar?: KakeiboPillar;
    note?: string;
  }
): AppDatabase {
  const ws = db.currencyWorkspaces[db.profile.currencyCode];
  if (!ws.months[monthKey]) {
    ws.months[monthKey] = createEmptyMonthCore(
      monthKey,
      ws.currentSalaryEfectivo,
      ws.currentSalaryTransferencia,
      ws.hasManutencionesDefault
    );
  }
  const month = ws.months[monthKey];

  const numericAmount = round2(Math.abs(Number(payload.amount) || 0));
  if (numericAmount <= 0) throw new Error('El monto debe ser mayor que cero.');

  lockDemoIfRealMutation(db);

  const method: PaymentMethod =
    payload.paymentMethod === 'transferencia' ? 'transferencia' : 'efectivo';
  const isTraspaso = payload.type === 'channel_transfer';

  const entry: LedgerEntry = {
    id: generateId(),
    monthKey,
    date:
      typeof payload.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payload.date)
        ? payload.date
        : getTodayDateString(),
    createdAt: new Date().toISOString(),
    type: payload.type || 'expense',
    amount: numericAmount,
    paymentMethod: isTraspaso
      ? payload.transferDirection === 'cash_to_transf'
        ? 'efectivo'
        : 'transferencia'
      : method,
    transferDirection: isTraspaso ? payload.transferDirection || 'transf_to_cash' : undefined,
    transferFee: isTraspaso ? round2(Math.max(0, Number(payload.transferFee) || 0)) : undefined,
    concept: (payload.concept || '').trim() || 'Movimiento sin título',
    division: payload.division || (isTraspaso ? 'bolsillo' : 'general'),
    investmentId: payload.division === 'inversiones' ? payload.investmentId : undefined,
    pillar:
      payload.pillar ||
      (isTraspaso
        ? 'traspaso'
        : payload.type === 'income'
        ? 'ingreso'
        : payload.type === 'adjustment_up' || payload.type === 'adjustment_down'
        ? 'ajuste'
        : payload.division === 'inversiones' || payload.division === 'deudas'
        ? 'patrimonio'
        : 'supervivencia'),
    note: payload.note?.trim() || undefined,
  };

  month.entries.push(entry);
  month.updatedAt = new Date().toISOString();

  if (isTraspaso) {
    const dirLabel =
      entry.transferDirection === 'cash_to_transf'
        ? 'Efectivo → Transferencia'
        : 'Transferencia → Efectivo';
    appendHistoryCore(db, {
      monthKey,
      currencyCode: ws.currencyCode,
      eventType: 'channel_transfer',
      title: `Cambio ${dirLabel} (${ws.currencySymbol}${numericAmount.toFixed(2)})`,
      detail: `${entry.concept}${entry.transferFee ? ` · Comisión: ${ws.currencySymbol}${entry.transferFee.toFixed(2)}` : ''}`,
      amount: numericAmount,
    });
  }

  return syncActiveWorkspaceMirrors(db);
}

export function applyUpdateEntry(
  db: AppDatabase,
  monthKey: string,
  entryId: string,
  payload: {
    date?: string;
    type?: EntryType;
    amount?: number;
    paymentMethod?: PaymentMethod;
    transferDirection?: TransferDirection;
    transferFee?: number;
    concept?: string;
    division?: string;
    investmentId?: string;
    pillar?: KakeiboPillar;
    note?: string;
  }
): AppDatabase {
  const ws = db.currencyWorkspaces[db.profile.currencyCode];
  const month = ws.months[monthKey];
  if (!month) throw new Error('Mes no encontrado.');

  const idx = month.entries.findIndex((e) => e.id === entryId);
  if (idx === -1) throw new Error('Registro no encontrado.');

  lockDemoIfRealMutation(db);

  const existing = month.entries[idx];
  const numericAmount =
    payload.amount !== undefined ? round2(Math.abs(Number(payload.amount) || 0)) : existing.amount;
  if (numericAmount <= 0) throw new Error('El monto debe ser mayor que cero.');

  const nextDivision = payload.division ?? existing.division;

  month.entries[idx] = {
    ...existing,
    date:
      typeof payload.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payload.date)
        ? payload.date
        : existing.date,
    type: payload.type ?? existing.type,
    amount: numericAmount,
    paymentMethod: payload.paymentMethod ?? existing.paymentMethod,
    transferDirection: payload.transferDirection ?? existing.transferDirection,
    transferFee:
      payload.transferFee !== undefined
        ? round2(Math.max(0, Number(payload.transferFee) || 0))
        : existing.transferFee,
    concept: payload.concept?.trim() || existing.concept,
    division: nextDivision,
    investmentId: nextDivision === 'inversiones' ? payload.investmentId : undefined,
    pillar: payload.pillar ?? existing.pillar,
    note: typeof payload.note === 'string' ? payload.note.trim() || undefined : existing.note,
  };

  month.updatedAt = new Date().toISOString();
  return syncActiveWorkspaceMirrors(db);
}

export function applyDeleteEntry(db: AppDatabase, monthKey: string, entryId: string): AppDatabase {
  const ws = db.currencyWorkspaces[db.profile.currencyCode];
  const month = ws.months[monthKey];
  if (!month) throw new Error('Mes no encontrado.');

  lockDemoIfRealMutation(db);

  month.entries = month.entries.filter((e) => e.id !== entryId);
  month.updatedAt = new Date().toISOString();
  return syncActiveWorkspaceMirrors(db);
}

export function applyAdjustBalance(
  db: AppDatabase,
  monthKey: string,
  payload: {
    mode: 'delta' | 'target';
    paymentMethod?: PaymentMethod;
    delta?: number;
    targetBalance?: number;
    reason?: string;
    date?: string;
  }
): AppDatabase {
  const ws = db.currencyWorkspaces[db.profile.currencyCode];
  if (!ws.months[monthKey]) {
    ws.months[monthKey] = createEmptyMonthCore(
      monthKey,
      ws.currentSalaryEfectivo,
      ws.currentSalaryTransferencia,
      ws.hasManutencionesDefault
    );
  }
  const month = ws.months[monthKey];

  lockDemoIfRealMutation(db);

  const method: PaymentMethod =
    payload.paymentMethod === 'transferencia' ? 'transferencia' : 'efectivo';
  const methodLabel = method === 'transferencia' ? 'Transferencia' : 'Efectivo';

  const allTimeInv = computeAllTimeInvestmentTotals(ws.months, ws.investments);
  const summary = computeMonthSummary(month, ws.investments, allTimeInv);
  const currentChannelBalance =
    method === 'transferencia'
      ? summary.currentTransferenciaBalance
      : summary.currentEfectivoBalance;

  let signedDiff = 0;
  if (payload.mode === 'target') {
    const desired = round2(Number(payload.targetBalance) || 0);
    signedDiff = round2(desired - currentChannelBalance);
  } else {
    signedDiff = round2(Number(payload.delta) || 0);
  }

  if (Math.abs(signedDiff) < 0.01) {
    return syncActiveWorkspaceMirrors(db);
  }

  const isUp = signedDiff > 0;
  const magnitude = round2(Math.abs(signedDiff));
  const entryConcept =
    payload.reason?.trim() ||
    (payload.mode === 'target'
      ? `Arqueo en ${methodLabel} (${isUp ? '+' : '-'}${ws.currencySymbol}${magnitude.toFixed(2)})`
      : isUp
      ? `Incremento directo en ${methodLabel}`
      : `Reducción directa en ${methodLabel}`);

  month.entries.push({
    id: generateId(),
    monthKey,
    date:
      typeof payload.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payload.date)
        ? payload.date
        : getTodayDateString(),
    createdAt: new Date().toISOString(),
    type: isUp ? 'adjustment_up' : 'adjustment_down',
    amount: magnitude,
    paymentMethod: method,
    concept: entryConcept,
    division: 'general',
    pillar: 'ajuste',
    note:
      payload.mode === 'target'
        ? `Cuadre de ${methodLabel}: ${ws.currencySymbol}${currentChannelBalance.toFixed(2)} → ${ws.currencySymbol}${(currentChannelBalance + signedDiff).toFixed(2)}`
        : undefined,
  });

  month.updatedAt = new Date().toISOString();

  appendHistoryCore(db, {
    monthKey,
    currencyCode: ws.currencyCode,
    eventType: 'balance_adjusted',
    title: `${isUp ? 'Aumento' : 'Disminución'} en ${methodLabel} (${isUp ? '+' : '-'}${ws.currencySymbol}${magnitude.toFixed(2)} ${ws.currencyCode})`,
    detail: `${formatMonthLabel(monthKey)} · ${entryConcept}`,
    amount: signedDiff,
  });

  return syncActiveWorkspaceMirrors(db);
}

export function applyCreateInvestment(
  db: AppDatabase,
  payload: {
    name: string;
    category: InvestmentCategory;
    monthlyTarget: number;
    platform?: string;
    notes?: string;
    monthKey?: string;
  }
): AppDatabase {
  const ws = db.currencyWorkspaces[db.profile.currencyCode];
  if (!payload.name?.trim()) throw new Error('El nombre de la inversión es obligatorio.');

  lockDemoIfRealMutation(db);

  const target = round2(Math.max(0, Number(payload.monthlyTarget) || 0));
  const inv: InvestmentDefinition = {
    id: generateId(),
    name: payload.name.trim(),
    category: payload.category || 'otro',
    monthlyTarget: target,
    platform: payload.platform?.trim() || undefined,
    notes: payload.notes?.trim() || undefined,
    active: true,
    createdAt: new Date().toISOString(),
  };

  ws.investments.push(inv);
  if (payload.monthKey && ws.months[payload.monthKey]) {
    ws.months[payload.monthKey].allocations.investmentTargets[inv.id] = target;
    ws.months[payload.monthKey].updatedAt = new Date().toISOString();
  }

  appendHistoryCore(db, {
    monthKey: payload.monthKey,
    currencyCode: ws.currencyCode,
    eventType: 'investment_created',
    title: `Nueva inversión (${ws.currencyCode}): ${inv.name}`,
    detail: `Meta mensual: ${ws.currencySymbol}${target.toFixed(2)}${inv.platform ? ` · ${inv.platform}` : ''}`,
    amount: target,
  });

  return syncActiveWorkspaceMirrors(db);
}

export function applyUpdateInvestment(
  db: AppDatabase,
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
): AppDatabase {
  const ws = db.currencyWorkspaces[db.profile.currencyCode];
  const inv = ws.investments.find((i) => i.id === id);
  if (!inv) throw new Error('Inversión no encontrada.');

  lockDemoIfRealMutation(db);

  if (typeof payload.name === 'string' && payload.name.trim()) inv.name = payload.name.trim();
  if (payload.category) inv.category = payload.category;
  if (payload.monthlyTarget !== undefined) {
    inv.monthlyTarget = round2(Math.max(0, Number(payload.monthlyTarget) || 0));
    if (payload.monthKey && ws.months[payload.monthKey]) {
      ws.months[payload.monthKey].allocations.investmentTargets[inv.id] = inv.active
        ? inv.monthlyTarget
        : 0;
      ws.months[payload.monthKey].updatedAt = new Date().toISOString();
    }
  }
  if (payload.platform !== undefined) inv.platform = payload.platform.trim() || undefined;
  if (payload.notes !== undefined) inv.notes = payload.notes.trim() || undefined;
  if (typeof payload.active === 'boolean') {
    inv.active = payload.active;
    if (payload.monthKey && ws.months[payload.monthKey] && !payload.active) {
      delete ws.months[payload.monthKey].allocations.investmentTargets[inv.id];
    }
  }

  return syncActiveWorkspaceMirrors(db);
}

export function applyDeleteInvestment(db: AppDatabase, id: string): AppDatabase {
  const ws = db.currencyWorkspaces[db.profile.currencyCode];
  const inv = ws.investments.find((i) => i.id === id);
  if (!inv) throw new Error('Inversión no encontrada.');

  lockDemoIfRealMutation(db);

  const hasEntries = Object.values(ws.months).some((m) =>
    m.entries.some((e) => e.investmentId === id)
  );

  if (hasEntries) {
    inv.active = false;
  } else {
    ws.investments = ws.investments.filter((i) => i.id !== id);
  }

  for (const m of Object.values(ws.months)) {
    delete m.allocations.investmentTargets[id];
  }

  appendHistoryCore(db, {
    currencyCode: ws.currencyCode,
    eventType: 'investment_removed',
    title: `Inversión retirada (${ws.currencyCode}): ${inv.name}`,
    detail: hasEntries
      ? 'Archivada conservando el historial de aportes.'
      : 'Eliminada del listado.',
  });

  return syncActiveWorkspaceMirrors(db);
}

export function applyStartOneTimeDemo(db: AppDatabase): AppDatabase {
  if (!canStartDemo(db)) {
    throw new Error(
      'La prueba Demo es de un solo uso y ya no está disponible para proteger tus registros reales.'
    );
  }

  const now = new Date().toISOString();
  const monthKey = getCurrentMonthKey();
  const today = getTodayDateString();
  const [y, m] = monthKey.split('-');
  const dayPrefix = `${y}-${m}`;

  const invNegocioId = generateId();
  const invReservaId = generateId();
  const invUsdFondoId = generateId();

  const cupWs: CurrencyLedgerWorkspace = {
    currencyCode: 'CUP',
    currencySymbol: '$',
    currentSalary: 18000,
    currentSalaryEfectivo: 6000,
    currentSalaryTransferencia: 12000,
    hasManutencionesDefault: true,
    investments: [
      {
        id: invNegocioId,
        name: 'Mercancía / Negocio Propio',
        category: 'negocio',
        monthlyTarget: 2500,
        platform: 'Efectivo y Transfermóvil',
        active: true,
        createdAt: now,
      },
      {
        id: invReservaId,
        name: 'Fondo para compra de USD',
        category: 'divisas',
        monthlyTarget: 2000,
        platform: 'Ahorro mensual',
        active: true,
        createdAt: now,
      },
    ],
    months: {
      [monthKey]: {
        monthKey,
        salary: 18000,
        salaryEfectivo: 6000,
        salaryTransferencia: 12000,
        carryover: 0,
        carryoverEfectivo: 0,
        carryoverTransferencia: 0,
        hasManutenciones: true,
        allocations: {
          hogar: 8500,
          deudas: 1500,
          manutenciones: 2000,
          hogarItems: [
            { id: generateId(), name: 'Compra de alimentos y agro', amount: 6500 },
            { id: generateId(), name: 'Electricidad, Nauta e Internet', amount: 2000 },
          ],
          deudasItems: [{ id: generateId(), name: 'Pago pendiente mensual', amount: 1500 }],
          manutencionesItems: [{ id: generateId(), name: 'Apoyo familiar', amount: 2000 }],
          investmentTargets: {
            [invNegocioId]: 2500,
            [invReservaId]: 2000,
          },
          customEnvelopes: [],
        },
        reflection: {
          howMuchCanISave:
            'Mantener suficiente efectivo a mano para el agro y pagar servicios por Transfermóvil.',
          improvementPlan: 'Evitar comisiones altas sacando efectivo con tiempo en Caja Extra.',
          closingNotes: '',
          mood: 'estable',
        },
        entries: [
          {
            id: generateId(),
            monthKey,
            date: `${dayPrefix}-02`,
            createdAt: new Date(Date.now() - 500000).toISOString(),
            type: 'expense',
            amount: 1850,
            paymentMethod: 'transferencia',
            concept: 'Pago Electricidad y Recarga Nauta (Transfermóvil)',
            division: 'hogar',
            pillar: 'supervivencia',
            note: 'Pagado directo desde tarjeta con descuento',
          },
          {
            id: generateId(),
            monthKey,
            date: `${dayPrefix}-04`,
            createdAt: new Date(Date.now() - 400000).toISOString(),
            type: 'channel_transfer',
            amount: 4000,
            paymentMethod: 'transferencia',
            transferDirection: 'transf_to_cash',
            transferFee: 0,
            concept: 'Extracción por Caja Extra a billetes en efectivo',
            division: 'bolsillo',
            pillar: 'traspaso',
            note: 'Pasa de Transferencia a Efectivo sin comisión',
          },
          {
            id: generateId(),
            monthKey,
            date: `${dayPrefix}-06`,
            createdAt: new Date(Date.now() - 300000).toISOString(),
            type: 'expense',
            amount: 3200,
            paymentMethod: 'efectivo',
            concept: 'Compra de viandas, carne y despensa (solo aceptaban efectivo)',
            division: 'hogar',
            pillar: 'supervivencia',
          },
          {
            id: generateId(),
            monthKey,
            date: `${dayPrefix}-09`,
            createdAt: new Date(Date.now() - 200000).toISOString(),
            type: 'expense',
            amount: 2500,
            paymentMethod: 'transferencia',
            concept: 'Inversión en insumos del negocio',
            division: 'inversiones',
            investmentId: invNegocioId,
            pillar: 'patrimonio',
          },
          {
            id: generateId(),
            monthKey,
            date: today,
            createdAt: new Date(Date.now() - 100000).toISOString(),
            type: 'income',
            amount: 2200,
            paymentMethod: 'efectivo',
            concept: 'Ingreso extra en efectivo de fin de semana',
            division: 'general',
            pillar: 'ingreso',
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
    },
  };

  const usdWs: CurrencyLedgerWorkspace = {
    currencyCode: 'USD',
    currencySymbol: 'US$',
    currentSalary: 120,
    currentSalaryEfectivo: 80,
    currentSalaryTransferencia: 40,
    hasManutencionesDefault: false,
    investments: [
      {
        id: invUsdFondoId,
        name: 'Ahorro Fuerte en USD',
        category: 'ahorro_meta',
        monthlyTarget: 50,
        platform: 'Efectivo guardado',
        active: true,
        createdAt: now,
      },
    ],
    months: {
      [monthKey]: {
        monthKey,
        salary: 120,
        salaryEfectivo: 80,
        salaryTransferencia: 40,
        carryover: 0,
        carryoverEfectivo: 0,
        carryoverTransferencia: 0,
        hasManutenciones: false,
        allocations: {
          hogar: 30,
          deudas: 0,
          manutenciones: 0,
          hogarItems: [],
          deudasItems: [],
          manutencionesItems: [],
          investmentTargets: { [invUsdFondoId]: 50 },
          customEnvelopes: [],
        },
        reflection: {
          howMuchCanISave: 'Apartar 50 USD fijos cada mes.',
          improvementPlan: '',
          closingNotes: '',
          mood: 'excelente',
        },
        entries: [
          {
            id: generateId(),
            monthKey,
            date: `${dayPrefix}-05`,
            createdAt: new Date(Date.now() - 250000).toISOString(),
            type: 'expense',
            amount: 50,
            paymentMethod: 'efectivo',
            concept: 'Separado al fondo de ahorro en billetes USD',
            division: 'inversiones',
            investmentId: invUsdFondoId,
            pillar: 'patrimonio',
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
    },
  };

  const demoDb: AppDatabase = {
    version: 2,
    firstUseDate: db.firstUseDate || now,
    lastUpdatedAt: now,
    demoUsed: true,
    isDemoActive: true,
    demoResetUsed: false,
    profile: {
      ledgerName: 'Libreta Demo (Modo Prueba)',
      currencyCode: 'CUP',
      currencySymbol: '$',
      enabledCurrencies: ['CUP', 'USD'],
      currentSalary: 18000,
      currentSalaryEfectivo: 6000,
      currentSalaryTransferencia: 12000,
      hasManutencionesDefault: true,
    },
    investments: cupWs.investments,
    months: cupWs.months,
    currencyWorkspaces: {
      CUP: cupWs,
      USD: usdWs,
    },
    exchangeControl: {
      baseCurrency: 'CUP',
      rates: {
        USD: {
          currencyCode: 'USD',
          rateEfectivo: 330,
          rateTransferencia: 325,
          useSeparateChannels: true,
          updatedAt: now,
          note: 'Tasa de ejemplo Demo',
        },
        MLC: {
          currencyCode: 'MLC',
          rateEfectivo: 270,
          rateTransferencia: 270,
          useSeparateChannels: false,
          updatedAt: now,
          note: 'Tasa de ejemplo Demo',
        },
        EUR: {
          currencyCode: 'EUR',
          rateEfectivo: 345,
          rateTransferencia: 345,
          useSeparateChannels: false,
          updatedAt: now,
          note: 'Tasa de ejemplo Demo',
        },
      },
      rateHistory: [
        {
          id: generateId(),
          timestamp: now,
          currencyCode: 'USD',
          previousEfectivo: 325,
          newEfectivo: 330,
          previousTransferencia: 320,
          newTransferencia: 325,
          note: 'Ejemplo de registro histórico local de tasas',
        },
      ],
      operations: [],
    },
    historyLog: [
      {
        id: generateId(),
        timestamp: now,
        monthKey,
        currencyCode: 'CUP',
        eventType: 'demo_started',
        title: 'Prueba Demo de un solo uso activada',
        detail:
          'Ejemplo cargado con Efectivo y Transferencia en paralelo (CUP y USD). Usa el botón de finalizar Demo cuando quieras arrancar en limpio.',
      },
    ],
  };

  return syncActiveWorkspaceMirrors(demoDb);
}

export function applyExitDemoReset(db: AppDatabase): AppDatabase {
  if (!canExitDemoReset(db)) {
    throw new Error(
      'La opción de reinicio es de un solo uso exclusivo para salir del modo Demo. Tus registros reales están protegidos contra borrado.'
    );
  }

  const fresh = createInitialDatabaseCore({
    demoUsed: true,
    demoResetUsed: true,
  });

  appendHistoryCore(fresh, {
    currencyCode: 'CUP',
    eventType: 'demo_exited',
    title: 'Demo finalizada · Libreta Real iniciada y protegida',
    detail:
      'Se limpiaron los datos de prueba. El botón de reinicio quedó desactivado permanentemente para proteger tus datos.',
  });

  return syncActiveWorkspaceMirrors(fresh);
}

export function applyUpdateExchangeRate(
  db: AppDatabase,
  payload: {
    currencyCode: string;
    rateEfectivo: number;
    rateTransferencia?: number;
    useSeparateChannels?: boolean;
    note?: string;
  }
): AppDatabase {
  const code = findCurrencyOption(payload.currencyCode).code;
  if (code === 'CUP') {
    throw new Error('CUP es la moneda nativa base (1 CUP = 1 CUP).');
  }

  if (!db.exchangeControl) {
    db.exchangeControl = createInitialExchangeControl();
  }

  const now = new Date().toISOString();
  const prev = db.exchangeControl.rates[code];
  const prevEf = prev ? round2(prev.rateEfectivo || 0) : 0;
  const prevTr = prev ? round2(prev.rateTransferencia || 0) : 0;

  const useSep = Boolean(payload.useSeparateChannels);
  const nextEf = round2(Math.max(0, Number(payload.rateEfectivo) || 0));
  const nextTr = useSep
    ? round2(
        Math.max(
          0,
          payload.rateTransferencia !== undefined
            ? Number(payload.rateTransferencia) || 0
            : nextEf
        )
      )
    : nextEf;

  db.exchangeControl.rates[code] = {
    currencyCode: code,
    rateEfectivo: nextEf,
    rateTransferencia: nextTr,
    useSeparateChannels: useSep,
    updatedAt: now,
    note: payload.note?.trim() || undefined,
  };

  if (Math.abs(prevEf - nextEf) >= 0.01 || Math.abs(prevTr - nextTr) >= 0.01) {
    db.exchangeControl.rateHistory.unshift({
      id: generateId(),
      timestamp: now,
      currencyCode: code,
      previousEfectivo: prevEf,
      newEfectivo: nextEf,
      previousTransferencia: prevTr,
      newTransferencia: nextTr,
      note: payload.note?.trim() || undefined,
    });
    if (db.exchangeControl.rateHistory.length > 300) {
      db.exchangeControl.rateHistory = db.exchangeControl.rateHistory.slice(0, 300);
    }

    appendHistoryCore(db, {
      currencyCode: code,
      eventType: 'exchange_rate_updated',
      title: `Tasa manual actualizada: 1 ${code} en CUP`,
      detail: useSep
        ? `Efectivo: ${nextEf} CUP · Transferencia: ${nextTr} CUP`
        : `Tasa fijada en ${nextEf} CUP por 1 ${code}`,
      amount: nextEf,
    });
  }

  lockDemoIfRealMutation(db);
  return syncActiveWorkspaceMirrors(db);
}

function ensureMonthInWorkspace(ws: CurrencyLedgerWorkspace, monthKey: string): MonthRecord {
  if (!ws.months[monthKey]) {
    const sortedKeys = Object.keys(ws.months).sort();
    const prevKey = sortedKeys.filter((k) => k < monthKey).pop();
    const template = prevKey ? ws.months[prevKey] : undefined;
    ws.months[monthKey] = createEmptyMonthCore(
      monthKey,
      ws.currentSalaryEfectivo,
      ws.currentSalaryTransferencia,
      ws.hasManutencionesDefault,
      template
    );
  }
  return ws.months[monthKey];
}

export function applyExecuteCurrencyExchange(
  db: AppDatabase,
  payload: {
    monthKey: string;
    date?: string;
    fromCurrency: string;
    fromMethod: PaymentMethod;
    fromAmount: number;
    toCurrency: string;
    toMethod: PaymentMethod;
    toAmount: number;
    effectiveCupRate: number;
    alsoSaveRate?: boolean;
    applyToLedgers: boolean;
    note?: string;
  }
): AppDatabase {
  const fromOpt = findCurrencyOption(payload.fromCurrency);
  const toOpt = findCurrencyOption(payload.toCurrency);

  if (fromOpt.code === toOpt.code) {
    throw new Error(
      'Selecciona dos monedas distintas (para cambiar Efectivo ⇄ Transferencia en la misma moneda usa el Libro Diario).'
    );
  }

  const fromAmt = round2(Math.abs(Number(payload.fromAmount) || 0));
  const toAmt = round2(Math.abs(Number(payload.toAmount) || 0));
  const cupRate = round2(Math.max(0, Number(payload.effectiveCupRate) || 0));

  if (fromAmt <= 0 || toAmt <= 0) {
    throw new Error('Los montos a convertir deben ser mayores a cero.');
  }

  const fromMethod: PaymentMethod =
    payload.fromMethod === 'transferencia' ? 'transferencia' : 'efectivo';
  const toMethod: PaymentMethod =
    payload.toMethod === 'transferencia' ? 'transferencia' : 'efectivo';

  const now = new Date().toISOString();
  const monthKey = payload.monthKey || getCurrentMonthKey();
  const entryDate =
    payload.date && /^\d{4}-\d{2}-\d{2}$/.test(payload.date)
      ? payload.date
      : getTodayDateString().startsWith(monthKey)
      ? getTodayDateString()
      : `${monthKey}-01`;

  if (!db.exchangeControl) {
    db.exchangeControl = createInitialExchangeControl(now);
  }

  if (payload.alsoSaveRate && cupRate > 0) {
    const foreignCode =
      fromOpt.code !== 'CUP' ? fromOpt.code : toOpt.code !== 'CUP' ? toOpt.code : null;
    if (foreignCode) {
      const existing = db.exchangeControl.rates[foreignCode];
      const foreignMethod = fromOpt.code === foreignCode ? fromMethod : toMethod;
      if (existing && existing.useSeparateChannels) {
        applyUpdateExchangeRate(db, {
          currencyCode: foreignCode,
          rateEfectivo: foreignMethod === 'efectivo' ? cupRate : existing.rateEfectivo,
          rateTransferencia:
            foreignMethod === 'transferencia' ? cupRate : existing.rateTransferencia,
          useSeparateChannels: true,
          note: payload.note,
        });
      } else {
        applyUpdateExchangeRate(db, {
          currencyCode: foreignCode,
          rateEfectivo: cupRate,
          useSeparateChannels: false,
          note: payload.note,
        });
      }
    }
  }

  if (payload.applyToLedgers) {
    for (const c of [fromOpt.code, toOpt.code]) {
      if (!db.profile.enabledCurrencies.includes(c)) {
        db.profile.enabledCurrencies.push(c);
      }
      if (!db.currencyWorkspaces[c]) {
        db.currencyWorkspaces[c] = createEmptyCurrencyWorkspace(c);
      }
    }

    const fromWs = db.currencyWorkspaces[fromOpt.code];
    const toWs = db.currencyWorkspaces[toOpt.code];
    const fromMonth = ensureMonthInWorkspace(fromWs, monthKey);
    const toMonth = ensureMonthInWorkspace(toWs, monthKey);

    const rateNote =
      cupRate > 0 ? `Tasa base CUP: ${cupRate}` : 'Cambio directo entre libretas';
    const fullNote = payload.note?.trim()
      ? `${rateNote} · ${payload.note.trim()}`
      : rateNote;

    fromMonth.entries.push({
      id: generateId(),
      monthKey,
      date: entryDate,
      createdAt: now,
      type: 'adjustment_down',
      amount: fromAmt,
      paymentMethod: fromMethod,
      concept: `Cambio de moneda entregado: -${fromAmt} ${fromOpt.code} → +${toAmt} ${toOpt.code}`,
      division: 'general',
      pillar: 'traspaso',
      note: fullNote,
    });
    fromMonth.updatedAt = now;

    toMonth.entries.push({
      id: generateId(),
      monthKey,
      date: entryDate,
      createdAt: now,
      type: 'adjustment_up',
      amount: toAmt,
      paymentMethod: toMethod,
      concept: `Cambio de moneda recibido: +${toAmt} ${toOpt.code} (desde ${fromAmt} ${fromOpt.code})`,
      division: 'general',
      pillar: 'traspaso',
      note: fullNote,
    });
    toMonth.updatedAt = now;
  }

  db.exchangeControl.operations.unshift({
    id: generateId(),
    timestamp: now,
    date: entryDate,
    monthKey,
    fromCurrency: fromOpt.code,
    fromMethod,
    fromAmount: fromAmt,
    toCurrency: toOpt.code,
    toMethod,
    toAmount: toAmt,
    effectiveCupRate: cupRate,
    appliedToLedgers: Boolean(payload.applyToLedgers),
    note: payload.note?.trim() || undefined,
  });
  if (db.exchangeControl.operations.length > 300) {
    db.exchangeControl.operations = db.exchangeControl.operations.slice(0, 300);
  }

  appendHistoryCore(db, {
    monthKey,
    currencyCode: fromOpt.code,
    eventType: 'currency_exchanged',
    title: payload.applyToLedgers
      ? `Cambio aplicado en libretas: ${fromAmt} ${fromOpt.code} → ${toAmt} ${toOpt.code}`
      : `Conversión registrada: ${fromAmt} ${fromOpt.code} → ${toAmt} ${toOpt.code}`,
    detail: `Salida (${fromMethod === 'transferencia' ? 'Transf.' : 'Efectivo'}) → Entrada (${
      toMethod === 'transferencia' ? 'Transf.' : 'Efectivo'
    })${cupRate > 0 ? ` · Tasa: ${cupRate} CUP` : ''}`,
    amount: toAmt,
  });

  lockDemoIfRealMutation(db);
  return syncActiveWorkspaceMirrors(db);
}
