import {
  AppDatabase,
  InvestmentDefinition,
  KakeiboPillar,
  LedgerEntry,
  LedgerEntryWithBalance,
  MonthRecord,
} from './types';

export interface EnvelopeStatus {
  id: string;
  label: string;
  kanji: string;
  planned: number;
  spent: number;
  remaining: number;
  percentUsed: number;
  isOverBudget: boolean;
  enabled: boolean;
}

export interface InvestmentMonthStatus {
  investment: InvestmentDefinition;
  plannedThisMonth: number;
  contributedThisMonth: number;
  remainingThisMonth: number;
  percentCompleted: number;
  totalAllTime: number;
}

export interface WeekSummary {
  weekNumber: number;
  label: string;
  rangeLabel: string;
  income: number;
  expense: number;
  net: number;
}

export interface MonthComputedSummary {
  monthKey: string;
  salary: number;
  carryover: number;
  openingBalance: number;
  totalExtraIncome: number;
  totalAdjustmentsUp: number;
  totalAdjustmentsDown: number;
  generalDirectOutflow: number;
  grossAvailableForMonth: number; // Capital total del mes tras entradas y ajustes generales
  totalOutflowAll: number;        // Todas las salidas y ajustes (-)
  totalInflowAll: number;         // Salario + carryover + ingresos extra + ajustes (+)
  currentGeneralBalance: number;  // Saldo general vivo hoy en caja/libreta
  committedBudgetTotal: number;   // Hogar + Deudas + Manutenciones + Inversiones + Sobres extra
  overBudgetExcess: number;       // Exceso gastado por encima de sobres comprometidos
  pocketMoneyPlanned: number;     // Dinero de bolsillo si llega a quedar (>= 0)
  pocketMoneySpent: number;       // Gastado del dinero de bolsillo
  pocketMoneyRemaining: number;   // Lo que queda hoy en dinero de bolsillo
  budgetDeficit: number;          // Si lo comprometido supera el dinero total del mes (> 0)
  pocketStatus: 'surplus' | 'exact' | 'deficit';
  envelopes: {
    hogar: EnvelopeStatus;
    deudas: EnvelopeStatus;
    manutenciones: EnvelopeStatus;
    inversiones: EnvelopeStatus;
    bolsillo: EnvelopeStatus;
    custom: EnvelopeStatus[];
  };
  investmentBreakdown: InvestmentMonthStatus[];
  ledgerAscending: LedgerEntryWithBalance[];
  ledgerDescending: LedgerEntryWithBalance[];
  weeklyBreakdown: WeekSummary[];
  pillarTotals: Record<KakeiboPillar, number>;
}

export function isPositiveEntry(type: LedgerEntry['type']): boolean {
  return type === 'income' || type === 'adjustment_up';
}

export function sortEntriesChronologically(entries: LedgerEntry[]): LedgerEntry[] {
  return [...entries].sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export function computeAllTimeInvestmentTotals(db: AppDatabase): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const inv of db.investments) {
    totals[inv.id] = 0;
  }
  for (const month of Object.values(db.months)) {
    for (const entry of month.entries) {
      if (
        (entry.type === 'expense' || entry.type === 'adjustment_down') &&
        entry.division === 'inversiones' &&
        entry.investmentId
      ) {
        totals[entry.investmentId] = (totals[entry.investmentId] || 0) + entry.amount;
      }
    }
  }
  return totals;
}

export function getEffectiveAllocation(
  directAmount: number,
  subItems: { amount: number }[]
): number {
  if (subItems && subItems.length > 0) {
    const sum = subItems.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);
    if (sum > 0) return sum;
  }
  return Number(directAmount) || 0;
}

