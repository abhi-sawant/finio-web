import { User } from 'lucide-react';
import { PERSON_ICON_MAP } from './personIcons';

interface PersonIconProps {
  icon: string;
  size?: number;
  color?: string;
}

export function PersonIcon({ icon, size = 16, color }: PersonIconProps) {
  const Icon = PERSON_ICON_MAP[icon] ?? User;
  return <Icon size={size} style={{ color }} />;
}
