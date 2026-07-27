import { createContext, use, type ReactNode } from 'react';

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  /** Label on the confirming button. Defaults to "Confirm". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirming button as destructive. Defaults to true — nearly every caller deletes. */
  destructive?: boolean;
}

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

/** Lives apart from the provider component so fast refresh keeps working for both. */
export const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const confirm = use(ConfirmContext);
  if (!confirm) throw new Error('useConfirm must be used inside a <ConfirmProvider>');
  return confirm;
}
