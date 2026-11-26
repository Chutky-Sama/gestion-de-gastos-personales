import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Banknote,
  Calculator,
  Check,
  Coins,
  History,
  Plus,
  Scale,
  Smartphone,
  TrendingDown,
  TrendingUp,
  WifiOff,
} from 'lucide-react';
import {
  computeMonthSummary,
  formatMonthLabel,
  getTodayDateString,
  round2,
} from '../../shared/calculations';
import { CURRENCY_OPTIONS, findCurrencyOption } from '../../shared/currencies';
import {
  AppDatabase,
  ManualCurrencyRate,
  PaymentMethod,
} from '../../shared/types';
import { formatFullDateTime, formatMoney } from '../utils/format';

interface CurrencyExchangeTabProps {
  db: AppDatabase;
  activeMonthKey: string;
  onUpdateRate: (payload: {
    currencyCode: string;
    rateEfectivo: number;
    rateTransferencia?: number;
    useSeparateChannels?: boolean;
    note?: string;
  }) => Promise<void>;
  onExecuteExchange: (payload: {
    monthKey: string;
    date?: string;
    fromCurrency: string;
    fromMethod: PaymentMethod;
    fromAmount: number;
    toCurrency: string;
    toMethod: PaymentMethod;
    toAmount: number;
    effectiveCupRate: number;
    alsoSaveRate?: boolean;
    applyToLedgers: boolean;
    note?: string;
  }) => Promise<void>;
  onSwitchToCurrencyLedger: (currencyCode: string) => void;
}

interface RateDraft {
  ef: string;
  tr: string;
  sep: boolean;
  note: string;
}

