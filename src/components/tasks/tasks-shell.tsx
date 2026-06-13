'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  CheckCircle2, Circle, Clock, AlertTriangle, Plus, Search, X,
  ChevronDown, ChevronUp, Trash2, RotateCcw, User, ListChecks,
  FileText, Loader2, Filter, AlarmClock, CheckSquare, Users,
  AlertCircle, Flag,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AppRole } from '@/types/database';
import type {
  TaskWithDetails, AssignableMember, ChecklistItem, TaskPriority,
  TaskType, AssignTaskInput,
} from '@/lib/tasks-types';
import {
  assignTask, completeTask, reopenTask, deleteTaskById,
  updateTaskItems, getUserTaskLoad, getAssignableMembers,
} from '@/lib/actions/tasks';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const ASSIGNER_ROLES: AppRole[] = ['super_admin', 'org_admin', 'hospital_admin', 'practice_manager', 'hr'];

const PRIORITY_META = {
  low:    { label: 'Low',    cls: 'bg-slate-100 text-slate-500 border-slate-200' },
  medium: { label: 'Medium', cls: 'bg-blue-50 text-blue-600 border-blue-200' },
  high:   { label: 'High',   cls: 'bg-amber-50 text-amber-600 border-amber-200' },
  urgent: { label: 'Urgent', cls: 'bg-red-50 text-red-600 border-red-200' },
};

