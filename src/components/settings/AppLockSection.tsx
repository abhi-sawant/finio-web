import { useEffect, useState } from 'react';
import { ChevronRight, Lock, LockKeyhole, KeyRound, Timer, Fingerprint } from 'lucide-react';
import { toast } from 'sonner';
import { useFinanceStore } from '@/store/useFinanceStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useAppLockStore } from '@/store/useAppLockStore';
import { exportLocalBackup } from '@/services/backup';
import {
  isPlatformAuthenticatorAvailable,
  registerBiometric,
} from '@/services/appLockBiometric';
import { clearBackgroundedAt } from '@/services/appLockSession';
import { SwitchField } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SecretDialogShell, SecretDialogError } from './SecretDialogShell';
import {
  derivePinHash,
  generateSalt,
  isPinCryptoSupported,
  PIN_HASH_ITERATIONS,
  PIN_LENGTH_OPTIONS,
  verifyPin,
} from '@/utils/pinCrypto';
import { PinDots, PinPad } from '@/components/applock/PinPad';
import { AUTO_LOCK_OPTIONS, autoLockLabel } from '@/utils/appLock';

type LockDialogKind = 'set' | 'change' | 'disable';
type PinPhase = 'length' | 'current' | 'enter' | 'confirm';

export function AppLockSection() {
  const settings = useFinanceStore((s) => s.settings);
  const token = useAuthStore((s) => s.token);

  const lockConfig = useAppLockStore((s) => s.config);
  const setLockConfig = useAppLockStore((s) => s.setConfig);
  const clearLockConfig = useAppLockStore((s) => s.clearConfig);
  const setAutoLockMinutes = useAppLockStore((s) => s.setAutoLockMinutes);
  const setWebauthnCredentialId = useAppLockStore((s) => s.setWebauthnCredentialId);
  const lockNow = useAppLockStore((s) => s.lock);
  const lockEnabled = lockConfig?.enabled === true;

  // Null until the async probe resolves — the row renders nothing until then, rather than
  // flashing a control that is about to disappear.
  const [biometricAvailable, setBiometricAvailable] = useState<boolean | null>(null);
  const [lockDialog, setLockDialog] = useState<LockDialogKind | null>(null);
  const [showAutoLockPicker, setShowAutoLockPicker] = useState(false);
  const [pinPhase, setPinPhase] = useState<PinPhase>('length');
  const [pinLength, setPinLength] = useState(4);
  const [pinEntry, setPinEntry] = useState('');
  const [firstPin, setFirstPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinBusy, setPinBusy] = useState(false);

  useEffect(() => {
    isPlatformAuthenticatorAvailable()
      .then(setBiometricAvailable)
      .catch(() => setBiometricAvailable(false));
  }, []);

  const handleExport = async () => {
    try {
      await exportLocalBackup();
      toast.success('Backup downloaded');
    } catch {
      toast.error('Export failed');
    }
  };

  const closeLockDialog = () => {
    setLockDialog(null);
    setPinPhase('length');
    setPinEntry('');
    setFirstPin('');
    setPinError(null);
    setPinBusy(false);
  };

  const openLockDialog = (which: LockDialogKind) => {
    setPinEntry('');
    setFirstPin('');
    setPinError(null);
    setPinLength(lockConfig?.pinLength ?? 4);
    setPinPhase(which === 'set' ? 'length' : 'current');
    setLockDialog(which);
  };

  /**
   * Both directions need input, so the switch opens a dialog rather than writing state. It
   * departs from the `onCheckedChange={(x) => updateSettings({ x })}` pattern used everywhere
   * else in Settings deliberately: flipping optimistically and then having the user cancel
   * would leave the control lying about the app's state.
   */
  const handleToggleAppLock = (next: boolean) => openLockDialog(next ? 'set' : 'disable');

  const savePin = async (pin: string) => {
    setPinBusy(true);
    const salt = generateSalt();
    const hash = await derivePinHash(pin, salt);
    setLockConfig({
      enabled: true,
      salt,
      hash,
      iterations: PIN_HASH_ITERATIONS,
      pinLength: pin.length,
      autoLockMinutes: lockConfig?.autoLockMinutes ?? 1,
      // A new PIN invalidates nothing about the passkey, but a fresh setup starts without one.
      webauthnCredentialId: lockConfig?.webauthnCredentialId ?? null,
      createdAt: lockConfig?.createdAt ?? new Date().toISOString(),
    });
    setPinBusy(false);
    closeLockDialog();
    toast.success(lockDialog === 'change' ? 'PIN changed' : 'App lock is on');
  };

  const handlePinComplete = async (value: string) => {
    if (pinBusy) return;
    setPinError(null);

    if (pinPhase === 'current') {
      if (!lockConfig) return;
      setPinBusy(true);
      const ok = await verifyPin(value, lockConfig);
      setPinBusy(false);
      setPinEntry('');

      if (!ok) {
        // No backoff ladder here — the app is already unlocked, so this guards a settings
        // change rather than the lock itself.
        setPinError('Incorrect PIN');
        return;
      }

      if (lockDialog === 'disable') {
        clearLockConfig();
        clearBackgroundedAt();
        closeLockDialog();
        toast.success('App lock is off');
        return;
      }

      setPinPhase('enter');
      return;
    }

    if (pinPhase === 'enter') {
      setFirstPin(value);
      setPinEntry('');
      setPinPhase('confirm');
      return;
    }

    if (pinPhase === 'confirm') {
      if (value !== firstPin) {
        // Back to entry, keeping the chosen length — losing it would be gratuitous.
        setPinEntry('');
        setPinPhase('enter');
        setPinError("Those didn't match. Try again.");
        return;
      }
      await savePin(value);
    }
  };

  const handleToggleBiometric = async (next: boolean) => {
    if (!next) {
      setWebauthnCredentialId(null);
      // There is no WebAuthn delete API — we can only forget the id. Saying so is the honest
      // thing; quietly implying the passkey is gone is not.
      toast.success('Biometric unlock off', {
        description:
          "The passkey may still be listed in your device's passkey settings — remove it there if you want it gone.",
      });
      return;
    }

    try {
      const credentialId = await registerBiometric(settings.userName);
      setWebauthnCredentialId(credentialId);
      toast.success('Biometric unlock is on');
    } catch {
      toast.error('Could not set up biometric unlock');
    }
  };

  return (
    <div className="card-elevated divide-border divide-y rounded-2xl">
      {!isPinCryptoSupported() ? (
        <div className="flex items-center gap-3 p-4">
          <Lock size={18} className="text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium">App lock</p>
            <p className="text-muted-foreground text-xs">
              Needs a secure connection (https or localhost).
            </p>
          </div>
        </div>
      ) : (
        <>
          <SwitchField
            className="p-4"
            icon={<Lock size={18} className="text-muted-foreground shrink-0" />}
            title="App lock"
            description="Ask for a PIN before opening Finio. Data on this device is not encrypted."
            checked={lockEnabled}
            onCheckedChange={handleToggleAppLock}
          />

          {lockEnabled && (
            <>
              <button
                onClick={() => openLockDialog('change')}
                className="flex w-full items-center justify-between p-4"
              >
                <div className="flex items-center gap-3">
                  <KeyRound size={18} className="text-muted-foreground" />
                  <span className="text-sm font-medium">Change PIN</span>
                </div>
                <ChevronRight size={16} className="text-muted-foreground" />
              </button>

              <div className="flex items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Timer size={18} className="text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Auto-lock</p>
                    <p className="text-muted-foreground truncate text-xs">
                      {autoLockLabel(lockConfig?.autoLockMinutes ?? 0)} in the background
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAutoLockPicker(true)}
                  className="bg-muted shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium"
                >
                  {lockConfig?.autoLockMinutes === 0 ? 'Now' : `${lockConfig?.autoLockMinutes}m`}
                </button>
              </div>

              {biometricAvailable && (
                <SwitchField
                  className="p-4"
                  icon={<Fingerprint size={18} className="text-muted-foreground shrink-0" />}
                  title="Unlock with biometrics"
                  description="Use Face ID, Touch ID or your device unlock instead of typing your PIN. The PIN always still works."
                  checked={!!lockConfig?.webauthnCredentialId}
                  onCheckedChange={handleToggleBiometric}
                />
              )}

              <button onClick={lockNow} className="flex w-full items-center gap-3 p-4">
                <LockKeyhole size={18} className="text-muted-foreground shrink-0" />
                <span className="text-sm font-medium">Lock now</span>
              </button>
            </>
          )}
        </>
      )}

      <Dialog open={showAutoLockPicker} onOpenChange={setShowAutoLockPicker}>
        <DialogContent className="bg-card top-1/3 mx-auto w-11/12 rounded-2xl sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Auto-lock</DialogTitle>
            <DialogDescription>
              How long Finio can sit in the background before it asks for your PIN again.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            {AUTO_LOCK_OPTIONS.map((minutes) => (
              <button
                key={minutes}
                onClick={() => {
                  setAutoLockMinutes(minutes);
                  setShowAutoLockPicker(false);
                }}
                className={`rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                  minutes === lockConfig?.autoLockMinutes
                    ? 'bg-grad-primary text-white'
                    : 'bg-muted hover:bg-muted/70'
                }`}
              >
                {autoLockLabel(minutes)}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* One dialog for set / change / disable — they are the same phase machine with
          different entry points and endings. */}
      <SecretDialogShell
        open={lockDialog !== null}
        onOpenChange={(open) => !open && closeLockDialog()}
        className="max-h-[80vh] overflow-y-auto"
        title={
          lockDialog === 'disable' ? 'Turn off app lock' : lockDialog === 'change' ? 'Change PIN' : 'Set a PIN'
        }
        description={
          lockDialog === 'disable'
            ? 'Enter your current PIN to remove the lock. This also forgets any biometric unlock.'
            : pinPhase === 'current'
              ? 'Enter your current PIN first.'
              : pinPhase === 'confirm'
                ? 'Enter it once more to confirm.'
                : pinPhase === 'enter'
                  ? 'Choose a PIN you will remember — it cannot be recovered.'
                  : 'Finio will ask for this PIN when you open it. This is a screen lock, not encryption: your data stays stored unencrypted on this device.'
        }
      >
        {pinPhase === 'length' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {PIN_LENGTH_OPTIONS.map((length) => (
                <button
                  key={length}
                  onClick={() => setPinLength(length)}
                  aria-pressed={pinLength === length}
                  className={`rounded-xl py-3 text-sm font-medium transition-colors ${
                    pinLength === length ? 'bg-grad-primary text-white' : 'bg-muted hover:bg-muted/70'
                  }`}
                >
                  {length} digits
                </button>
              ))}
            </div>
            {!token && (
              <p className="text-muted-foreground text-xs">
                A forgotten PIN can&rsquo;t be recovered.{' '}
                <button onClick={handleExport} className="text-primary underline">
                  Export a backup first?
                </button>
              </p>
            )}
            <Button size="lg" className="bg-grad-primary w-full text-white" onClick={() => setPinPhase('enter')}>
              Continue
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <PinDots
              filled={pinEntry.length}
              total={pinPhase === 'current' ? (lockConfig?.pinLength ?? 4) : pinLength}
              error={!!pinError}
            />
            <div className="flex min-h-5 items-center justify-center">
              <SecretDialogError message={pinError} />
            </div>
            <PinPad
              value={pinEntry}
              onChange={(v) => {
                if (pinError) setPinError(null);
                setPinEntry(v);
              }}
              maxLength={pinPhase === 'current' ? (lockConfig?.pinLength ?? 4) : pinLength}
              onComplete={handlePinComplete}
              disabled={pinBusy}
            />
          </div>
        )}
      </SecretDialogShell>
    </div>
  );
}
