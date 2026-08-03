import { useEffect, useState } from 'react';
import { Bell, BellRing, Repeat, Target, CreditCard, CalendarClock } from 'lucide-react';
import { toast } from 'sonner';
import { useFinanceStore } from '@/store/useFinanceStore';
import {
  isNotificationSupported,
  notificationPermission,
  refreshNotificationSchedule,
  requestNotificationPermission,
  showTestNotification,
  teardownNotifications,
  enablePeriodicSync,
  isPeriodicSyncActive,
} from '@/services/notifications';
import { SwitchField } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MAX_NOTIFY_LEAD_DAYS } from '@/utils/notifications';

const leadDayOptions = Array.from({ length: MAX_NOTIFY_LEAD_DAYS + 1 }, (_, i) => i);

/** Reminders — hidden entirely where the platform has no Notification API (an iOS
 *  Safari tab, for one), rather than showing a switch that cannot work. */
export function NotificationsSection() {
  const settings = useFinanceStore((s) => s.settings);
  const updateSettings = useFinanceStore((s) => s.updateSettings);

  // Permission lives in the browser, not the store — the user can revoke it in site settings
  // behind the app's back, so the switch below derives from both.
  const [permission, setPermission] = useState(notificationPermission());
  const [showLeadDaysPicker, setShowLeadDaysPicker] = useState(false);
  // Whether reminders can actually arrive while the app is closed. Only true on an installed
  // Chromium PWA, so the row's copy is derived rather than asserted.
  const [backgroundDelivery, setBackgroundDelivery] = useState(false);
  const remindersOn = settings.notificationsEnabled && permission === 'granted';

  // Resolve whether background delivery is really registered, so the Reminders row describes
  // what this device does rather than what the feature can do somewhere else.
  useEffect(() => {
    isPeriodicSyncActive()
      .then(setBackgroundDelivery)
      .catch(() => setBackgroundDelivery(false));
  }, []);

  /**
   * The one place notification permission is ever requested, because it has to come from a
   * gesture: `requestNotificationPermission()` is called before any `await` so the browser
   * still counts this click as user activation.
   */
  const handleToggleReminders = async (next: boolean) => {
    if (!next) {
      updateSettings({ notificationsEnabled: false });
      await teardownNotifications();
      return;
    }

    const result = await requestNotificationPermission();
    setPermission(result);

    if (result !== 'granted') {
      // Leave the setting off. Once denied, requestPermission() resolves instantly forever, so
      // the switch is rendered disabled from here on rather than snapping back on every tap.
      if (result === 'denied') {
        toast.error('Notifications are blocked for this site. Turn them on in your browser settings.');
      }
      return;
    }

    updateSettings({ notificationsEnabled: true });
    // Best-effort: unsupported or engagement-gated on most platforms, and the foreground pass
    // covers those, so a false here is not worth telling anyone about.
    setBackgroundDelivery(await enablePeriodicSync());
    await refreshNotificationSchedule();
    toast.success('Reminders are on');
  };

  const handleTestNotification = async () => {
    try {
      await showTestNotification();
    } catch {
      toast.error('Could not show a notification');
    }
  };

  if (!isNotificationSupported()) return null;

  return (
    <div className="card-elevated divide-border divide-y rounded-2xl">
      <SwitchField
        className="p-4"
        icon={<Bell size={18} className="text-muted-foreground shrink-0" />}
        title="Reminders"
        description={
          permission === 'denied'
            ? 'Blocked in your browser settings for this site'
            : backgroundDelivery
              ? 'Bill, budget and card alerts, even when Finio is closed'
              : 'Bill, budget and card alerts, shown when you open Finio'
        }
        checked={remindersOn}
        disabled={permission === 'denied'}
        onCheckedChange={handleToggleReminders}
      />

      {remindersOn && (
        <>
          <SwitchField
            className="p-4"
            icon={<Repeat size={18} className="text-muted-foreground shrink-0" />}
            title="Upcoming bills"
            description="Recurring transactions coming due"
            checked={settings.notifyBills}
            onCheckedChange={(notifyBills) => {
              updateSettings({ notifyBills });
              refreshNotificationSchedule();
            }}
          />
          <SwitchField
            className="p-4"
            icon={<Target size={18} className="text-muted-foreground shrink-0" />}
            title="Budget alerts"
            description="When a budget passes 85% or goes over"
            checked={settings.notifyBudgets}
            onCheckedChange={(notifyBudgets) => {
              updateSettings({ notifyBudgets });
              refreshNotificationSchedule();
            }}
          />
          <SwitchField
            className="p-4"
            icon={<CreditCard size={18} className="text-muted-foreground shrink-0" />}
            title="Credit card dues"
            description="Before a statement payment is due"
            checked={settings.notifyCreditDue}
            onCheckedChange={(notifyCreditDue) => {
              updateSettings({ notifyCreditDue });
              refreshNotificationSchedule();
            }}
          />

          <div className="flex items-center justify-between gap-3 p-4">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <CalendarClock size={18} className="text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium">Remind me</p>
                <p className="text-muted-foreground truncate text-xs">
                  {settings.notifyLeadDays === 0
                    ? 'On the due day'
                    : `${settings.notifyLeadDays} day${
                        settings.notifyLeadDays === 1 ? '' : 's'
                      } before the due date`}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowLeadDaysPicker(true)}
              className="bg-muted shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium"
            >
              {settings.notifyLeadDays === 0 ? 'Same day' : `${settings.notifyLeadDays}d`}
            </button>
          </div>

          {/* A reminder may be days out, so without this there is no way to confirm the
              pipeline actually works. */}
          <button onClick={handleTestNotification} className="flex w-full items-center gap-3 p-4">
            <BellRing size={18} className="text-muted-foreground shrink-0" />
            <span className="text-sm font-medium">Send a test reminder</span>
          </button>
        </>
      )}

      <Dialog open={showLeadDaysPicker} onOpenChange={setShowLeadDaysPicker}>
        <DialogContent className="bg-card top-1/3 mx-auto w-11/12 rounded-2xl sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remind me</DialogTitle>
            <DialogDescription>
              How many days before a bill or card payment is due to send the reminder.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-4 gap-1.5">
            {leadDayOptions.map((days) => (
              <button
                key={days}
                onClick={() => {
                  updateSettings({ notifyLeadDays: days });
                  refreshNotificationSchedule();
                  setShowLeadDaysPicker(false);
                }}
                className={`rounded-lg py-2 text-sm font-medium transition-colors ${
                  days === settings.notifyLeadDays
                    ? 'bg-grad-primary text-white'
                    : 'bg-muted hover:bg-muted/70'
                }`}
              >
                {days === 0 ? 'Same' : `${days}d`}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
