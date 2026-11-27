import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  BookOpen,
  Coins,
  Edit3,
  HardDrive,
  History,
  Layers,
  LogOut,
  PieChart,
  Plus,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import {
  computeAllTimeInvestmentTotals,
  computeMonthSummary,
  formatMonthLabel,
  getCurrentMonthKey,
  getTodayDateString,
  shiftMonthKey,
} from '../shared/calculations';
import {
  canExitDemoReset,
  canStartDemo,
  getActiveWorkspace,
} from '../shared/ledgerCore';
import { AppDatabase, PaymentMethod } from '../shared/types';
import { DesktopInfo, api } from './api';
import { AdjustBalanceModal } from './components/AdjustBalanceModal';
import { CurrencyExchangeTab } from './components/CurrencyExchangeTab';
import { EnvelopesTab } from './components/EnvelopesTab';
import { ExtendedDatePicker } from './components/ExtendedDatePicker';
import { HistoryTab } from './components/HistoryTab';
import { InvestmentsTab } from './components/InvestmentsTab';
import { LedgerTab } from './components/LedgerTab';
import { ReportsTab } from './components/ReportsTab';
import { SalaryQuickModal } from './components/SalaryQuickModal';
import { formatMoney } from './utils/format';

type ActiveTab =
  | 'ledger'
  | 'envelopes'
  | 'investments'
  | 'reports'
  | 'exchange'
  | 'history';

