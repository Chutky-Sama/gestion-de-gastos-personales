import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Coins,
  CreditCard,
  HeartHandshake,
  Home,
  Layers,
  Plus,
  Sparkles,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import {
  MonthComputedSummary,
  formatMonthLabel,
  getEffectiveAllocation,
  round2,
} from '../../shared/calculations';
import {
  CustomEnvelope,
  InvestmentDefinition,
  MonthAllocations,
  MonthRecord,
  SubItem,
} from '../../shared/types';
import { formatMoney } from '../utils/format';

interface EnvelopesTabProps {
  month: MonthRecord;
  previousMonthKey?: string;
  summary: MonthComputedSummary;
  investments: InvestmentDefinition[];
  currencySymbol: string;
  onSavePlan: (payload: {
    salary: number;
    carryover: number;
    hasManutenciones: boolean;
    allocations: MonthAllocations;
    alsoUpdateCurrentSalary: boolean;
  }) => Promise<void>;
  onBringCarryover: (prevMonthKey: string) => Promise<void>;
  onNavigateInvestments: () => void;
}

export const EnvelopesTab: React.FC<EnvelopesTabProps> = ({
  month,
  previousMonthKey,
  summary,
  investments,
  currencySymbol,
  onSavePlan,
  onBringCarryover,
  onNavigateInvestments,
}) => {
  const [salaryStr, setSalaryStr] = useState(String(month.salary || 0));
  const [carryoverStr, setCarryoverStr] = useState(String(month.carryover || 0));
  const [alsoUpdateSalary, setAlsoUpdateSalary] = useState(true);
  const [hasManutenciones, setHasManutenciones] = useState(month.hasManutenciones);

  const [hogarDirect, setHogarDirect] = useState(String(month.allocations.hogar || 0));
  const [deudasDirect, setDeudasDirect] = useState(String(month.allocations.deudas || 0));
  const [manutDirect, setManutDirect] = useState(String(month.allocations.manutenciones || 0));

  const [hogarItems, setHogarItems] = useState<SubItem[]>(month.allocations.hogarItems || []);
  const [deudasItems, setDeudasItems] = useState<SubItem[]>(month.allocations.deudasItems || []);
  const [manutItems, setManutItems] = useState<SubItem[]>(
    month.allocations.manutencionesItems || []
  );
  const [invTargets, setInvTargets] = useState<Record<string, number>>(
    month.allocations.investmentTargets || {}
  );
  const [customEnvelopes, setCustomEnvelopes] = useState<CustomEnvelope[]>(
    month.allocations.customEnvelopes || []
  );

  const [newCustomName, setNewCustomName] = useState('');
  const [newCustomAmount, setNewCustomAmount] = useState('');

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSalaryStr(String(month.salary || 0));
    setCarryoverStr(String(month.carryover || 0));
    setHasManutenciones(month.hasManutenciones);
    setHogarDirect(String(month.allocations.hogar || 0));
    setDeudasDirect(String(month.allocations.deudas || 0));
    setManutDirect(String(month.allocations.manutenciones || 0));
    setHogarItems(month.allocations.hogarItems || []);
    setDeudasItems(month.allocations.deudasItems || []);
    setManutItems(month.allocations.manutencionesItems || []);
    setInvTargets(month.allocations.investmentTargets || {});
    setCustomEnvelopes(month.allocations.customEnvelopes || []);
    setDirty(false);
  }, [month]);

  const parsedSalary = Math.max(0, parseFloat(salaryStr) || 0);
  const parsedCarryover = parseFloat(carryoverStr) || 0;

  const effHogar = getEffectiveAllocation(parseFloat(hogarDirect) || 0, hogarItems);
  const effDeudas = getEffectiveAllocation(parseFloat(deudasDirect) || 0, deudasItems);
  const effManut = hasManutenciones
    ? getEffectiveAllocation(parseFloat(manutDirect) || 0, manutItems)
    : 0;

  const activeInvestments = investments.filter((i) => i.active);
  const effInversiones = round2(
    activeInvestments.reduce((acc, inv) => {
      const val = invTargets[inv.id] !== undefined ? invTargets[inv.id] : inv.monthlyTarget;
      return acc + (Number(val) || 0);
    }, 0)
  );

  const effCustom = round2(
    customEnvelopes.reduce((acc, c) => acc + (Number(c.allocated) || 0), 0)
  );

  const livePool = round2(
    parsedSalary +
      parsedCarryover +
      summary.totalExtraIncome +
      summary.totalAdjustmentsUp -
      summary.generalDirectOutflow
  );

  const liveCommitted = round2(effHogar + effDeudas + effManut + effInversiones + effCustom);
  const liveRemainder = round2(livePool - liveCommitted - summary.overBudgetExcess);
  const livePocket = Math.max(0, liveRemainder);
  const liveDeficit = liveRemainder < 0 ? Math.abs(liveRemainder) : 0;

  const denom = Math.max(1, livePool, liveCommitted);
  const pctHogar = Math.min(100, (effHogar / denom) * 100);
  const pctDeudas = Math.min(100, (effDeudas / denom) * 100);
  const pctManut = Math.min(100, (effManut / denom) * 100);
  const pctInv = Math.min(100, (effInversiones / denom) * 100);
  const pctCustom = Math.min(100, (effCustom / denom) * 100);
  const pctPocket = Math.min(100, (livePocket / denom) * 100);

  const addSubItem = (
    setter: React.Dispatch<React.SetStateAction<SubItem[]>>,
    placeholderName: string
  ) => {
    setter((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, name: placeholderName, amount: 0 },
    ]);
    setDirty(true);
  };

  const updateSubItem = (
    setter: React.Dispatch<React.SetStateAction<SubItem[]>>,
    id: string,
    field: 'name' | 'amount',
    value: string
  ) => {
    setter((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              [field]: field === 'amount' ? Math.max(0, parseFloat(value) || 0) : value,
            }
          : item
      )
    );
    setDirty(true);
  };

  const removeSubItem = (
    setter: React.Dispatch<React.SetStateAction<SubItem[]>>,
    id: string
  ) => {
    setter((prev) => prev.filter((item) => item.id !== id));
    setDirty(true);
  };

  const handleAddCustomEnvelope = () => {
    if (!newCustomName.trim()) return;
    const amt = Math.max(0, parseFloat(newCustomAmount) || 0);
    setCustomEnvelopes((prev) => [
      ...prev,
      {
        id: `custom_${Date.now()}`,
        name: newCustomName.trim(),
        allocated: amt,
        color: 'cyan',
      },
    ]);
    setNewCustomName('');
    setNewCustomAmount('');
    setDirty(true);
  };

  const handleSaveAll = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      await onSavePlan({
        salary: round2(parsedSalary),
        carryover: round2(parsedCarryover),
        hasManutenciones,
        alsoUpdateCurrentSalary: alsoUpdateSalary,
        allocations: {
          hogar: round2(effHogar),
          deudas: round2(effDeudas),
          manutenciones: round2(effManut),
          hogarItems,
          deudasItems,
          manutencionesItems: manutItems,
          investmentTargets: invTargets,
          customEnvelopes,
        },
      });
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSaveAll}>
      {/* Sticky / Top Save Bar + Salary Definition */}
      <div className="neon-card card-cyan distribution-panel">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap',
            marginBottom: '16px',
          }}
        >
          <div>
            <h3 style={{ margin: '0 0 4px', fontSize: '1.12rem' }}>
              Planificación y División en Sobres · {formatMonthLabel(month.monthKey)}{' '}
              <span className="asian-chip">袋分け家計簿</span>
            </h3>
            <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
              Define tu salario del mes y repártelo en partes claras. El remanente se asigna a tu
              Dinero de Bolsillo si llega a quedar.
            </p>
          </div>

          <button
            type="submit"
            disabled={saving}
            className={`btn ${dirty ? 'btn-emerald' : 'btn-cyan'}`}
          >
            <Check size={16} />
            {saving
              ? 'Guardando...'
              : dirty
              ? 'Guardar Cambios de División'
              : 'División Guardada'}
          </button>
        </div>

        {/* Salary & Carryover Inputs */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
            gap: '14px',
            padding: '14px',
            background: 'rgba(8, 12, 23, 0.72)',
            borderRadius: '12px',
            border: '1px solid var(--border-subtle)',
            marginBottom: '16px',
          }}
        >
          <div>
            <label className="field-label">Salario de este mes ({currencySymbol})</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="neon-input mono-input"
              value={salaryStr}
              onChange={(e) => {
                setSalaryStr(e.target.value);
                setDirty(true);
              }}
            />
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.76rem',
                color: 'var(--text-secondary)',
                marginTop: '6px',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={alsoUpdateSalary}
                onChange={(e) => setAlsoUpdateSalary(e.target.checked)}
              />
              Fijar también como mi Salario Actual general
            </label>
          </div>

          <div>
            <label className="field-label">Saldo inicial / Arrastrado ({currencySymbol})</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="number"
                step="0.01"
                className="neon-input mono-input"
                value={carryoverStr}
                onChange={(e) => {
                  setCarryoverStr(e.target.value);
                  setDirty(true);
                }}
              />
              {previousMonthKey && (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  title={`Traer saldo final de ${formatMonthLabel(previousMonthKey)}`}
                  onClick={() => onBringCarryover(previousMonthKey)}
                >
                  Traer {previousMonthKey}
                </button>
              )}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>
              Dinero sobrante (o faltante) al arrancar el mes
            </div>
          </div>

          <div>
            <div className="field-label">Capital Total Planificable del Mes</div>
            <div className="mono text-cyan" style={{ fontSize: '1.42rem', fontWeight: 700 }}>
              {formatMoney(livePool, currencySymbol)}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Incluye salario + saldo inicial + ajustes/ingresos extra del mes
            </div>
          </div>
        </div>

        {/* Stacked Distribution Bar */}
        <div className="kpi-label">Distribución Visual del Dinero del Mes</div>
        <div className="stacked-bar">
          {pctHogar > 0 && (
            <div
              className="stacked-seg"
              style={{ width: `${pctHogar}%`, background: 'var(--neon-amber)' }}
              title={`Hogar: ${formatMoney(effHogar, currencySymbol)}`}
            />
          )}
          {pctDeudas > 0 && (
            <div
              className="stacked-seg"
              style={{ width: `${pctDeudas}%`, background: 'var(--neon-magenta)' }}
              title={`Deudas: ${formatMoney(effDeudas, currencySymbol)}`}
            />
          )}
          {pctManut > 0 && (
            <div
              className="stacked-seg"
              style={{ width: `${pctManut}%`, background: 'var(--neon-orange)' }}
              title={`Manutenciones: ${formatMoney(effManut, currencySymbol)}`}
            />
          )}
          {pctInv > 0 && (
            <div
              className="stacked-seg"
              style={{ width: `${pctInv}%`, background: 'var(--neon-violet)' }}
              title={`Inversiones: ${formatMoney(effInversiones, currencySymbol)}`}
            />
          )}
          {pctCustom > 0 && (
            <div
              className="stacked-seg"
              style={{ width: `${pctCustom}%`, background: 'var(--neon-cyan)' }}
              title={`Apartados extra: ${formatMoney(effCustom, currencySymbol)}`}
            />
          )}
          {pctPocket > 0 && (
            <div
              className="stacked-seg"
              style={{ width: `${pctPocket}%`, background: 'var(--neon-emerald)' }}
              title={`Dinero de Bolsillo: ${formatMoney(livePocket, currencySymbol)}`}
            />
          )}
        </div>

        <div className="distribution-legend">
          <span className="legend-item">
            <span className="legend-dot" style={{ background: 'var(--neon-amber)' }} />
            Hogar: <strong className="mono">{formatMoney(effHogar, currencySymbol)}</strong>
          </span>
          <span className="legend-item">
            <span className="legend-dot" style={{ background: 'var(--neon-magenta)' }} />
            Deudas: <strong className="mono">{formatMoney(effDeudas, currencySymbol)}</strong>
          </span>
          {hasManutenciones && (
            <span className="legend-item">
              <span className="legend-dot" style={{ background: 'var(--neon-orange)' }} />
              Manutenciones:{' '}
              <strong className="mono">{formatMoney(effManut, currencySymbol)}</strong>
            </span>
          )}
          <span className="legend-item">
            <span className="legend-dot" style={{ background: 'var(--neon-violet)' }} />
            Inversiones:{' '}
            <strong className="mono">{formatMoney(effInversiones, currencySymbol)}</strong>
          </span>
          <span className="legend-item">
            <span className="legend-dot" style={{ background: 'var(--neon-emerald)' }} />
            Dinero de Bolsillo:{' '}
            <strong className="mono text-emerald">
              {formatMoney(livePocket, currencySymbol)}
            </strong>
          </span>
        </div>
      </div>

      {/* Envelope Cards Grid */}
      <div className="envelopes-grid">
        {/* 1. Gastos del Hogar */}
        <div className="neon-card card-amber">
          <div className="envelope-card-header">
            <div>
              <h4 className="envelope-card-title text-amber">
                <Home size={18} /> 1. Gastos del Hogar <span className="asian-chip">家計費</span>
              </h4>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
                Alquiler, electricidad, agua, internet, supermercado y básicos de casa.
              </div>
            </div>
            <div className="mono text-amber" style={{ fontWeight: 700, fontSize: '1.2rem' }}>
              {formatMoney(effHogar, currencySymbol)}
            </div>
          </div>

          {hogarItems.length === 0 ? (
            <div>
              <label className="field-label">Monto mensual asignado a Hogar ({currencySymbol})</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="neon-input mono-input"
                value={hogarDirect}
                onChange={(e) => {
                  setHogarDirect(e.target.value);
                  setDirty(true);
                }}
              />
            </div>
          ) : (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Calculado automáticamente sumando tus conceptos del hogar:
            </div>
          )}

          <div className="subitems-list">
            {hogarItems.map((item) => (
              <div key={item.id} className="subitem-row">
                <input
                  type="text"
                  className="neon-input"
                  placeholder="Ej. Alquiler, Luz, Supermercado..."
                  value={item.name}
                  onChange={(e) => updateSubItem(setHogarItems, item.id, 'name', e.target.value)}
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="neon-input mono-input"
                  value={item.amount}
                  onChange={(e) => updateSubItem(setHogarItems, item.id, 'amount', e.target.value)}
                />
                <button
                  type="button"
                  className="icon-btn danger"
                  onClick={() => removeSubItem(setHogarItems, item.id)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            <div>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => addSubItem(setHogarItems, 'Nuevo gasto del hogar')}
              >
                <Plus size={14} /> Desglosar concepto del hogar
              </button>
            </div>
          </div>
        </div>

        {/* 2. Deudas */}
        <div className="neon-card card-magenta">
          <div className="envelope-card-header">
            <div>
              <h4 className="envelope-card-title text-magenta">
                <CreditCard size={18} /> 2. Deudas y Compromisos{' '}
                <span className="asian-chip">負債返済</span>
              </h4>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
                Tarjetas de crédito, préstamos bancarios, financiamientos o deudas personales.
              </div>
            </div>
            <div className="mono text-magenta" style={{ fontWeight: 700, fontSize: '1.2rem' }}>
              {formatMoney(effDeudas, currencySymbol)}
            </div>
          </div>

          {deudasItems.length === 0 ? (
            <div>
              <label className="field-label">Monto mensual para Deudas ({currencySymbol})</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="neon-input mono-input"
                value={deudasDirect}
                onChange={(e) => {
                  setDeudasDirect(e.target.value);
                  setDirty(true);
                }}
              />
            </div>
          ) : (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Suma automática de las cuotas de deuda de este mes:
            </div>
          )}

          <div className="subitems-list">
            {deudasItems.map((item) => (
              <div key={item.id} className="subitem-row">
                <input
                  type="text"
                  className="neon-input"
                  placeholder="Ej. Tarjeta Visa, Préstamo..."
                  value={item.name}
                  onChange={(e) => updateSubItem(setDeudasItems, item.id, 'name', e.target.value)}
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="neon-input mono-input"
                  value={item.amount}
                  onChange={(e) =>
                    updateSubItem(setDeudasItems, item.id, 'amount', e.target.value)
                  }
                />
                <button
                  type="button"
                  className="icon-btn danger"
                  onClick={() => removeSubItem(setDeudasItems, item.id)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            <div>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => addSubItem(setDeudasItems, 'Cuota / Deuda')}
              >
                <Plus size={14} /> Desglosar deuda específica
              </button>
            </div>
          </div>
        </div>

        {/* 3. Manutenciones (si hay) */}
        <div className="neon-card">
          <div className="envelope-card-header">
            <div>
              <h4 className="envelope-card-title" style={{ color: 'var(--neon-orange)' }}>
                <HeartHandshake size={18} /> 3. Manutenciones (Si hay){' '}
                <span className="asian-chip">扶養費</span>
              </h4>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
                Actívalo solo si tienes responsabilidades de manutención o apoyo familiar fijo.
              </div>
            </div>

            <div
              className="neon-switch"
              onClick={() => {
                setHasManutenciones((v) => !v);
                setDirty(true);
              }}
            >
              <div className={`switch-track ${hasManutenciones ? 'on' : ''}`}>
                <div className="switch-thumb" />
              </div>
              <span>{hasManutenciones ? 'Sí hay' : 'No aplica'}</span>
            </div>
          </div>

          {hasManutenciones ? (
            <>
              {manutItems.length === 0 ? (
                <div>
                  <label className="field-label">
                    Monto mensual en Manutenciones ({currencySymbol})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="neon-input mono-input"
                    value={manutDirect}
                    onChange={(e) => {
                      setManutDirect(e.target.value);
                      setDirty(true);
                    }}
                  />
                </div>
              ) : (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  Total de manutenciones activas ({formatMoney(effManut, currencySymbol)}):
                </div>
              )}

              <div className="subitems-list">
                {manutItems.map((item) => (
                  <div key={item.id} className="subitem-row">
                    <input
                      type="text"
                      className="neon-input"
                      placeholder="Ej. Manutención hijos, Apoyo padres..."
                      value={item.name}
                      onChange={(e) =>
                        updateSubItem(setManutItems, item.id, 'name', e.target.value)
                      }
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="neon-input mono-input"
                      value={item.amount}
                      onChange={(e) =>
                        updateSubItem(setManutItems, item.id, 'amount', e.target.value)
                      }
                    />
                    <button
                      type="button"
                      className="icon-btn danger"
                      onClick={() => removeSubItem(setManutItems, item.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
                <div>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => addSubItem(setManutItems, 'Manutención')}
                  >
                    <Plus size={14} /> Desglosar manutención
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div
              style={{
                padding: '16px',
                borderRadius: '10px',
                background: 'rgba(255, 255, 255, 0.02)',
                color: 'var(--text-muted)',
                fontSize: '0.84rem',
              }}
            >
              Desactivado este mes ($0.00). Si en algún momento tienes pagos de manutención, activa
              el interruptor superior.
            </div>
          )}
        </div>

        {/* 4. Inversiones */}
        <div className="neon-card card-violet">
          <div className="envelope-card-header">
            <div>
              <h4 className="envelope-card-title text-violet">
                <TrendingUp size={18} /> 4. Inversiones Definidas{' '}
                <span className="asian-chip">資産運用</span>
              </h4>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
                Define cuáles son tus inversiones y cuánto destinarás a cada una este mes.
              </div>
            </div>
            <div className="mono text-violet" style={{ fontWeight: 700, fontSize: '1.2rem' }}>
              {formatMoney(effInversiones, currencySymbol)}
            </div>
          </div>

          {activeInvestments.length === 0 ? (
            <div
              style={{
                padding: '16px',
                borderRadius: '10px',
                background: 'rgba(185, 78, 255, 0.06)',
                border: '1px dashed rgba(185, 78, 255, 0.35)',
                textAlign: 'center',
              }}
            >
              <p style={{ margin: '0 0 10px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Aún no has definido cuáles son tus inversiones (ej. ETFs, Cripto, Plazo Fijo,
                Negocio).
              </p>
              <button
                type="button"
                className="btn btn-violet btn-sm"
                onClick={onNavigateInvestments}
              >
                <Plus size={14} /> Definir Mis Inversiones
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {activeInvestments.map((inv) => {
                const currentVal =
                  invTargets[inv.id] !== undefined ? invTargets[inv.id] : inv.monthlyTarget;
                return (
                  <div
                    key={inv.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 135px',
                      gap: '10px',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{inv.name}</div>
                      {inv.platform && (
                        <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                          {inv.platform}
                        </div>
                      )}
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="neon-input mono-input"
                      value={currentVal}
                      onChange={(e) => {
                        const v = Math.max(0, parseFloat(e.target.value) || 0);
                        setInvTargets((prev) => ({ ...prev, [inv.id]: v }));
                        setDirty(true);
                      }}
                    />
                  </div>
                );
              })}

              <div style={{ marginTop: '8px' }}>
                <button
                  type="button"
                  className="btn btn-sm btn-violet"
                  onClick={onNavigateInvestments}
                >
                  Gestionar cartera de inversiones <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 5. Dinero de Bolsillo (si es que llega a quedar) */}
        <div
          className={`neon-card ${
            liveDeficit > 0 ? 'card-magenta' : livePocket > 0 ? 'card-emerald' : 'card-cyan'
          }`}
        >
          <div className="envelope-card-header">
            <div>
              <h4
                className={`envelope-card-title ${
                  liveDeficit > 0
                    ? 'text-magenta'
                    : livePocket > 0
                    ? 'text-emerald'
                    : 'text-cyan'
                }`}
              >
                <Coins size={18} /> 5. Dinero de Bolsillo (Si llega a quedar){' '}
                <span className="asian-chip">お小遣い · 용돈</span>
              </h4>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
                Calculado automáticamente descontando Hogar, Deudas, Manutenciones e Inversiones.
              </div>
            </div>
            <div
              className={`mono ${
                liveDeficit > 0 ? 'text-magenta' : livePocket > 0 ? 'text-emerald' : 'text-cyan'
              }`}
              style={{ fontWeight: 700, fontSize: '1.35rem' }}
            >
              {formatMoney(livePocket, currencySymbol)}
            </div>
          </div>

          {liveDeficit > 0 ? (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '10px',
                background: 'var(--neon-magenta-dim)',
                border: '1px solid rgba(255, 46, 136, 0.4)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                color: 'var(--neon-magenta)',
                fontSize: '0.85rem',
              }}
            >
              <AlertTriangle size={18} />
              <span>
                <strong>No queda dinero de bolsillo.</strong> Tus obligaciones e inversiones superan
                tu dinero disponible del mes por{' '}
                <strong className="mono">{formatMoney(liveDeficit, currencySymbol)}</strong>.
              </span>
            </div>
          ) : livePocket > 0 ? (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '10px',
                background: 'var(--neon-emerald-dim)',
                border: '1px solid rgba(0, 255, 157, 0.35)',
                color: 'var(--neon-emerald)',
                fontSize: '0.85rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
                <Sparkles size={16} /> ¡Sí te queda dinero de bolsillo este mes!
              </div>
              <div style={{ marginTop: '4px', color: 'var(--text-primary)', fontSize: '0.82rem' }}>
                Gastado hasta hoy en bolsillo:{' '}
                <strong className="mono">
                  {formatMoney(summary.pocketMoneySpent, currencySymbol)}
                </strong>{' '}
                · Disponible libre hoy:{' '}
                <strong className="mono text-emerald">
                  {formatMoney(livePocket - summary.pocketMoneySpent, currencySymbol)}
                </strong>
              </div>
            </div>
          ) : (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '10px',
                background: 'rgba(255, 255, 255, 0.04)',
                fontSize: '0.84rem',
                color: 'var(--text-secondary)',
              }}
            >
              Actualmente el 100% del dinero del mes está comprometido o aún no has ingresado tu
              salario ($0.00 libre de bolsillo).
            </div>
          )}
        </div>

        {/* 6. Apartados Extra Opcionales */}
        <div className="neon-card">
          <div className="envelope-card-header">
            <div>
              <h4 className="envelope-card-title text-cyan">
                <Layers size={18} /> Apartados Extra (Opcional)
              </h4>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
                ¿Necesitas otro sobre puntual este mes (ej. Salud, Reparación auto, Viaje)?
              </div>
            </div>
            <div className="mono text-cyan" style={{ fontWeight: 700, fontSize: '1.1rem' }}>
              {formatMoney(effCustom, currencySymbol)}
            </div>
          </div>

          {customEnvelopes.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
              {customEnvelopes.map((ce) => (
                <div key={ce.id} className="subitem-row">
                  <input
                    type="text"
                    className="neon-input"
                    value={ce.name}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomEnvelopes((prev) =>
                        prev.map((c) => (c.id === ce.id ? { ...c, name: val } : c))
                      );
                      setDirty(true);
                    }}
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="neon-input mono-input"
                    value={ce.allocated}
                    onChange={(e) => {
                      const val = Math.max(0, parseFloat(e.target.value) || 0);
                      setCustomEnvelopes((prev) =>
                        prev.map((c) => (c.id === ce.id ? { ...c, allocated: val } : c))
                      );
                      setDirty(true);
                    }}
                  />
                  <button
                    type="button"
                    className="icon-btn danger"
                    onClick={() => {
                      setCustomEnvelopes((prev) => prev.filter((c) => c.id !== ce.id));
                      setDirty(true);
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px auto', gap: '8px' }}>
            <input
              type="text"
              className="neon-input"
              placeholder="Nombre del sobre extra..."
              value={newCustomName}
              onChange={(e) => setNewCustomName(e.target.value)}
            />
            <input
              type="number"
              step="0.01"
              min="0"
              className="neon-input mono-input"
              placeholder="Monto"
              value={newCustomAmount}
              onChange={(e) => setNewCustomAmount(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleAddCustomEnvelope}
            >
              <Plus size={15} /> Crear
            </button>
          </div>
        </div>
      </div>

      {dirty && (
        <div
          style={{
            marginTop: '18px',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button type="submit" className="btn btn-emerald" disabled={saving}>
            <Check size={16} /> Guardar División del Mes Ahora
          </button>
        </div>
      )}
    </form>
  );
};
