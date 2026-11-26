import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpDown,
  ArrowUpRight,
  BookOpen,
  Check,
  Edit3,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  MonthComputedSummary,
  getTodayDateString,
} from '../../shared/calculations';
import {
  EntryType,
  InvestmentDefinition,
  KakeiboPillar,
  LedgerEntry,
  MonthRecord,
} from '../../shared/types';
import {
  KAKEIBO_PILLARS,
  formatMoney,
  formatShortDate,
  getDivisionColorClass,
  getDivisionLabel,
} from '../utils/format';

interface LedgerTabProps {
  month: MonthRecord;
  summary: MonthComputedSummary;
  investments: InvestmentDefinition[];
  currencySymbol: string;
  onAddEntry: (payload: {
    date: string;
    type: EntryType;
    amount: number;
    concept: string;
    division: string;
    investmentId?: string;
    pillar: KakeiboPillar;
    note?: string;
  }) => Promise<void>;
  onUpdateEntry: (
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
  ) => Promise<void>;
  onDeleteEntry: (entryId: string) => Promise<void>;
  onSaveReflection: (reflection: MonthRecord['reflection']) => Promise<void>;
  onOpenAdjustModal: () => void;
  onNavigateTab: (tab: 'envelopes' | 'investments') => void;
}

export const LedgerTab: React.FC<LedgerTabProps> = ({
  month,
  summary,
  investments,
  currencySymbol,
  onAddEntry,
  onUpdateEntry,
  onDeleteEntry,
  onSaveReflection,
  onOpenAdjustModal,
  onNavigateTab,
}) => {
  const defaultDateForMonth = useMemo(() => {
    const today = getTodayDateString();
    if (today.startsWith(month.monthKey)) return today;
    return `${month.monthKey}-01`;
  }, [month.monthKey]);

  // Quick composer state
  const [entryMode, setEntryMode] = useState<'expense' | 'income'>('expense');
  const [concept, setConcept] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [division, setDivision] = useState<string>('hogar');
  const [investmentId, setInvestmentId] = useState<string>('');
  const [pillar, setPillar] = useState<KakeiboPillar>('supervivencia');
  const [date, setDate] = useState<string>(defaultDateForMonth);
  const [note, setNote] = useState<string>('');
  const [showNoteField, setShowNoteField] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Filters & sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDivision, setFilterDivision] = useState('all');
  const [orderAsc, setOrderAsc] = useState(true); // Classic Asian ledger order top-to-bottom

  // Editing row state
  const [editingEntry, setEditingEntry] = useState<LedgerEntry | null>(null);
  const [editConcept, setEditConcept] = useState('');
  const [editAmountStr, setEditAmountStr] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editDivision, setEditDivision] = useState('');
  const [editInvestmentId, setEditInvestmentId] = useState('');
  const [editPillar, setEditPillar] = useState<KakeiboPillar>('supervivencia');
  const [editNote, setEditNote] = useState('');

  // Reflection state
  const [howMuchCanISave, setHowMuchCanISave] = useState(month.reflection.howMuchCanISave || '');
  const [improvementPlan, setImprovementPlan] = useState(month.reflection.improvementPlan || '');
  const [closingNotes, setClosingNotes] = useState(month.reflection.closingNotes || '');
  const [mood, setMood] = useState<MonthRecord['reflection']['mood']>(month.reflection.mood || '');
  const [savingReflection, setSavingReflection] = useState(false);

  useEffect(() => {
    setDate(defaultDateForMonth);
  }, [defaultDateForMonth]);

  useEffect(() => {
    setHowMuchCanISave(month.reflection.howMuchCanISave || '');
    setImprovementPlan(month.reflection.improvementPlan || '');
    setClosingNotes(month.reflection.closingNotes || '');
    setMood(month.reflection.mood || '');
  }, [month.monthKey, month.reflection]);

  const activeInvestments = useMemo(
    () => investments.filter((i) => i.active),
    [investments]
  );

  useEffect(() => {
    if (division === 'inversiones' && !investmentId && activeInvestments.length > 0) {
      setInvestmentId(activeInvestments[0].id);
    }
  }, [division, investmentId, activeInvestments]);

  const handleModeChange = (nextMode: 'expense' | 'income') => {
    setEntryMode(nextMode);
    if (nextMode === 'income') {
      setDivision('general');
      setPillar('ingreso');
    } else {
      setDivision('hogar');
      setPillar('supervivencia');
    }
  };

  const handleDivisionChange = (nextDiv: string) => {
    setDivision(nextDiv);
    if (nextDiv === 'inversiones' || nextDiv === 'deudas') {
      setPillar('patrimonio');
    } else if (nextDiv === 'bolsillo') {
      setPillar('opcional');
    } else if (nextDiv === 'hogar' || nextDiv === 'manutenciones') {
      setPillar('supervivencia');
    }
  };

  const handleSubmitEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    const numeric = parseFloat(amountStr);
    if (Number.isNaN(numeric) || numeric <= 0 || !concept.trim()) return;

    setSubmitting(true);
    try {
      await onAddEntry({
        date,
        type: entryMode,
        amount: numeric,
        concept: concept.trim(),
        division: entryMode === 'income' ? 'general' : division,
        investmentId: division === 'inversiones' ? investmentId || undefined : undefined,
        pillar: entryMode === 'income' ? 'ingreso' : pillar,
        note: note.trim() || undefined,
      });
      setConcept('');
      setAmountStr('');
      setNote('');
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (entry: LedgerEntry) => {
    setEditingEntry(entry);
    setEditConcept(entry.concept);
    setEditAmountStr(String(entry.amount));
    setEditDate(entry.date);
    setEditDivision(entry.division);
    setEditInvestmentId(entry.investmentId || '');
    setEditPillar(entry.pillar);
    setEditNote(entry.note || '');
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry) return;
    const numeric = parseFloat(editAmountStr);
    if (Number.isNaN(numeric) || numeric <= 0) return;

    await onUpdateEntry(editingEntry.id, {
      concept: editConcept.trim() || editingEntry.concept,
      amount: numeric,
      date: editDate,
      division: editDivision,
      investmentId: editDivision === 'inversiones' ? editInvestmentId || undefined : undefined,
      pillar: editPillar,
      note: editNote,
    });
    setEditingEntry(null);
  };

  const handleSaveReflectionForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingReflection(true);
    try {
      await onSaveReflection({
        howMuchCanISave,
        improvementPlan,
        closingNotes,
        mood,
      });
    } finally {
      setSavingReflection(false);
    }
  };

  const invNameMap = useMemo(
    () => new Map(investments.map((i) => [i.id, i.name])),
    [investments]
  );

  const visibleEntries = useMemo(() => {
    const base = orderAsc ? summary.ledgerAscending : summary.ledgerDescending;
    return base.filter((row) => {
      if (filterDivision !== 'all' && row.division !== filterDivision) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const invName = row.investmentId ? invNameMap.get(row.investmentId) || '' : '';
        return (
          row.concept.toLowerCase().includes(q) ||
          (row.note || '').toLowerCase().includes(q) ||
          invName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [summary, orderAsc, filterDivision, searchQuery, invNameMap]);

  const activeEnvelopeList = [
    summary.envelopes.hogar,
    summary.envelopes.deudas,
    ...(month.hasManutenciones ? [summary.envelopes.manutenciones] : []),
    summary.envelopes.inversiones,
    ...summary.envelopes.custom,
    summary.envelopes.bolsillo,
  ];

  const maxWeekExpense = Math.max(
    1,
    ...summary.weeklyBreakdown.map((w) => Math.max(w.expense, w.income))
  );

  return (
    <div>
      {/* Live Envelopes Strip */}
      <div className="envelope-strip">
        {activeEnvelopeList.map((env) => {
          const fillClass = env.isOverBudget
            ? 'fill-magenta'
            : env.id === 'bolsillo'
            ? 'fill-emerald'
            : env.id === 'inversiones'
            ? 'fill-violet'
            : env.id === 'hogar'
            ? 'fill-amber'
            : 'fill-cyan';

          return (
            <div key={env.id} className="envelope-mini-card">
              <div className="envelope-mini-top">
                <span>{env.label}</span>
                <span className="asian-chip">{env.kanji}</span>
              </div>
              <div className="envelope-mini-amounts">
                <span
                  className={`envelope-mini-rem ${
                    env.remaining < 0
                      ? 'text-magenta'
                      : env.id === 'bolsillo'
                      ? 'text-emerald'
                      : ''
                  }`}
                >
                  {formatMoney(env.remaining, currencySymbol)}
                </span>
                <span className="envelope-mini-plan">
                  de {formatMoney(env.planned, currencySymbol)}
                </span>
              </div>
              <div className="progress-track">
                <div
                  className={`progress-fill ${fillClass}`}
                  style={{ width: `${Math.min(100, Math.max(0, env.percentUsed))}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Entry Composer */}
      <div className="composer-panel">
        <div className="composer-top">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div className="type-switch">
              <button
                type="button"
                className={`type-switch-btn ${entryMode === 'expense' ? 'active-expense' : ''}`}
                onClick={() => handleModeChange('expense')}
              >
                <ArrowDownRight size={16} /> Registrar Gasto / Salida (-)
              </button>
              <button
                type="button"
                className={`type-switch-btn ${entryMode === 'income' ? 'active-income' : ''}`}
                onClick={() => handleModeChange('income')}
              >
                <ArrowUpRight size={16} /> Registrar Ingreso Extra (+)
              </button>
            </div>

            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => setShowNoteField((v) => !v)}
            >
              {showNoteField ? 'Ocultar nota' : '+ Añadir nota consciente'}
            </button>
          </div>

          <button
            type="button"
            className="btn btn-sm btn-cyan"
            onClick={onOpenAdjustModal}
          >
            <SlidersHorizontal size={14} /> Ajustar Dinero General (+/-)
          </button>
        </div>

        <form onSubmit={handleSubmitEntry}>
          <div className="composer-grid">
            <div>
              <label className="field-label">Concepto / Descripción</label>
              <input
                type="text"
                required
                className="neon-input"
                placeholder={
                  entryMode === 'income'
                    ? 'Ej. Pago extra, bono, venta, reembolso...'
                    : 'Ej. Supermercado, cuota tarjeta, aporte ETF, salida...'
                }
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
              />
            </div>

            <div>
              <label className="field-label">Monto ({currencySymbol})</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                className="neon-input mono-input"
                placeholder="0.00"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
              />
            </div>

            {entryMode === 'expense' ? (
              <div>
                <label className="field-label">Parte / Sobre</label>
                <select
                  className="neon-select"
                  value={division}
                  onChange={(e) => handleDivisionChange(e.target.value)}
                >
                  <option value="hogar">Gastos del Hogar</option>
                  <option value="deudas">Deudas</option>
                  {month.hasManutenciones && (
                    <option value="manutenciones">Manutenciones</option>
                  )}
                  <option value="inversiones">Inversiones</option>
                  <option value="bolsillo">Dinero de Bolsillo</option>
                  {month.allocations.customEnvelopes.map((ce) => (
                    <option key={ce.id} value={ce.id}>
                      {ce.name}
                    </option>
                  ))}
                  <option value="general">Dinero General (Directo)</option>
                </select>
              </div>
            ) : (
              <div>
                <label className="field-label">Destino</label>
                <input
                  type="text"
                  disabled
                  className="neon-input"
                  value="Suma al Dinero General (+)"
                />
              </div>
            )}

            {entryMode === 'expense' && division === 'inversiones' ? (
              <div>
                <label className="field-label">¿Cuál Inversión?</label>
                {investments.length > 0 ? (
                  <select
                    className="neon-select"
                    value={investmentId}
                    onChange={(e) => setInvestmentId(e.target.value)}
                  >
                    {investments.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.name} {!inv.active ? '(Archivada)' : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <button
                    type="button"
                    className="btn btn-violet"
                    style={{ width: '100%' }}
                    onClick={() => onNavigateTab('investments')}
                  >
                    + Definir Inversiones
                  </button>
                )}
              </div>
            ) : (
              <div>
                <label className="field-label">Pilar Kakeibo</label>
                <select
                  className="neon-select"
                  value={entryMode === 'income' ? 'ingreso' : pillar}
                  disabled={entryMode === 'income'}
                  onChange={(e) => setPillar(e.target.value as KakeiboPillar)}
                >
                  <option value="supervivencia">必需 · Necesidad / Supervivencia</option>
                  <option value="opcional">娯楽 · Gusto / Opcional</option>
                  <option value="cultura">教養 · Cultura / Salud / Mejora</option>
                  <option value="patrimonio">資産 · Patrimonio / Deuda</option>
                  <option value="imprevisto">特別 · Extra / Imprevisto</option>
                  {entryMode === 'income' && <option value="ingreso">収入 · Entrada</option>}
                </select>
              </div>
            )}

            <div>
              <label className="field-label">Fecha</label>
              <input
                type="date"
                className="neon-input mono-input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <div>
              <button
                type="submit"
                disabled={submitting}
                className={`btn ${entryMode === 'income' ? 'btn-emerald' : 'btn-magenta'}`}
                style={{ height: '40px', width: '100%' }}
              >
                <Plus size={16} />
                {entryMode === 'income' ? 'Sumar' : 'Anotar'}
              </button>
            </div>
          </div>

          {showNoteField && (
            <div style={{ marginTop: '12px' }}>
              <label className="field-label">
                Nota reflexiva Kakeibo (¿Fue planeado, emocional o indispensable?)
              </label>
              <input
                type="text"
                className="neon-input"
                placeholder="Escribe un detalle o reflexión breve para recordar este movimiento..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          )}
        </form>
      </div>

      {/* Main Asian Running-Balance Ledger Book */}
      <div className="ledger-book">
        <div className="ledger-book-header">
          <div className="ledger-book-title">
            <BookOpen size={19} className="text-cyan" />
            <div>
              <h3>
                Libreta de Movimientos del Mes{' '}
                <span className="asian-chip" style={{ marginLeft: '6px' }}>
                  出納帳 · 입출금장부 · 收支记账
                </span>
              </h3>
              <div style={{ fontSize: '0.77rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Cada entrada o salida actualiza tu Saldo General en tiempo real renglón por renglón.
              </div>
            </div>
          </div>

          <div className="ledger-filters">
            <div style={{ position: 'relative', minWidth: '190px' }}>
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  left: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                }}
              />
              <input
                type="text"
                className="neon-input"
                style={{ paddingLeft: '30px', paddingTop: '6px', paddingBottom: '6px', fontSize: '0.82rem' }}
                placeholder="Buscar concepto..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <select
              className="neon-select"
              style={{ width: 'auto', paddingTop: '6px', paddingBottom: '6px', fontSize: '0.82rem' }}
              value={filterDivision}
              onChange={(e) => setFilterDivision(e.target.value)}
            >
              <option value="all">Todos los sobres ({month.entries.length})</option>
              <option value="hogar">Gastos del Hogar</option>
              <option value="deudas">Deudas</option>
              {month.hasManutenciones && <option value="manutenciones">Manutenciones</option>}
              <option value="inversiones">Inversiones</option>
              <option value="bolsillo">Dinero de Bolsillo</option>
              <option value="general">Dinero General / Ingresos</option>
            </select>

            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => setOrderAsc((prev) => !prev)}
              title="Cambiar orden cronológico"
            >
              <ArrowUpDown size={14} />
              {orderAsc ? 'Orden Libreta ↑' : 'Recientes ↓'}
            </button>
          </div>
        </div>

        <div className="ledger-table-wrap">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Concepto y Conciencia</th>
                <th>Sobre / Destino</th>
                <th className="num-col">Entrada (+)</th>
                <th className="num-col">Salida (-)</th>
                <th className="num-col">Saldo General (残高)</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {orderAsc && filterDivision === 'all' && !searchQuery.trim() && (
                <tr className="ledger-opening-row">
                  <td className="mono" style={{ color: 'var(--text-secondary)' }}>
                    01 {formatShortDate(`${month.monthKey}-01`).split(' ')[1]}
                  </td>
                  <td>
                    <strong>Apertura de Mes</strong>{' '}
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                      (Salario: {formatMoney(summary.salary, currencySymbol)}
                      {summary.carryover !== 0
                        ? ` · Inicial: ${formatMoney(summary.carryover, currencySymbol, true)}`
                        : ''}
                      )
                    </span>
                  </td>
                  <td>
                    <span className="div-badge div-cyan">Fondo Base</span>
                  </td>
                  <td className="num-col text-cyan">
                    {formatMoney(summary.openingBalance, currencySymbol)}
                  </td>
                  <td className="num-col" style={{ color: 'var(--text-muted)' }}>
                    —
                  </td>
                  <td className="num-col text-cyan" style={{ fontWeight: 700 }}>
                    {formatMoney(summary.openingBalance, currencySymbol)}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => onNavigateTab('envelopes')}
                    >
                      Editar base
                    </button>
                  </td>
                </tr>
              )}

              {visibleEntries.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">
                      <p style={{ margin: '0 0 6px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        No hay movimientos anotados con este filtro en la libreta.
                      </p>
                      <p style={{ margin: 0, fontSize: '0.84rem' }}>
                        Usa el formulario superior para anotar cada gasto, pago, aporte de inversión
                        o ingreso adicional.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                visibleEntries.map((row) => {
                  const isPos = row.signedAmount > 0;
                  const pillarInfo = KAKEIBO_PILLARS[row.pillar] || KAKEIBO_PILLARS.supervivencia;
                  const invLabel =
                    row.division === 'inversiones' && row.investmentId
                      ? invNameMap.get(row.investmentId)
                      : undefined;

                  return (
                    <tr key={row.id}>
                      <td className="mono" style={{ whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                        {formatShortDate(row.date)}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {row.concept}
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            marginTop: '4px',
                            flexWrap: 'wrap',
                          }}
                        >
                          <span className="pillar-badge">
                            {pillarInfo.asianTag} · {pillarInfo.label}
                          </span>
                          {row.note && (
                            <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                              “{row.note}”
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={`div-badge ${getDivisionColorClass(row.division)}`}>
                          {getDivisionLabel(row.division, month.allocations.customEnvelopes)}
                          {invLabel ? ` → ${invLabel}` : ''}
                        </span>
                      </td>
                      <td className="num-col text-emerald" style={{ fontWeight: isPos ? 700 : 400 }}>
                        {isPos ? formatMoney(row.amount, currencySymbol, true) : '—'}
                      </td>
                      <td className="num-col text-magenta" style={{ fontWeight: !isPos ? 700 : 400 }}>
                        {!isPos ? `-${formatMoney(row.amount, currencySymbol)}` : '—'}
                      </td>
                      <td
                        className={`num-col ${
                          row.runningBalance < 0 ? 'text-magenta' : 'text-cyan'
                        }`}
                        style={{ fontWeight: 700 }}
                      >
                        {formatMoney(row.runningBalance, currencySymbol)}
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          className="icon-btn"
                          title="Editar asiento"
                          onClick={() => startEdit(row)}
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn danger"
                          title="Eliminar asiento"
                          onClick={() => onDeleteEntry(row.id)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom Kakeibo Weekly Rhythm & Reflection */}
      <div className="two-col-grid">
        <div className="neon-card">
          <div className="kpi-header">
            <span className="kpi-label">
              Ritmo Semanal Kakeibo <span className="asian-chip">週間集計</span>
            </span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Control por semanas del mes
            </span>
          </div>

          <div className="weeks-grid">
            {summary.weeklyBreakdown.map((w) => {
              const expPct = Math.min(100, Math.round((w.expense / maxWeekExpense) * 100));
              return (
                <div key={w.weekNumber} className="week-box">
                  <div className="week-box-title">{w.label}</div>
                  <div className="week-box-range">{w.rangeLabel}</div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--neon-emerald)' }} className="mono">
                    +{formatMoney(w.income, currencySymbol)}
                  </div>
                  <div
                    style={{
                      fontSize: '0.84rem',
                      fontWeight: 700,
                      color: w.expense > 0 ? 'var(--neon-magenta)' : 'var(--text-muted)',
                      margin: '2px 0 8px',
                    }}
                    className="mono"
                  >
                    -{formatMoney(w.expense, currencySymbol)}
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill fill-magenta" style={{ width: `${expPct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: '18px', paddingTop: '14px', borderTop: '1px solid var(--border-subtle)' }}>
            <div className="kpi-label" style={{ marginBottom: '10px' }}>
              Balance por Naturaleza del Gasto (4 Pilares Kakeibo + Patrimonio)
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '10px',
              }}
            >
              {(['supervivencia', 'patrimonio', 'opcional', 'cultura', 'imprevisto'] as KakeiboPillar[]).map(
                (pk) => (
                  <div
                    key={pk}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '8px',
                      background: 'rgba(8, 12, 23, 0.7)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                      {KAKEIBO_PILLARS[pk].asianTag} · {KAKEIBO_PILLARS[pk].label}
                    </div>
                    <div className="mono" style={{ fontWeight: 700, marginTop: '3px', fontSize: '0.92rem' }}>
                      {formatMoney(summary.pillarTotals[pk] || 0, currencySymbol)}
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        </div>

        <div className="neon-card card-violet">
          <div className="kpi-header">
            <span className="kpi-label">
              <Sparkles size={15} className="text-violet" /> Reflexión Mensual Kakeibo{' '}
              <span className="asian-chip">振り返り</span>
            </span>
          </div>
          <p style={{ margin: '0 0 12px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            En Japón y Corea, toda libreta cierra con tus metas y aprendizajes del mes para tomar
            mejores decisiones con tu dinero.
          </p>

          <form
            onSubmit={handleSaveReflectionForm}
            style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
          >
            <div>
              <label className="field-label">Propósito / Meta financiera de este mes</label>
              <input
                type="text"
                className="neon-input"
                placeholder="Ej. Cumplir mis inversiones sin tocar el fondo de hogar..."
                value={howMuchCanISave}
                onChange={(e) => setHowMuchCanISave(e.target.value)}
              />
            </div>

            <div>
              <label className="field-label">¿Qué puedo optimizar para el próximo mes?</label>
              <textarea
                rows={2}
                className="neon-textarea"
                placeholder="Ej. Reducir gastos hormiga de fin de semana, adelantar cuota..."
                value={improvementPlan}
                onChange={(e) => setImprovementPlan(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
              <select
                className="neon-select"
                style={{ width: 'auto', minWidth: '180px' }}
                value={mood}
                onChange={(e) => setMood(e.target.value as MonthRecord['reflection']['mood'])}
              >
                <option value="">Estado del mes: Sin calificar</option>
                <option value="excelente">Estado: Mes Excelente</option>
                <option value="estable">Estado: Mes Estable</option>
                <option value="ajustado">Estado: Mes Ajustado</option>
                <option value="critico">Estado: Mes Crítico</option>
              </select>

              <button type="submit" className="btn btn-violet btn-sm" disabled={savingReflection}>
                <Check size={14} />
                {savingReflection ? 'Guardando...' : 'Guardar Reflexión'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Edit Entry Modal */}
      {editingEntry && (
        <div className="modal-backdrop" onClick={() => setEditingEntry(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Editar Movimiento de la Libreta</h3>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setEditingEntry(null)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={saveEdit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label className="field-label">Concepto</label>
                <input
                  type="text"
                  required
                  className="neon-input"
                  value={editConcept}
                  onChange={(e) => setEditConcept(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="field-label">Monto ({currencySymbol})</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    className="neon-input mono-input"
                    value={editAmountStr}
                    onChange={(e) => setEditAmountStr(e.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label">Fecha</label>
                  <input
                    type="date"
                    className="neon-input mono-input"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                  />
                </div>
              </div>

              {editingEntry.type === 'expense' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label className="field-label">Sobre / División</label>
                    <select
                      className="neon-select"
                      value={editDivision}
                      onChange={(e) => setEditDivision(e.target.value)}
                    >
                      <option value="hogar">Gastos del Hogar</option>
                      <option value="deudas">Deudas</option>
                      <option value="manutenciones">Manutenciones</option>
                      <option value="inversiones">Inversiones</option>
                      <option value="bolsillo">Dinero de Bolsillo</option>
                      {month.allocations.customEnvelopes.map((ce) => (
                        <option key={ce.id} value={ce.id}>
                          {ce.name}
                        </option>
                      ))}
                      <option value="general">Dinero General</option>
                    </select>
                  </div>

                  {editDivision === 'inversiones' ? (
                    <div>
                      <label className="field-label">Inversión</label>
                      <select
                        className="neon-select"
                        value={editInvestmentId}
                        onChange={(e) => setEditInvestmentId(e.target.value)}
                      >
                        <option value="">Seleccionar...</option>
                        {investments.map((inv) => (
                          <option key={inv.id} value={inv.id}>
                            {inv.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="field-label">Pilar Kakeibo</label>
                      <select
                        className="neon-select"
                        value={editPillar}
                        onChange={(e) => setEditPillar(e.target.value as KakeiboPillar)}
                      >
                        <option value="supervivencia">必需 · Necesidad</option>
                        <option value="opcional">娯楽 · Gusto</option>
                        <option value="cultura">教養 · Cultura</option>
                        <option value="patrimonio">資産 · Patrimonio</option>
                        <option value="imprevisto">特別 · Imprevisto</option>
                      </select>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="field-label">Nota</label>
                <input
                  type="text"
                  className="neon-input"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setEditingEntry(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-cyan">
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
