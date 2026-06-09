'use client';

import { useTransition, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTheme } from '@/components/providers/theme-provider';
import { toast } from 'sonner';
import { Sun, Moon, Monitor, Clock, Bell, Calendar, MessageSquare, GraduationCap, CheckSquare, Mail } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { upsertPreferences } from '@/lib/actions/preferences';
import type { UserPreferences, UpsertPreferencesInput, NotificationPrefs } from '@/types/app';

const TIMEZONES = [
  { value: 'America/New_York',    label: 'Eastern (ET)' },
  { value: 'America/Chicago',     label: 'Central (CT)' },
  { value: 'America/Denver',      label: 'Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'America/Anchorage',   label: 'Alaska (AKT)' },
  { value: 'Pacific/Honolulu',    label: 'Hawaii (HT)' },
  { value: 'Europe/London',       label: 'London (GMT/BST)' },
  { value: 'Europe/Paris',        label: 'Paris (CET/CEST)' },
  { value: 'Asia/Dubai',          label: 'Dubai (GST)' },
  { value: 'Asia/Kolkata',        label: 'India (IST)' },
  { value: 'Asia/Singapore',      label: 'Singapore (SGT)' },
  { value: 'Asia/Tokyo',          label: 'Tokyo (JST)' },
  { value: 'Australia/Sydney',    label: 'Sydney (AEST/AEDT)' },
];

const THEME_OPTIONS = [
  { value: 'light',  label: 'Light',  icon: Sun,     desc: 'Always use light mode' },
  { value: 'dark',   label: 'Dark',   icon: Moon,    desc: 'Always use dark mode' },
  { value: 'system', label: 'System', icon: Monitor, desc: 'Follow your OS setting' },
] as const;

interface Props {
  preferences: UserPreferences | null;
}

export default function PreferencesForm({ preferences }: Props) {
  const [isPending, startTransition] = useTransition();
  const { theme: currentTheme, setTheme } = useTheme();

  const { watch, setValue } = useForm<UpsertPreferencesInput>({
    defaultValues: {
      theme:       preferences?.theme ?? 'system',
      language:    preferences?.language ?? 'en',
      timezone:    preferences?.timezone ?? 'America/New_York',
      date_format: preferences?.date_format ?? 'MM/DD/YYYY',
      time_format: preferences?.time_format ?? '12h',
      notification_prefs: preferences?.notification_prefs ?? {
        email: true, push: true, tasks: true,
        calendar: true, messages: true, training: true,
      },
    },
  });

  const values = watch();

  // Sync saved theme preference to next-themes on mount
  useEffect(() => {
    if (preferences?.theme && preferences.theme !== currentTheme) {
      setTheme(preferences.theme);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save on any change (debounced 800ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      startTransition(async () => {
        const r = await upsertPreferences(values);
        if (r.success) toast.success('Preferences saved', { duration: 1500 });
        else toast.error(r.error);
      });
    }, 800);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(values)]);

  const DEFAULT_NOTIF: NotificationPrefs = { email: true, push: true, tasks: true, calendar: true, messages: true, training: true };
  const np: NotificationPrefs = values.notification_prefs ?? DEFAULT_NOTIF;

  function handleThemeChange(value: 'light' | 'dark' | 'system') {
    setValue('theme', value);
    setTheme(value);                // apply immediately to the DOM
  }

  const NOTIFICATION_ITEMS = [
    { key: 'email'    as const, icon: Mail,         title: 'Email Notifications',  desc: 'Receive notifications via email' },
    { key: 'push'     as const, icon: Bell,         title: 'Push Notifications',   desc: 'In-app and browser push alerts' },
    { key: 'tasks'    as const, icon: CheckSquare,  title: 'Task Updates',         desc: 'When tasks are assigned or updated' },
    { key: 'calendar' as const, icon: Calendar,     title: 'Calendar Reminders',   desc: 'Meeting and event alerts' },
    { key: 'messages' as const, icon: MessageSquare,title: 'Messages',             desc: 'New messages and mentions' },
    { key: 'training' as const, icon: GraduationCap,title: 'Training Reminders',   desc: 'Course deadlines and assignments' },
  ];

  return (
    <div className="space-y-4 mt-6">

      {/* ── Appearance ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <Sun className="h-4 w-4 text-slate-400" />
            Appearance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-slate-400 mb-3">Choose your preferred color scheme</p>
          <div className="grid grid-cols-3 gap-3">
            {THEME_OPTIONS.map(({ value, label, icon: Icon, desc }) => {
              const isActive = values.theme === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleThemeChange(value)}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all text-center cursor-pointer',
                    isActive
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                      : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'
                  )}
                >
                  <div className={cn(
                    'w-10 h-10 rounded-lg flex items-center justify-center',
                    isActive ? 'bg-blue-100 dark:bg-blue-900/50' : 'bg-slate-100 dark:bg-slate-800'
                  )}>
                    <Icon className={cn('h-5 w-5', isActive ? 'text-blue-600' : 'text-slate-400')} />
                  </div>
                  <div>
                    <p className={cn('text-sm font-semibold', isActive ? 'text-blue-700 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300')}>
                      {label}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">{desc}</p>
                  </div>
                  {isActive && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                      Active
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Localization ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-400" />
            Localization
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Timezone */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Timezone</Label>
              <p className="text-xs text-slate-400 mt-0.5">Used for all dates and times</p>
            </div>
            <Select value={values.timezone} onValueChange={(v) => v && setValue('timezone', v)}>
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIMEZONES.map(tz => <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Date format */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Date Format</Label>
              <p className="text-xs text-slate-400 mt-0.5">How dates appear throughout the app</p>
            </div>
            <Select value={values.date_format} onValueChange={(v) => v && setValue('date_format', v)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MM/DD/YYYY">MM/DD/YYYY &nbsp;(US)</SelectItem>
                <SelectItem value="DD/MM/YYYY">DD/MM/YYYY &nbsp;(EU)</SelectItem>
                <SelectItem value="YYYY-MM-DD">YYYY-MM-DD &nbsp;(ISO)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Time format */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Time Format</Label>
              <p className="text-xs text-slate-400 mt-0.5">12-hour or 24-hour clock</p>
            </div>
            <Select value={values.time_format} onValueChange={(v) => v && setValue('time_format', v as '12h' | '24h')}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="12h">12-hour &nbsp;(1:30 PM)</SelectItem>
                <SelectItem value="24h">24-hour &nbsp;(13:30)</SelectItem>
              </SelectContent>
            </Select>
          </div>

        </CardContent>
      </Card>

      {/* ── Notification Preferences ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <Bell className="h-4 w-4 text-slate-400" />
            Notification Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-0">
          {NOTIFICATION_ITEMS.map(({ key, icon: Icon, title, desc }, i) => (
            <div key={key}>
              {i > 0 && <Separator className="my-3" />}
              <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-slate-400" />
                  </div>
                  <div>
                    <Label className="text-sm font-medium cursor-pointer">{title}</Label>
                    <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
                  </div>
                </div>
                <Switch
                  checked={(np[key] as boolean) ?? true}
                  onCheckedChange={(checked) =>
                    setValue('notification_prefs', { ...np, [key]: checked } as NotificationPrefs)
                  }
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {isPending && (
        <p className="text-xs text-slate-400 text-center animate-pulse">Saving preferences…</p>
      )}

    </div>
  );
}
