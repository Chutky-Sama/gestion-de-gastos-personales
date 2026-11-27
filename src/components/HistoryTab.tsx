import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  Calendar,
  Check,
  Clock,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FolderOpen,
  HardDrive,
  History,
  LogOut,
  Play,
  Power,
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
import {
  AppDatabase,
  AutoBackupConfig,
  BackupFrequency,
  CurrencyLedgerWorkspace,
} from '../../shared/types';
import { DesktopInfo, api } from '../api';
import {
  exportAllEntriesAsCsv,
  exportDatabaseAsJson,
  formatFullDateTime,
  formatMoney,
} from '../utils/format';

const WEEKDAY_NAMES: Record<number, string> = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
  7: 'Domingo',
};

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

  // Scheduled Silent Auto-Backup state
  const [backupCfg, setBackupCfg] = useState<AutoBackupConfig | null>(null);
  const [savingBackupCfg, setSavingBackupCfg] = useState(false);
  const [runningManualBackup, setRunningManualBackup] = useState(false);
  const [backupFeedback, setBackupFeedback] = useState<string | null>(null);

  const showBackupFeedback = useCallback((msg: string) => {
    setBackupFeedback(msg);
    window.setTimeout(() => {
      setBackupFeedback((prev) => (prev === msg ? null : prev));
    }, 4200);
  }, []);

  useEffect(() => {
    api
      .getBackupConfig()
      .then((cfg) => setBackupCfg(cfg))
      .catch(() => {});
  }, []);

  const handleSaveBackupCfg = async (override?: Partial<AutoBackupConfig>) => {
    if (!backupCfg) return;
    setSavingBackupCfg(true);
    try {
      const merged: Partial<AutoBackupConfig> = {
        ...backupCfg,
        ...override,
      };
      const saved = await api.saveBackupConfig(merged);
      setBackupCfg(saved);
      showBackupFeedback(
        saved.enabled
          ? 'Salva automática programada y registrada en Windows (segundo plano silencioso).'
          : 'Salva automática en segundo plano desactivada limpiamente.'
      );
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error guardando la programación de salvas.');
    } finally {
      setSavingBackupCfg(false);
    }
  };

  const handlePickFolder = async () => {
    if (!backupCfg) return;
    try {
      const res = await api.pickBackupFolder();
      if (!res.cancelled && res.path) {
        setBackupCfg({ ...backupCfg, targetDir: res.path });
      }
    } catch {
      // ignore
    }
  };

  const handleRunBackupNow = async () => {
    if (!backupCfg) return;
    setRunningManualBackup(true);
    try {
      // Persist current folder/maxBackups first so run-now uses what's shown on screen
      await api.saveBackupConfig(backupCfg);
      const res = await api.runBackupNow();
      setBackupCfg(res.config);
      showBackupFeedback(
        res.filePath
          ? `Salva creada con éxito: ${res.filePath}`
          : 'Salva creada correctamente en la carpeta configurada.'
      );
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'No se pudo crear la salva en esa carpeta.');
    } finally {
      setRunningManualBackup(false);
    }
  };

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

      {/* Scheduled Silent Background Auto-Backup Card */}
      {backupCfg && (
        <div
          className={`neon-card ${backupCfg.enabled ? 'card-cyan' : ''}`}
          style={{ marginBottom: '20px' }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '14px',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.79rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: backupCfg.enabled ? 'var(--neon-cyan)' : 'var(--text-secondary)',
                  marginBottom: '4px',
                }}
              >
                <HardDrive size={16} /> Salva Automática en Segundo Plano (Sin Abrir el Programa)
              </div>
              <h3 style={{ margin: '0 0 4px', fontSize: '1.08rem' }}>
                {backupCfg.enabled
                  ? backupCfg.frequency === 'weekly'
                    ? `Activa · Cada ${WEEKDAY_NAMES[backupCfg.dayOfWeek] || 'Sábado'} a las ${String(
                        backupCfg.hour
                      ).padStart(2, '0')}:${String(backupCfg.minute).padStart(2, '0')}`
                    : backupCfg.frequency === 'monthly'
                    ? `Activa · Día ${backupCfg.dayOfMonth} de cada mes a las ${String(
                        backupCfg.hour
                      ).padStart(2, '0')}:${String(backupCfg.minute).padStart(2, '0')}`
                    : `Activa · Todos los días a las ${String(backupCfg.hour).padStart(
                        2,
                        '0'
                      )}:${String(backupCfg.minute).padStart(2, '0')}`
                  : 'Desactivada actualmente'}
              </h3>
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                Se ejecuta en modo invisible (0 MB de RAM en reposo) mediante el Programador de
                Tareas de Windows. Si la PC estaba apagada ese día, crea la salva pendiente sola al
                encender el equipo.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                disabled={savingBackupCfg}
                className={`btn btn-sm ${backupCfg.enabled ? 'btn-magenta' : 'btn-emerald'}`}
                onClick={() => handleSaveBackupCfg({ enabled: !backupCfg.enabled })}
              >
                <Power size={14} />
                {backupCfg.enabled ? 'Desactivar Salva Automática' : 'Activar Salva Automática'}
              </button>

              <button
                type="button"
                disabled={runningManualBackup}
                className="btn btn-sm btn-cyan"
                onClick={handleRunBackupNow}
                title="Genera inmediatamente una salva fechada en la carpeta elegida para verificar que todo funciona"
              >
                <Play size={14} />
                {runningManualBackup ? 'Creando salva...' : 'Crear Salva Ahora'}
              </button>
            </div>
          </div>

          <div className="autobackup-grid">
            <div>
              <label className="field-label">Frecuencia</label>
              <select
                className="neon-select"
                value={backupCfg.frequency}
                onChange={(e) =>
                  setBackupCfg({
                    ...backupCfg,
                    frequency: e.target.value as BackupFrequency,
                  })
                }
              >
                <option value="weekly">Semanal (día fijo de la semana)</option>
                <option value="monthly">Mensual (día específico del mes)</option>
                <option value="daily">Diaria (todos los días)</option>
              </select>
            </div>

            <div>
              <label className="field-label">
                {backupCfg.frequency === 'weekly'
                  ? 'Día de la semana'
                  : backupCfg.frequency === 'monthly'
                  ? 'Día del mes (1 al 28)'
                  : 'Día'}
              </label>
              {backupCfg.frequency === 'weekly' ? (
                <select
                  className="neon-select"
                  value={backupCfg.dayOfWeek}
                  onChange={(e) =>
                    setBackupCfg({ ...backupCfg, dayOfWeek: Number(e.target.value) })
                  }
                >
                  {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                    <option key={d} value={d}>
                      Cada {WEEKDAY_NAMES[d]}
                    </option>
                  ))}
                </select>
              ) : backupCfg.frequency === 'monthly' ? (
                <select
                  className="neon-select"
                  value={backupCfg.dayOfMonth}
                  onChange={(e) =>
                    setBackupCfg({ ...backupCfg, dayOfMonth: Number(e.target.value) })
                  }
                >
                  {Array.from({ length: 28 }, (_, idx) => idx + 1).map((d) => (
                    <option key={d} value={d}>
                      Día {d} de cada mes
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  disabled
                  className="neon-input"
                  value="Todos los días"
                />
              )}
            </div>

            <div>
              <label className="field-label">Hora programada</label>
              <input
                type="time"
                className="neon-input mono-input"
                value={`${String(backupCfg.hour).padStart(2, '0')}:${String(
                  backupCfg.minute
                ).padStart(2, '0')}`}
                onChange={(e) => {
                  const [hh, mm] = (e.target.value || '20:00').split(':').map(Number);
                  setBackupCfg({
                    ...backupCfg,
                    hour: Number.isFinite(hh) ? hh : 20,
                    minute: Number.isFinite(mm) ? mm : 0,
                  });
                }}
              />
            </div>

            <div>
              <label className="field-label">Rotación de copias</label>
              <select
                className="neon-select"
                value={backupCfg.maxBackups}
                onChange={(e) =>
                  setBackupCfg({ ...backupCfg, maxBackups: Number(e.target.value) })
                }
              >
                <option value={5}>Conservar últimas 5 salvas</option>
                <option value={12}>Conservar últimas 12 salvas</option>
                <option value={24}>Conservar últimas 24 salvas</option>
                <option value={50}>Conservar últimas 50 salvas</option>
              </select>
            </div>
          </div>

          {/* Target Folder Row */}
          <div style={{ marginTop: '12px' }}>
            <label className="field-label">
              Carpeta de destino (recomendado: otra partición como D:\ o memoria USB)
            </label>
            <div className="autobackup-folder-row">
              <input
                type="text"
                className="neon-input mono-input"
                style={{ flex: '1 1 320px' }}
                placeholder="Ej. D:\Mis Salvas Kakeibo"
                value={backupCfg.targetDir}
                onChange={(e) => setBackupCfg({ ...backupCfg, targetDir: e.target.value })}
              />
              {desktopInfo.isDesktop && (
                <>
                  <button
                    type="button"
                    className="btn btn-sm btn-violet"
                    onClick={handlePickFolder}
                  >
                    <FolderOpen size={14} /> Elegir carpeta en Windows...
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => api.openBackupFolder()}
                  >
                    <ExternalLink size={14} /> Abrir carpeta
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Catch-up checkbox + Save button */}
          <div
            style={{
              marginTop: '14px',
              paddingTop: '12px',
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '0.82rem',
                color: 'var(--text-primary)',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={backupCfg.runOnStartupIfMissed}
                onChange={(e) =>
                  setBackupCfg({ ...backupCfg, runOnStartupIfMissed: e.target.checked })
                }
              />
              <span>
                Si la PC estaba apagada ese día, crear la salva pendiente automáticamente apenas
                se encienda Windows
              </span>
            </label>

            <button
              type="button"
              disabled={savingBackupCfg}
              className="btn btn-sm btn-emerald"
              onClick={() => handleSaveBackupCfg()}
            >
              <Check size={14} />
              {savingBackupCfg ? 'Guardando...' : 'Guardar Ajustes de Salva'}
            </button>
          </div>

          {/* Status & Recent Backups Strip */}
          <div
            style={{
              marginTop: '12px',
              padding: '10px 12px',
              borderRadius: '9px',
              background: 'rgba(8, 12, 23, 0.78)',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.79rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '8px',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={14} className="text-cyan" />
                <strong>Última salva creada:</strong>{' '}
                {backupCfg.lastBackupAt ? (
                  <span className="mono text-emerald">{backupCfg.lastBackupAt}</span>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>Ninguna todavía</span>
                )}
              </span>

              {backupCfg.recentBackups && backupCfg.recentBackups.length > 0 && (
                <span className="mono" style={{ color: 'var(--text-secondary)' }}>
                  Copias guardadas en carpeta: <strong>{backupCfg.recentBackups.length}</strong> /{' '}
                  {backupCfg.maxBackups}
                </span>
              )}
            </div>

            {backupCfg.lastBackupFile && (
              <div className="mono" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                Archivo más reciente: {backupCfg.lastBackupFile}
              </div>
            )}

            {backupCfg.lastError && (
              <div className="text-magenta" style={{ fontSize: '0.76rem' }}>
                Aviso en último intento: {backupCfg.lastError}
              </div>
            )}

            {backupFeedback && (
              <div
                className="text-emerald"
                style={{ fontWeight: 700, fontSize: '0.8rem', marginTop: '2px' }}
              >
                ✓ {backupFeedback}
              </div>
            )}

            {backupCfg.recentBackups && backupCfg.recentBackups.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  gap: '6px',
                  flexWrap: 'wrap',
                  marginTop: '4px',
                }}
              >
                {backupCfg.recentBackups.slice(0, 4).map((bf) => (
                  <span
                    key={bf.fileName}
                    className="div-badge"
                    style={{
                      background: 'rgba(0, 240, 255, 0.08)',
                      border: '1px solid rgba(0, 240, 255, 0.25)',
                      color: 'var(--text-primary)',
                      fontSize: '0.7rem',
                    }}
                  >
                    {bf.fileName} ({Math.max(1, Math.round(bf.sizeBytes / 1024))} KB)
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

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
