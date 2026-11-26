import React, { useEffect, useState } from 'react';
import { Banknote, Plus, Smartphone, Wallet, X } from 'lucide-react';
import { round2 } from '../../shared/calculations';
import { AppDatabase } from '../../shared/types';
import { CURRENCY_OPTIONS, findCurrencyOption, formatMoney } from '../utils/format';

interface SalaryQuickModalProps {
  isOpen: boolean;
  onClose: () => void;
  db: AppDatabase;
  monthLabel: string;
  onSave: (payload: {
    ledgerName: string;
    currencyCode: string;
    enabledCurrencies: string[];
    currentSalaryEfectivo: number;
    currentSalaryTransferencia: number;
    hasManutencionesDefault: boolean;
    applyToCurrentMonth: boolean;
  }) => Promise<void>;
}

export const SalaryQuickModal: React.FC<SalaryQuickModalProps> = ({
  isOpen,
  onClose,
  db,
  monthLabel,
  onSave,
}) => {
  const profile = db.profile;
  const [ledgerName, setLedgerName] = useState(profile.ledgerName);
  const [enabledCurrencies, setEnabledCurrencies] = useState<string[]>(
    profile.enabledCurrencies || ['CUP', 'USD']
  );
  const [selectedCode, setSelectedCode] = useState(profile.currencyCode);
  const [extraCurrencyToAdd, setExtraCurrencyToAdd] = useState('MLC');

  const [salEfStr, setSalEfStr] = useState('');
  const [salTrStr, setSalTrStr] = useState('');
  const [hasManutenciones, setHasManutenciones] = useState(profile.hasManutencionesDefault);
  const [applyToCurrentMonth, setApplyToCurrentMonth] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLedgerName(profile.ledgerName);
      setEnabledCurrencies(profile.enabledCurrencies || ['CUP', 'USD']);
      setSelectedCode(profile.currencyCode);
      const ws = db.currencyWorkspaces[profile.currencyCode];
      setSalEfStr(ws && ws.currentSalaryEfectivo > 0 ? String(ws.currentSalaryEfectivo) : '');
      setSalTrStr(
        ws && ws.currentSalaryTransferencia > 0 ? String(ws.currentSalaryTransferencia) : ''
      );
      setHasManutenciones(ws ? ws.hasManutencionesDefault : profile.hasManutencionesDefault);
      setApplyToCurrentMonth(true);
    }
  }, [isOpen, db, profile]);

  if (!isOpen) return null;

  const handleSwitchConfigCurrency = (code: string) => {
    setSelectedCode(code);
    const ws = db.currencyWorkspaces[code];
    setSalEfStr(ws && ws.currentSalaryEfectivo > 0 ? String(ws.currentSalaryEfectivo) : '');
    setSalTrStr(
      ws && ws.currentSalaryTransferencia > 0 ? String(ws.currentSalaryTransferencia) : ''
    );
    setHasManutenciones(ws ? ws.hasManutencionesDefault : false);
  };

  const toggleCurrencyEnabled = (code: string) => {
    setEnabledCurrencies((prev) => {
      if (prev.includes(code)) {
        if (prev.length <= 1) return prev; // Always keep at least 1 currency
        const filtered = prev.filter((c) => c !== code);
        if (selectedCode === code) {
          handleSwitchConfigCurrency(filtered[0]);
        }
        return filtered;
      }
      return [...prev, code];
    });
  };

  const selectedOpt = findCurrencyOption(selectedCode);
  const parsedEf = round2(Math.max(0, parseFloat(salEfStr) || 0));
  const parsedTr = round2(Math.max(0, parseFloat(salTrStr) || 0));
  const totalSalary = round2(parsedEf + parsedTr);

  const quickCubanCodes = ['CUP', 'USD', 'MLC', 'EUR'];
  const otherOptions = CURRENCY_OPTIONS.filter(
    (c) => !quickCubanCodes.includes(c.code) && !enabledCurrencies.includes(c.code)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const finalEnabled = enabledCurrencies.includes(selectedCode)
        ? enabledCurrencies
        : [...enabledCurrencies, selectedCode];

      await onSave({
        ledgerName: ledgerName.trim() || 'Mi Libreta Kakeibo',
        currencyCode: selectedCode,
        enabledCurrencies: finalEnabled,
        currentSalaryEfectivo: parsedEf,
        currentSalaryTransferencia: parsedTr,
        hasManutencionesDefault: hasManutenciones,
        applyToCurrentMonth,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-panel"
        style={{ maxWidth: '580px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Wallet size={19} /> Salario Actual, Monedas (CUP / USD) y Vías
          </h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label className="field-label">Nombre de tu libreta</label>
            <input
              type="text"
              className="neon-input"
              value={ledgerName}
              onChange={(e) => setLedgerName(e.target.value)}
              placeholder="Mi Libreta Kakeibo"
            />
          </div>

          {/* Active Currencies Manager */}
          <div
            style={{
              padding: '12px 14px',
              background: 'rgba(8, 12, 23, 0.78)',
              borderRadius: '10px',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <label className="field-label" style={{ marginBottom: '8px' }}>
              Monedas habilitadas en tu barra superior (puedes llevar varias en paralelo)
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
              {Array.from(new Set([...quickCubanCodes, ...enabledCurrencies])).map((code) => {
                const active = enabledCurrencies.includes(code);
                const opt = findCurrencyOption(code);
                return (
                  <button
                    key={code}
                    type="button"
                    className={`btn btn-sm ${active ? 'btn-cyan' : 'btn-ghost'}`}
                    onClick={() => toggleCurrencyEnabled(code)}
                  >
                    {active ? '✓ ' : '+ '}
                    {opt.shortTag}
                  </button>
                );
              })}
            </div>

            {otherOptions.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <select
                  className="neon-select"
                  style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                  value={extraCurrencyToAdd}
                  onChange={(e) => setExtraCurrencyToAdd(e.target.value)}
                >
                  {otherOptions.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => {
                    if (extraCurrencyToAdd && !enabledCurrencies.includes(extraCurrencyToAdd)) {
                      setEnabledCurrencies((prev) => [...prev, extraCurrencyToAdd]);
                    }
                  }}
                >
                  <Plus size={14} /> Agregar otra moneda
                </button>
              </div>
            )}
          </div>

          {/* Select which currency's salary we are setting right now */}
          <div>
            <label className="field-label">Configurar salario de la moneda:</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {enabledCurrencies.map((code) => {
                const opt = findCurrencyOption(code);
                return (
                  <button
                    key={code}
                    type="button"
                    className={`btn btn-sm ${selectedCode === code ? 'btn-emerald' : 'btn-ghost'}`}
                    onClick={() => handleSwitchConfigCurrency(code)}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Parallel Salary Split: Efectivo + Transferencia */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              padding: '12px 14px',
              borderRadius: '10px',
              background: 'rgba(0, 240, 255, 0.04)',
              border: '1px solid rgba(0, 240, 255, 0.25)',
            }}
          >
            <div>
              <label className="field-label" style={{ color: 'var(--neon-emerald)' }}>
                <Banknote size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                Salario en Efectivo ({selectedOpt.symbol})
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                autoFocus
                className="neon-input mono-input"
                placeholder="0.00"
                value={salEfStr}
                onChange={(e) => setSalEfStr(e.target.value)}
              />
            </div>

            <div>
              <label className="field-label" style={{ color: 'var(--neon-violet)' }}>
                <Smartphone size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                Salario por Transferencia ({selectedOpt.symbol})
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="neon-input mono-input"
                placeholder="0.00"
                value={salTrStr}
                onChange={(e) => setSalTrStr(e.target.value)}
              />
            </div>

            <div
              style={{
                gridColumn: '1 / -1',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: '6px',
                borderTop: '1px dashed var(--border-subtle)',
                fontSize: '0.85rem',
              }}
            >
              <span style={{ color: 'var(--text-secondary)' }}>
                Salario Total Mensual ({selectedOpt.code}):
              </span>
              <strong className="mono text-cyan" style={{ fontSize: '1.08rem' }}>
                {formatMoney(totalSalary, selectedOpt.symbol)}
              </strong>
            </div>
          </div>

          <div
            style={{
              padding: '12px 14px',
              background: 'rgba(8, 12, 23, 0.75)',
              borderRadius: '10px',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div
              className="neon-switch"
              onClick={() => setHasManutenciones((prev) => !prev)}
            >
              <div className={`switch-track ${hasManutenciones ? 'on' : ''}`}>
                <div className="switch-thumb" />
              </div>
              <span>¿Tienes pagos de manutención en {selectedOpt.code}?</span>
            </div>

            <div
              className="neon-switch"
              onClick={() => setApplyToCurrentMonth((prev) => !prev)}
            >
              <div className={`switch-track ${applyToCurrentMonth ? 'on' : ''}`}>
                <div className="switch-thumb" />
              </div>
              <span>Aplicar este salario de {selectedOpt.code} a {monthLabel}</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-cyan" disabled={saving}>
              {saving ? 'Guardando...' : `Guardar (${selectedOpt.code})`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