export const CurrencyExchangeTab: React.FC<CurrencyExchangeTabProps> = ({
  db,
  activeMonthKey,
  onUpdateRate,
  onExecuteExchange,
  onSwitchToCurrencyLedger,
}) => {
  const ratesMap = db.exchangeControl?.rates || {};

  const boardCodes = useMemo(() => {
    const priority = ['USD', 'MLC', 'EUR'];
    const all = Array.from(
      new Set([
        ...priority,
        ...(db.profile.enabledCurrencies || []).filter((c) => c !== 'CUP'),
        ...Object.keys(ratesMap).filter((c) => c !== 'CUP'),
      ])
    );
    return all;
  }, [db.profile.enabledCurrencies, ratesMap]);

  const [drafts, setDrafts] = useState<Record<string, RateDraft>>({});
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [newBoardCurrency, setNewBoardCurrency] = useState('CAD');

  // Sync local drafts when db rates change
  useEffect(() => {
    const next: Record<string, RateDraft> = {};
    for (const code of boardCodes) {
      const r: ManualCurrencyRate | undefined = ratesMap[code];
      next[code] = {
        ef: r && r.rateEfectivo > 0 ? String(r.rateEfectivo) : '',
        tr: r && r.rateTransferencia > 0 ? String(r.rateTransferencia) : '',
        sep: Boolean(r?.useSeparateChannels),
        note: r?.note || '',
      };
    }
    setDrafts(next);
  }, [boardCodes, ratesMap]);

  const getCupRateFor = (code: string, method: PaymentMethod): number => {
    if (code === 'CUP') return 1;
    const r = ratesMap[code];
    if (!r) return 0;
    if (r.useSeparateChannels) {
      return method === 'transferencia' ? r.rateTransferencia || 0 : r.rateEfectivo || 0;
    }
    return r.rateEfectivo || 0;
  };

  // --- Converter & Real Ledger Exchange State ---
  const [fromCurrency, setFromCurrency] = useState<string>('USD');
  const [fromMethod, setFromMethod] = useState<PaymentMethod>('efectivo');
  const [toCurrency, setToCurrency] = useState<string>('CUP');
  const [toMethod, setToMethod] = useState<PaymentMethod>('efectivo');
  const [fromAmountStr, setFromAmountStr] = useState<string>('100');
  const [customRateStr, setCustomRateStr] = useState<string>('');
  const [alsoSaveRate, setAlsoSaveRate] = useState<boolean>(true);
  const [applyToLedgers, setApplyToLedgers] = useState<boolean>(false);
  const [exchangeDate, setExchangeDate] = useState<string>(() => {
    const today = getTodayDateString();
    return today.startsWith(activeMonthKey) ? today : `${activeMonthKey}-01`;
  });
  const [exchangeNote, setExchangeNote] = useState<string>('');
  const [executing, setExecuting] = useState<boolean>(false);

  // Auto-populate customRateStr when currencies/methods or saved rates update
  useEffect(() => {
    if (fromCurrency === 'CUP' && toCurrency !== 'CUP') {
      const r = getCupRateFor(toCurrency, toMethod);
      setCustomRateStr(r > 0 ? String(r) : '');
    } else if (fromCurrency !== 'CUP' && toCurrency === 'CUP') {
      const r = getCupRateFor(fromCurrency, fromMethod);
      setCustomRateStr(r > 0 ? String(r) : '');
    } else {
      setCustomRateStr('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromCurrency, fromMethod, toCurrency, toMethod, ratesMap]);

  useEffect(() => {
    const today = getTodayDateString();
    setExchangeDate(today.startsWith(activeMonthKey) ? today : `${activeMonthKey}-01`);
  }, [activeMonthKey]);

  const selectableConverterCodes = useMemo(
    () => Array.from(new Set(['CUP', ...boardCodes])),
    [boardCodes]
  );

  // Compute conversion math using CUP as native bridge
  const conversionPreview = useMemo(() => {
    const fromAmt = Math.max(0, parseFloat(fromAmountStr) || 0);
    const manualRate = Math.max(0, parseFloat(customRateStr) || 0);

    if (fromCurrency === toCurrency) {
      return { toAmt: fromAmt, cupValue: fromCurrency === 'CUP' ? fromAmt : 0, rateUsed: 1, missingRate: false };
    }

    // Direct Foreign -> CUP
    if (fromCurrency !== 'CUP' && toCurrency === 'CUP') {
      const rate = manualRate > 0 ? manualRate : getCupRateFor(fromCurrency, fromMethod);
      if (rate <= 0) return { toAmt: 0, cupValue: 0, rateUsed: 0, missingRate: true };
      const cupVal = round2(fromAmt * rate);
      return { toAmt: cupVal, cupValue: cupVal, rateUsed: rate, missingRate: false };
    }

    // Direct CUP -> Foreign
    if (fromCurrency === 'CUP' && toCurrency !== 'CUP') {
      const rate = manualRate > 0 ? manualRate : getCupRateFor(toCurrency, toMethod);
      if (rate <= 0) return { toAmt: 0, cupValue: fromAmt, rateUsed: 0, missingRate: true };
      const foreignVal = round2(fromAmt / rate);
      return { toAmt: foreignVal, cupValue: fromAmt, rateUsed: rate, missingRate: false };
    }

    // Cross Foreign A -> Foreign B via native CUP bridge
    const rateA = getCupRateFor(fromCurrency, fromMethod);
    const rateB = getCupRateFor(toCurrency, toMethod);
    if (rateA <= 0 || rateB <= 0) {
      return { toAmt: 0, cupValue: 0, rateUsed: 0, missingRate: true };
    }
    const bridgeCup = fromAmt * rateA;
    const targetAmt = round2(bridgeCup / rateB);
    return {
      toAmt: targetAmt,
      cupValue: round2(bridgeCup),
      rateUsed: round2(rateA / rateB),
      missingRate: false,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromAmountStr, customRateStr, fromCurrency, fromMethod, toCurrency, toMethod, ratesMap]);

  // --- Street Price Comparator ("¿En qué moneda me conviene pagar?") ---
  const [priceCupStr, setPriceCupStr] = useState<string>('');
  const [priceForeignStr, setPriceForeignStr] = useState<string>('');
  const [priceForeignCode, setPriceForeignCode] = useState<string>('USD');
  const [priceForeignMethod, setPriceForeignMethod] = useState<PaymentMethod>('efectivo');

  const comparatorResult = useMemo(() => {
    const askCup = parseFloat(priceCupStr) || 0;
    const askForeign = parseFloat(priceForeignStr) || 0;
    const rate = getCupRateFor(priceForeignCode, priceForeignMethod);
    if (askCup <= 0 || askForeign <= 0 || rate <= 0) return null;

    const foreignInCup = round2(askForeign * rate);
    const diffCup = round2(askCup - foreignInCup);
    const impliedRate = round2(askCup / askForeign);

    return {
      foreignInCup,
      diffCup,
      impliedRate,
      rate,
      betterChoice:
        Math.abs(diffCup) < 0.5
          ? 'equal'
          : diffCup > 0
          ? 'foreign' // Paying in foreign costs fewer CUP than the CUP price asked
          : 'cup',    // Paying in CUP costs less than giving the foreign currency
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceCupStr, priceForeignStr, priceForeignCode, priceForeignMethod, ratesMap]);

  // --- Consolidated Net Worth in Native CUP ---
  const portfolioRows = useMemo(() => {
    const codes = Array.from(
      new Set(['CUP', ...(db.profile.enabledCurrencies || ['CUP', 'USD'])])
    );

    return codes.map((code) => {
      const ws = db.currencyWorkspaces[code];
      const opt = findCurrencyOption(code);
      let ef = 0;
      let tr = 0;
      if (ws) {
        const m = ws.months[activeMonthKey];
        if (m) {
          const sum = computeMonthSummary(m, ws.investments);
          ef = sum.currentEfectivoBalance;
          tr = sum.currentTransferenciaBalance;
        }
      }
      const totalNative = round2(ef + tr);
      const rateEf = getCupRateFor(code, 'efectivo');
      const rateTr = getCupRateFor(code, 'transferencia');
      const missingRate = code !== 'CUP' && totalNative !== 0 && (rateEf <= 0 || rateTr <= 0);
      const cupEf = code === 'CUP' ? ef : round2(ef * rateEf);
      const cupTr = code === 'CUP' ? tr : round2(tr * rateTr);
      const cupTotal = round2(cupEf + cupTr);

      return {
        code,
        symbol: opt.symbol,
        label: opt.label,
        ef,
        tr,
        totalNative,
        rateEf,
        rateTr,
        cupEf,
        cupTr,
        cupTotal,
        missingRate,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.currencyWorkspaces, db.profile.enabledCurrencies, activeMonthKey, ratesMap]);

  const consolidatedTotals = useMemo(() => {
    let totalCupEf = 0;
    let totalCupTr = 0;
    let unvaluedCount = 0;

    for (const r of portfolioRows) {
      totalCupEf = round2(totalCupEf + r.cupEf);
      totalCupTr = round2(totalCupTr + r.cupTr);
      if (r.missingRate) unvaluedCount += 1;
    }

    const grandCup = round2(totalCupEf + totalCupTr);
    const usdRefRate = getCupRateFor('USD', 'efectivo');
    const grandInUsd = usdRefRate > 0 ? round2(grandCup / usdRefRate) : null;

    return {
      totalCupEf,
      totalCupTr,
      grandCup,
      grandInUsd,
      usdRefRate,
      unvaluedCount,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolioRows, ratesMap]);

  const availableExtraCurrencies = CURRENCY_OPTIONS.filter(
    (c) => c.code !== 'CUP' && !boardCodes.includes(c.code)
  );

  const handleSaveCardRate = async (code: string) => {
    const d = drafts[code];
    if (!d) return;
    const ef = Math.max(0, parseFloat(d.ef) || 0);
    const tr = d.sep ? Math.max(0, parseFloat(d.tr) || 0) : ef;
    setSavingCode(code);
    try {
      await onUpdateRate({
        currencyCode: code,
        rateEfectivo: ef,
        rateTransferencia: tr,
        useSeparateChannels: d.sep,
        note: d.note,
      });
    } finally {
      setSavingCode(null);
    }
  };

  const handleSwapConverter = () => {
    const prevFrom = fromCurrency;
    const prevFromMethod = fromMethod;
    setFromCurrency(toCurrency);
    setFromMethod(toMethod);
    setToCurrency(prevFrom);
    setToMethod(prevFromMethod);
  };

  const handleExecuteConverterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fromAmt = parseFloat(fromAmountStr);
    if (
      Number.isNaN(fromAmt) ||
      fromAmt <= 0 ||
      conversionPreview.missingRate ||
      conversionPreview.toAmt <= 0 ||
      fromCurrency === toCurrency
    ) {
      return;
    }

    setExecuting(true);
    try {
      await onExecuteExchange({
        monthKey: activeMonthKey,
        date: exchangeDate,
        fromCurrency,
        fromMethod,
        fromAmount: round2(fromAmt),
        toCurrency,
        toMethod,
        toAmount: conversionPreview.toAmt,
        effectiveCupRate: conversionPreview.rateUsed,
        alsoSaveRate:
          alsoSaveRate && (fromCurrency === 'CUP' || toCurrency === 'CUP'),
        applyToLedgers,
        note: exchangeNote.trim() || undefined,
      });
      setExchangeNote('');
    } finally {
      setExecuting(false);
    }
  };

  // Latest rate delta helper from rateHistory
  const latestDeltaByCode = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of db.exchangeControl?.rateHistory || []) {
      if (map[item.currencyCode] === undefined && item.previousEfectivo > 0) {
        map[item.currencyCode] = round2(item.newEfectivo - item.previousEfectivo);
      }
    }
    return map;
  }, [db.exchangeControl?.rateHistory]);

  return (
    <div>
      {/* 1. Consolidated Control Header in Native CUP */}
      <div className="neon-card card-cyan" style={{ marginBottom: '20px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '16px',
            flexWrap: 'wrap',
            marginBottom: '16px',
          }}
        >
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                fontSize: '0.76rem',
                fontWeight: 700,
                color: 'var(--neon-cyan)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: '6px',
              }}
            >
              <WifiOff size={14} /> Control Local 100% Sin Internet · Moneda Nativa: CUP
            </div>
            <h3 style={{ margin: '0 0 4px', fontSize: '1.16rem' }}>
              Patrimonio Total Consolidado en Peso Cubano (CUP) ·{' '}
              {formatMonthLabel(activeMonthKey)}
            </h3>
            <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
              Tú defines manualmente las tasas del momento. El programa valora todas tus libretas
              (Efectivo y Transferencia) en <strong>CUP</strong> sin necesitar conexión.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)' }}>
                PATRIMONIO TOTAL EN CUP
              </div>
              <div className="mono text-cyan" style={{ fontSize: '1.45rem', fontWeight: 700 }}>
                {formatMoney(consolidatedTotals.grandCup, '$')} CUP
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                Efec: <span className="mono text-emerald">{formatMoney(consolidatedTotals.totalCupEf, '$')}</span>{' '}
                · Transf:{' '}
                <span className="mono text-violet">{formatMoney(consolidatedTotals.totalCupTr, '$')}</span>
              </div>
            </div>

            {consolidatedTotals.grandInUsd !== null && (
              <div
                style={{
                  paddingLeft: '16px',
                  borderLeft: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)' }}>
                  EQUIVALENTE REF. USD
                </div>
                <div className="mono text-emerald" style={{ fontSize: '1.45rem', fontWeight: 700 }}>
                  {formatMoney(consolidatedTotals.grandInUsd, 'US$')}
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  A tu tasa de {consolidatedTotals.usdRefRate} CUP/USD
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Consolidated Per-Currency Table */}
        <div className="ledger-table-wrap">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Libreta / Moneda</th>
                <th className="num-col">Saldo Efectivo</th>
                <th className="num-col">Saldo Transf.</th>
                <th className="num-col">Tasa Manual (CUP)</th>
                <th className="num-col" style={{ color: 'var(--neon-cyan)' }}>
                  Equivalente en CUP
                </th>
                <th style={{ textAlign: 'right' }}>Ir</th>
              </tr>
            </thead>
            <tbody>
              {portfolioRows.map((row) => (
                <tr key={row.code}>
                  <td>
                    <strong>{row.code}</strong>{' '}
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      · {row.label}
                    </span>
                  </td>
                  <td className="num-col text-emerald">
                    {formatMoney(row.ef, row.symbol)}
                  </td>
                  <td className="num-col text-violet">
                    {formatMoney(row.tr, row.symbol)}
                  </td>
                  <td className="num-col">
                    {row.code === 'CUP' ? (
                      <span className="div-badge div-cyan">Nativa (1.00)</span>
                    ) : row.rateEf <= 0 && row.rateTr <= 0 ? (
                      <span style={{ color: 'var(--neon-amber)', fontSize: '0.78rem' }}>
                        Sin tasa fijada abajo
                      </span>
                    ) : row.rateEf === row.rateTr ? (
                      <span>{row.rateEf} CUP</span>
                    ) : (
                      <span style={{ fontSize: '0.78rem' }}>
                        Ef: {row.rateEf} / Tr: {row.rateTr} CUP
                      </span>
                    )}
                  </td>
                  <td className="num-col text-cyan" style={{ fontWeight: 700 }}>
                    {row.missingRate ? (
                      <span style={{ color: 'var(--neon-amber)', fontSize: '0.8rem' }}>
                        Fija tasa {row.code}
                      </span>
                    ) : (
                      `${formatMoney(row.cupTotal, '$')} CUP`
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => onSwitchToCurrencyLedger(row.code)}
                    >
                      Ver libreta
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. Manual Rate Board (Base CUP) */}
      <div className="neon-card card-violet" style={{ marginBottom: '20px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
            marginBottom: '14px',
          }}
        >
          <div>
            <h3
              style={{
                margin: '0 0 4px',
                fontSize: '1.08rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Coins size={19} className="text-violet" /> Pizarra Manual de Tasas de Cambio (Base
              Nativa: CUP)
            </h3>
            <p style={{ margin: 0, fontSize: '0.83rem', color: 'var(--text-secondary)' }}>
              Pon en cuánto está cada moneda frente al <strong>CUP</strong> cuando lo necesites. Si
              el Efectivo y la Transferencia tienen distinto precio en la calle, activa el
              interruptor de doble tasa.
            </p>
          </div>

          {availableExtraCurrencies.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <select
                className="neon-select"
                style={{ width: 'auto', fontSize: '0.8rem', padding: '6px 10px' }}
                value={newBoardCurrency}
                onChange={(e) => setNewBoardCurrency(e.target.value)}
              >
                {availableExtraCurrencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() =>
                  onUpdateRate({
                    currencyCode: newBoardCurrency,
                    rateEfectivo: 0,
                    useSeparateChannels: false,
                  })
                }
              >
                <Plus size={14} /> Agregar a pizarra
              </button>
            </div>
          )}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(265px, 1fr))',
            gap: '14px',
          }}
        >
          {boardCodes.map((code) => {
            const opt = findCurrencyOption(code);
            const saved = ratesMap[code];
            const d = drafts[code] || { ef: '', tr: '', sep: false, note: '' };
            const delta = latestDeltaByCode[code];

            return (
              <div
                key={code}
                style={{
                  padding: '14px',
                  borderRadius: '12px',
                  background: 'rgba(8, 12, 23, 0.82)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <div>
                    <strong style={{ fontSize: '1rem', color: 'var(--neon-cyan)' }}>
                      1 {code}
                    </strong>{' '}
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      = ? CUP
                    </span>
                  </div>

                  {delta !== undefined && Math.abs(delta) >= 0.01 && (
                    <span
                      className={`div-badge ${delta > 0 ? 'div-amber' : 'div-emerald'}`}
                      title="Variación respecto a la última tasa que guardaste"
                    >
                      {delta > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {delta > 0 ? `+${delta}` : delta} CUP
                    </span>
                  )}
                </div>

                {!d.sep ? (
                  <div>
                    <label className="field-label">Tasa actual en CUP (1 {code})</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="neon-input mono-input"
                      placeholder={`Ej. cuántos CUP vale 1 ${code}`}
                      value={d.ef}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [code]: { ...d, ef: e.target.value, tr: e.target.value },
                        }))
                      }
                    />
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                      <label className="field-label" style={{ color: 'var(--neon-emerald)' }}>
                        Efectivo (CUP)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="neon-input mono-input"
                        placeholder="0.00"
                        value={d.ef}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [code]: { ...d, ef: e.target.value },
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label className="field-label" style={{ color: 'var(--neon-violet)' }}>
                        Transferencia (CUP)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="neon-input mono-input"
                        placeholder="0.00"
                        value={d.tr}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [code]: { ...d, tr: e.target.value },
                          }))
                        }
                      />
                    </div>
                  </div>
                )}

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '8px',
                    marginTop: '2px',
                  }}
                >
                  <div
                    className="neon-switch"
                    onClick={() =>
                      setDrafts((prev) => ({
                        ...prev,
                        [code]: {
                          ...d,
                          sep: !d.sep,
                          tr: !d.sep && !d.tr ? d.ef : d.tr,
                        },
                      }))
                    }
                  >
                    <div className={`switch-track ${d.sep ? 'on' : ''}`}>
                      <div className="switch-thumb" />
                    </div>
                    <span style={{ fontSize: '0.75rem' }}>Efec ≠ Transf</span>
                  </div>

                  <button
                    type="button"
                    className="btn btn-sm btn-cyan"
                    disabled={savingCode === code}
                    onClick={() => handleSaveCardRate(code)}
                  >
                    <Check size={14} /> {savingCode === code ? '...' : 'Fijar Tasa'}
                  </button>
                </div>

                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {saved && (saved.rateEfectivo > 0 || saved.rateTransferencia > 0)
                    ? `Último ajuste: ${formatFullDateTime(saved.updatedAt)}`
                    : `${opt.label} · Sin tasa guardada aún`}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Two-Column: Bidirectional Converter/Executor + Street Comparator & History */}
      <div className="two-col-grid">
        {/* Left: Converter + 1-Click Real Ledger Exchange */}
        <div className="neon-card card-emerald">
          <div className="kpi-header" style={{ marginBottom: '12px' }}>
            <span className="kpi-label">
              <Calculator size={16} className="text-emerald" /> Calculadora y Cambio Real entre
              Libretas
            </span>
          </div>

          <form
            onSubmit={handleExecuteConverterSubmit}
            style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
          >
            {/* Source Currency & Channel */}
            <div
              style={{
                padding: '12px',
                borderRadius: '10px',
                background: 'rgba(8, 12, 23, 0.78)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <label className="field-label">Tengo / Entrego</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '8px' }}>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  className="neon-input mono-input"
                  placeholder="Monto"
                  value={fromAmountStr}
                  onChange={(e) => setFromAmountStr(e.target.value)}
                />
                <select
                  className="neon-select"
                  value={fromCurrency}
                  onChange={(e) => setFromCurrency(e.target.value)}
                >
                  {selectableConverterCodes.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <select
                  className="neon-select"
                  value={fromMethod}
                  onChange={(e) => setFromMethod(e.target.value as PaymentMethod)}
                >
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={handleSwapConverter}
              >
                <ArrowLeftRight size={14} /> Invertir Monedas ({fromCurrency} ⇄ {toCurrency})
              </button>
            </div>

            {/* Destination Currency & Channel */}
            <div
              style={{
                padding: '12px',
                borderRadius: '10px',
                background: 'rgba(0, 255, 157, 0.05)',
                border: '1px solid rgba(0, 255, 157, 0.28)',
              }}
            >
              <label className="field-label">Equivale a / Recibo</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '8px' }}>
                <div
                  className="neon-input mono-input text-emerald"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    fontWeight: 700,
                    fontSize: '1.05rem',
                  }}
                >
                  {conversionPreview.missingRate
                    ? 'Pon tasa abajo'
                    : formatMoney(conversionPreview.toAmt, '')}
                </div>
                <select
                  className="neon-select"
                  value={toCurrency}
                  onChange={(e) => setToCurrency(e.target.value)}
                >
                  {selectableConverterCodes.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <select
                  className="neon-select"
                  value={toMethod}
                  onChange={(e) => setToMethod(e.target.value as PaymentMethod)}
                >
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                </select>
              </div>
            </div>

            {/* Rate Override when CUP is one of the sides */}
            {(fromCurrency === 'CUP' || toCurrency === 'CUP') && fromCurrency !== toCurrency && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="field-label">
                    Tasa en CUP usada (1 {fromCurrency === 'CUP' ? toCurrency : fromCurrency})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="neon-input mono-input"
                    placeholder="Ej. 330"
                    value={customRateStr}
                    onChange={(e) => setCustomRateStr(e.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label">Fecha</label>
                  <input
                    type="date"
                    className="neon-input mono-input"
                    value={exchangeDate}
                    onChange={(e) => setExchangeDate(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Toggle to actually move balances between ledgers */}
            <div
              style={{
                padding: '10px 12px',
                borderRadius: '10px',
                background: 'rgba(8, 12, 23, 0.75)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div
                className="neon-switch"
                onClick={() => setApplyToLedgers((v) => !v)}
              >
                <div className={`switch-track ${applyToLedgers ? 'on' : ''}`}>
                  <div className="switch-thumb" />
                </div>
                <span style={{ fontSize: '0.83rem' }}>
                  <strong>Aplicar este cambio real en mis libretas</strong> (resta en{' '}
                  {fromCurrency} y suma en {toCurrency})
                </span>
              </div>

              {(fromCurrency === 'CUP' || toCurrency === 'CUP') && (
                <div
                  className="neon-switch"
                  onClick={() => setAlsoSaveRate((v) => !v)}
                >
                  <div className={`switch-track ${alsoSaveRate ? 'on' : ''}`}>
                    <div className="switch-thumb" />
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Guardar también esta tasa en mi pizarra local
                  </span>
                </div>
              )}

              <input
                type="text"
                className="neon-input"
                placeholder="Nota opcional (ej. Cambiado con conocido, compra de divisas...)"
                value={exchangeNote}
                onChange={(e) => setExchangeNote(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={
                executing ||
                fromCurrency === toCurrency ||
                conversionPreview.missingRate ||
                conversionPreview.toAmt <= 0
              }
              className={`btn ${applyToLedgers ? 'btn-emerald' : 'btn-cyan'}`}
            >
              <ArrowLeftRight size={16} />
              {executing
                ? 'Procesando...'
                : applyToLedgers
                ? `Ejecutar Cambio Real: -${fromAmountStr || 0} ${fromCurrency} → +${conversionPreview.toAmt} ${toCurrency}`
                : 'Guardar Conversión en Bitácora Local'}
            </button>
          </form>
        </div>

        {/* Right: Street Price Comparator + Offline Rate Log */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="neon-card card-amber">
            <div className="kpi-header" style={{ marginBottom: '10px' }}>
              <span className="kpi-label">
                <Scale size={16} className="text-amber" /> Comparador Rápido: ¿Me conviene pagar en
                CUP o en Divisa?
              </span>
            </div>
            <p style={{ margin: '0 0 12px', fontSize: '0.81rem', color: 'var(--text-secondary)' }}>
              Cuando te dan un precio en <strong>CUP</strong> y otro en <strong>USD / MLC / EUR</strong>,
              compara al instante cuál te cuesta menos según tu tasa actual:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div>
                <label className="field-label">Precio pedido en CUP</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="neon-input mono-input"
                  placeholder="Ej. 3500"
                  value={priceCupStr}
                  onChange={(e) => setPriceCupStr(e.target.value)}
                />
              </div>

              <div>
                <label className="field-label">Precio pedido en Divisa</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="neon-input mono-input"
                    placeholder="Ej. 10"
                    value={priceForeignStr}
                    onChange={(e) => setPriceForeignStr(e.target.value)}
                  />
                  <select
                    className="neon-select"
                    style={{ width: '92px' }}
                    value={priceForeignCode}
                    onChange={(e) => setPriceForeignCode(e.target.value)}
                  >
                    {boardCodes.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <button
                type="button"
                className={`btn btn-sm ${
                  priceForeignMethod === 'efectivo' ? 'btn-emerald' : 'btn-ghost'
                }`}
                onClick={() => setPriceForeignMethod('efectivo')}
              >
                <Banknote size={13} /> Valuar divisa en Efectivo
              </button>
              <button
                type="button"
                className={`btn btn-sm ${
                  priceForeignMethod === 'transferencia' ? 'btn-violet' : 'btn-ghost'
                }`}
                onClick={() => setPriceForeignMethod('transferencia')}
              >
                <Smartphone size={13} /> Valuar divisa en Transf.
              </button>
            </div>

            {comparatorResult ? (
              <div
                style={{
                  padding: '12px',
                  borderRadius: '10px',
                  background: 'rgba(8, 12, 23, 0.86)',
                  border: '1px solid rgba(255, 184, 0, 0.4)',
                  fontSize: '0.84rem',
                }}
              >
                <div>
                  A tu tasa de <strong>{comparatorResult.rate} CUP</strong>, pagar en{' '}
                  <strong>{priceForeignCode}</strong> equivale a{' '}
                  <strong className="mono text-cyan">
                    {formatMoney(comparatorResult.foreignInCup, '$')} CUP
                  </strong>{' '}
                  (el vendedor te está tomando implícitamente a{' '}
                  <span className="mono">{comparatorResult.impliedRate} CUP</span>).
                </div>
                <div style={{ marginTop: '6px', fontWeight: 700 }}>
                  {comparatorResult.betterChoice === 'equal' ? (
                    <span className="text-cyan">Da exactamente igual pagar en cualquiera de las dos.</span>
                  ) : comparatorResult.betterChoice === 'foreign' ? (
                    <span className="text-emerald">
                      ✓ Te conviene pagar en {priceForeignCode}: te ahorras{' '}
                      {formatMoney(Math.abs(comparatorResult.diffCup), '$')} CUP.
                    </span>
                  ) : (
                    <span className="text-amber">
                      ✓ Te conviene pagar en CUP: te ahorras{' '}
                      {formatMoney(Math.abs(comparatorResult.diffCup), '$')} CUP frente a entregar tus{' '}
                      {priceForeignCode}.
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Ingresa ambos precios (y asegúrate de haber fijado la tasa de {priceForeignCode}{' '}
                arriba) para ver el cálculo al instante.
              </div>
            )}
          </div>

          {/* Local Offline History of Rates & Exchanges */}
          <div className="neon-card">
            <div className="kpi-header" style={{ marginBottom: '10px' }}>
              <span className="kpi-label">
                <History size={15} className="text-cyan" /> Historial Local de Tasas y Cambios
              </span>
            </div>

            {(db.exchangeControl?.operations?.length || 0) === 0 &&
            (db.exchangeControl?.rateHistory?.length || 0) === 0 ? (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: '8px 0' }}>
                Aquí irán quedando guardadas tus tasas anteriores y tus cambios realizados sin
                depender de internet.
              </div>
            ) : (
              <div
                className="timeline-list"
                style={{ maxHeight: '220px', overflowY: 'auto', paddingRight: '4px' }}
              >
                {(db.exchangeControl?.operations || []).slice(0, 8).map((op) => (
                  <div key={op.id} className="timeline-item">
                    <div className="timeline-dot" />
                    <div style={{ flex: 1, fontSize: '0.8rem' }}>
                      <div>
                        <strong>
                          {op.fromAmount} {op.fromCurrency} → {op.toAmount} {op.toCurrency}
                        </strong>{' '}
                        {op.appliedToLedgers && (
                          <span className="div-badge div-emerald" style={{ marginLeft: '4px' }}>
                            En libretas
                          </span>
                        )}
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.73rem' }}>
                        {formatFullDateTime(op.timestamp)}
                        {op.effectiveCupRate > 0 ? ` · Tasa: ${op.effectiveCupRate} CUP` : ''}
                      </div>
                    </div>
                  </div>
                ))}

                {(db.exchangeControl?.rateHistory || []).slice(0, 8).map((rh) => (
                  <div key={rh.id} className="timeline-item">
                    <div className="timeline-dot" />
                    <div style={{ flex: 1, fontSize: '0.8rem' }}>
                      <div>
                        <strong>Tasa {rh.currencyCode}:</strong>{' '}
                        {rh.previousEfectivo > 0 ? `${rh.previousEfectivo} → ` : ''}
                        <span className="mono text-cyan">{rh.newEfectivo} CUP</span>
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.73rem' }}>
                        {formatFullDateTime(rh.timestamp)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
