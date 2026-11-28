import {
  AppDatabase,
  InvestmentCategory,
  InvestmentDefinition,
  InvestmentLiquidity,
  InvestmentRiskLevel,
  KakeiboPillar,
  LedgerEntry,
  LedgerEntryWithBalance,
  MonthRecord,
  PaymentMethod,
} from './types';

export interface EnvelopeStatus {
  id: string;
  label: string;
  kanji: string;
  planned: number;
  spent: number;
  spentEfectivo: number;
  spentTransferencia: number;
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
  salaryEfectivo: number;
  salaryTransferencia: number;
  carryover: number;
  carryoverEfectivo: number;
  carryoverTransferencia: number;
  openingEfectivo: number;
  openingTransferencia: number;
  openingBalance: number;
  totalExtraIncome: number;
  totalAdjustmentsUp: number;
  totalAdjustmentsDown: number;
  generalDirectOutflow: number;
  grossAvailableForMonth: number;
  totalOutflowAll: number;
  totalInflowAll: number;
  inflowEfectivo: number;
  outflowEfectivo: number;
  inflowTransferencia: number;
  outflowTransferencia: number;
  currentEfectivoBalance: number;
  currentTransferenciaBalance: number;
  currentGeneralBalance: number;
  committedBudgetTotal: number;
  overBudgetExcess: number;
  pocketMoneyPlanned: number;
  pocketMoneySpent: number;
  pocketMoneyRemaining: number;
  budgetDeficit: number;
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

export function computeAllTimeInvestmentTotals(
  monthsMap: Record<string, MonthRecord>,
  investments: InvestmentDefinition[]
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const inv of investments) {
    totals[inv.id] = 0;
  }
  for (const month of Object.values(monthsMap)) {
    for (const entry of month.entries) {
      if (
        (entry.type === 'expense' || entry.type === 'adjustment_down') &&
        entry.division === 'inversiones' &&
        entry.investmentId
      ) {
        totals[entry.investmentId] = round2((totals[entry.investmentId] || 0) + entry.amount);
      }
    }
  }
  return totals;
}

export const DEFAULT_RISK_DRAWDOWN_PCT: Record<InvestmentRiskLevel, number> = {
  bajo: 5,
  moderado: 15,
  alto: 35,
  especulativo: 70,
};

export const DEFAULT_EXPECTED_ROI_PCT: Record<InvestmentRiskLevel, number> = {
  bajo: 6,
  moderado: 14,
  alto: 25,
  especulativo: 45,
};

const RISK_SCORE_WEIGHTS: Record<InvestmentRiskLevel, number> = {
  bajo: 18,
  moderado: 45,
  alto: 74,
  especulativo: 95,
};

export function inferDefaultRiskByCategory(category: InvestmentCategory): InvestmentRiskLevel {
  switch (category) {
    case 'ahorro_meta':
    case 'renta_fija':
      return 'bajo';
    case 'divisas':
    case 'bienes_raices':
      return 'moderado';
    case 'cripto':
      return 'especulativo';
    case 'negocio':
    case 'acciones_etf':
    default:
      return 'alto';
  }
}

export function inferDefaultLiquidityByCategory(
  category: InvestmentCategory
): InvestmentLiquidity {
  switch (category) {
    case 'divisas':
    case 'ahorro_meta':
    case 'cripto':
      return 'inmediata';
    case 'negocio':
    case 'acciones_etf':
      return 'corto_plazo';
    case 'renta_fija':
      return 'mediano_plazo';
    case 'bienes_raices':
      return 'largo_plazo';
    default:
      return 'corto_plazo';
  }
}

export interface InvestmentPerformanceMetrics {
  investment: InvestmentDefinition;
  riskLevel: InvestmentRiskLevel;
  liquidity: InvestmentLiquidity;
  totalInvested: number;
  realizedProfit: number;
  withdrawnPrincipal: number;
  recordedLosses: number;
  totalReturnedToHand: number;
  autoBookValue: number;
  hasManualValuation: boolean;
  activeValueInPlay: number;
  totalWealthGenerated: number;
  netProfitLoss: number;
  roiPercent: number;
  expectedRoiPercent: number;
  capitalRecoveryPercent: number;
  effectiveMaxLossPct: number;
  potentialAdverseLossAmount: number;
  currentDrawdownPct: number;
  isStopLossBreached: boolean;
}

