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
  createInitialDatabaseCore,
  normalizeDatabaseCore,
} from '../shared/ledgerCore';
import {
  AppDatabase,
  EntryType,
  InvestmentCategory,
  KakeiboPillar,
  MonthAllocations,
  MonthReflection,
  PaymentMethod,
  TransferDirection,
} from '../shared/types';

let cachedDb: AppDatabase | null = null;

async function loadDesktopDb(): Promise<AppDatabase> {
  if (cachedDb) return structuredClone(cachedDb);
  const res = await fetch('/api/desktop/db');
  if (res.ok) {
    const text = await res.text();
    if (text && text.trim() && text.trim() !== 'null') {
      try {
        const parsed = JSON.parse(text) as Partial<AppDatabase>;
        cachedDb = normalizeDatabaseCore(parsed);
        return structuredClone(cachedDb);
      } catch {
        // Fallback if empty
      }
    }
  }
  const initial = createInitialDatabaseCore();
  await saveDesktopDb(initial);
  return structuredClone(initial);
}

async function saveDesktopDb(db: AppDatabase): Promise<AppDatabase> {
  db.lastUpdatedAt = new Date().toISOString();
  const normalized = normalizeDatabaseCore(db);
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
    localStorage.setItem('neon_kakeibo_mirror_v2', JSON.stringify(normalized));
  } catch {
    // ignore
  }
  return structuredClone(normalized);
}

export const desktopEngine = {
  getState: () => loadDesktopDb(),

  selectCurrency: async (currencyCode: string) => {
    const db = await loadDesktopDb();
    return saveDesktopDb(applySelectCurrency(db, currencyCode));
  },

  updateEnabledCurrencies: async (enabledCurrencies: string[], activeCurrency?: string) => {
    const db = await loadDesktopDb();
    return saveDesktopDb(applyUpdateEnabledCurrencies(db, enabledCurrencies, activeCurrency));
  },

  updateProfile: async (payload: {
    ledgerName?: string;
    currencyCode?: string;
    enabledCurrencies?: string[];
    currentSalaryEfectivo?: number;
    currentSalaryTransferencia?: number;
    currentSalary?: number;
    hasManutencionesDefault?: boolean;
    syncMonthKey?: string;
  }) => {
    const db = await loadDesktopDb();
    return saveDesktopDb(applyUpdateProfile(db, payload));
  },

  ensureMonth: async (monthKey: string, bringCarryoverFrom?: string) => {
    const db = await loadDesktopDb();
    return saveDesktopDb(applyEnsureMonth(db, monthKey, bringCarryoverFrom));
  },

  updateMonthPlan: async (
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
  ) => {
    const db = await loadDesktopDb();
    return saveDesktopDb(applyUpdateMonthPlan(db, monthKey, payload));
  },

  addEntry: async (
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
  ) => {
    const db = await loadDesktopDb();
    return saveDesktopDb(applyAddEntry(db, monthKey, payload));
  },

  updateEntry: async (
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
  ) => {
    const db = await loadDesktopDb();
    return saveDesktopDb(applyUpdateEntry(db, monthKey, entryId, payload));
  },

  deleteEntry: async (monthKey: string, entryId: string) => {
    const db = await loadDesktopDb();
    return saveDesktopDb(applyDeleteEntry(db, monthKey, entryId));
  },

  adjustGeneralBalance: async (
    monthKey: string,
    payload: {
      mode: 'delta' | 'target';
      paymentMethod?: PaymentMethod;
      delta?: number;
      targetBalance?: number;
      reason?: string;
      date?: string;
    }
  ) => {
    const db = await loadDesktopDb();
    return saveDesktopDb(applyAdjustBalance(db, monthKey, payload));
  },

  createInvestment: async (payload: {
    name: string;
    category: InvestmentCategory;
    monthlyTarget: number;
    platform?: string;
    notes?: string;
    monthKey?: string;
  }) => {
    const db = await loadDesktopDb();
    return saveDesktopDb(applyCreateInvestment(db, payload));
  },

  updateInvestment: async (
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
  ) => {
    const db = await loadDesktopDb();
    return saveDesktopDb(applyUpdateInvestment(db, id, payload));
  },

  deleteInvestment: async (id: string) => {
    const db = await loadDesktopDb();
    return saveDesktopDb(applyDeleteInvestment(db, id));
  },

  updateExchangeRate: async (payload: {
    currencyCode: string;
    rateEfectivo: number;
    rateTransferencia?: number;
    useSeparateChannels?: boolean;
    note?: string;
  }) => {
    const db = await loadDesktopDb();
    return saveDesktopDb(applyUpdateExchangeRate(db, payload));
  },

  executeCurrencyExchange: async (payload: {
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
  }) => {
    const db = await loadDesktopDb();
    return saveDesktopDb(applyExecuteCurrencyExchange(db, payload));
  },

  loadDemo: async () => {
    const db = await loadDesktopDb();
    return saveDesktopDb(applyStartOneTimeDemo(db));
  },

  resetDatabase: async () => {
    const db = await loadDesktopDb();
    return saveDesktopDb(applyExitDemoReset(db));
  },

  importBackup: async (incoming: AppDatabase) => {
    appendHistoryCore(incoming, {
      eventType: 'backup_restored',
      title: 'Respaldo restaurado exitosamente',
      detail: 'Se importó el registro histórico completo de la libreta.',
    });
    return saveDesktopDb(incoming);
  },
};
