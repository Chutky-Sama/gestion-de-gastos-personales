export interface CurrencyOption {
  code: string;
  symbol: string;
  shortTag: string;
  label: string;
}

export const CURRENCY_OPTIONS: CurrencyOption[] = [
  {
    code: 'CUP',
    symbol: '$',
    shortTag: 'CUP · Peso',
    label: 'CUP ($) · Peso Cubano (Moneda Nacional)',
  },
  {
    code: 'USD',
    symbol: 'US$',
    shortTag: 'USD · Dólar',
    label: 'USD (US$) · Dólar Estadounidense',
  },
  {
    code: 'MLC',
    symbol: 'MLC ',
    shortTag: 'MLC · Cuba',
    label: 'MLC · Moneda Libremente Convertible (Cuba)',
  },
  {
    code: 'EUR',
    symbol: '€',
    shortTag: 'EUR · Euro',
    label: 'EUR (€) · Euro',
  },
  {
    code: 'CAD',
    symbol: 'CA$',
    shortTag: 'CAD · Dólar Can.',
    label: 'CAD (CA$) · Dólar Canadiense',
  },
  {
    code: 'MXN',
    symbol: 'MX$',
    shortTag: 'MXN · Peso Mex.',
    label: 'MXN (MX$) · Peso Mexicano',
  },
  {
    code: 'DOP',
    symbol: 'RD$',
    shortTag: 'DOP · Peso Dom.',
    label: 'DOP (RD$) · Peso Dominicano',
  },
  {
    code: 'COP',
    symbol: 'COL$',
    shortTag: 'COP · Peso Col.',
    label: 'COP (COL$) · Peso Colombiano',
  },
  {
    code: 'BRL',
    symbol: 'R$',
    shortTag: 'BRL · Real',
    label: 'BRL (R$) · Real Brasileño',
  },
  {
    code: 'PEN',
    symbol: 'S/',
    shortTag: 'PEN · Sol',
    label: 'PEN (S/) · Sol Peruano',
  },
  {
    code: 'ARS',
    symbol: 'AR$',
    shortTag: 'ARS · Peso Arg.',
    label: 'ARS (AR$) · Peso Argentino',
  },
  {
    code: 'CLP',
    symbol: 'CLP$',
    shortTag: 'CLP · Peso Chi.',
    label: 'CLP (CLP$) · Peso Chileno',
  },
  {
    code: 'GTQ',
    symbol: 'Q',
    shortTag: 'GTQ · Quetzal',
    label: 'GTQ (Q) · Quetzal Guatemalteco',
  },
  {
    code: 'CRC',
    symbol: '₡',
    shortTag: 'CRC · Colón',
    label: 'CRC (₡) · Colón Costarricense',
  },
  {
    code: 'UYU',
    symbol: '$U',
    shortTag: 'UYU · Peso Uru.',
    label: 'UYU ($U) · Peso Uruguayo',
  },
  {
    code: 'RUB',
    symbol: '₽',
    shortTag: 'RUB · Rublo',
    label: 'RUB (₽) · Rublo Ruso',
  },
];

export function findCurrencyOption(code: string): CurrencyOption {
  return (
    CURRENCY_OPTIONS.find((c) => c.code === code) || {
      code,
      symbol: '$',
      shortTag: code,
      label: `${code} ($)`,
    }
  );
}
