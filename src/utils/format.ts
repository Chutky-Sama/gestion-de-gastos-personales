import { CURRENCY_OPTIONS, CurrencyOption, findCurrencyOption } from '../../shared/currencies';
import {
  AppDatabase,
  InvestmentCategory,
  InvestmentEventKind,
  InvestmentLiquidity,
  InvestmentRiskLevel,
  KakeiboPillar,
  PaymentMethod,
} from '../../shared/types';

export { CURRENCY_OPTIONS, findCurrencyOption };
export type { CurrencyOption };

export function formatMoney(amount: number, symbol = '$', showPlus = false): string {
  const num = Number.isFinite(amount) ? amount : 0;
  const abs = Math.abs(num);
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (num < -0.004) return `-${symbol}${formatted}`;
  if (showPlus && num > 0.004) return `+${symbol}${formatted}`;
  return `${symbol}${formatted}`;
}

export function formatShortDate(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [, m, d] = parts;
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const mIdx = parseInt(m, 10) - 1;
  return `${d} ${months[mIdx] || m}`;
}

export function formatFullDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function getPaymentMethodLabel(method: PaymentMethod): string {
  return method === 'transferencia' ? 'Transferencia' : 'Efectivo';
}

export const KAKEIBO_PILLARS: Record<
  KakeiboPillar,
  { label: string; asianTag: string; colorClass: string; desc: string }
> = {
  supervivencia: {
    label: 'Supervivencia / Necesidad',
    asianTag: '必需',
    colorClass: 'pillar-cyan',
    desc: 'Vivienda, alimentación básica, transporte esencial y servicios.',
  },
  opcional: {
    label: 'Opcional / Gusto',
    asianTag: '娯楽',
    colorClass: 'pillar-emerald',
    desc: 'Salidas, antojos, compras personales y entretenimiento.',
  },
  cultura: {
    label: 'Cultura y Mejora',
    asianTag: '教養',
    colorClass: 'pillar-violet',
    desc: 'Libros, cursos, salud preventiva y crecimiento personal.',
  },
  imprevisto: {
    label: 'Extra / Imprevisto',
    asianTag: '特別',
    colorClass: 'pillar-amber',
    desc: 'Reparaciones, emergencias médicas, regalos o eventos únicos.',
  },
  patrimonio: {
    label: 'Patrimonio / Deuda',
    asianTag: '資産',
    colorClass: 'pillar-violet',
    desc: 'Aportes a inversiones o amortización de deudas.',
  },
  ingreso: {
    label: 'Entrada de Dinero',
    asianTag: '収入',
    colorClass: 'pillar-emerald',
    desc: 'Ingresos extra, bonos, ventas o reembolsos a favor.',
  },
  ajuste: {
    label: 'Ajuste / Arqueo',
    asianTag: '調整',
    colorClass: 'pillar-magenta',
    desc: 'Modificación directa o cuadre del saldo en Efectivo o Transferencia.',
  },
  traspaso: {
    label: 'Cambio Efectivo ⇄ Transf.',
    asianTag: '振替',
    colorClass: 'pillar-cyan',
    desc: 'Extracción en Caja Extra / Cajero o paso de dinero entre Efectivo y Transferencia.',
  },
};

export const INVESTMENT_CATEGORIES: Record<
  InvestmentCategory,
  { label: string; badge: string }
> = {
  negocio: { label: 'Negocio Propio / Mercancía / Emprendimiento', badge: 'NEGOCIO' },
  divisas: { label: 'Ahorro / Compra de Divisas (USD, EUR, MLC)', badge: 'DIVISAS' },
  ahorro_meta: { label: 'Fondo de Emergencia / Meta Fuerte', badge: 'FONDO' },
  cripto: { label: 'Criptoactivos (USDT, BTC...)', badge: 'CRIPTO' },
  acciones_etf: { label: 'Acciones / ETFs / Bolsa', badge: 'ETF·BOLSA' },
  renta_fija: { label: 'Plazo Fijo / Cuenta Remunerada', badge: 'RENTA FIJA' },
  bienes_raices: { label: 'Bienes Raíces / Inmuebles', badge: 'INMUEBLES' },
  otro: { label: 'Otra Inversión', badge: 'ACTIVO' },
};

export const INVESTMENT_RISK_META: Record<
  InvestmentRiskLevel,
  {
    label: string;
    shortLabel: string;
    badgeClass: string;
    hex: string;
    desc: string;
  }
> = {
  bajo: {
    label: 'Riesgo Bajo · Conservador',
    shortLabel: 'Bajo',
    badgeClass: 'risk-low',
    hex: '#00f5a0',
    desc: 'Reserva, plazo fijo o resguardo estable con muy poca probabilidad de pérdida.',
  },
  moderado: {
    label: 'Riesgo Moderado · Equilibrado',
    shortLabel: 'Moderado',
    badgeClass: 'risk-medium',
    hex: '#00f0ff',
    desc: 'Divisas, bienes raíces o fondos equilibrados con fluctuación moderada.',
  },
  alto: {
    label: 'Riesgo Alto · Dinámico',
    shortLabel: 'Alto',
    badgeClass: 'risk-high',
    hex: '#ffb800',
    desc: 'Mercancía, inventario, bolsa o negocio propio sujeto a ventas y mermas.',
  },
  especulativo: {
    label: 'Riesgo Especulativo · Muy Alto',
    shortLabel: 'Especulativo',
    badgeClass: 'risk-speculative',
    hex: '#ff2a85',
    desc: 'Criptoactivos volátiles o apuestas de alto retorno donde el capital puede caer fuerte.',
  },
};

