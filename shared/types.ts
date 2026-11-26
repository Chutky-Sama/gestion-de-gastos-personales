export type CoreDivisionId =
  | 'hogar'
  | 'deudas'
  | 'manutenciones'
  | 'inversiones'
  | 'bolsillo'
  | 'general';

export type DivisionId = CoreDivisionId | string;

export type PaymentMethod = 'efectivo' | 'transferencia';

export type TransferDirection = 'transf_to_cash' | 'cash_to_transf';

export type InvestmentCategory =
  | 'acciones_etf'
  | 'cripto'
  | 'renta_fija'
  | 'negocio'
  | 'bienes_raices'
  | 'ahorro_meta'
  | 'divisas'
  | 'otro';

export type KakeiboPillar =
  | 'supervivencia' // 必需 · Necesidad básica
  | 'opcional'      // 娯楽 · Deseo / Ocio
  | 'cultura'       // 教養 · Cultura / Salud / Educación
  | 'imprevisto'    // 特別 · Emergencia / Extra
  | 'patrimonio'    // 資産 · Inversión / Deuda
  | 'ingreso'       // 収入 · Entrada de dinero
  | 'ajuste'        // 調整 · Arqueo / Ajuste de saldo
  | 'traspaso';     // 振替 · Cambio entre Efectivo y Transferencia

export type EntryType =
  | 'income'           // (+) Entrada / Ingreso adicional al mes
  | 'expense'          // (-) Gasto / Pago / Aporte ejecutado
  | 'adjustment_up'    // (+) Ajuste manual al alza
  | 'adjustment_down'  // (-) Ajuste manual a la baja
  | 'channel_transfer';// (⇄) Paso de dinero entre Efectivo y Transferencia

export interface SubItem {
  id: string;
  name: string;
  amount: number;
}

export interface InvestmentDefinition {
  id: string;
  name: string;
  category: InvestmentCategory;
  monthlyTarget: number;
  platform?: string;
  notes?: string;
  active: boolean;
  createdAt: string;
}

export interface CustomEnvelope {
  id: string;
  name: string;
  allocated: number;
  color: string;
}

export interface LedgerEntry {
  id: string;
  monthKey: string; // YYYY-MM
  date: string;     // YYYY-MM-DD
  createdAt: string;
  type: EntryType;
  amount: number;   // Positive number (monto principal)
  paymentMethod: PaymentMethod;
  transferDirection?: TransferDirection; // Para type === 'channel_transfer'
  transferFee?: number;                  // Comisión o descuento al cambiar efectivo <-> transferencia
  concept: string;
  division: DivisionId;
  investmentId?: string;
  pillar: KakeiboPillar;
  note?: string;
}

export interface LedgerEntryWithBalance extends LedgerEntry {
  signedAmount: number;
  efectivoDelta: number;
  transferenciaDelta: number;
  runningEfectivo: number;
  runningTransferencia: number;
  runningBalance: number;
}

export interface MonthAllocations {
  hogar: number;
  deudas: number;
  manutenciones: number;
  hogarItems: SubItem[];
  deudasItems: SubItem[];
  manutencionesItems: SubItem[];
  investmentTargets: Record<string, number>;
  customEnvelopes: CustomEnvelope[];
}

export interface MonthReflection {
  howMuchCanISave: string;
  improvementPlan: string;
  closingNotes: string;
  mood: 'excelente' | 'estable' | 'ajustado' | 'critico' | '';
}

export interface MonthRecord {
  monthKey: string; // YYYY-MM
  salary: number;
  salaryEfectivo: number;
  salaryTransferencia: number;
  carryover: number;
  carryoverEfectivo: number;
  carryoverTransferencia: number;
  hasManutenciones: boolean;
  allocations: MonthAllocations;
  reflection: MonthReflection;
  entries: LedgerEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface CurrencyLedgerWorkspace {
  currencyCode: string;
  currencySymbol: string;
  currentSalary: number;
  currentSalaryEfectivo: number;
  currentSalaryTransferencia: number;
  hasManutencionesDefault: boolean;
  investments: InvestmentDefinition[];
  months: Record<string, MonthRecord>;
}

export interface HistoricalEvent {
  id: string;
  timestamp: string;
  monthKey?: string;
  currencyCode?: string;
  eventType:
    | 'first_day'
    | 'salary_updated'
    | 'month_opened'
    | 'investment_created'
    | 'investment_removed'
    | 'balance_adjusted'
    | 'channel_transfer'
    | 'exchange_rate_updated'
    | 'currency_exchanged'
    | 'demo_started'
    | 'demo_exited'
    | 'backup_restored';
  title: string;
  detail: string;
  amount?: number;
}

export interface ManualCurrencyRate {
  currencyCode: string;        // Ej. 'USD', 'MLC', 'EUR' (1 unidad = X CUP)
  rateEfectivo: number;        // Cuántos CUP vale 1 unidad en Efectivo
  rateTransferencia: number;   // Cuántos CUP vale 1 unidad por Transferencia
  useSeparateChannels: boolean;// Si es false, usa la misma tasa para Efectivo y Transferencia
  updatedAt: string;
  note?: string;
}

export interface ExchangeRateLogEntry {
  id: string;
  timestamp: string;
  currencyCode: string;
  previousEfectivo: number;
  newEfectivo: number;
  previousTransferencia: number;
  newTransferencia: number;
  note?: string;
}

export interface ExchangeOperationRecord {
  id: string;
  timestamp: string;
  date: string;
  monthKey: string;
  fromCurrency: string;
  fromMethod: PaymentMethod;
  fromAmount: number;
  toCurrency: string;
  toMethod: PaymentMethod;
  toAmount: number;
  effectiveCupRate: number;
  appliedToLedgers: boolean;
  note?: string;
}

export interface ExchangeControlState {
  baseCurrency: 'CUP';
  rates: Record<string, ManualCurrencyRate>;
  rateHistory: ExchangeRateLogEntry[];
  operations: ExchangeOperationRecord[];
}

export interface UserProfile {
  ledgerName: string;
  currencyCode: string;     // Active currency code (e.g. 'CUP', 'USD')
  currencySymbol: string;   // Active currency symbol
  enabledCurrencies: string[]; // e.g. ['CUP', 'USD']
  currentSalary: number;
  currentSalaryEfectivo: number;
  currentSalaryTransferencia: number;
  hasManutencionesDefault: boolean;
}

export interface AppDatabase {
  version: number;
  firstUseDate: string;
  lastUpdatedAt: string;
  demoUsed: boolean;
  isDemoActive: boolean;
  demoResetUsed: boolean;
  profile: UserProfile;
  // Active currency mirror fields for convenient reading
  investments: InvestmentDefinition[];
  months: Record<string, MonthRecord>;
  // Multi-currency parallel workspaces (CUP, USD, MLC, EUR, etc.)
  currencyWorkspaces: Record<string, CurrencyLedgerWorkspace>;
  // 100% offline manual exchange board using CUP as native base currency
  exchangeControl: ExchangeControlState;
  historyLog: HistoricalEvent[];
}
