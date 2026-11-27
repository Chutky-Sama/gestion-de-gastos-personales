import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpDown,
  ArrowUpRight,
  Banknote,
  BookOpen,
  Calendar,
  Check,
  Edit3,
  Grid,
  Percent,
  Plus,
  Search,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  MonthComputedSummary,
  getTodayDateString,
  round2,
} from '../../shared/calculations';
import {
  HogarCategoryDef,
  findHogarCategory,
  getAllHogarCategories,
} from '../../shared/hogarCategories';
import {
  EntryType,
  InvestmentDefinition,
  KakeiboPillar,
  LedgerEntry,
  MonthRecord,
  PaymentMethod,
  TransferDirection,
} from '../../shared/types';
import {
  KAKEIBO_PILLARS,
  formatMoney,
  formatShortDate,
  getDivisionColorClass,
  getDivisionLabel,
} from '../utils/format';
import { HogarCategoryIcon } from './HogarCategoryIcon';

interface LedgerTabProps {
  month: MonthRecord;
  summary: MonthComputedSummary;
  investments: InvestmentDefinition[];
  customHogarCategories: HogarCategoryDef[];
  selectedDayFilter: string | null;
  onClearDayFilter: () => void;
  currencySymbol: string;
  currencyCode: string;
  onAddEntry: (payload: {
    date: string;
    type: EntryType;
    amount: number;
    paymentMethod: PaymentMethod;
    transferDirection?: TransferDirection;
    transferFee?: number;
    transferFeePercent?: number;
    concept: string;
    division: string;
    hogarCategoryId?: string;
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
  ) => Promise<void>;
  onDeleteEntry: (entryId: string) => Promise<void>;
  onSaveReflection: (reflection: MonthRecord['reflection']) => Promise<void>;
  onOpenAdjustModal: () => void;
  onNavigateTab: (tab: 'envelopes' | 'investments' | 'reports') => void;
}

export const LedgerTab: React.FC<LedgerTabProps> = ({
  month,
  summary,
  investments,
  customHogarCategories,
  selectedDayFilter,
  onClearDayFilter,
  currencySymbol,
  currencyCode,
  onAddEntry,
  onUpdateEntry,
  onDeleteEntry,
  onSaveReflection,
  onOpenAdjustModal,
  onNavigateTab,
}) => {
  const allHogarCategories = useMemo(
    () => getAllHogarCategories(customHogarCategories),
    [customHogarCategories]
  );

  const defaultDateForMonth = useMemo(() => {
    if (selectedDayFilter && selectedDayFilter.startsWith(month.monthKey)) {
      return selectedDayFilter;
    }
    const today = getTodayDateString();
    if (today.startsWith(month.monthKey)) return today;
    return `${month.monthKey}-01`;
  }, [month.monthKey, selectedDayFilter]);

  const [entryMode, setEntryMode] = useState<'expense' | 'income' | 'channel_transfer'>('expense');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('efectivo');
  const [transferDirection, setTransferDirection] =
    useState<TransferDirection>('transf_to_cash');

  // Improvement #1: Commission % vs Fixed Amount ($)
  const [feeInputMode, setFeeInputMode] = useState<'percent' | 'fixed'>('percent');
  const [transferFeeStr, setTransferFeeStr] = useState('');

  const [concept, setConcept] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [division, setDivision] = useState<string>('hogar');
  const [hogarCategoryId, setHogarCategoryId] = useState<string>('alimentos');
  const [showHogarGrid, setShowHogarGrid] = useState<boolean>(true);
  const [investmentId, setInvestmentId] = useState<string>('');
  const [pillar, setPillar] = useState<KakeiboPillar>('supervivencia');
  const [date, setDate] = useState<string>(defaultDateForMonth);
  const [note, setNote] = useState<string>('');
  const [showNoteField, setShowNoteField] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterDivision, setFilterDivision] = useState('all');
  const [filterChannel, setFilterChannel] = useState<'all' | 'efectivo' | 'transferencia'>('all');
  const [orderAsc, setOrderAsc] = useState(true);

