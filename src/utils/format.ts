import {
  AppDatabase,
  InvestmentCategory,
  KakeiboPillar,
} from '../../shared/types';

export interface CurrencyOption {
  code: string;
  symbol: string;
  label: string;
}

export const CURRENCY_OPTIONS: CurrencyOption[] = [
  { code: 'USD', symbol: '$', label: 'USD ($) · Dólar' },
  { code: 'DOP', symbol: 'RD$', label: 'DOP (RD$) · Peso Dominicano' },
  { code: 'MXN', symbol: 'MX$', label: 'MXN (MX$) · Peso Mexicano' },
  { code: 'COP', symbol: 'COL$', label: 'COP (COL$) · Peso Colombiano' },
  { code: 'PEN', symbol: 'S/', label: 'PEN (S/) · Sol Peruano' },
  { code: 'ARS', symbol: 'AR$', label: 'ARS (AR$) · Peso Argentino' },
  { code: 'CLP', symbol: 'CLP$', label: 'CLP (CLP$) · Peso Chileno' },
  { code: 'EUR', symbol: '€', label: 'EUR (€) · Euro' },
  { code: 'GTQ', symbol: 'Q', label: 'GTQ (Q) · Quetzal' },
  { code: 'CRC', symbol: '₡', label: 'CRC (₡) · Colón' },
];

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
    desc: 'Modificación directa o cuadre del dinero general del mes.',
  },
};

export const INVESTMENT_CATEGORIES: Record<
  InvestmentCategory,
  { label: string; badge: string }
> = {
  acciones_etf: { label: 'Acciones / ETFs / Bolsa', badge: 'ETF·BOLSA' },
  cripto: { label: 'Criptoactivos (BTC, ETH...)', badge: 'CRIPTO' },
  renta_fija: { label: 'Plazo Fijo / Bonos / Cuenta Remunerada', badge: 'RENTA FIJA' },
  negocio: { label: 'Negocio Propio / Emprendimiento', badge: 'NEGOCIO' },
  bienes_raices: { label: 'Bienes Raíces / FIBRAs', badge: 'INMUEBLES' },
  ahorro_meta: { label: 'Fondo de Emergencia / Meta', badge: 'FONDO' },
  otro: { label: 'Otra Inversión', badge: 'ACTIVO' },
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
      'Mes',
      'Fecha',
      'Tipo',
      'Concepto',
      'Division',
      'Inversion',
      'Pilar Kakeibo',
      'Monto',
      'Moneda',
      'Nota',
    ],
  ];

  const invMap = new Map(db.investments.map((i) => [i.id, i.name]));
  const sortedMonths = Object.keys(db.months).sort();

  for (const mk of sortedMonths) {
    const m = db.months[mk];
    for (const e of m.entries) {
      const signed =
        e.type === 'income' || e.type === 'adjustment_up' ? e.amount : -e.amount;
      rows.push([
        mk,
        e.date,
        e.type,
        e.concept,
        getDivisionLabel(e.division, m.allocations.customEnvelopes),
        e.investmentId ? invMap.get(e.investmentId) || '' : '',
        KAKEIBO_PILLARS[e.pillar]?.label || e.pillar,
        signed.toFixed(2),
        db.profile.currencyCode,
        e.note || '',
      ]);
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
