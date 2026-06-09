'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  UserPlus, ArrowLeft, CheckCircle2, Clock, FileText, GraduationCap,
  Calendar, Activity, Users, AlertTriangle, Plus, X, Loader2, CheckSquare,
  SquareDashed, Edit3, ChevronRight, Building2, User, Shield, Laptop,
  MessageSquare, Star, TrendingUp, MoreHorizontal, Trash2, Send,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  getOnboardingTasks, getOnboardingDocuments, getOnboardingMeetings, getOnboardingActivity,
  createOnboardingTask, updateOnboardingTask, deleteOnboardingTask,
  updateDocumentStatus, addDocument,
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

// ─────────────────────────────────────────────────────────────
// Constants / helpers
// ─────────────────────────────────────────────────────────────

type DetailTab = 'overview' | 'checklist' | 'documents' | 'training' | 'meetings' | 'compliance' | 'activity';

const TASK_TYPE_CONFIG: Record<TaskType, { label: string; icon: typeof CheckSquare; cls: string }> = {
  action:     { label: 'Action',      icon: CheckSquare, cls: 'text-gray-500'  },
  document:   { label: 'Document',    icon: FileText,    cls: 'text-blue-500'  },
  training:   { label: 'Training',    icon: GraduationCap,cls:'text-purple-500'},
  meeting:    { label: 'Meeting',     icon: Calendar,    cls: 'text-pink-500'  },
  hr:         { label: 'HR',          icon: Users,       cls: 'text-teal-500'  },
  it:         { label: 'IT Setup',    icon: Laptop,      cls: 'text-amber-500' },
  compliance: { label: 'Compliance',  icon: Shield,      cls: 'text-red-500'   },
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
  pending:  { cls: 'bg-gray-100 text-gray-600',    label: 'Pending'   },
  uploaded: { cls: 'bg-blue-50 text-blue-700',     label: 'Uploaded'  },
  verified: { cls: 'bg-green-50 text-green-700',   label: 'Verified'  },
  rejected: { cls: 'bg-red-50 text-red-700',       label: 'Rejected'  },
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
  scheduled:    { cls: 'bg-blue-50 text-blue-700',    label: 'Scheduled'    },
  completed:    { cls: 'bg-green-50 text-green-700',  label: 'Completed'    },
  cancelled:    { cls: 'bg-red-50 text-red-700',      label: 'Cancelled'    },
  rescheduled:  { cls: 'bg-amber-50 text-amber-700',  label: 'Rescheduled'  },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60)   return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400)return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function initials(name?: string | null) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function Avatar({ name, size = 8 }: { name?: string | null; size?: number }) {
  return (
    <div className={cn(`h-${size} w-${size} rounded-full flex items-center justify-center shrink-0 bg-linear-to-br from-teal-400 to-emerald-500`)}>
      <span className="text-white font-bold" style={{ fontSize: size * 1.6 }}>{initials(name)}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Stage Progress Stepper
// ─────────────────────────────────────────────────────────────

function StageStepper({
  currentStage, recordId, isAdmin, onAdvance,
}: {
  currentStage: OnboardingStage;
  recordId:     string;
  isAdmin:      boolean;
  onAdvance:    (stage: OnboardingStage) => void;
}) {
  const [advancing, setAdvancing] = useState(false);
  const currentIdx = STAGES.findIndex(s => s.key === currentStage);
  const nextStage  = STAGES[currentIdx + 1];

  async function advance() {
    if (!nextStage || !isAdmin) return;
    setAdvancing(true);
    await updateOnboardingRecord(recordId, { stage: nextStage.key });
    onAdvance(nextStage.key);
    setAdvancing(false);
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[12px] font-bold uppercase tracking-widest text-gray-400">Onboarding Pipeline</p>
        {isAdmin && nextStage && (
          <button
            onClick={advance}
            disabled={advancing}
            className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-teal-500 hover:bg-teal-600 text-white text-[11px] font-bold transition-colors disabled:opacity-60"
          >
            {advancing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Advance to {nextStage.label}
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 overflow-x-auto">
        {STAGES.map((s, i) => {
          const isActive   = s.key === currentStage;
          const isComplete = i < currentIdx;
          return (
            <div key={s.key} className="flex items-center gap-1 shrink-0">
              <div className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-xl border text-[11px] font-bold transition-all',
                isActive   ? 'border-current text-white' :
                isComplete ? 'border-green-200 bg-green-50 text-green-600' :
                             'border-gray-100 bg-gray-50 text-gray-400',
              )}
                style={isActive ? { backgroundColor: s.color, borderColor: s.color } : {}}
              >
                {isComplete ? <CheckCircle2 className="h-3.5 w-3.5" /> : (
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: isActive ? 'white' : s.color }} />
                )}
                {s.label}
              </div>
              {i < STAGES.length - 1 && (
                <div className={cn('h-px w-4', isComplete || isActive ? 'bg-green-200' : 'bg-gray-100')} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Overview Tab
// ─────────────────────────────────────────────────────────────

function OverviewTab({
  record, isAdmin, onStageChange,
}: {
  record: OnboardingRecord;
  isAdmin: boolean;
  onStageChange: (stage: OnboardingStage) => void;
}) {
  const today     = new Date().toISOString().slice(0, 10);
  const isOverdue = record.target_completion_date && record.target_completion_date < today && record.stage !== 'completed';
  const daysLeft  = record.target_completion_date ? Math.ceil((new Date(record.target_completion_date).getTime() - Date.now()) / 86_400_000) : null;
  const stage     = STAGES.find(s => s.key === record.stage) ?? STAGES[0];

  return (
    <div className="space-y-5">
      <StageStepper currentStage={record.stage} recordId={record.id} isAdmin={isAdmin} onAdvance={onStageChange} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Progress',      val: `${record.progress_pct}%`, icon: TrendingUp,   cls: 'text-teal-600',   bg: 'bg-teal-50' },
          { label: 'Tasks',         val: `${record.completedCount ?? 0}/${record.taskCount ?? 0}`, icon: CheckSquare, cls: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Stage',         val: stage.label,               icon: Star,         cls: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'Due',           val: record.target_completion_date ? (isOverdue ? 'Overdue' : `${daysLeft}d`) : '—',
            icon: Clock, cls: isOverdue ? 'text-red-600' : 'text-gray-600', bg: isOverdue ? 'bg-red-50' : 'bg-gray-50' },
        ].map(s => (
          <div key={s.label} className={cn('rounded-2xl p-4 flex items-center gap-3 border border-gray-100', s.bg)}>
            <div className="h-10 w-10 bg-white rounded-xl flex items-center justify-center shadow-sm shrink-0">
              <s.icon className={cn('h-5 w-5', s.cls)} />
            </div>
            <div>
              <p className="text-[20px] font-bold text-gray-900 leading-none">{s.val}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[13px] font-bold text-gray-900">Completion Progress</p>
          <p className="text-[13px] font-bold" style={{ color: stage.color }}>{record.progress_pct}%</p>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden mb-3">
          <div className="h-full rounded-full transition-all" style={{ width: `${record.progress_pct}%`, backgroundColor: stage.color }} />
        </div>
        <div className="grid grid-cols-2 gap-4 text-[12px]">
          {record.start_date && (
            <div>
              <p className="text-gray-400 mb-0.5">Start Date</p>
              <p className="font-semibold text-gray-700">{fmtDate(record.start_date)}</p>
            </div>
          )}
          {record.target_completion_date && (
            <div>
              <p className="text-gray-400 mb-0.5">Target Completion</p>
              <p className={cn('font-semibold', isOverdue ? 'text-red-600' : 'text-gray-700')}>
                {fmtDate(record.target_completion_date)}
                {daysLeft !== null && (
                  <span className="ml-1.5 text-[10px] font-normal">
                    ({isOverdue ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? 'today' : `${daysLeft}d left`})
                  </span>
                )}
              </p>
            </div>
          )}
          {record.managerName && (
            <div>
              <p className="text-gray-400 mb-0.5">Manager</p>
              <div className="flex items-center gap-1.5">
                <Avatar name={record.managerName} size={5} />
                <p className="font-semibold text-gray-700">{record.managerName}</p>
              </div>
            </div>
          )}
          {record.hrManagerName && (
            <div>
              <p className="text-gray-400 mb-0.5">HR Manager</p>
              <div className="flex items-center gap-1.5">
                <Avatar name={record.hrManagerName} size={5} />
                <p className="font-semibold text-gray-700">{record.hrManagerName}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {record.notes && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <p className="text-[11px] font-bold uppercase tracking-widest text-amber-600 mb-1">Notes</p>
          <p className="text-[13px] text-amber-800 leading-relaxed">{record.notes}</p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Checklist Tab
// ─────────────────────────────────────────────────────────────

function ChecklistTab({
  record, profiles, userId, isAdmin,
}: {
  record: OnboardingRecord;
  profiles: Array<{ id: string; name: string }>;
  userId: string;
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
  const [filterStage,setFilterStage]= useState('');

  useEffect(() => {
    getOnboardingTasks(record.id).then(r => { if (r.success) setTasks(r.data); setLoading(false); });
  }, [record.id]);

  const grouped = useMemo(() => {
    const filtered = filterStage ? tasks.filter(t => t.stage === filterStage) : tasks;
    const map = new Map<OnboardingStage, OnboardingTask[]>();
    STAGES.forEach(s => {
      const st = filtered.filter(t => t.stage === s.key);
      if (st.length > 0) map.set(s.key, st);
    });
    return map;
  }, [tasks, filterStage]);

  async function toggleTask(t: OnboardingTask) {
    const newStatus: TaskStatus = t.status === 'completed' ? 'pending' : 'completed';
    const res = await updateOnboardingTask(t.id, { status: newStatus });
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
      <div className="flex items-center gap-3 flex-wrap">
        <select value={filterStage} onChange={e => setFilterStage(e.target.value)}
          className="h-9 px-3 border border-gray-200 rounded-xl text-[12px] bg-white focus:outline-none focus:ring-2 focus:ring-teal-300">
          <option value="">All Stages</option>
          {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        {total > 0 && (
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${(done / total) * 100}%` }} />
            </div>
            <p className="text-[12px] font-bold text-gray-700 shrink-0">{done}/{total}</p>
          </div>
        )}
        {isAdmin && (
          <button onClick={() => setAdding(a => !a)}
            className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-teal-500 hover:bg-teal-600 text-white text-[12px] font-bold transition-colors ml-auto">
            <Plus className="h-4 w-4" /> Add Task
          </button>
        )}
      </div>

      {isAdmin && adding && (
        <form onSubmit={handleCreate} className="bg-white border-2 border-teal-200 rounded-2xl p-4 space-y-3 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-widest text-teal-500">New Task</p>
          <input value={newTitle} onChange={e => setNewTitle(e.target.value)}
            placeholder="Task title…" required autoFocus
            className="w-full h-10 px-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-teal-300" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <select value={newType} onChange={e => setNewType(e.target.value as TaskType)}
              className="h-9 px-3 rounded-xl border border-gray-200 text-[12px] focus:outline-none focus:ring-2 focus:ring-teal-300">
              {Object.entries(TASK_TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={newCat} onChange={e => setNewCat(e.target.value as TaskCategory)}
              className="h-9 px-3 rounded-xl border border-gray-200 text-[12px] focus:outline-none focus:ring-2 focus:ring-teal-300">
              <option value="required">Required</option>
              <option value="optional">Optional</option>
            </select>
            <select value={newStage} onChange={e => setNewStage(e.target.value as OnboardingStage)}
              className="h-9 px-3 rounded-xl border border-gray-200 text-[12px] focus:outline-none focus:ring-2 focus:ring-teal-300">
              {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <input type="date" value={newDue} onChange={e => setNewDue(e.target.value)}
              className="h-9 px-3 rounded-xl border border-gray-200 text-[12px] focus:outline-none focus:ring-2 focus:ring-teal-300" />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setAdding(false)}
              className="flex-1 h-9 rounded-xl border border-gray-200 text-[12px] text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={submitting}
              className="flex-1 h-9 rounded-xl bg-teal-500 text-white text-[12px] font-bold hover:bg-teal-600 flex items-center justify-center gap-1.5 disabled:opacity-60">
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Add
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-center py-12"><Loader2 className="h-8 w-8 animate-spin text-teal-400 mx-auto" /></div>
      ) : grouped.size === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <CheckSquare className="h-12 w-12 text-gray-200 mx-auto mb-3" />
          <p className="text-[14px] text-gray-400">No tasks yet</p>
        </div>
      ) : (
        Array.from(grouped.entries()).map(([stageKey, stageTasks]) => {
          const stage = STAGES.find(s => s.key === stageKey)!;
          const stageDone = stageTasks.filter(t => t.status === 'completed').length;
          return (
            <div key={stageKey} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-50"
                style={{ backgroundColor: `${stage.color}08` }}>
                <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                <p className="text-[12px] font-bold" style={{ color: stage.color }}>{stage.label}</p>
                <span className="text-[10px] font-bold bg-white rounded-full px-2 py-0.5 border ml-auto"
                  style={{ color: stage.color, borderColor: `${stage.color}30` }}>
                  {stageDone}/{stageTasks.length}
                </span>
              </div>
              {stageTasks.map(t => {
                const tc  = TASK_TYPE_CONFIG[t.task_type] ?? TASK_TYPE_CONFIG.action;
                const today = new Date().toISOString().slice(0, 10);
                const overdue = t.due_date && t.due_date < today && t.status !== 'completed';
                return (
                  <div key={t.id}
                    className={cn('flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50/60 transition-colors group border-b border-gray-50 last:border-0',
                      t.status === 'completed' && 'bg-green-50/30')}>
                    <button onClick={() => toggleTask(t)} className="shrink-0">
                      {t.status === 'completed'
                        ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                        : <SquareDashed className="h-5 w-5 text-gray-300 hover:text-teal-400 transition-colors" />}
                    </button>
                    <tc.icon className={cn('h-4 w-4 shrink-0', tc.cls)} />
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-[13px] font-medium text-gray-800 truncate',
                        t.status === 'completed' && 'line-through text-gray-400')}>
                        {t.title}
                      </p>
                      {t.assigneeName && (
                        <p className="text-[10px] text-gray-400 mt-0.5">{t.assigneeName}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full hidden sm:block',
                        t.category === 'required' ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-500')}>
                        {t.category}
                      </span>
                      {t.due_date && (
                        <span className={cn('text-[10px] hidden md:block',
                          overdue ? 'text-red-600 font-semibold' : 'text-gray-400')}>
                          {fmtDate(t.due_date)}
                        </span>
                      )}
                      {isAdmin && (
                        <button onClick={() => handleDelete(t.id)}
                          className="h-7 w-7 rounded-lg hover:bg-red-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                          <Trash2 className="h-3.5 w-3.5 text-red-400" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Documents Tab
// ─────────────────────────────────────────────────────────────

function DocumentsTab({
  record, isAdmin, isOwnRecord,
}: {
  record: OnboardingRecord;
  isAdmin: boolean;
  isOwnRecord: boolean;
}) {
  const [docs,    setDocs]    = useState<OnboardingDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding,  setAdding]  = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<DocType>('contract');
  const [newNote, setNewNote] = useState('');
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    getOnboardingDocuments(record.id).then(r => { if (r.success) setDocs(r.data); setLoading(false); });
  }, [record.id]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    const res = await addDocument(record.id, record.employee_id, { doc_type: newType, name: newName.trim(), notes: newNote || undefined });
    if (res.success) { setDocs(d => [...d, res.data]); setNewName(''); setNewNote(''); setAdding(false); }
    setSaving(false);
  }

  const verified = docs.filter(d => d.status === 'verified').length;
  const required = docs.length;

  return (
    <div className="space-y-4">
      {/* Header stats */}
      <div className="flex items-center gap-3">
        <div className="flex gap-2 text-[12px]">
          <span className="px-3 py-1.5 bg-gray-100 rounded-full text-gray-600 font-medium">{docs.length} documents</span>
          <span className="px-3 py-1.5 bg-green-50 rounded-full text-green-700 font-medium">{verified}/{required} verified</span>
        </div>
        {isAdmin && (
          <button onClick={() => setAdding(a => !a)}
            className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-teal-500 hover:bg-teal-600 text-white text-[12px] font-bold ml-auto">
            <Plus className="h-4 w-4" /> Add Requirement
          </button>
        )}
      </div>

      {/* Add document requirement form (HR only) */}
      {isAdmin && adding && (
        <form onSubmit={handleAdd} className="bg-white border-2 border-teal-200 rounded-2xl p-4 space-y-3 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-widest text-teal-500">Add Document Requirement</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block mb-1">Type</label>
              <select value={newType} onChange={e => setNewType(e.target.value as DocType)}
                className="w-full h-9 px-3 rounded-xl border border-gray-200 text-[12px] focus:outline-none focus:ring-2 focus:ring-teal-300">
                {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block mb-1">Name</label>
              <input value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Employment Contract" required
                className="w-full h-9 px-3 rounded-xl border border-gray-200 text-[12px] focus:outline-none focus:ring-2 focus:ring-teal-300" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setAdding(false)}
              className="flex-1 h-9 rounded-xl border border-gray-200 text-[12px] text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 h-9 rounded-xl bg-teal-500 text-white text-[12px] font-bold hover:bg-teal-600 flex items-center justify-center gap-1.5 disabled:opacity-60">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Add
            </button>
          </div>
        </form>
      )}

      {/* Documents list */}
      {loading ? (
        <div className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin text-teal-400 mx-auto" /></div>
      ) : docs.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <FileText className="h-12 w-12 text-gray-200 mx-auto mb-3" />
          <p className="text-[14px] text-gray-400">No documents required</p>
        </div>
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
              onUploadSuccess={() => {
                getOnboardingDocuments(record.id).then(r => { if (r.success) setDocs(r.data); });
              }}
              onDeleteSuccess={() => {
                getOnboardingDocuments(record.id).then(r => { if (r.success) setDocs(r.data); });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Training Tab
// ─────────────────────────────────────────────────────────────

function TrainingTab({ record }: { record: OnboardingRecord }) {
  const tasks = useMemo(() => [] as OnboardingTask[], []); // placeholder

  return (
    <div className="space-y-4">
      <div className="bg-purple-50 border border-purple-200 rounded-2xl px-5 py-4 flex items-start gap-3">
        <GraduationCap className="h-5 w-5 text-purple-500 mt-0.5 shrink-0" />
        <div>
          <p className="text-[13px] font-bold text-purple-800 mb-1">Training Academy Integration</p>
          <p className="text-[12px] text-purple-600 leading-relaxed">
            Training courses assigned during onboarding are tracked in the Training Academy.
            View and manage all courses for {record.employeeName} there.
          </p>
          <Link
            href={`/training?employee=${record.employee_id}`}
            className="inline-flex items-center gap-1.5 mt-3 h-8 px-3 rounded-xl bg-purple-500 hover:bg-purple-600 text-white text-[12px] font-bold transition-colors"
          >
            <GraduationCap className="h-3.5 w-3.5" /> Open Training Academy
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* Training checklist tasks */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <p className="text-[12px] font-bold uppercase tracking-widest text-gray-400 mb-3">Assigned Training Tasks</p>
        <p className="text-[13px] text-gray-400 text-center py-8">
          Training tasks from the checklist tab with type "Training" appear here.
          <br/>
          <Link href="?tab=checklist" className="text-teal-600 font-medium hover:underline mt-1 inline-block">
            View Checklist →
          </Link>
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Meetings Tab
// ─────────────────────────────────────────────────────────────

function MeetingsTab({ record, isAdmin }: { record: OnboardingRecord; isAdmin: boolean }) {
  const [meetings, setMeetings] = useState<OnboardingMeeting[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [adding,   setAdding]   = useState(false);
  const [form, setForm] = useState({
    title:         '',
    meeting_type:  'orientation' as MeetingType,
    scheduled_at:  '',
    duration_mins: 60,
    location:      '',
    meeting_url:   '',
    notes:         '',
    addToCalendar: false,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getOnboardingMeetings(record.id).then(r => { if (r.success) setMeetings(r.data); setLoading(false); });
  }, [record.id]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    const res = await createMeetingWithCalendarEvent({
      record_id:     record.id,
      title:         form.title,
      meeting_type:  form.meeting_type,
      scheduled_at:  form.scheduled_at || null,
      duration_mins: form.duration_mins,
      location:      form.location || null,
      meeting_url:   form.meeting_url || null,
      notes:         form.notes || null,
      addToCalendar: form.addToCalendar,
      hospitalId:    record.hospital_id ?? undefined,
    });
    if (res.success) { setMeetings(m => [...m, res.data]); setForm(f => ({ ...f, title: '', notes: '' })); setAdding(false); }
    setSaving(false);
  }

  async function handleStatusChange(id: string, status: MeetingStatus) {
    await updateMeetingStatus(id, status);
    setMeetings(ms => ms.map(m => m.id === id ? { ...m, status } : m));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-gray-500">{meetings.length} meeting{meetings.length !== 1 ? 's' : ''} scheduled</p>
        {isAdmin && (
          <button onClick={() => setAdding(a => !a)}
            className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-teal-500 hover:bg-teal-600 text-white text-[12px] font-bold">
            <Plus className="h-4 w-4" /> Schedule Meeting
          </button>
        )}
      </div>

      {isAdmin && adding && (
        <form onSubmit={handleCreate} className="bg-white border-2 border-teal-200 rounded-2xl p-4 space-y-3 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-widest text-teal-500">Schedule Meeting</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block mb-1">Title</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Welcome & Orientation" required
                className="w-full h-9 px-3 rounded-xl border border-gray-200 text-[12px] focus:outline-none focus:ring-2 focus:ring-teal-300" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block mb-1">Type</label>
              <select value={form.meeting_type} onChange={e => setForm(f => ({ ...f, meeting_type: e.target.value as MeetingType }))}
                className="w-full h-9 px-3 rounded-xl border border-gray-200 text-[12px] focus:outline-none focus:ring-2 focus:ring-teal-300">
                {Object.entries(MEETING_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block mb-1">Duration (min)</label>
              <input type="number" value={form.duration_mins} onChange={e => setForm(f => ({ ...f, duration_mins: +e.target.value }))}
                min={15} step={15}
                className="w-full h-9 px-3 rounded-xl border border-gray-200 text-[12px] focus:outline-none focus:ring-2 focus:ring-teal-300" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block mb-1">Date & Time</label>
              <input type="datetime-local" value={form.scheduled_at} onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))}
                className="w-full h-9 px-3 rounded-xl border border-gray-200 text-[12px] focus:outline-none focus:ring-2 focus:ring-teal-300" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block mb-1">Location</label>
              <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                placeholder="Conference Room / Zoom link"
                className="w-full h-9 px-3 rounded-xl border border-gray-200 text-[12px] focus:outline-none focus:ring-2 focus:ring-teal-300" />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.addToCalendar}
              onChange={e => setForm(f => ({ ...f, addToCalendar: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-teal-500 focus:ring-teal-300" />
            <span className="text-[12px] text-gray-600">Add to Master Calendar</span>
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setAdding(false)}
              className="flex-1 h-9 rounded-xl border border-gray-200 text-[12px] text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 h-9 rounded-xl bg-teal-500 text-white text-[12px] font-bold hover:bg-teal-600 flex items-center justify-center gap-1.5 disabled:opacity-60">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Calendar className="h-3.5 w-3.5" />}
              Schedule
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin text-teal-400 mx-auto" /></div>
      ) : meetings.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <Calendar className="h-12 w-12 text-gray-200 mx-auto mb-3" />
          <p className="text-[14px] text-gray-400">No meetings scheduled</p>
        </div>
      ) : (
        <div className="space-y-3">
          {meetings.map(m => {
            const sc = MEETING_STATUS_CFG[m.status];
            return (
              <div key={m.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 bg-teal-50 rounded-xl flex items-center justify-center shrink-0">
                      <Calendar className="h-4.5 w-4.5 text-teal-500" />
                    </div>
                    <div>
                      <p className="text-[13px] font-bold text-gray-900">{m.title}</p>
                      <p className="text-[11px] text-gray-400">{MEETING_TYPE_LABELS[m.meeting_type]}</p>
                    </div>
                  </div>
                  <span className={cn('text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0', sc.cls)}>{sc.label}</span>
                </div>
                <div className="flex items-center gap-4 text-[11px] text-gray-400 flex-wrap">
                  {m.scheduled_at && (
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{fmtDateTime(m.scheduled_at)}</span>
                  )}
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{m.duration_mins} min</span>
                  {m.location && <span>{m.location}</span>}
                  {m.calendar_event_id && (
                    <Link href="/calendar" className="flex items-center gap-1 text-teal-500 hover:text-teal-600">
                      <Calendar className="h-3 w-3" /> On calendar
                    </Link>
                  )}
                </div>
                {isAdmin && m.status === 'scheduled' && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-gray-50">
                    <button onClick={() => handleStatusChange(m.id, 'completed')}
                      className="h-7 px-3 rounded-lg bg-green-50 text-green-600 text-[11px] font-bold hover:bg-green-100">
                      Mark Complete
                    </button>
                    <button onClick={() => handleStatusChange(m.id, 'cancelled')}
                      className="h-7 px-3 rounded-lg bg-red-50 text-red-600 text-[11px] font-bold hover:bg-red-100">
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

// ─────────────────────────────────────────────────────────────
// Activity Tab
// ─────────────────────────────────────────────────────────────

function ActivityTab({ record }: { record: OnboardingRecord }) {
  const [items,   setItems]   = useState<OnboardingActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getOnboardingActivity(record.id).then(r => { if (r.success) setItems(r.data); setLoading(false); });
  }, [record.id]);

  if (loading) return <div className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin text-teal-400 mx-auto" /></div>;

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <Activity className="h-12 w-12 text-gray-200 mx-auto mb-3" />
          <p className="text-[14px] text-gray-400">No activity yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
          {items.map(item => (
            <div key={item.id} className="flex items-start gap-3 px-5 py-4">
              <div className="h-8 w-8 rounded-full bg-teal-50 flex items-center justify-center shrink-0 mt-0.5">
                <Activity className="h-3.5 w-3.5 text-teal-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-gray-700">
                  <span className="font-semibold">{item.userName ?? 'System'}</span>
                  {' '}{item.action}
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">{fmtAgo(item.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Employee Onboarding Root
// ─────────────────────────────────────────────────────────────

interface EmployeeOnboardingProps {
  record:     OnboardingRecord;
  profiles:   Array<{ id: string; name: string }>;
  userId:     string;
  isAdmin:    boolean;
  initialTab: DetailTab;
  isOwnRecord?: boolean;
}

export function EmployeeOnboarding({ record: initial, profiles, userId, isAdmin, initialTab, isOwnRecord = false }: EmployeeOnboardingProps) {
  const router = useRouter();
  const [record, setRecord] = useState<OnboardingRecord>(initial);
  const [tab,    setTab]    = useState<DetailTab>(initialTab);
  const [live,   setLive]   = useState(false);

  useEffect(() => { setRecord(initial); }, [initial]);

  useEffect(() => {
    const sb = createSupabaseBrowserClient();
    const ch = sb.channel(`onboarding-${record.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'onboarding_records', filter: `id=eq.${record.id}` },
        () => router.refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'onboarding_tasks', filter: `record_id=eq.${record.id}` },
        () => router.refresh())
      .subscribe(s => setLive(s === 'SUBSCRIBED'));
    return () => { sb.removeChannel(ch); };
  }, [record.id, router]);

  const TABS: Array<{ id: DetailTab; icon: typeof CheckSquare; label: string }> = [
    { id: 'overview',   icon: TrendingUp,    label: 'Overview'   },
    { id: 'checklist',  icon: CheckSquare,   label: 'Checklist'  },
    { id: 'documents',  icon: FileText,      label: 'Documents'  },
    { id: 'training',   icon: GraduationCap, label: 'Training'   },
    { id: 'meetings',   icon: Calendar,      label: 'Meetings'   },
    { id: 'compliance', icon: Shield,        label: 'Compliance' },
    { id: 'activity',   icon: Activity,      label: 'Activity'   },
  ];

  const stage   = STAGES.find(s => s.key === record.stage) ?? STAGES[0];
  const today   = new Date().toISOString().slice(0, 10);
  const overdue = record.target_completion_date && record.target_completion_date < today && record.stage !== 'completed';

  return (
    <div className="flex flex-col gap-5 pb-12 max-w-4xl mx-auto">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, ${stage.color}, ${stage.color}44)` }} />
        <div className="px-6 py-5">
          <div className="flex items-start gap-4">
            <Link href="/onboarding" className="mt-1 h-8 w-8 rounded-xl hover:bg-gray-100 flex items-center justify-center shrink-0 transition-colors">
              <ArrowLeft className="h-4 w-4 text-gray-400" />
            </Link>
            <div className={cn(
              'h-14 w-14 rounded-2xl flex items-center justify-center shrink-0 text-[22px] font-bold text-white'
            )} style={{ backgroundColor: stage.color }}>
              {(record.employeeName ?? '?').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap mb-1">
                <h1 className="text-[20px] font-bold text-gray-900">{record.employeeName}</h1>
                <span
                  className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border"
                  style={{ backgroundColor: `${stage.color}15`, color: stage.color, borderColor: `${stage.color}30` }}
                >
                  {stage.label}
                </span>
                {overdue && (
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-100">
                    Overdue
                  </span>
                )}
                <div className="flex items-center gap-1.5 bg-gray-50 rounded-full px-2.5 py-1">
                  <div className={cn('h-2 w-2 rounded-full', live ? 'bg-green-400 animate-pulse' : 'bg-gray-300')} />
                  <p className="text-[10px] text-gray-400 font-medium">{live ? 'Live' : '…'}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-[11px] text-gray-400 flex-wrap">
                {record.employeeJobTitle && <span>{record.employeeJobTitle}</span>}
                {record.employeeEmail   && <span>{record.employeeEmail}</span>}
                {record.hospitalName    && (
                  <span className="flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    {record.hospitalName}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-2">
                <div className="flex-1 max-w-48">
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${record.progress_pct}%`, backgroundColor: stage.color }} />
                  </div>
                </div>
                <p className="text-[11px] text-gray-500">{record.progress_pct}% complete</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-white border border-gray-100 rounded-2xl p-1.5 shadow-sm overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-1.5 h-8 px-3 rounded-xl text-[12px] font-medium whitespace-nowrap transition-all',
              tab === t.id ? 'text-white shadow-sm' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100',
            )}
            style={tab === t.id ? { backgroundColor: stage.color } : {}}
          >
            <t.icon className="h-3.5 w-3.5" />
            <span className="hidden sm:block">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {tab === 'overview'  && (
          <OverviewTab record={record} isAdmin={isAdmin}
            onStageChange={s => setRecord(r => ({ ...r, stage: s }))} />
        )}
        {tab === 'checklist' && (
          <ChecklistTab record={record} profiles={profiles} userId={userId} isAdmin={isAdmin} />
        )}
        {tab === 'documents' && (
          <DocumentsTab record={record} isAdmin={isAdmin} isOwnRecord={isOwnRecord} />
        )}
        {tab === 'training'  && <TrainingTab record={record} />}
        {tab === 'meetings'  && <MeetingsTab record={record} isAdmin={isAdmin} />}
        {tab === 'compliance' && <ComplianceTab recordId={record.id} />}
        {tab === 'activity'  && <ActivityTab record={record} />}
      </div>
    </div>
  );
}
