import { Eye, EyeOff } from 'lucide-react';
import { useFinanceStore } from '@/store/useFinanceStore';
import { Button } from '@/components/ui/button';

/** Header icon button that masks every rendered amount behind dots — the app's privacy toggle. */
export function HideAmountsToggle() {
  const hideAmounts = useFinanceStore((s) => s.settings.hideAmounts);
  const updateSettings = useFinanceStore((s) => s.updateSettings);

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={() => updateSettings({ hideAmounts: !hideAmounts })}
      className="bg-card hover:bg-muted h-9 w-9 rounded-full"
      aria-label={hideAmounts ? 'Show amounts' : 'Hide amounts'}
      aria-pressed={hideAmounts}
    >
      {hideAmounts ? <EyeOff size={16} /> : <Eye size={16} />}
    </Button>
  );
}
