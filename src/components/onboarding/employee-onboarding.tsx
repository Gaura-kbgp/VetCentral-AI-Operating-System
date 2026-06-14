'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, CheckCircle2, Clock, FileText, GraduationCap,
  Calendar, Activity, Users, Plus, Loader2, CheckSquare,
  SquareDashed, Shield, Laptop, TrendingUp, Trash2,
  Building2, ChevronRight, ExternalLink, AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  getOnboardingTasks, getOnboardingDocuments, getOnboardingMeetings, getOnboardingActivity,
  createOnboardingTask, updateOnboardingTask, deleteOnboardingTask,
  addDocument, updateDocumentStatus,
  createMeetingWithCalendarEvent, updateMeetingStatus,
  updateOnboardingRecord,
} from '@/lib/actions/onboarding';
import type {
  OnboardingRecord, OnboardingTask, OnboardingDocument, OnboardingMeeting,
  OnboardingActivity, TaskStatus, TaskType, TaskCategory, OnboardingStage,
  DocType, MeetingType, MeetingStatus, DocStatus,
} from '@/lib/actions/onboarding';
import { STAGES } from './onboarding-dashboard';
import { DocumentUploadZone } from './document-upload-zone';
import { ComplianceTab } from './compliance-tab';

// ── Types & config ─────────────────────────────────────────────────────────────

type DetailTab = 'overview' | 'checklist' | 'documents' | 'training' | 'meetings' | 'compliance' | 'activity';

const TASK_TYPE_CONFIG: Record<TaskType, { label: string; icon: typeof CheckSquare; color: string }> = {
  action:     { label: 'Action',      icon: CheckSquare,   color: '#64748b' },
  document:   { label: 'Document',    icon: FileText,      color: '#2563eb' },
  training:   { label: 'Training',    icon: GraduationCap, color: '#7c3aed' },
  meeting:    { label: 'Meeting',     icon: Calendar,      color: '#db2777' },
  hr:         { label: 'HR',          icon: Users,         color: '#0d9488' },
  it:         { label: 'IT Setup',    icon: Laptop,        color: '#d97706' },
  compliance: { label: 'Compliance',  icon: Shield,        color: '#dc2626' },
};

const DOC_TYPE_LABELS: Record<DocType, string> = {
  contract:          'Contract',
  certification:     'Certification',
  policy:            'Policy',
  id:                'ID Document',
  tax_form:          'Tax Form',
  emergency_contact: 'Emergency Contact',
  other:             'Other',
};

const DOC_STATUS_CFG: Record<DocStatus, { cls: string; label: string }> = {
  pending:  { cls: 'bg-slate-100 text-slate-600',   label: 'Pending'  },
  uploaded: { cls: 'bg-blue-50 text-blue-700',      label: 'Uploaded' },
  verified: { cls: 'bg-green-50 text-green-700',    label: 'Verified' },
  rejected: { cls: 'bg-red-50 text-red-600',        label: 'Rejected' },
};

const MEETING_TYPE_LABELS: Record<MeetingType, string> = {
  orientation:    'Orientation',
  one_on_one:     '1:1 Meeting',
  team_intro:     'Team Intro',
  manager_review: 'Manager Review',
  training:       'Training Session',
  it_setup:       'IT Setup',
  hr_review:      'HR Review',
};

const MEETING_STATUS_CFG: Record<MeetingStatus, { cls: string; label: string }> = {
  scheduled:   { cls: 'bg-blue-50 text-blue-700',   label: 'Scheduled'   },
  completed:   { cls: 'bg-green-50 text-green-700', label: 'Completed'   },
  cancelled:   { cls: 'bg-red-50 text-red-600',     label: 'Cancelled'   },
  rescheduled: { cls: 'bg-amber-50 text-amber-700', label: 'Rescheduled' },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60)    return 'just now';
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
function initials(name?: string | null) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// ── Shared UI ─────────────────────────────────────────────────────────────────