const STATUS_META = {
  todo:        { label: 'To Do',       cls: 'bg-slate-100 text-slate-600' },
  in_progress: { label: 'In Progress', cls: 'bg-blue-100 text-blue-700' },
  done:        { label: 'Done',        cls: 'bg-emerald-100 text-emerald-700' },
  cancelled:   { label: 'Cancelled',   cls: 'bg-slate-100 text-slate-400' },
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isOverdue(t: TaskWithDetails) {
  return t.status !== 'done' && t.status !== 'cancelled' && !!t.due_date && new Date(t.due_date) < new Date();
}

function personName(p: { first_name: string | null; last_name: string | null } | null) {
  if (!p) return 'Unknown';
  return [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown';
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
}

const AVATAR_COLORS = ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6'];
function avatarColor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

// ─────────────────────────────────────────────────────────────
// Stat card
// ─────────────────────────────────────────────────────────────
function StatCard({ value, label, color, icon: Icon }: { value: number; label: string; color: string; icon: React.ElementType }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4 flex items-center gap-4">
      <div className={cn('h-11 w-11 rounded-xl flex items-center justify-center shrink-0', color)}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div>
        <p className="text-[26px] font-bold text-slate-900 leading-none">{value}</p>
        <p className="text-[12px] text-slate-500 mt-1">{label}</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Checklist row (expandable)
// ─────────────────────────────────────────────────────────────
function ChecklistView({
  task, currentUserId, onItemsChange,
}: {
  task: TaskWithDetails;
  currentUserId: string;
  onItemsChange: (taskId: string, items: ChecklistItem[]) => void;
}) {
  const [saving, setSaving] = useState(false);
  const isAssignee = task.assigned_to === currentUserId;

  const toggle = async (itemId: string) => {
    if (!isAssignee || saving) return;
    const newItems = task.items.map(i => i.id === itemId ? { ...i, done: !i.done } : i);
    setSaving(true);
    onItemsChange(task.id, newItems);
    await updateTaskItems(task.id, newItems);
    setSaving(false);
  };

  return (
    <div className="mt-2 pl-4 space-y-1.5 border-l-2 border-slate-100 ml-2">
      {task.items.map(item => (
        <button
          key={item.id}
          onClick={() => toggle(item.id)}
          disabled={!isAssignee || saving}
          className={cn(
            'flex items-center gap-2.5 w-full text-left group',
            !isAssignee && 'cursor-default',
          )}
        >
          {item.done
            ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            : <Circle className="h-4 w-4 text-slate-300 group-hover:text-slate-400 shrink-0" />}
          <span className={cn('text-[13px] leading-snug', item.done ? 'line-through text-slate-400' : 'text-slate-700')}>
            {item.text}
          </span>
        </button>
      ))}
      {task.notes && (
        <p className="text-[12px] text-slate-400 italic mt-2 pt-2 border-t border-slate-100">{task.notes}</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Task row
// ─────────────────────────────────────────────────────────────
function TaskRow({
  task, isAssigner, currentUserId, showAssignee, onOptimisticUpdate, onDelete,
}: {
  task: TaskWithDetails;
  isAssigner: boolean;
  currentUserId: string;
  showAssignee: boolean;
  onOptimisticUpdate: (taskId: string, patch: Partial<TaskWithDetails>) => void;
  onDelete: (taskId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [acting, setActing] = useState(false);
  const overdue = isOverdue(task);
  const isOwn = task.assigned_to === currentUserId;
  const isDone = task.status === 'done';
  const person = showAssignee ? task.assignee : task.creator;
  const pName = personName(person);
  const pid = person?.id ?? 'unknown';

  const handleComplete = async () => {
    setActing(true);
    onOptimisticUpdate(task.id, { status: 'done', progress: 100 });
    await completeTask(task.id);
    setActing(false);
  };

  const handleReopen = async () => {
    setActing(true);
    onOptimisticUpdate(task.id, { status: 'in_progress', progress: task.items.length > 0 ? task.progress : 0 });
    await reopenTask(task.id);
    setActing(false);
  };

  const handleDelete = async () => {
    setActing(true);
    onDelete(task.id);
    await deleteTaskById(task.id);
  };

  const handleItemsChange = (taskId: string, items: ChecklistItem[]) => {
    const progress = Math.round(items.filter(i => i.done).length / items.length * 100);
    const status = items.every(i => i.done) ? 'done' : (items.some(i => i.done) ? 'in_progress' : 'todo');
    onOptimisticUpdate(taskId, { items, progress, status });
  };

  return (
    <div className={cn(
      'bg-white rounded-2xl border shadow-sm transition-all',
      isDone ? 'border-emerald-100 opacity-80' : overdue ? 'border-red-200' : 'border-slate-100',
      'hover:shadow-md',
    )}>
      {/* top stripe for overdue */}
      {overdue && !isDone && <div className="h-0.5 rounded-t-2xl bg-red-400" />}
      {isDone && <div className="h-0.5 rounded-t-2xl bg-emerald-400" />}

      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Done indicator */}
          <div className="mt-0.5 shrink-0">
            {isDone
              ? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              : overdue
              ? <AlertCircle className="h-5 w-5 text-red-400" />
              : <Circle className="h-5 w-5 text-slate-200" />}
          </div>

          {/* Person avatar */}
          <div
            className="h-8 w-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
            style={{ backgroundColor: avatarColor(pid) }}
          >
            {initials(pName)}
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 flex-wrap">
              <p className={cn('text-[14px] font-semibold flex-1 min-w-0', isDone ? 'line-through text-slate-400' : 'text-slate-900')}>
                {task.title}
              </p>
              {/* Priority badge */}
              <span className={cn('shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border', PRIORITY_META[task.priority]?.cls ?? '')}>
                {task.priority}
              </span>
              {/* Status badge */}
              <span className={cn('shrink-0 text-[10px] font-bold px-2.5 py-0.5 rounded-full', STATUS_META[task.status]?.cls ?? '')}>
                {STATUS_META[task.status]?.label}
              </span>
            </div>

            {/* Sub-line */}
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-[12px] text-slate-500 flex items-center gap-1">
                {showAssignee ? <User className="h-3 w-3" /> : <User className="h-3 w-3" />}
                {pName}
              </span>
              {task.taskType === 'checklist' && (
                <span className="flex items-center gap-1 text-[12px] text-slate-500">
                  <ListChecks className="h-3 w-3" />
                  {task.items.filter(i => i.done).length}/{task.items.length}
                </span>
              )}
              {task.due_date && (
                <span className={cn('flex items-center gap-1 text-[12px]', overdue && !isDone ? 'text-red-500 font-semibold' : 'text-slate-500')}>
                  <Clock className="h-3 w-3" />
                  {overdue && !isDone ? 'Overdue · ' : ''}{fmtDate(task.due_date)}
                </span>
              )}
            </div>

            {/* Progress bar for checklists */}
            {task.taskType === 'checklist' && task.items.length > 0 && (
              <div className="mt-2 w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all duration-300', task.progress === 100 ? 'bg-emerald-500' : 'bg-blue-400')}
                  style={{ width: `${task.progress}%` }}
                />
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0 ml-1">
            {task.taskType === 'checklist' && (
              <button
                onClick={() => setExpanded(e => !e)}
                className="h-8 w-8 flex items-center justify-center rounded-xl hover:bg-slate-50 text-slate-400 transition-colors"
              >
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            )}
            {!isDone && (isOwn || isAssigner) && (
              <button
                onClick={handleComplete}
                disabled={acting}
                title="Mark complete"
                className="h-8 px-3 flex items-center gap-1.5 rounded-xl text-[12px] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors disabled:opacity-50"
              >
                {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Done
              </button>
            )}
            {isDone && isAssigner && (
              <button
                onClick={handleReopen}
                disabled={acting}
                title="Reopen task"
                className="h-8 w-8 flex items-center justify-center rounded-xl hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
            {isAssigner && (
              <button
                onClick={handleDelete}
                disabled={acting}
                title="Delete task"
                className="h-8 w-8 flex items-center justify-center rounded-xl hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Expanded checklist */}
        {expanded && task.taskType === 'checklist' && (
          <ChecklistView task={task} currentUserId={currentUserId} onItemsChange={handleItemsChange} />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Assign Task Modal
// ─────────────────────────────────────────────────────────────
function AssignTaskModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (task: TaskWithDetails) => void;
}) {
  const [step, setStep] = useState<'person' | 'task'>('person');
  const [members, setMembers] = useState<AssignableMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [personSearch, setPersonSearch] = useState('');
  const [selectedMember, setSelectedMember] = useState<AssignableMember | null>(null);
  const [taskLoad, setTaskLoad] = useState<{ count: number; titles: string[] } | null>(null);
  const [conflictConfirmed, setConflictConfirmed] = useState(false);

  // task form
  const [title, setTitle] = useState('');
  const [taskType, setTaskType] = useState<TaskType>('general');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ChecklistItem[]>([{ id: crypto.randomUUID(), text: '', done: false }]);
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('09:00');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    getAssignableMembers().then(r => {
      if (r.success) setMembers(r.data);
      setMembersLoading(false);
    });
  }, []);

  const filteredMembers = useMemo(() =>
    members.filter(m => !personSearch || m.name.toLowerCase().includes(personSearch.toLowerCase()) || (m.job_title ?? '').toLowerCase().includes(personSearch.toLowerCase())),
    [members, personSearch],
  );

  const selectMember = async (m: AssignableMember) => {
    setSelectedMember(m);
    if (m.active_task_count > 0) {
      const r = await getUserTaskLoad(m.id);
      if (r.success) setTaskLoad(r.data);
    } else {
      setTaskLoad({ count: 0, titles: [] });
      setStep('task');
    }
  };

  const confirmAndProceed = () => {
    setConflictConfirmed(true);
    setStep('task');
  };

  const addItem = () => setItems(prev => [...prev, { id: crypto.randomUUID(), text: '', done: false }]);
  const updateItem = (id: string, text: string) => setItems(prev => prev.map(i => i.id === id ? { ...i, text } : i));
  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));

  const handleSubmit = async () => {
    if (!title.trim()) { setErr('Please enter a task title'); return; }
    if (!selectedMember) { setErr('Please select a person'); return; }
    if (taskType === 'checklist' && items.every(i => !i.text.trim())) {
      setErr('Please add at least one checklist item'); return;
    }
    setSubmitting(true); setErr('');

    const dueDateISO = dueDate
      ? new Date(`${dueDate}T${dueTime}:00`).toISOString()
      : null;

    const input: AssignTaskInput = {
      title: title.trim(),
      type: taskType,
      notes: notes.trim(),
      items: taskType === 'checklist' ? items.filter(i => i.text.trim()) : [],
      priority,
      due_date: dueDateISO,
      assigned_to: selectedMember.id,
    };

    const r = await assignTask(input);
    if (r.success) {
      onCreated(r.data);
      onClose();
    } else {
      setErr(r.error ?? 'Failed to assign task');
    }
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white rounded-t-3xl flex items-center justify-between px-6 py-4 border-b border-slate-100 z-10">
          <div>
            <h2 className="text-[17px] font-bold text-slate-900">Assign Task</h2>
            <p className="text-[12px] text-slate-400 mt-0.5">
              {step === 'person' ? 'Select who to assign this task to' : `Assigning to ${selectedMember?.name}`}
            </p>
          </div>
          <button onClick={onClose} className="h-9 w-9 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* ── STEP 1: Person ── */}
          {step === 'person' && (
            <>
              {/* search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                <input
                  autoFocus
                  value={personSearch}
                  onChange={e => setPersonSearch(e.target.value)}
                  placeholder="Search by name or role…"
                  className="w-full h-11 pl-9 pr-3 rounded-xl border border-slate-200 text-[14px] focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 bg-slate-50 focus:bg-white transition-colors"
                />
              </div>

              {/* Conflict alert */}
              {selectedMember && taskLoad && taskLoad.count > 0 && !conflictConfirmed && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-[13.5px] font-bold text-amber-800">
                        {selectedMember.name} already has {taskLoad.count} active task{taskLoad.count !== 1 ? 's' : ''}
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {taskLoad.titles.slice(0, 3).map((t, i) => (
                          <li key={i} className="text-[12px] text-amber-700 flex items-center gap-1.5">
                            <span className="h-1 w-1 rounded-full bg-amber-500 shrink-0" />{t}
                          </li>
                        ))}
                        {taskLoad.titles.length > 3 && (
                          <li className="text-[12px] text-amber-600">+{taskLoad.titles.length - 3} more…</li>
                        )}
                      </ul>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={confirmAndProceed}
                          className="h-8 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-[12.5px] font-semibold transition-colors"
                        >
                          Assign Anyway
                        </button>
                        <button
                          onClick={() => { setSelectedMember(null); setTaskLoad(null); }}
                          className="h-8 px-4 rounded-xl bg-white border border-amber-200 text-amber-700 text-[12.5px] font-semibold hover:bg-amber-50 transition-colors"
                        >
                          Choose Someone Else
                        </button>
                      </div>
                      {/* Suggest same-role alternatives */}
                      {members.filter(m => m.id !== selectedMember.id && m.role === selectedMember.role && m.active_task_count === 0).length > 0 && (
                        <div className="mt-3 pt-3 border-t border-amber-200">
                          <p className="text-[11.5px] font-semibold text-amber-700 mb-1.5">Available colleagues with same role:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {members
                              .filter(m => m.id !== selectedMember.id && m.role === selectedMember.role && m.active_task_count === 0)
                              .slice(0, 4)
                              .map(m => (
                                <button
                                  key={m.id}
                                  onClick={() => selectMember(m)}
                                  className="h-7 px-3 rounded-full bg-white border border-amber-200 text-amber-800 text-[11.5px] font-semibold hover:bg-amber-100 transition-colors"
                                >
                                  {m.name}
                                </button>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Member list */}
              {membersLoading ? (
                <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-300" /></div>
              ) : (
                <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                  {filteredMembers.length === 0 && (
                    <p className="text-[13px] text-slate-400 text-center py-8">No members found</p>
                  )}
                  {filteredMembers.map(m => (
                    <button
                      key={m.id}
                      onClick={() => selectMember(m)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-left border',
                        selectedMember?.id === m.id ? 'bg-[#1e3a5f]/5 border-[#1e3a5f]/20' : 'border-transparent hover:bg-slate-50',
                      )}
                    >
                      <div
                        className="h-10 w-10 rounded-full flex items-center justify-center text-white text-[12px] font-bold shrink-0"
                        style={{ backgroundColor: avatarColor(m.id) }}
                      >
                        {initials(m.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13.5px] font-semibold text-slate-800 truncate">{m.name}</p>
                        <p className="text-[11.5px] text-slate-400 truncate">{m.job_title ?? m.role}</p>
                      </div>
                      {m.active_task_count > 0 ? (
                        <span className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                          <AlarmClock className="h-3 w-3" /> {m.active_task_count} active
                        </span>
                      ) : (
                        <span className="shrink-0 text-[11px] text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full font-semibold">
                          Free
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── STEP 2: Task Details ── */}
          {step === 'task' && selectedMember && (
            <>
              {/* Selected person chip */}
              <div className="flex items-center gap-2 p-3 bg-[#1e3a5f]/5 border border-[#1e3a5f]/10 rounded-xl">
                <div
                  className="h-8 w-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                  style={{ backgroundColor: avatarColor(selectedMember.id) }}
                >
                  {initials(selectedMember.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-slate-800">{selectedMember.name}</p>
                  <p className="text-[11px] text-slate-400">{selectedMember.job_title ?? selectedMember.role}</p>
                </div>
                <button
                  onClick={() => { setStep('person'); setConflictConfirmed(false); }}
                  className="text-[12px] text-[#1e3a5f] font-semibold hover:underline"
                >
                  Change
                </button>
              </div>

              {/* Title */}
              <div>
                <label className="text-[12px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">Task Title *</label>
                <input
                  autoFocus
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Complete patient intake forms"
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 text-[14px] focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 bg-slate-50 focus:bg-white transition-colors"
                />
              </div>

              {/* Type */}
              <div>
                <label className="text-[12px] font-bold text-slate-600 uppercase tracking-wide mb-2 block">Task Type</label>
                <div className="flex gap-2">
                  {(['general', 'checklist'] as TaskType[]).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTaskType(t)}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-2 h-10 rounded-xl border text-[13px] font-semibold transition-colors',
                        taskType === t
                          ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50',
                      )}
                    >
                      {t === 'general' ? <FileText className="h-4 w-4" /> : <ListChecks className="h-4 w-4" />}
                      {t === 'general' ? 'General' : 'Checklist'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes / Description */}
              <div>
                <label className="text-[12px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">
                  {taskType === 'checklist' ? 'Notes (optional)' : 'Description'}
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  placeholder={taskType === 'checklist' ? 'Any additional context…' : 'Describe what needs to be done…'}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-[14px] resize-none focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 bg-slate-50 focus:bg-white transition-colors"
                />
              </div>

              {/* Checklist items */}
              {taskType === 'checklist' && (
                <div>
                  <label className="text-[12px] font-bold text-slate-600 uppercase tracking-wide mb-2 block">Checklist Items</label>
                  <div className="space-y-2">
                    {items.map((item, idx) => (
                      <div key={item.id} className="flex items-center gap-2">
                        <span className="text-[12px] text-slate-400 w-4 text-right shrink-0">{idx + 1}.</span>
                        <input
                          value={item.text}
                          onChange={e => updateItem(item.id, e.target.value)}
                          placeholder={`Item ${idx + 1}`}
                          className="flex-1 h-9 px-3 rounded-xl border border-slate-200 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 bg-slate-50 focus:bg-white transition-colors"
                        />
                        {items.length > 1 && (
                          <button onClick={() => removeItem(item.id)} className="h-9 w-9 flex items-center justify-center rounded-xl hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={addItem}
                    className="mt-2 flex items-center gap-1.5 h-9 px-3 rounded-xl text-[12.5px] font-semibold text-[#1e3a5f] bg-[#1e3a5f]/5 hover:bg-[#1e3a5f]/10 border border-[#1e3a5f]/10 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Item
                  </button>
                </div>
              )}

              {/* Priority */}
              <div>
                <label className="text-[12px] font-bold text-slate-600 uppercase tracking-wide mb-2 block">Priority</label>
                <div className="flex gap-2">
                  {(['low', 'medium', 'high', 'urgent'] as TaskPriority[]).map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={cn(
                        'flex-1 h-9 rounded-xl border text-[12px] font-bold capitalize transition-colors',
                        priority === p
                          ? p === 'urgent' ? 'bg-red-500 text-white border-red-500'
                          : p === 'high'   ? 'bg-amber-400 text-white border-amber-400'
                          : p === 'medium' ? 'bg-blue-500 text-white border-blue-500'
                          : 'bg-slate-500 text-white border-slate-500'
                          : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50',
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Due date */}
              <div>
                <label className="text-[12px] font-bold text-slate-600 uppercase tracking-wide mb-2 block">Due Date (optional)</label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className="flex-1 h-10 px-3 rounded-xl border border-slate-200 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 bg-slate-50 focus:bg-white transition-colors"
                  />
                  {dueDate && (
                    <input
                      type="time"
                      value={dueTime}
                      onChange={e => setDueTime(e.target.value)}
                      className="w-28 h-10 px-3 rounded-xl border border-slate-200 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 bg-slate-50 focus:bg-white transition-colors"
                    />
                  )}
                </div>
              </div>

              {err && <p className="text-[12.5px] text-red-500 flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5 shrink-0" />{err}</p>}
            </>
          )}
        </div>

        {/* Footer */}
        {step === 'task' && (
          <div className="sticky bottom-0 bg-white rounded-b-3xl border-t border-slate-100 px-6 py-4 flex items-center justify-between gap-3">
            <button
              onClick={onClose}
              className="h-10 px-5 rounded-xl border border-slate-200 text-[13.5px] font-medium text-slate-500 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !title.trim()}
              className="flex items-center gap-2 h-10 px-6 rounded-xl bg-[#1e3a5f] hover:bg-[#16304f] disabled:opacity-50 text-white text-[13.5px] font-semibold transition-colors"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckSquare className="h-4 w-4" />}
              {submitting ? 'Assigning…' : 'Assign Task'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Shell
// ─────────────────────────────────────────────────────────────

interface TasksShellProps {
  role: AppRole | null;
  currentUserId: string;
  assignedByMe: TaskWithDetails[];
  myReceivedTasks: TaskWithDetails[];
}

type TabKey = 'assigned' | 'received';
type StatusFilter = 'all' | 'todo' | 'in_progress' | 'done' | 'overdue';

export function TasksShell({ role, currentUserId, assignedByMe, myReceivedTasks }: TasksShellProps) {
  const isAssigner = !!role && ASSIGNER_ROLES.includes(role);
  const isSuperAdmin = role === 'super_admin' || role === 'org_admin';

  const [tab, setTab] = useState<TabKey>(isAssigner ? 'assigned' : 'received');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showModal, setShowModal] = useState(false);

  // Optimistic state
  const [assignedTasks, setAssignedTasks] = useState<TaskWithDetails[]>(assignedByMe);
  const [receivedTasks, setReceivedTasks] = useState<TaskWithDetails[]>(myReceivedTasks);

  const activeTasks = tab === 'assigned' ? assignedTasks : receivedTasks;
  const setActiveTasks = tab === 'assigned' ? setAssignedTasks : setReceivedTasks;

  const handleOptimisticUpdate = useCallback((taskId: string, patch: Partial<TaskWithDetails>) => {
    setAssignedTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...patch } : t));
    setReceivedTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...patch } : t));
  }, []);

  const handleDelete = useCallback((taskId: string) => {
    setAssignedTasks(prev => prev.filter(t => t.id !== taskId));
    setReceivedTasks(prev => prev.filter(t => t.id !== taskId));
  }, []);

  const handleCreated = useCallback((task: TaskWithDetails) => {
    setAssignedTasks(prev => [task, ...prev]);
  }, []);

  // Stats
  const now = new Date();
  const statsSource = isSuperAdmin ? assignedTasks : (tab === 'assigned' ? assignedTasks : receivedTasks);
  const stats = useMemo(() => ({
    total:       statsSource.length,
    todo:        statsSource.filter(t => t.status === 'todo').length,
    in_progress: statsSource.filter(t => t.status === 'in_progress').length,
    completed:   statsSource.filter(t => t.status === 'done').length,
    overdue:     statsSource.filter(t => isOverdue(t)).length,
  }), [statsSource]);

  // Filtered feed
  const feed = useMemo(() => {
    let list = activeTasks;
    if (statusFilter === 'overdue') list = list.filter(t => isOverdue(t));
    else if (statusFilter !== 'all') list = list.filter(t => t.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.title.toLowerCase().includes(q) ||
        personName(t.assignee).toLowerCase().includes(q) ||
        personName(t.creator).toLowerCase().includes(q),
      );
    }
    return list;
  }, [activeTasks, statusFilter, search]);

  const receivedCount = receivedTasks.filter(t => t.status !== 'done' && t.status !== 'cancelled').length;

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="shrink-0 px-6 py-5 bg-[#1e3a5f] flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center">
            <CheckSquare className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-[22px] font-bold text-white leading-tight">
              {isAssigner ? 'Tasks' : 'My Tasks'}
            </h1>
            <p className="text-white/60 text-[13px]">
              {isAssigner ? 'Assign and track team tasks' : 'Your assigned work and progress'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isAssigner && receivedCount > 0 && (
            <span className="h-7 min-w-7 px-2 rounded-full bg-red-500 text-white text-[12px] font-bold flex items-center justify-center">
              {receivedCount}
            </span>
          )}
          {isAssigner && (
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 h-10 px-5 rounded-xl bg-white text-[#1e3a5f] text-[13.5px] font-bold hover:bg-white/90 transition-colors shadow-sm"
            >
              <Plus className="h-4 w-4" /> Assign Task
            </button>
          )}
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-4 bg-slate-50 border-b border-slate-200">
        <StatCard value={stats.total}       label="Total"       color="bg-[#1e3a5f]"    icon={CheckSquare} />
        <StatCard value={stats.completed}   label="Completed"   color="bg-emerald-500"   icon={CheckCircle2} />
        <StatCard value={stats.in_progress} label="In Progress" color="bg-blue-500"      icon={AlarmClock} />
        <StatCard value={stats.overdue}     label="Overdue"     color={stats.overdue > 0 ? 'bg-red-500' : 'bg-slate-400'} icon={AlertTriangle} />
      </div>

      {/* ── Tabs (assigner only) + Filters ── */}
      <div className="shrink-0 flex items-center gap-3 px-6 py-3 border-b border-slate-200 bg-white flex-wrap">
        {isAssigner && (
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            <button
              onClick={() => setTab('assigned')}
              className={cn('h-8 px-4 rounded-lg text-[13px] font-semibold transition-colors', tab === 'assigned' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}
            >
              Assigned by Me
            </button>
            <button
              onClick={() => setTab('received')}
              className={cn('relative h-8 px-4 rounded-lg text-[13px] font-semibold transition-colors', tab === 'received' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}
            >
              My Tasks
              {receivedCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {receivedCount}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Status filter */}
        <div className="flex gap-1.5 flex-wrap">
          {(['all', 'todo', 'in_progress', 'done', 'overdue'] as StatusFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={cn(
                'h-7 px-3 rounded-full text-[11.5px] font-semibold border transition-colors',
                statusFilter === f
                  ? f === 'overdue' ? 'bg-red-500 text-white border-red-500'
                  : f === 'done'    ? 'bg-emerald-500 text-white border-emerald-500'
                  : 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50',
              )}
            >
              {f === 'all' ? 'All' : f === 'in_progress' ? 'In Progress' : f.charAt(0).toUpperCase() + f.slice(1)}
              {f !== 'all' && (
                <span className="ml-1 opacity-70">
                  {f === 'overdue' ? stats.overdue : f === 'todo' ? stats.todo : f === 'in_progress' ? stats.in_progress : stats.completed}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="ml-auto relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-300" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tasks…"
            className="h-8 pl-8 pr-8 rounded-xl border border-slate-200 text-[12.5px] bg-slate-50 focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]/30 focus:bg-white transition-colors w-44"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Task Feed ── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-3">
        {feed.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <div className="h-16 w-16 rounded-2xl bg-slate-100 flex items-center justify-center">
              <CheckSquare className="h-8 w-8 text-slate-300" />
            </div>
            <p className="text-[14.5px] font-semibold text-slate-500">
              {search || statusFilter !== 'all' ? 'No tasks match the filter' : tab === 'assigned' ? 'No tasks assigned yet' : 'No tasks received yet'}
            </p>
            {isAssigner && !search && statusFilter === 'all' && tab === 'assigned' && (
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-2 h-10 px-5 rounded-xl bg-[#1e3a5f] text-white text-[13.5px] font-semibold hover:bg-[#16304f] transition-colors"
              >
                <Plus className="h-4 w-4" /> Assign your first task
              </button>
            )}
          </div>
        ) : (
          feed.map(task => (
            <TaskRow
              key={task.id}
              task={task}
              isAssigner={isAssigner}
              currentUserId={currentUserId}
              showAssignee={tab === 'assigned'}
              onOptimisticUpdate={handleOptimisticUpdate}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <AssignTaskModal
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
