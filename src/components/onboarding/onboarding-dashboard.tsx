'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  UserPlus, Users, CheckCircle2, Clock, AlertTriangle, ChevronRight,
  Plus, Search, X, Loader2, Sparkles, Building2, User, Star,
  ArrowRight, MoreHorizontal, Trash2, RefreshCw, TrendingUp,
  FileText, GraduationCap, Calendar, Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { createOnboardingRecord, deleteOnboardingRecord } from '@/lib/actions/onboarding';
import type {
  OnboardingRecord, OnboardingStats, OnboardingTemplate,
  OnboardingStage, CreateRecordInput,
} from '@/lib/actions/onboarding';
import { TemplateManager } from './template-manager';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

export const STAGES: Array<{ key: OnboardingStage; label: string; color: string; bg: string; border: string }> = [
  { key: 'pre_hire',       label: 'Pre-Hire',       color: '#6b7280', bg: 'bg-gray-50',    border: 'border-gray-200'  },
  { key: 'documents',      label: 'Documents',      color: '#3b82f6', bg: 'bg-blue-50',    border: 'border-blue-200'  },
  { key: 'orientation',    label: 'Orientation',    color: '#8b5cf6', bg: 'bg-purple-50',  border: 'border-purple-200'},
  { key: 'training',       label: 'Training',       color: '#f59e0b', bg: 'bg-amber-50',   border: 'border-amber-200' },
  { key: 'manager_review', label: 'Manager Review', color: '#ec4899', bg: 'bg-pink-50',    border: 'border-pink-200'  },
  { key: 'completed',      label: 'Completed',      color: '#22c55e', bg: 'bg-green-50',   border: 'border-green-200' },
];

