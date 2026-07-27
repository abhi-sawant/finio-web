import { AlertTriangle, Check, TrendingUp } from 'lucide-react';
import { budgetHealth, type BudgetHealth, type BudgetStatus } from '@/utils/calculations';
import { cn } from '@/lib/utils';

const PRESENTATION: Record<
  BudgetHealth,
  { label: string; Icon: typeof AlertTriangle; className: string }
> = {
  over: { label: 'Over budget', Icon: AlertTriangle, className: 'bg-rose-500/15 text-rose-500' },
  near: { label: 'Near limit', Icon: TrendingUp, className: 'bg-amber-500/15 text-amber-500' },
  ok: { label: 'On track', Icon: Check, className: 'bg-emerald-500/15 text-emerald-500' },
};

interface BudgetHealthBadgeProps {
  status: Pick<BudgetStatus, 'isOver' | 'percent'>;
  className?: string;
}

/**
 * Names a budget's standing in words and an icon, so it doesn't depend on the bar's
 * colour alone. `<Icon aria-hidden>` because the label right next to it already says it.
 */
export function BudgetHealthBadge({ status, className }: BudgetHealthBadgeProps) {
  const { label, Icon, className: tone } = PRESENTATION[budgetHealth(status)];

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
        tone,
        className,
      )}
    >
      <Icon size={10} aria-hidden />
      {label}
    </span>
  );
}

interface BudgetProgressBarProps {
  status: Pick<BudgetStatus, 'isOver' | 'percent'>;
  /** Fill for a budget that isn't over or near its limit — usually the scope's own colour. */
  okFill: string;
  /** Read out instead of the bare percentage, e.g. "₹4,200 of ₹5,000 spent". */
  valueText: string;
  className?: string;
}

/**
 * The budget bar as a real `progressbar`, so its value is announced rather than only drawn.
 * Percentages are clamped for the *fill*; `aria-valuenow` keeps the true figure.
 */
export function BudgetProgressBar({
  status,
  okFill,
  valueText,
  className,
}: BudgetProgressBarProps) {
  const health = budgetHealth(status);
  const percent = Math.round(status.percent);

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={valueText}
      className={cn('bg-muted h-2 overflow-hidden rounded-full', className)}
    >
      <div
        className="h-full rounded-full transition-all"
        style={{
          width: `${Math.min(Math.max(status.percent, 0), 100)}%`,
          backgroundImage:
            health === 'over'
              ? 'var(--grad-danger)'
              : health === 'near'
                ? 'var(--grad-warning)'
                : okFill,
        }}
      />
    </div>
  );
}
