import * as React from 'react';
import { format, parse } from 'date-fns';
import { CalendarIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

/**
 * Parse the value used by `<input type="datetime-local">` (e.g., "2026-05-27T14:30")
 * into a Date in local time. Returns null for empty/invalid input.
 */
function parseDateTimeLocal(value: string): Date | null {
  if (!value) return null;
  const d = parse(value, "yyyy-MM-dd'T'HH:mm", new Date());
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Format a Date as the value used by `<input type="datetime-local">`. */
function formatDateTimeLocal(d: Date): string {
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

export interface DateTimePickerProps {
  /** Value formatted like `<input type="datetime-local">` (e.g., "2026-05-27T14:30"). */
  value: string;
  onChange: (value: string) => void;
  /** Wrapper class — for layout/spacing of the picker as a whole. */
  className?: string;
  /**
   * Class applied to both the date trigger and the time input so the picker
   * matches surrounding form fields (height, background, radius, etc.).
   * Defaults to the app's standard "big" form style.
   */
  inputClassName?: string;
  placeholder?: string;
  disabled?: boolean;
}

const DEFAULT_INPUT_CLASS = 'h-auto px-4 py-3 bg-card rounded-xl';

export function DateTimePicker({
  value,
  onChange,
  className,
  inputClassName = DEFAULT_INPUT_CLASS,
  placeholder = 'Pick a date',
  disabled,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const date = parseDateTimeLocal(value);
  const timeValue = date ? format(date, 'HH:mm') : '';

  const handleDateSelect = (selected: Date | undefined) => {
    if (!selected) return;
    const base = date ?? new Date();
    const next = new Date(selected);
    next.setHours(base.getHours(), base.getMinutes(), 0, 0);
    onChange(formatDateTimeLocal(next));
    setOpen(false);
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value; // "HH:mm"
    const [hStr, mStr] = next.split(':');
    const h = Number(hStr);
    const m = Number(mStr);
    if (Number.isNaN(h) || Number.isNaN(m)) return;
    const base = date ?? new Date();
    const updated = new Date(base);
    updated.setHours(h, m, 0, 0);
    onChange(formatDateTimeLocal(updated));
  };

  return (
    <div className={cn('flex gap-2', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              disabled={disabled}
              className={cn(
                'flex-1 justify-start text-left font-normal',
                inputClassName,
                !date && 'text-muted-foreground',
              )}
            >
              <CalendarIcon className="mr-2 size-4 shrink-0" />
              {date ? format(date, 'PPP') : <span>{placeholder}</span>}
            </Button>
          }
        />
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            selected={date ?? undefined}
            onSelect={handleDateSelect}
          />
        </PopoverContent>
      </Popover>
      <Input
        type="time"
        value={timeValue}
        onChange={handleTimeChange}
        disabled={disabled || !date}
        aria-label="Time"
        className={cn('w-28', inputClassName)}
      />
    </div>
  );
}

/** Re-export the value helpers so callers can convert between Date and the picker's value. */
export { parseDateTimeLocal, formatDateTimeLocal };
