'use client';

import { useState, useTransition, useCallback } from 'react';
import {
  Search, Users, CheckCircle2, AlertCircle, TrendingUp,
  RefreshCw, UserPlus, X, Calendar, Briefcase,
  UserMinus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getHRPipelineData } from '@/lib/actions/onboarding-wizard';
import { WIZARD_STEPS, WIZARD_STEP_ORDER } from '@/lib/actions/onboarding-wizard-types';
import type { PipelineEmployee } from '@/lib/actions/onboarding-wizard-types';
import { terminateEmployee } from '@/lib/actions/hiring';

// ── Helpers ──────────────────────────────────────────────────────────────────

export function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}

function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function currentStepLabel(emp: PipelineEmployee) {
  const idx = Math.min(emp.wizard_step ?? 0, WIZARD_STEP_ORDER.length - 1);
  return WIZARD_STEPS[idx]?.label ?? 'Getting Started';
}

function fmtRole(role: string | null) {
  if (!role) return 'Employee';
  return role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function isOverdue(emp: PipelineEmployee) {
  return emp.status !== 'completed' && daysSince(emp.created_at) > 14;
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS = {
  completed: { label: 'Completed',   dot: 'bg-green-500',  badge: 'bg-green-50 text-green-700 ring-1 ring-green-200'  },
  active:    { label: 'In Progress', dot: 'bg-blue-500',   badge: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'    },
  on_hold:   { label: 'On Hold',     dot: 'bg-amber-500',  badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
  overdue:   { label: 'Overdue',     dot: 'bg-red-500',    badge: 'bg-red-50 text-red-700 ring-1 ring-red-200'       },
} as const;

// ── Terminate Modal ───────────────────────────────────────────────────────────

export function TerminateModal({ emp, onClose, onDone }: {
  emp: Pick<PipelineEmployee, 'employee_id' | 'employee_name'>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState({ reason: '', termination_type: 'voluntary', last_working_day: '', notes: '', rehire_eligible: true });
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.reason.trim())    return setErr('Reason is required');
    if (!form.last_working_day) return setErr('Last working day is required');
    setBusy(true);
    const res = await terminateEmployee({ employee_id: emp.employee_id, ...form });
    setBusy(false);
    if (!res.success) return setErr(res.error ?? 'Failed');
    onDone();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm pt-10 px-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800 text-lg">Terminate Employee</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>This will deactivate <strong>{emp.employee_name}</strong>&apos;s account and cancel active onboarding.</span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Termination Type</label>
            <select value={form.termination_type} onChange={e => setForm(f => ({ ...f, termination_type: e.target.value }))}
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="voluntary">Voluntary Resignation</option>
              <option value="involuntary">Involuntary (Dismissal)</option>
              <option value="layoff">Layoff / Reduction in Force</option>
              <option value="retirement">Retirement</option>
              <option value="contract_end">Contract End</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Reason *</label>
            <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} rows={3}
              placeholder="Describe the reason for termination..."
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white resize-none" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Last Working Day *</label>
            <input type="date" value={form.last_working_day} onChange={e => setForm(f => ({ ...f, last_working_day: e.target.value }))}
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Additional Notes</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
              placeholder="Any additional context..."
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white resize-none" />
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={form.rehire_eligible} onChange={e => setForm(f => ({ ...f, rehire_eligible: e.target.checked }))}
              className="w-4 h-4 rounded border-slate-300 text-blue-600" />
            <span className="text-sm text-slate-700 font-medium">Eligible for rehire</span>
          </label>

          {err && (
            <p className="text-sm text-red-600 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4" />{err}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold">Cancel</button>
            <button type="submit" disabled={busy} className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50">
              {busy ? 'Processing…' : 'Terminate Employee'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Employee Card ─────────────────────────────────────────────────────────────

const STAGE_KEYS = ['pre_hire', 'documents', 'orientation', 'training', 'manager_review', 'completed'];

function stageBasedPct(emp: PipelineEmployee): number {
  const idx = STAGE_KEYS.indexOf(emp.stage ?? 'pre_hire');
  if (idx < 0) return emp.progress_pct;
  return Math.max(emp.progress_pct, Math.round((idx / (STAGE_KEYS.length - 1)) * 100));
}

function EmployeeCard({ emp, onOpen, onTerminate }: {
  emp: PipelineEmployee;
  onOpen: (employeeId: string) => void;
  onTerminate: (emp: Pick<PipelineEmployee, 'employee_id' | 'employee_name'>) => void;
}) {
  const days = daysSince(emp.created_at);
  const overdue = isOverdue(emp);
  const isCompleted = emp.status === 'completed' || emp.stage === 'completed';
  const statusKey: keyof typeof STATUS = isCompleted ? 'completed' : overdue ? 'overdue' : (emp.status as keyof typeof STATUS) in STATUS ? emp.status as keyof typeof STATUS : 'active';
  const status = STATUS[statusKey];
  const startDate = fmtDate(emp.start_date);
  const displayPct = stageBasedPct(emp);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(emp.employee_id)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onOpen(emp.employee_id); }}
      className="group w-full text-left bg-white border border-slate-200 rounded-2xl p-5 hover:border-blue-300 hover:shadow-[0_2px_16px_rgba(59,130,246,0.10)] transition-all duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      {/* Row 1: avatar + name + status */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          {emp.employee_avatar ? (
            <img src={emp.employee_avatar} alt={emp.employee_name}
              className="w-11 h-11 rounded-full object-cover shrink-0 ring-2 ring-slate-100" />
          ) : (
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
              {initials(emp.employee_name)}
            </div>
          )}
          <div className="min-w-0">
            <p className="font-semibold text-slate-800 text-sm truncate group-hover:text-blue-700 transition-colors">
              {emp.employee_name}
            </p>
            <p className="text-xs text-slate-500 truncate mt-0.5">
              {fmtRole(emp.job_title ?? emp.department)}
            </p>
          </div>
        </div>
        <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium shrink-0', status.badge)}>
          <span className={cn('w-1.5 h-1.5 rounded-full', status.dot)} />
          {status.label}
        </span>
      </div>

      {/* Hospital + department */}
      {(emp.hospital_name || emp.department) && (
        <div className="flex items-center gap-2 mb-4">
          {emp.hospital_color && (
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: emp.hospital_color }} />
          )}
          <span className="text-xs text-slate-600 truncate">
            {emp.hospital_name}{emp.department ? ` · ${emp.department}` : ''}
          </span>
        </div>
      )}

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-slate-500">Progress</span>
          <span className={cn('text-xs font-semibold', displayPct === 100 ? 'text-green-600' : 'text-slate-700')}>
            {displayPct}%
          </span>
        </div>
        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${displayPct}%`, background: displayPct === 100 ? '#22c55e' : overdue ? '#ef4444' : '#3b82f6' }} />
        </div>
      </div>

      {/* Current step + days */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs text-slate-400 mb-0.5">Current Step</p>
          <p className="text-xs font-medium text-slate-700">{currentStepLabel(emp)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400 mb-0.5">{overdue ? 'Days over limit' : 'Days active'}</p>
          <p className={cn('text-xs font-semibold', overdue ? 'text-red-600' : 'text-slate-600')}>{days}d</p>
        </div>
      </div>

      {/* Start date */}
      {startDate && (
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-xs text-slate-500">Starts {startDate}</span>
        </div>
      )}

      {/* Docs / policies mini-stats */}
      {(emp.docs_total > 0 || emp.policies_total > 0) && (
        <div className="mt-3 flex items-center gap-4">
          {emp.docs_total > 0 && (
            <div className="flex items-center gap-1 text-xs text-slate-400">
              <Briefcase className="w-3 h-3" />
              <span>{emp.docs_uploaded}/{emp.docs_total} docs</span>
            </div>
          )}
          {emp.policies_total > 0 && (
            <div className="flex items-center gap-1 text-xs text-slate-400">
              <CheckCircle2 className="w-3 h-3" />
              <span>{emp.policies_acked}/{emp.policies_total} signed</span>
            </div>
          )}
        </div>
      )}

      {/* Terminate action */}
      <div className="mt-3 pt-3 border-t border-slate-100">
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onTerminate(emp); }}
          className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors font-medium"
        >
          <UserMinus className="w-3.5 h-3.5" /> Terminate Employee
        </button>
      </div>
    </div>
  );
}

// ── Main HR Dashboard ─────────────────────────────────────────────────────────

interface HRPipelineProps {
  initialEmployees: PipelineEmployee[];
  initialHospitals: { name: string; color: string | null }[];
  onCreateEmployee?: () => void;
  onViewEmployee: (employeeId: string) => void;
}

export function HRPipeline({ initialEmployees, initialHospitals, onCreateEmployee, onViewEmployee }: HRPipelineProps) {
  const [employees, setEmployees] = useState(initialEmployees);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterHospital, setFilterHospital] = useState('all');
  const [isPending, startTransition] = useTransition();
  const [terminatingEmp, setTerminatingEmp] = useState<Pick<PipelineEmployee, 'employee_id' | 'employee_name'> | null>(null);

  const refresh = useCallback(() => {
    startTransition(async () => {
      const res = await getHRPipelineData();
      setEmployees(res.employees);
    });
  }, []);

  const total      = employees.length;
  const completed  = employees.filter(e => e.status === 'completed' || e.stage === 'completed').length;
  const inProgress = employees.filter(e => e.status === 'active' && e.stage !== 'completed').length;
  const overdue    = employees.filter(e => isOverdue(e)).length;

  // Use all org hospitals (from DB) so the filter shows every hospital even without active employees
  const hospitals = initialHospitals.length > 0
    ? initialHospitals.map(h => h.name)
    : Array.from(new Set(employees.map(e => e.hospital_name).filter(Boolean))) as string[];

  const filtered = employees.filter(emp => {
    const q = search.toLowerCase();
    const matchSearch = !search
      || emp.employee_name.toLowerCase().includes(q)
      || (emp.employee_email ?? '').toLowerCase().includes(q)
      || (emp.job_title ?? '').toLowerCase().includes(q)
      || (emp.department ?? '').toLowerCase().includes(q);
    const isCompleted = emp.status === 'completed' || emp.stage === 'completed';
    const matchStatus = filterStatus === 'all'
      || (filterStatus === 'overdue'   ? isOverdue(emp)
        : filterStatus === 'completed' ? isCompleted
        : filterStatus === 'active'    ? emp.status === 'active' && !isCompleted
        : emp.status === filterStatus);
    const matchHospital = filterHospital === 'all' || emp.hospital_name === filterHospital;
    return matchSearch && matchStatus && matchHospital;
  });

  const hasFilters = search || filterStatus !== 'all' || filterHospital !== 'all';

  return (
    <div className="flex flex-col gap-0">

      {/* Stats row */}
      <div className="shrink-0 grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Employees', value: total,      icon: Users,        gradient: 'from-blue-500 to-blue-600',      ring: 'ring-blue-100'  },
          { label: 'In Progress',     value: inProgress, icon: TrendingUp,   gradient: 'from-indigo-500 to-violet-600',  ring: 'ring-indigo-100' },
          { label: 'Completed',       value: completed,  icon: CheckCircle2, gradient: 'from-emerald-500 to-green-600',  ring: 'ring-green-100'  },
          { label: 'Overdue',         value: overdue,    icon: AlertCircle,  gradient: overdue > 0 ? 'from-red-500 to-rose-600' : 'from-slate-400 to-slate-500', ring: 'ring-red-100' },
        ].map(({ label, value, icon: Icon, gradient, ring }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-4 shadow-sm">
            <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br text-white shrink-0 ring-4', gradient, ring)}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800 leading-none tabular-nums">{value}</p>
              <p className="text-sm text-slate-500 mt-1 font-medium">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="shrink-0 flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email, role…"
            className="w-full pl-10 pr-9 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm" />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm">
          <option value="all">All Status</option>
          <option value="active">In Progress</option>
          <option value="completed">Completed</option>
          <option value="on_hold">On Hold</option>
          <option value="overdue">Overdue</option>
        </select>

        {hospitals.length > 1 && (
          <select value={filterHospital} onChange={e => setFilterHospital(e.target.value)}
            className="border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm">
            <option value="all">All Hospitals</option>
            {hospitals.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        )}

        <button onClick={refresh} disabled={isPending} title="Refresh"
          className="p-2.5 border border-slate-200 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-50 bg-white shadow-sm transition-colors">
          <RefreshCw className={cn('w-4 h-4', isPending && 'animate-spin')} />
        </button>

        {hasFilters && (
          <span className="text-sm text-slate-500">{filtered.length} {filtered.length === 1 ? 'result' : 'results'}</span>
        )}

        {onCreateEmployee && (
          <button onClick={onCreateEmployee}
            className="ml-auto flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm">
            <UserPlus className="w-4 h-4" /> Add Employee
          </button>
        )}
      </div>

      {/* Employee grid */}
      <div>
        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-4">
            {filtered.map(emp => (
              <EmployeeCard
                key={emp.record_id}
                emp={emp}
                onOpen={onViewEmployee}
                onTerminate={setTerminatingEmp}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center min-h-[280px] py-16 text-center">
            <div className="w-20 h-20 rounded-3xl bg-slate-100 flex items-center justify-center mb-5">
              <Users className="w-9 h-9 text-slate-300" />
            </div>
            <h3 className="text-slate-700 font-semibold text-lg mb-2">
              {hasFilters ? 'No employees match your filters' : 'No employees in onboarding'}
            </h3>
            <p className="text-slate-400 text-sm max-w-xs">
              {hasFilters ? 'Try adjusting your search or clearing filters' : 'Add your first employee to get started'}
            </p>
            {hasFilters && (
              <button onClick={() => { setSearch(''); setFilterStatus('all'); setFilterHospital('all'); }}
                className="mt-4 text-sm text-blue-600 hover:text-blue-800 font-medium">
                Clear all filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Terminate modal */}
      {terminatingEmp && (
        <TerminateModal
          emp={terminatingEmp}
          onClose={() => setTerminatingEmp(null)}
          onDone={() => { setTerminatingEmp(null); refresh(); }}
        />
      )}
    </div>
  );
}
