'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  X, Calendar, Plane, ShoppingCart, GraduationCap, FileText, Wrench,
  ChevronLeft, ChevronRight, Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  createMeetingRequest,
  createLeaveRequest,
  createPurchaseRequest,
  createTrainingRequest,
  createDocumentRequest,
  createEquipmentRequest,
} from '@/lib/actions/requests';
import type { RequestType } from '@/lib/actions/requests';

// ─── Request type tab config ───────────────────────────────────────────────

const REQUEST_TYPES = [
  { id: 'meeting',               label: 'Meeting',      icon: Calendar,       color: 'blue' },
  { id: 'leave',                 label: 'Leave',        icon: Plane,          color: 'green' },
  { id: 'purchase',              label: 'Purchase',     icon: ShoppingCart,   color: 'purple' },
  { id: 'training',              label: 'Training',     icon: GraduationCap,  color: 'amber' },
  { id: 'document_verification', label: 'Document',     icon: FileText,       color: 'rose' },
  { id: 'equipment',             label: 'Equipment',    icon: Wrench,         color: 'cyan' },
] as const;

// ─── Shared input styling ──────────────────────────────────────────────────

const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-300 transition-all placeholder:text-gray-400';
const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5';
const fieldCls = 'space-y-1';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_LABELS = ['Su','Mo','Tu','We','Th','Fr','Sa'];
const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

function pad(n: number) { return String(n).padStart(2, '0'); }

