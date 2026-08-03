import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/**
 * Shared chrome for the PIN dialog (AppLockSection) and the backup-passphrase dialogs
 * (BackupSection) — both are "current → enter → confirm" secret-entry phase machines that
 * differ only in what captures the value (PinPad vs a text Input) and in their verification
 * logic, so only the surrounding Dialog/Header/error-row markup is shared here rather than
 * forcing the two state machines together.
 */
export function SecretDialogShell({
  open,
  onOpenChange,
  title,
  description,
  className,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('bg-card top-1/3 mx-auto w-11/12 rounded-2xl sm:max-w-sm', className)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

/** The `role="alert"` error row repeated across every phase of both dialogs. */
export function SecretDialogError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-destructive flex items-center gap-1.5 text-xs font-medium">
      <AlertTriangle size={13} aria-hidden="true" />
      {message}
    </p>
  );
}