function SectionCard({ title, action, children }: { title?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {(title || action) && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          {title && <p className="text-sm font-semibold text-slate-800">{title}</p>}
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

function EmptyState({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon className="w-10 h-10 text-slate-200 mb-3" />
      <p className="text-sm text-slate-400">{label}</p>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">{children}</label>;
}

function Input({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input className={cn('w-full h-9 px-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white', className)} {...props} />
  );
}

function Select({ className = '', children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn('w-full h-9 px-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white', className)} {...props}>
      {children}
    </select>
  );
}

// ── Overview ──────────────────────────────────────────────────────────────────

function OverviewTab({ record, isAdmin, onStageChange }: {
  record: OnboardingRecord;
  isAdmin: boolean;
  onStageChange: (s: OnboardingStage) => void;
}) {
  const [advancing, setAdvancing] = useState(false);
  const stage      = STAGES.find(s => s.key === record.stage) ?? STAGES[0];
  const currentIdx = STAGES.findIndex(s => s.key === record.stage);
  const nextStage  = STAGES[currentIdx + 1];
  const today      = new Date().toISOString().slice(0, 10);
  const isOverdue  = record.target_completion_date && record.target_completion_date < today && record.stage !== 'completed';
  const daysLeft   = record.target_completion_date
    ? Math.ceil((new Date(record.target_completion_date).getTime() - Date.now()) / 86_400_000) : null;

  // Compute accurate displayed progress:
  // If tasks exist, use task-based completion. Otherwise derive from stage position.
  const STAGE_KEYS = ['pre_hire','documents','orientation','training','manager_review','completed'];
  const hasTasks   = (record.taskCount ?? 0) > 0;
  const stagePct   = Math.round((currentIdx / (STAGE_KEYS.length - 1)) * 100);
  const displayPct = hasTasks ? record.progress_pct : Math.max(record.progress_pct, stagePct);

  async function advance() {
    if (!nextStage || !isAdmin) return;
    setAdvancing(true);
    const res = await updateOnboardingRecord(record.id, { stage: nextStage.key });
    if (res.success) {
      // Update parent with the freshly fetched record (includes new progress_pct)
      onStageChange(nextStage.key as OnboardingStage);
    }
    setAdvancing(false);
  }

  return (
    <div className="space-y-4">
      {/* Pipeline */}
      <SectionCard title="Onboarding Pipeline" action={
        isAdmin && nextStage ? (
          <button onClick={advance} disabled={advancing}
            className="flex items-center gap-1.5 h-8 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors disabled:opacity-60">
            {advancing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5" />}
            Move to {nextStage.label}
          </button>
        ) : null
      }>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {STAGES.map((s, i) => {
            const isActive   = s.key === record.stage;
            const isComplete = i < currentIdx;
            return (
              <div key={s.key} className="flex items-center gap-1.5 shrink-0">
                <div className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-all',
                  isComplete ? 'bg-green-50 border-green-200 text-green-700' :
                  isActive   ? 'border-transparent text-white' :
                               'bg-slate-50 border-slate-200 text-slate-400',
                )}
                  style={isActive ? { background: s.color, borderColor: s.color } : {}}>
                  {isComplete
                    ? <CheckCircle2 className="w-3.5 h-3.5" />
                    : <div className="w-2 h-2 rounded-full" style={{ background: isActive ? '#fff' : s.color }} />}
                  {s.label}
                </div>
                {i < STAGES.length - 1 && (
                  <div className={cn('h-px w-4 shrink-0', isComplete ? 'bg-green-300' : 'bg-slate-200')} />
                )}
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Progress', value: `${displayPct}%`, icon: TrendingUp, color: '#2563eb', bg: 'bg-blue-50' },
          { label: 'Tasks',    value: `${record.completedCount ?? 0}/${record.taskCount ?? 0}`, icon: CheckSquare, color: '#7c3aed', bg: 'bg-violet-50' },
          { label: 'Stage',    value: stage.label, icon: Shield, color: stage.color, bg: 'bg-slate-50' },
          { label: 'Due',      value: daysLeft !== null ? (isOverdue ? 'Overdue' : `${daysLeft}d left`) : '—',
            icon: Clock, color: isOverdue ? '#dc2626' : '#64748b', bg: isOverdue ? 'bg-red-50' : 'bg-slate-50' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className={cn('rounded-2xl border border-slate-200 p-4 flex items-center gap-3', bg)}>
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm shrink-0">
              <Icon className="w-5 h-5" style={{ color }} />
            </div>
            <div>
              <p className="text-xl font-bold text-slate-800 leading-none">{value}</p>
              <p className="text-xs text-slate-500 mt-1">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Progress + Details */}
      <SectionCard title="Progress Details">
        <div className="mb-4">
          <div className="flex justify-between text-xs text-slate-500 mb-1.5">
            <span>Completion</span>
            <span className="font-semibold text-slate-700">{displayPct}%</span>
          </div>
          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${displayPct}%`, background: stage.color }} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
          {record.start_date && (
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Start Date</p>
              <p className="font-semibold text-slate-700">{fmtDate(record.start_date)}</p>
            </div>
          )}
          {record.target_completion_date && (
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Target Completion</p>
              <p className={cn('font-semibold', isOverdue ? 'text-red-600' : 'text-slate-700')}>
                {fmtDate(record.target_completion_date)}
              </p>
            </div>
          )}
          {record.managerName && (
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Manager</p>
              <p className="font-semibold text-slate-700">{record.managerName}</p>
            </div>
          )}
          {record.hrManagerName && (
            <div>
              <p className="text-xs text-slate-400 mb-0.5">HR Manager</p>
              <p className="font-semibold text-slate-700">{record.hrManagerName}</p>
            </div>
          )}
        </div>
        {record.notes && (
          <div className="mt-4 p-3 bg-amber-50 rounded-xl border border-amber-200">
            <p className="text-xs font-semibold text-amber-700 mb-1">Notes</p>
            <p className="text-sm text-amber-800 leading-relaxed">{record.notes}</p>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ── Checklist ─────────────────────────────────────────────────────────────────

function ChecklistTab({ record, profiles, isAdmin }: {
  record: OnboardingRecord;
  profiles: Array<{ id: string; name: string }>;
  isAdmin: boolean;
}) {
  const [tasks,      setTasks]      = useState<OnboardingTask[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [adding,     setAdding]     = useState(false);
  const [newTitle,   setNewTitle]   = useState('');
  const [newType,    setNewType]    = useState<TaskType>('action');
  const [newCat,     setNewCat]     = useState<TaskCategory>('required');
  const [newStage,   setNewStage]   = useState<OnboardingStage>('pre_hire');
  const [newDue,     setNewDue]     = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getOnboardingTasks(record.id).then(r => { if (r.success) setTasks(r.data); setLoading(false); });
  }, [record.id]);

  const grouped = useMemo(() => {
    const map = new Map<OnboardingStage, OnboardingTask[]>();
    STAGES.forEach(s => {
      const st = tasks.filter(t => t.stage === s.key);
      if (st.length > 0) map.set(s.key, st);
    });
    return map;
  }, [tasks]);

  async function toggleTask(t: OnboardingTask) {
    const next: TaskStatus = t.status === 'completed' ? 'pending' : 'completed';
    const res = await updateOnboardingTask(t.id, { status: next });
    if (res.success) setTasks(ts => ts.map(x => x.id === t.id ? res.data : x));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setSubmitting(true);
    const res = await createOnboardingTask({
      record_id: record.id, title: newTitle.trim(),
      category: newCat, task_type: newType, stage: newStage, due_date: newDue || null,
    });
    if (res.success) { setTasks(ts => [...ts, res.data]); setNewTitle(''); setAdding(false); }
    setSubmitting(false);
  }

  async function handleDelete(id: string) {
    await deleteOnboardingTask(id);
    setTasks(ts => ts.filter(t => t.id !== id));
  }

  const done  = tasks.filter(t => t.status === 'completed').length;
  const total = tasks.length;

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center gap-3 flex-wrap">
        {total > 0 && (
          <div className="flex items-center gap-2 flex-1 min-w-40">
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${(done / total) * 100}%` }} />
            </div>
            <p className="text-xs font-bold text-slate-700 shrink-0">{done}/{total}</p>
          </div>
        )}
        {isAdmin && (
          <button onClick={() => setAdding(a => !a)}
            className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold ml-auto">
            <Plus className="w-4 h-4" /> Add Task
          </button>
        )}
      </div>

      {/* Add form */}
      {isAdmin && adding && (
        <form onSubmit={handleCreate}
          className="bg-white border-2 border-blue-200 rounded-2xl p-5 space-y-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-800">New Task</p>
          <Input value={newTitle} onChange={e => setNewTitle(e.target.value)}
            placeholder="Task title…" required autoFocus />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><FieldLabel>Type</FieldLabel>
              <Select value={newType} onChange={e => setNewType(e.target.value as TaskType)}>
                {Object.entries(TASK_TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </Select>
            </div>
            <div><FieldLabel>Category</FieldLabel>
              <Select value={newCat} onChange={e => setNewCat(e.target.value as TaskCategory)}>
                <option value="required">Required</option>
                <option value="optional">Optional</option>
              </Select>
            </div>
            <div><FieldLabel>Stage</FieldLabel>
              <Select value={newStage} onChange={e => setNewStage(e.target.value as OnboardingStage)}>
                {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </Select>
            </div>
            <div><FieldLabel>Due Date</FieldLabel>
              <Input type="date" value={newDue} onChange={e => setNewDue(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setAdding(false)}
              className="flex-1 h-9 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={submitting}
              className="flex-1 h-9 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 flex items-center justify-center gap-1.5 disabled:opacity-60">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Add Task
            </button>
          </div>
        </form>
      )}

      {loading ? <Spinner /> : grouped.size === 0 ? (
        <SectionCard><EmptyState icon={CheckSquare} label="No tasks yet" /></SectionCard>
      ) : (
        Array.from(grouped.entries()).map(([stageKey, stageTasks]) => {
          const stage    = STAGES.find(s => s.key === stageKey)!;
          const stageDone = stageTasks.filter(t => t.status === 'completed').length;
          return (
            <div key={stageKey} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100"
                style={{ background: `${stage.color}08` }}>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: stage.color }} />
                  <p className="text-sm font-semibold" style={{ color: stage.color }}>{stage.label}</p>
                </div>
                <span className="text-xs font-semibold text-slate-500">{stageDone}/{stageTasks.length}</span>
              </div>
              <div className="divide-y divide-slate-50">
                {stageTasks.map(t => {
                  const tc     = TASK_TYPE_CONFIG[t.task_type] ?? TASK_TYPE_CONFIG.action;
                  const today  = new Date().toISOString().slice(0, 10);
                  const overdue = t.due_date && t.due_date < today && t.status !== 'completed';
                  return (
                    <div key={t.id}
                      className={cn('flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors group',
                        t.status === 'completed' && 'opacity-60')}>
                      <button onClick={() => toggleTask(t)} className="shrink-0">
                        {t.status === 'completed'
                          ? <CheckCircle2 className="w-5 h-5 text-green-500" />
                          : <SquareDashed className="w-5 h-5 text-slate-300 hover:text-blue-400 transition-colors" />}
                      </button>
                      <tc.icon className="w-4 h-4 shrink-0" style={{ color: tc.color }} />
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-sm font-medium text-slate-700 truncate',
                          t.status === 'completed' && 'line-through text-slate-400')}>
                          {t.title}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium',
                          t.category === 'required' ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500')}>
                          {t.category}
                        </span>
                        {t.due_date && (
                          <span className={cn('text-xs hidden md:block',
                            overdue ? 'text-red-600 font-semibold' : 'text-slate-400')}>
                            {fmtDate(t.due_date)}
                          </span>
                        )}
                        {isAdmin && (
                          <button onClick={() => handleDelete(t.id)}
                            className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ── Documents ─────────────────────────────────────────────────────────────────

function DocumentsTab({ record, isAdmin, isOwnRecord }: {
  record: OnboardingRecord;
  isAdmin: boolean;
  isOwnRecord: boolean;
}) {
  const [docs,    setDocs]    = useState<OnboardingDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding,  setAdding]  = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<DocType>('contract');
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    getOnboardingDocuments(record.id).then(r => { if (r.success) setDocs(r.data); setLoading(false); });
  }, [record.id]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    const res = await addDocument(record.id, record.employee_id, { doc_type: newType, name: newName.trim() });
    if (res.success) { setDocs(d => [...d, res.data]); setNewName(''); setAdding(false); }
    setSaving(false);
  }

  const refresh = () => getOnboardingDocuments(record.id).then(r => { if (r.success) setDocs(r.data); });
  const verified = docs.filter(d => d.status === 'verified').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <span className="text-xs px-3 py-1.5 bg-slate-100 rounded-full text-slate-600 font-medium">{docs.length} documents</span>
          <span className="text-xs px-3 py-1.5 bg-green-50 rounded-full text-green-700 font-medium">{verified}/{docs.length} verified</span>
        </div>
        {isAdmin && (
          <button onClick={() => setAdding(a => !a)}
            className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold">
            <Plus className="w-4 h-4" /> Add Requirement
          </button>
        )}
      </div>

      {isAdmin && adding && (
        <form onSubmit={handleAdd}
          className="bg-white border-2 border-blue-200 rounded-2xl p-5 space-y-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-800">Add Document Requirement</p>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Type</FieldLabel>
              <Select value={newType} onChange={e => setNewType(e.target.value as DocType)}>
                {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
            <div><FieldLabel>Name</FieldLabel>
              <Input value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Employment Contract" required />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setAdding(false)}
              className="flex-1 h-9 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 h-9 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 flex items-center justify-center gap-2 disabled:opacity-60">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Add
            </button>
          </div>
        </form>
      )}

      {loading ? <Spinner /> : docs.length === 0 ? (
        <SectionCard><EmptyState icon={FileText} label="No documents required" /></SectionCard>
      ) : (
        <div className="space-y-3">
          {docs.map(d => (
            <DocumentUploadZone
              key={d.id}
              docId={d.id}
              docName={d.name}
              docType={DOC_TYPE_LABELS[d.doc_type]}
              status={d.status}
              currentUrl={d.public_url}
              ocrText={d.ocr_text}
              rejectionReason={d.rejection_reason}
              isEmployee={isOwnRecord}
              recordId={record.id}
              onUploadSuccess={refresh}
              onDeleteSuccess={refresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Training ──────────────────────────────────────────────────────────────────

function TrainingTab({ record }: { record: OnboardingRecord }) {
  return (
    <SectionCard>
      <div className="flex items-start gap-4 p-1">
        <div className="w-11 h-11 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
          <GraduationCap className="w-5 h-5 text-violet-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800 mb-1">Training Academy</p>
          <p className="text-sm text-slate-500 leading-relaxed mb-4">
            Courses assigned during onboarding are tracked in the Training Academy.
            View progress and completion for {record.employeeName} there.
          </p>
          <Link href={`/training?employee=${record.employee_id}`}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-colors">
            <ExternalLink className="w-4 h-4" /> Open Training Academy
          </Link>
        </div>
      </div>
    </SectionCard>
  );
}

// ── Meetings ──────────────────────────────────────────────────────────────────

function MeetingsTab({ record, isAdmin }: { record: OnboardingRecord; isAdmin: boolean }) {
  const [meetings, setMeetings] = useState<OnboardingMeeting[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [adding,   setAdding]   = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [form, setForm] = useState({
    title: '', meeting_type: 'orientation' as MeetingType,
    scheduled_at: '', duration_mins: 60, location: '', addToCalendar: false,
  });

  useEffect(() => {
    getOnboardingMeetings(record.id).then(r => { if (r.success) setMeetings(r.data); setLoading(false); });
  }, [record.id]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await createMeetingWithCalendarEvent({
      record_id: record.id, title: form.title, meeting_type: form.meeting_type,
      scheduled_at: form.scheduled_at || null, duration_mins: form.duration_mins,
      location: form.location || null, meeting_url: null, notes: null,
      addToCalendar: form.addToCalendar, hospitalId: record.hospital_id ?? undefined,
    });
    if (res.success) { setMeetings(m => [...m, res.data]); setForm(f => ({ ...f, title: '', location: '' })); setAdding(false); }
    setSaving(false);
  }

  async function handleStatusChange(id: string, status: MeetingStatus) {
    await updateMeetingStatus(id, status);
    setMeetings(ms => ms.map(m => m.id === id ? { ...m, status } : m));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{meetings.length} meeting{meetings.length !== 1 ? 's' : ''}</p>
        {isAdmin && (
          <button onClick={() => setAdding(a => !a)}
            className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold">
            <Plus className="w-4 h-4" /> Schedule Meeting
          </button>
        )}
      </div>

      {isAdmin && adding && (
        <form onSubmit={handleCreate}
          className="bg-white border-2 border-blue-200 rounded-2xl p-5 space-y-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-800">Schedule Meeting</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><FieldLabel>Title</FieldLabel>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Welcome & Orientation" required />
            </div>
            <div><FieldLabel>Type</FieldLabel>
              <Select value={form.meeting_type} onChange={e => setForm(f => ({ ...f, meeting_type: e.target.value as MeetingType }))}>
                {Object.entries(MEETING_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
            <div><FieldLabel>Duration (min)</FieldLabel>
              <Input type="number" value={form.duration_mins} min={15} step={15}
                onChange={e => setForm(f => ({ ...f, duration_mins: +e.target.value }))} />
            </div>
            <div><FieldLabel>Date & Time</FieldLabel>
              <Input type="datetime-local" value={form.scheduled_at}
                onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))} />
            </div>
            <div><FieldLabel>Location</FieldLabel>
              <Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                placeholder="Room / Zoom link" />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.addToCalendar}
              onChange={e => setForm(f => ({ ...f, addToCalendar: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
            <span className="text-sm text-slate-600">Add to Master Calendar</span>
          </label>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setAdding(false)}
              className="flex-1 h-9 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 h-9 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 flex items-center justify-center gap-2 disabled:opacity-60">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Schedule
            </button>
          </div>
        </form>
      )}

      {loading ? <Spinner /> : meetings.length === 0 ? (
        <SectionCard><EmptyState icon={Calendar} label="No meetings scheduled" /></SectionCard>
      ) : (
        <div className="space-y-3">
          {meetings.map(m => {
            const sc = MEETING_STATUS_CFG[m.status];
            return (
              <div key={m.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                      <Calendar className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{m.title}</p>
                      <p className="text-xs text-slate-400">{MEETING_TYPE_LABELS[m.meeting_type]}</p>
                    </div>
                  </div>
                  <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full', sc.cls)}>{sc.label}</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  {m.scheduled_at && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{fmtDateTime(m.scheduled_at)}</span>}
                  <span>{m.duration_mins} min</span>
                  {m.location && <span>{m.location}</span>}
                  {m.calendar_event_id && (
                    <Link href="/calendar" className="flex items-center gap-1 text-blue-500 hover:underline">
                      <Calendar className="w-3 h-3" /> On calendar
                    </Link>
                  )}
                </div>
                {isAdmin && m.status === 'scheduled' && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
                    <button onClick={() => handleStatusChange(m.id, 'completed')}
                      className="h-7 px-3 rounded-lg bg-green-50 text-green-700 text-xs font-semibold hover:bg-green-100">
                      Mark Complete
                    </button>
                    <button onClick={() => handleStatusChange(m.id, 'cancelled')}
                      className="h-7 px-3 rounded-lg bg-red-50 text-red-600 text-xs font-semibold hover:bg-red-100">
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Activity ──────────────────────────────────────────────────────────────────

function ActivityTab({ record }: { record: OnboardingRecord }) {
  const [items,   setItems]   = useState<OnboardingActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getOnboardingActivity(record.id).then(r => { if (r.success) setItems(r.data); setLoading(false); });
  }, [record.id]);

  if (loading) return <Spinner />;

  return (
    <SectionCard title="Recent Activity">
      {items.length === 0 ? (
        <EmptyState icon={Activity} label="No activity yet" />
      ) : (
        <div className="space-y-0 divide-y divide-slate-50 -mx-5 -my-5">
          {items.map(item => (
            <div key={item.id} className="flex items-start gap-3 px-5 py-4">
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                <Activity className="w-3.5 h-3.5 text-slate-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-700">
                  <span className="font-semibold">{item.userName ?? 'System'}</span>{' '}{item.action}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">{fmtAgo(item.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ── Root component ────────────────────────────────────────────────────────────

interface EmployeeOnboardingProps {
  record:       OnboardingRecord;
  profiles:     Array<{ id: string; name: string }>;
  userId:       string;
  isAdmin:      boolean;
  initialTab:   DetailTab;
  isOwnRecord?: boolean;
}

const TABS: Array<{ id: DetailTab; label: string; icon: React.ElementType }> = [
  { id: 'overview',    label: 'Overview',    icon: TrendingUp    },
  { id: 'checklist',   label: 'Checklist',   icon: CheckSquare   },
  { id: 'documents',   label: 'Documents',   icon: FileText      },
  { id: 'training',    label: 'Training',    icon: GraduationCap },
  { id: 'meetings',    label: 'Meetings',    icon: Calendar      },
  { id: 'compliance',  label: 'Compliance',  icon: Shield        },
  { id: 'activity',    label: 'Activity',    icon: Activity      },
];

export function EmployeeOnboarding({
  record: initial, profiles, userId, isAdmin, initialTab, isOwnRecord = false,
}: EmployeeOnboardingProps) {
  const router  = useRouter();
  const [record, setRecord] = useState<OnboardingRecord>(initial);
  const [tab,    setTab]    = useState<DetailTab>(initialTab);
  const [live,   setLive]   = useState(false);

  useEffect(() => { setRecord(initial); }, [initial]);

  useEffect(() => {
    const sb = createSupabaseBrowserClient();
    const ch = sb.channel(`onboarding-${record.id}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'onboarding_records', filter: `id=eq.${record.id}` },
        (payload) => {
          // Update local state immediately, then sync server component
          const updated = payload.new as Partial<OnboardingRecord>;
          setRecord(r => ({
            ...r,
            stage:        (updated.stage        ?? r.stage)        as OnboardingStage,
            progress_pct: updated.progress_pct  ?? r.progress_pct,
            status:       updated.status        ?? r.status,
            notes:        updated.notes         ?? r.notes,
          }));
          router.refresh();
        })
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'onboarding_tasks', filter: `record_id=eq.${record.id}` },
        () => router.refresh())
      .subscribe(s => setLive(s === 'SUBSCRIBED'));
    return () => { sb.removeChannel(ch); };
  }, [record.id, router]);

  const stage     = STAGES.find(s => s.key === record.stage) ?? STAGES[0];
  const today     = new Date().toISOString().slice(0, 10);
  const overdue   = record.target_completion_date && record.target_completion_date < today && record.stage !== 'completed';
  // Accurate progress for header bar: stage-based when no tasks
  const _STAGE_KEYS = ['pre_hire','documents','orientation','training','manager_review','completed'];
  const _stageIdx   = _STAGE_KEYS.indexOf(record.stage);
  const _stagePct   = _stageIdx < 0 ? 0 : Math.round((_stageIdx / (_STAGE_KEYS.length - 1)) * 100);
  const headerPct   = (record.taskCount ?? 0) > 0 ? record.progress_pct : Math.max(record.progress_pct, _stagePct);

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-8">

      {/* ── Employee header ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Stage color accent bar */}
        <div className="h-1 w-full" style={{ background: stage.color }} />

        <div className="px-6 py-5 flex items-start gap-4">
          {/* Back button */}
          <Link href="/onboarding"
            className="mt-1 w-8 h-8 rounded-xl border border-slate-200 hover:bg-slate-50 flex items-center justify-center shrink-0 transition-colors">
            <ArrowLeft className="w-4 h-4 text-slate-500" />
          </Link>

          {/* Avatar */}
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 text-2xl font-bold text-white"
            style={{ background: stage.color }}>
            {initials(record.employeeName)}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-slate-900">{record.employeeName}</h1>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full border"
                style={{ background: `${stage.color}15`, color: stage.color, borderColor: `${stage.color}30` }}>
                {stage.label}
              </span>
              {overdue && (
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-100 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Overdue
                </span>
              )}
              <div className="flex items-center gap-1.5 ml-auto">
                <div className={cn('w-1.5 h-1.5 rounded-full', live ? 'bg-green-400 animate-pulse' : 'bg-slate-300')} />
                <span className="text-xs text-slate-400">{live ? 'Live' : 'Connecting…'}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mb-3">
              {record.employeeJobTitle && <span className="font-medium text-slate-600">{record.employeeJobTitle}</span>}
              {record.employeeEmail    && <span>{record.employeeEmail}</span>}
              {record.hospitalName     && (
                <span className="flex items-center gap-1">
                  <Building2 className="w-3 h-3" />{record.hospitalName}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 max-w-sm">
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${headerPct}%`, background: stage.color }} />
              </div>
              <span className="text-xs font-semibold text-slate-600 shrink-0">{headerPct}% complete</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-2xl p-1.5 shadow-sm overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 h-8 px-3.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all',
                tab === t.id ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100',
              )}>
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:block">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Tab content ── */}
      {tab === 'overview'   && <OverviewTab record={record} isAdmin={isAdmin} onStageChange={s => {
        const STAGE_KEYS = ['pre_hire','documents','orientation','training','manager_review','completed'];
        const idx = STAGE_KEYS.indexOf(s);
        const pct = record.taskCount && record.taskCount > 0
          ? record.progress_pct  // keep task-based pct if tasks exist
          : idx < 0 ? 0 : Math.round((idx / (STAGE_KEYS.length - 1)) * 100);
        setRecord(r => ({ ...r, stage: s, progress_pct: pct }));
      }} />}
      {tab === 'checklist'  && <ChecklistTab record={record} profiles={profiles} isAdmin={isAdmin} />}
      {tab === 'documents'  && <DocumentsTab record={record} isAdmin={isAdmin} isOwnRecord={isOwnRecord} />}
      {tab === 'training'   && <TrainingTab record={record} />}
      {tab === 'meetings'   && <MeetingsTab record={record} isAdmin={isAdmin} />}
      {tab === 'compliance' && <ComplianceTab recordId={record.id} />}
      {tab === 'activity'   && <ActivityTab record={record} />}
    </div>
  );
}
