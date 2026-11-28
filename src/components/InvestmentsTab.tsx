import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Award,
  Banknote,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Coins,
  Edit3,
  Flame,
  History,
  Layers,
  Plus,
  RefreshCw,
  Scale,
  Shield,
  ShieldAlert,
  Smartphone,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import {
  DEFAULT_EXPECTED_ROI_PCT,
  DEFAULT_RISK_DRAWDOWN_PCT,
  InvestmentPerformanceMetrics,
  MonthComputedSummary,
  computePortfolioAnalytics,
  getTodayDateString,
  inferDefaultLiquidityByCategory,
  inferDefaultRiskByCategory,
} from '../../shared/calculations';
import {
  InvestmentCategory,
  InvestmentDefinition,
  InvestmentEventKind,
  InvestmentLiquidity,
  InvestmentRiskLevel,
  MonthRecord,
  PaymentMethod,
} from '../../shared/types';
import {
  INVESTMENT_CATEGORIES,
  INVESTMENT_EVENT_META,
  INVESTMENT_LIQUIDITY_META,
  INVESTMENT_RISK_META,
  formatMoney,
  formatShortDate,
  getPaymentMethodLabel,
} from '../utils/format';

interface InvestmentsTabProps {
  monthKey: string;
  currencyCode: string;
  monthsMap: Record<string, MonthRecord>;
  investments: InvestmentDefinition[];
  summary: MonthComputedSummary;
  allTimeTotals: Record<string, number>;
  currencySymbol: string;
  onCreateInvestment: (payload: {
    name: string;
    category: InvestmentCategory;
    monthlyTarget: number;
    platform?: string;
    notes?: string;
    riskLevel?: InvestmentRiskLevel;
    liquidity?: InvestmentLiquidity;
    expectedRoiPercent?: number;
    maxAcceptableLossPercent?: number;
  }) => Promise<void>;
  onUpdateInvestment: (
    id: string,
    payload: {
      name?: string;
      category?: InvestmentCategory;
      monthlyTarget?: number;
      platform?: string;
      notes?: string;
      riskLevel?: InvestmentRiskLevel;
      liquidity?: InvestmentLiquidity;
      expectedRoiPercent?: number;
      maxAcceptableLossPercent?: number;
      currentEstimatedValue?: number | null;
      active?: boolean;
    }
  ) => Promise<void>;
  onRecordInvestmentEvent: (
    id: string,
    payload: {
      kind: InvestmentEventKind;
      amount: number;
      date?: string;
      monthKey?: string;
      paymentMethod?: PaymentMethod;
      creditToLedger?: boolean;
      note?: string;
    }
  ) => Promise<void>;
  onDeleteInvestmentEvent: (id: string, eventId: string) => Promise<void>;
  onDeleteInvestment: (id: string) => Promise<void>;
  onQuickContribute: (
    investment: InvestmentDefinition,
    amount: number,
    paymentMethod: PaymentMethod
  ) => Promise<void>;
}

type PortfolioFilter = 'all' | 'active' | 'profitable' | 'losing_or_alert' | 'high_risk';

const RISK_ORDER: InvestmentRiskLevel[] = ['bajo', 'moderado', 'alto', 'especulativo'];
const LIQUIDITY_ORDER: InvestmentLiquidity[] = [
  'inmediata',
  'corto_plazo',
  'mediano_plazo',
  'largo_plazo',
];

function getPortfolioRiskLabel(score: number): {
  label: string;
  colorClass: string;
  hex: string;
} {
  if (score <= 28) {
    return { label: 'Conservador', colorClass: 'text-emerald', hex: '#00f5a0' };
  }
  if (score <= 55) {
    return { label: 'Moderado', colorClass: 'text-cyan', hex: '#00f0ff' };
  }
  if (score <= 78) {
    return { label: 'Dinámico / Alto', colorClass: 'text-amber', hex: '#ffb800' };
  }
  return { label: 'Agresivo / Especulativo', colorClass: 'text-magenta', hex: '#ff2a85' };
}