function toLocalISOString(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDateTimeDisplay(isoStr: string) {
  if (!isoStr) return null;
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return null;
  return {
    date: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
    time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
  };
}

function formatDateDisplay(dateStr: string) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Custom DateTimePicker ─────────────────────────────────────────────────

function DateTimePicker({
  value, onChange, placeholder = 'Select date & time', accent = 'blue',
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  accent?: string;
}) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => value ? new Date(value).getFullYear() : new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => value ? new Date(value).getMonth() : new Date().getMonth());
  const [selDate, setSelDate] = useState<Date | null>(() => value ? new Date(value) : null);
  const [hour, setHour]   = useState(() => { if (!value) return 9; const h = new Date(value).getHours(); return h === 0 ? 12 : h > 12 ? h - 12 : h; });
  const [min, setMin]     = useState(() => value ? new Date(value).getMinutes() : 0);
  const [ampm, setAmpm]   = useState<'AM'|'PM'>(() => value ? (new Date(value).getHours() >= 12 ? 'PM' : 'AM') : 'AM');
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const emit = (date: Date | null, h: number, m: number, ap: 'AM'|'PM') => {
    if (!date) return;
    let h24 = h;
    if (ap === 'AM' && h === 12) h24 = 0;
    else if (ap === 'PM' && h !== 12) h24 = h + 12;
    const out = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h24, m);
    onChange(toLocalISOString(out));
  };

  const pickDay = (day: number) => {
    const d = new Date(viewYear, viewMonth, day);
    setSelDate(d);
    emit(d, hour, min, ampm);
  };
  const pickHour = (h: number) => { setHour(h); emit(selDate, h, min, ampm); };
  const pickMin  = (m: number) => { setMin(m);  emit(selDate, hour, m, ampm); };
  const pickAmpm = (ap: 'AM'|'PM') => { setAmpm(ap); emit(selDate, hour, min, ap); };

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDay    = new Date(viewYear, viewMonth, 1).getDay();
  const today       = new Date();
  const display     = formatDateTimeDisplay(value);

  const hourScrollRef  = useRef<HTMLDivElement>(null);
  const minuteScrollRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={wrapRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-sm text-left transition-all group',
          display
            ? 'border-blue-200 bg-linear-to-r from-blue-50 to-indigo-50 text-blue-900'
            : 'border-gray-200 bg-white text-gray-400 hover:border-blue-200 hover:bg-blue-50/30',
          open && 'ring-2 ring-blue-500/20 border-blue-300',
        )}
      >
        <Calendar className={cn('h-4 w-4 shrink-0', display ? 'text-blue-500' : 'text-gray-300 group-hover:text-blue-400')} />
        {display ? (
          <span className="flex-1 flex items-center gap-2">
            <span className="font-semibold text-blue-900">{display.date}</span>
            <span className="h-1 w-1 rounded-full bg-blue-300" />
            <span className="flex items-center gap-1 text-blue-600 font-medium">
              <Clock className="h-3 w-3" />{display.time}
            </span>
          </span>
        ) : (
          <span className="flex-1 text-gray-400">{placeholder}</span>
        )}
        <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 transition-transform', open ? 'rotate-90 text-blue-400' : 'text-gray-300')} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 top-full left-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden w-75"
          style={{ boxShadow: '0 20px 60px -10px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.04)' }}>

          {/* Calendar section */}
          <div className="p-4">
            {/* Month nav */}
            <div className="flex items-center justify-between mb-3">
              <button type="button"
                onClick={() => { const d = new Date(viewYear, viewMonth - 1); setViewYear(d.getFullYear()); setViewMonth(d.getMonth()); }}
                className="h-7 w-7 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors">
                <ChevronLeft className="h-4 w-4 text-gray-400" />
              </button>
              <span className="text-[13px] font-bold text-gray-900">{MONTHS[viewMonth]} {viewYear}</span>
              <button type="button"
                onClick={() => { const d = new Date(viewYear, viewMonth + 1); setViewYear(d.getFullYear()); setViewMonth(d.getMonth()); }}
                className="h-7 w-7 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors">
                <ChevronRight className="h-4 w-4 text-gray-400" />
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {DAY_LABELS.map(d => (
                <div key={d} className="h-7 flex items-center justify-center text-[10px] font-bold text-gray-400">{d}</div>
              ))}
            </div>

            {/* Days grid */}
            <div className="grid grid-cols-7 gap-y-0.5">
              {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const isSel = selDate && selDate.getDate() === day && selDate.getMonth() === viewMonth && selDate.getFullYear() === viewYear;
                const isToday = today.getDate() === day && today.getMonth() === viewMonth && today.getFullYear() === viewYear;
                return (
                  <button key={day} type="button" onClick={() => pickDay(day)}
                    className={cn(
                      'h-8 w-full rounded-lg text-[12px] font-medium transition-all',
                      isSel ? 'bg-blue-600 text-white shadow-sm shadow-blue-200 scale-105' :
                      isToday ? 'bg-blue-50 text-blue-600 font-bold' :
                      'text-gray-700 hover:bg-gray-100',
                    )}>
                    {day}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-linear-to-r from-transparent via-gray-200 to-transparent mx-4" />

          {/* Time section */}
          <div className="p-4 space-y-3 bg-gray-50/50">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-blue-400" />
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Time</span>
              {selDate && (
                <span className="ml-auto text-[12px] font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
                  {pad(hour === 12 && ampm === 'AM' ? 0 : ampm === 'PM' && hour !== 12 ? hour + 12 : hour)}:{pad(min)} {ampm}
                </span>
              )}
            </div>

            {/* Hours */}
            <div>
              <p className="text-[10px] font-semibold text-gray-400 mb-1.5">Hour</p>
              <div ref={hourScrollRef} className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
                {HOURS.map(h => (
                  <button key={h} type="button" onClick={() => pickHour(h)}
                    className={cn(
                      'h-7 min-w-9 rounded-lg text-[12px] font-semibold shrink-0 transition-all',
                      hour === h ? 'bg-blue-600 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600',
                    )}>
                    {h}
                  </button>
                ))}
              </div>
            </div>

            {/* Minutes */}
            <div>
              <p className="text-[10px] font-semibold text-gray-400 mb-1.5">Minute</p>
              <div ref={minuteScrollRef} className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
                {MINUTES.map(m => (
                  <button key={m} type="button" onClick={() => pickMin(m)}
                    className={cn(
                      'h-7 min-w-9 rounded-lg text-[12px] font-semibold shrink-0 transition-all',
                      min === m ? 'bg-blue-600 text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600',
                    )}>
                    {pad(m)}
                  </button>
                ))}
              </div>
            </div>

            {/* AM / PM */}
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-semibold text-gray-400 w-10">AM/PM</p>
              <div className="flex bg-white border border-gray-200 rounded-lg p-0.5 gap-0.5">
                {(['AM', 'PM'] as const).map(ap => (
                  <button key={ap} type="button" onClick={() => pickAmpm(ap)}
                    className={cn(
                      'h-7 px-4 rounded-md text-[12px] font-bold transition-all',
                      ampm === ap ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-blue-600',
                    )}>
                    {ap}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Done */}
          <div className="px-4 py-3 border-t border-gray-100 flex justify-end">
            <button type="button" onClick={() => setOpen(false)}
              className="h-8 px-5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-bold transition-colors">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Custom DatePicker (date only) ─────────────────────────────────────────

function DatePicker({
  value, onChange, placeholder = 'Select date',
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => value ? new Date(value + 'T00:00:00').getFullYear() : new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => value ? new Date(value + 'T00:00:00').getMonth() : new Date().getMonth());
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selDate  = value ? new Date(value + 'T00:00:00') : null;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDay    = new Date(viewYear, viewMonth, 1).getDay();
  const today       = new Date();
  const display     = formatDateDisplay(value);

  const pickDay = (day: number) => {
    const d = new Date(viewYear, viewMonth, day);
    onChange(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-sm text-left transition-all group',
          display
            ? 'border-blue-200 bg-linear-to-r from-blue-50 to-indigo-50'
            : 'border-gray-200 bg-white hover:border-blue-200 hover:bg-blue-50/30',
          open && 'ring-2 ring-blue-500/20 border-blue-300',
        )}
      >
        <Calendar className={cn('h-4 w-4 shrink-0', display ? 'text-blue-500' : 'text-gray-300 group-hover:text-blue-400')} />
        <span className={display ? 'font-semibold text-blue-900 flex-1' : 'flex-1 text-gray-400'}>
          {display ?? placeholder}
        </span>
        <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 transition-transform', open ? 'rotate-90 text-blue-400' : 'text-gray-300')} />
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 w-65"
          style={{ boxShadow: '0 20px 60px -10px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.04)' }}>
          <div className="flex items-center justify-between mb-3">
            <button type="button"
              onClick={() => { const d = new Date(viewYear, viewMonth - 1); setViewYear(d.getFullYear()); setViewMonth(d.getMonth()); }}
              className="h-7 w-7 rounded-lg hover:bg-gray-100 flex items-center justify-center">
              <ChevronLeft className="h-4 w-4 text-gray-400" />
            </button>
            <span className="text-[13px] font-bold text-gray-900">{MONTHS[viewMonth]} {viewYear}</span>
            <button type="button"
              onClick={() => { const d = new Date(viewYear, viewMonth + 1); setViewYear(d.getFullYear()); setViewMonth(d.getMonth()); }}
              className="h-7 w-7 rounded-lg hover:bg-gray-100 flex items-center justify-center">
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </button>
          </div>
          <div className="grid grid-cols-7 mb-1">
            {DAY_LABELS.map(d => <div key={d} className="h-7 flex items-center justify-center text-[10px] font-bold text-gray-400">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5">
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const isSel = selDate && selDate.getDate() === day && selDate.getMonth() === viewMonth && selDate.getFullYear() === viewYear;
              const isToday = today.getDate() === day && today.getMonth() === viewMonth && today.getFullYear() === viewYear;
              return (
                <button key={day} type="button" onClick={() => pickDay(day)}
                  className={cn(
                    'h-8 w-full rounded-lg text-[12px] font-medium transition-all',
                    isSel ? 'bg-blue-600 text-white shadow-sm scale-105' :
                    isToday ? 'bg-blue-50 text-blue-600 font-bold' :
                    'text-gray-700 hover:bg-gray-100',
                  )}>
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Field wrapper ─────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={fieldCls}>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

// ─── Form components ───────────────────────────────────────────────────────

function MeetingForm({ onSubmit, loading }: { onSubmit: (d: Record<string, unknown>) => void; loading: boolean }) {
  const [form, setForm] = useState({
    title: '', description: '', meeting_type: 'other',
    start_time: '', end_time: '', location: '', priority: 'medium',
  });
  const s = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));
  const sv = (k: string) => (val: string) => setForm(f => ({ ...f, [k]: val }));

  return (
    <div className="space-y-4">
      <Field label="Meeting Title *">
        <input className={inputCls} value={form.title} onChange={s('title')} placeholder="e.g. Team Standup" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Type">
          <select className={inputCls} value={form.meeting_type} onChange={s('meeting_type')}>
            <option value="orientation">Orientation</option>
            <option value="one_on_one">One-on-One</option>
            <option value="team_intro">Team Intro</option>
            <option value="training">Training</option>
            <option value="review">Review</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Priority">
          <select className={inputCls} value={form.priority} onChange={s('priority')}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Start *">
          <DateTimePicker value={form.start_time} onChange={sv('start_time')} placeholder="Pick start…" />
        </Field>
        <Field label="End *">
          <DateTimePicker value={form.end_time} onChange={sv('end_time')} placeholder="Pick end…" />
        </Field>
      </div>
      <Field label="Location">
        <input className={inputCls} value={form.location} onChange={s('location')} placeholder="Room / meeting link" />
      </Field>
      <Field label="Description">
        <textarea className={inputCls} rows={3} value={form.description} onChange={s('description')} placeholder="Agenda or notes…" />
      </Field>
      <Button
        className="w-full"
        disabled={loading || !form.title || !form.start_time || !form.end_time}
        onClick={() => onSubmit(form)}
      >
        {loading ? 'Submitting…' : 'Submit Meeting Request'}
      </Button>
    </div>
  );
}

function LeaveForm({ onSubmit, loading }: { onSubmit: (d: Record<string, unknown>) => void; loading: boolean }) {
  const [form, setForm] = useState({
    leave_type: 'vacation', start_date: '', end_date: '', reason: '', coverage_plan: '', priority: 'medium',
  });
  const s = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));
  const sv = (k: string) => (val: string) => setForm(f => ({ ...f, [k]: val }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Leave Type *">
          <select className={inputCls} value={form.leave_type} onChange={s('leave_type')}>
            <option value="vacation">Vacation</option>
            <option value="sick">Sick Leave</option>
            <option value="personal">Personal</option>
            <option value="bereavement">Bereavement</option>
            <option value="parental">Parental</option>
            <option value="unpaid">Unpaid</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Priority">
          <select className={inputCls} value={form.priority} onChange={s('priority')}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="From *">
          <DatePicker value={form.start_date} onChange={sv('start_date')} placeholder="Start date" />
        </Field>
        <Field label="To *">
          <DatePicker value={form.end_date} onChange={sv('end_date')} placeholder="End date" />
        </Field>
      </div>
      <Field label="Reason">
        <textarea className={inputCls} rows={3} value={form.reason} onChange={s('reason')} placeholder="Reason for leave…" />
      </Field>
      <Field label="Coverage Plan">
        <textarea className={inputCls} rows={2} value={form.coverage_plan} onChange={s('coverage_plan')} placeholder="Who will cover your responsibilities?" />
      </Field>
      <Button
        className="w-full"
        disabled={loading || !form.start_date || !form.end_date}
        onClick={() => onSubmit(form)}
      >
        {loading ? 'Submitting…' : 'Submit Leave Request'}
      </Button>
    </div>
  );
}

function PurchaseForm({ onSubmit, loading }: { onSubmit: (d: Record<string, unknown>) => void; loading: boolean }) {
  const [form, setForm] = useState({
    item_description: '', quantity: '1', unit_price: '', vendor_name: '',
    business_justification: '', department: '', priority: 'medium',
  });
  const s = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));
  const total = (Number(form.quantity) || 0) * (Number(form.unit_price) || 0);

  return (
    <div className="space-y-4">
      <Field label="Item Description *">
        <input className={inputCls} value={form.item_description} onChange={s('item_description')} placeholder="What needs to be purchased?" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Quantity *">
          <input type="number" min="1" className={inputCls} value={form.quantity} onChange={s('quantity')} />
        </Field>
        <Field label="Unit Price ($) *">
          <input type="number" min="0" step="0.01" className={inputCls} value={form.unit_price} onChange={s('unit_price')} placeholder="0.00" />
        </Field>
      </div>
      {total > 0 && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5 text-sm flex items-center justify-between">
          <span className="text-gray-500">Total</span>
          <span className="font-bold text-blue-700">${total.toFixed(2)}</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Vendor">
          <input className={inputCls} value={form.vendor_name} onChange={s('vendor_name')} placeholder="Vendor name" />
        </Field>
        <Field label="Department">
          <input className={inputCls} value={form.department} onChange={s('department')} placeholder="e.g. Surgery" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Priority">
          <select className={inputCls} value={form.priority} onChange={s('priority')}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </Field>
      </div>
      <Field label="Business Justification *">
        <textarea className={inputCls} rows={3} value={form.business_justification} onChange={s('business_justification')} placeholder="Why is this purchase necessary?" />
      </Field>
      <Button
        className="w-full"
        disabled={loading || !form.item_description || !form.unit_price || !form.business_justification}
        onClick={() => onSubmit({ ...form, quantity: Number(form.quantity), unit_price: Number(form.unit_price) })}
      >
        {loading ? 'Submitting…' : 'Submit Purchase Request'}
      </Button>
    </div>
  );
}

function TrainingForm({ onSubmit, loading }: { onSubmit: (d: Record<string, unknown>) => void; loading: boolean }) {
  const [form, setForm] = useState({
    training_title: '', training_type: 'workshop', provider_name: '', provider_url: '',
    start_date: '', end_date: '', duration_hours: '', delivery_method: 'in_person',
    cost: '', learning_objectives: '', expected_outcome: '', priority: 'medium',
  });
  const s = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));
  const sv = (k: string) => (val: string) => setForm(f => ({ ...f, [k]: val }));

  return (
    <div className="space-y-4">
      <Field label="Training Title *">
        <input className={inputCls} value={form.training_title} onChange={s('training_title')} placeholder="e.g. Advanced Anesthesia Techniques" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Type">
          <select className={inputCls} value={form.training_type} onChange={s('training_type')}>
            <option value="certification">Certification</option>
            <option value="workshop">Workshop</option>
            <option value="conference">Conference</option>
            <option value="online_course">Online Course</option>
            <option value="mentoring">Mentoring</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Delivery Method">
          <select className={inputCls} value={form.delivery_method} onChange={s('delivery_method')}>
            <option value="in_person">In Person</option>
            <option value="online">Online</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Provider Name">
          <input className={inputCls} value={form.provider_name} onChange={s('provider_name')} placeholder="e.g. AVMA" />
        </Field>
        <Field label="Cost ($)">
          <input type="number" min="0" step="0.01" className={inputCls} value={form.cost} onChange={s('cost')} placeholder="0.00" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Start Date *">
          <DatePicker value={form.start_date} onChange={sv('start_date')} placeholder="Start date" />
        </Field>
        <Field label="End Date *">
          <DatePicker value={form.end_date} onChange={sv('end_date')} placeholder="End date" />
        </Field>
      </div>
      <Field label="Learning Objectives *">
        <textarea className={inputCls} rows={3} value={form.learning_objectives} onChange={s('learning_objectives')} placeholder="What will you learn?" />
      </Field>
      <Button
        className="w-full"
        disabled={loading || !form.training_title || !form.start_date || !form.end_date || !form.learning_objectives}
        onClick={() => onSubmit({
          ...form,
          duration_hours: form.duration_hours ? Number(form.duration_hours) : undefined,
          cost: form.cost ? Number(form.cost) : undefined,
        })}
      >
        {loading ? 'Submitting…' : 'Submit Training Request'}
      </Button>
    </div>
  );
}

function DocumentForm({ onSubmit, loading }: { onSubmit: (d: Record<string, unknown>) => void; loading: boolean }) {
  const [form, setForm] = useState({
    document_type: 'license', document_name: '', document_url: '',
    issued_by: '', expiration_date: '', priority: 'medium',
  });
  const s = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));
  const sv = (k: string) => (val: string) => setForm(f => ({ ...f, [k]: val }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Document Type *">
          <select className={inputCls} value={form.document_type} onChange={s('document_type')}>
            <option value="license">License</option>
            <option value="certification">Certification</option>
            <option value="diploma">Diploma</option>
            <option value="identity">Identity Document</option>
            <option value="background_check">Background Check</option>
            <option value="reference">Reference Letter</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Priority">
          <select className={inputCls} value={form.priority} onChange={s('priority')}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </Field>
      </div>
      <Field label="Document Name *">
        <input className={inputCls} value={form.document_name} onChange={s('document_name')} placeholder="e.g. Veterinary License CA-2024" />
      </Field>
      <Field label="Document URL *">
        <input type="url" className={inputCls} value={form.document_url} onChange={s('document_url')} placeholder="https://…" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Issued By">
          <input className={inputCls} value={form.issued_by} onChange={s('issued_by')} placeholder="e.g. California Vet Board" />
        </Field>
        <Field label="Expiry Date">
          <DatePicker value={form.expiration_date} onChange={sv('expiration_date')} placeholder="Expiry date" />
        </Field>
      </div>
      <Button
        className="w-full"
        disabled={loading || !form.document_name || !form.document_url}
        onClick={() => onSubmit(form)}
      >
        {loading ? 'Submitting…' : 'Submit Document Request'}
      </Button>
    </div>
  );
}

function EquipmentForm({ onSubmit, loading }: { onSubmit: (d: Record<string, unknown>) => void; loading: boolean }) {
  const [form, setForm] = useState({
    equipment_name: '', equipment_type: 'other', specifications: '', quantity: '1',
    estimated_cost: '', business_justification: '', intended_use: '', department: '', priority: 'medium',
  });
  const s = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <Field label="Equipment Name *">
        <input className={inputCls} value={form.equipment_name} onChange={s('equipment_name')} placeholder="e.g. Digital X-Ray Machine" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Type *">
          <select className={inputCls} value={form.equipment_type} onChange={s('equipment_type')}>
            <option value="computer">Computer / IT</option>
            <option value="phone">Phone</option>
            <option value="software">Software</option>
            <option value="furniture">Furniture</option>
            <option value="medical_equipment">Medical Equipment</option>
            <option value="vehicle">Vehicle</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Priority">
          <select className={inputCls} value={form.priority} onChange={s('priority')}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Quantity">
          <input type="number" min="1" className={inputCls} value={form.quantity} onChange={s('quantity')} />
        </Field>
        <Field label="Estimated Cost ($)">
          <input type="number" min="0" step="0.01" className={inputCls} value={form.estimated_cost} onChange={s('estimated_cost')} placeholder="0.00" />
        </Field>
      </div>
      <Field label="Specifications">
        <textarea className={inputCls} rows={2} value={form.specifications} onChange={s('specifications')} placeholder="Technical specs or model number…" />
      </Field>
      <Field label="Business Justification *">
        <textarea className={inputCls} rows={3} value={form.business_justification} onChange={s('business_justification')} placeholder="Why is this equipment needed?" />
      </Field>
      <Button
        className="w-full"
        disabled={loading || !form.equipment_name || !form.business_justification}
        onClick={() => onSubmit({
          ...form,
          quantity: Number(form.quantity),
          estimated_cost: form.estimated_cost ? Number(form.estimated_cost) : undefined,
        })}
      >
        {loading ? 'Submitting…' : 'Submit Equipment Request'}
      </Button>
    </div>
  );
}

