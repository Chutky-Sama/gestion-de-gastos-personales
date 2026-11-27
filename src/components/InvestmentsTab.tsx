import React, { useState } from 'react';
import {
  ArrowUpRight,
  Banknote,
  Check,
  Edit3,
  Plus,
  Smartphone,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import { MonthComputedSummary } from '../../shared/calculations';
import {
  InvestmentCategory,
  InvestmentDefinition,
  PaymentMethod,
} from '../../shared/types';
import { INVESTMENT_CATEGORIES, formatMoney } from '../utils/format';

interface InvestmentsTabProps {
  monthKey: string;
  currencyCode: string;
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
  }) => Promise<void>;
  onUpdateInvestment: (
    id: string,
    payload: {
      name?: string;
      category?: InvestmentCategory;
      monthlyTarget?: number;
      platform?: string;
      notes?: string;
      active?: boolean;
    }
  ) => Promise<void>;
  onDeleteInvestment: (id: string) => Promise<void>;
  onQuickContribute: (
    investment: InvestmentDefinition,
    amount: number,
    paymentMethod: PaymentMethod
  ) => Promise<void>;
}

export const InvestmentsTab: React.FC<InvestmentsTabProps> = ({
  currencyCode,
  investments,
  summary,
  allTimeTotals,
  currencySymbol,
  onCreateInvestment,
  onUpdateInvestment,
  onDeleteInvestment,
  onQuickContribute,
}) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<InvestmentCategory>('negocio');
  const [targetStr, setTargetStr] = useState('');
  const [platform, setPlatform] = useState('');
  const [creating, setCreating] = useState(false);

  const [editingInv, setEditingInv] = useState<InvestmentDefinition | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<InvestmentCategory>('negocio');
  const [editTargetStr, setEditTargetStr] = useState('');
  const [editPlatform, setEditPlatform] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const [contribInvId, setContribInvId] = useState<string | null>(null);
  const [contribAmountStr, setContribAmountStr] = useState('');
  const [contribMethod, setContribMethod] = useState<PaymentMethod>('efectivo');

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
      });
      setName('');
      setTargetStr('');
      setPlatform('');
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (inv: InvestmentDefinition) => {
    setEditingInv(inv);
    setEditName(inv.name);
    setEditCategory(inv.category);
    setEditTargetStr(String(inv.monthlyTarget));
    setEditPlatform(inv.platform || '');
    setEditNotes(inv.notes || '');
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
    });
    setEditingInv(null);
  };

  const totalHistoricalInvested = Object.values(allTimeTotals).reduce((a, b) => a + b, 0);

  const statusMap = new Map(
    summary.investmentBreakdown.map((item) => [item.investment.id, item])
  );

  return (
    <div>
      <div className="neon-card card-violet" style={{ marginBottom: '20px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '16px',
            flexWrap: 'wrap',
            marginBottom: '18px',
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
              <TrendingUp size={20} className="text-violet" /> Cartera de Inversiones ({currencyCode}){' '}
              <span className="asian-chip">投資ポートフォリオ</span>
            </h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Define aquí cuáles son tus inversiones en {currencyCode} y registra tus aportes en
              Efectivo o por Transferencia.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)' }}>
                META ESTE MES
              </div>
              <div className="mono text-violet" style={{ fontSize: '1.22rem', fontWeight: 700 }}>
                {formatMoney(summary.envelopes.inversiones.planned, currencySymbol)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)' }}>
                APORTADO ESTE MES
              </div>
              <div className="mono text-emerald" style={{ fontSize: '1.22rem', fontWeight: 700 }}>
                {formatMoney(summary.envelopes.inversiones.spent, currencySymbol)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)' }}>
                TOTAL DESDE EL DÍA 1
              </div>
              <div className="mono text-cyan" style={{ fontSize: '1.22rem', fontWeight: 700 }}>
                {formatMoney(totalHistoricalInvested, currencySymbol)}
              </div>
            </div>
          </div>
        </div>

        <form
          onSubmit={handleCreate}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))',
            gap: '12px',
            alignItems: 'end',
            paddingTop: '14px',
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          <div>
            <label className="field-label">Nombre de la inversión</label>
            <input
              type="text"
              required
              className="neon-input"
              placeholder="Ej. Negocio, Fondo USD, Mercancía..."
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="field-label">Tipo de inversión</label>
            <select
              className="neon-select"
              value={category}
              onChange={(e) => setCategory(e.target.value as InvestmentCategory)}
            >
              {Object.entries(INVESTMENT_CATEGORIES).map(([key, info]) => (
                <option key={key} value={key}>
                  {info.label}
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
              placeholder="0.00"
              value={targetStr}
              onChange={(e) => setTargetStr(e.target.value)}
            />
          </div>

          <div>
            <label className="field-label">Plataforma / Lugar (Opcional)</label>
            <input
              type="text"
              className="neon-input"
              placeholder="Ej. Efectivo, Tarjeta, Wallet..."
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={creating}
              className="btn btn-violet"
              style={{ width: '100%', height: '40px' }}
            >
              <Plus size={16} /> {creating ? 'Agregando...' : 'Agregar Inversión'}
            </button>
          </div>
        </form>
      </div>

      {investments.length === 0 ? (
        <div className="neon-card empty-state">
          <h4 style={{ margin: '0 0 6px', color: 'var(--text-primary)' }}>
            Todavía no tienes inversiones registradas en {currencyCode}
          </h4>
          <p style={{ margin: 0, fontSize: '0.88rem' }}>
            Usa el formulario superior para definir tus inversiones en {currencyCode}.
          </p>
        </div>
      ) : (
        <div className="investments-grid">
          {investments.map((inv) => {
            const st = statusMap.get(inv.id);
            const planned = st ? st.plannedThisMonth : inv.active ? inv.monthlyTarget : 0;
            const contributed = st ? st.contributedThisMonth : 0;
            const pct = st ? st.percentCompleted : 0;
            const allTime = allTimeTotals[inv.id] || 0;
            const catInfo = INVESTMENT_CATEGORIES[inv.category] || INVESTMENT_CATEGORIES.otro;

            return (
              <div
                key={inv.id}
                className={`neon-card ${inv.active ? 'card-violet' : ''}`}
                style={{ opacity: inv.active ? 1 : 0.65 }}
              >
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
                    <span className="div-badge div-violet" style={{ marginBottom: '6px' }}>
                      {catInfo.badge}
                    </span>
                    <h4 style={{ margin: '4px 0 2px', fontSize: '1.05rem' }}>{inv.name}</h4>
                    {inv.platform && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        {inv.platform}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      type="button"
                      className="icon-btn"
                      title="Editar inversión"
                      onClick={() => openEdit(inv)}
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

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.82rem',
                    marginBottom: '6px',
                  }}
                >
                  <span style={{ color: 'var(--text-secondary)' }}>
                    Este mes:{' '}
                    <strong className="mono text-emerald">
                      {formatMoney(contributed, currencySymbol)}
                    </strong>
                  </span>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    Meta:{' '}
                    <strong className="mono">{formatMoney(planned, currencySymbol)}</strong>
                  </span>
                </div>

                <div className="progress-track" style={{ marginBottom: '12px' }}>
                  <div className="progress-fill fill-violet" style={{ width: `${pct}%` }} />
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingTop: '10px',
                    borderTop: '1px solid var(--border-subtle)',
                    fontSize: '0.8rem',
                  }}
                >
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Histórico Día 1: </span>
                    <strong className="mono text-cyan">
                      {formatMoney(allTime, currencySymbol)}
                    </strong>
                  </div>

                  {inv.active && (
                    <button
                      type="button"
                      className="btn btn-sm btn-emerald"
                      onClick={() => {
                        setContribInvId(inv.id);
                        const rem = Math.max(0, planned - contributed);
                        setContribAmountStr(rem > 0 ? String(rem) : String(inv.monthlyTarget || ''));
                      }}
                    >
                      <ArrowUpRight size={14} /> Aportar
                    </button>
                  )}
                </div>

                {contribInvId === inv.id && (
                  <div
                    style={{
                      marginTop: '12px',
                      padding: '10px',
                      borderRadius: '8px',
                      background: 'rgba(0, 255, 157, 0.07)',
                      border: '1px solid rgba(0, 255, 157, 0.35)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
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
                        placeholder="Monto"
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
              </div>
            );
          })}
        </div>
      )}

      {editingInv && (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <div className="modal-header">
              <h3>Editar Inversión</h3>
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

              <div>
                <label className="field-label">Plataforma / Lugar</label>
                <input
                  type="text"
                  className="neon-input"
                  value={editPlatform}
                  onChange={(e) => setEditPlatform(e.target.value)}
                />
              </div>

              <div>
                <label className="field-label">Notas</label>
                <input
                  type="text"
                  className="neon-input"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setEditingInv(null)}>
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
