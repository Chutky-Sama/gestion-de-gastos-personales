export interface HogarCategoryDef {
  id: string;
  name: string;
  iconKey: string;
  color: string;
  isCustom?: boolean;
}

/**
 * Catálogo de categorías para Gastos del Hogar estructurado tomando como referencia
 * directa la cuadrícula visual de "Mis Gastos" (Money Manager · com.freeman.moneymanager),
 * más servicios esenciales del hogar.
 */
export const DEFAULT_HOGAR_CATEGORIES: HogarCategoryDef[] = [
  { id: 'compras', name: 'Compras', iconKey: 'ShoppingCart', color: '#00f0ff' },
  { id: 'alimentos', name: 'Alimentos', iconKey: 'Utensils', color: '#00ff9d' },
  { id: 'telefono', name: 'Teléfono', iconKey: 'Smartphone', color: '#38bdf8' },
  { id: 'entretenimiento', name: 'Entretenimiento', iconKey: 'Gamepad2', color: '#b94eff' },
  { id: 'educacion', name: 'Educación', iconKey: 'GraduationCap', color: '#818cf8' },
  { id: 'belleza', name: 'Belleza', iconKey: 'Scissors', color: '#f472b6' },
  { id: 'deportes', name: 'Deportes', iconKey: 'Dumbbell', color: '#34d399' },
  { id: 'social', name: 'Social', iconKey: 'Users', color: '#60a5fa' },
  { id: 'transporte', name: 'Transporte', iconKey: 'Bus', color: '#ffb800' },
  { id: 'ropa', name: 'Ropa', iconKey: 'Shirt', color: '#c084fc' },
  { id: 'auto', name: 'Auto', iconKey: 'Car', color: '#fb923c' },
  { id: 'bebidas', name: 'Bebidas', iconKey: 'Wine', color: '#f87171' },
  { id: 'cigarrillos', name: 'Cigarrillos', iconKey: 'Flame', color: '#94a3b8' },
  { id: 'electronica', name: 'Electrónica', iconKey: 'Monitor', color: '#22d3ee' },
  { id: 'viajes', name: 'Viajes', iconKey: 'Plane', color: '#38bdf8' },
  { id: 'salud', name: 'Salud', iconKey: 'HeartPulse', color: '#ff2e88' },
  { id: 'mascotas', name: 'Mascotas', iconKey: 'PawPrint', color: '#fbbf24' },
  { id: 'reparaciones', name: 'Reparaciones', iconKey: 'Wrench', color: '#f97316' },
  { id: 'vivienda', name: 'Vivienda', iconKey: 'Home', color: '#00f0ff' },
  { id: 'hogar_muebles', name: 'Hogar', iconKey: 'Armchair', color: '#2dd4bf' },
  { id: 'regalos', name: 'Regalos', iconKey: 'Gift', color: '#fb7185' },
  { id: 'donaciones', name: 'Donaciones', iconKey: 'HeartHandshake', color: '#f43f5e' },
  { id: 'loteria', name: 'Lotería', iconKey: 'Dices', color: '#a78bfa' },
  { id: 'snacks', name: 'Snacks', iconKey: 'Cookie', color: '#facc15' },
  { id: 'hijos', name: 'Hijos', iconKey: 'Baby', color: '#67e8f9' },
  { id: 'verduras', name: 'Verduras', iconKey: 'Carrot', color: '#4ade80' },
  { id: 'frutas', name: 'Frutas', iconKey: 'Cherry', color: '#fb7185' },
  { id: 'electricidad', name: 'Electricidad', iconKey: 'Zap', color: '#ffb800' },
  { id: 'internet', name: 'Internet / Datos', iconKey: 'Wifi', color: '#00f0ff' },
  { id: 'agua_gas', name: 'Agua y Gas', iconKey: 'Droplets', color: '#38bdf8' },
];

export function getAllHogarCategories(
  custom: HogarCategoryDef[] = []
): HogarCategoryDef[] {
  return [...DEFAULT_HOGAR_CATEGORIES, ...custom];
}

export function findHogarCategory(
  id: string | undefined,
  custom: HogarCategoryDef[] = []
): HogarCategoryDef | undefined {
  if (!id) return undefined;
  return getAllHogarCategories(custom).find((c) => c.id === id);
}
