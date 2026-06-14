'use client';

import { useEffect, useState, useTransition, useRef, useCallback } from 'react';
import {
  Clock, UserCheck, UserX, Coffee,
  Calendar, Download, RefreshCw, Search, X,
  Building2, ChevronDown, Wifi, ChevronLeft, ChevronRight,
  Edit2, Check, AlertCircle, Save, BarChart2, FileText,
  Users, Minus,
} from 'lucide-react';
import {
  getAttendanceForToday, upsertAttendanceRecord, updateAttendanceRecord,
  getMonthlyAttendance,
} from '@/lib/actions/hr';
import type {
  AttendanceEmployeeWithStatus, AttendanceStatus, MonthlyAttendanceSummary,
} from '@/lib/actions/hr';
import { updateAttendanceTimes } from '@/lib/actions/hiring';
import { cn } from '@/lib/utils';
import type { SectionProps } from './types';

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<AttendanceStatus, { label: string; dot: string; badge: string; bar: string }> = {
  present:  { label: 'Present',  dot: 'bg-green-500',  badge: 'bg-green-50 text-green-700 ring-1 ring-green-200',    bar: 'bg-green-500'  },
  late:     { label: 'Late',     dot: 'bg-amber-500',  badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',    bar: 'bg-amber-500'  },
  absent:   { label: 'Absent',   dot: 'bg-red-500',    badge: 'bg-red-50 text-red-700 ring-1 ring-red-200',          bar: 'bg-red-400'    },
  on_leave: { label: 'On Leave', dot: 'bg-blue-400',   badge: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',       bar: 'bg-blue-400'   },
  remote:   { label: 'Remote',   dot: 'bg-purple-500', badge: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200', bar: 'bg-purple-500' },
};
const ALL_STATUSES: AttendanceStatus[] = ['present', 'late', 'remote', 'on_leave', 'absent'];

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}
function fmtRole(r: string) {
  return r.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
function fmtTime(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}
function fmtDateDisplay(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}
function fmtDateShort(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}
function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}
function monthLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
function workHours(checkIn: string | null, checkOut: string | null): string {
  if (!checkIn || !checkOut) return '—';
  const mins = Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 60000);
  if (mins <= 0) return '—';
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function exportCSV(employees: AttendanceEmployeeWithStatus[], date: string) {
  const header = ['Employee', 'Role', 'Department', 'Hospital', 'Status', 'Check In', 'Check Out', 'Hours', 'Notes'].join(',');
  const rows = employees.map(e => [
    `"${e.name}"`, `"${fmtRole(e.role)}"`, `"${e.department ?? ''}"`,
    `"${e.hospital_name}"`, STATUS_CONFIG[e.status].label,
    fmtTime(e.check_in_time), fmtTime(e.check_out_time),
    workHours(e.check_in_time, e.check_out_time),
    `"${e.notes ?? ''}"`,
  ].join(','));
  const csv  = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a'); a.href = url; a.download = `attendance-${date}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ── Status Picker ─────────────────────────────────────────────────────────────

function StatusPicker({ employeeId, date, current, onChange }: {
  employeeId: string; date: string; current: AttendanceStatus;
  onChange: (id: string, status: AttendanceStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const s   = STATUS_CONFIG[current];

  useEffect(() => {
    function close(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    if (open) document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  async function pick(status: AttendanceStatus) {
    setOpen(false);
    if (status === current) return;
    setBusy(true);
    await upsertAttendanceRecord(employeeId, status);
    onChange(employeeId, status);
    setBusy(false);
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button onClick={() => setOpen(v => !v)} disabled={busy}
        className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all', s.badge, busy && 'opacity-60 cursor-wait')}>
        <span className={cn('w-1.5 h-1.5 rounded-full', s.dot)} />
        {s.label}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {open && (
        <div className="absolute z-50 left-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-35">
          {ALL_STATUSES.map(st => (
            <button key={st} onClick={() => pick(st)}
              className={cn('w-full flex items-center gap-2 px-3 py-2 text-xs font-medium hover:bg-slate-50 transition-colors text-left', st === current && 'bg-slate-50')}>
              <span className={cn('w-2 h-2 rounded-full shrink-0', STATUS_CONFIG[st].dot)} />
              {STATUS_CONFIG[st].label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Inline time editor ────────────────────────────────────────────────────────

function TimeCell({ employeeId, date, value, otherValue, field, onSaved }: {
  employeeId: string; date: string; value: string | null; otherValue: string | null;
  field: 'check_in' | 'check_out';
  onSaved: (id: string, field: 'check_in' | 'check_out', iso: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const toTimeStr = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const [draft, setDraft] = useState(toTimeStr(value));

  async function save() {
    setSaving(true); setEditing(false);
    const base = new Date(date + 'T00:00:00');
    let newIso: string | null = null;
    if (draft) {
      const [h, m] = draft.split(':').map(Number);
      newIso = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m).toISOString();
    }
    const checkIn  = field === 'check_in'  ? newIso : otherValue;
    const checkOut = field === 'check_out' ? newIso : otherValue;
    await updateAttendanceTimes(employeeId, checkIn, checkOut);
    setSaving(false);
    onSaved(employeeId, field, newIso);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input ref={inputRef} type="time" value={draft} onChange={e => setDraft(e.target.value)}
          onBlur={save} onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
          className="border border-blue-400 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 w-24" />
      </div>
    );
  }
  return (
    <button onClick={() => { setDraft(toTimeStr(value)); setEditing(true); setTimeout(() => inputRef.current?.focus(), 0); }}
      title="Click to edit"
      className={cn('text-sm font-medium tabular-nums px-2 py-1 rounded-lg hover:bg-blue-50 hover:text-blue-700 transition-colors text-left',
        saving ? 'opacity-50 cursor-wait' : 'cursor-pointer', value ? 'text-slate-700' : 'text-slate-300')}>
      {saving ? '…' : fmtTime(value)}
    </button>
  );
}

// ── Edit Drawer ───────────────────────────────────────────────────────────────

function EditDrawer({ emp, date, onClose, onSaved }: {
  emp: AttendanceEmployeeWithStatus; date: string;
  onClose: () => void;
  onSaved: (id: string, patch: Partial<AttendanceEmployeeWithStatus>) => void;
}) {
  const toTimeStr = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const isoFromTimeStr = (t: string, dateStr: string): string | null => {
    if (!t) return null;
    const [h, m] = t.split(':').map(Number);
    const base = new Date(dateStr + 'T00:00:00');
    return new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m).toISOString();
  };

  const [status,   setStatus]   = useState<AttendanceStatus>(emp.status);
  const [checkIn,  setCheckIn]  = useState(toTimeStr(emp.check_in_time));
  const [checkOut, setCheckOut] = useState(toTimeStr(emp.check_out_time));
  const [notes,    setNotes]    = useState(emp.notes ?? '');
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);

  async function save() {
    setSaving(true);
    const res = await updateAttendanceRecord({
      employeeId:   emp.id,
      date,
      status,
      checkInTime:  isoFromTimeStr(checkIn, date),
      checkOutTime: isoFromTimeStr(checkOut, date),
      notes:        notes.trim() || null,
    });
    setSaving(false);
    if (res.success) {
      setSaved(true);
      onSaved(emp.id, {
        status,
        check_in_time:  isoFromTimeStr(checkIn, date),
        check_out_time: isoFromTimeStr(checkOut, date),
        notes: notes.trim() || null,
      });
      setTimeout(onClose, 800);
    }
  }

  return (
    <div className="absolute inset-y-0 right-0 w-full max-w-sm bg-white border-l border-slate-200 shadow-2xl flex flex-col z-40">
      <div className="shrink-0 px-5 py-4 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-linear-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold shrink-0">
              {initials(emp.name)}
            </div>
            <div>
              <p className="font-bold text-slate-800">{emp.name}</p>
              <p className="text-xs text-slate-500">{fmtRole(emp.role)} · {emp.hospital_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-blue-600 font-semibold mt-2 flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5" /> {fmtDateDisplay(date)}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Status */}
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Attendance Status</p>
          <div className="grid grid-cols-1 gap-2">
            {ALL_STATUSES.map(st => {
              const cfg = STATUS_CONFIG[st];
              return (
                <button key={st} onClick={() => setStatus(st)}
                  className={cn('flex items-center gap-3 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all text-left',
                    status === st ? `${cfg.badge} border-current` : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50')}>
                  <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', cfg.dot)} />
                  {cfg.label}
                  {status === st && <Check className="w-4 h-4 ml-auto" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Times */}
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Check-in / Check-out</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Check In</label>
              <input type="time" value={checkIn} onChange={e => setCheckIn(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Check Out</label>
              <input type="time" value={checkOut} onChange={e => setCheckOut(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          {checkIn && checkOut && (
            <p className="text-xs text-slate-500 mt-2 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Hours worked: {workHours(isoFromTimeStr(checkIn, date), isoFromTimeStr(checkOut, date))}
            </p>
          )}
        </div>

        {/* Notes */}
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Notes / Remarks</p>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
            placeholder="e.g. Doctor's appointment, left early, working from home..."
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
        </div>
      </div>

      <div className="shrink-0 p-4 border-t border-slate-100">
        <button onClick={save} disabled={saving || saved}
          className={cn('w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all',
            saved ? 'bg-green-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60')}>
          {saved ? <><Check className="w-4 h-4" /> Saved!</> : saving ? <><RefreshCw className="w-4 h-4 animate-spin" /> Saving…</> : <><Save className="w-4 h-4" /> Save Changes</>}
        </button>
      </div>
    </div>
  );
}

// ── Monthly Summary Tab ───────────────────────────────────────────────────────

function MonthlyView({ year, month, hospitals }: { year: number; month: number; hospitals: Array<{ id: string; name: string; color: string | null }> }) {
  const [data,        setData]        = useState<MonthlyAttendanceSummary[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [activeHosp,  setActiveHosp]  = useState('all');
  const [search,      setSearch]      = useState('');
  const [expanded,    setExpanded]    = useState<string | null>(null);
  const [, startT]                    = useTransition();

  useEffect(() => {
    setLoading(true);
    startT(async () => {
      const res = await getMonthlyAttendance(year, month);
      setData(res.summaries);
      setLoading(false);
    });
  }, [year, month]);

  const activeHospName = hospitals.find(h => h.id === activeHosp)?.name;
  const visible = data.filter(s => {
    const matchH = activeHosp === 'all' || s.hospitalName === activeHospName;
    const matchQ = !search || s.employeeName.toLowerCase().includes(search.toLowerCase());
    return matchH && matchQ;
  });

  // Org-level stats
  const totalPresent = data.reduce((n, s) => n + s.presentDays, 0);
  const totalLate    = data.reduce((n, s) => n + s.lateDays, 0);
  const totalAbsent  = data.reduce((n, s) => n + s.absentDays, 0);
  const totalLeave   = data.reduce((n, s) => n + s.leaveDays, 0);
  const totalRemote  = data.reduce((n, s) => n + s.remoteDays, 0);
  const avgRate      = data.length ? Math.round(data.reduce((n, s) => n + s.attendanceRate, 0) / data.length) : 0;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Avg. Rate', value: `${avgRate}%`,        color: 'text-blue-700',   bg: 'bg-blue-50'   },
          { label: 'Present',   value: String(totalPresent), color: 'text-green-700',  bg: 'bg-green-50'  },
          { label: 'Late',      value: String(totalLate),    color: 'text-amber-700',  bg: 'bg-amber-50'  },
          { label: 'Absent',    value: String(totalAbsent),  color: 'text-red-700',    bg: 'bg-red-50'    },
          { label: 'On Leave',  value: String(totalLeave),   color: 'text-sky-700',    bg: 'bg-sky-50'    },
          { label: 'Remote',    value: String(totalRemote),  color: 'text-purple-700', bg: 'bg-purple-50' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={cn('rounded-xl p-3 text-center', bg)}>
            <p className={cn('text-lg font-bold tabular-nums', color)}>{loading ? '—' : value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employee…"
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {[{ id: 'all', name: 'All', color: null }, ...hospitals].map(h => (
            <button key={h.id} onClick={() => setActiveHosp(h.id)}
              className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 border transition-all',
                activeHosp === h.id ? 'text-white border-transparent' : 'bg-white text-slate-600 border-slate-200')}
              style={activeHosp === h.id ? { background: h.color ?? '#1e3a5f' } : {}}>
              {h.name}
            </button>
          ))}
        </div>
      </div>

      {/* Per-employee rows */}
      {loading ? (
        <div className="flex items-center justify-center h-32"><RefreshCw className="w-6 h-6 animate-spin text-slate-300" /></div>
      ) : (
        <div className="space-y-2">
          {visible.map(s => (
            <div key={s.employeeId} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-slate-50/60"
                onClick={() => setExpanded(expanded === s.employeeId ? null : s.employeeId)}>
                <div className="w-8 h-8 rounded-full bg-linear-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {initials(s.employeeName)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{s.employeeName}</p>
                  <p className="text-xs text-slate-500">{fmtRole(s.role)} · {s.hospitalName}</p>
                </div>
                {/* Mini bar */}
                <div className="hidden sm:flex items-center gap-1 shrink-0">
                  {(['present','late','remote','on_leave','absent'] as AttendanceStatus[]).map(st => {
                    const count = st === 'present' ? s.presentDays : st === 'late' ? s.lateDays : st === 'remote' ? s.remoteDays : st === 'on_leave' ? s.leaveDays : s.absentDays;
                    return count > 0 ? (
                      <span key={st} title={`${STATUS_CONFIG[st].label}: ${count}d`}
                        className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white', STATUS_CONFIG[st].bar)}>
                        {count}
                      </span>
                    ) : null;
                  })}
                </div>
                <div className="shrink-0 text-right">
                  <p className={cn('text-sm font-bold tabular-nums', s.attendanceRate >= 90 ? 'text-green-600' : s.attendanceRate >= 75 ? 'text-amber-600' : 'text-red-600')}>
                    {s.attendanceRate}%
                  </p>
                  <p className="text-[10px] text-slate-400">{s.totalDays}d tracked</p>
                </div>
                <ChevronDown className={cn('w-4 h-4 text-slate-400 transition-transform', expanded === s.employeeId && 'rotate-180')} />
              </div>

              {/* Expanded day-by-day */}
              {expanded === s.employeeId && (
                <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/40">
                  {s.records.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-2">No records this month</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                      {s.records.sort((a, b) => a.date.localeCompare(b.date)).map(rec => {
                        const cfg = STATUS_CONFIG[rec.status];
                        return (
                          <div key={rec.date} className={cn('rounded-lg p-2 border text-xs', cfg.badge)}>
                            <p className="font-semibold">{fmtDateShort(rec.date)}</p>
                            <p className="font-medium mt-0.5">{cfg.label}</p>
                            {rec.check_in_time && <p className="opacity-70 mt-0.5">{fmtTime(rec.check_in_time)} – {fmtTime(rec.check_out_time)}</p>}
                            {rec.notes && <p className="italic mt-0.5 opacity-60 truncate" title={rec.notes}>{rec.notes}</p>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {visible.length === 0 && (
            <div className="text-center py-10">
              <BarChart2 className="w-8 h-8 text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No records found for {monthLabel(year, month)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Section ──────────────────────────────────────────────────────────────

export function AttendanceSection({ orgId }: SectionProps) {
  const [tab,          setTab]         = useState<'daily' | 'monthly'>('daily');
  const [hospitals,    setHospitals]   = useState<Array<{ id: string; name: string; color: string | null }>>([]);
  const [employees,    setEmployees]   = useState<AttendanceEmployeeWithStatus[]>([]);
  const [activeHospital, setActive]   = useState('all');
  const [search,       setSearch]      = useState('');
  const [filterStatus, setFilter]      = useState('all');
  const [loading,      setLoading]     = useState(true);
  const [date,         setDate]        = useState(todayISO());
  const [hasRealData,  setHasReal]     = useState(false);
  const [editEmp,      setEditEmp]     = useState<AttendanceEmployeeWithStatus | null>(null);
  const [monthYear,    setMonthYear]   = useState(() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() + 1 }; });
  const [, startT]                     = useTransition();

  const load = useCallback((d: string) => {
    setLoading(true);
    startT(async () => {
      const res = await getAttendanceForToday(d);
      setHospitals(res.hospitals);
      setEmployees(res.employees);
      setHasReal(res.hasRealData);
      setLoading(false);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(date); }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  function navigate(n: number) {
    const next = addDays(date, n);
    if (next > todayISO()) return;
    setDate(next);
    load(next);
  }
  function jumpToDate(d: string) {
    if (d > todayISO()) return;
    setDate(d);
    load(d);
  }

  function handleStatusChange(id: string, status: AttendanceStatus) {
    setEmployees(prev => prev.map(e => e.id === id ? { ...e, status,
      check_in_time: (status === 'present' || status === 'late' || status === 'remote') ? (e.check_in_time ?? new Date().toISOString()) : null,
    } : e));
  }
  function handleTimeChange(id: string, field: 'check_in' | 'check_out', iso: string | null) {
    setEmployees(prev => prev.map(e => e.id === id
      ? { ...e, check_in_time: field === 'check_in' ? iso : e.check_in_time, check_out_time: field === 'check_out' ? iso : e.check_out_time }
      : e));
  }
  function handleEditSaved(id: string, patch: Partial<AttendanceEmployeeWithStatus>) {
    setEmployees(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
  }

  // Filtering
  const activeHospName = hospitals.find(h => h.id === activeHospital)?.name;
  const visible = employees.filter(e => {
    const matchH = activeHospital === 'all' || e.hospital_name === activeHospName;
    const matchS = filterStatus === 'all' || e.status === filterStatus;
    const q = search.toLowerCase();
    const matchQ = !search || e.name.toLowerCase().includes(q) || e.role.toLowerCase().includes(q) || (e.department ?? '').toLowerCase().includes(q);
    return matchH && matchS && matchQ;
  });

  // Stats
  const base    = activeHospital === 'all' ? employees : employees.filter(e => e.hospital_name === activeHospName);
  const present = base.filter(e => e.status === 'present').length;
  const late    = base.filter(e => e.status === 'late').length;
  const absent  = base.filter(e => e.status === 'absent').length;
  const onLeave = base.filter(e => e.status === 'on_leave').length;
  const remote  = base.filter(e => e.status === 'remote').length;
  const total   = base.length;
  const isToday = date === todayISO();

  return (
    <div className="space-y-4 pb-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Attendance & Time</h1>
          <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-1.5">
            {isToday ? (
              <><Wifi className="w-3.5 h-3.5 text-green-500" /><span className="text-green-600 font-medium">Live · </span></>
            ) : (
              <><Calendar className="w-3.5 h-3.5" /></>
            )}
            {fmtDateDisplay(date)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => load(date)} disabled={loading} className="p-2.5 border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50 bg-white transition-colors">
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
          <button onClick={() => exportCSV(visible, date)} disabled={loading || employees.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 bg-white transition-colors disabled:opacity-40">
            <Download className="w-4 h-4" /> Export
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 border-b border-slate-100">
        <button onClick={() => setTab('daily')}
          className={cn('flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors',
            tab === 'daily' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700')}>
          <Users className="w-4 h-4" /> Daily Attendance
        </button>
        <button onClick={() => setTab('monthly')}
          className={cn('flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors',
            tab === 'monthly' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700')}>
          <BarChart2 className="w-4 h-4" /> Monthly Summary
        </button>
      </div>

      {tab === 'monthly' ? (
        <div className="space-y-4">
          {/* Month nav */}
          <div className="flex items-center gap-3">
            <button onClick={() => setMonthYear(mv => {
              const d = new Date(mv.year, mv.month - 2, 1);
              return { year: d.getFullYear(), month: d.getMonth() + 1 };
            })} className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-bold text-slate-700 min-w-36 text-center">
              {monthLabel(monthYear.year, monthYear.month)}
            </span>
            <button onClick={() => setMonthYear(mv => {
              const d = new Date(mv.year, mv.month, 1);
              if (d > new Date()) return mv;
              return { year: d.getFullYear(), month: d.getMonth() + 1 };
            })} className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <MonthlyView year={monthYear.year} month={monthYear.month} hospitals={hospitals} />
        </div>
      ) : (
        <>
          {/* ── Date navigation ── */}
          <div className="flex items-center gap-2">
            <button onClick={() => navigate(-1)} className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input type="date" value={date} max={todayISO()}
              onChange={e => e.target.value && jumpToDate(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
            <button onClick={() => navigate(1)} disabled={isToday}
              className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 disabled:opacity-40">
              <ChevronRight className="w-4 h-4" />
            </button>
            {!isToday && (
              <button onClick={() => jumpToDate(todayISO())}
                className="px-3 py-2 text-xs font-semibold text-blue-600 border border-blue-200 bg-blue-50 rounded-xl hover:bg-blue-100">
                Today
              </button>
            )}
            <span className="text-xs text-slate-400 ml-auto hidden sm:block">
              Click status, time, or <Edit2 className="w-3 h-3 inline" /> to edit
            </span>
          </div>

          {/* ── Hospital tabs ── */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {[{ id: 'all', name: 'All Hospitals', color: null }, ...hospitals].map(h => {
              const isActive = h.id === activeHospital;
              const count = h.id === 'all' ? employees.length : employees.filter(e => e.hospital_name === h.name).length;
              return (
                <button key={h.id} onClick={() => setActive(h.id)}
                  className={cn('flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold shrink-0 transition-all border',
                    isActive ? 'text-white border-transparent' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300')}
                  style={isActive ? { background: h.color ?? '#1e3a5f' } : {}}>
                  {h.id === 'all' ? <Building2 className="w-3.5 h-3.5" /> : <div className="w-2 h-2 rounded-full" style={{ background: h.color ?? '#6b7280' }} />}
                  {h.name}
                  <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-bold', isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600')}>{count}</span>
                </button>
              );
            })}
          </div>

          {/* ── Stats ── */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              { label: 'Present',  value: present, icon: UserCheck,  color: 'text-green-600',  bg: 'bg-green-50',  ring: 'ring-green-100'  },
              { label: 'Late',     value: late,    icon: Clock,      color: 'text-amber-600',  bg: 'bg-amber-50',  ring: 'ring-amber-100'  },
              { label: 'Absent',   value: absent,  icon: UserX,      color: 'text-red-600',    bg: 'bg-red-50',    ring: 'ring-red-100'    },
              { label: 'On Leave', value: onLeave, icon: Coffee,     color: 'text-blue-600',   bg: 'bg-blue-50',   ring: 'ring-blue-100'   },
              { label: 'Remote',   value: remote,  icon: Wifi,       color: 'text-purple-600', bg: 'bg-purple-50', ring: 'ring-purple-100' },
            ].map(({ label, value, icon: Icon, color, bg, ring }) => (
              <div key={label} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3 shadow-sm">
                <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ring-4', bg, ring)}>
                  <Icon className={cn('w-4.5 h-4.5', color)} />
                </div>
                <div>
                  <p className="text-xl font-bold text-slate-800 tabular-nums">{loading ? '—' : value}</p>
                  <p className="text-xs text-slate-500 mt-0.5 font-medium">{label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* ── Attendance rate bar ── */}
          {!loading && total > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-4 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 shrink-0">Attendance Rate</span>
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.round(((present + late + remote) / total) * 100)}%` }} />
              </div>
              <span className="text-sm font-bold text-slate-700 tabular-nums shrink-0">
                {Math.round(((present + late + remote) / total) * 100)}%
              </span>
              <span className="text-xs text-slate-400 shrink-0">{present + late + remote} / {total} staff</span>
            </div>
          )}

          {/* ── Notice ── */}
          {!loading && !hasRealData && employees.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              Preview data — run migration <strong>029_attendance.sql</strong> to activate real attendance tracking
            </div>
          )}

          {/* ── Filters ── */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48 max-w-sm">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employee, role…"
                className="w-full pl-10 pr-9 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
              {search && <button onClick={() => setSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>}
            </div>
            <select value={filterStatus} onChange={e => setFilter(e.target.value)}
              className="border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="all">All Status</option>
              {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
            </select>
            {(search || filterStatus !== 'all') && <span className="self-center text-sm text-slate-500">{visible.length} results</span>}
          </div>

          {/* ── Table (relative for drawer) ── */}
          <div className="relative rounded-2xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
            <div>
              {loading ? (
                <div className="flex items-center justify-center h-48">
                  <RefreshCw className="w-6 h-6 animate-spin text-slate-300" />
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/80 sticky top-0 z-10">
                      {['Employee', 'Role', 'Hospital', 'Status', 'Check In', 'Check Out', 'Hours', 'Notes', ''].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {visible.map(emp => (
                      <tr key={emp.id} className={cn('hover:bg-slate-50/60 transition-colors', editEmp?.id === emp.id && 'bg-blue-50/30')}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {emp.avatar_url ? (
                              <img src={emp.avatar_url} alt={emp.name} className="w-8 h-8 rounded-full object-cover ring-2 ring-slate-100 shrink-0" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-linear-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                                {initials(emp.name)}
                              </div>
                            )}
                            <p className="text-sm font-semibold text-slate-800 truncate max-w-32">{emp.name}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="text-sm text-slate-700">{fmtRole(emp.role)}</p>
                            {emp.department && <p className="text-xs text-slate-400">{emp.department}</p>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: emp.hospital_color ?? '#6b7280' }} />
                            <span className="text-sm text-slate-600 truncate max-w-28">{emp.hospital_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusPicker employeeId={emp.id} date={date} current={emp.status} onChange={handleStatusChange} />
                        </td>
                        <td className="px-4 py-2">
                          <TimeCell employeeId={emp.id} date={date} value={emp.check_in_time} otherValue={emp.check_out_time} field="check_in" onSaved={handleTimeChange} />
                        </td>
                        <td className="px-4 py-2">
                          <TimeCell employeeId={emp.id} date={date} value={emp.check_out_time} otherValue={emp.check_in_time} field="check_out" onSaved={handleTimeChange} />
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-slate-500 tabular-nums">{workHours(emp.check_in_time, emp.check_out_time)}</span>
                        </td>
                        <td className="px-4 py-3 max-w-36">
                          {emp.notes ? (
                            <span className="text-xs text-slate-500 italic truncate block" title={emp.notes}>{emp.notes}</span>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => setEditEmp(editEmp?.id === emp.id ? null : emp)}
                            className={cn('p-1.5 rounded-lg transition-colors', editEmp?.id === emp.id ? 'bg-blue-100 text-blue-600' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600')}>
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {visible.length === 0 && (
                      <tr>
                        <td colSpan={9} className="px-4 py-16 text-center">
                          <UserCheck className="w-8 h-8 text-slate-200 mx-auto mb-3" />
                          <p className="text-slate-400 text-sm font-medium">No employees match your filters</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {/* Edit drawer slides in from right */}
            {editEmp && (
              <EditDrawer
                emp={editEmp}
                date={date}
                onClose={() => setEditEmp(null)}
                onSaved={handleEditSaved}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
