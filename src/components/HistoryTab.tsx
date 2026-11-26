import React, { useMemo, useRef, useState } from 'react';
import {
  Archive,
  Calendar,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FolderOpen,
  History,
  RotateCcw,
  Sparkles,
  Upload,
} from 'lucide-react';
import {
  computeAllTimeInvestmentTotals,
  computeMonthSummary,
  daysSinceFirstUse,
  formatMonthLabel,
  round2,
} from '../../shared/calculations';
import { AppDatabase } from '../../shared/types';
import {
  exportAllEntriesAsCsv,
  exportDatabaseAsJson,
  formatFullDateTime,
  formatMoney,
} from '../utils/format';

interface HistoryTabProps {
  db: AppDatabase;
  activeMonthKey: string;
  desktopStoragePath?: string;
  onOpenDataFolder?: () => Promise<void>;
  onSelectMonth: (monthKey: string) => void;
  onLoadDemo: () => Promise<void>;
  onResetClean: () => Promise<void>;
  onImportBackup: (backup: AppDatabase) => Promise<void>;
}

export const HistoryTab: React.FC<HistoryTabProps> = ({
  db,
  activeMonthKey,
  desktopStoragePath,
  onOpenDataFolder,
  onSelectMonth,
  onLoadDemo,
  onResetClean,
  onImportBackup,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const sym = db.profile.currencySymbol;
  const activeDays = daysSinceFirstUse(db.firstUseDate);

  const archiveData = useMemo(() => {
    const allTimeInv = computeAllTimeInvestmentTotals(db);
    const sortedKeys = Object.keys(db.months).sort().reverse();

    let lifetimeInflow = 0;
    let lifetimeOutflow = 0;
    let lifetimeInvested = 0;
    let lifetimeDebtPaid = 0;
    let totalEntriesCount = 0;

    const monthRows = sortedKeys.map((mk) => {
      const m = db.months[mk];
      const s = computeMonthSummary(m, db.investments, allTimeInv);
      // Avoid double counting carryover in lifetime inflow: count salary + extra income + adjustments_up
      lifetimeInflow = round2(
        lifetimeInflow + s.salary + s.totalExtraIncome + s.totalAdjustmentsUp
      );
      lifetimeOutflow = round2(lifetimeOutflow + s.totalOutflowAll);
      lifetimeInvested = round2(lifetimeInvested + s.envelopes.inversiones.spent);
      lifetimeDebtPaid = round2(lifetimeDebtPaid + s.envelopes.deudas.spent);
      totalEntriesCount += m.entries.length;

      return {
        monthKey: mk,
        label: formatMonthLabel(mk),
        entriesCount: m.entries.length,
        summary: s,
      };
    });

    return {
      monthRows,
      lifetimeInflow,
      lifetimeOutflow,
      lifetimeInvested,
      lifetimeDebtPaid,
      totalEntriesCount,
    };
  }, [db]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as AppDatabase;
      await onImportBackup(parsed);
    } catch {
      alert('No se pudo leer el archivo JSON de respaldo.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div>
      {/* Day-1 Banner & Lifetime Totals */}
      <div className="neon-card card-emerald" style={{ marginBottom: '20px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '16px',
            flexWrap: 'wrap',
            marginBottom: '18px',
          }}
        >
          <div>
            <div className="kpi-label" style={{ color: 'var(--neon-emerald)' }}>
              <History size={16} /> REGISTRO PERMANENTE DESDE EL DÍA 1 · 全期間記録
            </div>
            <h3 style={{ margin: '6px 0 4px', fontSize: '1.2rem' }}>
              Iniciado el {formatFullDateTime(db.firstUseDate)} · Día #{activeDays} de seguimiento
            </h3>
            <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
              Todos tus meses, cambios de salario, inversiones y movimientos se guardan
              automáticamente en tu disco local (
              <span className="mono">{desktopStoragePath || 'data/kakeibo-store.json'}</span>).
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {desktopStoragePath && onOpenDataFolder && (
              <button
                type="button"
                className="btn btn-sm btn-violet"
                onClick={onOpenDataFolder}
              >
                <FolderOpen size={14} /> Abrir Carpeta en Windows
              </button>
            )}
            <button
              type="button"
              className="btn btn-sm btn-cyan"
              onClick={() => exportDatabaseAsJson(db)}
            >
              <Download size={14} /> Descargar Respaldo (.JSON)
            </button>
            <button
              type="button"
              className="btn btn-sm btn-emerald"
              onClick={() => exportAllEntriesAsCsv(db)}
            >
              <FileSpreadsheet size={14} /> Exportar Excel (.CSV)
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={14} /> Restaurar Respaldo
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            gap: '12px',
          }}
        >
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '10px',
              background: 'rgba(8, 12, 23, 0.78)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)' }}>
              INGRESOS ACUMULADOS
            </div>
            <div className="mono text-cyan" style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '4px' }}>
              {formatMoney(archiveData.lifetimeInflow, sym)}
            </div>
          </div>

          <div
            style={{
              padding: '12px 14px',
              borderRadius: '10px',
              background: 'rgba(8, 12, 23, 0.78)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)' }}>
              SALIDAS Y GASTOS TOTALES
            </div>
            <div className="mono text-magenta" style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '4px' }}>
              {formatMoney(archiveData.lifetimeOutflow, sym)}
            </div>
          </div>

          <div
            style={{
              padding: '12px 14px',
              borderRadius: '10px',
              background: 'rgba(8, 12, 23, 0.78)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)' }}>
              TOTAL INVERTIDO HISTÓRICO
            </div>
            <div className="mono text-violet" style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '4px' }}>
              {formatMoney(archiveData.lifetimeInvested, sym)}
            </div>
          </div>

          <div
            style={{
              padding: '12px 14px',
              borderRadius: '10px',
              background: 'rgba(8, 12, 23, 0.78)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)' }}>
              DEUDAS PAGADAS HISTÓRICO
            </div>
            <div className="mono text-amber" style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '4px' }}>
              {formatMoney(archiveData.lifetimeDebtPaid, sym)}
            </div>
          </div>
        </div>
      </div>

      {/* Month-by-Month Ledger Archive */}
      <div className="ledger-book" style={{ marginBottom: '22px' }}>
        <div className="ledger-book-header">
          <div className="ledger-book-title">
            <Archive size={19} className="text-cyan" />
            <div>
              <h3>Archivo Mensual de Libretas ({archiveData.monthRows.length} meses)</h3>
              <div style={{ fontSize: '0.77rem', color: 'var(--text-secondary)' }}>
                Haz clic en cualquier mes para consultar o editar su libreta completa.
              </div>
            </div>
          </div>
        </div>

        <div className="ledger-table-wrap">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Mes</th>
                <th className="num-col">Salario Base</th>
                <th className="num-col">Extras / Ajustes (+)</th>
                <th className="num-col">Salidas Totales (-)</th>
                <th className="num-col">Invertido</th>
                <th className="num-col">Saldo General</th>
                <th style={{ textAlign: 'right' }}>Libreta</th>
              </tr>
            </thead>
            <tbody>
              {archiveData.monthRows.map((row) => {
                const isCurrent = row.monthKey === activeMonthKey;
                const extraUp = round2(
                  row.summary.totalExtraIncome + row.summary.totalAdjustmentsUp
                );
                return (
                  <tr key={row.monthKey}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Calendar size={15} className="text-cyan" />
                        <strong>{row.label}</strong>
                        {isCurrent && <span className="div-badge div-cyan">Viendo ahora</span>}
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          ({row.entriesCount} mov.)
                        </span>
                      </div>
                    </td>
                    <td className="num-col">{formatMoney(row.summary.salary, sym)}</td>
                    <td className="num-col text-emerald">
                      {extraUp > 0 ? formatMoney(extraUp, sym, true) : '—'}
                    </td>
                    <td className="num-col text-magenta">
                      {row.summary.totalOutflowAll > 0
                        ? `-${formatMoney(row.summary.totalOutflowAll, sym)}`
                        : '—'}
                    </td>
                    <td className="num-col text-violet">
                      {formatMoney(row.summary.envelopes.inversiones.spent, sym)}
                    </td>
                    <td
                      className={`num-col ${
                        row.summary.currentGeneralBalance < 0 ? 'text-magenta' : 'text-cyan'
                      }`}
                      style={{ fontWeight: 700 }}
                    >
                      {formatMoney(row.summary.currentGeneralBalance, sym)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => onSelectMonth(row.monthKey)}
                      >
                        Abrir <ExternalLink size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom Two Columns: Audit Log since Day 1 + Demo/Reset tools */}
      <div className="two-col-grid">
        <div className="neon-card">
          <div className="kpi-header">
            <span className="kpi-label">Bitácora de Eventos Desde el Día 1</span>
            <span className="tab-badge">{db.historyLog.length}</span>
          </div>

          <div className="timeline-list">
            {db.historyLog.map((ev) => (
              <div key={ev.id} className="timeline-item">
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{ev.title}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {ev.detail}
                  </div>
                </div>
                <div
                  className="mono"
                  style={{ fontSize: '0.73rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}
                >
                  {formatFullDateTime(ev.timestamp)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="neon-card">
          <div className="kpi-header">
            <span className="kpi-label">Herramientas de Datos y Prueba</span>
          </div>
          <p style={{ margin: '0 0 14px', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
            ¿Quieres ver cómo luce la libreta llena con un ejemplo completo, o prefieres limpiar
            todo para empezar desde cero con tus datos reales?
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button type="button" className="btn btn-violet" onClick={onLoadDemo}>
              <Sparkles size={16} /> Cargar Mes de Ejemplo Completo (Demo)
            </button>

            {!confirmReset ? (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setConfirmReset(true)}
              >
                <RotateCcw size={15} /> Reiniciar Libreta en Blanco ($0.00)
              </button>
            ) : (
              <div
                style={{
                  padding: '12px',
                  borderRadius: '10px',
                  background: 'var(--neon-magenta-dim)',
                  border: '1px solid var(--neon-magenta)',
                }}
              >
                <div style={{ fontSize: '0.82rem', marginBottom: '8px', fontWeight: 600 }}>
                  ¿Seguro que deseas borrar los registros actuales y dejar la libreta en cero?
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-magenta"
                    onClick={async () => {
                      await onResetClean();
                      setConfirmReset(false);
                    }}
                  >
                    Sí, reiniciar desde cero
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => setConfirmReset(false)}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
