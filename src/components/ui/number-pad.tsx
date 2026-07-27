import { Delete } from 'lucide-react';
import { formatInputAmount } from '@/utils/formatters';

interface NumberPadProps {
  value: string;
  onChange: (value: string) => void;
}

const BUTTONS = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
  ['.', '0', '⌫'],
] as const;

export function NumberPad({ value, onChange }: NumberPadProps) {
  const handlePress = (key: string) => {
    if (key === '⌫') {
      onChange(value.slice(0, -1));
      return;
    }
    if (key === '.') {
      if (!value.includes('.')) onChange(value ? value + '.' : '0.');
      return;
    }
    const [intPart, dec] = value.split('.');
    if (dec !== undefined && dec.length >= 2) return;
    if (intPart.length >= 10 && dec === undefined) return;
    if (!value || value === '0') {
      onChange(key);
    } else {
      onChange(value + key);
    }
  };

  const display = formatInputAmount(value);

  return (
    <div className="space-y-2">
      <div className="bg-card flex min-h-16 items-center justify-center rounded-2xl px-4 py-3">
        <span
          className={`font-bold tracking-tight transition-all ${
            display.length > 10 ? 'text-2xl' : 'text-3xl'
          } ${!value ? 'text-muted-foreground' : ''}`}
        >
          {display}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {BUTTONS.flat().map((btn) => (
          <button
            key={btn}
            type="button"
            onClick={() => handlePress(btn)}
            className="bg-card active:bg-muted flex h-14 items-center justify-center rounded-2xl text-xl font-semibold transition-all active:scale-95 select-none"
          >
            {btn === '⌫' ? (
              <Delete size={20} className="text-muted-foreground" />
            ) : btn === '.' ? (
              <span className="text-muted-foreground text-2xl leading-none">·</span>
            ) : (
              btn
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
