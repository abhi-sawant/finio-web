import {
  Target,
  PiggyBank,
  Plane,
  Home,
  Car,
  GraduationCap,
  Gift,
  Laptop,
  HeartPulse,
  Umbrella,
  Briefcase,
  Smartphone,
  type LucideIcon,
} from 'lucide-react';

export const GOAL_ICON_MAP: Record<string, LucideIcon> = {
  target: Target,
  'piggy-bank': PiggyBank,
  plane: Plane,
  home: Home,
  car: Car,
  'graduation-cap': GraduationCap,
  gift: Gift,
  laptop: Laptop,
  'heart-pulse': HeartPulse,
  umbrella: Umbrella,
  briefcase: Briefcase,
  smartphone: Smartphone,
};

export const GOAL_ICONS = Object.keys(GOAL_ICON_MAP);
