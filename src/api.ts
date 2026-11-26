import {
  AppDatabase,
  EntryType,
  InvestmentCategory,
  KakeiboPillar,
  MonthAllocations,
  MonthReflection,
} from '../shared/types';

const LOCAL_MIRROR_KEY = 'neon_kakeibo_mirror_v1';

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });

  if (!res.ok) {
    let errMsg = `Error HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) errMsg = body.error;
    } catch {
      // ignore json parse failure
    }
    throw new Error(errMsg);
  }

  const data = (await res.json()) as T;
  try {
    localStorage.setItem(LOCAL_MIRROR_KEY, JSON.stringify(data));
  } catch {
    // ignore storage quota errors
  }
  return data;
}

export const api = {
  getState: () => requestJson<AppDatabase>('/api/state'),

  updateProfile: (payload: {
    ledgerName?: string;
    currencyCode?: string;
    currencySymbol?: string;
    currentSalary?: number;
    hasManutencionesDefault?: boolean;
    syncMonthKey?: string;
  }) =>
    requestJson<AppDatabase>('/api/profile', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  ensureMonth: (monthKey: string, bringCarryoverFrom?: string) =>
    requestJson<AppDatabase>(`/api/months/${monthKey}/ensure`, {
      method: 'POST',
      body: JSON.stringify({ bringCarryoverFrom }),
    }),

  updateMonthPlan: (
    monthKey: string,
    payload: {
      salary?: number;
      carryover?: number;
      hasManutenciones?: boolean;
      allocations?: MonthAllocations;
      reflection?: Partial<MonthReflection>;
      alsoUpdateCurrentSalary?: boolean;
    }
  ) =>
    requestJson<AppDatabase>(`/api/months/${monthKey}/plan`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  addEntry: (
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
  ) =>
    requestJson<AppDatabase>(`/api/months/${monthKey}/entries`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateEntry: (
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
  ) =>
    requestJson<AppDatabase>(`/api/months/${monthKey}/entries/${entryId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteEntry: (monthKey: string, entryId: string) =>
    requestJson<AppDatabase>(`/api/months/${monthKey}/entries/${entryId}`, {
      method: 'DELETE',
    }),

  adjustGeneralBalance: (
    monthKey: string,
    payload: {
      mode: 'delta' | 'target';
      delta?: number;
      targetBalance?: number;
      reason?: string;
      date?: string;
    }
  ) =>
    requestJson<AppDatabase>(`/api/months/${monthKey}/adjust-balance`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  createInvestment: (payload: {
    name: string;
    category: InvestmentCategory;
    monthlyTarget: number;
    platform?: string;
    notes?: string;
    monthKey?: string;
  }) =>
    requestJson<AppDatabase>('/api/investments', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateInvestment: (
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
  ) =>
    requestJson<AppDatabase>(`/api/investments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteInvestment: (id: string) =>
    requestJson<AppDatabase>(`/api/investments/${id}`, {
      method: 'DELETE',
    }),

  loadDemo: () =>
    requestJson<AppDatabase>('/api/demo', {
      method: 'POST',
    }),

  resetDatabase: () =>
    requestJson<AppDatabase>('/api/reset', {
      method: 'POST',
    }),

  importBackup: (backup: AppDatabase) =>
    requestJson<AppDatabase>('/api/import', {
      method: 'POST',
      body: JSON.stringify(backup),
    }),
};
