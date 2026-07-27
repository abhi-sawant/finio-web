import { Target } from 'lucide-react';
import { GOAL_ICON_MAP } from './goalIcons';

interface GoalIconProps {
  icon: string;
  size?: number;
  color?: string;
}

export function GoalIcon({ icon, size = 16, color }: GoalIconProps) {
  const Icon = GOAL_ICON_MAP[icon] ?? Target;
  return <Icon size={size} style={{ color }} />;
}