  // Edit Modal State
  const [editingEntry, setEditingEntry] = useState<LedgerEntry | null>(null);
  const [editConcept, setEditConcept] = useState('');
  const [editAmountStr, setEditAmountStr] = useState('');
  const [editPaymentMethod, setEditPaymentMethod] = useState<PaymentMethod>('efectivo');
  const [editTransferDirection, setEditTransferDirection] =
    useState<TransferDirection>('transf_to_cash');
  const [editFeeMode, setEditFeeMode] = useState<'percent' | 'fixed'>('percent');
  const [editFeeStr, setEditFeeStr] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editDivision, setEditDivision] = useState('');
  const [editHogarCategoryId, setEditHogarCategoryId] = useState('');
  const [editInvestmentId, setEditInvestmentId] = useState('');
  const [editPillar, setEditPillar] = useState<KakeiboPillar>('supervivencia');
  const [editNote, setEditNote] = useState('');

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

  const activeInvestments = useMemo(() => investments.filter((i) => i.active), [investments]);

  useEffect(() => {
    if (division === 'inversiones' && !investmentId && activeInvestments.length > 0) {
      setInvestmentId(activeInvestments[0].id);
    }
  }, [division, investmentId, activeInvestments]);

  const handleModeChange = (nextMode: 'expense' | 'income' | 'channel_transfer') => {
    setEntryMode(nextMode);
    if (nextMode === 'income') {
      setDivision('general');
      setPillar('ingreso');
    } else if (nextMode === 'channel_transfer') {
      setDivision('bolsillo');
      setPillar('traspaso');
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

  const handleSelectHogarCatInComposer = (cat: HogarCategoryDef) => {
    const prevCat = findHogarCategory(hogarCategoryId, customHogarCategories);
    setHogarCategoryId(cat.id);
    if (!concept.trim() || (prevCat && concept.trim() === prevCat.name)) {
      setConcept(cat.name);
    }
  };

  // Live calculation for channel_transfer with % or fixed commission
  const transferCalc = useMemo(() => {
    const amt = Math.max(0, parseFloat(amountStr) || 0);
    const rawFee = Math.max(0, parseFloat(transferFeeStr) || 0);
    const feeAmt =
      feeInputMode === 'percent' ? round2((amt * rawFee) / 100) : round2(rawFee);
    const feePct =
      feeInputMode === 'percent'
        ? round2(rawFee)
        : amt > 0
        ? round2((feeAmt / amt) * 100)
        : 0;
    const netReceived = round2(Math.max(0, amt - feeAmt));
    return { amt, feeAmt, feePct, netReceived };
  }, [amountStr, transferFeeStr, feeInputMode]);

  const handleSubmitEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    const numeric = parseFloat(amountStr);
    if (Number.isNaN(numeric) || numeric <= 0) return;

    const selectedCat = findHogarCategory(hogarCategoryId, customHogarCategories);
    const defaultConcept =
      entryMode === 'channel_transfer'
        ? transferDirection === 'transf_to_cash'
          ? 'Extracción / Cambio de Transferencia a Efectivo'
          : 'Depósito / Paso de Efectivo a Transferencia'
        : entryMode === 'expense' && division === 'hogar' && selectedCat
        ? selectedCat.name
        : '';

    const finalConcept = concept.trim() || defaultConcept;
    if (!finalConcept) return;

    setSubmitting(true);
    try {
      await onAddEntry({
        date,
        type: entryMode,
        amount: numeric,
        paymentMethod,
        transferDirection: entryMode === 'channel_transfer' ? transferDirection : undefined,
        transferFee: entryMode === 'channel_transfer' ? transferCalc.feeAmt : undefined,
        transferFeePercent:
          entryMode === 'channel_transfer' && transferCalc.feePct > 0
            ? transferCalc.feePct
            : undefined,
        concept: finalConcept,
        division:
          entryMode === 'income'
            ? 'general'
            : entryMode === 'channel_transfer'
            ? 'bolsillo'
            : division,
        hogarCategoryId:
          entryMode === 'expense' && division === 'hogar' ? hogarCategoryId : undefined,
        investmentId:
          entryMode === 'expense' && division === 'inversiones'
            ? investmentId || undefined
            : undefined,
        pillar:
          entryMode === 'income'
            ? 'ingreso'
            : entryMode === 'channel_transfer'
            ? 'traspaso'
            : pillar,
        note: note.trim() || undefined,
      });
      setConcept('');
      setAmountStr('');
      setTransferFeeStr('');
      setNote('');
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (entry: LedgerEntry) => {
    setEditingEntry(entry);
    setEditConcept(entry.concept);
    setEditAmountStr(String(entry.amount));
    setEditPaymentMethod(entry.paymentMethod || 'efectivo');
    setEditTransferDirection(entry.transferDirection || 'transf_to_cash');
    if (entry.transferFeePercent && entry.transferFeePercent > 0) {
      setEditFeeMode('percent');
      setEditFeeStr(String(entry.transferFeePercent));
    } else if (entry.transferFee && entry.transferFee > 0) {
      setEditFeeMode('fixed');
      setEditFeeStr(String(entry.transferFee));
    } else {
      setEditFeeMode('percent');
      setEditFeeStr('');
    }
    setEditDate(entry.date);
    setEditDivision(entry.division);
    setEditHogarCategoryId(entry.hogarCategoryId || '');
    setEditInvestmentId(entry.investmentId || '');
    setEditPillar(entry.pillar);
    setEditNote(entry.note || '');
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry) return;
    const numeric = parseFloat(editAmountStr);
    if (Number.isNaN(numeric) || numeric <= 0) return;

    let nextFeeAmt: number | undefined;
    let nextFeePct: number | undefined;
    if (editingEntry.type === 'channel_transfer') {
      const rawFee = Math.max(0, parseFloat(editFeeStr) || 0);
      nextFeeAmt =
        editFeeMode === 'percent' ? round2((numeric * rawFee) / 100) : round2(rawFee);
      nextFeePct =
        editFeeMode === 'percent'
          ? round2(rawFee)
          : numeric > 0
          ? round2((nextFeeAmt / numeric) * 100)
          : 0;
    }

    await onUpdateEntry(editingEntry.id, {
      concept: editConcept.trim() || editingEntry.concept,
      amount: numeric,
      paymentMethod: editPaymentMethod,
      transferDirection:
        editingEntry.type === 'channel_transfer' ? editTransferDirection : undefined,
      transferFee: nextFeeAmt,
      transferFeePercent: nextFeePct,
      date: editDate,
      division: editDivision,
      hogarCategoryId: editDivision === 'hogar' ? editHogarCategoryId || undefined : undefined,
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
      if (selectedDayFilter && row.date !== selectedDayFilter) return false;
      if (filterDivision !== 'all' && row.division !== filterDivision) return false;
      if (filterChannel !== 'all') {
        if (row.type !== 'channel_transfer' && row.paymentMethod !== filterChannel) {
          return false;
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const invName = row.investmentId ? invNameMap.get(row.investmentId) || '' : '';
        const catObj = findHogarCategory(row.hogarCategoryId, customHogarCategories);
        return (
          row.concept.toLowerCase().includes(q) ||
          (row.note || '').toLowerCase().includes(q) ||
          invName.toLowerCase().includes(q) ||
          (catObj?.name.toLowerCase().includes(q) ?? false)
        );
      }
      return true;
    });
  }, [
    summary,
    orderAsc,
    selectedDayFilter,
    filterDivision,
    filterChannel,
    searchQuery,
    invNameMap,
    customHogarCategories,
  ]);

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

  const activeHogarCat = findHogarCategory(hogarCategoryId, customHogarCategories);

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
              {env.spent > 0 && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.69rem',
                    color: 'var(--text-muted)',
                  }}
                  className="mono"
                >
                  <span>Efec: {formatMoney(env.spentEfectivo, currencySymbol)}</span>
                  <span>Transf: {formatMoney(env.spentTransferencia, currencySymbol)}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Quick Entry Composer with Parallel Efectivo / Transferencia + % Fee + Mis Gastos Grid */}
      <div className="composer-panel">
        <div className="composer-top">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div className="type-switch">
              <button
                type="button"
                className={`type-switch-btn ${entryMode === 'expense' ? 'active-expense' : ''}`}
                onClick={() => handleModeChange('expense')}
              >
                <ArrowDownRight size={15} /> Gasto (-)
              </button>
              <button
                type="button"
                className={`type-switch-btn ${entryMode === 'income' ? 'active-income' : ''}`}
                onClick={() => handleModeChange('income')}
              >
                <ArrowUpRight size={15} /> Ingreso (+)
              </button>
              <button
                type="button"
                className={`type-switch-btn ${
                  entryMode === 'channel_transfer' ? 'active-transfer' : ''
                }`}
                onClick={() => handleModeChange('channel_transfer')}
              >
                <ArrowLeftRight size={15} /> Pasar Efectivo ⇄ Transf.
              </button>
            </div>

            {entryMode !== 'channel_transfer' && (
              <div className="type-switch" title="Elige si fue en Efectivo o por Transferencia">
                <button
                  type="button"
                  className={`type-switch-btn ${
                    paymentMethod === 'efectivo' ? 'active-income' : ''
                  }`}
                  onClick={() => setPaymentMethod('efectivo')}
                >
                  <Banknote size={15} /> Efectivo
                </button>
                <button
                  type="button"
                  className={`type-switch-btn ${
                    paymentMethod === 'transferencia' ? 'active-transfer' : ''
                  }`}
                  onClick={() => setPaymentMethod('transferencia')}
                >
                  <Smartphone size={15} /> Transferencia
                </button>
              </div>
            )}

            {entryMode === 'expense' && division === 'hogar' && (
              <button
                type="button"
                className={`btn btn-sm ${showHogarGrid ? 'btn-cyan' : 'btn-ghost'}`}
                onClick={() => setShowHogarGrid((v) => !v)}
              >
                <Grid size={14} />
                {showHogarGrid ? 'Ocultar Íconos Hogar' : 'Elegir Ícono Hogar'}
              </button>
            )}

            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => setShowNoteField((v) => !v)}
            >
              {showNoteField ? 'Ocultar nota' : '+ Nota'}
            </button>
          </div>

          <button type="button" className="btn btn-sm btn-cyan" onClick={onOpenAdjustModal}>
            <SlidersHorizontal size={14} /> Ajustar Efectivo / Transf.
          </button>
        </div>

        <form onSubmit={handleSubmitEntry}>
          {entryMode === 'channel_transfer' ? (
            <div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.5fr 1fr 1.25fr 1.4fr 0.95fr auto',
                  gap: '12px',
                  alignItems: 'end',
                }}
                className="composer-transfer-grid"
              >
                <div>
                  <label className="field-label">Dirección del cambio</label>
                  <select
                    className="neon-select"
                    value={transferDirection}
                    onChange={(e) => setTransferDirection(e.target.value as TransferDirection)}
                  >
                    <option value="transf_to_cash">
                      Transferencia → Efectivo (Caja Extra / Cambio)
                    </option>
                    <option value="cash_to_transf">
                      Efectivo → Transferencia (Depósito / Tarjeta)
                    </option>
                  </select>
                </div>

                <div>
                  <label className="field-label">Monto que sale ({currencySymbol})</label>
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

                {/* Improvement #1: Commission with % or $ toggle */}
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '6px',
                    }}
                  >
                    <label className="field-label" style={{ marginBottom: 0 }}>
                      Comisión ({feeInputMode === 'percent' ? '%' : currencySymbol})
                    </label>
                    <div className="mini-fee-toggle">
                      <button
                        type="button"
                        className={feeInputMode === 'percent' ? 'active' : ''}
                        onClick={() => setFeeInputMode('percent')}
                        title="Calcular comisión por porcentaje (%)"
                      >
                        %
                      </button>
                      <button
                        type="button"
                        className={feeInputMode === 'fixed' ? 'active' : ''}
                        onClick={() => setFeeInputMode('fixed')}
                        title="Ingresar comisión como monto fijo"
                      >
                        {currencySymbol}
                      </button>
                    </div>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="neon-input mono-input"
                    placeholder={feeInputMode === 'percent' ? 'Ej. 10 (%)' : '0.00'}
                    value={transferFeeStr}
                    onChange={(e) => setTransferFeeStr(e.target.value)}
                  />
                </div>

                <div>
                  <label className="field-label">Detalle (opcional)</label>
                  <input
                    type="text"
                    className="neon-input"
                    placeholder="Ej. Caja Extra, cambio al 10%..."
                    value={concept}
                    onChange={(e) => setConcept(e.target.value)}
                  />
                </div>

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
                    className="btn btn-cyan"
                    style={{ height: '40px', width: '100%' }}
                  >
                    <ArrowLeftRight size={15} /> Pasar
                  </button>
                </div>
              </div>

              {/* Live % Commission Calculation Preview Bar */}
              {transferCalc.amt > 0 && (
                <div
                  style={{
                    marginTop: '10px',
                    padding: '9px 14px',
                    borderRadius: '9px',
                    background: 'rgba(0, 240, 255, 0.06)',
                    border: '1px solid rgba(0, 240, 255, 0.25)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '12px',
                    fontSize: '0.82rem',
                  }}
                >
                  <span>
                    Sale de{' '}
                    <strong>
                      {transferDirection === 'transf_to_cash' ? 'Transferencia' : 'Efectivo'}
                    </strong>
                    :{' '}
                    <strong className="mono">
                      -{formatMoney(transferCalc.amt, currencySymbol)}
                    </strong>
                  </span>
                  <span>
                    <Percent size={13} style={{ verticalAlign: 'middle', marginRight: '3px' }} />
                    Comisión ({transferCalc.feePct}%):{' '}
                    <strong className="mono text-magenta">
                      -{formatMoney(transferCalc.feeAmt, currencySymbol)}
                    </strong>
                  </span>
                  <span>
                    Recibes neto en{' '}
                    <strong>
                      {transferDirection === 'transf_to_cash' ? 'Efectivo' : 'Transferencia'}
                    </strong>
                    :{' '}
                    <strong className="mono text-emerald" style={{ fontSize: '0.95rem' }}>
                      +{formatMoney(transferCalc.netReceived, currencySymbol)}
                    </strong>
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="composer-grid">
                <div>
                  <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {entryMode === 'expense' && division === 'hogar' && activeHogarCat && (
                      <HogarCategoryIcon
                        iconKey={activeHogarCat.iconKey}
                        size={14}
                        color={activeHogarCat.color}
                      />
                    )}
                    Concepto ({paymentMethod === 'efectivo' ? 'En Efectivo' : 'Por Transferencia'})
                  </label>
                  <input
                    type="text"
                    className="neon-input"
                    placeholder={
                      entryMode === 'income'
                        ? 'Ej. Pago recibido, bono, venta...'
                        : division === 'hogar' && activeHogarCat
                        ? `${activeHogarCat.name} (o escribe detalle)...`
                        : 'Detalle del gasto...'
                    }
                    required={!(entryMode === 'expense' && division === 'hogar' && activeHogarCat)}
                    value={concept}
                    onChange={(e) => setConcept(e.target.value)}
                  />
                </div>

                <div>
                  <label className="field-label">
                    Monto ({currencySymbol} {currencyCode})
                  </label>
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
                    <label className="field-label">Se suma a</label>
                    <input
                      type="text"
                      disabled
                      className="neon-input"
                      value={
                        paymentMethod === 'efectivo'
                          ? 'Saldo en Efectivo (+)'
                          : 'Saldo en Transferencia (+)'
                      }
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

              {/* "MIS GASTOS" STYLE ICON SELECTOR FOR GASTOS DEL HOGAR */}
              {entryMode === 'expense' && division === 'hogar' && showHogarGrid && (
                <div
                  style={{
                    marginTop: '14px',
                    paddingTop: '12px',
                    borderTop: '1px solid var(--border-subtle)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '10px',
                    }}
                  >
                    <span className="field-label" style={{ marginBottom: 0 }}>
                      Categoría de Gastos del Hogar:{' '}
                      <strong style={{ color: activeHogarCat?.color || 'var(--neon-cyan)' }}>
                        {activeHogarCat?.name || 'General'}
                      </strong>
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                      onClick={() => onNavigateTab('envelopes')}
                    >
                      + Personalizar íconos en Sobres
                    </button>
                  </div>

                  <div className="mis-gastos-grid compact">
                    {allHogarCategories.map((cat) => {
                      const isSelected = hogarCategoryId === cat.id;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          className={`mis-gastos-item ${isSelected ? 'selected' : ''}`}
                          onClick={() => handleSelectHogarCatInComposer(cat)}
                          style={
                            isSelected
                              ? ({ '--cat-accent': cat.color } as React.CSSProperties)
                              : undefined
                          }
                        >
                          <div className="mis-gastos-circle">
                            <HogarCategoryIcon
                              iconKey={cat.iconKey}
                              size={18}
                              color={isSelected ? cat.color : undefined}
                            />
                          </div>
                          <span className="mis-gastos-label">{cat.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {showNoteField && (
            <div style={{ marginTop: '12px' }}>
              <label className="field-label">Nota adicional</label>
              <input
                type="text"
                className="neon-input"
                placeholder="Detalle opcional..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          )}
        </form>
      </div>

      {/* Selected Day Banner if Calendar Day Filter is active */}
      {selectedDayFilter && (
        <div
          style={{
            marginBottom: '14px',
            padding: '10px 16px',
            borderRadius: '10px',
            background: 'rgba(0, 240, 255, 0.09)',
            border: '1px solid rgba(0, 240, 255, 0.4)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '0.86rem' }}>
            <Calendar size={16} className="text-cyan" />
            Mostrando movimientos del día <strong>{formatShortDate(selectedDayFilter)}</strong> (
            {visibleEntries.length} movimiento{visibleEntries.length === 1 ? '' : 's'})
          </span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClearDayFilter}>
            Ver todo el mes completo
          </button>
        </div>
      )}

      {/* Main Parallel Running-Balance Ledger Book */}
      <div className="ledger-book">
        <div className="ledger-book-header">
          <div className="ledger-book-title">
            <BookOpen size={19} className="text-cyan" />
            <div>
              <h3>
                Libreta en Paralelo ({currencyCode}): Efectivo + Transferencia{' '}
                <span className="asian-chip" style={{ marginLeft: '6px' }}>
                  出納帳 · 입출금장부 · 收支记账
                </span>
              </h3>
              <div style={{ fontSize: '0.77rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Control simultáneo renglón por renglón de tus billetes en Efectivo, tu saldo en
                Transferencia y tu Total General.
              </div>
            </div>
          </div>

          <div className="ledger-filters">
            <div style={{ position: 'relative', minWidth: '170px' }}>
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
                style={{
                  paddingLeft: '30px',
                  paddingTop: '6px',
                  paddingBottom: '6px',
                  fontSize: '0.8rem',
                }}
                placeholder="Buscar..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <select
              className="neon-select"
              style={{ width: 'auto', paddingTop: '6px', paddingBottom: '6px', fontSize: '0.8rem' }}
              value={filterChannel}
              onChange={(e) =>
                setFilterChannel(e.target.value as 'all' | 'efectivo' | 'transferencia')
              }
            >
              <option value="all">Efectivo + Transferencia</option>
              <option value="efectivo">Solo Efectivo</option>
              <option value="transferencia">Solo Transferencia</option>
            </select>

            <select
              className="neon-select"
              style={{ width: 'auto', paddingTop: '6px', paddingBottom: '6px', fontSize: '0.8rem' }}
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
                <th>Concepto</th>
                <th>Sobre / Categoría</th>
                <th>Vía</th>
                <th className="num-col">Monto</th>
                <th className="num-col" style={{ color: 'var(--neon-emerald)' }}>
                  Saldo Efectivo
                </th>
                <th className="num-col" style={{ color: 'var(--neon-violet)' }}>
                  Saldo Transf.
                </th>
                <th className="num-col" style={{ color: 'var(--neon-cyan)' }}>
                  Total General
                </th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {orderAsc &&
                !selectedDayFilter &&
                filterDivision === 'all' &&
                filterChannel === 'all' &&
                !searchQuery.trim() && (
                  <tr className="ledger-opening-row">
                    <td className="mono" style={{ color: 'var(--text-secondary)' }}>
                      01 {formatShortDate(`${month.monthKey}-01`).split(' ')[1]}
                    </td>
                    <td colSpan={2}>
                      <strong>Apertura de Mes ({currencyCode})</strong>{' '}
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                        (Efec: {formatMoney(summary.openingEfectivo, currencySymbol)} · Transf:{' '}
                        {formatMoney(summary.openingTransferencia, currencySymbol)})
                      </span>
                    </td>
                    <td>
                      <span className="div-badge div-cyan">Base</span>
                    </td>
                    <td className="num-col text-cyan">
                      {formatMoney(summary.openingBalance, currencySymbol)}
                    </td>
                    <td className="num-col text-emerald" style={{ fontWeight: 700 }}>
                      {formatMoney(summary.openingEfectivo, currencySymbol)}
                    </td>
                    <td className="num-col text-violet" style={{ fontWeight: 700 }}>
                      {formatMoney(summary.openingTransferencia, currencySymbol)}
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
                        Base
                      </button>
                    </td>
                  </tr>
                )}

              {visibleEntries.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <div className="empty-state">
                      <p style={{ margin: '0 0 6px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        Aún no hay movimientos registrados con este filtro en {currencyCode}.
                      </p>
                      <p style={{ margin: 0, fontSize: '0.84rem' }}>
                        Registra tus gastos, ingresos o cambios Efectivo ⇄ Transferencia arriba.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                visibleEntries.map((row) => {
                  const isTraspaso = row.type === 'channel_transfer';
                  const isPos = row.signedAmount > 0;
                  const pillarInfo = KAKEIBO_PILLARS[row.pillar] || KAKEIBO_PILLARS.supervivencia;
                  const invLabel =
                    row.division === 'inversiones' && row.investmentId
                      ? invNameMap.get(row.investmentId)
                      : undefined;
                  const hogarCat =
                    row.division === 'hogar'
                      ? findHogarCategory(row.hogarCategoryId, customHogarCategories)
                      : undefined;

                  return (
                    <tr key={row.id}>
                      <td
                        className="mono"
                        style={{ whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}
                      >
                        {formatShortDate(row.date)}
                      </td>
                      <td>
                        <div
                          style={{
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '7px',
                          }}
                        >
                          {hogarCat && (
                            <span
                              style={{
                                width: '24px',
                                height: '24px',
                                borderRadius: '50%',
                                background: 'rgba(255,255,255,0.05)',
                                border: `1px solid ${hogarCat.color}`,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}
                            >
                              <HogarCategoryIcon
                                iconKey={hogarCat.iconKey}
                                size={13}
                                color={hogarCat.color}
                              />
                            </span>
                          )}
                          <span>{row.concept}</span>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            marginTop: '3px',
                            flexWrap: 'wrap',
                          }}
                        >
                          <span className="pillar-badge">
                            {pillarInfo.asianTag} · {pillarInfo.label}
                          </span>
                          {isTraspaso && (row.transferFee || 0) > 0 && (
                            <span
                              className="pillar-badge"
                              style={{ color: 'var(--neon-magenta)' }}
                            >
                              Comisión
                              {row.transferFeePercent ? ` (${row.transferFeePercent}%)` : ''}: -
                              {formatMoney(row.transferFee || 0, currencySymbol)}
                            </span>
                          )}
                          {row.note && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                              “{row.note}”
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={`div-badge ${getDivisionColorClass(row.division)}`}>
                          {getDivisionLabel(row.division, month.allocations.customEnvelopes)}
                          {hogarCat ? ` · ${hogarCat.name}` : ''}
                          {invLabel ? ` → ${invLabel}` : ''}
                        </span>
                      </td>
                      <td>
                        {isTraspaso ? (
                          <span className="div-badge div-cyan">
                            <ArrowLeftRight size={12} />
                            {row.transferDirection === 'cash_to_transf'
                              ? 'Efec → Transf'
                              : 'Transf → Efec'}
                          </span>
                        ) : row.paymentMethod === 'transferencia' ? (
                          <span className="div-badge div-violet">
                            <Smartphone size={12} /> Transf.
                          </span>
                        ) : (
                          <span className="div-badge div-emerald">
                            <Banknote size={12} /> Efectivo
                          </span>
                        )}
                      </td>
                      <td
                        className={`num-col ${
                          isTraspaso ? 'text-cyan' : isPos ? 'text-emerald' : 'text-magenta'
                        }`}
                        style={{ fontWeight: 700 }}
                      >
                        {isTraspaso
                          ? `⇄ ${formatMoney(row.amount, currencySymbol)}`
                          : isPos
                          ? formatMoney(row.amount, currencySymbol, true)
                          : `-${formatMoney(row.amount, currencySymbol)}`}
                      </td>
                      <td
                        className={`num-col ${
                          row.runningEfectivo < 0 ? 'text-magenta' : 'text-emerald'
                        }`}
                        style={{ fontWeight: 600 }}
                      >
                        {formatMoney(row.runningEfectivo, currencySymbol)}
                      </td>
                      <td
                        className={`num-col ${
                          row.runningTransferencia < 0 ? 'text-magenta' : 'text-violet'
                        }`}
                        style={{ fontWeight: 600 }}
                      >
                        {formatMoney(row.runningTransferencia, currencySymbol)}
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
                          title="Editar movimiento"
                          onClick={() => startEdit(row)}
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn danger"
                          title="Eliminar movimiento"
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
              Ritmo Semanal Kakeibo ({currencyCode}) <span className="asian-chip">週間集計</span>
            </span>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => onNavigateTab('reports')}
            >
              Ver Informes y Gráficos →
            </button>
          </div>

          <div className="weeks-grid">
            {summary.weeklyBreakdown.map((w) => {
              const expPct = Math.min(100, Math.round((w.expense / maxWeekExpense) * 100));
              return (
                <div key={w.weekNumber} className="week-box">
                  <div className="week-box-title">{w.label}</div>
                  <div className="week-box-range">{w.rangeLabel}</div>
                  <div
                    style={{ fontSize: '0.75rem', color: 'var(--neon-emerald)' }}
                    className="mono"
                  >
                    +{formatMoney(w.income, currencySymbol)}
                  </div>
                  <div
                    style={{
                      fontSize: '0.82rem',
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
        </div>

        <div className="neon-card card-violet">
          <div className="kpi-header">
            <span className="kpi-label">
              <Sparkles size={15} className="text-violet" /> Reflexión Mensual Kakeibo{' '}
              <span className="asian-chip">振り返り</span>
            </span>
          </div>

          <form
            onSubmit={handleSaveReflectionForm}
            style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
          >
            <div>
              <label className="field-label">Meta de este mes ({currencyCode})</label>
              <input
                type="text"
                className="neon-input"
                placeholder="Ej. Cuidar el efectivo disponible y cumplir meta de ahorro..."
                value={howMuchCanISave}
                onChange={(e) => setHowMuchCanISave(e.target.value)}
              />
            </div>

            <div>
              <label className="field-label">¿Qué mejorar el próximo mes?</label>
              <textarea
                rows={2}
                className="neon-textarea"
                placeholder="Notas sobre tus gastos en efectivo o transferencia..."
                value={improvementPlan}
                onChange={(e) => setImprovementPlan(e.target.value)}
              />
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                flexWrap: 'wrap',
              }}
            >
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

      {/* Edit Entry Modal — Improvement #2: does NOT close when clicking outside! */}
      {editingEntry && (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <div className="modal-header">
              <h3>Editar Movimiento</h3>
              <button type="button" className="icon-btn" onClick={() => setEditingEntry(null)}>
                <X size={18} />
              </button>
            </div>

            <form
              onSubmit={saveEdit}
              style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
            >
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
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

                {editingEntry.type !== 'channel_transfer' ? (
                  <div>
                    <label className="field-label">Vía de pago</label>
                    <select
                      className="neon-select"
                      value={editPaymentMethod}
                      onChange={(e) => setEditPaymentMethod(e.target.value as PaymentMethod)}
                    >
                      <option value="efectivo">Efectivo</option>
                      <option value="transferencia">Transferencia</option>
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="field-label">Dirección</label>
                    <select
                      className="neon-select"
                      value={editTransferDirection}
                      onChange={(e) =>
                        setEditTransferDirection(e.target.value as TransferDirection)
                      }
                    >
                      <option value="transf_to_cash">Transf → Efectivo</option>
                      <option value="cash_to_transf">Efectivo → Transf</option>
                    </select>
                  </div>
                )}

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

              {editingEntry.type === 'channel_transfer' && (
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '6px',
                    }}
                  >
                    <label className="field-label" style={{ marginBottom: 0 }}>
                      Comisión ({editFeeMode === 'percent' ? '%' : currencySymbol})
                    </label>
                    <div className="mini-fee-toggle">
                      <button
                        type="button"
                        className={editFeeMode === 'percent' ? 'active' : ''}
                        onClick={() => setEditFeeMode('percent')}
                      >
                        %
                      </button>
                      <button
                        type="button"
                        className={editFeeMode === 'fixed' ? 'active' : ''}
                        onClick={() => setEditFeeMode('fixed')}
                      >
                        {currencySymbol}
                      </button>
                    </div>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="neon-input mono-input"
                    placeholder="0.00"
                    value={editFeeStr}
                    onChange={(e) => setEditFeeStr(e.target.value)}
                  />
                </div>
              )}

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

                  {editDivision === 'hogar' ? (
                    <div>
                      <label className="field-label">Categoría del Hogar</label>
                      <select
                        className="neon-select"
                        value={editHogarCategoryId}
                        onChange={(e) => setEditHogarCategoryId(e.target.value)}
                      >
                        <option value="">General del hogar</option>
                        {allHogarCategories.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : editDivision === 'inversiones' ? (
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
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setEditingEntry(null)}
                >
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
