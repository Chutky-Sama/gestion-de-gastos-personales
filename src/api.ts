import { HogarCategoryDef } from '../shared/hogarCategories';
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
import { desktopEngine } from './desktopEngine';

const LOCAL_MIRROR_KEY = 'neon_kakeibo_mirror_v2';

export interface DesktopInfo {
  isDesktop: boolean;
  storagePath?: string;
  dataDir?: string;
}

let resolvedDesktopInfo: DesktopInfo | null = null;
let heartbeatStarted = false;

export async function getDesktopInfo(): Promise<DesktopInfo> {
  if (resolvedDesktopInfo) return resolvedDesktopInfo;
  try {
    const res = await fetch('/api/desktop/info');
    if (res.ok) {
      const data = await res.json();
      if (data && data.isDesktop === true) {
        resolvedDesktopInfo = {
          isDesktop: true,
          storagePath: data.storagePath,
          dataDir: data.dataDir,
        };
        startDesktopHeartbeat();
        return resolvedDesktopInfo;
      }
    }
  } catch {
    // Not in desktop exe
  }
  resolvedDesktopInfo = { isDesktop: false };
  return resolvedDesktopInfo;
}

function startDesktopHeartbeat(): void {
  if (heartbeatStarted) return;
  heartbeatStarted = true;

  try {
    const es = new EventSource('/api/desktop/events');
    window.addEventListener('pagehide', () => {
      es.close();
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/desktop/window-closed', '');
      }
    });
  } catch {
    const ping = () => {
      fetch('/api/desktop/ping', { method: 'POST', keepalive: true }).catch(() => {});
    };
    ping();
    window.setInterval(ping, 3000);
  }
}

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    let errMsg = `Error HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) errMsg = body.error;
    } catch {
      // ignore
    }
    throw new Error(errMsg);
  }

  const data = (await res.json()) as T;
  try {
    localStorage.setItem(LOCAL_MIRROR_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
  return data;
}

export const api = {
  getDesktopInfo,

  openDataFolder: async (): Promise<void> => {
    await fetch('/api/desktop/open-folder', { method: 'POST' });
  },

  getState: async () => {
    const info = await getDesktopInfo();
    if (info.isDesktop) return desktopEngine.getState();
    return requestJson<AppDatabase>('/api/state');
  },

  selectCurrency: async (currencyCode: string) => {
    const info = await getDesktopInfo();
    if (info.isDesktop) return desktopEngine.selectCurrency(currencyCode);
    return requestJson<AppDatabase>('/api/currency/select', {
      method: 'PUT',
      body: JSON.stringify({ currencyCode }),
    });
  },

  updateEnabledCurrencies: async (enabledCurrencies: string[], activeCurrency?: string) => {
    const info = await getDesktopInfo();
    if (info.isDesktop) {
      return desktopEngine.updateEnabledCurrencies(enabledCurrencies, activeCurrency);
    }
    return requestJson<AppDatabase>('/api/currency/enabled', {
      method: 'PUT',
      body: JSON.stringify({ enabledCurrencies, activeCurrency }),
    });
  },

  updateProfile: async (payload: {
    ledgerName?: string;
    currencyCode?: string;
    enabledCurrencies?: string[];
    currentSalaryEfectivo?: number;
    currentSalaryTransferencia?: number;
    currentSalary?: number;
    hasManutencionesDefault?: boolean;
    customHogarCategories?: HogarCategoryDef[];
    syncMonthKey?: string;
  }) => {
    const info = await getDesktopInfo();
    if (info.isDesktop) return desktopEngine.updateProfile(payload);
    return requestJson<AppDatabase>('/api/profile', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  ensureMonth: async (monthKey: string, bringCarryoverFrom?: string) => {
    const info = await getDesktopInfo();
    if (info.isDesktop) return desktopEngine.ensureMonth(monthKey, bringCarryoverFrom);
    return requestJson<AppDatabase>(`/api/months/${monthKey}/ensure`, {
      method: 'POST',
      body: JSON.stringify({ bringCarryoverFrom }),
    });
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
    const info = await getDesktopInfo();
    if (info.isDesktop) return desktopEngine.updateMonthPlan(monthKey, payload);
    return requestJson<AppDatabase>(`/api/months/${monthKey}/plan`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
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
      transferFeePercent?: number;
      concept: string;
      division: string;
      hogarCategoryId?: string;
      investmentId?: string;
      pillar?: KakeiboPillar;
      note?: string;
    }
  ) => {
    const info = await getDesktopInfo();
    if (info.isDesktop) return desktopEngine.addEntry(monthKey, payload);
    return requestJson<AppDatabase>(`/api/months/${monthKey}/entries`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
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
      transferFeePercent?: number;
      concept?: string;
      division?: string;
      hogarCategoryId?: string;
      investmentId?: string;
      pillar?: KakeiboPillar;
      note?: string;
    }
  ) => {
    const info = await getDesktopInfo();
    if (info.isDesktop) return desktopEngine.updateEntry(monthKey, entryId, payload);
    return requestJson<AppDatabase>(`/api/months/${monthKey}/entries/${entryId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  deleteEntry: async (monthKey: string, entryId: string) => {
    const info = await getDesktopInfo();
    if (info.isDesktop) return desktopEngine.deleteEntry(monthKey, entryId);
    return requestJson<AppDatabase>(`/api/months/${monthKey}/entries/${entryId}`, {
      method: 'DELETE',
    });
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
    const info = await getDesktopInfo();
    if (info.isDesktop) return desktopEngine.adjustGeneralBalance(monthKey, payload);
    return requestJson<AppDatabase>(`/api/months/${monthKey}/adjust-balance`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  createInvestment: async (payload: {
    name: string;
    category: InvestmentCategory;
    monthlyTarget: number;
    platform?: string;
    notes?: string;
    monthKey?: string;
  }) => {
    const info = await getDesktopInfo();
    if (info.isDesktop) return desktopEngine.createInvestment(payload);
    return requestJson<AppDatabase>('/api/investments', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
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
    const info = await getDesktopInfo();
    if (info.isDesktop) return desktopEngine.updateInvestment(id, payload);
    return requestJson<AppDatabase>(`/api/investments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  deleteInvestment: async (id: string) => {
    const info = await getDesktopInfo();
    if (info.isDesktop) return desktopEngine.deleteInvestment(id);
    return requestJson<AppDatabase>(`/api/investments/${id}`, { method: 'DELETE' });
  },

  updateExchangeRate: async (payload: {
    currencyCode: string;
    rateEfectivo: number;
    rateTransferencia?: number;
    useSeparateChannels?: boolean;
    note?: string;
  }) => {
    const info = await getDesktopInfo();
    if (info.isDesktop) return desktopEngine.updateExchangeRate(payload);
    return requestJson<AppDatabase>('/api/exchange/rate', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
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
    const info = await getDesktopInfo();
    if (info.isDesktop) return desktopEngine.executeCurrencyExchange(payload);
    return requestJson<AppDatabase>('/api/exchange/execute', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  loadDemo: async () => {
    const info = await getDesktopInfo();
    if (info.isDesktop) return desktopEngine.loadDemo();
    return requestJson<AppDatabase>('/api/demo', { method: 'POST' });
  },

  resetDatabase: async () => {
    const info = await getDesktopInfo();
    if (info.isDesktop) return desktopEngine.resetDatabase();
    return requestJson<AppDatabase>('/api/reset', { method: 'POST' });
  },

  importBackup: async (backup: AppDatabase) => {
    const info = await getDesktopInfo();
    if (info.isDesktop) return desktopEngine.importBackup(backup);
    return requestJson<AppDatabase>('/api/import', {
      method: 'POST',
      body: JSON.stringify(backup),
    });
  },
};
