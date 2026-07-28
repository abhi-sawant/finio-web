import { useEffect, type ReactNode } from 'react';
import { Delete } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A PIN keypad, deliberately separate from `ui/number-pad`.
 *
 * `NumberPad` is amount-shaped — a decimal key, `formatInputAmount` in the display, a
 * two-decimal rule, a ten-digit cap — and is depended on by AddTransaction and Onboarding.
 * A PIN needs none of that and needs four things it does not have: dots instead of digits, a
 * fixed length, auto-submit on the last digit, and a biometric key in the corner. Bending one
 * component into both roles would make it worse for all three call sites.
 *
 * The key classes are copied verbatim from `NumberPad` so the two pads look identical.
 */

interface PinPadProps {
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  /** Fired once when `value` reaches `maxLength`. */
  onComplete?: (pin: string) => void;
  disabled?: boolean;
  /** Rendered in the bottom-left key slot — the biometric button on the lock screen. */
  leadingAction?: ReactNode;
}

interface PinDotsProps {
  filled: number;
  total: number;
  error?: boolean;
}

export function PinDots({ filled, total, error }: PinDotsProps) {
  return (
    <div className={cn('flex justify-center gap-3', error && 'animate-shake')} aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            'h-3.5 w-3.5 rounded-full transition-all',
            // Filled and empty differ in *shape* (solid disc vs ring), not only colour.
            i < filled ? 'bg-foreground scale-110' : 'border-muted-foreground/50 border-2',
            error && 'border-destructive',
          )}
        />
      ))}
    </div>
  );
}

const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3'] as const;

export function PinPad({
  value,
  onChange,
  maxLength,
  onComplete,
  disabled = false,
  leadingAction,
}: PinPadProps) {
  const press = (digit: string) => {
    if (disabled || value.length >= maxLength) return;
    onChange(value + digit);
  };

  const backspace = () => {
    if (disabled) return;
    onChange(value.slice(0, -1));
  };

  // Auto-submit in an effect rather than inside `press`, so a hardware-keyboard digit and a
  // tapped digit go through exactly one code path.
  useEffect(() => {
    if (value.length === maxLength) onComplete?.(value);
    // `onComplete` is intentionally not a dependency — it is recreated every render, and
    // re-running on identity change would fire the submit twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, maxLength]);

  // Desktop convenience. The pad buttons are real <button>s, so Tab + Space already works.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (disabled) return;
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        press(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        backspace();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const keyClass =
    'bg-card active:bg-muted flex h-14 items-center justify-center rounded-2xl text-xl font-semibold transition-all active:scale-95 select-none disabled:opacity-40';

  return (
    <div className="grid grid-cols-3 gap-2">
      {KEYS.map((digit) => (
        <button
          key={digit}
          type="button"
          onClick={() => press(digit)}
          disabled={disabled}
          className={keyClass}
        >
          {digit}
        </button>
      ))}

      {leadingAction ?? <span aria-hidden="true" />}

      <button type="button" onClick={() => press('0')} disabled={disabled} className={keyClass}>
        0
      </button>

      <button
        type="button"
        onClick={backspace}
        disabled={disabled}
        aria-label="Delete last digit"
        className={keyClass}
      >
        <Delete size={20} className="text-muted-foreground" />
      </button>
    </div>
  );
}