const ROLE_COLORS: Record<string, string> = {
  doctor:        '#3b82f6',
  csr:           '#22c55e',
  hr:            '#8b5cf6',
  manager:       '#f59e0b',
  vet_assistant: '#ec4899',
  custom:        '#6b7280',
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysLeft(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function initials(name?: string | null) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function Avatar({ name, size = 8, color }: { name?: string | null; size?: number; color?: string }) {
  return (
    <div
      className={cn(`h-${size} w-${size} rounded-full flex items-center justify-center shrink-0`)}
      style={{ background: color ?? 'linear-gradient(135deg,#f97316,#ec4899)' }}
    >
      <span className="text-white font-bold" style={{ fontSize: size * 1.5 }}>{initials(name)}</span>
    </div>
  );
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Stats Bar
// ─────────────────────────────────────────────────────────────

function StatsBar({ stats }: { stats: OnboardingStats }) {
  const tiles = [
    { label: 'Total',          val: stats.total,         icon: Users,        cls: 'text-slate-600',   bg: 'bg-slate-50'   },
    { label: 'Active',         val: stats.active,        icon: TrendingUp,   cls: 'text-blue-600',    bg: 'bg-blue-50'    },
    { label: 'Completed',      val: stats.completed,     icon: CheckCircle2, cls: 'text-green-600',   bg: 'bg-green-50'   },
    { label: 'Pending Review', val: stats.pendingReview, icon: Star,         cls: 'text-pink-600',    bg: 'bg-pink-50'    },
    { label: 'Overdue',        val: stats.overdue,       icon: AlertTriangle,cls: 'text-red-600',     bg: 'bg-red-50'     },
  ];
  return (
    <div className="grid grid-cols-3 xl:grid-cols-5 gap-3">
      {tiles.map(t => (
        <div key={t.label} className={cn('rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3', t.bg)}>
          <div className="h-9 w-9 rounded-xl bg-white flex items-center justify-center shadow-sm shrink-0">
            <t.icon className={cn('h-4.5 w-4.5', t.cls)} />
          </div>
          <div>
            <p className="text-[22px] font-bold text-gray-900 leading-none">{t.val}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">{t.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Pipeline (Kanban by Stage)
// ─────────────────────────────────────────────────────────────

function PipelineCard({ record, onDelete }: { record: OnboardingRecord; onDelete: (id: string) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const stage = STAGES.find(s => s.key === record.stage) ?? STAGES[0];
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = record.target_completion_date && record.target_completion_date < today && record.stage !== 'completed';
  const days = record.target_completion_date ? daysLeft(record.target_completion_date) : null;

  return (
    <div className={cn(
      'bg-white rounded-xl border shadow-sm p-3 group hover:shadow-md transition-all',
      isOverdue ? 'border-red-200' : 'border-gray-100',
    )}>
      <div className="flex items-start gap-2.5 mb-2.5">
        <Avatar name={record.employeeName} size={8} color={`${stage.color}cc`} />
        <div className="flex-1 min-w-0">
          <Link
            href={`/onboarding/${record.employee_id}`}
            className="text-[13px] font-bold text-gray-900 hover:text-orange-600 transition-colors leading-tight block truncate"
          >
            {record.employeeName}
          </Link>
          <p className="text-[11px] text-gray-400 truncate">{record.employeeJobTitle ?? 'New Employee'}</p>
        </div>
        <div className="relative">
          <button
            onClick={() => setMenuOpen(m => !m)}
            className="h-6 w-6 rounded-lg hover:bg-gray-100 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
          >
            <MoreHorizontal className="h-3.5 w-3.5 text-gray-400" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-7 z-20 bg-white rounded-xl shadow-lg border border-gray-100 py-1 min-w-[130px]">
              <Link href={`/onboarding/${record.employee_id}`}
                className="flex items-center gap-2 px-3 py-2 text-[12px] text-gray-700 hover:bg-gray-50"
                onClick={() => setMenuOpen(false)}>
                <ChevronRight className="h-3.5 w-3.5" /> Open
              </Link>
              <button
                onClick={() => { onDelete(record.id); setMenuOpen(false); }}
                className="flex items-center gap-2 px-3 py-2 text-[12px] text-red-600 hover:bg-red-50 w-full">
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </button>
            </div>
          )}
        </div>
      </div>

      <ProgressBar pct={record.progress_pct} color={stage.color} />

      <div className="mt-2 flex items-center justify-between text-[10px] text-gray-400">
        <span>{record.completedCount ?? 0}/{record.taskCount ?? 0} tasks</span>
        {record.target_completion_date && (
          <span className={cn(isOverdue ? 'text-red-600 font-semibold' : days !== null && days <= 7 ? 'text-amber-600' : '')}>
            {isOverdue
              ? `${Math.abs(days ?? 0)}d overdue`
              : days === 0 ? 'Due today'
              : days !== null && days > 0 ? `${days}d left`
              : fmtDate(record.target_completion_date)}
          </span>
        )}
      </div>

      {record.hospitalName && (
        <div className="mt-2 flex items-center gap-1">
          <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: record.hospitalColor ?? '#6b7280' }} />
          <p className="text-[10px] text-gray-400 truncate">{record.hospitalName}</p>
        </div>
      )}
    </div>
  );
}

function Pipeline({ records, onDelete }: { records: OnboardingRecord[]; onDelete: (id: string) => void }) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {STAGES.map(stage => {
        const stageRecords = records.filter(r => r.stage === stage.key);
        return (
          <div key={stage.key} className={cn('flex-shrink-0 w-64 rounded-2xl border flex flex-col', stage.bg, stage.border)}>
            <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: `${stage.color}30` }}>
              <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
              <p className="text-[12px] font-bold text-gray-700 flex-1">{stage.label}</p>
              <span
                className="text-[10px] font-bold rounded-full px-2 py-0.5 bg-white"
                style={{ color: stage.color }}
              >
                {stageRecords.length}
              </span>
            </div>
            <div className="flex-1 p-3 space-y-2 min-h-[100px]">
              {stageRecords.length === 0 ? (
                <p className="text-[11px] text-gray-300 text-center py-6">Empty</p>
              ) : (
                stageRecords.map(r => (
                  <PipelineCard key={r.id} record={r} onDelete={onDelete} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Start Onboarding Modal
// ─────────────────────────────────────────────────────────────

interface StartModalProps {
  employees: Array<{ id: string; name: string; email: string; jobTitle: string | null; hasRecord: boolean }>;
  templates: OnboardingTemplate[];
  profiles:  Array<{ id: string; name: string }>;
  onClose:   () => void;
  onCreated: (r: OnboardingRecord) => void;
}

function StartOnboardingModal({ employees, templates, profiles, onClose, onCreated }: StartModalProps) {
  const [step,     setStep]     = useState<'employee' | 'template' | 'details'>('employee');
  const [selEmp,   setSelEmp]   = useState('');
  const [selTpl,   setSelTpl]   = useState('');
  const [search,   setSearch]   = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [form, setForm] = useState({
    manager_id:             '',
    hr_manager_id:          '',
    start_date:             '',
    target_completion_date: '',
    notes:                  '',
  });

  const availEmp = employees.filter(e => !e.hasRecord);
  const filtered = search
    ? availEmp.filter(e => e.name.toLowerCase().includes(search.toLowerCase()) || e.email.toLowerCase().includes(search.toLowerCase()))
    : availEmp;

  const selectedEmployee = employees.find(e => e.id === selEmp);
  const selectedTemplate = templates.find(t => t.id === selTpl);

  async function handleCreate() {
    if (!selEmp) return;
    setLoading(true); setError('');
    try {
      const res = await createOnboardingRecord({
        employee_id:            selEmp,
        template_id:            selTpl || null,
        manager_id:             form.manager_id || null,
        hr_manager_id:          form.hr_manager_id || null,
        start_date:             form.start_date || null,
        target_completion_date: form.target_completion_date || null,
        notes:                  form.notes || null,
      } satisfies CreateRecordInput);
      if (!res.success) { setError(res.error); return; }
      onCreated(res.data);
      onClose();
    } finally {
      setLoading(false);
    }
  }

  const TEMPLATE_EMOJI: Record<string, string> = {
    doctor: '🩺', csr: '📞', hr: '👥', manager: '💼', vet_assistant: '🐾', custom: '✦',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-teal-50 flex items-center justify-center">
              <UserPlus className="h-5 w-5 text-teal-500" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-gray-900">Start Onboarding</h2>
              <p className="text-[11px] text-gray-400">
                {step === 'employee' ? 'Select new hire' : step === 'template' ? 'Choose template' : 'Configure details'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-xl hover:bg-gray-100 flex items-center justify-center">
            <X className="h-4 w-4 text-gray-400" />
          </button>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center px-6 pt-4 gap-2">
          {(['employee','template','details'] as const).map((s, i) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={cn('h-6 w-6 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0',
                step === s ? 'bg-teal-500 text-white' :
                (['employee','template','details'].indexOf(step) > i ? 'bg-teal-100 text-teal-600' : 'bg-gray-100 text-gray-400')
              )}>{i + 1}</div>
              <p className={cn('text-[11px] font-medium capitalize flex-1',
                step === s ? 'text-teal-600' : 'text-gray-400')}>{s}</p>
              {i < 2 && <div className="h-px w-full bg-gray-200" />}
            </div>
          ))}
        </div>

        <div className="p-6">
          {/* Step 1: Select employee */}
          {step === 'employee' && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search employees…"
                  className="w-full h-10 pl-9 pr-4 border border-gray-200 rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-teal-300"
                />
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {filtered.length === 0 ? (
                  <p className="text-center py-8 text-[13px] text-gray-400">
                    {availEmp.length === 0 ? 'All employees already have onboarding records.' : 'No employees found.'}
                  </p>
                ) : filtered.map(emp => (
                  <button
                    key={emp.id}
                    onClick={() => setSelEmp(emp.id)}
                    className={cn(
                      'w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all',
                      selEmp === emp.id ? 'border-teal-400 bg-teal-50' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50',
                    )}
                  >
                    <Avatar name={emp.name} size={8} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-gray-900 truncate">{emp.name}</p>
                      <p className="text-[11px] text-gray-400 truncate">{emp.email}</p>
                      {emp.jobTitle && <p className="text-[10px] text-gray-300 truncate">{emp.jobTitle}</p>}
                    </div>
                    {selEmp === emp.id && <CheckCircle2 className="h-5 w-5 text-teal-500 shrink-0" />}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setStep('template')}
                disabled={!selEmp}
                className="w-full h-10 rounded-xl bg-teal-500 hover:bg-teal-600 text-white text-[13px] font-bold disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Step 2: Select template */}
          {step === 'template' && (
            <div className="space-y-3">
              <button
                onClick={() => { setSelTpl(''); setStep('details'); }}
                className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-dashed border-gray-200 hover:border-teal-300 hover:bg-teal-50/30 text-left group transition-all"
              >
                <div className="h-10 w-10 rounded-xl bg-gray-100 group-hover:bg-teal-100 flex items-center justify-center text-[20px]">✦</div>
                <div>
                  <p className="text-[13px] font-bold text-gray-900">No Template</p>
                  <p className="text-[11px] text-gray-400">Start with an empty checklist</p>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-teal-400 ml-auto" />
              </button>

              {templates.map(t => (
                <button
                  key={t.id}
                  onClick={() => { setSelTpl(t.id); setStep('details'); }}
                  className={cn(
                    'w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all',
                    selTpl === t.id ? 'border-teal-400 bg-teal-50' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50',
                  )}
                >
                  <div className="h-10 w-10 rounded-xl flex items-center justify-center text-[22px] shrink-0"
                    style={{ backgroundColor: `${ROLE_COLORS[t.role_type] ?? '#6b7280'}20` }}>
                    {TEMPLATE_EMOJI[t.role_type] ?? '📋'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-gray-900 leading-tight">{t.name}</p>
                    {t.description && <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-1">{t.description}</p>}
                    <p className="text-[10px] text-gray-300 mt-0.5">
                      {t.default_tasks.length} tasks · {t.doc_requirements.filter(d => d.required).length} required docs
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
                </button>
              ))}

              <button onClick={() => setStep('employee')}
                className="w-full h-9 rounded-xl border border-gray-200 text-[12px] text-gray-500 hover:bg-gray-50">
                ← Back
              </button>
            </div>
          )}

          {/* Step 3: Details */}
          {step === 'details' && (
            <div className="space-y-4">
              {selectedEmployee && (
                <div className="flex items-center gap-3 p-3 bg-teal-50 rounded-xl border border-teal-100">
                  <Avatar name={selectedEmployee.name} size={8} />
                  <div>
                    <p className="text-[13px] font-bold text-gray-900">{selectedEmployee.name}</p>
                    {selectedTemplate && (
                      <p className="text-[11px] text-teal-600 font-medium">{selectedTemplate.name}</p>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block mb-1">Manager</label>
                  <select value={form.manager_id} onChange={e => setForm(f => ({ ...f, manager_id: e.target.value }))}
                    className="w-full h-9 px-3 rounded-xl border border-gray-200 text-[12px] focus:outline-none focus:ring-2 focus:ring-teal-300">
                    <option value="">Not assigned</option>
                    {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block mb-1">HR Manager</label>
                  <select value={form.hr_manager_id} onChange={e => setForm(f => ({ ...f, hr_manager_id: e.target.value }))}
                    className="w-full h-9 px-3 rounded-xl border border-gray-200 text-[12px] focus:outline-none focus:ring-2 focus:ring-teal-300">
                    <option value="">Not assigned</option>
                    {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block mb-1">Start Date</label>
                  <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                    className="w-full h-9 px-3 rounded-xl border border-gray-200 text-[12px] focus:outline-none focus:ring-2 focus:ring-teal-300" />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block mb-1">Target Completion</label>
                  <input type="date" value={form.target_completion_date} onChange={e => setForm(f => ({ ...f, target_completion_date: e.target.value }))}
                    className="w-full h-9 px-3 rounded-xl border border-gray-200 text-[12px] focus:outline-none focus:ring-2 focus:ring-teal-300" />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block mb-1">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Any special notes for this onboarding…" rows={2}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-[12px] focus:outline-none focus:ring-2 focus:ring-teal-300 resize-none" />
              </div>

              {error && <p className="text-[12px] text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}

              <div className="flex gap-2">
                <button onClick={() => setStep('template')}
                  className="flex-1 h-10 rounded-xl border border-gray-200 text-[12px] text-gray-600 hover:bg-gray-50">
                  ← Back
                </button>
                <button onClick={handleCreate} disabled={loading}
                  className="flex-1 h-10 rounded-xl bg-teal-500 hover:bg-teal-600 text-white text-[13px] font-bold flex items-center justify-center gap-2 disabled:opacity-60">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                  {loading ? 'Starting…' : 'Start Onboarding'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// List View Row
// ─────────────────────────────────────────────────────────────

function ListRow({ record, onDelete }: { record: OnboardingRecord; onDelete: (id: string) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const stage = STAGES.find(s => s.key === record.stage) ?? STAGES[0];
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = record.target_completion_date && record.target_completion_date < today && record.stage !== 'completed';

  return (
    <div className={cn(
      'flex items-center gap-4 px-5 py-4 hover:bg-gray-50/60 transition-colors group border-b border-gray-50 last:border-0',
      isOverdue && 'bg-red-50/20',
    )}>
      <Avatar name={record.employeeName} size={9} color={`${stage.color}cc`} />

      <div className="flex-1 min-w-0">
        <Link href={`/onboarding/${record.employee_id}`}
          className="text-[14px] font-bold text-gray-900 hover:text-teal-600 transition-colors">
          {record.employeeName}
        </Link>
        <div className="flex items-center gap-3 mt-0.5">
          <p className="text-[11px] text-gray-400">{record.employeeJobTitle ?? 'New Employee'}</p>
          {record.hospitalName && (
            <div className="flex items-center gap-1">
              <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: record.hospitalColor ?? '#6b7280' }} />
              <p className="text-[11px] text-gray-400">{record.hospitalName}</p>
            </div>
          )}
        </div>
      </div>

      {/* Stage badge */}
      <div className="hidden md:block">
        <span
          className="text-[11px] font-bold px-2.5 py-1 rounded-full border"
          style={{ backgroundColor: `${stage.color}15`, color: stage.color, borderColor: `${stage.color}30` }}
        >
          {stage.label}
        </span>
      </div>

      {/* Progress */}
      <div className="hidden lg:flex items-center gap-2 w-32">
        <div className="flex-1">
          <ProgressBar pct={record.progress_pct} color={stage.color} />
        </div>
        <p className="text-[11px] text-gray-500 shrink-0 w-8 text-right">{record.progress_pct}%</p>
      </div>

      {/* Due date */}
      <div className="hidden xl:block w-24 text-right">
        {record.target_completion_date && (
          <p className={cn('text-[11px]', isOverdue ? 'text-red-600 font-semibold' : 'text-gray-400')}>
            {fmtDate(record.target_completion_date)}
          </p>
        )}
      </div>

      {/* Manager */}
      {record.managerName && (
        <div className="hidden xl:flex items-center gap-1.5">
          <User className="h-3.5 w-3.5 text-gray-300" />
          <p className="text-[11px] text-gray-400">{record.managerName}</p>
        </div>
      )}

      <Link
        href={`/onboarding/${record.employee_id}`}
        className="h-8 px-3 rounded-xl flex items-center gap-1.5 bg-gray-50 hover:bg-teal-50 text-gray-500 hover:text-teal-600 text-[12px] font-medium transition-colors shrink-0 border border-gray-100"
      >
        View <ChevronRight className="h-3.5 w-3.5" />
      </Link>

      <div className="relative">
        <button onClick={() => setMenuOpen(m => !m)}
          className="h-8 w-8 rounded-xl hover:bg-gray-100 flex items-center justify-center opacity-0 group-hover:opacity-100">
          <MoreHorizontal className="h-4 w-4 text-gray-400" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-9 z-20 bg-white rounded-xl shadow-lg border border-gray-100 py-1 min-w-[130px]">
            <button onClick={() => { onDelete(record.id); setMenuOpen(false); }}
              className="flex items-center gap-2 px-3 py-2 text-[12px] text-red-600 hover:bg-red-50 w-full">
              <Trash2 className="h-3.5 w-3.5" /> Remove
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Dashboard Root
// ─────────────────────────────────────────────────────────────

type DashView = 'pipeline' | 'list' | 'templates';

interface OnboardingDashboardProps {
  stats:               OnboardingStats | null;
  records:             OnboardingRecord[];
  templates:           OnboardingTemplate[];
  employees:           Array<{ id: string; name: string; email: string; jobTitle: string | null; hasRecord: boolean }>;
  profiles:            Array<{ id: string; name: string }>;
  userId:              string;
  isAdmin:             boolean;
  canStartOnboarding:  boolean;
}

export function OnboardingDashboard({
  stats, records: initial, templates, employees, profiles, userId, isAdmin, canStartOnboarding,
}: OnboardingDashboardProps) {
  const router = useRouter();
  const [records,     setRecords]     = useState<OnboardingRecord[]>(initial);
  const [view,        setView]        = useState<DashView>('pipeline');
  const [showCreate,  setShowCreate]  = useState(false);
  const [search,      setSearch]      = useState('');
  const [filterStage, setFilterStage] = useState('');
  const [live,        setLive]        = useState(false);

  useEffect(() => { setRecords(initial); }, [initial]);

  // Realtime
  useEffect(() => {
    const sb = createSupabaseBrowserClient();
    const ch = sb.channel('onboarding-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'onboarding_records' }, () => router.refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'onboarding_tasks' },   () => router.refresh())
      .subscribe(s => setLive(s === 'SUBSCRIBED'));
    return () => { sb.removeChannel(ch); };
  }, [router]);

  const filtered = useMemo(() => {
    let list = records;
    if (filterStage) list = list.filter(r => r.stage === filterStage);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(r =>
        (r.employeeName ?? '').toLowerCase().includes(s) ||
        (r.employeeJobTitle ?? '').toLowerCase().includes(s) ||
        (r.hospitalName ?? '').toLowerCase().includes(s)
      );
    }
    return list;
  }, [records, filterStage, search]);

  async function handleDelete(id: string) {
    if (!confirm('Remove this onboarding record? This cannot be undone.')) return;
    await deleteOnboardingRecord(id);
    setRecords(rs => rs.filter(r => r.id !== id));
  }

  const computedStats = stats ?? {
    total:        records.length,
    active:       records.filter(r => r.status === 'active' && r.stage !== 'completed').length,
    completed:    records.filter(r => r.stage === 'completed').length,
    pendingReview:records.filter(r => r.stage === 'manager_review').length,
    overdue:      0,
    byStage:      {} as Record<OnboardingStage, number>,
  };

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Header */}
      <div className="rounded-2xl bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 text-white px-6 py-6 shadow-xl">
        <div className="flex items-start justify-between flex-wrap gap-4 mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="h-8 w-8 rounded-xl bg-teal-500 flex items-center justify-center">
                <UserPlus className="h-4.5 w-4.5 text-white" />
              </div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Employee Onboarding</p>
              <div className="flex items-center gap-1.5 bg-white/10 rounded-full px-2.5 py-1">
                <div className={cn('h-2 w-2 rounded-full', live ? 'bg-green-400 animate-pulse' : 'bg-slate-500')} />
                <p className="text-[10px] text-slate-300 font-semibold">{live ? 'Live' : 'Connecting'}</p>
              </div>
            </div>
            <h1 className="text-[24px] font-bold text-white tracking-tight">Onboarding</h1>
            <p className="text-[12px] text-slate-400 mt-0.5">New hire pipeline · Trainual-powered workflows</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link href="/ai-assistant"
              className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-slate-300 text-[12px] font-medium transition-colors">
              <Sparkles className="h-3.5 w-3.5" /> Ask AI
            </Link>
            {canStartOnboarding && (
              <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-teal-500 hover:bg-teal-400 text-white text-[13px] font-bold transition-colors">
                <Plus className="h-4 w-4" /> Start Onboarding
              </button>
            )}
          </div>
        </div>

        {/* Stage pipeline counts */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {STAGES.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2 shrink-0">
              <div
                onClick={() => setFilterStage(f => f === s.key ? '' : s.key)}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-full border cursor-pointer transition-all',
                  filterStage === s.key ? 'border-white/40 bg-white/20' : 'border-white/10 bg-white/5 hover:bg-white/10',
                )}
              >
                <div className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                <p className="text-[11px] text-white font-medium">{s.label}</p>
                <span className="text-[10px] font-bold text-white/60">{(stats?.byStage ?? {})[s.key] ?? records.filter(r => r.stage === s.key).length}</span>
              </div>
              {i < STAGES.length - 1 && <div className="h-px w-4 bg-white/20 shrink-0" />}
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <StatsBar stats={computedStats} />

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search employees…"
            className="w-full h-10 pl-9 pr-4 border border-gray-200 rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-teal-300 bg-white shadow-sm" />
        </div>
        <select value={filterStage} onChange={e => setFilterStage(e.target.value)}
          className="h-10 px-3 border border-gray-200 rounded-xl text-[13px] bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-300">
          <option value="">All Stages</option>
          {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <div className="flex items-center bg-white border border-gray-200 rounded-xl p-0.5 shadow-sm">
          <button onClick={() => setView('pipeline')}
            className={cn('h-8 px-3 rounded-lg text-[12px] font-medium transition-all',
              view === 'pipeline' ? 'bg-slate-900 text-white' : 'text-gray-500 hover:text-gray-800')}>
            Pipeline
          </button>
          <button onClick={() => setView('list')}
            className={cn('h-8 px-3 rounded-lg text-[12px] font-medium transition-all',
              view === 'list' ? 'bg-slate-900 text-white' : 'text-gray-500 hover:text-gray-800')}>
            List
          </button>
          {isAdmin && (
            <button onClick={() => setView('templates')}
              className={cn('h-8 px-3 rounded-lg text-[12px] font-medium transition-all',
                view === 'templates' ? 'bg-slate-900 text-white' : 'text-gray-500 hover:text-gray-800')}>
              Templates
            </button>
          )}
        </div>
        <div className="h-10 px-3 flex items-center rounded-xl border border-gray-200 bg-white text-[13px] text-gray-500 shadow-sm">
          {filtered.length} shown
        </div>
      </div>

      {/* Content */}
      {view === 'templates' ? (
        <TemplateManager templates={templates} onTemplatesChange={() => router.refresh()} />
      ) : filtered.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <UserPlus className="h-16 w-16 text-gray-200 mx-auto mb-4" />
          <p className="text-[16px] font-semibold text-gray-600 mb-2">No onboarding records found</p>
          <p className="text-[13px] text-gray-400 mb-6">Start onboarding a new employee to get started.</p>
          {canStartOnboarding && (
            <button onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 h-10 px-6 rounded-xl bg-teal-500 hover:bg-teal-600 text-white text-[13px] font-bold transition-colors">
              <Plus className="h-4 w-4" /> Start Onboarding
            </button>
          )}
        </div>
      ) : view === 'pipeline' ? (
        <Pipeline records={filtered} onDelete={handleDelete} />
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {filtered.map(r => <ListRow key={r.id} record={r} onDelete={handleDelete} />)}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <StartOnboardingModal
          employees={employees}
          templates={templates}
          profiles={profiles}
          onClose={() => setShowCreate(false)}
          onCreated={r => {
            setRecords(rs => [r, ...rs]);
            router.push(`/onboarding/${r.employee_id}`);
          }}
        />
      )}
    </div>
  );
}
