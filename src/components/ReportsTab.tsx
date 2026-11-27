import React, { useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Banknote,
  Layers,
  PieChart,
  Smartphone,
  TrendingUp,
} from 'lucide-react';
import {
  MonthComputedSummary,
  computeMonthSummary,
  formatMonthLabel,
  round2,
} from '../../shared/calculations';
import {
  HogarCategoryDef,
  findHogarCategory,
} from '../../shared/hogarCategories';
import {
  CurrencyLedgerWorkspace,
  MonthRecord,
} from '../../shared/types';
import {
  KAKEIBO_PILLARS,
  formatMoney,
  getDivisionLabel,
} from '../utils/format';
import { HogarCategoryIcon } from './HogarCategoryIcon';

interface ReportsTabProps {
  workspace: CurrencyLedgerWorkspace;
  month: MonthRecord;
  summary: MonthComputedSummary;
  customHogarCategories: HogarCategoryDef[];
}

interface SliceItem {
  id: string;
  label: string;
  value: number;
  color: string;
  iconKey?: string;
}

const SLICE_COLORS = [
  '#00f0ff',
  '#00ff9d',
  '#ffb800',
  '#ff2e88',
  '#b94eff',
  '#38bdf8',
  '#fb923c',
  '#4ade80',
  '#f472b6',
  '#a78bfa',
];

