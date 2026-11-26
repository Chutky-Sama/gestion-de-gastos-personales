import React, { useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Crosshair, X } from 'lucide-react';
import { getTodayDateString, round2 } from '../../shared/calculations';
import { formatMoney } from '../utils/format';

interface AdjustBalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBalance: number;
  currencySymbol: string;
  monthLabel: string;
  onConfirm: (payload: {
    mode: 'delta' | 'target';
    delta?: number;
    targetBalance?: number;
    reason?: string;
    date?: string;
  }) => Promise<void>;
}

export const AdjustBalanceModal: React.FC<AdjustBalanceModalProps> = ({
  isOpen,
  onClose,
  currentBalance,
  currencySymbol,
  monthLabel,
  onConfirm,
}) => {
  const [tab, setTab] = useState<'up' | 'down' | 'target'>('up');
  const [amountStr, setAmountStr] = useState('');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(getTodayDateString());
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const parsed = parseFloat(amountStr);
  const validNum = !Number.isNaN(parsed) && parsed >= 0;

  let previewBalance = currentBalance;
  let previewDiff = 0;

  if (validNum) {
    if (tab === 'up') {
      previewDiff = round2(parsed);
      previewBalance = round2(currentBalance + parsed);
    } else if (tab === 'down') {
      previewDiff = round2(-parsed);
      previewBalance = round2(currentBalance - parsed);
    } else {
      previewBalance = round2(parsed);
      previewDiff = round2(parsed - currentBalance);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validNum || Math.abs(previewDiff) < 0.01) return;
    setSaving(true);
    try {
      if (tab === 'target') {
        await onConfirm({
          mode: 'target',
          targetBalance: round2(parsed),
          reason: reason.trim() || undefined,
          date,
        });
      } else {
        await onConfirm({
          mode: 'delta',
          delta: tab === 'up' ? round2(parsed) : round2(-parsed),
          reason: reason.trim() || undefined,
          date,
        });
      }
      setAmountStr('');
      setReason('');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Modificar Dinero General · {monthLabel}</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <p style={{ margin: '0 0 14px', fontSize: '0.86rem', color: 'var(--text-secondary)' }}>
          Ajusta el dinero total que tienes en el mes (como el cuadre de saldo{' '}
          <span className="mono">残高調整</span> de las libretas asiáticas). Quedará asentado en tu
          libreta con fecha y motivo.
        </p>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`btn btn-sm ${tab === 'up' ? 'btn-emerald' : 'btn-ghost'}`}
            onClick={() => setTab('up')}
          >
            <ArrowUpCircle size={15} /> Subir Dinero (+)
          </button>
          <button
            type="button"
            className={`btn btn-sm ${tab === 'down' ? 'btn-magenta' : 'btn-ghost'}`}
            onClick={() => setTab('down')}
          >
            <ArrowDownCircle size={15} /> Bajar Dinero (-)
          </button>
          <button
            type="button"
            className={`btn btn-sm ${tab === 'target' ? 'btn-cyan' : 'btn-ghost'}`}
            onClick={() => {
              setTab('target');
              setAmountStr(String(currentBalance));
            }}
          >
            <Crosshair size={15} /> Fijar Monto Exacto
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '12px' }}>
            <div>
              <label className="field-label">
                {tab === 'up'
                  ? `Monto a sumar (${currencySymbol})`
                  : tab === 'down'
                  ? `Monto a descontar (${currencySymbol})`
                  : `Dinero real que tienes hoy (${currencySymbol})`}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                autoFocus
                className="neon-input mono-input"
                placeholder="0.00"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
              />
            </div>

            <div>
              <label className="field-label">Fecha del ajuste</label>
              <input
                type="date"
                className="neon-input mono-input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="field-label">Motivo / Nota en la libreta</label>
            <input
              type="text"
              className="neon-input"
              placeholder={
                tab === 'up'
                  ? 'Ej. Bono extra, comisión recibida, venta rápida...'
                  : tab === 'down'
                  ? 'Ej. Salida imprevista, efectivo gastado, ajuste...'
                  : 'Ej. Arqueo real de cuentas y efectivo hoy'
              }
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div
            style={{
              background: 'rgba(8, 12, 23, 0.9)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '10px',
              padding: '12px 14px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Saldo General Actual
              </div>
              <div className="mono" style={{ fontWeight: 700 }}>
                {formatMoney(currentBalance, currencySymbol)}
              </div>
            </div>

            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Variación</div>
              <div
                className={`mono ${
                  previewDiff > 0 ? 'text-emerald' : previewDiff < 0 ? 'text-magenta' : ''
                }`}
                style={{ fontWeight: 700 }}
              >
                {formatMoney(previewDiff, currencySymbol, true)}
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Nuevo Dinero General
              </div>
              <div className="mono text-cyan" style={{ fontWeight: 700, fontSize: '1.08rem' }}>
                {formatMoney(previewBalance, currencySymbol)}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !validNum || Math.abs(previewDiff) < 0.01}
              className={`btn ${
                tab === 'down' ? 'btn-magenta' : tab === 'up' ? 'btn-emerald' : 'btn-cyan'
              }`}
            >
              {saving ? 'Guardando...' : 'Aplicar en Libreta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