export const InvestmentsTab: React.FC<InvestmentsTabProps> = ({
  monthKey,
  currencyCode,
  monthsMap,
  investments,
  summary,
  currencySymbol,
  onCreateInvestment,
  onUpdateInvestment,
  onRecordInvestmentEvent,
  onDeleteInvestmentEvent,
  onDeleteInvestment,
  onQuickContribute,
}) => {
  // Collapsible new-investment creator (expanded automatically when portfolio is empty)
  const [isCreatorOpen, setIsCreatorOpen] = useState<boolean>(investments.length === 0);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<InvestmentCategory>('negocio');
  const [targetStr, setTargetStr] = useState('');
  const [platform, setPlatform] = useState('');
  const [notes, setNotes] = useState('');
  const [riskLevel, setRiskLevel] = useState<InvestmentRiskLevel>('alto');
  const [liquidity, setLiquidity] = useState<InvestmentLiquidity>('corto_plazo');
  const [expectedRoiStr, setExpectedRoiStr] = useState('25');
  const [maxLossStr, setMaxLossStr] = useState('35');
  const [creating, setCreating] = useState(false);

  // Portfolio filter
  const [portfolioFilter, setPortfolioFilter] = useState<PortfolioFilter>('all');

  // Inline quick contribution state
  const [contribInvId, setContribInvId] = useState<string | null>(null);
  const [contribAmountStr, setContribAmountStr] = useState('');
  const [contribMethod, setContribMethod] = useState<PaymentMethod>('efectivo');

  // Per-card event history drawer
  const [expandedHistoryIds, setExpandedHistoryIds] = useState<Record<string, boolean>>({});

  // Edit Investment Modal state
  const [editingInv, setEditingInv] = useState<InvestmentDefinition | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<InvestmentCategory>('negocio');
  const [editTargetStr, setEditTargetStr] = useState('');
  const [editPlatform, setEditPlatform] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editRiskLevel, setEditRiskLevel] = useState<InvestmentRiskLevel>('moderado');
  const [editLiquidity, setEditLiquidity] = useState<InvestmentLiquidity>('corto_plazo');
  const [editExpectedRoiStr, setEditExpectedRoiStr] = useState('14');
  const [editMaxLossStr, setEditMaxLossStr] = useState('15');
  const [editActive, setEditActive] = useState(true);

  // Record Event Modal (Profit / Withdrawal / Loss / Valuation)
  const [eventModalInv, setEventModalInv] = useState<InvestmentPerformanceMetrics | null>(null);
  const [eventKind, setEventKind] = useState<InvestmentEventKind>('return_payout');
  const [eventAmountStr, setEventAmountStr] = useState('');
  const [eventDate, setEventDate] = useState(getTodayDateString());
  const [eventMethod, setEventMethod] = useState<PaymentMethod>('efectivo');
  const [eventCreditToLedger, setEventCreditToLedger] = useState(true);
  const [eventNote, setEventNote] = useState('');
  const [savingEvent, setSavingEvent] = useState(false);

  const analytics = useMemo(
    () => computePortfolioAnalytics(monthsMap, investments),
    [monthsMap, investments]
  );

  const statusMap = useMemo(
    () => new Map(summary.investmentBreakdown.map((item) => [item.investment.id, item])),
    [summary.investmentBreakdown]
  );

  const riskThermometer = getPortfolioRiskLabel(analytics.weightedRiskScore);

  const alertPositions = useMemo(
    () => analytics.items.filter((p) => p.investment.active && p.isStopLossBreached),
    [analytics.items]
  );

  const filteredPositions = useMemo(() => {
    return analytics.items.filter((pos) => {
      if (portfolioFilter === 'active') return pos.investment.active;
      if (portfolioFilter === 'profitable') return pos.netProfitLoss > 0.009;
      if (portfolioFilter === 'losing_or_alert') {
        return pos.netProfitLoss < -0.009 || pos.isStopLossBreached;
      }
      if (portfolioFilter === 'high_risk') {
        return pos.riskLevel === 'alto' || pos.riskLevel === 'especulativo';
      }
      return true;
    });
  }, [analytics.items, portfolioFilter]);

  const handleCategoryChange = (nextCat: InvestmentCategory) => {
    setCategory(nextCat);
    const nextRisk = inferDefaultRiskByCategory(nextCat);
    const nextLiq = inferDefaultLiquidityByCategory(nextCat);
    setRiskLevel(nextRisk);
    setLiquidity(nextLiq);
    setExpectedRoiStr(String(DEFAULT_EXPECTED_ROI_PCT[nextRisk]));
    setMaxLossStr(String(DEFAULT_RISK_DRAWDOWN_PCT[nextRisk]));
  };

  const handleRiskPillSelect = (nextRisk: InvestmentRiskLevel) => {
    setRiskLevel(nextRisk);
    setExpectedRoiStr(String(DEFAULT_EXPECTED_ROI_PCT[nextRisk]));
    setMaxLossStr(String(DEFAULT_RISK_DRAWDOWN_PCT[nextRisk]));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      await onCreateInvestment({
        name: name.trim(),
        category,
        monthlyTarget: Math.max(0, parseFloat(targetStr) || 0),
        platform: platform.trim() || undefined,
        notes: notes.trim() || undefined,
        riskLevel,
        liquidity,
        expectedRoiPercent: Math.max(0, parseFloat(expectedRoiStr) || 0),
        maxAcceptableLossPercent: Math.max(0, parseFloat(maxLossStr) || 0),
      });
      setName('');
      setTargetStr('');
      setPlatform('');
      setNotes('');
      setIsCreatorOpen(false);
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (pos: InvestmentPerformanceMetrics) => {
    const inv = pos.investment;
    setEditingInv(inv);
    setEditName(inv.name);
    setEditCategory(inv.category);
    setEditTargetStr(String(inv.monthlyTarget));
    setEditPlatform(inv.platform || '');
    setEditNotes(inv.notes || '');
    setEditRiskLevel(pos.riskLevel);
    setEditLiquidity(pos.liquidity);
    setEditExpectedRoiStr(String(pos.expectedRoiPercent));
    setEditMaxLossStr(String(pos.effectiveMaxLossPct));
    setEditActive(inv.active);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInv || !editName.trim()) return;
    await onUpdateInvestment(editingInv.id, {
      name: editName.trim(),
      category: editCategory,
      monthlyTarget: Math.max(0, parseFloat(editTargetStr) || 0),
      platform: editPlatform.trim(),
      notes: editNotes.trim(),
      riskLevel: editRiskLevel,
      liquidity: editLiquidity,
      expectedRoiPercent: Math.max(0, parseFloat(editExpectedRoiStr) || 0),
      maxAcceptableLossPercent: Math.max(0, parseFloat(editMaxLossStr) || 0),
      active: editActive,
    });
    setEditingInv(null);
  };

  const openEventModal = (pos: InvestmentPerformanceMetrics, kind: InvestmentEventKind) => {
    setEventModalInv(pos);
    setEventKind(kind);
    setEventDate(
      getTodayDateString().startsWith(monthKey) ? getTodayDateString() : `${monthKey}-01`
    );
    setEventMethod('efectivo');
    setEventCreditToLedger(kind === 'return_payout' || kind === 'capital_withdraw');
    setEventNote('');
    if (kind === 'valuation_sync') {
      setEventAmountStr(String(pos.activeValueInPlay));
    } else {
      setEventAmountStr('');
    }
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventModalInv) return;
    const amt = parseFloat(eventAmountStr);
    if (Number.isNaN(amt) || (eventKind !== 'valuation_sync' && amt <= 0) || amt < 0) return;

    setSavingEvent(true);
    try {
      await onRecordInvestmentEvent(eventModalInv.investment.id, {
        kind: eventKind,
        amount: amt,
        date: eventDate,
        monthKey: eventDate.slice(0, 7) || monthKey,
        paymentMethod: eventMethod,
        creditToLedger:
          eventKind === 'return_payout' || eventKind === 'capital_withdraw'
            ? eventCreditToLedger
            : false,
        note: eventNote.trim() || undefined,
      });
      setEventModalInv(null);
    } finally {
      setSavingEvent(false);
    }
  };

  const handleResetAutoValuation = async () => {
    if (!eventModalInv) return;
    setSavingEvent(true);
    try {
      await onUpdateInvestment(eventModalInv.investment.id, {
        currentEstimatedValue: null,
      });
      setEventModalInv(null);
    } finally {
      setSavingEvent(false);
    }
  };

  const toggleHistoryDrawer = (id: string) => {
    setExpandedHistoryIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // SVG Risk Donut Segments calculation
  const riskDonutSegments = useMemo(() => {
    const sumWeights = RISK_ORDER.reduce(
      (acc, rKey) => acc + (analytics.capitalByRisk[rKey] || 0),
      0
    );
    const denom = Math.max(0.01, sumWeights);
    const radius = 52;
    const circumference = 2 * Math.PI * radius;
    let cumulative = 0;

    return RISK_ORDER.map((rKey) => {
      const amount = analytics.capitalByRisk[rKey] || 0;
      const share = sumWeights > 0 ? amount / denom : 0;
      const strokeLen = share * circumference;
      const offset = -cumulative * circumference;
      cumulative += share;
      return {
        risk: rKey,
        amount,
        percent: Math.round(share * 100),
        strokeLen,
        circumference,
        offset,
        meta: INVESTMENT_RISK_META[rKey],
      };
    });
  }, [analytics]);

  // Max absolute P&L for diverging chart scaling
  const maxAbsProfitLoss = useMemo(() => {
    const vals = analytics.items.map((p) => Math.abs(p.netProfitLoss));
    return Math.max(1, ...vals);
  }, [analytics.items]);

  return (
    <div className="inv-v24-root">
      {/* 1. Portfolio Command Header + Top 4 KPI Cards */}
      <div className="neon-card card-violet" style={{ marginBottom: '18px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '16px',
            flexWrap: 'wrap',
            marginBottom: '16px',
          }}
        >
          <div>
            <h3
              style={{
                margin: '0 0 4px',
                fontSize: '1.16rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
              }}
            >
              <TrendingUp size={20} className="text-violet" /> Cartera, Riesgos y Rendimientos (
              {currencyCode}) <span className="asian-chip">投資・リスク管理</span>
            </h3>
            <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
              Controla capital expuesto, nivel de riesgo, ganancias cobradas, mermas/pérdidas y
              punto de equilibrio de cada inversión en {currencyCode}.
            </p>
          </div>

          <button
            type="button"
            className={`btn ${isCreatorOpen ? 'btn-ghost' : 'btn-violet'}`}
            onClick={() => setIsCreatorOpen((v) => !v)}
          >
            {isCreatorOpen ? (
              <>
                <ChevronUp size={16} /> Ocultar Formulario
              </>
            ) : (
              <>
                <Plus size={16} /> Nueva Inversión
              </>
            )}
          </button>
        </div>

        {/* 4 Portfolio KPI Boxes */}
        <div className="inv-kpi-grid">
          {/* KPI 1: Gross & Monthly Capital */}
          <div className="inv-kpi-box">
            <div className="inv-kpi-top">
              <span>CAPITAL APORTADO</span>
              <Coins size={14} className="text-cyan" />
            </div>
            <div className="inv-kpi-main mono text-cyan">
              {formatMoney(analytics.totalInvestedAllTime, currencySymbol)}
            </div>
            <div className="inv-kpi-sub">
              Este mes:{' '}
              <strong className="mono text-emerald">
                {formatMoney(summary.envelopes.inversiones.spent, currencySymbol)}
              </strong>{' '}
              / Meta {formatMoney(summary.envelopes.inversiones.planned, currencySymbol)}
            </div>
          </div>

          {/* KPI 2: Current Value + Cash Returned */}
          <div className="inv-kpi-box">
            <div className="inv-kpi-top">
              <span>VALOR EN CARTERA + COBRADO</span>
              <Wallet size={14} className="text-violet" />
            </div>
            <div className="inv-kpi-main mono text-violet">
              {formatMoney(analytics.totalActiveValueInPlay, currencySymbol)}
            </div>
            <div className="inv-kpi-sub">
              Ya cobrado en mano:{' '}
              <strong className="mono text-emerald">
                {formatMoney(analytics.totalReturnedToHand, currencySymbol)}
              </strong>
            </div>
          </div>

          {/* KPI 3: Net Profit / Loss & ROI */}
          <div
            className={`inv-kpi-box ${
              analytics.totalNetProfitLoss > 0.009
                ? 'inv-kpi-positive'
                : analytics.totalNetProfitLoss < -0.009
                  ? 'inv-kpi-negative'
                  : ''
            }`}
          >
            <div className="inv-kpi-top">
              <span>GANANCIA / PÉRDIDA NETA</span>
              {analytics.totalNetProfitLoss >= 0 ? (
                <TrendingUp size={14} className="text-emerald" />
              ) : (
                <TrendingDown size={14} className="text-magenta" />
              )}
            </div>
            <div
              className={`inv-kpi-main mono ${
                analytics.totalNetProfitLoss > 0.009
                  ? 'text-emerald'
                  : analytics.totalNetProfitLoss < -0.009
                    ? 'text-magenta'
                    : ''
              }`}
            >
              {formatMoney(analytics.totalNetProfitLoss, currencySymbol, true)}{' '}
              <span className="inv-roi-inline">
                ({analytics.overallRoiPercent > 0 ? '+' : ''}
                {analytics.overallRoiPercent.toFixed(1)}%)
              </span>
            </div>
            <div className="inv-kpi-sub">
              Ganado:{' '}
              <span className="mono text-emerald">
                +{formatMoney(analytics.totalRealizedProfit, currencySymbol)}
              </span>{' '}
              · Pérdidas:{' '}
              <span className="mono text-magenta">
                -{formatMoney(analytics.totalRecordedLosses, currencySymbol)}
              </span>
            </div>
          </div>

          {/* KPI 4: Portfolio Risk Score & Capital Recovery */}
          <div className="inv-kpi-box">
            <div className="inv-kpi-top">
              <span>TERMÓMETRO DE RIESGO</span>
              <Shield size={14} style={{ color: riskThermometer.hex }} />
            </div>
            <div
              className="inv-kpi-main"
              style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}
            >
              <span className={`mono ${riskThermometer.colorClass}`}>
                {analytics.weightedRiskScore}/100
              </span>
              <span
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  color: riskThermometer.hex,
                }}
              >
                {riskThermometer.label}
              </span>
            </div>
            <div className="inv-kpi-sub">
              Riesgo alto: <strong className="mono">{analytics.highRiskSharePercent}%</strong> ·
              Recuperado:{' '}
              <strong className="mono text-cyan">{analytics.overallRecoveryPercent}%</strong>
            </div>
          </div>
        </div>

        {/* Collapsible New Investment Creator */}
        {isCreatorOpen && (
          <form onSubmit={handleCreate} className="inv-creator-panel">
            <div className="inv-creator-title">
              <Layers size={15} className="text-violet" /> Configurar Nueva Inversión y Perfil de
              Riesgo
            </div>

            <div className="inv-creator-grid">
              <div>
                <label className="field-label">Nombre de la inversión</label>
                <input
                  type="text"
                  required
                  className="neon-input"
                  placeholder="Ej. Lote de mercancía, Reserva USDT, Negocio..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div>
                <label className="field-label">Categoría del activo</label>
                <select
                  className="neon-select"
                  value={category}
                  onChange={(e) => handleCategoryChange(e.target.value as InvestmentCategory)}
                >
                  {Object.entries(INVESTMENT_CATEGORIES).map(([key, info]) => (
                    <option key={key} value={key}>
                      {info.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="field-label">Meta de aporte mensual ({currencySymbol})</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="neon-input mono-input"
                  placeholder="0.00"
                  value={targetStr}
                  onChange={(e) => setTargetStr(e.target.value)}
                />
              </div>

              <div>
                <label className="field-label">Plataforma / Custodia (Opcional)</label>
                <input
                  type="text"
                  className="neon-input"
                  placeholder="Ej. Efectivo en casa, Binance, Tarjeta..."
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                />
              </div>
            </div>

            <div className="inv-creator-risk-row">
              <div>
                <label className="field-label">Nivel de Riesgo</label>
                <div className="inv-risk-selector">
                  {RISK_ORDER.map((rKey) => {
                    const meta = INVESTMENT_RISK_META[rKey];
                    const selected = riskLevel === rKey;
                    return (
                      <button
                        key={rKey}
                        type="button"
                        className={`inv-risk-pill-btn ${meta.badgeClass} ${
                          selected ? 'selected' : ''
                        }`}
                        onClick={() => handleRiskPillSelect(rKey)}
                      >
                        {meta.shortLabel}
                      </button>
                    );
                  })}
                </div>
                <div className="inv-helper-caption">{INVESTMENT_RISK_META[riskLevel].desc}</div>
              </div>

              <div>
                <label className="field-label">Liquidez (Facilidad de retiro)</label>
                <select
                  className="neon-select"
                  value={liquidity}
                  onChange={(e) => setLiquidity(e.target.value as InvestmentLiquidity)}
                >
                  {LIQUIDITY_ORDER.map((lKey) => (
                    <option key={lKey} value={lKey}>
                      {INVESTMENT_LIQUIDITY_META[lKey].label}
                    </option>
                  ))}
                </select>
                <div className="inv-helper-caption">
                  {INVESTMENT_LIQUIDITY_META[liquidity].desc}
                </div>
              </div>

              <div>
                <label className="field-label">Retorno esperado (%)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  className="neon-input mono-input"
                  value={expectedRoiStr}
                  onChange={(e) => setExpectedRoiStr(e.target.value)}
                />
                <div className="inv-helper-caption">Meta de ganancia % sobre el capital</div>
              </div>

              <div>
                <label className="field-label">Stop-Loss / Pérdida máx. (%)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="100"
                  className="neon-input mono-input"
                  value={maxLossStr}
                  onChange={(e) => setMaxLossStr(e.target.value)}
                />
                <div className="inv-helper-caption">Te avisa si la caída supera este %</div>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: '12px',
                alignItems: 'end',
                marginTop: '10px',
              }}
            >
              <div>
                <label className="field-label">Notas / Plan de salida o tesis (Opcional)</label>
                <input
                  type="text"
                  className="neon-input"
                  placeholder="Ej. Vender antes de fin de mes; no arriesgar más del 20%..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <button
                type="submit"
                disabled={creating}
                className="btn btn-violet"
                style={{ height: '40px', paddingInline: '20px' }}
              >
                <Plus size={16} /> {creating ? 'Guardando...' : 'Crear Inversión'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* 2. Risk / Stop-Loss Warning Banner */}
      {(alertPositions.length > 0 ||
        (analytics.totalActiveValueInPlay > 0 && analytics.highRiskSharePercent >= 70)) && (
        <div className="inv-alert-banner">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <ShieldAlert
              size={22}
              className="text-magenta"
              style={{ flexShrink: 0, marginTop: '2px' }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#ff7eb3' }}>
                Alerta de Gestión de Riesgo en Cartera ({currencyCode})
              </div>
              {alertPositions.map((ap) => (
                <div key={ap.investment.id} style={{ fontSize: '0.82rem', marginTop: '4px' }}>
                  • <strong>{ap.investment.name}</strong> presenta una caída neta de{' '}
                  <strong className="mono text-magenta">{ap.roiPercent.toFixed(1)}%</strong> (
                  {formatMoney(ap.netProfitLoss, currencySymbol)}), superando tu límite máximo de
                  pérdida aceptable (<strong className="mono">-{ap.effectiveMaxLossPct}%</strong>
                  ). Evalúa frenar nuevos aportes o recuperar liquidez.
                </div>
              ))}
              {analytics.totalActiveValueInPlay > 0 && analytics.highRiskSharePercent >= 70 && (
                <div
                  style={{ fontSize: '0.82rem', marginTop: '4px', color: 'var(--text-secondary)' }}
                >
                  • El <strong className="mono text-amber">{analytics.highRiskSharePercent}%</strong>{' '}
                  de tu valor en cartera está concentrado en activos de{' '}
                  <strong>Riesgo Alto o Especulativo</strong>. Considera equilibrar parte de las
                  ganancias hacia un fondo o reserva conservadora.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. Dual Visual Analytics Panel (Risk Exposure Donut + P&L Comparison Chart) */}
      {investments.length > 0 && (
        <div className="inv-analytics-grid" style={{ marginBottom: '18px' }}>
          {/* Left Chart: Capital by Risk Level & Liquidity */}
          <div className="neon-card">
            <div className="kpi-header" style={{ marginBottom: '12px' }}>
              <span className="kpi-label">
                <Scale size={15} className="text-cyan" /> Exposición al Riesgo y Liquidez{' '}
                <span className="asian-chip">リスク配分</span>
              </span>
              {analytics.usingPlannedWeightsForRiskMap && (
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  Según metas mensuales
                </span>
              )}
            </div>

            <div className="inv-risk-donut-layout">
              <div className="inv-donut-wrap">
                <svg width="136" height="136" viewBox="0 0 136 136">
                  <circle
                    cx="68"
                    cy="68"
                    r="52"
                    fill="none"
                    stroke="rgba(255,255,255,0.07)"
                    strokeWidth="15"
                  />
                  {riskDonutSegments.map(
                    (seg) =>
                      seg.strokeLen > 0 && (
                        <circle
                          key={seg.risk}
                          cx="68"
                          cy="68"
                          r="52"
                          fill="none"
                          stroke={seg.meta.hex}
                          strokeWidth="15"
                          strokeDasharray={`${seg.strokeLen} ${seg.circumference}`}
                          strokeDashoffset={seg.offset}
                          transform="rotate(-90 68 68)"
                          style={{ transition: 'stroke-dasharray 0.35s ease' }}
                        />
                      )
                  )}
                </svg>
                <div className="inv-donut-center">
                  <div className="mono" style={{ fontSize: '1.05rem', fontWeight: 800 }}>
                    {analytics.weightedRiskScore}
                  </div>
                  <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>ÍNDICE</div>
                </div>
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {riskDonutSegments.map((seg) => (
                  <div key={seg.risk} className="inv-risk-legend-row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        className="inv-legend-dot"
                        style={{ background: seg.meta.hex, boxShadow: `0 0 8px ${seg.meta.hex}` }}
                      />
                      <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                        {seg.meta.shortLabel}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="mono" style={{ fontSize: '0.8rem' }}>
                        {formatMoney(seg.amount, currencySymbol)}
                      </span>
                      <span
                        className="mono"
                        style={{
                          fontSize: '0.73rem',
                          color: 'var(--text-muted)',
                          minWidth: '34px',
                          textAlign: 'right',
                        }}
                      >
                        {seg.percent}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Liquidity Strip + Stress Test Footer */}
            <div className="inv-liquidity-footer">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.74rem',
                  color: 'var(--text-secondary)',
                  marginBottom: '6px',
                  flexWrap: 'wrap',
                  gap: '6px',
                }}
              >
                <span>
                  24h:{' '}
                  <strong className="mono text-emerald">
                    {formatMoney(analytics.capitalByLiquidity.inmediata, currencySymbol)}
                  </strong>
                </span>
                <span>
                  7–30d:{' '}
                  <strong className="mono text-cyan">
                    {formatMoney(analytics.capitalByLiquidity.corto_plazo, currencySymbol)}
                  </strong>
                </span>
                <span>
                  1–6m:{' '}
                  <strong className="mono text-violet">
                    {formatMoney(analytics.capitalByLiquidity.mediano_plazo, currencySymbol)}
                  </strong>
                </span>
                <span>
                  Bloq.:{' '}
                  <strong className="mono text-amber">
                    {formatMoney(analytics.capitalByLiquidity.largo_plazo, currencySymbol)}
                  </strong>
                </span>
              </div>

              <div className="inv-stress-box">
                <Flame size={14} className="text-amber" style={{ flexShrink: 0 }} />
                <span>
                  Escenario de estrés (si cada activo cae a su Stop-Loss):{' '}
                  <strong className="mono text-amber">
                    -{formatMoney(analytics.totalAdverseRiskAmount, currencySymbol)}
                  </strong>
                </span>
              </div>
            </div>
          </div>

          {/* Right Chart: Diverging Profit vs Loss Bars by Position */}
          <div className="neon-card">
            <div className="kpi-header" style={{ marginBottom: '12px' }}>
              <span className="kpi-label">
                <Activity size={15} className="text-emerald" /> Mapa de Ganancias vs. Pérdidas{' '}
                <span className="asian-chip">損益比較</span>
              </span>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                Resultado Neto y ROI Real
              </span>
            </div>

            <div className="inv-pnl-list">
              {analytics.items.slice(0, 6).map((pos) => {
                const pnl = pos.netProfitLoss;
                const barWidthPct = Math.min(
                  100,
                  Math.round((Math.abs(pnl) / maxAbsProfitLoss) * 100)
                );
                const isGain = pnl > 0.009;
                const isLoss = pnl < -0.009;

                return (
                  <div key={pos.investment.id} className="inv-pnl-row">
                    <div className="inv-pnl-row-header">
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: '0.82rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        {pos.investment.name}
                        <span
                          className={`inv-mini-risk-tag ${
                            INVESTMENT_RISK_META[pos.riskLevel].badgeClass
                          }`}
                        >
                          {INVESTMENT_RISK_META[pos.riskLevel].shortLabel}
                        </span>
                      </span>
                      <span
                        className={`mono ${
                          isGain ? 'text-emerald' : isLoss ? 'text-magenta' : 'text-secondary'
                        }`}
                        style={{ fontSize: '0.8rem', fontWeight: 700 }}
                      >
                        {formatMoney(pnl, currencySymbol, true)} ({pos.roiPercent > 0 ? '+' : ''}
                        {pos.roiPercent.toFixed(1)}% / Meta {pos.expectedRoiPercent}%)
                      </span>
                    </div>

                    <div className="inv-diverging-track">
                      <div className="inv-diverging-half left">
                        {isLoss && (
                          <div
                            className="inv-diverging-bar loss"
                            style={{ width: `${Math.max(6, barWidthPct)}%` }}
                          />
                        )}
                      </div>
                      <div className="inv-diverging-zero" />
                      <div className="inv-diverging-half right">
                        {isGain && (
                          <div
                            className="inv-diverging-bar gain"
                            style={{ width: `${Math.max(6, barWidthPct)}%` }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 4. Filter Bar for Positions */}
      {investments.length > 0 && (
        <div className="inv-filter-bar">
          {(
            [
              { id: 'all', label: `Todas (${analytics.items.length})` },
              {
                id: 'active',
                label: `Activas (${analytics.items.filter((p) => p.investment.active).length})`,
              },
              {
                id: 'profitable',
                label: `En Ganancia (${
                  analytics.items.filter((p) => p.netProfitLoss > 0.009).length
                })`,
              },
              {
                id: 'losing_or_alert',
                label: `En Pérdida / Alerta (${
                  analytics.items.filter((p) => p.netProfitLoss < -0.009 || p.isStopLossBreached)
                    .length
                })`,
              },
              {
                id: 'high_risk',
                label: `Riesgo Alto / Espec. (${
                  analytics.items.filter(
                    (p) => p.riskLevel === 'alto' || p.riskLevel === 'especulativo'
                  ).length
                })`,
              },
            ] as { id: PortfolioFilter; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`btn btn-sm ${portfolioFilter === tab.id ? 'btn-violet' : 'btn-ghost'}`}
              onClick={() => setPortfolioFilter(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* 5. Position Cards Grid */}
      {investments.length === 0 ? (
        <div className="neon-card empty-state">
          <h4 style={{ margin: '0 0 6px', color: 'var(--text-primary)' }}>
            Todavía no tienes inversiones registradas en {currencyCode}
          </h4>
          <p style={{ margin: 0, fontSize: '0.88rem' }}>
            Crea tu primera inversión arriba definiendo su nivel de riesgo, liquidez y meta de
            retorno.
          </p>
        </div>
      ) : filteredPositions.length === 0 ? (
        <div className="neon-card empty-state">
          <h4 style={{ margin: '0 0 6px', color: 'var(--text-primary)' }}>
            No hay inversiones en este filtro
          </h4>
          <p style={{ margin: 0, fontSize: '0.85rem' }}>
            Cambia el filtro superior a «Todas» para ver la cartera completa.
          </p>
        </div>
      ) : (
        <div className="investments-grid">
          {filteredPositions.map((pos) => {
            const inv = pos.investment;
            const st = statusMap.get(inv.id);
            const planned = st ? st.plannedThisMonth : inv.active ? inv.monthlyTarget : 0;
            const contributedThisMonth = st ? st.contributedThisMonth : 0;
            const monthPct = st ? st.percentCompleted : 0;

            const catInfo = INVESTMENT_CATEGORIES[inv.category] || INVESTMENT_CATEGORIES.otro;
            const riskMeta = INVESTMENT_RISK_META[pos.riskLevel];
            const liqMeta = INVESTMENT_LIQUIDITY_META[pos.liquidity];
            const eventsList = inv.events || [];
            const isHistoryOpen = Boolean(expandedHistoryIds[inv.id]);
            const recoveryBarWidth = Math.min(100, pos.capitalRecoveryPercent);

            return (
              <div
                key={inv.id}
                className={`neon-card inv-position-card ${
                  pos.isStopLossBreached
                    ? 'card-magenta'
                    : pos.netProfitLoss > 0.009
                      ? 'card-emerald'
                      : inv.active
                        ? 'card-violet'
                        : ''
                }`}
                style={{ opacity: inv.active ? 1 : 0.72 }}
              >
                {/* Top Badges & Edit/Delete */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '10px',
                    marginBottom: '10px',
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        gap: '6px',
                        flexWrap: 'wrap',
                        marginBottom: '6px',
                      }}
                    >
                      <span className="div-badge div-violet">{catInfo.badge}</span>
                      <span className={`inv-risk-badge ${riskMeta.badgeClass}`}>
                        <Shield size={11} /> {riskMeta.shortLabel}
                      </span>
                      <span className="inv-liq-badge" title={liqMeta.desc}>
                        <Clock size={11} /> {liqMeta.shortLabel}
                      </span>
                      {!inv.active && <span className="inv-archived-badge">ARCHIVADA</span>}
                      {pos.isStopLossBreached && (
                        <span className="inv-stoploss-badge">
                          <AlertTriangle size={11} /> STOP-LOSS
                        </span>
                      )}
                    </div>

                    <h4 style={{ margin: '2px 0', fontSize: '1.06rem' }}>{inv.name}</h4>
                    {(inv.platform || inv.notes) && (
                      <div style={{ fontSize: '0.77rem', color: 'var(--text-secondary)' }}>
                        {inv.platform}
                        {inv.platform && inv.notes ? ' · ' : ''}
                        {inv.notes}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      type="button"
                      className="icon-btn"
                      title="Editar perfil de riesgo y parámetros"
                      onClick={() => openEdit(pos)}
                    >
                      <Edit3 size={15} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn danger"
                      title="Eliminar o archivar inversión"
                      onClick={() => onDeleteInvestment(inv.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* 4-Cell Financial Matrix */}
                <div className="inv-card-metrics-grid">
                  <div className="inv-metric-cell">
                    <span className="inv-metric-label">Capital Aportado</span>
                    <strong className="mono text-cyan">
                      {formatMoney(pos.totalInvested, currencySymbol)}
                    </strong>
                    <span className="inv-metric-sub">
                      En libros: {formatMoney(pos.autoBookValue, currencySymbol)}
                    </span>
                  </div>

                  <div className="inv-metric-cell">
                    <span className="inv-metric-label">
                      Valor Actual{' '}
                      <span className="inv-val-mode-chip">
                        {pos.hasManualValuation ? 'Manual' : 'Auto'}
                      </span>
                    </span>
                    <strong className="mono text-violet">
                      {formatMoney(pos.activeValueInPlay, currencySymbol)}
                    </strong>
                    <span className="inv-metric-sub">
                      Stop-Loss: -{pos.effectiveMaxLossPct}%
                    </span>
                  </div>

                  <div className="inv-metric-cell">
                    <span className="inv-metric-label">Cobrado en Mano</span>
                    <strong className="mono text-emerald">
                      {formatMoney(pos.totalReturnedToHand, currencySymbol)}
                    </strong>
                    <span className="inv-metric-sub">
                      Ganancia: +{formatMoney(pos.realizedProfit, currencySymbol)}
                    </span>
                  </div>

                  <div className="inv-metric-cell">
                    <span className="inv-metric-label">Resultado Neto (ROI)</span>
                    <strong
                      className={`mono ${
                        pos.netProfitLoss > 0.009
                          ? 'text-emerald'
                          : pos.netProfitLoss < -0.009
                            ? 'text-magenta'
                            : ''
                      }`}
                    >
                      {formatMoney(pos.netProfitLoss, currencySymbol, true)} (
                      {pos.roiPercent > 0 ? '+' : ''}
                      {pos.roiPercent.toFixed(1)}%)
                    </strong>
                    <span className="inv-metric-sub">
                      {pos.recordedLosses > 0
                        ? `Mermas: -${formatMoney(pos.recordedLosses, currencySymbol)}`
                        : `Meta ROI: +${pos.expectedRoiPercent}%`}
                    </span>
                  </div>
                </div>

                {/* Bar 1: Monthly Contribution Progress */}
                <div style={{ marginTop: '12px' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '0.77rem',
                      marginBottom: '4px',
                    }}
                  >
                    <span style={{ color: 'var(--text-secondary)' }}>
                      Aporte este mes:{' '}
                      <strong className="mono text-emerald">
                        {formatMoney(contributedThisMonth, currencySymbol)}
                      </strong>
                    </span>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      Meta:{' '}
                      <strong className="mono">{formatMoney(planned, currencySymbol)}</strong>
                    </span>
                  </div>
                  <div className="progress-track" style={{ height: '7px' }}>
                    <div className="progress-fill fill-violet" style={{ width: `${monthPct}%` }} />
                  </div>
                </div>

                {/* Bar 2: Break-Even / Capital Recovery Progress */}
                <div style={{ marginTop: '10px', marginBottom: '12px' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '0.76rem',
                      marginBottom: '4px',
                    }}
                  >
                    <span style={{ color: 'var(--text-secondary)' }}>
                      Recuperación de capital (Break-Even):
                    </span>
                    {pos.capitalRecoveryPercent >= 100 && pos.totalInvested > 0 ? (
                      <span className="inv-breakeven-won">
                        <Award size={12} /> ¡100%+ Recuperado ({pos.capitalRecoveryPercent}%)!
                      </span>
                    ) : (
                      <strong className="mono text-cyan">{pos.capitalRecoveryPercent}%</strong>
                    )}
                  </div>
                  <div className="progress-track" style={{ height: '7px' }}>
                    <div
                      className="progress-fill fill-emerald"
                      style={{ width: `${recoveryBarWidth}%` }}
                    />
                  </div>
                </div>

                {/* Action Buttons Strip */}
                <div className="inv-actions-strip">
                  {inv.active && (
                    <button
                      type="button"
                      className="btn btn-sm btn-emerald"
                      title="Aportar nuevo capital desde tu Efectivo o Transferencia"
                      onClick={() => {
                        setContribInvId(contribInvId === inv.id ? null : inv.id);
                        const rem = Math.max(0, planned - contributedThisMonth);
                        setContribAmountStr(
                          rem > 0 ? String(rem) : String(inv.monthlyTarget || '')
                        );
                      }}
                    >
                      <ArrowUpRight size={13} /> Aportar
                    </button>
                  )}

                  <button
                    type="button"
                    className="btn btn-sm inv-btn-gain"
                    title="Registrar ganancia / dividendo / venta con margen"
                    onClick={() => openEventModal(pos, 'return_payout')}
                  >
                    <TrendingUp size={13} /> + Ganancia
                  </button>

                  <button
                    type="button"
                    className="btn btn-sm inv-btn-withdraw"
                    title="Recuperar o retirar capital invertido hacia tu bolsillo"
                    onClick={() => openEventModal(pos, 'capital_withdraw')}
                  >
                    <ArrowDownRight size={13} /> Retirar
                  </button>

                  <button
                    type="button"
                    className="btn btn-sm inv-btn-loss"
                    title="Registrar pérdida, merma de mercancía o caída de valor"
                    onClick={() => openEventModal(pos, 'loss_writeoff')}
                  >
                    <TrendingDown size={13} /> Pérdida
                  </button>

                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    title="Ajustar tasación / valor actual estimado de la inversión"
                    onClick={() => openEventModal(pos, 'valuation_sync')}
                  >
                    <Target size={13} /> Tasar
                  </button>

                  {eventsList.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      style={{ marginLeft: 'auto' }}
                      onClick={() => toggleHistoryDrawer(inv.id)}
                    >
                      <History size={13} /> ({eventsList.length}){' '}
                      {isHistoryOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                  )}
                </div>

                {/* Inline Quick Contribution Form */}
                {contribInvId === inv.id && (
                  <div className="inv-inline-contrib">
                    <div
                      style={{
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        color: 'var(--neon-emerald)',
                      }}
                    >
                      Aportar capital desde tu saldo disponible:
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        className={`btn btn-sm ${
                          contribMethod === 'efectivo' ? 'btn-emerald' : 'btn-ghost'
                        }`}
                        style={{ flex: 1 }}
                        onClick={() => setContribMethod('efectivo')}
                      >
                        <Banknote size={13} /> Efectivo
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm ${
                          contribMethod === 'transferencia' ? 'btn-violet' : 'btn-ghost'
                        }`}
                        style={{ flex: 1 }}
                        onClick={() => setContribMethod('transferencia')}
                      >
                        <Smartphone size={13} /> Transferencia
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        autoFocus
                        className="neon-input mono-input"
                        placeholder="Monto a aportar"
                        value={contribAmountStr}
                        onChange={(e) => setContribAmountStr(e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn btn-sm btn-emerald"
                        onClick={async () => {
                          const val = parseFloat(contribAmountStr);
                          if (!Number.isNaN(val) && val > 0) {
                            await onQuickContribute(inv, val, contribMethod);
                            setContribInvId(null);
                          }
                        }}
                      >
                        <Check size={14} /> OK
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => setContribInvId(null)}
                      >
                        <X size={15} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Collapsible Event History Drawer per Investment */}
                {isHistoryOpen && eventsList.length > 0 && (
                  <div className="inv-events-drawer">
                    <div className="inv-events-drawer-title">
                      Bitácora de Ganancias, Retiros y Pérdidas ({eventsList.length})
                    </div>
                    <div className="inv-events-list">
                      {eventsList.map((ev) => {
                        const evMeta = INVESTMENT_EVENT_META[ev.kind];
                        const sign =
                          ev.kind === 'loss_writeoff'
                            ? '-'
                            : ev.kind === 'valuation_sync'
                              ? ''
                              : '+';
                        const toneClass =
                          ev.kind === 'return_payout'
                            ? 'text-emerald'
                            : ev.kind === 'capital_withdraw'
                              ? 'text-cyan'
                              : ev.kind === 'loss_writeoff'
                                ? 'text-magenta'
                                : 'text-violet';
                        return (
                          <div key={ev.id} className="inv-event-row">
                            <div style={{ flex: 1 }}>
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  flexWrap: 'wrap',
                                }}
                              >
                                <span className={`inv-ev-badge tone-${evMeta.tone}`}>
                                  {evMeta.badge}
                                </span>
                                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                                  {formatShortDate(ev.date)}
                                </span>
                                {ev.creditedToLedger && ev.paymentMethod && (
                                  <span className="inv-ev-ledger-chip">
                                    Sumado a {getPaymentMethodLabel(ev.paymentMethod)}
                                  </span>
                                )}
                              </div>
                              {ev.note && (
                                <div
                                  style={{
                                    fontSize: '0.77rem',
                                    color: 'var(--text-secondary)',
                                    marginTop: '2px',
                                  }}
                                >
                                  {ev.note}
                                </div>
                              )}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <strong
                                className={`mono ${toneClass}`}
                                style={{ fontSize: '0.84rem' }}
                              >
                                {sign}
                                {formatMoney(ev.amount, currencySymbol)}
                              </strong>
                              <button
                                type="button"
                                className="icon-btn danger"
                                title="Revertir registro (si fue sumado al Libro Diario también se descontará)"
                                onClick={() => onDeleteInvestmentEvent(inv.id, ev.id)}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 6. Protected Modal: Record Investment Event (Profit / Withdrawal / Loss / Valuation) */}
      {eventModalInv && (
        <div className="modal-backdrop">
          <div className="modal-panel" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Activity size={18} className="text-violet" /> {eventModalInv.investment.name}
              </h3>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setEventModalInv(null)}
              >
                <X size={18} />
              </button>
            </div>

            {/* Event Kind Selector Tabs inside Modal */}
            <div className="inv-modal-kind-tabs">
              {(
                [
                  { kind: 'return_payout', short: '+ Ganancia' },
                  { kind: 'capital_withdraw', short: 'Retirar Capital' },
                  { kind: 'loss_writeoff', short: 'Pérdida / Merma' },
                  { kind: 'valuation_sync', short: 'Valor Actual' },
                ] as { kind: InvestmentEventKind; short: string }[]
              ).map((item) => (
                <button
                  key={item.kind}
                  type="button"
                  className={`inv-modal-kind-btn ${eventKind === item.kind ? 'active' : ''}`}
                  onClick={() => {
                    setEventKind(item.kind);
                    if (item.kind === 'valuation_sync') {
                      setEventAmountStr(String(eventModalInv.activeValueInPlay));
                    } else if (eventKind === 'valuation_sync') {
                      setEventAmountStr('');
                    }
                  }}
                >
                  {item.short}
                </button>
              ))}
            </div>

            <form
              onSubmit={handleSaveEvent}
              style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}
            >
              <div className="inv-modal-explainer">
                {eventKind === 'return_payout' &&
                  'Registra utilidades, intereses, dividendos o margen de venta ganado sin reducir tu capital base invertido.'}
                {eventKind === 'capital_withdraw' &&
                  'Registra devolución o retiro parcial/total de tu propio capital invertido de vuelta a tus manos.'}
                {eventKind === 'loss_writeoff' &&
                  'Registra una pérdida real: mercancía dañada, impago, comisión fuerte o desvalorización confirmada.'}
                {eventKind === 'valuation_sync' &&
                  'Fija cuánto vale hoy tu posición en cartera (por ejemplo, si el activo subió o bajó de precio en el mercado).'}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="field-label">
                    {eventKind === 'valuation_sync'
                      ? `Nuevo valor total en cartera (${currencySymbol})`
                      : `Monto (${currencySymbol})`}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min={eventKind === 'valuation_sync' ? '0' : '0.01'}
                    required
                    autoFocus
                    className="neon-input mono-input"
                    placeholder="0.00"
                    value={eventAmountStr}
                    onChange={(e) => setEventAmountStr(e.target.value)}
                  />
                </div>

                <div>
                  <label className="field-label">Fecha</label>
                  <input
                    type="date"
                    required
                    className="neon-input"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                  />
                </div>
              </div>

              {(eventKind === 'return_payout' || eventKind === 'capital_withdraw') && (
                <div className="inv-ledger-credit-box">
                  <div
                    className="neon-switch"
                    onClick={() => setEventCreditToLedger((v) => !v)}
                    role="switch"
                    aria-checked={eventCreditToLedger}
                  >
                    <div className={`switch-track ${eventCreditToLedger ? 'on' : ''}`}>
                      <div className="switch-thumb" />
                    </div>
                    <span>
                      Sumar este dinero automáticamente a mi saldo del Libro Diario ({currencyCode})
                    </span>
                  </div>

                  {eventCreditToLedger && (
                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                      <button
                        type="button"
                        className={`btn btn-sm ${
                          eventMethod === 'efectivo' ? 'btn-emerald' : 'btn-ghost'
                        }`}
                        style={{ flex: 1 }}
                        onClick={() => setEventMethod('efectivo')}
                      >
                        <Banknote size={14} /> Entró en Efectivo
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm ${
                          eventMethod === 'transferencia' ? 'btn-violet' : 'btn-ghost'
                        }`}
                        style={{ flex: 1 }}
                        onClick={() => setEventMethod('transferencia')}
                      >
                        <Smartphone size={14} /> Entró por Transferencia
                      </button>
                    </div>
                  )}
                </div>
              )}

              {eventKind === 'valuation_sync' && eventModalInv.hasManualValuation && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    background: 'rgba(185, 78, 255, 0.09)',
                    border: '1px dashed rgba(185, 78, 255, 0.35)',
                    fontSize: '0.78rem',
                  }}
                >
                  <span>Actualmente usa tasación manual.</span>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    disabled={savingEvent}
                    onClick={handleResetAutoValuation}
                  >
                    <RefreshCw size={12} /> Volver a cálculo automático
                  </button>
                </div>
              )}

              <div>
                <label className="field-label">Detalle o motivo (Opcional)</label>
                <input
                  type="text"
                  className="neon-input"
                  placeholder={
                    eventKind === 'loss_writeoff'
                      ? 'Ej. Merma de unidades, caída de tasa, comisión...'
                      : 'Ej. Venta de lote #2, dividendo mensual...'
                  }
                  value={eventNote}
                  onChange={(e) => setEventNote(e.target.value)}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '10px',
                  marginTop: '6px',
                }}
              >
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setEventModalInv(null)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEvent}
                  className={`btn ${
                    eventKind === 'loss_writeoff'
                      ? 'btn-danger'
                      : eventKind === 'return_payout'
                        ? 'btn-emerald'
                        : 'btn-violet'
                  }`}
                >
                  <Check size={15} /> {savingEvent ? 'Guardando...' : 'Registrar en Cartera'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. Protected Modal: Edit Investment & Risk Profile */}
      {editingInv && (
        <div className="modal-backdrop">
          <div className="modal-panel" style={{ maxWidth: '540px' }}>
            <div className="modal-header">
              <h3>Editar Inversión y Riesgo</h3>
              <button type="button" className="icon-btn" onClick={() => setEditingInv(null)}>
                <X size={18} />
              </button>
            </div>

            <form
              onSubmit={handleSaveEdit}
              style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
            >
              <div>
                <label className="field-label">Nombre de la inversión</label>
                <input
                  type="text"
                  required
                  className="neon-input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="field-label">Categoría</label>
                  <select
                    className="neon-select"
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value as InvestmentCategory)}
                  >
                    {Object.entries(INVESTMENT_CATEGORIES).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="field-label">Meta mensual ({currencySymbol})</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="neon-input mono-input"
                    value={editTargetStr}
                    onChange={(e) => setEditTargetStr(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="field-label">Nivel de Riesgo</label>
                  <select
                    className="neon-select"
                    value={editRiskLevel}
                    onChange={(e) => setEditRiskLevel(e.target.value as InvestmentRiskLevel)}
                  >
                    {RISK_ORDER.map((r) => (
                      <option key={r} value={r}>
                        {INVESTMENT_RISK_META[r].label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="field-label">Liquidez</label>
                  <select
                    className="neon-select"
                    value={editLiquidity}
                    onChange={(e) => setEditLiquidity(e.target.value as InvestmentLiquidity)}
                  >
                    {LIQUIDITY_ORDER.map((l) => (
                      <option key={l} value={l}>
                        {INVESTMENT_LIQUIDITY_META[l].label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="field-label">Retorno esperado (%)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    className="neon-input mono-input"
                    value={editExpectedRoiStr}
                    onChange={(e) => setEditExpectedRoiStr(e.target.value)}
                  />
                </div>

                <div>
                  <label className="field-label">Tolerancia máx. pérdida / Stop-Loss (%)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="100"
                    className="neon-input mono-input"
                    value={editMaxLossStr}
                    onChange={(e) => setEditMaxLossStr(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="field-label">Plataforma / Custodia</label>
                  <input
                    type="text"
                    className="neon-input"
                    value={editPlatform}
                    onChange={(e) => setEditPlatform(e.target.value)}
                  />
                </div>

                <div>
                  <label className="field-label">Notas / Plan de salida</label>
                  <input
                    type="text"
                    className="neon-input"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                  />
                </div>
              </div>

              <div
                className="neon-switch"
                onClick={() => setEditActive((v) => !v)}
                role="switch"
                aria-checked={editActive}
              >
                <div className={`switch-track ${editActive ? 'on' : ''}`}>
                  <div className="switch-thumb" />
                </div>
                <span>Inversión activa (incluir en metas mensuales)</span>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '10px',
                  marginTop: '6px',
                }}
              >
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setEditingInv(null)}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-violet">
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