export const ReportsTab: React.FC<ReportsTabProps> = ({
  workspace,
  month,
  summary,
  customHogarCategories,
}) => {
  const symbol = workspace.currencySymbol;
  const code = workspace.currencyCode;

  const [scope, setScope] = useState<'month' | 'all_time'>('month');
  const [channelFilter, setChannelFilter] = useState<'all' | 'efectivo' | 'transferencia'>('all');
  const [donutMode, setDonutMode] = useState<'hogar_cats' | 'divisions' | 'pillars'>('hogar_cats');
  const [barMode, setBarMode] = useState<'weeks' | 'budget_vs_actual'>('weeks');
  const [hoveredSliceId, setHoveredSliceId] = useState<string | null>(null);
  const [hoveredDayIdx, setHoveredDayIdx] = useState<number | null>(null);

  // Collect entries according to scope & channelFilter
  const targetEntries = useMemo(() => {
    const monthsList =
      scope === 'month' ? [month] : Object.values(workspace.months || {});
    const all = monthsList.flatMap((m) => m.entries || []);
    if (channelFilter === 'all') return all;
    return all.filter((e) => {
      if (e.type === 'channel_transfer') return false;
      return e.paymentMethod === channelFilter;
    });
  }, [scope, month, workspace.months, channelFilter]);

  // 1. Compute Donut Slices
  const donutSlices: SliceItem[] = useMemo(() => {
    const map = new Map<string, SliceItem>();

    for (const e of targetEntries) {
      if (e.type !== 'expense' && e.type !== 'adjustment_down') continue;
      if (donutMode === 'hogar_cats') {
        if (e.division !== 'hogar') continue;
        const cat = findHogarCategory(e.hogarCategoryId, customHogarCategories);
        const id = cat ? cat.id : 'hogar_general';
        const prev = map.get(id);
        map.set(id, {
          id,
          label: cat ? cat.name : 'Hogar (General)',
          value: round2((prev?.value || 0) + e.amount),
          color: cat ? cat.color : '#ffb800',
          iconKey: cat?.iconKey || 'Home',
        });
      } else if (donutMode === 'divisions') {
        const id = e.division || 'general';
        const divColors: Record<string, string> = {
          hogar: '#ffb800',
          deudas: '#ff2e88',
          manutenciones: '#ff7b29',
          inversiones: '#b94eff',
          bolsillo: '#00ff9d',
          general: '#00f0ff',
        };
        const prev = map.get(id);
        map.set(id, {
          id,
          label: getDivisionLabel(id, month.allocations.customEnvelopes),
          value: round2((prev?.value || 0) + e.amount),
          color: divColors[id] || SLICE_COLORS[map.size % SLICE_COLORS.length],
        });
      } else {
        const pk = e.pillar || 'supervivencia';
        const pillarColors: Record<string, string> = {
          supervivencia: '#00f0ff',
          opcional: '#00ff9d',
          cultura: '#b94eff',
          patrimonio: '#818cf8',
          imprevisto: '#ffb800',
          ajuste: '#ff2e88',
        };
        const prev = map.get(pk);
        map.set(pk, {
          id: pk,
          label: KAKEIBO_PILLARS[pk]?.label || pk,
          value: round2((prev?.value || 0) + e.amount),
          color: pillarColors[pk] || '#00f0ff',
        });
      }
    }

    return Array.from(map.values())
      .filter((s) => s.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [targetEntries, donutMode, customHogarCategories, month.allocations.customEnvelopes]);

  const donutTotal = useMemo(
    () => round2(donutSlices.reduce((acc, s) => acc + s.value, 0)),
    [donutSlices]
  );

  // Build SVG Donut geometry
  const donutArcs = useMemo(() => {
    if (donutTotal <= 0) return [];
    const radius = 74;
    const circumference = 2 * Math.PI * radius;
    let accum = 0;

    return donutSlices.map((s) => {
      const pct = s.value / donutTotal;
      const dashLen = pct * circumference;
      const dashOffset = -accum * circumference;
      accum += pct;
      return {
        ...s,
        pct: round2(pct * 100),
        dashArray: `${Math.max(0, dashLen - 1.5)} ${circumference}`,
        dashOffset,
      };
    });
  }, [donutSlices, donutTotal]);

  const activeDonutSlice = useMemo(() => {
    if (!hoveredSliceId) return null;
    return donutArcs.find((a) => a.id === hoveredSliceId) || null;
  }, [hoveredSliceId, donutArcs]);

  // 2. Daily Balance Evolution Curve for Active Month (Area + 3 Parallel Lines)
  const dailySeries = useMemo(() => {
    const [y, m] = month.monthKey.split('-').map(Number);
    const daysCount = new Date(y || 2026, m || 1, 0).getDate();

    let ef = summary.openingEfectivo;
    let tr = summary.openingTransferencia;

    // Group ledgerAscending deltas by day number
    const byDay: Record<number, { efDelta: number; trDelta: number }> = {};
    for (const row of summary.ledgerAscending) {
      const d = parseInt(row.date.slice(8, 10), 10) || 1;
      if (!byDay[d]) byDay[d] = { efDelta: 0, trDelta: 0 };
      byDay[d].efDelta = round2(byDay[d].efDelta + row.efectivoDelta);
      byDay[d].trDelta = round2(byDay[d].trDelta + row.transferenciaDelta);
    }

    const points: Array<{
      day: number;
      ef: number;
      tr: number;
      total: number;
    }> = [];

    for (let d = 1; d <= daysCount; d++) {
      if (byDay[d]) {
        ef = round2(ef + byDay[d].efDelta);
        tr = round2(tr + byDay[d].trDelta);
      }
      points.push({
        day: d,
        ef,
        tr,
        total: round2(ef + tr),
      });
    }
    return points;
  }, [month.monthKey, summary]);

  // 3. Efectivo vs Transferencia Outflow & Inflow Split
  const channelComparison = useMemo(() => {
    let expEf = 0;
    let expTr = 0;
    let incEf = 0;
    let incTr = 0;

    for (const e of targetEntries) {
      if (e.type === 'expense' || e.type === 'adjustment_down') {
        if (e.paymentMethod === 'transferencia') expTr = round2(expTr + e.amount);
        else expEf = round2(expEf + e.amount);
      } else if (e.type === 'income' || e.type === 'adjustment_up') {
        if (e.paymentMethod === 'transferencia') incTr = round2(incTr + e.amount);
        else incEf = round2(incEf + e.amount);
      }
    }

    // Add opening salary/carryover if scope === 'month'
    if (scope === 'month') {
      incEf = round2(incEf + Math.max(0, summary.openingEfectivo));
      incTr = round2(incTr + Math.max(0, summary.openingTransferencia));
    }

    const totalExp = round2(expEf + expTr);
    const pctEf = totalExp > 0 ? round2((expEf / totalExp) * 100) : 50;
    const pctTr = totalExp > 0 ? round2(100 - pctEf) : 50;

    return { expEf, expTr, totalExp, pctEf, pctTr, incEf, incTr };
  }, [targetEntries, scope, summary.openingEfectivo, summary.openingTransferencia]);

  // 4. Multi-Month Historical Trend (Up to last 8 months)
  const monthlyHistoryBars = useMemo(() => {
    const keys = Object.keys(workspace.months || {})
      .sort()
      .slice(-8);
    return keys.map((mk) => {
      const mRec = workspace.months[mk];
      const s = computeMonthSummary(mRec, workspace.investments);
      const shortLabel = formatMonthLabel(mk).slice(0, 3) + ' ' + mk.slice(2, 4);
      return {
        monthKey: mk,
        label: shortLabel,
        inflow: round2(s.openingBalance + s.totalExtraIncome + s.totalAdjustmentsUp),
        outflow: s.totalOutflowAll,
        closing: s.currentGeneralBalance,
      };
    });
  }, [workspace]);

  // SVG Line Chart Builder for dailySeries
  const lineChartGeom = useMemo(() => {
    const W = 560;
    const H = 200;
    const padL = 14;
    const padR = 14;
    const padT = 18;
    const padB = 26;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const allVals = dailySeries.flatMap((p) => [p.ef, p.tr, p.total, 0]);
    const minVal = Math.min(...allVals);
    const maxVal = Math.max(1, ...allVals);
    const range = Math.max(1, maxVal - minVal);

    const getX = (idx: number) =>
      padL + (dailySeries.length <= 1 ? 0 : (idx / (dailySeries.length - 1)) * plotW);
    const getY = (val: number) => padT + plotH - ((val - minVal) / range) * plotH;

    const totalPath = dailySeries
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(p.total).toFixed(1)}`)
      .join(' ');
    const efPath = dailySeries
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(p.ef).toFixed(1)}`)
      .join(' ');
    const trPath = dailySeries
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(p.tr).toFixed(1)}`)
      .join(' ');

    const baselineY = getY(Math.max(0, minVal));
    const areaPath =
      dailySeries.length > 0
        ? `${totalPath} L ${getX(dailySeries.length - 1).toFixed(1)} ${baselineY.toFixed(
            1
          )} L ${getX(0).toFixed(1)} ${baselineY.toFixed(1)} Z`
        : '';

    return { W, H, getX, getY, totalPath, efPath, trPath, areaPath, baselineY };
  }, [dailySeries]);

  const budgetVsActualBars = useMemo(() => {
    const envs = [
      { label: 'Hogar', plan: summary.envelopes.hogar.planned, spent: summary.envelopes.hogar.spent, color: '#ffb800' },
      { label: 'Deudas', plan: summary.envelopes.deudas.planned, spent: summary.envelopes.deudas.spent, color: '#ff2e88' },
      ...(month.hasManutenciones
        ? [
            {
              label: 'Manut.',
              plan: summary.envelopes.manutenciones.planned,
              spent: summary.envelopes.manutenciones.spent,
              color: '#ff7b29',
            },
          ]
        : []),
      {
        label: 'Inversión',
        plan: summary.envelopes.inversiones.planned,
        spent: summary.envelopes.inversiones.spent,
        color: '#b94eff',
      },
      {
        label: 'Bolsillo',
        plan: summary.envelopes.bolsillo.planned,
        spent: summary.envelopes.bolsillo.spent,
        color: '#00ff9d',
      },
    ];
    return envs;
  }, [summary, month.hasManutenciones]);

  return (
    <div>
      {/* Top Filter & Control Header */}
      <div className="neon-card card-cyan" style={{ marginBottom: '20px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '16px',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h3
              style={{
                margin: '0 0 4px',
                fontSize: '1.15rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <PieChart size={20} className="text-cyan" /> Centro Visual de Informes y Gráficos (
              {code})
            </h3>
            <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
              Analiza tus gastos del hogar, sobres, evolución diaria y proporción Efectivo vs.
              Transferencia mediante distintos tipos de gráficos interactivos.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="type-switch">
              <button
                type="button"
                className={`type-switch-btn ${scope === 'month' ? 'active-income' : ''}`}
                onClick={() => setScope('month')}
              >
                {formatMonthLabel(month.monthKey)}
              </button>
              <button
                type="button"
                className={`type-switch-btn ${scope === 'all_time' ? 'active-transfer' : ''}`}
                onClick={() => setScope('all_time')}
              >
                Histórico Día 1
              </button>
            </div>

            <div className="type-switch">
              <button
                type="button"
                className={`type-switch-btn ${channelFilter === 'all' ? 'active-income' : ''}`}
                onClick={() => setChannelFilter('all')}
              >
                Ambos
              </button>
              <button
                type="button"
                className={`type-switch-btn ${
                  channelFilter === 'efectivo' ? 'active-income' : ''
                }`}
                onClick={() => setChannelFilter('efectivo')}
              >
                Efectivo
              </button>
              <button
                type="button"
                className={`type-switch-btn ${
                  channelFilter === 'transferencia' ? 'active-transfer' : ''
                }`}
                onClick={() => setChannelFilter('transferencia')}
              >
                Transf.
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Row 1: Interactive Donut Chart + Daily Evolution Area/Line Chart */}
      <div className="two-col-grid" style={{ marginBottom: '20px' }}>
        {/* CHART 1: Interactive SVG Donut Chart */}
        <div className="neon-card card-violet">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '8px',
              flexWrap: 'wrap',
              marginBottom: '14px',
            }}
          >
            <span className="kpi-label">
              <PieChart size={15} className="text-violet" /> Gráfico de Anillo / Proporción
            </span>

            <div className="type-switch">
              <button
                type="button"
                className={`type-switch-btn ${donutMode === 'hogar_cats' ? 'active-transfer' : ''}`}
                onClick={() => setDonutMode('hogar_cats')}
              >
                Hogar
              </button>
              <button
                type="button"
                className={`type-switch-btn ${donutMode === 'divisions' ? 'active-transfer' : ''}`}
                onClick={() => setDonutMode('divisions')}
              >
                Sobres
              </button>
              <button
                type="button"
                className={`type-switch-btn ${donutMode === 'pillars' ? 'active-transfer' : ''}`}
                onClick={() => setDonutMode('pillars')}
              >
                Pilares
              </button>
            </div>
          </div>

          {donutArcs.length === 0 ? (
            <div className="empty-state" style={{ padding: '44px 16px' }}>
              <p style={{ margin: '0 0 4px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Sin salidas registradas para este desglose
              </p>
              <p style={{ margin: 0, fontSize: '0.82rem' }}>
                En cuanto registres gastos aparecerá tu anillo interactivo con porcentajes exactos.
              </p>
            </div>
          ) : (
            <div className="reports-donut-layout">
              <div className="donut-svg-box">
                <svg viewBox="0 0 200 200" width="205" height="205">
                  <circle
                    cx="100"
                    cy="100"
                    r="74"
                    fill="none"
                    stroke="rgba(255,255,255,0.06)"
                    strokeWidth="22"
                  />
                  {donutArcs.map((arc) => {
                    const isHovered = hoveredSliceId === arc.id;
                    return (
                      <circle
                        key={arc.id}
                        cx="100"
                        cy="100"
                        r="74"
                        fill="none"
                        stroke={arc.color}
                        strokeWidth={isHovered ? 27 : 22}
                        strokeDasharray={arc.dashArray}
                        strokeDashoffset={arc.dashOffset}
                        transform="rotate(-90 100 100)"
                        style={{
                          cursor: 'pointer',
                          transition: 'stroke-width 0.18s, opacity 0.18s',
                          opacity: hoveredSliceId && !isHovered ? 0.45 : 1,
                        }}
                        onMouseEnter={() => setHoveredSliceId(arc.id)}
                        onMouseLeave={() => setHoveredSliceId(null)}
                      />
                    );
                  })}
                </svg>

                <div className="donut-center-overlay">
                  {activeDonutSlice ? (
                    <>
                      <div
                        style={{
                          fontSize: '0.72rem',
                          color: activeDonutSlice.color,
                          fontWeight: 700,
                          maxWidth: '105px',
                          textAlign: 'center',
                        }}
                      >
                        {activeDonutSlice.label}
                      </div>
                      <div className="mono" style={{ fontSize: '1rem', fontWeight: 700 }}>
                        {activeDonutSlice.pct}%
                      </div>
                      <div
                        className="mono"
                        style={{ fontSize: '0.73rem', color: 'var(--text-secondary)' }}
                      >
                        {formatMoney(activeDonutSlice.value, symbol)}
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                        TOTAL
                      </div>
                      <div className="mono text-cyan" style={{ fontSize: '0.96rem', fontWeight: 700 }}>
                        {formatMoney(donutTotal, symbol)}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        {donutArcs.length} cat.
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Ranked Legend Bars */}
              <div className="donut-legend-list">
                {donutArcs.map((arc) => (
                  <div
                    key={arc.id}
                    className="donut-legend-row"
                    onMouseEnter={() => setHoveredSliceId(arc.id)}
                    onMouseLeave={() => setHoveredSliceId(null)}
                    style={{
                      background:
                        hoveredSliceId === arc.id ? 'rgba(255,255,255,0.06)' : 'transparent',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '0.82rem',
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px' }}>
                        {arc.iconKey ? (
                          <HogarCategoryIcon iconKey={arc.iconKey} size={14} color={arc.color} />
                        ) : (
                          <span
                            className="legend-dot"
                            style={{ background: arc.color, width: '9px', height: '9px' }}
                          />
                        )}
                        <strong>{arc.label}</strong>
                      </span>
                      <span className="mono">
                        <strong>{formatMoney(arc.value, symbol)}</strong>{' '}
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>
                          ({arc.pct}%)
                        </span>
                      </span>
                    </div>
                    <div className="progress-track" style={{ height: '5px', marginTop: '4px' }}>
                      <div
                        style={{
                          width: `${Math.min(100, arc.pct)}%`,
                          height: '100%',
                          background: arc.color,
                          borderRadius: '999px',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* CHART 2: Daily Balance Evolution Area & 3-Curve Chart */}
        <div className="neon-card card-cyan">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '8px',
              flexWrap: 'wrap',
              marginBottom: '10px',
            }}
          >
            <span className="kpi-label">
              <Activity size={15} className="text-cyan" /> Curva de Evolución Diaria de Saldos ·{' '}
              {formatMonthLabel(month.monthKey)}
            </span>

            <div style={{ display: 'flex', gap: '10px', fontSize: '0.74rem' }}>
              <span style={{ color: 'var(--neon-cyan)', fontWeight: 700 }}>● Total</span>
              <span style={{ color: 'var(--neon-emerald)', fontWeight: 700 }}>● Efectivo</span>
              <span style={{ color: 'var(--neon-violet)', fontWeight: 700 }}>● Transf.</span>
            </div>
          </div>

          <div style={{ width: '100%', overflowX: 'auto' }}>
            <svg
              viewBox={`0 0 ${lineChartGeom.W} ${lineChartGeom.H}`}
              style={{ width: '100%', height: '205px', display: 'block' }}
            >
              <defs>
                <linearGradient id="neonTotalGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="#00f0ff" stopOpacity="0.01" />
                </linearGradient>
              </defs>

              {/* Horizontal Grid Lines */}
              {[0.2, 0.5, 0.8].map((t) => (
                <line
                  key={t}
                  x1="14"
                  x2={lineChartGeom.W - 14}
                  y1={lineChartGeom.H * t}
                  y2={lineChartGeom.H * t}
                  stroke="rgba(255,255,255,0.06)"
                  strokeDasharray="3 3"
                />
              ))}

              {lineChartGeom.areaPath && (
                <path d={lineChartGeom.areaPath} fill="url(#neonTotalGrad)" />
              )}

              {/* Transferencia Curve */}
              <path
                d={lineChartGeom.trPath}
                fill="none"
                stroke="#b94eff"
                strokeWidth="2"
                strokeDasharray="4 2"
              />

              {/* Efectivo Curve */}
              <path d={lineChartGeom.efPath} fill="none" stroke="#00ff9d" strokeWidth="2" />

              {/* Total General Curve */}
              <path d={lineChartGeom.totalPath} fill="none" stroke="#00f0ff" strokeWidth="2.8" />

              {/* Interactive Day Hover Zones */}
              {dailySeries.map((pt, i) => {
                const cx = lineChartGeom.getX(i);
                const cy = lineChartGeom.getY(pt.total);
                const isHov = hoveredDayIdx === i;
                return (
                  <g key={pt.day}>
                    {isHov && (
                      <>
                        <line
                          x1={cx}
                          x2={cx}
                          y1="14"
                          y2={lineChartGeom.H - 24}
                          stroke="rgba(0,240,255,0.45)"
                        />
                        <circle cx={cx} cy={cy} r="5" fill="#00f0ff" />
                      </>
                    )}
                    {(pt.day === 1 ||
                      pt.day === 8 ||
                      pt.day === 15 ||
                      pt.day === 22 ||
                      pt.day === dailySeries.length) && (
                      <text
                        x={cx}
                        y={lineChartGeom.H - 6}
                        textAnchor="middle"
                        fill="#7f95b8"
                        fontSize="10"
                      >
                        D{String(pt.day).padStart(2, '0')}
                      </text>
                    )}
                    <rect
                      x={cx - 8}
                      y="0"
                      width="16"
                      height={lineChartGeom.H}
                      fill="transparent"
                      style={{ cursor: 'crosshair' }}
                      onMouseEnter={() => setHoveredDayIdx(i)}
                      onMouseLeave={() => setHoveredDayIdx(null)}
                    />
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Live Readout Footer */}
          {(() => {
            const inspected =
              hoveredDayIdx !== null
                ? dailySeries[hoveredDayIdx]
                : dailySeries[dailySeries.length - 1];
            if (!inspected) return null;
            return (
              <div
                style={{
                  marginTop: '8px',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: 'rgba(8, 12, 23, 0.82)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '10px',
                  fontSize: '0.8rem',
                }}
              >
                <span>
                  Día <strong>{String(inspected.day).padStart(2, '0')}</strong>:
                </span>
                <span>
                  Efectivo:{' '}
                  <strong className="mono text-emerald">
                    {formatMoney(inspected.ef, symbol)}
                  </strong>
                </span>
                <span>
                  Transf.:{' '}
                  <strong className="mono text-violet">
                    {formatMoney(inspected.tr, symbol)}
                  </strong>
                </span>
                <span>
                  Total:{' '}
                  <strong className="mono text-cyan">
                    {formatMoney(inspected.total, symbol)}
                  </strong>
                </span>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Row 2: Vertical Comparative Bar Chart + Efectivo/Transferencia Split & Multi-Month History */}
      <div className="two-col-grid">
        {/* CHART 3: Comparative Vertical Bars (Weekly Flow OR Planned vs Actual) */}
        <div className="neon-card">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '8px',
              flexWrap: 'wrap',
              marginBottom: '16px',
            }}
          >
            <span className="kpi-label">
              <BarChart3 size={15} className="text-emerald" /> Gráfico de Columnas Comparativas
            </span>

            <div className="type-switch">
              <button
                type="button"
                className={`type-switch-btn ${barMode === 'weeks' ? 'active-income' : ''}`}
                onClick={() => setBarMode('weeks')}
              >
                5 Semanas
              </button>
              <button
                type="button"
                className={`type-switch-btn ${
                  barMode === 'budget_vs_actual' ? 'active-transfer' : ''
                }`}
                onClick={() => setBarMode('budget_vs_actual')}
              >
                Plan vs. Real
              </button>
            </div>
          </div>

          {barMode === 'weeks' ? (
            <div>
              {(() => {
                const maxVal = Math.max(
                  1,
                  ...summary.weeklyBreakdown.flatMap((w) => [w.income, w.expense])
                );
                return (
                  <div className="vertical-bars-stage">
                    {summary.weeklyBreakdown.map((w) => {
                      const incH = Math.max(4, Math.round((w.income / maxVal) * 140));
                      const expH = Math.max(4, Math.round((w.expense / maxVal) * 140));
                      return (
                        <div key={w.weekNumber} className="vbar-group">
                          <div className="vbar-pair">
                            <div
                              className="vbar-col"
                              style={{
                                height: `${w.income > 0 ? incH : 3}px`,
                                background: 'linear-gradient(180deg, #00ff9d, rgba(0,255,157,0.3))',
                              }}
                              title={`${w.label} Entradas: ${formatMoney(w.income, symbol)}`}
                            />
                            <div
                              className="vbar-col"
                              style={{
                                height: `${w.expense > 0 ? expH : 3}px`,
                                background: 'linear-gradient(180deg, #ff2e88, rgba(255,46,136,0.3))',
                              }}
                              title={`${w.label} Salidas: ${formatMoney(w.expense, symbol)}`}
                            />
                          </div>
                          <div className="vbar-label">Sem {w.weekNumber}</div>
                          <div className="vbar-sub mono">-{formatMoney(w.expense, symbol)}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  gap: '18px',
                  fontSize: '0.76rem',
                  marginTop: '10px',
                }}
              >
                <span style={{ color: 'var(--neon-emerald)' }}>■ Entradas (+)</span>
                <span style={{ color: 'var(--neon-magenta)' }}>■ Salidas (-)</span>
              </div>
            </div>
          ) : (
            <div>
              {(() => {
                const maxVal = Math.max(
                  1,
                  ...budgetVsActualBars.flatMap((b) => [b.plan, b.spent])
                );
                return (
                  <div className="vertical-bars-stage">
                    {budgetVsActualBars.map((b) => {
                      const planH = Math.max(4, Math.round((b.plan / maxVal) * 140));
                      const spentH = Math.max(4, Math.round((b.spent / maxVal) * 140));
                      const over = b.spent > b.plan && b.plan > 0;
                      return (
                        <div key={b.label} className="vbar-group">
                          <div className="vbar-pair">
                            <div
                              className="vbar-col"
                              style={{
                                height: `${b.plan > 0 ? planH : 3}px`,
                                background: 'rgba(0, 240, 255, 0.45)',
                                border: '1px solid var(--neon-cyan)',
                              }}
                              title={`${b.label} Planificado: ${formatMoney(b.plan, symbol)}`}
                            />
                            <div
                              className="vbar-col"
                              style={{
                                height: `${b.spent > 0 ? spentH : 3}px`,
                                background: over ? '#ff2e88' : b.color,
                              }}
                              title={`${b.label} Gastado: ${formatMoney(b.spent, symbol)}`}
                            />
                          </div>
                          <div className="vbar-label">{b.label}</div>
                          <div className="vbar-sub mono">{formatMoney(b.spent, symbol)}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  gap: '18px',
                  fontSize: '0.76rem',
                  marginTop: '10px',
                }}
              >
                <span style={{ color: 'var(--neon-cyan)' }}>■ Planificado</span>
                <span style={{ color: 'var(--neon-amber)' }}>■ Ejecutado Real</span>
              </div>
            </div>
          )}
        </div>

        {/* CHART 4 & 5: Efectivo vs Transferencia Split Bar + Multi-Month Historical Bars */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="neon-card card-emerald">
            <div className="kpi-header" style={{ marginBottom: '10px' }}>
              <span className="kpi-label">
                <Layers size={15} className="text-emerald" /> Proporción de Uso: Efectivo vs.
                Transferencia
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.84rem',
                marginBottom: '8px',
              }}
            >
              <span className="text-emerald" style={{ fontWeight: 700 }}>
                <Banknote size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                Efectivo: {channelComparison.pctEf}% (
                {formatMoney(channelComparison.expEf, symbol)})
              </span>
              <span className="text-violet" style={{ fontWeight: 700 }}>
                <Smartphone size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                Transf.: {channelComparison.pctTr}% (
                {formatMoney(channelComparison.expTr, symbol)})
              </span>
            </div>

            <div
              style={{
                width: '100%',
                height: '18px',
                borderRadius: '999px',
                overflow: 'hidden',
                display: 'flex',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div
                style={{
                  width: `${channelComparison.pctEf}%`,
                  background: 'linear-gradient(90deg, #00ff9d, #00c87a)',
                  transition: 'width 0.25s',
                }}
              />
              <div
                style={{
                  width: `${channelComparison.pctTr}%`,
                  background: 'linear-gradient(90deg, #8b5cf6, #b94eff)',
                  transition: 'width 0.25s',
                }}
              />
            </div>
          </div>

          <div className="neon-card">
            <div className="kpi-header" style={{ marginBottom: '10px' }}>
              <span className="kpi-label">
                <TrendingUp size={15} className="text-cyan" /> Evolución Histórica Mensual ({code})
              </span>
            </div>

            {(() => {
              const maxM = Math.max(
                1,
                ...monthlyHistoryBars.flatMap((m) => [m.inflow, m.outflow, Math.abs(m.closing)])
              );
              return (
                <div
                  className="vertical-bars-stage"
                  style={{ height: '135px', paddingTop: '10px' }}
                >
                  {monthlyHistoryBars.map((mb) => {
                    const inH = Math.max(4, Math.round((mb.inflow / maxM) * 95));
                    const outH = Math.max(4, Math.round((mb.outflow / maxM) * 95));
                    return (
                      <div key={mb.monthKey} className="vbar-group">
                        <div className="vbar-pair">
                          <div
                            className="vbar-col"
                            style={{
                              height: `${mb.inflow > 0 ? inH : 3}px`,
                              background: '#00f0ff',
                            }}
                            title={`${mb.label} Disponible: ${formatMoney(mb.inflow, symbol)}`}
                          />
                          <div
                            className="vbar-col"
                            style={{
                              height: `${mb.outflow > 0 ? outH : 3}px`,
                              background: '#ff2e88',
                            }}
                            title={`${mb.label} Salidas: ${formatMoney(mb.outflow, symbol)}`}
                          />
                        </div>
                        <div className="vbar-label">{mb.label}</div>
                        <div className="vbar-sub mono text-emerald">
                          {formatMoney(mb.closing, symbol)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
};