export const App: React.FC = () => {
  const [db, setDb] = useState<AppDatabase | null>(null);
  const [desktopInfo, setDesktopInfo] = useState<DesktopInfo>({ isDesktop: false });
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeMonthKey, setActiveMonthKey] = useState<string>(getCurrentMonthKey());
  const [selectedDayFilter, setSelectedDayFilter] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('ledger');

  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [adjustDefaultChannel, setAdjustDefaultChannel] = useState<PaymentMethod>('efectivo');
  const [isSalaryModalOpen, setIsSalaryModalOpen] = useState(false);
  const [confirmTopDemoExit, setConfirmTopDemoExit] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 3400);
  }, []);

  const fetchInitial = useCallback(async () => {
    try {
      setLoading(true);
      const [info, state] = await Promise.all([api.getDesktopInfo(), api.getState()]);
      setDesktopInfo(info);
      const currentMk = getCurrentMonthKey();
      const activeWs = getActiveWorkspace(state);
      if (!activeWs.months[currentMk]) {
        const sortedKeys = Object.keys(activeWs.months).sort();
        const prevKey = sortedKeys.filter((k) => k < currentMk).pop();
        const ensured = await api.ensureMonth(currentMk, prevKey);
        setDb(ensured);
      } else {
        setDb(state);
      }
      setActiveMonthKey(currentMk);
      setErrorMsg(null);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error cargando la libreta');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInitial();
  }, [fetchInitial]);

  const handleSelectCurrency = async (currencyCode: string) => {
    if (!db || db.profile.currencyCode === currencyCode) return;
    try {
      let updated = await api.selectCurrency(currencyCode);
      const ws = getActiveWorkspace(updated);
      if (!ws.months[activeMonthKey]) {
        const sortedKeys = Object.keys(ws.months).sort();
        const prevKey = sortedKeys.filter((k) => k < activeMonthKey).pop();
        updated = await api.ensureMonth(activeMonthKey, prevKey);
      }
      setDb(updated);
      showToast(`Libreta cambiada a ${currencyCode}`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error cambiando moneda');
    }
  };

  const handleSelectMonth = async (targetMonthKey: string) => {
    if (!db) return;
    const ws = getActiveWorkspace(db);
    if (!ws.months[targetMonthKey]) {
      const sortedKeys = Object.keys(ws.months).sort();
      const prevKey = sortedKeys.filter((k) => k < targetMonthKey).pop();
      const updated = await api.ensureMonth(targetMonthKey, prevKey);
      setDb(updated);
    }
    setActiveMonthKey(targetMonthKey);
  };

  const activeWorkspace = useMemo(() => {
    if (!db) return null;
    return getActiveWorkspace(db);
  }, [db]);

  const activeMonth = useMemo(() => {
    if (!activeWorkspace) return null;
    return (
      activeWorkspace.months[activeMonthKey] ||
      Object.values(activeWorkspace.months)[0] ||
      null
    );
  }, [activeWorkspace, activeMonthKey]);

  const summary = useMemo(() => {
    if (!activeWorkspace || !activeMonth) return null;
    return computeMonthSummary(activeMonth, activeWorkspace.investments);
  }, [activeWorkspace, activeMonth]);

  const allTimeInvestmentTotals = useMemo(() => {
    if (!activeWorkspace) return {};
    return computeAllTimeInvestmentTotals(activeWorkspace.months, activeWorkspace.investments);
  }, [activeWorkspace]);

  const previousMonthKey = useMemo(() => {
    if (!activeWorkspace) return undefined;
    const prev = shiftMonthKey(activeMonthKey, -1);
    return activeWorkspace.months[prev] ? prev : undefined;
  }, [activeWorkspace, activeMonthKey]);

  if (loading) {
    return (
      <div className="app-shell" style={{ textAlign: 'center', paddingTop: '110px' }}>
        <img
          src="/icon-256.png"
          alt="Sello personal"
          className="personal-seal-img"
          style={{ width: '84px', height: '84px', margin: '0 auto 16px', display: 'block' }}
        />
        <h2 style={{ margin: '0 0 8px' }}>Abriendo tu Libreta Kakeibo...</h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          Cargando saldos en paralelo (Efectivo y Transferencia) desde el Día 1
        </p>
      </div>
    );
  }

  if (errorMsg || !db || !activeWorkspace || !activeMonth || !summary) {
    return (
      <div className="app-shell" style={{ textAlign: 'center', paddingTop: '100px' }}>
        <h2 className="text-magenta">No se pudo cargar la libreta</h2>
        <p style={{ color: 'var(--text-secondary)' }}>{errorMsg}</p>
        <button type="button" className="btn btn-cyan" onClick={fetchInitial}>
          Reintentar
        </button>
      </div>
    );
  }

  const currencySymbol = activeWorkspace.currencySymbol;
  const currencyCode = activeWorkspace.currencyCode;
  const customHogarCategories = db.profile.customHogarCategories || [];
  const demoAvailable = canStartDemo(db);
  const exitDemoAvailable = canExitDemoReset(db);

  const isSetupEmpty =
    !db.isDemoActive &&
    activeWorkspace.currentSalary === 0 &&
    activeMonth.salary === 0 &&
    activeMonth.entries.length === 0;

  return (
    <div className="app-shell">
      {/* Top Bar: Left customizable title + separated pill; Right pinned currency/calendar/salary */}
      <header className="topbar">
        <div className="brand-cluster">
          <img
            src="/icon-256.png"
            alt="Mi Sello Personal"
            className="personal-seal-img"
          />
          <div className="brand-title">
            <div className="brand-title-row">
              <h1
                className="ledger-custom-name"
                title="Clic para cambiar el nombre personalizado de tu libreta"
                onClick={() => setIsSalaryModalOpen(true)}
              >
                <span>{db.profile.ledgerName}</span>
                <Edit3 size={14} className="ledger-edit-hint" />
              </h1>
              <span className="brand-badge">Efectivo · Transferencia</span>
            </div>
            <p className="brand-status-line">
              <span className="pulse-dot" />
              {desktopInfo.isDesktop ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  <HardDrive size={12} className="text-cyan" /> Escritorio Windows · Guardado
                  Continuo Día 1
                </span>
              ) : (
                <span>Guardado continuo desde el Día 1 · CUP / USD en paralelo</span>
              )}
            </p>
          </div>
        </div>

        <div className="topbar-controls">
          {/* Multi-Currency Parallel Switcher (CUP / USD / MLC...) */}
          <div className="currency-switcher" title="Cambiar de libreta de moneda">
            {(db.profile.enabledCurrencies || ['CUP', 'USD']).map((code) => (
              <button
                key={code}
                type="button"
                className={`currency-chip-btn ${currencyCode === code ? 'active' : ''}`}
                onClick={() => handleSelectCurrency(code)}
              >
                {code}
              </button>
            ))}
            <button
              type="button"
              className="icon-btn"
              style={{ width: '28px', height: '28px' }}
              title="Habilitar o configurar monedas (CUP, USD, MLC, EUR...)"
              onClick={() => setIsSalaryModalOpen(true)}
            >
              <Plus size={14} />
            </button>
          </div>

          {/* Improvement #6: Extended Calendar & Multi-Year/Month Navigator */}
          <ExtendedDatePicker
            activeMonthKey={activeMonthKey}
            selectedDayFilter={selectedDayFilter}
            workspace={activeWorkspace}
            onSelectMonth={(mk) => handleSelectMonth(mk)}
            onSelectDayFilter={(dateStr) => {
              setSelectedDayFilter(dateStr);
              if (dateStr && activeTab !== 'ledger') {
                setActiveTab('ledger');
              }
            }}
          />

          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => setIsSalaryModalOpen(true)}
          >
            <Settings size={15} />
            Salario ({currencyCode})
          </button>
        </div>
      </header>

      {/* Active One-Time Demo Banner (with Single-Use Reset to Real Mode) */}
      {exitDemoAvailable && (
        <div className="demo-active-banner">
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontWeight: 700,
                color: 'var(--neon-magenta)',
                marginBottom: '3px',
              }}
            >
              <Sparkles size={16} /> MODO DEMO DE UN SOLO USO ACTIVO (CUP y USD de prueba)
            </div>
            <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
              Explora libremente Efectivo, Transferencia y cambios de moneda. Cuando termines, usa
              el botón de al lado para limpiar la Demo e iniciar tu libreta real{' '}
              <strong>
                (luego el reinicio desaparecerá para siempre y tus datos reales no podrán borrarse
                por error)
              </strong>
              .
            </div>
          </div>

          {!confirmTopDemoExit ? (
            <button
              type="button"
              className="btn btn-magenta btn-sm"
              onClick={() => setConfirmTopDemoExit(true)}
            >
              <LogOut size={15} /> Salir de Demo e Iniciar Mi Libreta Real (1 solo uso)
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-emerald btn-sm"
                onClick={async () => {
                  const next = await api.resetDatabase();
                  setDb(next);
                  setConfirmTopDemoExit(false);
                  showToast(
                    'Demo finalizada. Tu libreta real está limpia y protegida contra borrado.'
                  );
                }}
              >
                <ShieldCheck size={15} /> Confirmar: Limpiar Demo y Proteger Modo Real
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setConfirmTopDemoExit(false)}
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}

      {/* First-Time / Currency Setup Banner */}
      {isSetupEmpty && (
        <div className="setup-banner">
          <div className="setup-banner-text">
            <h2>Configura tu libreta en {currencyCode} (Efectivo y Transferencia)</h2>
            <p>
              Ingresa tu salario actual en <strong>Efectivo</strong> y/o{' '}
              <strong>Transferencia</strong> para {currencyCode}, divide tus sobres del mes
              {demoAvailable ? ' o prueba por única vez la Demo interactiva.' : '.'}
            </p>
          </div>
          <div className="setup-banner-actions">
            <button
              type="button"
              className="btn btn-cyan"
              onClick={() => setIsSalaryModalOpen(true)}
            >
              1. Configurar Salario ({currencyCode})
            </button>
            <button
              type="button"
              className="btn btn-emerald"
              onClick={() => setActiveTab('envelopes')}
            >
              2. Dividir Mes en Sobres
            </button>
            {demoAvailable && (
              <button
                type="button"
                className="btn btn-violet"
                onClick={async () => {
                  const next = await api.loadDemo();
                  setDb(next);
                  setActiveMonthKey(getCurrentMonthKey());
                  showToast('Demo de 1 solo uso cargada (incluye ejemplos en CUP y USD)');
                }}
              >
                <Sparkles size={15} /> Probar Demo (1 solo uso)
              </button>
            )}
          </div>
        </div>
      )}

      {/* Hero 4 Financial KPIs */}
      <section className="hero-grid">
        {/* 1. General Money with Parallel Efectivo & Transferencia */}
        <div
          className={`neon-card ${
            summary.currentGeneralBalance < 0 ? 'card-magenta' : 'card-cyan'
          }`}
        >
          <div className="kpi-header">
            <span className="kpi-label">
              Dinero General ({currencyCode}) <span className="asian-chip">総残高</span>
            </span>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              style={{ padding: '4px 9px', fontSize: '0.73rem' }}
              onClick={() => {
                setAdjustDefaultChannel('efectivo');
                setIsAdjustOpen(true);
              }}
            >
              <ArrowUpRight size={13} className="text-emerald" />
              <ArrowDownRight size={13} className="text-magenta" />
              Modificar
            </button>
          </div>

          <div
            className={`kpi-value ${
              summary.currentGeneralBalance < 0 ? 'text-magenta' : 'text-cyan'
            }`}
            style={{ marginBottom: '6px' }}
          >
            {formatMoney(summary.currentGeneralBalance, currencySymbol)}
          </div>

          {/* Parallel Efectivo & Transferencia Boxes */}
          <div className="channel-mini-grid">
            <div
              className="channel-mini-box"
              title="Clic para subir, bajar o cuadrar tu Efectivo"
              onClick={() => {
                setAdjustDefaultChannel('efectivo');
                setIsAdjustOpen(true);
              }}
            >
              <div
                style={{
                  fontSize: '0.7rem',
                  color: 'var(--neon-emerald)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontWeight: 700,
                }}
              >
                <Banknote size={13} /> EFECTIVO
              </div>
              <div
                className={`mono ${
                  summary.currentEfectivoBalance < 0 ? 'text-magenta' : 'text-emerald'
                }`}
                style={{ fontWeight: 700, fontSize: '0.95rem', marginTop: '2px' }}
              >
                {formatMoney(summary.currentEfectivoBalance, currencySymbol)}
              </div>
            </div>

            <div
              className="channel-mini-box"
              title="Clic para subir, bajar o cuadrar tu saldo en Transferencia"
              onClick={() => {
                setAdjustDefaultChannel('transferencia');
                setIsAdjustOpen(true);
              }}
            >
              <div
                style={{
                  fontSize: '0.7rem',
                  color: 'var(--neon-violet)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontWeight: 700,
                }}
              >
                <Smartphone size={13} /> TRANSFERENCIA
              </div>
              <div
                className={`mono ${
                  summary.currentTransferenciaBalance < 0 ? 'text-magenta' : 'text-violet'
                }`}
                style={{ fontWeight: 700, fontSize: '0.95rem', marginTop: '2px' }}
              >
                {formatMoney(summary.currentTransferenciaBalance, currencySymbol)}
              </div>
            </div>
          </div>
        </div>

        {/* 2. Salary & Month Pool */}
        <div className="neon-card">
          <div className="kpi-header">
            <span className="kpi-label">
              Salario y Base ({currencyCode}) <span className="asian-chip">月収</span>
            </span>
            <button
              type="button"
              className="icon-btn"
              title="Editar salario en Efectivo / Transferencia"
              onClick={() => setIsSalaryModalOpen(true)}
            >
              <Settings size={14} />
            </button>
          </div>
          <div className="kpi-value">{formatMoney(summary.salary, currencySymbol)}</div>
          <div className="kpi-sub">
            <span>
              Efec:{' '}
              <strong className="mono text-emerald">
                {formatMoney(summary.salaryEfectivo, currencySymbol)}
              </strong>
            </span>
            <span>
              Transf:{' '}
              <strong className="mono text-violet">
                {formatMoney(summary.salaryTransferencia, currencySymbol)}
              </strong>
            </span>
          </div>
          <div className="kpi-sub" style={{ marginTop: '4px' }}>
            <span>
              Capital total mes:{' '}
              <strong className="mono text-cyan">
                {formatMoney(summary.grossAvailableForMonth, currencySymbol)}
              </strong>
            </span>
          </div>
        </div>

        {/* 3. Committed Envelopes */}
        <div className="neon-card card-violet">
          <div className="kpi-header">
            <span className="kpi-label">
              Divisiones y Metas <span className="asian-chip">予算配分</span>
            </span>
          </div>
          <div className="kpi-value text-violet">
            {formatMoney(summary.committedBudgetTotal, currencySymbol)}
          </div>
          <div className="kpi-sub">
            <span>
              Ejecutado:{' '}
              <strong className="mono">
                {formatMoney(summary.totalOutflowAll, currencySymbol)}
              </strong>
            </span>
            <span>
              Inv:{' '}
              <strong className="mono text-violet">
                {formatMoney(summary.envelopes.inversiones.planned, currencySymbol)}
              </strong>
            </span>
          </div>
        </div>

        {/* 4. Pocket Money */}
        <div
          className={`neon-card ${
            summary.budgetDeficit > 0
              ? 'card-magenta'
              : summary.pocketMoneyRemaining > 0
              ? 'card-emerald'
              : ''
          }`}
        >
          <div className="kpi-header">
            <span className="kpi-label">
              <Coins size={14} className="text-emerald" /> Dinero de Bolsillo{' '}
              <span className="asian-chip">용돈</span>
            </span>
          </div>
          <div
            className={`kpi-value ${
              summary.budgetDeficit > 0
                ? 'text-magenta'
                : summary.pocketMoneyRemaining > 0
                ? 'text-emerald'
                : ''
            }`}
          >
            {summary.budgetDeficit > 0
              ? `-${formatMoney(summary.budgetDeficit, currencySymbol)}`
              : formatMoney(summary.pocketMoneyRemaining, currencySymbol)}
          </div>
          <div className="kpi-sub">
            {summary.budgetDeficit > 0 ? (
              <span className="text-magenta">Exceso sobre el capital del mes</span>
            ) : summary.pocketMoneyPlanned > 0 ? (
              <>
                <span>
                  Libre inicial:{' '}
                  <strong className="mono">
                    {formatMoney(summary.pocketMoneyPlanned, currencySymbol)}
                  </strong>
                </span>
                <span>
                  Usado:{' '}
                  <strong className="mono">
                    {formatMoney(summary.pocketMoneySpent, currencySymbol)}
                  </strong>
                </span>
              </>
            ) : (
              <span>Sin remanente de bolsillo por ahora</span>
            )}
          </div>
        </div>
      </section>

      {/* Navigation Tabs */}
      <nav className="nav-tabs" aria-label="Secciones de la libreta">
        <button
          type="button"
          className={`nav-tab ${activeTab === 'ledger' ? 'active' : ''}`}
          onClick={() => setActiveTab('ledger')}
        >
          <BookOpen size={16} />
          Libro Diario ({currencyCode})
          <span className="tab-badge">{activeMonth.entries.length}</span>
        </button>

        <button
          type="button"
          className={`nav-tab ${activeTab === 'envelopes' ? 'active' : ''}`}
          onClick={() => setActiveTab('envelopes')}
        >
          <Layers size={16} />
          División en Sobres
        </button>

        <button
          type="button"
          className={`nav-tab ${activeTab === 'investments' ? 'active' : ''}`}
          onClick={() => setActiveTab('investments')}
        >
          <TrendingUp size={16} />
          Inversiones
          <span className="tab-badge">
            {activeWorkspace.investments.filter((i) => i.active).length}
          </span>
        </button>

        <button
          type="button"
          className={`nav-tab ${activeTab === 'reports' ? 'active' : ''}`}
          onClick={() => setActiveTab('reports')}
        >
          <PieChart size={16} />
          Informes y Gráficos
        </button>

        <button
          type="button"
          className={`nav-tab ${activeTab === 'exchange' ? 'active' : ''}`}
          onClick={() => setActiveTab('exchange')}
        >
          <ArrowLeftRight size={16} />
          Cambio (CUP)
        </button>

        <button
          type="button"
          className={`nav-tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <History size={16} />
          Historial y Respaldo
        </button>
      </nav>

      {/* Active Section */}
      <main>
        {activeTab === 'ledger' && (
          <LedgerTab
            month={activeMonth}
            summary={summary}
            investments={activeWorkspace.investments}
            customHogarCategories={customHogarCategories}
            selectedDayFilter={selectedDayFilter}
            onClearDayFilter={() => setSelectedDayFilter(null)}
            currencySymbol={currencySymbol}
            currencyCode={currencyCode}
            onAddEntry={async (payload) => {
              const next = await api.addEntry(activeMonth.monthKey, payload);
              setDb(next);
              showToast('Movimiento registrado en la libreta');
            }}
            onUpdateEntry={async (entryId, payload) => {
              const next = await api.updateEntry(activeMonth.monthKey, entryId, payload);
              setDb(next);
              showToast('Movimiento actualizado');
            }}
            onDeleteEntry={async (entryId) => {
              const next = await api.deleteEntry(activeMonth.monthKey, entryId);
              setDb(next);
              showToast('Movimiento eliminado');
            }}
            onSaveReflection={async (reflection) => {
              const next = await api.updateMonthPlan(activeMonth.monthKey, { reflection });
              setDb(next);
              showToast('Reflexión mensual guardada');
            }}
            onOpenAdjustModal={() => {
              setAdjustDefaultChannel('efectivo');
              setIsAdjustOpen(true);
            }}
            onNavigateTab={(t) => setActiveTab(t)}
          />
        )}

        {activeTab === 'envelopes' && (
          <EnvelopesTab
            month={activeMonth}
            previousMonthKey={previousMonthKey}
            summary={summary}
            investments={activeWorkspace.investments}
            customHogarCategories={customHogarCategories}
            currencySymbol={currencySymbol}
            currencyCode={currencyCode}
            onSavePlan={async (payload) => {
              const next = await api.updateMonthPlan(activeMonth.monthKey, payload);
              setDb(next);
              showToast(`División de sobres (${currencyCode}) guardada`);
            }}
            onUpdateCustomHogarCategories={async (nextCategories) => {
              const next = await api.updateProfile({
                customHogarCategories: nextCategories,
              });
              setDb(next);
              showToast('Categorías de Gastos del Hogar actualizadas');
            }}
            onBringCarryover={async (prevMk) => {
              const prevMonth = activeWorkspace.months[prevMk];
              if (!prevMonth) return;
              const prevSum = computeMonthSummary(prevMonth, activeWorkspace.investments);
              const next = await api.updateMonthPlan(activeMonth.monthKey, {
                carryoverEfectivo: prevSum.currentEfectivoBalance,
                carryoverTransferencia: prevSum.currentTransferenciaBalance,
              });
              setDb(next);
              showToast(
                `Saldos Efectivo y Transferencia traídos desde ${formatMonthLabel(prevMk)}`
              );
            }}
            onNavigateInvestments={() => setActiveTab('investments')}
          />
        )}

        {activeTab === 'investments' && (
          <InvestmentsTab
            monthKey={activeMonth.monthKey}
            currencyCode={currencyCode}
            investments={activeWorkspace.investments}
            summary={summary}
            allTimeTotals={allTimeInvestmentTotals}
            currencySymbol={currencySymbol}
            onCreateInvestment={async (payload) => {
              const next = await api.createInvestment({
                ...payload,
                monthKey: activeMonth.monthKey,
              });
              setDb(next);
              showToast('Inversión agregada a tu cartera');
            }}
            onUpdateInvestment={async (id, payload) => {
              const next = await api.updateInvestment(id, {
                ...payload,
                monthKey: activeMonth.monthKey,
              });
              setDb(next);
              showToast('Inversión actualizada');
            }}
            onDeleteInvestment={async (id) => {
              const next = await api.deleteInvestment(id);
              setDb(next);
              showToast('Inversión removida / archivada');
            }}
            onQuickContribute={async (inv, amount, paymentMethod) => {
              const dateForContribution = getTodayDateString().startsWith(activeMonth.monthKey)
                ? getTodayDateString()
                : `${activeMonth.monthKey}-01`;
              const next = await api.addEntry(activeMonth.monthKey, {
                date: dateForContribution,
                type: 'expense',
                amount,
                paymentMethod,
                concept: `Aporte a inversión: ${inv.name}`,
                division: 'inversiones',
                investmentId: inv.id,
                pillar: 'patrimonio',
              });
              setDb(next);
              showToast(
                `Aporte registrado en ${inv.name} (${
                  paymentMethod === 'transferencia' ? 'Transferencia' : 'Efectivo'
                })`
              );
            }}
          />
        )}

        {activeTab === 'reports' && (
          <ReportsTab
            workspace={activeWorkspace}
            month={activeMonth}
            summary={summary}
            customHogarCategories={customHogarCategories}
          />
        )}

        {activeTab === 'exchange' && (
          <CurrencyExchangeTab
            db={db}
            activeMonthKey={activeMonth.monthKey}
            onUpdateRate={async (payload) => {
              const next = await api.updateExchangeRate(payload);
              setDb(next);
              showToast(`Tasa de ${payload.currencyCode} guardada en CUP`);
            }}
            onExecuteExchange={async (payload) => {
              const next = await api.executeCurrencyExchange(payload);
              setDb(next);
              showToast(
                payload.applyToLedgers
                  ? `Cambio aplicado: -${payload.fromAmount} ${payload.fromCurrency} → +${payload.toAmount} ${payload.toCurrency}`
                  : 'Conversión registrada en tu bitácora local'
              );
            }}
            onSwitchToCurrencyLedger={(code) => {
              handleSelectCurrency(code);
              setActiveTab('ledger');
            }}
          />
        )}

        {activeTab === 'history' && (
          <HistoryTab
            db={db}
            activeWorkspace={activeWorkspace}
            desktopInfo={desktopInfo}
            onSelectMonth={(mk) => {
              setSelectedDayFilter(null);
              handleSelectMonth(mk);
              setActiveTab('ledger');
            }}
            onLoadDemo={async () => {
              try {
                const next = await api.loadDemo();
                setDb(next);
                setActiveMonthKey(getCurrentMonthKey());
                setSelectedDayFilter(null);
                setActiveTab('ledger');
                showToast('Demo de 1 solo uso cargada');
              } catch (err: unknown) {
                alert(err instanceof Error ? err.message : 'La Demo ya fue utilizada.');
              }
            }}
            onExitDemoReset={async () => {
              try {
                const next = await api.resetDatabase();
                setDb(next);
                setActiveMonthKey(getCurrentMonthKey());
                setSelectedDayFilter(null);
                setActiveTab('ledger');
                showToast(
                  'Demo limpiada. Tu libreta real está lista y protegida contra borrado.'
                );
              } catch (err: unknown) {
                alert(err instanceof Error ? err.message : 'El reinicio no está disponible.');
              }
            }}
            onImportBackup={async (backup) => {
              const next = await api.importBackup(backup);
              setDb(next);
              showToast('Respaldo restaurado correctamente');
            }}
            onOpenDesktopFolder={async () => {
              await api.openDataFolder();
            }}
          />
        )}
      </main>

      {/* Modals */}
      <AdjustBalanceModal
        isOpen={isAdjustOpen}
        onClose={() => setIsAdjustOpen(false)}
        currentEfectivo={summary.currentEfectivoBalance}
        currentTransferencia={summary.currentTransferenciaBalance}
        defaultChannel={adjustDefaultChannel}
        currencySymbol={currencySymbol}
        currencyCode={currencyCode}
        monthLabel={formatMonthLabel(activeMonth.monthKey)}
        onConfirm={async (payload) => {
          const next = await api.adjustGeneralBalance(activeMonth.monthKey, payload);
          setDb(next);
          showToast(
            `Saldo en ${
              payload.paymentMethod === 'transferencia' ? 'Transferencia' : 'Efectivo'
            } actualizado`
          );
        }}
      />

      <SalaryQuickModal
        isOpen={isSalaryModalOpen}
        onClose={() => setIsSalaryModalOpen(false)}
        db={db}
        monthLabel={formatMonthLabel(activeMonth.monthKey)}
        onSave={async (payload) => {
          let next = await api.updateProfile({
            ledgerName: payload.ledgerName,
            currencyCode: payload.currencyCode,
            enabledCurrencies: payload.enabledCurrencies,
            currentSalaryEfectivo: payload.currentSalaryEfectivo,
            currentSalaryTransferencia: payload.currentSalaryTransferencia,
            hasManutencionesDefault: payload.hasManutencionesDefault,
            syncMonthKey: payload.applyToCurrentMonth ? activeMonth.monthKey : undefined,
          });
          const ws = getActiveWorkspace(next);
          if (!ws.months[activeMonth.monthKey]) {
            next = await api.ensureMonth(activeMonth.monthKey);
          }
          setDb(next);
          showToast(`Configuración y salario (${payload.currencyCode}) actualizados`);
        }}
      />

      {toast && <div className="toast-banner">{toast}</div>}
    </div>
  );
};
