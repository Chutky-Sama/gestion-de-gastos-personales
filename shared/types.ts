export type CoreDivisionId =
  | 'hogar'
  | 'deudas'
  | 'manutenciones'
  | 'inversiones'
  | 'bolsillo'
  | 'general';

export type DivisionId = CoreDivisionId | string;

export type InvestmentCategory =
  | 'acciones_etf'
  | 'cripto'
  | 'renta_fija'
  | 'negocio'
  | 'bienes_raices'
  | 'ahorro_meta'
  | 'otro';

export type KakeiboPillar =
  | 'supervivencia' // 必需 · Necesidad básica
  | 'opcional'      // 娯楽 · Deseo / Ocio
  | 'cultura'       // 教養 · Cultura / Salud / Educación
  | 'imprevisto'    // 特別 · Emergencia / Extra
  | 'patrimonio'    // 資産 · Inversión / Deuda
  | 'ingreso'       // 収入 · Entrada de dinero
  | 'ajuste';       // 調整 · Arqueo / Ajuste de saldo

export type EntryType =
  | 'income'          // (+) Entrada / Ingreso adicional al mes
  | 'expense'         // (-) Gasto / Pago / Aporte ejecutado
  | 'adjustment_up'   // (+) Ajuste manual al alza del dinero general
  | 'adjustment_down';// (-) Ajuste manual a la baja del dinero general

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
  createdAt: string; // ISO string for exact chronological order
  type: EntryType;
  amount: number;   // Positive number
  concept: string;
  division: DivisionId;
  investmentId?: string;
  pillar: KakeiboPillar;
  note?: string;
}

export interface LedgerEntryWithBalance extends LedgerEntry {
  signedAmount: number;
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
  carryover: number;
  hasManutenciones: boolean;
  allocations: MonthAllocations;
  reflection: MonthReflection;
  entries: LedgerEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface HistoricalEvent {
  id: string;
  timestamp: string;
  monthKey?: string;
  eventType:
    | 'first_day'
    | 'salary_updated'
    | 'month_opened'
    | 'investment_created'
    | 'investment_removed'
    | 'balance_adjusted'
    | 'backup_restored';
  title: string;
  detail: string;
  amount?: number;
}

export interface UserProfile {
  ledgerName: string;
  currencyCode: string;
  currencySymbol: string;
  currentSalary: number;
  hasManutencionesDefault: boolean;
}

export interface AppDatabase {
  version: number;
  firstUseDate: string;
  lastUpdatedAt: string;
  profile: UserProfile;
  investments: InvestmentDefinition[];
  months: Record<string, MonthRecord>;
  historyLog: HistoricalEvent[];
}
