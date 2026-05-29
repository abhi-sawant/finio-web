import {
  Utensils,
  Car,
  ShoppingBag,
  Film,
  Zap,
  HeartPulse,
  BookOpen,
  Home,
  Plane,
  Gift,
  Scissors,
  Repeat,
  Truck,
  DollarSign,
  TrendingUp,
  Briefcase,
  Laptop,
  Building2,
  CircleEllipsis,
  type LucideIcon,
} from 'lucide-react';

const CATEGORY_ICON_MAP: Record<string, LucideIcon> = {
  utensils: Utensils,
  car: Car,
  'shopping-bag': ShoppingBag,
  film: Film,
  zap: Zap,
  'heart-pulse': HeartPulse,
  'book-open': BookOpen,
  home: Home,
  plane: Plane,
  gift: Gift,
  scissors: Scissors,
  repeat: Repeat,
  truck: Truck,
  'dollar-sign': DollarSign,
  'trending-up': TrendingUp,
  briefcase: Briefcase,
  laptop: Laptop,
  'building-2': Building2,
  'circle-ellipsis': CircleEllipsis,
};

interface CategoryIconProps {
  icon: string;
  size?: number;
  color?: string;
}

export function CategoryIcon({ icon, size = 16, color }: CategoryIconProps) {
  const Icon = CATEGORY_ICON_MAP[icon];
  if (Icon) return <Icon size={size} style={{ color }} />;
  // Fallback: first character for unknown icons
  return <span style={{ fontSize: size * 0.8, lineHeight: 1 }}>{icon.charAt(0)}</span>;
}
