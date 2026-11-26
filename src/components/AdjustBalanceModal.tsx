import React, { useEffect, useState } from 'react';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  Crosshair,
  Smartphone,
  X,
} from 'lucide-react';
import { getTodayDateString, round2 } from '../../shared/calculations';
import { PaymentMethod } from '../../shared/types';
import { formatMoney } from '../utils/format';

interface AdjustBalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentEfectivo: number;
  currentTransferencia: number;
  defaultChannel?: PaymentMethod;
  currencySymbol: string;
  currencyCode: string;
  monthLabel: string;
  onConfirm: (payload: {
    mode: 'delta' | 'target';
    paymentMethod: PaymentMethod;
    delta?: number;
    targetBalance?: number;
    reason?: string;
    date?: string;
  }) => Promise<void>;
}

export const AdjustBalanceModal: React.FC<AdjustBalanceModalProps> = ({
  isOpen,
  onClose,
  currentEfectivo,
  currentTransferencia,
  defaultChannel = 'efectivo',
  currencySymbol,
  currencyCode,
  monthLabel,
  onConfirm,
}) => {
  const [channel, setChannel] = useState<PaymentMethod>(defaultChannel);
  const [tab, setTab] = useState<'up' | 'down' | 'target'>('up');
  const [amountStr, setAmountStr] = useState('');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(getTodayDateString());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setChannel(defaultChannel);
      setDate(getTodayDateString());
    }
  }, [isOpen, defaultChannel]);

  if (!isOpen) return null;

  const activeChannelBalance =
    channel === 'transferencia' ? currentTransferencia : currentEfectivo;
  const otherChannelBalance =
    channel === 'transferencia' ? currentEfectivo : currentTransferencia;

  const parsed = parseFloat(amountStr);
  const validNum = !Number.isNaN(parsed) && parsed >= 0;

  let previewChannelBalance = activeChannelBalance;
  let previewDiff = 0;

  if (validNum) {
    if (tab === 'up') {
      previewDiff = round2(parsed);
      previewChannelBalance = round2(activeChannelBalance + parsed);
    } else if (tab === 'down') {
      previewDiff = round2(-parsed);
      previewChannelBalance = round2(activeChannelBalance - parsed);
    } else {
      previewChannelBalance = round2(parsed);
      previewDiff = round2(parsed - activeChannelBalance);
    }
  }

  const previewGeneralTotal = round2(previewChannelBalance + otherChannelBalance);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validNum || Math.abs(previewDiff) < 0.01) return;
    setSaving(true);
    try {
      if (tab === 'target') {
        await onConfirm({
          mode: 'target',
          paymentMethod: channel,
          targetBalance: round2(parsed),
          reason: reason.trim() || undefined,
          date,
        });
      } else {
        await onConfirm({
          mode: 'delta',
          paymentMethod: channel,
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
          <h3>
            Modificar Saldo ({currencyCode}) · {monthLabel}
          </h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <p style={{ margin: '0 0 12px', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
          Elige si deseas ajustar tu dinero en <strong>Efectivo</strong> o en{' '}
          <strong>Transferencia</strong>. Quedará registrado en tu libreta en paralelo.
        </p>

        {/* Channel Selector */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
          <button
            type="button"
            className={`btn ${channel === 'efectivo' ? 'btn-emerald' : 'btn-ghost'}`}
            style={{ justifyContent: 'space-between', padding: '10px 12px' }}
            onClick={() => {
              setChannel('efectivo');
              if (tab === 'target') setAmountStr(String(currentEfectivo));
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Banknote size={16} /> Efectivo
            </span>
            <span className="mono">{formatMoney(currentEfectivo, currencySymbol)}</span>
          </button>

          <button
            type="button"
            className={`btn ${channel === 'transferencia' ? 'btn-violet' : 'btn-ghost'}`}
            style={{ justifyContent: 'space-between', padding: '10px 12px' }}
            onClick={() => {
              setChannel('transferencia');
              if (tab === 'target') setAmountStr(String(currentTransferencia));
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Smartphone size={16} /> Transferencia
            </span>
            <span className="mono">{formatMoney(currentTransferencia, currencySymbol)}</span>
          </button>
        </div>

        {/* Action Mode */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`btn btn-sm ${tab === 'up' ? 'btn-emerald' : 'btn-ghost'}`}
            onClick={() => setTab('up')}
          >
            <ArrowUpCircle size={15} /> Subir (+)
          </button>
          <button
            type="button"
            className={`btn btn-sm ${tab === 'down' ? 'btn-magenta' : 'btn-ghost'}`}
            onClick={() => setTab('down')}
          >
            <ArrowDownCircle size={15} /> Bajar (-)
          </button>
          <button
            type="button"
            className={`btn btn-sm ${tab === 'target' ? 'btn-cyan' : 'btn-ghost'}`}
            onClick={() => {
              setTab('target');
              setAmountStr(String(activeChannelBalance));
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
                  ? `Sumar a ${channel === 'efectivo' ? 'Efectivo' : 'Transferencia'} (${currencySymbol})`
                  : tab === 'down'
                  ? `Restar de ${channel === 'efectivo' ? 'Efectivo' : 'Transferencia'} (${currencySymbol})`
                  : `Saldo real en ${channel === 'efectivo' ? 'Efectivo' : 'Transferencia'} (${currencySymbol})`}
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
              <label className="field-label">Fecha</label>
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
                channel === 'efectivo'
                  ? 'Ej. Efectivo recibido, cuadre de cartera...'
                  : 'Ej. Transfermóvil recibido, ajuste de tarjeta...'
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
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: '10px',
            }}
          >
            <div>
              <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)' }}>
                Nuevo {channel === 'efectivo' ? 'Efectivo' : 'Transf.'}
              </div>
              <div className="mono text-emerald" style={{ fontWeight: 700 }}>
                {formatMoney(previewChannelBalance, currencySymbol)}
              </div>
            </div>

            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)' }}>Variación</div>
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
              <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)' }}>
                Total General ({currencyCode})
              </div>
              <div className="mono text-cyan" style={{ fontWeight: 700 }}>
                {formatMoney(previewGeneralTotal, currencySymbol)}
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