// ─── Main Dialog ───────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function NewRequestDialog({ open, onClose }: Props) {
  const router = useRouter();
  const [activeType, setActiveType] = useState<RequestType>('meeting');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit(data: Record<string, unknown>) {
    setLoading(true);
    setError(null);

    try {
      let result;
      switch (activeType) {
        case 'meeting':
          result = await createMeetingRequest(data as Parameters<typeof createMeetingRequest>[0]);
          break;
        case 'leave':
          result = await createLeaveRequest(data as Parameters<typeof createLeaveRequest>[0]);
          break;
        case 'purchase':
          result = await createPurchaseRequest(data as Parameters<typeof createPurchaseRequest>[0]);
          break;
        case 'training':
          result = await createTrainingRequest(data as Parameters<typeof createTrainingRequest>[0]);
          break;
        case 'document_verification':
          result = await createDocumentRequest(data as Parameters<typeof createDocumentRequest>[0]);
          break;
        case 'equipment':
          result = await createEquipmentRequest(data as Parameters<typeof createEquipmentRequest>[0]);
          break;
        default:
          result = { success: false as const, error: 'Unknown type' };
      }

      if (result.success) {
        router.refresh();
        onClose();
      } else {
        setError(result.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission failed');
    } finally {
      setLoading(false);
    }
  }

  const formProps = { onSubmit: handleSubmit, loading };

  const activeConfig = REQUEST_TYPES.find(r => r.id === activeType);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col mx-4"
        style={{ boxShadow: '0 25px 80px -10px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.05)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm shadow-blue-200">
              {activeConfig && <activeConfig.icon className="h-4.5 w-4.5 text-white" style={{ height: 18, width: 18 }} />}
            </div>
            <div>
              <h2 className="text-[16px] font-bold text-gray-900">New Request</h2>
              <p className="text-[11px] text-gray-400">Fill in the details below</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-xl hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-4.5 w-4.5" style={{ height: 18, width: 18 }} />
          </button>
        </div>

        {/* Type selector */}
        <div className="flex gap-1.5 px-6 pt-4 pb-3 overflow-x-auto shrink-0 border-b border-gray-100">
          {REQUEST_TYPES.map(rt => {
            const Icon = rt.icon;
            const isActive = activeType === rt.id;
            return (
              <button
                key={rt.id}
                onClick={() => { setActiveType(rt.id as RequestType); setError(null); }}
                className={cn(
                  'flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-semibold whitespace-nowrap transition-all',
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-200'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700',
                )}
              >
                <Icon className="shrink-0" style={{ height: 13, width: 13 }} />
                {rt.label}
              </button>
            );
          })}
        </div>

        {/* Form area */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-100 text-red-600 rounded-xl px-4 py-3 text-[13px] flex items-center gap-2">
              <span className="h-4 w-4 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] font-bold shrink-0">!</span>
              {error}
            </div>
          )}

          {activeType === 'meeting'               && <MeetingForm   {...formProps} />}
          {activeType === 'leave'                 && <LeaveForm     {...formProps} />}
          {activeType === 'purchase'              && <PurchaseForm  {...formProps} />}
          {activeType === 'training'              && <TrainingForm  {...formProps} />}
          {activeType === 'document_verification' && <DocumentForm  {...formProps} />}
          {activeType === 'equipment'             && <EquipmentForm {...formProps} />}
        </div>
      </div>
    </div>
  );
}
