import React from 'react';
import {
  Armchair,
  Baby,
  Bus,
  Car,
  Carrot,
  Cherry,
  Cookie,
  Dices,
  Droplets,
  Dumbbell,
  Flame,
  Gamepad2,
  Gift,
  GraduationCap,
  HeartHandshake,
  HeartPulse,
  Home,
  Monitor,
  PawPrint,
  Plane,
  Scissors,
  Shirt,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Tag,
  Users,
  Utensils,
  Wifi,
  Wine,
  Wrench,
  Zap,
} from 'lucide-react';

export const HOGAR_ICON_OPTIONS: { key: string; label: string }[] = [
  { key: 'ShoppingCart', label: 'Carrito / Compras' },
  { key: 'Utensils', label: 'Cubiertos / Alimentos' },
  { key: 'Smartphone', label: 'Teléfono / Recarga' },
  { key: 'Zap', label: 'Electricidad / Energía' },
  { key: 'Wifi', label: 'Internet / Wi-Fi' },
  { key: 'Droplets', label: 'Agua / Gas / Aseo' },
  { key: 'Home', label: 'Casa / Vivienda' },
  { key: 'Armchair', label: 'Muebles / Hogar' },
  { key: 'Bus', label: 'Transporte' },
  { key: 'Car', label: 'Auto / Combustible' },
  { key: 'HeartPulse', label: 'Salud / Farmacia' },
  { key: 'Wrench', label: 'Reparaciones' },
  { key: 'Carrot', label: 'Verduras / Agro' },
  { key: 'Cherry', label: 'Frutas' },
  { key: 'Cookie', label: 'Snacks / Merienda' },
  { key: 'Wine', label: 'Bebidas' },
  { key: 'Shirt', label: 'Ropa / Calzado' },
  { key: 'GraduationCap', label: 'Educación' },
  { key: 'Scissors', label: 'Belleza / Barbería' },
  { key: 'Gamepad2', label: 'Entretenimiento' },
  { key: 'Dumbbell', label: 'Deportes' },
  { key: 'Users', label: 'Social' },
  { key: 'Monitor', label: 'Electrónica' },
  { key: 'Plane', label: 'Viajes' },
  { key: 'PawPrint', label: 'Mascotas' },
  { key: 'Gift', label: 'Regalos' },
  { key: 'HeartHandshake', label: 'Donaciones / Ayuda' },
  { key: 'Baby', label: 'Hijos / Familia' },
  { key: 'Flame', label: 'Cigarrillos / Gas' },
  { key: 'Dices', label: 'Lotería / Juegos' },
  { key: 'Sparkles', label: 'Especial' },
  { key: 'Tag', label: 'Etiqueta General' },
];

export const HogarCategoryIcon: React.FC<{
  iconKey: string;
  size?: number;
  color?: string;
}> = ({ iconKey, size = 20, color }) => {
  const props = { size, style: color ? { color } : undefined };
  switch (iconKey) {
    case 'ShoppingCart':
      return <ShoppingCart {...props} />;
    case 'Utensils':
      return <Utensils {...props} />;
    case 'Smartphone':
      return <Smartphone {...props} />;
    case 'Gamepad2':
      return <Gamepad2 {...props} />;
    case 'GraduationCap':
      return <GraduationCap {...props} />;
    case 'Scissors':
      return <Scissors {...props} />;
    case 'Dumbbell':
      return <Dumbbell {...props} />;
    case 'Users':
      return <Users {...props} />;
    case 'Bus':
      return <Bus {...props} />;
    case 'Shirt':
      return <Shirt {...props} />;
    case 'Car':
      return <Car {...props} />;
    case 'Wine':
      return <Wine {...props} />;
    case 'Flame':
      return <Flame {...props} />;
    case 'Monitor':
      return <Monitor {...props} />;
    case 'Plane':
      return <Plane {...props} />;
    case 'HeartPulse':
      return <HeartPulse {...props} />;
    case 'PawPrint':
      return <PawPrint {...props} />;
    case 'Wrench':
      return <Wrench {...props} />;
    case 'Home':
      return <Home {...props} />;
    case 'Armchair':
      return <Armchair {...props} />;
    case 'Gift':
      return <Gift {...props} />;
    case 'HeartHandshake':
      return <HeartHandshake {...props} />;
    case 'Dices':
      return <Dices {...props} />;
    case 'Cookie':
      return <Cookie {...props} />;
    case 'Baby':
      return <Baby {...props} />;
    case 'Carrot':
      return <Carrot {...props} />;
    case 'Cherry':
      return <Cherry {...props} />;
    case 'Zap':
      return <Zap {...props} />;
    case 'Wifi':
      return <Wifi {...props} />;
    case 'Droplets':
      return <Droplets {...props} />;
    case 'Sparkles':
      return <Sparkles {...props} />;
    default:
      return <Tag {...props} />;
  }
};
