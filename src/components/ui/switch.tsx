import { useId, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * The bare toggle. Always a real `<button role="switch">`, so Space/Enter work and
 * it carries the same focus ring as every other control in the app.
 *
 * It has no visible text of its own — pass either `aria-label` (standalone toggles,
 * e.g. one per row in a list) or `aria-labelledby` (when a nearby element already
 * names it). `SwitchField` wires the latter up for you.
 */
interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** `sm` is the inline-in-a-row size; `md` (default) is the settings-row size. */
  size?: 'sm' | 'md';
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
}

export function Switch({
  checked,
  onCheckedChange,
  size = 'md',
  disabled,
  className,
  ...aria
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors outline-none',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3',
        'disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-5 w-9' : 'h-6 w-11',
        checked ? 'bg-primary' : 'bg-muted',
        className,
      )}
      {...aria}
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none inline-block transform rounded-full bg-white shadow-md ring-0 transition-transform',
          size === 'sm' ? 'h-4 w-4' : 'h-5 w-5',
          checked ? (size === 'sm' ? 'translate-x-4' : 'translate-x-5') : 'translate-x-0',
        )}
      />
    </button>
  );
}

interface SwitchFieldProps extends Omit<SwitchProps, 'aria-label' | 'aria-labelledby'> {
  /** Visible name of the setting. Becomes the switch's accessible name. */
  title: ReactNode;
  /** Optional supporting copy. Becomes the switch's accessible description. */
  description?: ReactNode;
  /** Leading icon, purely decorative. */
  icon?: ReactNode;
  /** Applied to the row wrapper, not the switch. */
  className?: string;
  /**
   * Makes a tap anywhere on the row toggle the switch — for rows that used to be one big
   * button. The switch stays the only *focusable* control, so nothing is nested inside it.
   */
  interactiveRow?: boolean;
}

/**
 * A labelled settings row: icon + title + description on the left, `Switch` on the right.
 * The title and description are linked to the control with `aria-labelledby` /
 * `aria-describedby`, which is the association a `<label htmlFor>` can't give a button.
 */
export function SwitchField({
  title,
  description,
  icon,
  className,
  interactiveRow,
  checked,
  onCheckedChange,
  size,
  disabled,
}: SwitchFieldProps) {
  const id = useId();

  return (
    <div
      onClick={
        interactiveRow && !disabled
          ? (event) => {
              // The switch handles its own clicks; without this they'd toggle twice.
              if ((event.target as HTMLElement).closest('[role="switch"]')) return;
              onCheckedChange(!checked);
            }
          : undefined
      }
      className={cn('flex items-center gap-3', interactiveRow && 'cursor-pointer', className)}
    >
      {icon}
      <div className="min-w-0 flex-1">
        <p id={`${id}-title`} className="text-sm font-medium">
          {title}
        </p>
        {description && (
          <p id={`${id}-description`} className="text-muted-foreground text-xs">
            {description}
          </p>
        )}
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        size={size}
        disabled={disabled}
        aria-labelledby={`${id}-title`}
        aria-describedby={description ? `${id}-description` : undefined}
      />
    </div>
  );
}
