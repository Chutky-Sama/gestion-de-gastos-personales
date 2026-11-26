import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Coins,
  History,
  Layers,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import {
  computeAllTimeInvestmentTotals,
  computeMonthSummary,
  daysSinceFirstUse,
  formatMonthLabel,
  getCurrentMonthKey,
  getTodayDateString,
  shiftMonthKey,
} from '../shared/calculations';
import { AppDatabase, InvestmentDefinition } from '../shared/types';
import { DesktopInfo, api } from './api';
import { AdjustBalanceModal } from './components/AdjustBalanceModal';
import { EnvelopesTab } from './components/EnvelopesTab';
import { HistoryTab } from './components/HistoryTab';
import { InvestmentsTab } from './components/InvestmentsTab';
import { LedgerTab } from './components/LedgerTab';
import { SalaryQuickModal } from './components/SalaryQuickModal';
import { formatMoney } from './utils/format';

type ActiveTab = 'ledger' | 'envelopes' | 'investments' | 'history';

export const App: React.FC = () => {
  const [db, setDb] = useState<AppDatabase | null>(null);
  const [activeMonthKey, setActiveMonthKey] = useState<string>(getCurrentMonthKey());
  const [activeTab, setActiveTab] = useState<ActiveTab>('ledger');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [isSalaryModalOpen, setIsSalaryModalOpen] = useState(false);
  const [desktopInfo, setDesktopInfo] = useState<DesktopInfo>({ isDesktop: false });

  const showToast = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    Promise.all([api.getDesktopInfo(), api.getState()])
      .then(([info, data]) => {
        setDesktopInfo(info);
        setDb(data);
        const curr = getCurrentMonthKey();
        if (data.months[curr]) {
          setActiveMonthKey(curr);
        } else {
          const keys = Object.keys(data.months).sort();
          if (keys.length > 0) setActiveMonthKey(keys[keys.length - 1]);
        }
      })
      .catch((err) => setError(err.message || 'Error al cargar la libreta'))
      .finally(() => setLoading(false));
  }, []);

  const handleChangeMonth = async (targetKey: string) => {
    setActiveMonthKey(targetKey);
    if (db && !db.months[targetKey]) {
      const updated = await api.ensureMonth(targetKey);
      setDb(updated);
      showToast(`Libreta de ${formatMonthLabel(targetKey)} lista`);
    }
  };

  const allTimeInvestmentTotals = useMemo(
    () => (db ? computeAllTimeInvestmentTotals(db) : {}),
    [db]
  );

  const currentMonth = useMemo(() => {
    if (!db) return null;
    return db.months[activeMonthKey] || Object.values(db.months)[0] || null;
  }, [db, activeMonthKey]);

  const previousExistingMonthKey = useMemo(() => {
    if (!db || !currentMonth) return undefined;
    const prevKeys = Object.keys(db.months)
      .filter((k) => k < currentMonth.monthKey)
      .sort();
    return prevKeys.length > 0 ? prevKeys[prevKeys.length - 1] : undefined;
  }, [db, currentMonth]);

  const monthSummary = useMemo(() => {
    if (!db || !currentMonth) return null;
    return computeMonthSummary(currentMonth, db.investments, allTimeInvestmentTotals);
  }, [db, currentMonth, allTimeInvestmentTotals]);

  if (loading) {
    return (
      <div className="app-shell" style={{ textAlign: 'center', paddingTop: '120px' }}>
        <div className="hanko-seal" style={{ margin: '0 auto 16px' }}>
          <span>家</span>
          <span>計</span>
        </div>
        <div className="text-cyan" style={{ fontWeight: 700 }}>
          Cargando tu Libreta Personal Kakeibo...
        </div>
      </div>
    );
  }

  if (error || !db || !currentMonth || !monthSummary) {
    return (
      <div className="app-shell">
        <div className="neon-card card-magenta">
          <h3>No se pudo conectar con el almacenamiento local</h3>
          <p>{error || 'Estado no disponible'}</p>
        </div>
      </div>
    );
  }

  const sym = db.profile.currencySymbol;
  const monthLabel = formatMonthLabel(currentMonth.monthKey);
  const dayNumber = daysSinceFirstUse(db.firstUseDate);
  const isFreshStart =
    db.profile.currentSalary === 0 &&
    currentMonth.salary === 0 &&
    currentMonth.entries.length === 0;

  const committedSpent =
    monthSummary.envelopes.hogar.spent +
    monthSummary.envelopes.deudas.spent +
    (currentMonth.hasManutenciones ? monthSummary.envelopes.manutenciones.spent : 0) +
    monthSummary.envelopes.inversiones.spent +
    monthSummary.envelopes.custom.reduce((acc, c) => acc + c.spent, 0);

  const committedPct =
    monthSummary.committedBudgetTotal > 0
      ? Math.min(100, Math.round((committedSpent / monthSummary.committedBudgetTotal) * 100))
      : 0;

  const handleQuickInvestmentContribution = async (
    inv: InvestmentDefinition,
    amount: number
  ) => {
    const today = getTodayDateString();
    const entryDate = today.startsWith(currentMonth.monthKey)
      ? today
      : `${currentMonth.monthKey}-01`;
    const updated = await api.addEntry(currentMonth.monthKey, {
      date: entryDate,
      type: 'expense',
      amount,
      concept: `Aporte de inversión: ${inv.name}`,
      division: 'inversiones',
      investmentId: inv.id,
      pillar: 'patrimonio',
    });
    setDb(updated);
    showToast(`Aporte a ${inv.name} guardado en la libreta`);
  };

  return (
    <div className="app-shell">
      {/* Top Bar */}
      <header className="topbar">
        <div className="brand-cluster">
          <div className="hanko-seal" title="Kakeibo · Libro de Cuentas del Hogar">
            <span>家</span>
            <span>計</span>
          </div>
          <div className="brand-titles">
            <h1>
              <span>{db.profile.ledgerName}</span>
              <span className="neon-title-accent">// NEON</span>
            </h1>
            <p className="brand-subtitle">
              家計簿 Kakeibo · 가계부 Gagyebu · 记账本 Ji Zhang Ben · Gestión Mensual
            </p>
          </div>
        </div>

        <div className="topbar-controls">
          <div className="day1-pill" title="Registro persistente guardado desde el primer día de uso">
            <span className="pulse-dot" />
            <span>Día #{dayNumber} de registro · Auto-guardado activo</span>
          </div>

          <div className="month-switcher">
            <button
              type="button"
              className="month-nav-btn"
              title="Mes anterior"
              onClick={() => handleChangeMonth(shiftMonthKey(currentMonth.monthKey, -1))}
            >
              <ChevronLeft size={18} />
            </button>
            <div className="month-current-display">{monthLabel}</div>
            <button
              type="button"
              className="month-nav-btn"
              title="Mes siguiente"
              onClick={() => handleChangeMonth(shiftMonthKey(currentMonth.monthKey, 1))}
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <button
            type="button"
            className="btn btn-cyan"
            onClick={() => setIsSalaryModalOpen(true)}
          >
            <Wallet size={16} />
            Salario: <span className="mono">{formatMoney(db.profile.currentSalary, sym)}</span>
          </button>
        </div>
      </header>

      {/* First-Time Welcome Banner when starting empty */}
      {isFreshStart && (
        <section className="setup-banner">
          <div className="setup-banner-text">
            <h2>¡Tu libreta personal ya está guardando desde hoy (Día #1)!</h2>
            <p>
              Define cuánto es tu salario actual y divídelo entre Hogar, Deudas, Manutenciones,
              Inversiones y Dinero de Bolsillo, o prueba un ejemplo interactivo en 1 clic.
            </p>
          </div>
          <div className="setup-banner-actions">
            <button
              type="button"
              className="btn btn-cyan"
              onClick={() => setIsSalaryModalOpen(true)}
            >
              <Wallet size={16} /> 1. Definir Mi Salario Actual
            </button>
            <button
              type="button"
              className="btn btn-emerald"
              onClick={() => setActiveTab('envelopes')}
            >
              <Layers size={16} /> 2. Dividir Mi Dinero
            </button>
            <button
              type="button"
              className="btn btn-violet"
              onClick={async () => {
                const updated = await api.loadDemo();
                setDb(updated);
                showToast('Ejemplo demostrativo cargado (puedes limpiarlo cuando quieras)');
              }}
            >
              <Sparkles size={16} /> Cargar Ejemplo Demo
            </button>
          </div>
        </section>
      )}

      {/* 4-Card Neon Hero Strip */}
      <section className="hero-grid">
        {/* 1. General Money of the Month */}
        <div
          className={`neon-card ${
            monthSummary.currentGeneralBalance < 0 ? 'card-magenta' : 'card-cyan'
          }`}
        >
          <div className="kpi-header">
            <span className="kpi-label">
              Dinero General del Mes <span className="asian-chip">残高 · 잔액</span>
            </span>
          </div>

          <div
            className={`kpi-value ${
              monthSummary.currentGeneralBalance < 0 ? 'text-magenta' : 'text-cyan'
            }`}
          >
            {formatMoney(monthSummary.currentGeneralBalance, sym)}
          </div>

          <div className="kpi-subrow">
            <span>
              Entradas:{' '}
              <strong className="mono text-emerald">
                {formatMoney(monthSummary.totalInflowAll, sym)}
              </strong>
            </span>
            <span>
              Salidas:{' '}
              <strong className="mono text-magenta">
                -{formatMoney(monthSummary.totalOutflowAll, sym)}
              </strong>
            </span>
          </div>

          <div className="kpi-actions">
            <button
              type="button"
              className="btn btn-sm btn-cyan"
              onClick={() => setIsAdjustOpen(true)}
            >
              <SlidersHorizontal size={14} /> Subir / Bajar Dinero General
            </button>
          </div>
        </div>

        {/* 2. Monthly Salary & Inflows */}
        <div className="neon-card">
          <div className="kpi-header">
            <span className="kpi-label">
              Salario Asignado al Mes <span className="asian-chip">月収</span>
            </span>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => setIsSalaryModalOpen(true)}
            >
              Cambiar
            </button>
          </div>

          <div className="kpi-value">{formatMoney(monthSummary.salary, sym)}</div>

          <div className="kpi-subrow">
            <span>
              Extras (+):{' '}
              <strong className="mono text-emerald">
                {formatMoney(
                  monthSummary.totalExtraIncome + monthSummary.totalAdjustmentsUp,
                  sym,
                  true
                )}
              </strong>
            </span>
            {monthSummary.carryover !== 0 && (
              <span>
                Inicial:{' '}
                <strong className="mono">
                  {formatMoney(monthSummary.carryover, sym, true)}
                </strong>
              </span>
            )}
          </div>
        </div>

        {/* 3. Committed Divisions */}
        <div className="neon-card card-violet">
          <div className="kpi-header">
            <span className="kpi-label">
              Dividido en Compromisos <span className="asian-chip">予算</span>
            </span>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => setActiveTab('envelopes')}
            >
              Dividir
            </button>
          </div>

          <div className="kpi-value text-violet">
            {formatMoney(monthSummary.committedBudgetTotal, sym)}
          </div>

          <div className="progress-track" style={{ marginBottom: '8px' }}>
            <div className="progress-fill fill-violet" style={{ width: `${committedPct}%` }} />
          </div>

          <div className="kpi-subrow">
            <span>
              Ejecutado: <strong className="mono">{formatMoney(committedSpent, sym)}</strong>
            </span>
            <span>{committedPct}% cubierto</span>
          </div>
        </div>

        {/* 4. Pocket Money (if left over) */}
        <div
          className={`neon-card ${
            monthSummary.pocketStatus === 'deficit'
              ? 'card-magenta'
              : monthSummary.pocketStatus === 'surplus'
              ? 'card-emerald'
              : ''
          }`}
        >
          <div className="kpi-header">
            <span className="kpi-label">
              <Coins size={14} /> Dinero de Bolsillo <span className="asian-chip">小遣 · 용돈</span>
            </span>
            <span
              className={`div-badge ${
                monthSummary.pocketStatus === 'deficit'
                  ? 'div-magenta'
                  : monthSummary.pocketStatus === 'surplus'
                  ? 'div-emerald'
                  : 'div-cyan'
              }`}
            >
              {monthSummary.pocketStatus === 'deficit'
                ? 'Déficit'
                : monthSummary.pocketStatus === 'surplus'
                ? 'Sí queda'
                : 'Exacto'}
            </span>
          </div>

          <div
            className={`kpi-value ${
              monthSummary.pocketStatus === 'deficit'
                ? 'text-magenta'
                : monthSummary.pocketMoneyRemaining < 0
                ? 'text-magenta'
                : 'text-emerald'
            }`}
          >
            {monthSummary.pocketStatus === 'deficit'
              ? `-${formatMoney(monthSummary.budgetDeficit, sym)}`
              : formatMoney(monthSummary.pocketMoneyRemaining, sym)}
          </div>

          <div className="kpi-subrow">
            {monthSummary.pocketStatus === 'deficit' ? (
              <span className="text-magenta">
                Tus divisiones superan tu dinero del mes
              </span>
            ) : (
              <>
                <span>
                  Bolsillo mes:{' '}
                  <strong className="mono">
                    {formatMoney(monthSummary.pocketMoneyPlanned, sym)}
                  </strong>
                </span>
                <span>
                  Usado:{' '}
                  <strong className="mono">
                    {formatMoney(monthSummary.pocketMoneySpent, sym)}
                  </strong>
                </span>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Navigation Tabs */}
      <nav className="nav-tabs" aria-label="Secciones principales">
        <button
          type="button"
          className={`nav-tab ${activeTab === 'ledger' ? 'active' : ''}`}
          onClick={() => setActiveTab('ledger')}
        >
          <BookOpen size={17} />
          <span>Libreta del Mes</span>
          <span className="tab-badge">{currentMonth.entries.length}</span>
        </button>

        <button
          type="button"
          className={`nav-tab ${activeTab === 'envelopes' ? 'active' : ''}`}
          onClick={() => setActiveTab('envelopes')}
        >
          <Layers size={17} />
          <span>División del Salario</span>
        </button>

        <button
          type="button"
          className={`nav-tab ${activeTab === 'investments' ? 'active' : ''}`}
          onClick={() => setActiveTab('investments')}
        >
          <TrendingUp size={17} />
          <span>Mis Inversiones</span>
          <span className="tab-badge">{db.investments.filter((i) => i.active).length}</span>
        </button>

        <button
          type="button"
          className={`nav-tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <History size={17} />
          <span>Registro Día 1</span>
          <span className="tab-badge">Día #{dayNumber}</span>
        </button>
      </nav>

      {/* Active View */}
      <main>
        {activeTab === 'ledger' && (
          <LedgerTab
            month={currentMonth}
            summary={monthSummary}
            investments={db.investments}
            currencySymbol={sym}
            onAddEntry={async (payload) => {
              const updated = await api.addEntry(currentMonth.monthKey, payload);
              setDb(updated);
              showToast('Movimiento asentado en tu libreta');
            }}
            onUpdateEntry={async (entryId, payload) => {
              const updated = await api.updateEntry(currentMonth.monthKey, entryId, payload);
              setDb(updated);
              showToast('Movimiento actualizado');
            }}
            onDeleteEntry={async (entryId) => {
              const updated = await api.deleteEntry(currentMonth.monthKey, entryId);
              setDb(updated);
              showToast('Movimiento eliminado de la libreta');
            }}
            onSaveReflection={async (reflection) => {
              const updated = await api.updateMonthPlan(currentMonth.monthKey, { reflection });
              setDb(updated);
              showToast('Reflexión Kakeibo guardada');
            }}
            onOpenAdjustModal={() => setIsAdjustOpen(true)}
            onNavigateTab={(t) => setActiveTab(t)}
          />
        )}

        {activeTab === 'envelopes' && (
          <EnvelopesTab
            month={currentMonth}
            previousMonthKey={previousExistingMonthKey}
            summary={monthSummary}
            investments={db.investments}
            currencySymbol={sym}
            onSavePlan={async (payload) => {
              const updated = await api.updateMonthPlan(currentMonth.monthKey, payload);
              setDb(updated);
              showToast('División mensual y sobres guardados');
            }}
            onBringCarryover={async (prevKey) => {
              const updated = await api.ensureMonth(currentMonth.monthKey, prevKey);
              setDb(updated);
              showToast(`Saldo arrastrado desde ${formatMonthLabel(prevKey)}`);
            }}
            onNavigateInvestments={() => setActiveTab('investments')}
          />
        )}

        {activeTab === 'investments' && (
          <InvestmentsTab
            monthKey={currentMonth.monthKey}
            investments={db.investments}
            summary={monthSummary}
            allTimeTotals={allTimeInvestmentTotals}
            currencySymbol={sym}
            onCreateInvestment={async (payload) => {
              const updated = await api.createInvestment({
                ...payload,
                monthKey: currentMonth.monthKey,
              });
              setDb(updated);
              showToast(`Inversión "${payload.name}" agregada`);
            }}
            onUpdateInvestment={async (id, payload) => {
              const updated = await api.updateInvestment(id, {
                ...payload,
                monthKey: currentMonth.monthKey,
              });
              setDb(updated);
              showToast('Inversión actualizada');
            }}
            onDeleteInvestment={async (id) => {
              const updated = await api.deleteInvestment(id);
              setDb(updated);
              showToast('Inversión retirada');
            }}
            onQuickContribute={handleQuickInvestmentContribution}
          />
        )}

        {activeTab === 'history' && (
          <HistoryTab
            db={db}
            activeMonthKey={currentMonth.monthKey}
            desktopStoragePath={desktopInfo.storagePath}
            onOpenDataFolder={
              desktopInfo.isDesktop
                ? async () => {
                    await api.openDataFolder();
                    showToast('Abriendo carpeta en el Explorador de Windows...');
                  }
                : undefined
            }
            onSelectMonth={(mk) => {
              handleChangeMonth(mk);
              setActiveTab('ledger');
            }}
            onLoadDemo={async () => {
              const updated = await api.loadDemo();
              setDb(updated);
              setActiveMonthKey(getCurrentMonthKey());
              setActiveTab('ledger');
              showToast('Ejemplo demostrativo cargado');
            }}
            onResetClean={async () => {
              const updated = await api.resetDatabase();
              setDb(updated);
              setActiveMonthKey(getCurrentMonthKey());
              setActiveTab('ledger');
              showToast('Libreta reiniciada en blanco');
            }}
            onImportBackup={async (backup) => {
              const updated = await api.importBackup(backup);
              setDb(updated);
              showToast('Respaldo restaurado correctamente');
            }}
          />
        )}
      </main>

      {/* Modals */}
      <AdjustBalanceModal
        isOpen={isAdjustOpen}
        onClose={() => setIsAdjustOpen(false)}
        currentBalance={monthSummary.currentGeneralBalance}
        currencySymbol={sym}
        monthLabel={monthLabel}
        onConfirm={async (payload) => {
          const updated = await api.adjustGeneralBalance(currentMonth.monthKey, payload);
          setDb(updated);
          showToast('Dinero general del mes actualizado en la libreta');
        }}
      />

      <SalaryQuickModal
        isOpen={isSalaryModalOpen}
        onClose={() => setIsSalaryModalOpen(false)}
        profile={db.profile}
        monthLabel={monthLabel}
        onSave={async (payload) => {
          const updated = await api.updateProfile({
            ledgerName: payload.ledgerName,
            currencyCode: payload.currencyCode,
            currencySymbol: payload.currencySymbol,
            currentSalary: payload.currentSalary,
            hasManutencionesDefault: payload.hasManutencionesDefault,
            syncMonthKey: payload.applyToCurrentMonth ? currentMonth.monthKey : undefined,
          });
          if (payload.applyToCurrentMonth) {
            const withManut = await api.updateMonthPlan(currentMonth.monthKey, {
              hasManutenciones: payload.hasManutencionesDefault,
            });
            setDb(withManut);
          } else {
            setDb(updated);
          }
          showToast('Salario actual y preferencias guardados');
        }}
      />

      {toast && <div className="toast-banner">✓ {toast}</div>}
    </div>
  );
};
