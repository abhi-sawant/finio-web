import {
  User,
  Users,
  Handshake,
  Briefcase,
  Home,
  Heart,
  GraduationCap,
  Store,
  Landmark,
  Smile,
  type LucideIcon,
} from 'lucide-react';

export const PERSON_ICON_MAP: Record<string, LucideIcon> = {
  user: User,
  users: Users,
  handshake: Handshake,
  briefcase: Briefcase,
  home: Home,
  heart: Heart,
  'graduation-cap': GraduationCap,
  store: Store,
  landmark: Landmark,
  smile: Smile,
};

export const PERSON_ICONS = Object.keys(PERSON_ICON_MAP);