export const INVESTMENT_LIQUIDITY_META: Record<
  InvestmentLiquidity,
  { label: string; shortLabel: string; desc: string }
> = {
  inmediata: {
    label: 'Liquidez Inmediata (24h)',
    shortLabel: 'Inmediata',
    desc: 'Puedes convertirlo en Efectivo o Transferencia hoy mismo.',
  },
  corto_plazo: {
    label: 'Corto Plazo (7–30 días)',
    shortLabel: '7–30 días',
    desc: 'Requiere vender mercancía o esperar liquidación corta.',
  },
  mediano_plazo: {
    label: 'Mediano Plazo (1–6 meses)',
    shortLabel: '1–6 meses',
    desc: 'Plazos fijos cortos o ciclos de retorno trimestrales.',
  },
  largo_plazo: {
    label: 'Largo Plazo / Bloqueado',
    shortLabel: 'Bloqueado',
    desc: 'Capital inmovilizado en equipos, inmuebles o plazos largos.',
  },
};

export const INVESTMENT_EVENT_META: Record<
  InvestmentEventKind,
  { label: string; badge: string; tone: 'emerald' | 'cyan' | 'rose' | 'violet' }
> = {
  return_payout: {
    label: 'Ganancia / Rendimiento Cobrado',
    badge: 'GANANCIA',
    tone: 'emerald',
  },
  capital_withdraw: {
    label: 'Retiro / Recuperación de Capital',
    badge: 'RETIRO',
    tone: 'cyan',
  },
  loss_writeoff: {
    label: 'Pérdida / Merma / Desvalorización',
    badge: 'PÉRDIDA',
    tone: 'rose',
  },
  valuation_sync: {
    label: 'Actualización de Valor Actual',
    badge: 'TASACIÓN',
    tone: 'violet',
  },
};

export function getDivisionLabel(
  division: string,
  customEnvelopes: { id: string; name: string }[] = []
): string {
  switch (division) {
    case 'hogar':
      return 'Gastos del Hogar';
    case 'deudas':
      return 'Deudas';
    case 'manutenciones':
      return 'Manutenciones';
    case 'inversiones':
      return 'Inversiones';
    case 'bolsillo':
      return 'Dinero de Bolsillo';
    case 'general':
      return 'Dinero General';
    default: {
      const found = customEnvelopes.find((c) => c.id === division);
      return found ? found.name : division;
    }
  }
}

export function getDivisionColorClass(division: string): string {
  switch (division) {
    case 'hogar':
      return 'div-amber';
    case 'deudas':
      return 'div-magenta';
    case 'manutenciones':
      return 'div-orange';
    case 'inversiones':
      return 'div-violet';
    case 'bolsillo':
      return 'div-emerald';
    case 'general':
    default:
      return 'div-cyan';
  }
}

export function exportDatabaseAsJson(db: AppDatabase): void {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `libreta-kakeibo-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportAllEntriesAsCsv(db: AppDatabase): void {
  const rows: string[][] = [
    [
      'Moneda',
      'Mes',
      'Fecha',
      'Tipo',
      'Via de Pago',
      'Concepto',
      'Division',
      'Inversion',
      'Pilar Kakeibo',
      'Monto',
      'Comision Traspaso',
      'Nota',
    ],
  ];

  const workspaces = Object.values(db.currencyWorkspaces || {});
  for (const ws of workspaces) {
    const invMap = new Map(ws.investments.map((i) => [i.id, i.name]));
    const sortedMonths = Object.keys(ws.months).sort();

    for (const mk of sortedMonths) {
      const m = ws.months[mk];
      for (const e of m.entries) {
        const signed =
          e.type === 'channel_transfer'
            ? e.amount
            : e.type === 'income' || e.type === 'adjustment_up'
            ? e.amount
            : -e.amount;

        rows.push([
          ws.currencyCode,
          mk,
          e.date,
          e.type,
          e.type === 'channel_transfer'
            ? e.transferDirection === 'cash_to_transf'
              ? 'Efectivo -> Transferencia'
              : 'Transferencia -> Efectivo'
            : getPaymentMethodLabel(e.paymentMethod),
          e.concept,
          getDivisionLabel(e.division, m.allocations.customEnvelopes),
          e.investmentId ? invMap.get(e.investmentId) || '' : '',
          KAKEIBO_PILLARS[e.pillar]?.label || e.pillar,
          signed.toFixed(2),
          e.transferFee ? e.transferFee.toFixed(2) : '0.00',
          e.note || '',
        ]);
      }
    }
  }

  const csvContent = rows
    .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `libreta-kakeibo-movimientos-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
