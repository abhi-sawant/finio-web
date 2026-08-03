import { useState } from 'react';
import { User, Palette, CalendarRange } from 'lucide-react';
import { useFinanceStore } from '@/store/useFinanceStore';
import { useAuthStore } from '@/store/useAuthStore';
import { api } from '@/services/api';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatOrdinal } from '@/utils/formatters';
import {
  MAX_MONTH_START_DAY,
  MIN_MONTH_START_DAY,
  normalizeMonthStartDay,
  periodLabel,
  periodRange,
} from '@/utils/period';
import type { Theme } from '@/types';

const themes: { value: Theme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const monthStartDays = Array.from(
  { length: MAX_MONTH_START_DAY - MIN_MONTH_START_DAY + 1 },
  (_, i) => MIN_MONTH_START_DAY + i,
);

export function ProfileSection() {
  const settings = useFinanceStore((s) => s.settings);
  const updateSettings = useFinanceStore((s) => s.updateSettings);
  const token = useAuthStore((s) => s.token);
  const setAuth = useAuthStore((s) => s.setAuth);

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(settings.userName);
  const [showMonthStartPicker, setShowMonthStartPicker] = useState(false);

  const monthStartDay = normalizeMonthStartDay(settings.monthStartDay);
  const currentCycleLabel = periodLabel(
    periodRange('monthly', new Date(), monthStartDay),
    monthStartDay,
  );

  const handleNameSave = async (newName: string) => {
    const trimmed = newName.trim() || 'User';
    updateSettings({ userName: trimmed });
    setEditingName(false);
    if (token) {
      try {
        const res = await api.updateProfile(token, { name: trimmed });
        setAuth(res.token, res.user);
      } catch {
        // local save succeeded; backend sync failed silently
      }
    }
  };

  return (
    <>
      {/* Profile name */}
      <div className="card-elevated divide-border divide-y rounded-2xl">
        <div className="flex items-center gap-3 p-4">
          <div className="bg-grad-primary-soft flex h-10 w-10 items-center justify-center rounded-full">
            <User size={18} className="text-primary" />
          </div>
          {editingName ? (
            <Input
              autoFocus
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={() => handleNameSave(nameValue)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleNameSave(nameValue);
              }}
              className="bg-muted h-auto flex-1 rounded-lg border-0 px-3 py-1.5"
            />
          ) : (
            <button onClick={() => setEditingName(true)} className="flex-1 text-left">
              <p className="text-sm font-medium">{settings.userName}</p>
              <p className="text-muted-foreground text-xs">Tap to edit name</p>
            </button>
          )}
        </div>
      </div>

      {/* Preferences */}
      <div className="card-elevated divide-border divide-y rounded-2xl">
        <div className="flex items-center justify-between p-4">
          <div className="flex w-32 items-center gap-3">
            <Palette size={18} className="text-muted-foreground" />
            <span className="text-sm font-medium">Theme</span>
          </div>
          <Select value={settings.theme} onValueChange={(v) => updateSettings({ theme: v as Theme })}>
            <SelectTrigger className="bg-muted h-auto rounded-lg border-0 px-3 py-1.5">
              <SelectValue>{themes.find((t) => t.value === settings.theme)?.label}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {themes.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between gap-3 p-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <CalendarRange size={18} className="text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium">Month starts on</p>
              <p className="text-muted-foreground truncate text-xs">
                Current cycle: {currentCycleLabel}
              </p>
            </div>
          </div>
          {/* A grid beats a 28-item dropdown here — every day is one tap away. */}
          <button
            onClick={() => setShowMonthStartPicker(true)}
            className="bg-muted shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium"
          >
            {formatOrdinal(monthStartDay)}
          </button>
        </div>

        <Dialog open={showMonthStartPicker} onOpenChange={setShowMonthStartPicker}>
          <DialogContent className="bg-card top-1/3 mx-auto w-11/12 rounded-2xl sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Month starts on</DialogTitle>
              <DialogDescription>
                Every "this month" total and monthly budget will run from this day to the day
                before it in the next month.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-7 gap-1.5">
              {monthStartDays.map((day) => (
                <button
                  key={day}
                  onClick={() => {
                    updateSettings({ monthStartDay: day });
                    setShowMonthStartPicker(false);
                  }}
                  className={`rounded-lg py-2 text-sm font-medium transition-colors ${
                    day === monthStartDay ? 'bg-grad-primary text-white' : 'bg-muted hover:bg-muted/70'
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
            <p className="text-muted-foreground text-xs">
              Days after the 28th aren't offered — they don't exist in every month.
            </p>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
