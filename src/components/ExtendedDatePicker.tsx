import React, { useMemo, useState } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  X,
} from 'lucide-react';
import {
  formatMonthLabel,
  getCurrentMonthKey,
  getTodayDateString,
  round2,
  shiftMonthKey,
} from '../../shared/calculations';
import { CurrencyLedgerWorkspace, MonthRecord } from '../../shared/types';
import { formatMoney } from '../utils/format';

interface ExtendedDatePickerProps {
  activeMonthKey: string;
  selectedDayFilter: string | null; // YYYY-MM-DD or null for full month
  workspace: CurrencyLedgerWorkspace;
  onSelectMonth: (monthKey: string) => void;
  onSelectDayFilter: (dateStr: string | null) => void;
}

const MONTH_SHORT_NAMES = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export const ExtendedDatePicker: React.FC<ExtendedDatePickerProps> = ({
  activeMonthKey,
  selectedDayFilter,
  workspace,
  onSelectMonth,
  onSelectDayFilter,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'calendar' | 'months'>('calendar');

  const [activeYear, activeMonthNum] = useMemo(() => {
    const [y, m] = activeMonthKey.split('-').map(Number);
    return [y || new Date().getFullYear(), m || new Date().getMonth() + 1];
  }, [activeMonthKey]);

  const [pickerYear, setPickerYear] = useState<number>(activeYear);

  const openPicker = () => {
    setPickerYear(activeYear);
    setIsOpen(true);
  };

  const monthRecord: MonthRecord | undefined = workspace.months[activeMonthKey];
  const todayStr = getTodayDateString();
  const currentMk = getCurrentMonthKey();

  // Compute daily totals for the active month calendar grid
  const dailyStats = useMemo(() => {
    const map: Record<string, { income: number; expense: number; count: number }> = {};
    if (!monthRecord) return map;
    for (const e of monthRecord.entries) {
      if (!map[e.date]) {
        map[e.date] = { income: 0, expense: 0, count: 0 };
      }
      map[e.date].count += 1;
      if (e.type === 'income' || e.type === 'adjustment_up') {
        map[e.date].income = round2(map[e.date].income + e.amount);
      } else if (e.type === 'expense' || e.type === 'adjustment_down') {
        map[e.date].expense = round2(map[e.date].expense + e.amount);
      } else if (e.type === 'channel_transfer' && (e.transferFee || 0) > 0) {
        map[e.date].expense = round2(map[e.date].expense + (e.transferFee || 0));
      }
    }
    return map;
  }, [monthRecord]);

  // Build Monday-first calendar cells for activeYear / activeMonthNum
  const calendarCells = useMemo(() => {
    const firstDate = new Date(activeYear, activeMonthNum - 1, 1);
    const daysInMonth = new Date(activeYear, activeMonthNum, 0).getDate();
    // JS getDay(): 0 = Sun, 1 = Mon ... 6 = Sat -> convert to 0 = Mon ... 6 = Sun
    const startOffset = (firstDate.getDay() + 6) % 7;

    const cells: Array<{ day: number | null; dateStr: string | null }> = [];
    for (let i = 0; i < startOffset; i++) {
      cells.push({ day: null, dateStr: null });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${activeYear}-${String(activeMonthNum).padStart(2, '0')}-${String(d).padStart(
        2,
        '0'
      )}`;
      cells.push({ day: d, dateStr: ds });
    }
    return cells;
  }, [activeYear, activeMonthNum]);

  const compactButtonLabel = useMemo(() => {
    if (selectedDayFilter && selectedDayFilter.startsWith(activeMonthKey)) {
      const d = selectedDayFilter.slice(8, 10);
      return `${d} ${MONTH_SHORT_NAMES[activeMonthNum - 1]} ${activeYear}`;
    }
    return formatMonthLabel(activeMonthKey);
  }, [activeMonthKey, activeMonthNum, activeYear, selectedDayFilter]);

  return (
    <>
      <div className="month-switcher">
        <button
          type="button"
          className="month-nav-btn"
          title="Mes anterior"
          onClick={() => {
            onSelectDayFilter(null);
            onSelectMonth(shiftMonthKey(activeMonthKey, -1));
          }}
        >
          <ChevronLeft size={17} />
        </button>

        <button
          type="button"
          className="month-trigger-btn"
          title="Desplegar calendario completo y selector rápido de meses/años"
          onClick={openPicker}
        >
          <Calendar size={14} className="text-cyan" />
          <span className="month-trigger-text">{compactButtonLabel}</span>
          <ChevronDown size={14} style={{ opacity: 0.75 }} />
        </button>

        <button
          type="button"
          className="month-nav-btn"
          title="Mes siguiente"
          onClick={() => {
            onSelectDayFilter(null);
            onSelectMonth(shiftMonthKey(activeMonthKey, 1));
          }}
        >
          <ChevronRight size={17} />
        </button>
      </div>

      {selectedDayFilter && (
        <button
          type="button"
          className="btn btn-sm btn-magenta"
          title="Quitar filtro de día y ver todo el mes"
          onClick={() => onSelectDayFilter(null)}
        >
          <Filter size={13} /> Día {selectedDayFilter.slice(8, 10)} ×
        </button>
      )}

      {isOpen && (
        <div className="modal-backdrop">
          <div
            className="modal-panel"
            style={{ maxWidth: '680px', width: '95%' }}
          >
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calendar size={19} className="text-cyan" /> Calendario y Navegador de Fechas (
                  {workspace.currencyCode})
                </h3>
                <div className="type-switch">
                  <button
                    type="button"
                    className={`type-switch-btn ${viewMode === 'calendar' ? 'active-income' : ''}`}
                    onClick={() => setViewMode('calendar')}
                  >
                    Calendario Diario
                  </button>
                  <button
                    type="button"
                    className={`type-switch-btn ${viewMode === 'months' ? 'active-transfer' : ''}`}
                    onClick={() => setViewMode('months')}
                  >
                    12 Meses / Años
                  </button>
                </div>
              </div>

              <button
                type="button"
                className="icon-btn"
                onClick={() => setIsOpen(false)}
                title="Cerrar calendario"
              >
                <X size={18} />
              </button>
            </div>

            {viewMode === 'months' ? (
              <div>
                {/* Year Stepper */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: 'rgba(8, 12, 23, 0.85)',
                    border: '1px solid var(--border-subtle)',
                    marginBottom: '14px',
                  }}
                >
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => setPickerYear((y) => y - 1)}
                  >
                    <ChevronLeft size={15} /> {pickerYear - 1}
                  </button>
                  <div className="mono text-cyan" style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                    Año {pickerYear}
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => setPickerYear((y) => y + 1)}
                  >
                    {pickerYear + 1} <ChevronRight size={15} />
                  </button>
                </div>

                {/* 12 Months Grid */}
                <div className="calendar-months-grid">
                  {MONTH_SHORT_NAMES.map((mName, idx) => {
                    const mNum = idx + 1;
                    const mk = `${pickerYear}-${String(mNum).padStart(2, '0')}`;
                    const rec = workspace.months[mk];
                    const count = rec ? rec.entries.length : 0;
                    const hasData = Boolean(
                      rec && (rec.entries.length > 0 || (rec.salary || 0) > 0)
                    );
                    const isSelected = mk === activeMonthKey;
                    const isCurrentRealMonth = mk === currentMk;

                    return (
                      <button
                        key={mk}
                        type="button"
                        className={`calendar-month-card ${isSelected ? 'selected' : ''} ${
                          isCurrentRealMonth ? 'today-month' : ''
                        }`}
                        onClick={() => {
                          onSelectDayFilter(null);
                          onSelectMonth(mk);
                          setViewMode('calendar');
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{mName}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          {pickerYear}
                        </div>
                        {hasData ? (
                          <span
                            className="div-badge div-emerald"
                            style={{ marginTop: '6px', fontSize: '0.68rem', padding: '2px 6px' }}
                          >
                            {count} mov.
                          </span>
                        ) : (
                          <span
                            style={{
                              marginTop: '6px',
                              fontSize: '0.68rem',
                              color: 'var(--text-muted)',
                            }}
                          >
                            Vacío
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div>
                {/* Quick Month Header inside Daily Calendar View */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    marginBottom: '12px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => {
                        onSelectDayFilter(null);
                        onSelectMonth(shiftMonthKey(activeMonthKey, -1));
                      }}
                    >
                      <ChevronLeft size={15} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-cyan"
                      onClick={() => {
                        setPickerYear(activeYear);
                        setViewMode('months');
                      }}
                      title="Clic para elegir cualquier mes o año"
                    >
                      {formatMonthLabel(activeMonthKey)} ▾
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => {
                        onSelectDayFilter(null);
                        onSelectMonth(shiftMonthKey(activeMonthKey, 1));
                      }}
                    >
                      <ChevronRight size={15} />
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-sm btn-emerald"
                      onClick={() => {
                        onSelectMonth(currentMk);
                        onSelectDayFilter(todayStr);
                        setIsOpen(false);
                      }}
                    >
                      <Clock size={13} /> Hoy ({todayStr.slice(8, 10)})
                    </button>

                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => {
                        onSelectDayFilter(null);
                        setIsOpen(false);
                      }}
                    >
                      Ver Mes Completo
                    </button>
                  </div>
                </div>

                {/* 7-Column Calendar Grid */}
                <div className="calendar-weekdays-row">
                  {WEEKDAY_LABELS.map((w) => (
                    <div key={w} className="calendar-weekday-cell">
                      {w}
                    </div>
                  ))}
                </div>

                <div className="calendar-days-grid">
                  {calendarCells.map((cell, idx) => {
                    if (!cell.day || !cell.dateStr) {
                      return <div key={`empty-${idx}`} className="calendar-day-cell empty" />;
                    }
                    const st = dailyStats[cell.dateStr];
                    const isToday = cell.dateStr === todayStr;
                    const isPickedDay = cell.dateStr === selectedDayFilter;

                    return (
                      <button
                        key={cell.dateStr}
                        type="button"
                        className={`calendar-day-cell ${isToday ? 'is-today' : ''} ${
                          isPickedDay ? 'is-selected' : ''
                        } ${st ? 'has-entries' : ''}`}
                        onClick={() => {
                          onSelectDayFilter(
                            selectedDayFilter === cell.dateStr ? null : cell.dateStr
                          );
                          setIsOpen(false);
                        }}
                        title={
                          st
                            ? `${cell.dateStr}: ${st.count} movimiento(s) · Clic para filtrar/anotar en este día`
                            : `${cell.dateStr}: Sin movimientos · Clic para situarte en este día`
                        }
                      >
                        <div className="calendar-day-top">
                          <span className="calendar-day-num">{cell.day}</span>
                          {st && <span className="calendar-day-count">{st.count}</span>}
                        </div>

                        <div className="calendar-day-amounts mono">
                          {st && st.income > 0 && (
                            <div className="cal-inc">
                              +{formatMoney(st.income, workspace.currencySymbol)}
                            </div>
                          )}
                          {st && st.expense > 0 && (
                            <div className="cal-exp">
                              -{formatMoney(st.expense, workspace.currencySymbol)}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div
                  style={{
                    marginTop: '12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.78rem',
                    color: 'var(--text-secondary)',
                    flexWrap: 'wrap',
                    gap: '8px',
                  }}
                >
                  <span>
                    Toca cualquier día para filtrar sus movimientos y fijar esa fecha en el
                    registrador, o cambia a <strong>12 Meses / Años</strong> para saltar lejos.
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => setIsOpen(false)}
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
