import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Fingerprint, Lock } from 'lucide-react';
import { useAppLockStore } from '@/store/useAppLockStore';
import { useAuthStore } from '@/store/useAuthStore';
import { isWebAuthnSupported, verifyBiometric } from '@/services/appLockBiometric';
import { clearBackgroundedAt } from '@/services/appLockSession';
import { formatLockoutCountdown, remainingLockoutMs } from '@/utils/appLock';
import { verifyPin } from '@/utils/pinCrypto';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PinDots, PinPad } from './PinPad';

/**
 * Rendered in place of the app while it is locked.
 *
 * Sits above `<Routes>` in `AppRoutes`, which is what makes deep links survive the lock for
 * free: nothing on that path touches `window.location`, so a shared payload or a notification
 * URL is still intact when the gate lifts.
 */
export function LockScreen() {
  const config = useAppLockStore((s) => s.config);
  const failedAttempts = useAppLockStore((s) => s.failedAttempts);
  const lockedOutUntil = useAppLockStore((s) => s.lockedOutUntil);
  const unlock = useAppLockStore((s) => s.unlock);
  const registerFailure = useAppLockStore((s) => s.registerFailure);
  const expireLockout = useAppLockStore((s) => s.expireLockout);
  const hasCloudBackup = useAuthStore((s) => !!s.token);

  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  /** Display only. The pad's disabled state comes from the store, never from this. */
  const [cooldownMs, setCooldownMs] = useState(0);

  const headingRef = useRef<HTMLHeadingElement>(null);

  const pinLength = config?.pinLength ?? 4;
  const biometricAvailable = !!config?.webauthnCredentialId && isWebAuthnSupported();
  // Derived straight from the store rather than from the ticking countdown, so there is no
  // window — on mount, or right after a failure — where the pad is live but should not be.
  const inCooldown = lockedOutUntil !== null;

  // Announce the screen rather than dumping a screen reader at the top of an unlabelled page.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // Live countdown while the pad is disabled. When the deadline passes it clears the store's
  // lockout, which is what re-enables the pad — so the two can never disagree.
  useEffect(() => {
    if (!lockedOutUntil) return;
    const id = setInterval(() => {
      const remaining = remainingLockoutMs(lockedOutUntil, Date.now());
      setCooldownMs(remaining);
      if (remaining <= 0) {
        clearInterval(id);
        expireLockout();
      }
    }, 250);
    return () => clearInterval(id);
  }, [lockedOutUntil, expireLockout]);

  const succeed = () => {
    // Drop the stale backgrounded-at stamp so the next resume is measured from now.
    clearBackgroundedAt();
    unlock();
  };

  const handleComplete = async (candidate: string) => {
    if (!config || checking || inCooldown) return;

    setChecking(true);
    const ok = await verifyPin(candidate, config);
    setChecking(false);

    if (ok) {
      succeed();
      return;
    }

    registerFailure();
    // Reflect any freshly-earned cooldown right away, rather than waiting for the first tick.
    setCooldownMs(remainingLockoutMs(useAppLockStore.getState().lockedOutUntil, Date.now()));
    setPin('');
    setError('Incorrect PIN');
  };

  const handleBiometric = async () => {
    if (!config?.webauthnCredentialId || checking || inCooldown) return;
    setChecking(true);
    const ok = await verifyBiometric(config.webauthnCredentialId);
    setChecking(false);

    // A cancelled or failed biometric is ordinary — say so gently and leave the pad working.
    if (ok) succeed();
    else setError('Use your PIN instead');
  };

  const handleChange = (next: string) => {
    if (error) setError(null);
    setPin(next);
  };

  return (
    <div className="flex min-h-dvh w-full items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-4">
          <span className="bg-grad-primary shadow-glow-primary flex h-14 w-14 items-center justify-center rounded-full text-white">
            <Lock size={24} />
          </span>
          <div className="space-y-1.5 text-center">
            {/* No name greeting — it is the one piece of personal data that would otherwise be
                readable without unlocking, and it buys nothing. */}
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="text-2xl font-bold tracking-tight outline-none"
            >
              Finio is locked
            </h1>
            <p className="text-muted-foreground text-sm">Enter your PIN to continue.</p>
          </div>
        </div>

        <PinDots filled={pin.length} total={pinLength} error={!!error} />
        <span className="sr-only" role="status" aria-live="polite">
          {pin.length} of {pinLength} digits entered
        </span>

        <div className="flex min-h-10 items-center justify-center">
          {inCooldown ? (
            <p
              role="alert"
              className="text-destructive flex items-center gap-1.5 text-sm font-medium"
            >
              <AlertTriangle size={15} aria-hidden="true" />
              Too many attempts · try again in {formatLockoutCountdown(cooldownMs)}
            </p>
          ) : error ? (
            <p
              role="alert"
              className="text-destructive flex items-center gap-1.5 text-sm font-medium"
            >
              <AlertTriangle size={15} aria-hidden="true" />
              {error}
              {failedAttempts > 0 && failedAttempts < 5 ? ` · ${5 - failedAttempts} left` : ''}
            </p>
          ) : checking ? (
            <p className="text-muted-foreground text-sm">Checking…</p>
          ) : null}
        </div>

        <PinPad
          value={pin}
          onChange={handleChange}
          maxLength={pinLength}
          onComplete={handleComplete}
          disabled={checking || inCooldown}
          leadingAction={
            biometricAvailable ? (
              <button
                type="button"
                onClick={handleBiometric}
                disabled={checking || inCooldown}
                aria-label="Unlock with biometrics"
                className="bg-card active:bg-muted flex h-14 items-center justify-center rounded-2xl transition-all select-none active:scale-95 disabled:opacity-40"
              >
                <Fingerprint size={22} className="text-muted-foreground" />
              </button>
            ) : undefined
          }
        />

        <div className="text-center">
          <Button variant="ghost" size="sm" onClick={() => setShowForgot(true)}>
            Forgot PIN?
          </Button>
        </div>

        <Dialog open={showForgot} onOpenChange={setShowForgot}>
          <DialogContent className="bg-card top-1/3 mx-auto max-h-[70vh] w-11/12 overflow-y-auto rounded-2xl sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Forgot your PIN?</DialogTitle>
              <DialogDescription>
                Only a hash of your PIN is stored, so it cannot be recovered or reset from here.
              </DialogDescription>
            </DialogHeader>
            <div className="text-muted-foreground space-y-3 text-sm">
              <p>
                The lock is a screen gate, not encryption — your data is still stored on this
                device. The way back in is to clear Finio&rsquo;s site data in your browser, which
                removes the lock <strong className="text-foreground">and every transaction on
                this device</strong>.
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Chrome: Settings → Privacy and security → Site settings</li>
                <li>iOS Safari: Settings → Safari → Advanced → Website Data</li>
                <li>Installed app: uninstall and reinstall Finio</li>
              </ul>
              <p>
                {hasCloudBackup
                  ? 'Your cloud backup is unaffected — sign in afterwards and restore from it.'
                  : 'If you have an exported backup file, you can restore from it afterwards.'}
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