export function computeMonthSummary(
  month: MonthRecord,
  investments: InvestmentDefinition[],
  allTimeInvestmentTotals: Record<string, number> = {}
): MonthComputedSummary {
  const salary = Number(month.salary) || 0;
  const carryover = Number(month.carryover) || 0;
  const openingBalance = round2(salary + carryover);

  const sorted = sortEntriesChronologically(month.entries);

  let running = openingBalance;
  let totalExtraIncome = 0;
  let totalAdjustmentsUp = 0;
  let totalAdjustmentsDown = 0;
  let generalDirectOutflow = 0;
  let totalOutflowAll = 0;

  const spentByDivision: Record<string, number> = {
    hogar: 0,
    deudas: 0,
    manutenciones: 0,
    inversiones: 0,
    bolsillo: 0,
    general: 0,
  };

  const contributedByInvestment: Record<string, number> = {};

  const pillarTotals: Record<KakeiboPillar, number> = {
    supervivencia: 0,
    opcional: 0,
    cultura: 0,
    imprevisto: 0,
    patrimonio: 0,
    ingreso: 0,
    ajuste: 0,
  };

  const weeks: WeekSummary[] = [
    { weekNumber: 1, label: 'Semana 1', rangeLabel: 'Días 01–07', income: 0, expense: 0, net: 0 },
    { weekNumber: 2, label: 'Semana 2', rangeLabel: 'Días 08–14', income: 0, expense: 0, net: 0 },
    { weekNumber: 3, label: 'Semana 3', rangeLabel: 'Días 15–21', income: 0, expense: 0, net: 0 },
    { weekNumber: 4, label: 'Semana 4', rangeLabel: 'Días 22–28', income: 0, expense: 0, net: 0 },
    { weekNumber: 5, label: 'Semana 5', rangeLabel: 'Días 29–31', income: 0, expense: 0, net: 0 },
  ];

  const ledgerAscending: LedgerEntryWithBalance[] = sorted.map((entry) => {
    const amt = round2(Math.abs(Number(entry.amount) || 0));
    const positive = isPositiveEntry(entry.type);
    const signedAmount = positive ? amt : -amt;
    running = round2(running + signedAmount);

    if (entry.type === 'income') {
      totalExtraIncome = round2(totalExtraIncome + amt);
    } else if (entry.type === 'adjustment_up') {
      totalAdjustmentsUp = round2(totalAdjustmentsUp + amt);
    } else if (entry.type === 'adjustment_down') {
      totalAdjustmentsDown = round2(totalAdjustmentsDown + amt);
      totalOutflowAll = round2(totalOutflowAll + amt);
      if (entry.division === 'general' || !entry.division) {
        generalDirectOutflow = round2(generalDirectOutflow + amt);
      } else {
        spentByDivision[entry.division] = round2((spentByDivision[entry.division] || 0) + amt);
      }
    } else if (entry.type === 'expense') {
      totalOutflowAll = round2(totalOutflowAll + amt);
      const div = entry.division || 'general';
      if (div === 'general') {
        generalDirectOutflow = round2(generalDirectOutflow + amt);
      } else {
        spentByDivision[div] = round2((spentByDivision[div] || 0) + amt);
      }
      if (div === 'inversiones' && entry.investmentId) {
        contributedByInvestment[entry.investmentId] = round2(
          (contributedByInvestment[entry.investmentId] || 0) + amt
        );
      }
    }

    const pillarKey = entry.pillar || (positive ? 'ingreso' : 'supervivencia');
    pillarTotals[pillarKey] = round2((pillarTotals[pillarKey] || 0) + amt);

    // Week index (1..5)
    const dayNum = parseInt(entry.date.split('-')[2] || '1', 10) || 1;
    const weekIdx = Math.min(4, Math.max(0, Math.floor((dayNum - 1) / 7)));
    if (positive) {
      weeks[weekIdx].income = round2(weeks[weekIdx].income + amt);
    } else {
      weeks[weekIdx].expense = round2(weeks[weekIdx].expense + amt);
    }
    weeks[weekIdx].net = round2(weeks[weekIdx].income - weeks[weekIdx].expense);

    return {
      ...entry,
      amount: amt,
      signedAmount,
      runningBalance: running,
    };
  });

  const currentGeneralBalance = running;
  const totalInflowAll = round2(openingBalance + totalExtraIncome + totalAdjustmentsUp);

  // Capital general neto disponible para distribuir en el mes
  const grossAvailableForMonth = round2(totalInflowAll - generalDirectOutflow);

  // Planned amounts per envelope
  const plannedHogar = round2(
    getEffectiveAllocation(month.allocations.hogar, month.allocations.hogarItems)
  );
  const plannedDeudas = round2(
    getEffectiveAllocation(month.allocations.deudas, month.allocations.deudasItems)
  );
  const plannedManutenciones = month.hasManutenciones
    ? round2(
        getEffectiveAllocation(
          month.allocations.manutenciones,
          month.allocations.manutencionesItems
        )
      )
    : 0;

  // Investment breakdown
  const activeOrRelevantInvestments = investments.filter(
    (inv) =>
      inv.active ||
      (month.allocations.investmentTargets &&
        month.allocations.investmentTargets[inv.id] !== undefined) ||
      (contributedByInvestment[inv.id] || 0) > 0
  );

  const investmentBreakdown: InvestmentMonthStatus[] = activeOrRelevantInvestments.map((inv) => {
    const customTarget = month.allocations.investmentTargets?.[inv.id];
    const plannedThisMonth = round2(
      customTarget !== undefined ? Number(customTarget) || 0 : inv.active ? inv.monthlyTarget : 0
    );
    const contributedThisMonth = round2(contributedByInvestment[inv.id] || 0);
    const remainingThisMonth = round2(Math.max(0, plannedThisMonth - contributedThisMonth));
    const percentCompleted =
      plannedThisMonth > 0
        ? Math.min(100, Math.round((contributedThisMonth / plannedThisMonth) * 100))
        : contributedThisMonth > 0
        ? 100
        : 0;

    return {
      investment: inv,
      plannedThisMonth,
      contributedThisMonth,
      remainingThisMonth,
      percentCompleted,
      totalAllTime: round2(allTimeInvestmentTotals[inv.id] || 0),
    };
  });

  const plannedInversiones = round2(
    investmentBreakdown.reduce((acc, item) => acc + item.plannedThisMonth, 0)
  );

  const customStatuses: EnvelopeStatus[] = (month.allocations.customEnvelopes || []).map((ce) => {
    const planned = round2(Number(ce.allocated) || 0);
    const spent = round2(spentByDivision[ce.id] || 0);
    return buildEnvelopeStatus(ce.id, ce.name, '特別', planned, spent, true);
  });

  const plannedCustomTotal = round2(
    customStatuses.reduce((acc, item) => acc + item.planned, 0)
  );

  const committedBudgetTotal = round2(
    plannedHogar + plannedDeudas + plannedManutenciones + plannedInversiones + plannedCustomTotal
  );

  const hogarEnv = buildEnvelopeStatus(
    'hogar',
    'Gastos del Hogar',
    '家計',
    plannedHogar,
    spentByDivision.hogar || 0,
    true
  );
  const deudasEnv = buildEnvelopeStatus(
    'deudas',
    'Deudas y Cuotas',
    '負債',
    plannedDeudas,
    spentByDivision.deudas || 0,
    true
  );
  const manutencionesEnv = buildEnvelopeStatus(
    'manutenciones',
    'Manutenciones',
    '扶養',
    plannedManutenciones,
    spentByDivision.manutenciones || 0,
    month.hasManutenciones
  );
  const inversionesEnv = buildEnvelopeStatus(
    'inversiones',
    'Inversiones',
    '投資',
    plannedInversiones,
    spentByDivision.inversiones || 0,
    true
  );

  // Over-budget excess across committed envelopes
  const overBudgetExcess = round2(
    Math.max(0, hogarEnv.spent - hogarEnv.planned) +
      Math.max(0, deudasEnv.spent - deudasEnv.planned) +
      (month.hasManutenciones
        ? Math.max(0, manutencionesEnv.spent - manutencionesEnv.planned)
        : manutencionesEnv.spent) +
      Math.max(0, inversionesEnv.spent - inversionesEnv.planned) +
      customStatuses.reduce((acc, c) => acc + Math.max(0, c.spent - c.planned), 0)
  );

  const rawRemainder = round2(grossAvailableForMonth - committedBudgetTotal - overBudgetExcess);
  const pocketMoneyPlanned = round2(Math.max(0, rawRemainder));
  const budgetDeficit = rawRemainder < 0 ? round2(Math.abs(rawRemainder)) : 0;

  let pocketStatus: 'surplus' | 'exact' | 'deficit' = 'exact';
  if (rawRemainder > 0.009) {
    pocketStatus = 'surplus';
  } else if (rawRemainder < -0.009) {
    pocketStatus = 'deficit';
  }

  const pocketMoneySpent = round2(spentByDivision.bolsillo || 0);
  const bolsilloEnv = buildEnvelopeStatus(
    'bolsillo',
    'Dinero de Bolsillo',
    '小遣',
    pocketMoneyPlanned,
    pocketMoneySpent,
    true
  );

  return {
    monthKey: month.monthKey,
    salary,
    carryover,
    openingBalance,
    totalExtraIncome,
    totalAdjustmentsUp,
    totalAdjustmentsDown,
    generalDirectOutflow,
    grossAvailableForMonth,
    totalOutflowAll,
    totalInflowAll,
    currentGeneralBalance,
    committedBudgetTotal,
    overBudgetExcess,
    pocketMoneyPlanned,
    pocketMoneySpent,
    pocketMoneyRemaining: bolsilloEnv.remaining,
    budgetDeficit,
    pocketStatus,
    envelopes: {
      hogar: hogarEnv,
      deudas: deudasEnv,
      manutenciones: manutencionesEnv,
      inversiones: inversionesEnv,
      bolsillo: bolsilloEnv,
      custom: customStatuses,
    },
    investmentBreakdown,
    ledgerAscending,
    ledgerDescending: [...ledgerAscending].reverse(),
    weeklyBreakdown: weeks,
    pillarTotals,
  };
}

