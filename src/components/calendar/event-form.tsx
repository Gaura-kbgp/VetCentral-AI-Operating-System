'use client';

import { useState, useTransition, useEffect, useRef, useCallback } from 'react';
import { format } from 'date-fns';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { Label }    from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectGroup,
  SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  CheckCircle2, XCircle, AlertTriangle, Loader2, Users, MapPin,
  Clock, X, Plus, ChevronDown, ChevronUp, CalendarClock, Sparkles,
  Building2, Link2, FileText, Tag, ShieldAlert, Calendar,
  ArrowRight, RefreshCw,
} from 'lucide-react';
import { DateTimePicker }    from '@/components/ui/date-time-picker';
import { AvailabilityGrid }  from '@/components/calendar/availability-grid';
import { createCalendarEvent, updateCalendarEvent, searchStaffProfiles } from '@/lib/actions/calendar';
import type { StaffProfile } from '@/lib/actions/calendar';
import { createScheduleRequest }                     from '@/lib/actions/schedule-requests';
import { checkEventConflicts, getAttendeeAvailability } from '@/lib/actions/scheduling';
import type { Conflict, AlternativeSlot }             from '@/lib/scheduling/conflict-engine';
import type { PersonAvailability }                    from '@/lib/actions/scheduling';
import type { CalendarEvent }                         from '@/types/app';
import type { CreateEventInput }                      from '@/lib/actions/calendar';
import type { AppRole }                               from '@/types/database';

// ── Event type config ─────────────────────────────────────────────────────────
const EVENT_TYPE_OPTIONS = [
  { group: 'Meetings', color: '#3B82F6', types: [
    { value: 'meeting',            label: 'Meeting' },
    { value: 'doctor_meeting',     label: 'Doctor Meeting' },
    { value: 'leadership_meeting', label: 'Leadership Meeting' },
    { value: 'manager_meeting',    label: 'Manager Meeting' },
    { value: 'department_meeting', label: 'Department Meeting' },
  ]},
  { group: 'Training', color: '#10B981', types: [
    { value: 'training',            label: 'Training' },
    { value: 'cpr_training',        label: 'CPR Training' },
    { value: 'osha_training',       label: 'OSHA Training' },
    { value: 'compliance_training', label: 'Compliance Training' },
    { value: 'lms_session',         label: 'LMS Session' },
  ]},
  { group: 'HR Events', color: '#14B8A6', types: [
    { value: 'onboarding',         label: 'Onboarding' },
    { value: 'orientation',        label: 'Orientation' },
    { value: 'performance_review', label: 'Performance Review' },
  ]},
  { group: 'PTO / Leave', color: '#F59E0B', types: [
    { value: 'pto',            label: 'PTO' },
    { value: 'vacation',       label: 'Vacation' },
    { value: 'sick_leave',     label: 'Sick Leave' },
    { value: 'personal_leave', label: 'Personal Leave' },
  ]},
  { group: 'Hospital Events', color: '#A855F7', types: [
    { value: 'hospital_event', label: 'Hospital Event' },
    { value: 'town_hall',      label: 'Town Hall' },
    { value: 'staff_event',    label: 'Staff Event' },
    { value: 'announcement',   label: 'Announcement' },
  ]},
  { group: 'Operational', color: '#EF4444', types: [
    { value: 'audit',      label: 'Audit' },
    { value: 'inspection', label: 'Inspection' },
    { value: 'deadline',   label: 'Deadline' },
  ]},
  { group: 'Projects', color: '#64748B', types: [
    { value: 'project_milestone', label: 'Milestone' },
    { value: 'project_review',    label: 'Project Review' },
  ]},
  { group: 'Other', color: '#94A3B8', types: [
    { value: 'maintenance', label: 'Maintenance' },
    { value: 'other',       label: 'Other' },
  ]},
];

// Flat lookup for type → group color
const TYPE_COLOR_MAP: Record<string, string> = {};
EVENT_TYPE_OPTIONS.forEach(g => g.types.forEach(t => { TYPE_COLOR_MAP[t.value] = g.color; }));

const PRIORITY_CONFIG = {
  low:    { label: 'Low',    dot: 'bg-gray-400',   ring: 'ring-gray-200',   text: 'text-gray-600' },
  medium: { label: 'Medium', dot: 'bg-blue-500',   ring: 'ring-blue-200',   text: 'text-blue-700' },
  high:   { label: 'High',   dot: 'bg-orange-500', ring: 'ring-orange-200', text: 'text-orange-700' },
  urgent: { label: 'Urgent', dot: 'bg-red-600',    ring: 'ring-red-200',    text: 'text-red-700' },
};

const TYPE_CONFLICT_LABELS: Record<string, string> = {
  room_conflict:     'Room Double-Booked',
  attendee_conflict: 'Person Unavailable',
  pto_conflict:      'On Approved Leave',
};

