import React, { useMemo, useRef, useState } from 'react';
import {
  Archive,
  Calendar,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FolderOpen,
  History,
  LogOut,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react';
import {
  computeAllTimeInvestmentTotals,
  computeMonthSummary,
  formatMonthLabel,
} from '../../shared/calculations';
import { canExitDemoReset, canStartDemo } from '../../shared/ledgerCore';
import { AppDatabase, CurrencyLedgerWorkspace } from '../../shared/types';
import { DesktopInfo } from '../api';
import {
  exportAllEntriesAsCsv,
  exportDatabaseAsJson,
  formatFullDateTime,
  formatMoney,
} from '../utils/format';

interface HistoryTabProps {
  db: AppDatabase;
  activeWorkspace: CurrencyLedgerWorkspace;
  desktopInfo: DesktopInfo;
  onSelectMonth: (monthKey: string) => void;
  onLoadDemo: () => Promise<void>;
  onExitDemoReset: () => Promise<void>;
  onImportBackup: (backup: AppDatabase) => Promise<void>;
  onOpenDesktopFolder: () => Promise<void>;
}

export const HistoryTab: React.FC<HistoryTabProps> = ({
  db,
  activeWorkspace,
  desktopInfo,
  onSelectMonth,
  onLoadDemo,
  onExitDemoReset,
  onImportBackup,
  onOpenDesktopFolder,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [confirmExitDemo, setConfirmExitDemo] = useState(false);
  const currencySymbol = activeWorkspace.currencySymbol;
  const currencyCode = activeWorkspace.currencyCode;

  const sortedMonthKeys = useMemo(
    () => Object.keys(activeWorkspace.months).sort().reverse(),
    [activeWorkspace.months]
  );

  const monthSummaries = useMemo(
    () =>
      sortedMonthKeys.map((mk) => ({
        month: activeWorkspace.months[mk],
        summary: computeMonthSummary(activeWorkspace.months[mk], activeWorkspace.investments),
      })),
    [sortedMonthKeys, activeWorkspace]
  );

  const lifetimeStats = useMemo(() => {
    let totalEntries = 0;
    let totalSavedInvested = 0;
    let totalExpenses = 0;

    for (const ms of monthSummaries) {
      totalEntries += ms.month.entries.length;
      totalExpenses += ms.summary.totalOutflowAll;
    }

    const invTotals = computeAllTimeInvestmentTotals(
      activeWorkspace.months,
      activeWorkspace.investments
    );
    totalSavedInvested = Object.values(invTotals).reduce((a, b) => a + b, 0);

    return {
      monthsTracked: monthSummaries.length,
      totalEntries,
      totalSavedInvested,
      totalExpenses,
    };
  }, [monthSummaries, activeWorkspace]);

  const demoAvailable = canStartDemo(db);
  const exitDemoAvailable = canExitDemoReset(db);

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
      {/* Day-1 Continuity Banner */}
      <div className="neon-card card-emerald" style={{ marginBottom: '20px' }}>
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
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                color: 'var(--neon-emerald)',
                fontSize: '0.8rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: '6px',
              }}
            >
              <ShieldCheck size={17} /> Registro Continuo Activo Desde el Día 1
            </div>
            <h3 style={{ margin: '0 0 4px', fontSize: '1.15rem' }}>
              Iniciada el {formatFullDateTime(db.firstUseDate)}
            </h3>
            <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
              Último guardado automático: {formatFullDateTime(db.lastUpdatedAt)} · Todas tus
              monedas ({db.profile.enabledCurrencies.join(', ')}) y saldos en Efectivo /
              Transferencia se guardan de forma permanente.
            </p>
            {desktopInfo.isDesktop && desktopInfo.storagePath && (
              <div
                style={{
                  marginTop: '8px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '10px',
                  flexWrap: 'wrap',
                  padding: '6px 10px',
                  borderRadius: '8px',
                  background: 'rgba(0, 240, 255, 0.07)',
                  border: '1px solid rgba(0, 240, 255, 0.25)',
                  fontSize: '0.78rem',
                }}
              >
                <span className="mono text-cyan">Archivo en tu PC: {desktopInfo.storagePath}</span>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  style={{ padding: '3px 8px', fontSize: '0.74rem' }}
                  onClick={onOpenDesktopFolder}
                >
                  <FolderOpen size={13} /> Abrir carpeta de datos
                </button>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-cyan btn-sm"
              onClick={() => exportDatabaseAsJson(db)}
            >
              <Download size={14} /> Respaldo JSON
            </button>

            <button
              type="button"
              className="btn btn-emerald btn-sm"
              onClick={() => exportAllEntriesAsCsv(db)}
            >
              <FileSpreadsheet size={14} /> Exportar CSV
            </button>

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={14} /> Importar Respaldo
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleFileImport}
            />

            {/* Single-use Demo button: ONLY shown if untouched & never used */}
            {demoAvailable && (
              <button
                type="button"
                className="btn btn-violet btn-sm"
                onClick={onLoadDemo}
                title="Prueba de un solo uso para explorar el programa antes de ingresar tus datos reales"
              >
                <Sparkles size={14} /> Probar Demo (1 solo uso)
              </button>
            )}

            {/* Single-use Reset button: EXCLUSIVELY shown while inside the 1-time Demo */}
            {exitDemoAvailable &&
              (!confirmExitDemo ? (
                <button
                  type="button"
                  className="btn btn-magenta btn-sm"
                  onClick={() => setConfirmExitDemo(true)}
                >
                  <LogOut size={14} /> Salir de Demo y Reiniciar para Uso Real (1 solo uso)
                </button>
              ) : (
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn btn-magenta btn-sm"
                    onClick={async () => {
                      await onExitDemoReset();
                      setConfirmExitDemo(false);
                    }}
                  >
                    Confirmar: Limpiar Demo e Iniciar en Real
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setConfirmExitDemo(false)}
                  >
                    Cancelar
                  </button>
                </div>
              ))}

            {/* Permanent anti-wipe badge once in Real Mode */}
            {!demoAvailable && !exitDemoAvailable && (
              <span
                className="div-badge div-emerald"
                title="El reinicio del programa está bloqueado permanentemente para evitar que pierdas tus datos reales por accidente."
                style={{ padding: '6px 10px' }}
              >
                <ShieldCheck size={14} /> Modo Real Protegido (Sin botón de reinicio accidental)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Lifetime KPIs for active currency */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '14px',
          marginBottom: '20px',
        }}
      >
        <div className="neon-card">
          <div className="kpi-label">Meses en {currencyCode}</div>
          <div className="mono text-cyan" style={{ fontSize: '1.55rem', fontWeight: 700 }}>
            {lifetimeStats.monthsTracked}
          </div>
        </div>

        <div className="neon-card">
          <div className="kpi-label">Movimientos en {currencyCode}</div>
          <div className="mono" style={{ fontSize: '1.55rem', fontWeight: 700 }}>
            {lifetimeStats.totalEntries}
          </div>
        </div>

        <div className="neon-card">
          <div className="kpi-label">Invertido Histórico ({currencyCode})</div>
          <div className="mono text-violet" style={{ fontSize: '1.55rem', fontWeight: 700 }}>
            {formatMoney(lifetimeStats.totalSavedInvested, currencySymbol)}
          </div>
        </div>

        <div className="neon-card">
          <div className="kpi-label">Salidas Totales ({currencyCode})</div>
          <div className="mono text-magenta" style={{ fontSize: '1.55rem', fontWeight: 700 }}>
            {formatMoney(lifetimeStats.totalExpenses, currencySymbol)}
          </div>
        </div>
      </div>

      {/* Two Column: Monthly Archive + Day-1 Audit Log */}
      <div className="two-col-grid">
        <div className="neon-card">
          <div className="kpi-header" style={{ marginBottom: '14px' }}>
            <span className="kpi-label">
              <Archive size={16} className="text-cyan" /> Archivo Mensual ({currencyCode}){' '}
              <span className="asian-chip">月別アーカイブ</span>
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {monthSummaries.map(({ month: m, summary: s }) => (
              <div
                key={m.monthKey}
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  background: 'rgba(8, 12, 23, 0.72)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <div
                    style={{
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <Calendar size={14} className="text-cyan" />
                    {formatMonthLabel(m.monthKey)}
                  </div>
                  <div
                    style={{
                      fontSize: '0.77rem',
                      color: 'var(--text-secondary)',
                      marginTop: '3px',
                    }}
                  >
                    Efec:{' '}
                    <span className="mono text-emerald">
                      {formatMoney(s.currentEfectivoBalance, currencySymbol)}
                    </span>{' '}
                    · Transf:{' '}
                    <span className="mono text-violet">
                      {formatMoney(s.currentTransferenciaBalance, currencySymbol)}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Total General
                    </div>
                    <div
                      className={`mono ${
                        s.currentGeneralBalance < 0 ? 'text-magenta' : 'text-cyan'
                      }`}
                      style={{ fontWeight: 700 }}
                    >
                      {formatMoney(s.currentGeneralBalance, currencySymbol)}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => onSelectMonth(m.monthKey)}
                  >
                    Abrir <ExternalLink size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="neon-card">
          <div className="kpi-header" style={{ marginBottom: '14px' }}>
            <span className="kpi-label">
              <History size={16} className="text-emerald" /> Bitácora Continua desde el Día 1{' '}
              <span className="asian-chip">履歴ログ</span>
            </span>
          </div>

          <div
            className="timeline-list"
            style={{ maxHeight: '460px', overflowY: 'auto', paddingRight: '6px' }}
          >
            {db.historyLog.map((ev) => (
                <div key={ev.id} className="timeline-item">
                  <div className="timeline-dot" />
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '8px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <strong style={{ fontSize: '0.88rem' }}>
                        {ev.currencyCode ? `[${ev.currencyCode}] ` : ''}
                        {ev.title}
                      </strong>
                      <span
                        className="mono"
                        style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}
                      >
                        {formatFullDateTime(ev.timestamp)}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: '0.8rem',
                        color: 'var(--text-secondary)',
                        marginTop: '2px',
                      }}
                    >
                      {ev.detail}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};
