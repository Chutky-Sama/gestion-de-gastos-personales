import React, { useEffect, useState } from 'react';
import { Wallet, X } from 'lucide-react';
import { UserProfile } from '../../shared/types';
import { CURRENCY_OPTIONS } from '../utils/format';

interface SalaryQuickModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
  monthLabel: string;
  onSave: (payload: {
    ledgerName: string;
    currencyCode: string;
    currencySymbol: string;
    currentSalary: number;
    hasManutencionesDefault: boolean;
    applyToCurrentMonth: boolean;
  }) => Promise<void>;
}

export const SalaryQuickModal: React.FC<SalaryQuickModalProps> = ({
  isOpen,
  onClose,
  profile,
  monthLabel,
  onSave,
}) => {
  const [ledgerName, setLedgerName] = useState(profile.ledgerName);
  const [currencyCode, setCurrencyCode] = useState(profile.currencyCode);
  const [salaryStr, setSalaryStr] = useState(String(profile.currentSalary || ''));
  const [hasManutenciones, setHasManutenciones] = useState(profile.hasManutencionesDefault);
  const [applyToCurrentMonth, setApplyToCurrentMonth] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLedgerName(profile.ledgerName);
      setCurrencyCode(profile.currencyCode);
      setSalaryStr(profile.currentSalary > 0 ? String(profile.currentSalary) : '');
      setHasManutenciones(profile.hasManutencionesDefault);
      setApplyToCurrentMonth(true);
    }
  }, [isOpen, profile]);

  if (!isOpen) return null;

  const selectedCurrency =
    CURRENCY_OPTIONS.find((c) => c.code === currencyCode) || CURRENCY_OPTIONS[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericSalary = Math.max(0, parseFloat(salaryStr) || 0);
    setSaving(true);
    try {
      await onSave({
        ledgerName: ledgerName.trim() || 'Mi Libreta Kakeibo',
        currencyCode: selectedCurrency.code,
        currencySymbol: selectedCurrency.symbol,
        currentSalary: numericSalary,
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
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Wallet size={19} /> Definir Salario Actual y Moneda
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

          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '12px' }}>
            <div>
              <label className="field-label">
                Salario Mensual Actual ({selectedCurrency.symbol})
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                autoFocus
                className="neon-input mono-input"
                placeholder="Ej. 2000.00"
                value={salaryStr}
                onChange={(e) => setSalaryStr(e.target.value)}
              />
            </div>

            <div>
              <label className="field-label">Moneda</label>
              <select
                className="neon-select"
                value={currencyCode}
                onChange={(e) => setCurrencyCode(e.target.value)}
              >
                {CURRENCY_OPTIONS.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.label}
                  </option>
                ))}
              </select>
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
              <span>¿Tienes pagos de manutención actualmente?</span>
            </div>

            <div
              className="neon-switch"
              onClick={() => setApplyToCurrentMonth((prev) => !prev)}
            >
              <div className={`switch-track ${applyToCurrentMonth ? 'on' : ''}`}>
                <div className="switch-thumb" />
              </div>
              <span>Aplicar este salario a {monthLabel}</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-cyan" disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar Salario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