export interface PortfolioAnalyticsSummary {
  items: InvestmentPerformanceMetrics[];
  byId: Record<string, InvestmentPerformanceMetrics>;
  totalInvestedAllTime: number;
  totalActiveValueInPlay: number;
  totalReturnedToHand: number;
  totalRealizedProfit: number;
  totalRecordedLosses: number;
  totalNetProfitLoss: number;
  overallRoiPercent: number;
  overallRecoveryPercent: number;
  totalAdverseRiskAmount: number;
  capitalByRisk: Record<InvestmentRiskLevel, number>;
  capitalByLiquidity: Record<InvestmentLiquidity, number>;
  usingPlannedWeightsForRiskMap: boolean;
  highRiskSharePercent: number;
  weightedRiskScore: number;
  stopLossAlertsCount: number;
}

export function computePortfolioAnalytics(
  monthsMap: Record<string, MonthRecord>,
  investments: InvestmentDefinition[]
): PortfolioAnalyticsSummary {
  const allTimeTotals = computeAllTimeInvestmentTotals(monthsMap, investments);

  const items: InvestmentPerformanceMetrics[] = investments.map((inv) => {
    const riskLevel = inv.riskLevel || inferDefaultRiskByCategory(inv.category);
    const liquidity = inv.liquidity || inferDefaultLiquidityByCategory(inv.category);
    const totalInvested = round2(allTimeTotals[inv.id] || 0);

    let realizedProfit = 0;
    let withdrawnPrincipal = 0;
    let recordedLosses = 0;

    for (const ev of inv.events || []) {
      const amt = round2(Math.max(0, Number(ev.amount) || 0));
      if (ev.kind === 'return_payout') {
        realizedProfit = round2(realizedProfit + amt);
      } else if (ev.kind === 'capital_withdraw') {
        withdrawnPrincipal = round2(withdrawnPrincipal + amt);
      } else if (ev.kind === 'loss_writeoff') {
        recordedLosses = round2(recordedLosses + amt);
      }
    }

    const totalReturnedToHand = round2(realizedProfit + withdrawnPrincipal);
    const autoBookValue = round2(
      Math.max(0, totalInvested - withdrawnPrincipal - recordedLosses)
    );
    const hasManualValuation =
      inv.currentEstimatedValue !== undefined &&
      inv.currentEstimatedValue !== null &&
      Number.isFinite(Number(inv.currentEstimatedValue));

    const activeValueInPlay = hasManualValuation
      ? round2(Math.max(0, Number(inv.currentEstimatedValue)))
      : autoBookValue;

    const totalWealthGenerated = round2(activeValueInPlay + totalReturnedToHand);
    const netProfitLoss = round2(totalWealthGenerated - totalInvested);
    const roiPercent =
      totalInvested > 0 ? round2((netProfitLoss / totalInvested) * 100) : 0;
    const capitalRecoveryPercent =
      totalInvested > 0 ? round2((totalReturnedToHand / totalInvested) * 100) : 0;

    const expectedRoiPercent =
      inv.expectedRoiPercent !== undefined
        ? round2(Math.max(0, Number(inv.expectedRoiPercent) || 0))
        : DEFAULT_EXPECTED_ROI_PCT[riskLevel];

    const effectiveMaxLossPct =
      inv.maxAcceptableLossPercent !== undefined
        ? round2(Math.max(0, Number(inv.maxAcceptableLossPercent) || 0))
        : DEFAULT_RISK_DRAWDOWN_PCT[riskLevel];

    const potentialAdverseLossAmount = round2(
      (activeValueInPlay * effectiveMaxLossPct) / 100
    );

    const currentDrawdownPct =
      netProfitLoss < 0 && totalInvested > 0
        ? round2((Math.abs(netProfitLoss) / totalInvested) * 100)
        : 0;

    const isStopLossBreached =
      totalInvested > 0 &&
      effectiveMaxLossPct > 0 &&
      currentDrawdownPct >= effectiveMaxLossPct;

    return {
      investment: inv,
      riskLevel,
      liquidity,
      totalInvested,
      realizedProfit,
      withdrawnPrincipal,
      recordedLosses,
      totalReturnedToHand,
      autoBookValue,
      hasManualValuation,
      activeValueInPlay,
      totalWealthGenerated,
      netProfitLoss,
      roiPercent,
      expectedRoiPercent,
      capitalRecoveryPercent,
      effectiveMaxLossPct,
      potentialAdverseLossAmount,
      currentDrawdownPct,
      isStopLossBreached,
    };
  });

  const byId: Record<string, InvestmentPerformanceMetrics> = {};
  let totalInvestedAllTime = 0;
  let totalActiveValueInPlay = 0;
  let totalReturnedToHand = 0;
  let totalRealizedProfit = 0;
  let totalRecordedLosses = 0;
  let totalNetProfitLoss = 0;
  let totalAdverseRiskAmount = 0;
  let stopLossAlertsCount = 0;

  for (const m of items) {
    byId[m.investment.id] = m;
    totalInvestedAllTime = round2(totalInvestedAllTime + m.totalInvested);
    totalActiveValueInPlay = round2(totalActiveValueInPlay + m.activeValueInPlay);
    totalReturnedToHand = round2(totalReturnedToHand + m.totalReturnedToHand);
    totalRealizedProfit = round2(totalRealizedProfit + m.realizedProfit);
    totalRecordedLosses = round2(totalRecordedLosses + m.recordedLosses);
    totalNetProfitLoss = round2(totalNetProfitLoss + m.netProfitLoss);
    totalAdverseRiskAmount = round2(totalAdverseRiskAmount + m.potentialAdverseLossAmount);
    if (m.isStopLossBreached) stopLossAlertsCount += 1;
  }

  const overallRoiPercent =
    totalInvestedAllTime > 0
      ? round2((totalNetProfitLoss / totalInvestedAllTime) * 100)
      : 0;
  const overallRecoveryPercent =
    totalInvestedAllTime > 0
      ? round2((totalReturnedToHand / totalInvestedAllTime) * 100)
      : 0;

  const capitalByRisk: Record<InvestmentRiskLevel, number> = {
    bajo: 0,
    moderado: 0,
    alto: 0,
    especulativo: 0,
  };

  const capitalByLiquidity: Record<InvestmentLiquidity, number> = {
    inmediata: 0,
    corto_plazo: 0,
    mediano_plazo: 0,
    largo_plazo: 0,
  };

  const usingPlannedWeightsForRiskMap = totalActiveValueInPlay <= 0;
  let weightDenominator = 0;
  let weightedScoreAccumulator = 0;

  for (const m of items) {
    capitalByLiquidity[m.liquidity] = round2(
      capitalByLiquidity[m.liquidity] + m.activeValueInPlay
    );
    if (!m.investment.active && m.activeValueInPlay <= 0) continue;
    const weight = usingPlannedWeightsForRiskMap
      ? round2(Math.max(0, m.investment.monthlyTarget || 0))
      : m.activeValueInPlay;
    if (weight <= 0) continue;
    capitalByRisk[m.riskLevel] = round2(capitalByRisk[m.riskLevel] + weight);
    weightDenominator = round2(weightDenominator + weight);
    weightedScoreAccumulator += weight * RISK_SCORE_WEIGHTS[m.riskLevel];
  }

  const highRiskCap = round2(capitalByRisk.alto + capitalByRisk.especulativo);
  const highRiskSharePercent =
    weightDenominator > 0 ? round2((highRiskCap / weightDenominator) * 100) : 0;
  const weightedRiskScore =
    weightDenominator > 0 ? Math.round(weightedScoreAccumulator / weightDenominator) : 0;

  return {
    items,
    byId,
    totalInvestedAllTime,
    totalActiveValueInPlay,
    totalReturnedToHand,
    totalRealizedProfit,
    totalRecordedLosses,
    totalNetProfitLoss,
    overallRoiPercent,
    overallRecoveryPercent,
    totalAdverseRiskAmount,
    capitalByRisk,
    capitalByLiquidity,
    usingPlannedWeightsForRiskMap,
    highRiskSharePercent,
    weightedRiskScore,
    stopLossAlertsCount,
  };
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

export function resolveMonthOpeningSplits(month: MonthRecord): {
  salaryEfectivo: number;
  salaryTransferencia: number;
  salaryTotal: number;
  carryoverEfectivo: number;
  carryoverTransferencia: number;
  carryoverTotal: number;
} {
  const hasSalarySplit =
    month.salaryEfectivo !== undefined || month.salaryTransferencia !== undefined;
  const salEf = hasSalarySplit
    ? round2(Number(month.salaryEfectivo) || 0)
    : round2(Number(month.salary) || 0);
  const salTr = hasSalarySplit ? round2(Number(month.salaryTransferencia) || 0) : 0;
  const salaryTotal = round2(salEf + salTr);

  const hasCarrySplit =
    month.carryoverEfectivo !== undefined || month.carryoverTransferencia !== undefined;
  const carEf = hasCarrySplit
    ? round2(Number(month.carryoverEfectivo) || 0)
    : round2(Number(month.carryover) || 0);
  const carTr = hasCarrySplit ? round2(Number(month.carryoverTransferencia) || 0) : 0;
  const carryoverTotal = round2(carEf + carTr);

  return {
    salaryEfectivo: salEf,
    salaryTransferencia: salTr,
    salaryTotal,
    carryoverEfectivo: carEf,
    carryoverTransferencia: carTr,
    carryoverTotal,
  };
}

export function computeMonthSummary(
  month: MonthRecord,
  investments: InvestmentDefinition[],
  allTimeInvestmentTotals: Record<string, number> = {}
): MonthComputedSummary {
  const splits = resolveMonthOpeningSplits(month);
  const openingEfectivo = round2(splits.salaryEfectivo + splits.carryoverEfectivo);
  const openingTransferencia = round2(
    splits.salaryTransferencia + splits.carryoverTransferencia
  );
  const openingBalance = round2(openingEfectivo + openingTransferencia);

  const sorted = sortEntriesChronologically(month.entries);

  let runEf = openingEfectivo;
  let runTr = openingTransferencia;

  let totalExtraIncome = 0;
  let totalAdjustmentsUp = 0;
  let totalAdjustmentsDown = 0;
  let generalDirectOutflow = 0;
  let totalOutflowAll = 0;

  let inflowEfectivo = Math.max(0, openingEfectivo);
  let outflowEfectivo = openingEfectivo < 0 ? Math.abs(openingEfectivo) : 0;
  let inflowTransferencia = Math.max(0, openingTransferencia);
  let outflowTransferencia = openingTransferencia < 0 ? Math.abs(openingTransferencia) : 0;

  const spentByDivision: Record<string, number> = {
    hogar: 0,
    deudas: 0,
    manutenciones: 0,
    inversiones: 0,
    bolsillo: 0,
    general: 0,
  };
  const spentEfByDivision: Record<string, number> = {};
  const spentTrByDivision: Record<string, number> = {};

  const contributedByInvestment: Record<string, number> = {};

  const pillarTotals: Record<KakeiboPillar, number> = {
    supervivencia: 0,
    opcional: 0,
    cultura: 0,
    imprevisto: 0,
    patrimonio: 0,
    ingreso: 0,
    ajuste: 0,
    traspaso: 0,
  };

  const weeks: WeekSummary[] = [
    { weekNumber: 1, label: 'Semana 1', rangeLabel: 'Días 01–07', income: 0, expense: 0, net: 0 },
    { weekNumber: 2, label: 'Semana 2', rangeLabel: 'Días 08–14', income: 0, expense: 0, net: 0 },
    { weekNumber: 3, label: 'Semana 3', rangeLabel: 'Días 15–21', income: 0, expense: 0, net: 0 },
    { weekNumber: 4, label: 'Semana 4', rangeLabel: 'Días 22–28', income: 0, expense: 0, net: 0 },
    { weekNumber: 5, label: 'Semana 5', rangeLabel: 'Días 29–31', income: 0, expense: 0, net: 0 },
  ];

  const addDivisionSpend = (div: string, method: PaymentMethod, amt: number) => {
    if (div === 'general' || !div) {
      generalDirectOutflow = round2(generalDirectOutflow + amt);
    } else {
      spentByDivision[div] = round2((spentByDivision[div] || 0) + amt);
      if (method === 'transferencia') {
        spentTrByDivision[div] = round2((spentTrByDivision[div] || 0) + amt);
      } else {
        spentEfByDivision[div] = round2((spentEfByDivision[div] || 0) + amt);
      }
    }
  };

  const ledgerAscending: LedgerEntryWithBalance[] = sorted.map((entry) => {
    const amt = round2(Math.abs(Number(entry.amount) || 0));
    const method: PaymentMethod =
      entry.paymentMethod === 'transferencia' ? 'transferencia' : 'efectivo';
    const dayNum = parseInt(entry.date.split('-')[2] || '1', 10) || 1;
    const weekIdx = Math.min(4, Math.max(0, Math.floor((dayNum - 1) / 7)));

    let efDelta = 0;
    let trDelta = 0;
    let signedAmount = 0;

    if (entry.type === 'channel_transfer') {
      const dir = entry.transferDirection || 'transf_to_cash';
      const fee = round2(Math.max(0, Number(entry.transferFee) || 0));
      const netReceived = round2(Math.max(0, amt - fee));

      if (dir === 'transf_to_cash') {
        // Sale de transferencia, entra en efectivo (descontando comisión si hubo)
        trDelta = -amt;
        efDelta = netReceived;
        outflowTransferencia = round2(outflowTransferencia + amt);
        inflowEfectivo = round2(inflowEfectivo + netReceived);
        if (fee > 0) {
          totalOutflowAll = round2(totalOutflowAll + fee);
          addDivisionSpend(entry.division || 'bolsillo', 'transferencia', fee);
          weeks[weekIdx].expense = round2(weeks[weekIdx].expense + fee);
        }
      } else {
        // Sale de efectivo, entra en transferencia (descontando comisión si hubo)
        efDelta = -amt;
        trDelta = netReceived;
        outflowEfectivo = round2(outflowEfectivo + amt);
        inflowTransferencia = round2(inflowTransferencia + netReceived);
        if (fee > 0) {
          totalOutflowAll = round2(totalOutflowAll + fee);
          addDivisionSpend(entry.division || 'bolsillo', 'efectivo', fee);
          weeks[weekIdx].expense = round2(weeks[weekIdx].expense + fee);
        }
      }
      signedAmount = round2(efDelta + trDelta); // 0 if no fee, -fee if fee > 0
      pillarTotals.traspaso = round2((pillarTotals.traspaso || 0) + amt);
    } else if (entry.type === 'income' || entry.type === 'adjustment_up') {
      signedAmount = amt;
      if (method === 'transferencia') {
        trDelta = amt;
        inflowTransferencia = round2(inflowTransferencia + amt);
      } else {
        efDelta = amt;
        inflowEfectivo = round2(inflowEfectivo + amt);
      }
      if (entry.type === 'income') {
        totalExtraIncome = round2(totalExtraIncome + amt);
      } else {
        totalAdjustmentsUp = round2(totalAdjustmentsUp + amt);
      }
      const pk = entry.pillar || 'ingreso';
      pillarTotals[pk] = round2((pillarTotals[pk] || 0) + amt);
      weeks[weekIdx].income = round2(weeks[weekIdx].income + amt);
    } else {
      // expense or adjustment_down
      signedAmount = -amt;
      if (method === 'transferencia') {
        trDelta = -amt;
        outflowTransferencia = round2(outflowTransferencia + amt);
      } else {
        efDelta = -amt;
        outflowEfectivo = round2(outflowEfectivo + amt);
      }
      totalOutflowAll = round2(totalOutflowAll + amt);
      if (entry.type === 'adjustment_down') {
        totalAdjustmentsDown = round2(totalAdjustmentsDown + amt);
      }
      const div = entry.division || 'general';
      addDivisionSpend(div, method, amt);

      if (entry.type === 'expense' && div === 'inversiones' && entry.investmentId) {
        contributedByInvestment[entry.investmentId] = round2(
          (contributedByInvestment[entry.investmentId] || 0) + amt
        );
      }

      const pk = entry.pillar || 'supervivencia';
      pillarTotals[pk] = round2((pillarTotals[pk] || 0) + amt);
      weeks[weekIdx].expense = round2(weeks[weekIdx].expense + amt);
    }

    weeks[weekIdx].net = round2(weeks[weekIdx].income - weeks[weekIdx].expense);

    runEf = round2(runEf + efDelta);
    runTr = round2(runTr + trDelta);
    const runTotal = round2(runEf + runTr);

    return {
      ...entry,
      paymentMethod: method,
      amount: amt,
      signedAmount,
      efectivoDelta: efDelta,
      transferenciaDelta: trDelta,
      runningEfectivo: runEf,
      runningTransferencia: runTr,
      runningBalance: runTotal,
    };
  });

  const currentEfectivoBalance = runEf;
  const currentTransferenciaBalance = runTr;
  const currentGeneralBalance = round2(runEf + runTr);
  const totalInflowAll = round2(openingBalance + totalExtraIncome + totalAdjustmentsUp);
  const grossAvailableForMonth = round2(totalInflowAll - generalDirectOutflow);

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
    return buildEnvelopeStatus(
      ce.id,
      ce.name,
      '特別',
      planned,
      spentByDivision[ce.id] || 0,
      spentEfByDivision[ce.id] || 0,
      spentTrByDivision[ce.id] || 0,
      true
    );
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
    spentEfByDivision.hogar || 0,
    spentTrByDivision.hogar || 0,
    true
  );
  const deudasEnv = buildEnvelopeStatus(
    'deudas',
    'Deudas y Cuotas',
    '負債',
    plannedDeudas,
    spentByDivision.deudas || 0,
    spentEfByDivision.deudas || 0,
    spentTrByDivision.deudas || 0,
    true
  );
  const manutencionesEnv = buildEnvelopeStatus(
    'manutenciones',
    'Manutenciones',
    '扶養',
    plannedManutenciones,
    spentByDivision.manutenciones || 0,
    spentEfByDivision.manutenciones || 0,
    spentTrByDivision.manutenciones || 0,
    month.hasManutenciones
  );
  const inversionesEnv = buildEnvelopeStatus(
    'inversiones',
    'Inversiones',
    '投資',
    plannedInversiones,
    spentByDivision.inversiones || 0,
    spentEfByDivision.inversiones || 0,
    spentTrByDivision.inversiones || 0,
    true
  );

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
    spentEfByDivision.bolsillo || 0,
    spentTrByDivision.bolsillo || 0,
    true
  );

  return {
    monthKey: month.monthKey,
    salary: splits.salaryTotal,
    salaryEfectivo: splits.salaryEfectivo,
    salaryTransferencia: splits.salaryTransferencia,
    carryover: splits.carryoverTotal,
    carryoverEfectivo: splits.carryoverEfectivo,
    carryoverTransferencia: splits.carryoverTransferencia,
    openingEfectivo,
    openingTransferencia,
    openingBalance,
    totalExtraIncome,
    totalAdjustmentsUp,
    totalAdjustmentsDown,
    generalDirectOutflow,
    grossAvailableForMonth,
    totalOutflowAll,
    totalInflowAll,
    inflowEfectivo,
    outflowEfectivo,
    inflowTransferencia,
    outflowTransferencia,
    currentEfectivoBalance,
    currentTransferenciaBalance,
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
  spentEfectivo: number,
  spentTransferencia: number,
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
    spent: round2(spent),
    spentEfectivo: round2(spentEfectivo),
    spentTransferencia: round2(spentTransferencia),
    remaining: rem,
    percentUsed: pct,
    isOverBudget: spent > planned + 0.009,
    enabled,
  };
}

export function hasRealUserData(db: AppDatabase): boolean {
  if (db.isDemoActive) return false;
  if (db.exchangeControl) {
    for (const r of Object.values(db.exchangeControl.rates || {})) {
      if ((r.rateEfectivo || 0) > 0 || (r.rateTransferencia || 0) > 0) return true;
    }
    if ((db.exchangeControl.operations || []).length > 0) return true;
  }
  const workspaces = Object.values(db.currencyWorkspaces || {});
  for (const ws of workspaces) {
    if ((ws.currentSalary || 0) > 0) return true;
    if (ws.investments && ws.investments.length > 0) return true;
    for (const m of Object.values(ws.months || {})) {
      if ((m.salary || 0) > 0 || (m.carryover || 0) !== 0) return true;
      if (m.entries && m.entries.length > 0) return true;
      if (
        (m.allocations?.hogar || 0) > 0 ||
        (m.allocations?.deudas || 0) > 0 ||
        (m.allocations?.manutenciones || 0) > 0
      ) {
        return true;
      }
    }
  }
  return false;
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
  return Math.max(1, diffDays + 1);
}
