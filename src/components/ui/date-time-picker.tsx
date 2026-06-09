'use client';

import { useState, useRef, useEffect } from 'react';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addMonths, subMonths, addDays, isSameMonth, isSameDay, isToday,
  getHours, getMinutes, setHours, setMinutes, parseISO,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Clock, Calendar, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  value: string;              // "YYYY-MM-DDTHH:mm" local datetime string
  onChange: (val: string) => void;
  label?: string;
  required?: boolean;
  dateOnly?: boolean;         // date-only mode (all-day)
  minDate?: Date;
  className?: string;
  bookedSlots?: { start: string; end: string }[];  // UTC ISO strings of existing events
}

function pad(n: number) { return String(n).padStart(2, '0'); }

function parseDT(val: string): Date {
  if (!val) return new Date();
  // "YYYY-MM-DDTHH:mm" local format
  const [datePart, timePart] = val.split('T');
  const [y, mo, d] = datePart.split('-').map(Number);
  const [h, m] = (timePart ?? '00:00').split(':').map(Number);
  return new Date(y, mo - 1, d, h ?? 0, m ?? 0, 0, 0);
}

function formatDT(d: Date, dateOnly = false): string {
  if (dateOnly) return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function displayDate(d: Date) {
  return format(d, 'EEE, MMM d, yyyy');
}

function displayTime(d: Date) {
  return format(d, 'h:mm aa');
}

const DAY_HEADERS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export function DateTimePicker({ value, onChange, label, required, dateOnly = false, className, bookedSlots = [] }: Props) {
  const [open, setOpen]           = useState(false);
  const [tab, setTab]             = useState<'date' | 'time'>('date');
  const [viewDate, setViewDate]   = useState<Date>(() => parseDT(value));
  const ref = useRef<HTMLDivElement>(null);

  const selected = parseDT(value);

  // Close on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // Sync viewDate when value changes externally
  useEffect(() => {
    if (value) setViewDate(parseDT(value));
  }, [value]);

  function selectDay(day: Date) {
    const next = new Date(day);
    next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    onChange(formatDT(next, dateOnly));
    if (dateOnly) setOpen(false);
    else setTab('time');
  }

  function setHour(h: number) {
    const next = new Date(selected);
    next.setHours(h, next.getMinutes(), 0, 0);
    onChange(formatDT(next, dateOnly));
  }

  function setMinute(m: number) {
    const next = new Date(selected);
    next.setMinutes(m, 0, 0);
    onChange(formatDT(next, dateOnly));
  }

  function toggleAmPm() {
    const h = selected.getHours();
    setHour(h < 12 ? h + 12 : h - 12);
  }

  // Build calendar grid
  const monthStart = startOfMonth(viewDate);
  const monthEnd   = endOfMonth(viewDate);
  const gridStart  = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd    = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days: Date[] = [];
  let cur = gridStart;
  while (cur <= gridEnd) { days.push(cur); cur = addDays(cur, 1); }

  const hour12 = selected.getHours() % 12 || 12;
  const minute = selected.getMinutes();
  const ampm   = selected.getHours() < 12 ? 'AM' : 'PM';

  // Minute presets
  const MINUTE_PRESETS = [0, 15, 30, 45];

  return (
    <div ref={ref} className={cn('relative', className)}>
      {/* ── Trigger button ────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={cn(
          'w-full flex items-center gap-2.5 px-3 py-2 h-10 rounded-xl border text-left transition-all',
          'bg-white hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
          open
            ? 'border-blue-500 ring-2 ring-blue-100 shadow-sm'
            : 'border-gray-200 hover:border-gray-300 shadow-sm',
        )}
      >
        <div className={cn(
          'flex items-center justify-center w-7 h-7 rounded-lg shrink-0',
          open ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'
        )}>
          {tab === 'time' && !dateOnly
            ? <Clock className="h-3.5 w-3.5" />
            : <Calendar className="h-3.5 w-3.5" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-gray-900 leading-tight truncate">
            {displayDate(selected)}
          </div>
          {!dateOnly && (
            <div className="text-[11px] text-gray-500 leading-tight">{displayTime(selected)}</div>
          )}
        </div>
        <ChevronDown className={cn(
          'h-3.5 w-3.5 text-gray-400 shrink-0 transition-transform duration-200',
          open && 'rotate-180'
        )} />
      </button>

      {/* ── Dropdown panel ────────────────────────────────── */}
      {open && (
        <div className="absolute z-50 mt-2 left-0 bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden min-w-70"
          style={{ width: dateOnly ? 280 : 310 }}
        >
          {/* Tab switcher (only when not date-only) */}
          {!dateOnly && (
            <div className="flex border-b border-gray-100">
              <button
                type="button"
                onClick={() => setTab('date')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[12px] font-semibold transition-colors',
                  tab === 'date'
                    ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                )}
              >
                <Calendar className="h-3.5 w-3.5" />
                Date
              </button>
              <button
                type="button"
                onClick={() => setTab('time')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[12px] font-semibold transition-colors',
                  tab === 'time'
                    ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                )}
              >
                <Clock className="h-3.5 w-3.5" />
                Time
              </button>
            </div>
          )}

          {/* ── Calendar ──────────────────────────────────── */}
          {(tab === 'date' || dateOnly) && (
            <div className="p-3">
              {/* Month navigation */}
              <div className="flex items-center justify-between mb-3 px-1">
                <button
                  type="button"
                  onClick={() => setViewDate(d => subMonths(d, 1))}
                  className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-[13px] font-bold text-gray-800">
                  {format(viewDate, 'MMMM yyyy')}
                </span>
                <button
                  type="button"
                  onClick={() => setViewDate(d => addMonths(d, 1))}
                  className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 mb-1">
                {DAY_HEADERS.map(d => (
                  <div key={d} className="h-7 flex items-center justify-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    {d}
                  </div>
                ))}
              </div>

              {/* Day grid */}
              <div className="grid grid-cols-7 gap-y-0.5">
                {days.map((day, i) => {
                  const inMonth  = isSameMonth(day, viewDate);
                  const isSelected = isSameDay(day, selected);
                  const isTodayDay = isToday(day);
                  const isWeekend = day.getDay() === 0 || day.getDay() === 6;

                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => selectDay(day)}
                      className={cn(
                        'h-8 w-full flex items-center justify-center text-[12px] font-medium rounded-lg transition-all',
                        !inMonth && 'text-gray-300',
                        inMonth && !isSelected && !isTodayDay && !isWeekend && 'text-gray-700 hover:bg-blue-50 hover:text-blue-700',
                        inMonth && !isSelected && !isTodayDay && isWeekend && 'text-gray-400 hover:bg-blue-50 hover:text-blue-600',
                        isTodayDay && !isSelected && 'text-blue-600 font-bold ring-2 ring-blue-200 rounded-lg',
                        isSelected && 'bg-blue-600 text-white font-bold shadow-md hover:bg-blue-700',
                      )}
                    >
                      {format(day, 'd')}
                    </button>
                  );
                })}
              </div>

              {/* Quick actions */}
              <div className="flex justify-between mt-3 pt-2.5 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    const today = new Date();
                    const next = new Date(today);
                    next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
                    onChange(formatDT(next, dateOnly));
                    setViewDate(today);
                  }}
                  className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 transition-colors"
                >
                  Today
                </button>
                {!dateOnly && (
                  <button
                    type="button"
                    onClick={() => setTab('time')}
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1"
                  >
                    Set time <ChevronRight className="h-3 w-3" />
                  </button>
                )}
                {dateOnly && (
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="text-[11px] font-semibold text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    Done
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Time Picker ───────────────────────────────── */}
          {tab === 'time' && !dateOnly && (
            <div className="p-4">
              {/* Current date summary */}
              <div className="flex items-center gap-2 mb-4 px-1">
                <div className="w-2 h-2 rounded-full bg-blue-600" />
                <span className="text-[12px] font-semibold text-gray-700">
                  {format(selected, 'EEEE, MMMM d')}
                </span>
              </div>

              {/* Large time display */}
              <div className="flex items-center justify-center gap-3 mb-5">
                {/* Hour */}
                <div className="flex flex-col items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setHour((selected.getHours() + 1) % 24)}
                    className="w-10 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <div className="w-14 h-14 bg-gray-900 rounded-2xl flex items-center justify-center shadow-inner">
                    <span className="text-2xl font-bold text-white tabular-nums tracking-tight">
                      {pad(hour12)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setHour((selected.getHours() + 23) % 24)}
                    className="w-10 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>

                <span className="text-2xl font-bold text-gray-300 mb-0.5">:</span>

                {/* Minute */}
                <div className="flex flex-col items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setMinute((minute + 5) % 60)}
                    className="w-10 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <div className="w-14 h-14 bg-gray-900 rounded-2xl flex items-center justify-center shadow-inner">
                    <span className="text-2xl font-bold text-white tabular-nums tracking-tight">
                      {pad(minute)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMinute((minute + 55) % 60)}
                    className="w-10 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>

                {/* AM/PM */}
                <div className="flex flex-col gap-1.5 ml-1">
                  <button
                    type="button"
                    onClick={() => ampm === 'PM' && toggleAmPm()}
                    className={cn(
                      'w-12 h-6.5 rounded-lg text-[12px] font-bold transition-all border',
                      ampm === 'AM'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                    )}
                  >
                    AM
                  </button>
                  <button
                    type="button"
                    onClick={() => ampm === 'AM' && toggleAmPm()}
                    className={cn(
                      'w-12 h-6.5 rounded-lg text-[12px] font-bold transition-all border',
                      ampm === 'PM'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                    )}
                  >
                    PM
                  </button>
                </div>
              </div>

              {/* Minute quick-select */}
              <div className="mb-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                  Quick minutes
                </p>
                <div className="grid grid-cols-4 gap-1.5">
                  {MINUTE_PRESETS.map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMinute(m)}
                      className={cn(
                        'py-1.5 rounded-lg text-[12px] font-semibold transition-all border',
                        minute === m
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700'
                      )}
                    >
                      :{pad(m)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Hour quick-select row */}
              <div className="mb-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                  Quick hours
                </p>
                <div className="grid grid-cols-6 gap-1">
                  {[8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map(h => {
                    const isActive  = selected.getHours() === h;
                    // Check if this hour on the selected date overlaps any booked slot
                    const slotStart = new Date(selected);
                    slotStart.setHours(h, 0, 0, 0);
                    const slotEnd = new Date(selected);
                    slotEnd.setHours(h + 1, 0, 0, 0);
                    const isBooked = bookedSlots.some(s => {
                      const bS = new Date(s.start);
                      const bE = new Date(s.end);
                      return slotStart < bE && slotEnd > bS;
                    });
                    const displayLabel  = h <= 12 ? `${h}` : `${h - 12}`;
                    const suffix = h < 12 ? 'a' : 'p';
                    return (
                      <button
                        key={h}
                        type="button"
                        onClick={() => !isBooked && setHour(h)}
                        title={isBooked ? 'Already booked' : undefined}
                        className={cn(
                          'py-1.5 rounded-lg text-[11px] font-semibold transition-all border relative',
                          isActive  && 'bg-blue-600 text-white border-blue-600',
                          !isActive && isBooked  && 'bg-red-50 text-red-300 border-red-100 cursor-not-allowed line-through',
                          !isActive && !isBooked && 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700'
                        )}
                      >
                        {displayLabel}{suffix}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-gray-400 mt-1.5 flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded bg-red-50 border border-red-100" />
                  Strikethrough = already booked
                </p>
              </div>

              {/* Footer */}
              <div className="flex justify-between pt-2.5 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setTab('date')}
                  className="text-[11px] font-semibold text-gray-500 hover:text-gray-700 flex items-center gap-1"
                >
                  <ChevronLeft className="h-3 w-3" /> Back
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 px-3 py-1 bg-blue-50 rounded-lg transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