function buildEnvelopeStatus(
  id: string,
  label: string,
  kanji: string,
  planned: number,
  spent: number,
  enabled: boolean
): EnvelopeStatus {
  const rem = round2(planned - spent);
  const pct =
    planned > 0
      ? Math.round((spent / planned) * 100)
      : spent > 0
      ? 100
      : 0;
  return {
    id,
    label,
    kanji,
    planned,
    spent,
    remaining: rem,
    percentUsed: pct,
    isOverBudget: spent > planned + 0.009,
    enabled,
  };
}

export function round2(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

export function getCurrentMonthKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function getTodayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m) return monthKey;
  const names = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ];
  return `${names[m - 1] || monthKey} ${y}`;
}

export function shiftMonthKey(monthKey: string, deltaMonths: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + deltaMonths, 1);
  const ny = d.getFullYear();
  const nm = String(d.getMonth() + 1).padStart(2, '0');
  return `${ny}-${nm}`;
}

export function daysSinceFirstUse(firstUseDateIso: string): number {
  const start = new Date(firstUseDateIso);
  const now = new Date();
  const startDay = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const nowDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const diffDays = Math.floor((nowDay - startDay) / (1000 * 60 * 60 * 24));
  return Math.max(1, diffDays + 1); // Día 1 desde el primer día de uso
}
