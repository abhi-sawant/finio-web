import { useCallback, useRef, useState, type ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ConfirmContext, type ConfirmFn, type ConfirmOptions } from '@/components/ui/use-confirm';

/**
 * Promise-based replacement for the native `confirm()`, rendered as a shadcn `AlertDialog`
 * so destructive actions look like the rest of the app and keep focus inside the dialog.
 *
 * A single dialog instance is shared by every caller; `confirm()` resolves `true` only if
 * the user picks the confirming action.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const settle = useCallback((value: boolean) => {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setOptions(null);
  }, []);

  const confirm = useCallback<ConfirmFn>((next) => {
    // A second request while one is pending would strand the first promise.
    resolveRef.current?.(false);
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  return (
    <ConfirmContext value={confirm}>
      {children}
      <AlertDialog
        open={options !== null}
        onOpenChange={(open) => {
          // Dismissing via Escape or the backdrop is a cancel.
          if (!open) settle(false);
        }}
      >
        {options && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{options.title}</AlertDialogTitle>
              {options.description && (
                <AlertDialogDescription>{options.description}</AlertDialogDescription>
              )}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => settle(false)}>
                {options.cancelLabel ?? 'Cancel'}
              </AlertDialogCancel>
              <AlertDialogAction
                variant={options.destructive === false ? 'default' : 'destructive'}
                onClick={() => settle(true)}
              >
                {options.confirmLabel ?? 'Confirm'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </ConfirmContext>
  );
}