interface Hospital { id: string; name: string; }

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (event: CalendarEvent) => void;
  onRequested?: () => void;
  hospitals: Hospital[];
  initialDate?: Date;
  editEvent?: CalendarEvent | null;
  userRole?: AppRole | null;
  bookedSlots?: { start: string; end: string }[];
}

function toLocalDT(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

type CheckStatus = 'idle' | 'checking' | 'clear' | 'warning' | 'error';

const ADMIN_ROLES: AppRole[] = ['super_admin', 'org_admin', 'hospital_admin', 'practice_manager'];

// ─────────────────────────────────────────────────────────────────────────────
export default function EventForm({
  open, onClose, onSaved, onRequested, hospitals, initialDate,
  editEvent, userRole, bookedSlots = [],
}: Props) {
  const isAdmin = userRole ? ADMIN_ROLES.includes(userRole) : false;
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError]    = useState<string | null>(null);
  const [allowOverride, setAllowOverride] = useState(false);
  const [submitted, setSubmitted]    = useState(false);

  function buildForm() {
    const start = initialDate ?? new Date();
    const end   = new Date(start.getTime() + 60 * 60 * 1000);
    const p = (n: number) => String(n).padStart(2, '0');
    const fmtDT = (d: Date) =>
      `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:00`;
    return {
      title:        editEvent?.title ?? '',
      event_type:   editEvent?.event_type ?? 'meeting',
      start_time:   editEvent?.start_time ? toLocalDT(editEvent.start_time) : fmtDT(start),
      end_time:     editEvent?.end_time   ? toLocalDT(editEvent.end_time)   : fmtDT(end),
      is_all_day:   editEvent?.is_all_day ?? false,
      location:     editEvent?.location   ?? '',
      meeting_link: editEvent?.meeting_link ?? '',
      hospital_id:  editEvent?.hospital_id ?? 'all',
      priority:     'medium' as string,
      description:  editEvent?.description ?? '',
      attendees:    (editEvent?.attendees ?? []).map(a => a.email).filter(Boolean) as string[],
    };
  }

  const [form, setForm] = useState(buildForm);

  useEffect(() => {
    if (open) {
      setForm(buildForm());
      setAttendeeInput('');
      setStaffSuggestions([]);
      setShowSuggestions(false);
      setCheckStatus('idle');
      setConflicts([]);
      setAlternatives([]);
      setFormError(null);
      setAllowOverride(false);
      setSubmitted(false);
      setAvailability([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editEvent?.id]);

  const [attendeeInput, setAttendeeInput]     = useState('');
  const [staffSuggestions, setStaffSuggestions] = useState<StaffProfile[]>([]);
  const [staffSearching, setStaffSearching]   = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const staffDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [checkStatus, setCheckStatus]   = useState<CheckStatus>('idle');
  const [conflicts, setConflicts]       = useState<Conflict[]>([]);
  const [alternatives, setAlternatives] = useState<AlternativeSlot[]>([]);
  const [availability, setAvailability] = useState<PersonAvailability[]>([]);
  const debounceRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const availDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const set = (field: string, value: string | boolean | string[]) =>
    setForm(f => ({ ...f, [field]: value }));

  // ── Conflict check ─────────────────────────────────────────────────────────
  const runCheck = useCallback(async (f: typeof form) => {
    if (f.is_all_day) { setCheckStatus('idle'); return; }
    try {
      const sISO = new Date(f.start_time).toISOString();
      const eISO = new Date(f.end_time).toISOString();
      if (isNaN(Date.parse(f.start_time)) || isNaN(Date.parse(f.end_time))) return;
      if (new Date(f.start_time) >= new Date(f.end_time)) return;
      setCheckStatus('checking');
      setAllowOverride(false);
      const result = await checkEventConflicts({
        start_time: sISO, end_time: eISO, is_all_day: f.is_all_day,
        location: f.location || null,
        hospital_id: f.hospital_id !== 'all' ? f.hospital_id : null,
        attendee_emails: f.attendees,
        exclude_event_id: editEvent?.id,
      });
      setConflicts(result.conflicts);
      setAlternatives(result.alternatives);
      if (result.error) setCheckStatus('idle');
      else if (result.conflicts.some(c => c.severity === 'error')) setCheckStatus('error');
      else if (result.conflicts.some(c => c.severity === 'warning')) setCheckStatus('warning');
      else setCheckStatus('clear');
    } catch { setCheckStatus('idle'); }
  }, [editEvent?.id]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runCheck(form), 750);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.start_time, form.end_time, form.location, form.hospital_id,
      form.is_all_day, form.attendees.join(',')]);

  // ── Availability fetch ─────────────────────────────────────────────────────
  useEffect(() => {
    if (form.attendees.length === 0) { setAvailability([]); return; }
    if (availDebounceRef.current) clearTimeout(availDebounceRef.current);
    availDebounceRef.current = setTimeout(async () => {
      const dateStr = form.start_time.split('T')[0];
      if (!dateStr) return;
      const result = await getAttendeeAvailability(
        form.attendees, dateStr,
        form.hospital_id !== 'all' ? form.hospital_id : null,
      );
      setAvailability(result);
    }, 600);
    return () => { if (availDebounceRef.current) clearTimeout(availDebounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.attendees.join(','), form.start_time.split('T')[0], form.hospital_id]);

  // ── Attendee helpers ───────────────────────────────────────────────────────
  function addAttendee(raw: string) {
    const emails = raw.split(/[,;\s]+/).map(e => e.trim().toLowerCase()).filter(e => e.includes('@'));
    if (emails.length === 0) return;
    setForm(f => ({ ...f, attendees: [...new Set([...f.attendees, ...emails])] }));
    setAttendeeInput('');
  }
  function removeAttendee(email: string) {
    setForm(f => ({ ...f, attendees: f.attendees.filter(e => e !== email) }));
  }
  function onAttendeeKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (['Enter', ',', 'Tab'].includes(e.key)) { e.preventDefault(); addAttendee(attendeeInput); setShowSuggestions(false); }
    if (e.key === 'Escape') { setShowSuggestions(false); }
  }

  function onAttendeeInputChange(value: string) {
    setAttendeeInput(value);
    if (staffDebounceRef.current) clearTimeout(staffDebounceRef.current);
    if (value.trim().length < 2) { setStaffSuggestions([]); setShowSuggestions(false); return; }
    setStaffSearching(true);
    setShowSuggestions(true);
    staffDebounceRef.current = setTimeout(async () => {
      const result = await searchStaffProfiles(value.trim());
      setStaffSearching(false);
      if (result.success) {
        // filter out already-added
        setStaffSuggestions((result.data ?? []).filter(p => p.email && !form.attendees.includes(p.email)));
      }
    }, 300);
  }

  function selectStaff(profile: StaffProfile) {
    if (!profile.email) return;
    setForm(f => ({ ...f, attendees: [...new Set([...f.attendees, profile.email!])] }));
    setAttendeeInput('');
    setStaffSuggestions([]);
    setShowSuggestions(false);
  }

  function applyAlternative(slot: AlternativeSlot) {
    const p = (n: number) => String(n).padStart(2, '0');
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
    setForm(f => ({ ...f, start_time: fmt(new Date(slot.start)), end_time: fmt(new Date(slot.end)) }));
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  function handleSubmit(forceOverride = false) {
    if (!form.title.trim())  { setFormError('Title is required'); return; }
    if (!form.event_type)    { setFormError('Event type is required'); return; }

    const hasHardConflicts = conflicts.some(c => c.severity === 'error');
    if (hasHardConflicts && !allowOverride && !forceOverride) {
      setAllowOverride(true);
      setFormError('Scheduling conflicts detected — review conflicts or click "Override & Save"');
      return;
    }
    setFormError(null);

    const toISO = (dt: string, allDay: boolean, isEnd: boolean) =>
      allDay
        ? `${dt.split('T')[0]}T${isEnd ? '23:59:59' : '00:00:00'}.000Z`
        : new Date(dt).toISOString();

    const hospitalId = (form.hospital_id && form.hospital_id !== 'all') ? form.hospital_id : null;
    const startISO = toISO(form.start_time, form.is_all_day, false);
    const endISO   = toISO(form.end_time,   form.is_all_day, true);

    if (isAdmin || editEvent) {
      const payload: CreateEventInput = {
        title: form.title.trim(), event_type: form.event_type,
        start_time: startISO, end_time: endISO, is_all_day: form.is_all_day,
        location: form.location || null, meeting_link: form.meeting_link || null,
        hospital_id: hospitalId, priority: form.priority as any, description: form.description || null,
        is_recurring: false, attendees: form.attendees,
      };
      startTransition(async () => {
        const result = editEvent
          ? await updateCalendarEvent(editEvent.id, payload)
          : await createCalendarEvent(payload);
        if (!result.success) { setFormError(result.error ?? 'Failed'); return; }
        onSaved(result.data!); onClose();
      });
      return;
    }

    startTransition(async () => {
      const result = await createScheduleRequest({
        title: form.title.trim(), event_type: form.event_type,
        start_time: startISO, end_time: endISO, is_all_day: form.is_all_day,
        location: form.location || null, meeting_link: form.meeting_link || null,
        hospital_id: hospitalId, priority: form.priority,
        description: form.description || null, attendee_emails: form.attendees,
      });
      if (!result.success) { setFormError(result.error ?? 'Failed to submit'); return; }
      setSubmitted(true);
    });
  }

  // Derived
  const errorCount   = conflicts.filter(c => c.severity === 'error').length;
  const warningCount = conflicts.filter(c => c.severity === 'warning').length;
  const typeColor    = TYPE_COLOR_MAP[form.event_type] ?? '#3B82F6';
  const allBusySlots = availability.flatMap(p => p.busy_slots.map(s => ({ start: s.start, end: s.end })));
  const priorityCfg  = PRIORITY_CONFIG[form.priority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.medium;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent size="xl" className="w-full max-h-[95vh] p-0 overflow-hidden gap-0">

        {/* ── Success state ─────────────────────────────────────────── */}
        {submitted && (
          <div className="flex flex-col items-center justify-center gap-6 px-10 py-16 text-center">
            <div className="relative">
              <div className="w-20 h-20 rounded-3xl bg-amber-50 border-2 border-amber-200 flex items-center justify-center">
                <Clock className="h-10 w-10 text-amber-500" />
              </div>
              <div className="absolute -top-1 -right-1 w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center">
                <ArrowRight className="h-3.5 w-3.5 text-white" />
              </div>
            </div>
            <div>
              <h3 className="text-[20px] font-bold text-gray-900">Request Submitted</h3>
              <p className="text-[14px] text-gray-500 mt-2 leading-relaxed max-w-sm mx-auto">
                <span className="font-semibold text-gray-800">"{form.title}"</span> has been sent for admin approval.
                You'll receive a notification once it's confirmed.
              </p>
            </div>
            <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: typeColor }} />
              <span className="text-[13px] font-semibold text-gray-700">
                {new Date(form.start_time).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </span>
              <span className="text-gray-400">·</span>
              <span className="text-[13px] text-gray-600">
                {new Date(form.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                {' – '}
                {new Date(form.end_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </span>
            </div>
            <Button type="button" onClick={onClose} className="px-10 h-11 text-[14px]">
              Done
            </Button>
          </div>
        )}

        {!submitted && (
          <>
          {/* ── Colored header bar ──────────────────────────────────── */}
          <div className="relative overflow-hidden shrink-0" style={{ background: `linear-gradient(135deg, ${typeColor}18 0%, ${typeColor}08 100%)`, borderBottom: `3px solid ${typeColor}30` }}>
            <div className="flex items-start gap-4 px-7 py-5">
              {/* Icon */}
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 mt-0.5 shadow-sm"
                style={{ backgroundColor: typeColor }}>
                <CalendarClock className="h-6 w-6 text-white" />
              </div>

              {/* Title + meta */}
              <div className="flex-1 min-w-0">
                <input
                  value={form.title}
                  onChange={e => set('title', e.target.value)}
                  placeholder="Event title…"
                  className="w-full bg-transparent text-[22px] font-bold text-gray-900 placeholder:text-gray-300 outline-none border-none leading-tight"
                  style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif' }}
                  autoFocus
                />
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {!isAdmin && !editEvent && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full">
                      <Clock className="h-2.5 w-2.5" />Pending admin approval
                    </span>
                  )}
                  {isAdmin && !editEvent && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full">
                      <ShieldAlert className="h-2.5 w-2.5" />Admin — direct create
                    </span>
                  )}
                  {editEvent && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-100 border border-blue-200 px-2 py-0.5 rounded-full">
                      Editing event
                    </span>
                  )}
                  {/* Conflict status pill */}
                  {checkStatus === 'checking' && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-gray-500 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />Checking…
                    </span>
                  )}
                  {checkStatus === 'clear' && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="h-2.5 w-2.5" />All clear
                    </span>
                  )}
                  {checkStatus === 'error' && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                      <XCircle className="h-2.5 w-2.5" />{errorCount} conflict{errorCount !== 1 ? 's' : ''}
                    </span>
                  )}
                  {checkStatus === 'warning' && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                      <AlertTriangle className="h-2.5 w-2.5" />{warningCount} warning{warningCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Two-column body ──────────────────────────────────────── */}
          <div className="flex flex-1 min-h-0 overflow-hidden divide-x divide-gray-100">

            {/* ── LEFT: Form fields ────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 min-w-0">

              {/* Event Type + Priority row */}
              <div className="grid grid-cols-2 gap-4">
                <FormField icon={<Tag className="h-3.5 w-3.5" />} label="Event Type" required>
                  <Select value={form.event_type} onValueChange={v => v && set('event_type', v)}>
                    <SelectTrigger className="h-10 text-[13px]">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: TYPE_COLOR_MAP[form.event_type] ?? '#94A3B8' }} />
                        <SelectValue placeholder="Select type" />
                      </div>
                    </SelectTrigger>
                    <SelectContent className="max-h-64 min-w-55 scroll-smooth overscroll-y-contain">
                      {EVENT_TYPE_OPTIONS.map(group => (
                        <SelectGroup key={group.group}>
                          <SelectLabel className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 px-2 py-1">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
                            {group.group}
                          </SelectLabel>
                          {group.types.map(t => (
                            <SelectItem key={t.value} value={t.value} className="text-[13px]">
                              <span className="flex items-center gap-2 w-full">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
                                <span className="truncate">{t.label}</span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>

                <FormField icon={<ShieldAlert className="h-3.5 w-3.5" />} label="Priority">
                  <Select value={form.priority} onValueChange={v => v && set('priority', v)}>
                    <SelectTrigger className="h-10 text-[13px]">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${priorityCfg.dot}`} />
                        <SelectValue />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PRIORITY_CONFIG).map(([k, cfg]) => (
                        <SelectItem key={k} value={k}>
                          <span className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
                            <span className={`font-medium ${cfg.text}`}>{cfg.label}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              </div>

              {/* All-day toggle */}
              <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl border border-gray-100">
                <Switch
                  id="ev-allday"
                  checked={form.is_all_day}
                  onCheckedChange={v => set('is_all_day', v)}
                />
                <div>
                  <Label htmlFor="ev-allday" className="text-[13px] font-semibold text-gray-700 cursor-pointer">
                    All day event
                  </Label>
                  <p className="text-[11px] text-gray-400">No specific time — spans the full day</p>
                </div>
              </div>

              {/* Date / Time */}
              <div className="grid grid-cols-2 gap-4">
                <FormField icon={<Calendar className="h-3.5 w-3.5" />} label={form.is_all_day ? 'Start Date' : 'Start'} required>
                  <DateTimePicker
                    value={form.start_time}
                    onChange={v => {
                      // Keep end time = start + original duration (min 1 hour)
                      const p = (n: number) => String(n).padStart(2, '0');
                      const fmtDT = (d: Date) =>
                        `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
                      const prevStart = new Date(form.start_time);
                      const prevEnd   = new Date(form.end_time);
                      const duration  = Math.max(
                        prevEnd.getTime() - prevStart.getTime(),
                        60 * 60 * 1000,
                      );
                      const newStart = new Date(v);
                      const newEnd   = new Date(newStart.getTime() + duration);
                      setForm(f => ({ ...f, start_time: v, end_time: fmtDT(newEnd) }));
                    }}
                    dateOnly={form.is_all_day}
                    bookedSlots={allBusySlots}
                  />
                </FormField>
                <FormField
                  icon={<Calendar className="h-3.5 w-3.5" />}
                  label={form.is_all_day ? 'End Date' : 'End'}
                  required
                  badge={
                    !form.is_all_day && form.end_time && form.start_time &&
                    new Date(form.end_time) <= new Date(form.start_time)
                      ? <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">Before start</span>
                      : undefined
                  }
                >
                  <DateTimePicker
                    value={form.end_time}
                    onChange={v => set('end_time', v)}
                    dateOnly={form.is_all_day}
                    bookedSlots={allBusySlots}
                  />
                </FormField>
              </div>

              {/* Hospital */}
              <FormField icon={<Building2 className="h-3.5 w-3.5" />} label="Hospital">
                <Select value={form.hospital_id} onValueChange={v => set('hospital_id', v ?? 'all')}>
                  <SelectTrigger className="h-10 text-[13px]">
                    <SelectValue>
                      {form.hospital_id === 'all' || !form.hospital_id
                        ? 'All hospitals'
                        : (hospitals.find(h => h.id === form.hospital_id)?.name || form.hospital_id)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      <span className="flex items-center gap-2">
                        <Building2 className="h-3.5 w-3.5 text-gray-400" />All hospitals
                      </span>
                    </SelectItem>
                    {hospitals.map(h => (
                      <SelectItem key={h.id} value={h.id}>
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-blue-500" />
                          {h.name || h.id}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>

              {/* Location */}
              <FormField
                icon={<MapPin className="h-3.5 w-3.5" />}
                label="Room / Location"
                badge={checkStatus === 'error' && conflicts.some(c => c.type === 'room_conflict')
                  ? <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">Already booked</span>
                  : undefined}
              >
                <Input
                  value={form.location}
                  onChange={e => set('location', e.target.value)}
                  placeholder="Conference room, address, or virtual"
                  className={`h-10 text-[13px] ${
                    checkStatus === 'error' && conflicts.some(c => c.type === 'room_conflict')
                      ? 'border-red-300 bg-red-50 focus-visible:ring-red-400'
                      : ''
                  }`}
                />
              </FormField>

              {/* Meeting Link */}
              <FormField icon={<Link2 className="h-3.5 w-3.5" />} label="Meeting Link">
                <Input
                  value={form.meeting_link}
                  onChange={e => set('meeting_link', e.target.value)}
                  placeholder="https://teams.microsoft.com/…"
                  type="url"
                  className="h-10 text-[13px]"
                />
              </FormField>

              {/* Description */}
              <FormField icon={<FileText className="h-3.5 w-3.5" />} label="Description">
                <Textarea
                  value={form.description}
                  onChange={e => set('description', e.target.value)}
                  placeholder="Add notes, agenda, or additional details…"
                  rows={3}
                  className="text-[13px] resize-none leading-relaxed"
                />
              </FormField>

              {/* Error */}
              {formError && (
                <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                  <p className="text-[13px] text-red-700 font-medium">{formError}</p>
                </div>
              )}
            </div>

            {/* ── RIGHT: Scheduling Assistant ──────────────────────── */}
            <div className="w-[340px] shrink-0 overflow-y-auto px-5 py-5 space-y-4 bg-gray-50/50">

              {/* Section title */}
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center">
                  <Sparkles className="h-3.5 w-3.5 text-white" />
                </div>
                <div>
                  <p className="text-[13px] font-bold text-gray-800">Scheduling Assistant</p>
                  <p className="text-[10px] text-gray-400">Conflict detection & availability</p>
                </div>
              </div>

              {/* ── Attendees ──────────────────────────────────────── */}
              <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-gray-500" />
                  <span className="text-[12px] font-bold text-gray-700">Attendees</span>
                  {form.attendees.length > 0 && (
                    <span className="ml-auto text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                      {form.attendees.length} added
                    </span>
                  )}
                </div>

                {/* Attendee list rows */}
                {form.attendees.length > 0 && (
                  <div className="space-y-1 rounded-xl border border-gray-100 overflow-hidden">
                    {form.attendees.map((email, idx) => {
                      const hasConflict = conflicts.some(c => c.type === 'attendee_conflict' && c.affected.includes(email));
                      const onLeave     = conflicts.some(c => c.type === 'pto_conflict'      && c.affected.includes(email));
                      const username    = email.split('@')[0];
                      const domain      = email.split('@')[1];
                      const displayName = username.replace(/[._-]/g, ' ').split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                      const initials    = displayName.split(' ').length >= 2
                        ? (displayName.split(' ')[0][0] + displayName.split(' ').at(-1)![0]).toUpperCase()
                        : username.slice(0,2).toUpperCase();
                      return (
                        <div key={email}
                          className={`flex items-center gap-2.5 px-3 py-2.5 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'} ${hasConflict ? 'border-l-2 border-red-400' : onLeave ? 'border-l-2 border-amber-400' : ''}`}>
                          {/* Avatar */}
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0
                            ${hasConflict ? 'bg-red-500' : onLeave ? 'bg-amber-500' : 'bg-blue-500'}`}>
                            {initials}
                          </div>
                          {/* Name + email */}
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-semibold text-gray-800 truncate">{displayName}</p>
                            <p className="text-[10px] text-gray-400 truncate">{email}</p>
                          </div>
                          {/* Status icon */}
                          {hasConflict && <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                          {!hasConflict && onLeave && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                          {/* Remove */}
                          <button type="button" onClick={() => removeAttendee(email)}
                            className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center hover:bg-red-100 hover:text-red-600 text-gray-400 transition-colors">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* People-picker input */}
                <div className="relative">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        value={attendeeInput}
                        onChange={e => onAttendeeInputChange(e.target.value)}
                        onKeyDown={onAttendeeKeyDown}
                        onBlur={() => {
                          setTimeout(() => setShowSuggestions(false), 150);
                          if (attendeeInput.includes('@') && attendeeInput.includes('.')) addAttendee(attendeeInput);
                        }}
                        onFocus={() => staffSuggestions.length > 0 && setShowSuggestions(true)}
                        placeholder="Search staff or type email…"
                        className="h-9 text-[12px] pr-7"
                        autoComplete="off"
                      />
                      {staffSearching && (
                        <div className="absolute right-2.5 top-2.5">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
                        </div>
                      )}
                    </div>
                    {attendeeInput.trim() && (
                      <Button type="button" variant="outline" size="sm" className="h-9 px-2.5 shrink-0"
                        onClick={() => { addAttendee(attendeeInput); setShowSuggestions(false); }}>
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>

                  {/* Staff suggestions dropdown */}
                  {showSuggestions && staffSuggestions.length > 0 && (
                    <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                      {staffSuggestions.map(staff => {
                        const fullName = `${staff.first_name ?? ''} ${staff.last_name ?? ''}`.trim() || staff.email?.split('@')[0] || 'Staff';
                        const initials = fullName.split(' ').length >= 2
                          ? (fullName.split(' ')[0][0] + fullName.split(' ').at(-1)![0]).toUpperCase()
                          : fullName.slice(0, 2).toUpperCase();
                        return (
                          <button
                            key={staff.id}
                            type="button"
                            onMouseDown={e => { e.preventDefault(); selectStaff(staff); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-blue-50 transition-colors text-left border-b border-gray-50 last:border-0"
                          >
                            <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                              {initials}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] font-semibold text-gray-800 truncate">{fullName}</p>
                              <p className="text-[10px] text-gray-400 truncate">{staff.email}</p>
                            </div>
                            <Plus className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                          </button>
                        );
                      })}
                      <div className="px-3 py-1.5 bg-gray-50 border-t border-gray-100">
                        <p className="text-[10px] text-gray-400">↑↓ navigate · Enter to add · Esc to close</p>
                      </div>
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-gray-400">Search by name or type email · Enter/comma to add</p>
              </div>

              {/* ── Status card ────────────────────────────────────── */}
              {!form.is_all_day && checkStatus !== 'idle' && (
                <StatusCard status={checkStatus} errorCount={errorCount} warningCount={warningCount} />
              )}

              {/* ── Conflict cards ─────────────────────────────────── */}
              {!form.is_all_day && conflicts.length > 0 && (
                <div className="space-y-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-1">
                    Conflicts Detected
                  </p>
                  {conflicts.map((c, i) => (
                    <ConflictCard key={`${c.type}-${i}`} conflict={c} />
                  ))}
                </div>
              )}

              {/* ── Availability Grid ───────────────────────────────── */}
              {availability.length > 0 && !form.is_all_day && (
                <AvailabilityGrid
                  people={availability}
                  proposedStart={form.start_time ? new Date(form.start_time) : null}
                  proposedEnd={form.end_time ? new Date(form.end_time) : null}
                  onSelectHour={(hour) => {
                    const base = new Date(form.start_time);
                    const dur  = new Date(form.end_time).getTime() - new Date(form.start_time).getTime();
                    const p = (n: number) => String(n).padStart(2, '0');
                    const fmt = (d: Date) => `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
                    const ns = new Date(base); ns.setHours(hour, 0, 0, 0);
                    const ne = new Date(ns.getTime() + dur);
                    setForm(f => ({ ...f, start_time: fmt(ns), end_time: fmt(ne) }));
                  }}
                />
              )}

              {/* ── Alternative time slots ──────────────────────────── */}
              {alternatives.length > 0 && !form.is_all_day && (
                <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <RefreshCw className="h-3.5 w-3.5 text-blue-600" />
                    <span className="text-[12px] font-bold text-gray-700">Suggested Free Slots</span>
                  </div>
                  <div className="space-y-1.5">
                    {alternatives.map((slot, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => applyAlternative(slot)}
                        className={`
                          w-full flex items-center justify-between px-3 py-2.5 rounded-xl
                          text-[12px] font-semibold border transition-all hover:shadow-sm text-left
                          ${slot.hasWarnings
                            ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          }
                        `}
                      >
                        <div className="flex items-center gap-2">
                          {slot.hasWarnings
                            ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                            : <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          }
                          <span>{slot.dayLabel}</span>
                          <span className="font-normal opacity-70">·</span>
                          <span>{slot.timeLabel}</span>
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 opacity-50" />
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-2">Click any slot to apply — conflicts recheck automatically</p>
                </div>
              )}

              {/* Empty state */}
              {form.attendees.length === 0 && checkStatus === 'idle' && (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
                    <Users className="h-6 w-6 text-gray-300" />
                  </div>
                  <p className="text-[12px] font-semibold text-gray-400">Add attendees above</p>
                  <p className="text-[11px] text-gray-300 mt-0.5">Their availability will appear here</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Footer ───────────────────────────────────────────────── */}
          <div className="shrink-0 flex items-center justify-between px-7 py-4 border-t border-gray-100 bg-white gap-3">
            <div className="flex items-center gap-3">
              {/* Priority indicator */}
              <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg border ${priorityCfg.text} ring-1 ${priorityCfg.ring}`}
                style={{ backgroundColor: `${priorityCfg.dot.replace('bg-','').replace('-500','').replace('-400','').replace('-600','')}08` }}>
                <span className={`w-2 h-2 rounded-full ${priorityCfg.dot}`} />
                {priorityCfg.label} priority
              </span>

              {checkStatus === 'error' && (
                <span className="text-[11px] text-red-600 font-semibold flex items-center gap-1">
                  <XCircle className="h-3.5 w-3.5" />
                  {errorCount} blocking conflict{errorCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={isPending}
                className="text-[13px] h-10 px-5">
                Cancel
              </Button>

              {allowOverride && conflicts.some(c => c.severity === 'error') ? (
                <Button type="button" onClick={() => handleSubmit(true)} disabled={isPending}
                  className="text-[13px] h-10 px-5 gap-2 bg-red-600 hover:bg-red-700">
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
                  Override & Save
                </Button>
              ) : (
                <Button type="button" onClick={() => handleSubmit()} disabled={isPending}
                  className={`text-[13px] h-10 px-6 gap-2 font-semibold shadow-sm
                    ${!isAdmin && !editEvent ? 'bg-amber-500 hover:bg-amber-600' : ''}`}>
                  {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : !isAdmin && !editEvent ? (
                    <Clock className="h-4 w-4" />
                  ) : checkStatus === 'clear' ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <CalendarClock className="h-4 w-4" />
                  )}
                  {isPending
                    ? (isAdmin || editEvent ? 'Saving…' : 'Submitting…')
                    : editEvent ? 'Save Changes'
                    : isAdmin  ? 'Create Event'
                    : 'Submit for Approval'
                  }
                </Button>
              )}
            </div>
          </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Reusable form field wrapper ───────────────────────────────────────────────
function FormField({ icon, label, required, badge, children }: {
  icon: React.ReactNode;
  label: string;
  required?: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-gray-400">{icon}</span>
        <label className="text-[12px] font-semibold text-gray-600 uppercase tracking-wide">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        {badge && <span className="ml-auto">{badge}</span>}
      </div>
      {children}
    </div>
  );
}

// ── Status card ───────────────────────────────────────────────────────────────
function StatusCard({ status, errorCount, warningCount }: {
  status: CheckStatus; errorCount: number; warningCount: number;
}) {
  if (status === 'checking') return (
    <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm">
      <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center">
        <Loader2 className="h-4 w-4 text-gray-500 animate-spin" />
      </div>
      <div>
        <p className="text-[12px] font-semibold text-gray-700">Checking availability…</p>
        <p className="text-[10px] text-gray-400">Scanning all hospital schedules</p>
      </div>
    </div>
  );

  if (status === 'clear') return (
    <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3">
      <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
      </div>
      <div>
        <p className="text-[12px] font-bold text-emerald-700">All Clear</p>
        <p className="text-[10px] text-emerald-600">Everyone is available at this time</p>
      </div>
    </div>
  );

  if (status === 'error') return (
    <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
      <div className="w-8 h-8 rounded-xl bg-red-100 flex items-center justify-center">
        <XCircle className="h-4 w-4 text-red-600" />
      </div>
      <div>
        <p className="text-[12px] font-bold text-red-700">{errorCount} Scheduling Conflict{errorCount !== 1 ? 's' : ''}</p>
        <p className="text-[10px] text-red-500">Cannot book — people or rooms are unavailable</p>
      </div>
    </div>
  );

  if (status === 'warning') return (
    <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
      <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
      </div>
      <div>
        <p className="text-[12px] font-bold text-amber-700">{warningCount} Warning{warningCount !== 1 ? 's' : ''}</p>
        <p className="text-[10px] text-amber-600">Some attendees may be on leave</p>
      </div>
    </div>
  );

  return null;
}

// ── Premium conflict card ─────────────────────────────────────────────────────
function ConflictCard({ conflict: c }: { conflict: Conflict }) {
  const isError = c.severity === 'error';
  const label   = TYPE_CONFLICT_LABELS[c.type] ?? c.type;

  return (
    <div className={`rounded-2xl border overflow-hidden ${isError ? 'border-red-200' : 'border-amber-200'}`}>
      {/* Colored top stripe */}
      <div className={`h-1 w-full ${isError ? 'bg-red-500' : 'bg-amber-400'}`} />
      <div className={`px-3.5 py-3 ${isError ? 'bg-red-50' : 'bg-amber-50'}`}>
        {/* Type + icon */}
        <div className="flex items-center gap-2 mb-2">
          {isError
            ? <XCircle className="h-4 w-4 text-red-500 shrink-0" />
            : <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
          }
          <span className={`text-[10px] font-black uppercase tracking-widest ${isError ? 'text-red-500' : 'text-amber-500'}`}>
            {label}
          </span>
        </div>

        {/* Message */}
        <p className={`text-[13px] font-bold ${isError ? 'text-red-800' : 'text-amber-800'}`}>
          {c.message}
        </p>

        {/* Conflicting event */}
        <div className="flex items-center gap-2 mt-2 bg-white/70 rounded-xl px-3 py-2 border border-white/80">
          <div className={`w-1 self-stretch rounded-full ${isError ? 'bg-red-400' : 'bg-amber-400'}`} />
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-gray-800 truncate">
              "{c.conflicting_event.title}"
            </p>
            <p className="text-[11px] text-gray-500">{c.detail}</p>
          </div>
        </div>

        {/* Affected people */}
        {c.affected.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {c.affected.slice(0, 3).map(a => (
              <span key={a} className="inline-flex items-center gap-1 text-[10px] font-semibold bg-white border border-gray-200 rounded-full px-2 py-0.5 text-gray-600">
                <span className={`w-1.5 h-1.5 rounded-full ${isError ? 'bg-red-400' : 'bg-amber-400'}`} />
                {a.includes('@') ? a.split('@')[0] : a}
              </span>
            ))}
            {c.affected.length > 3 && (
              <span className="text-[10px] text-gray-400 self-center">+{c.affected.length - 3} more</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
