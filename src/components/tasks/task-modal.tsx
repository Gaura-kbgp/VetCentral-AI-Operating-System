'use client';

import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import {
  format, addDays, endOfMonth, startOfWeek, endOfWeek,
  startOfMonth, isSameDay, isSameMonth, isToday, addMonths, subMonths,
  parseISO, isBefore, startOfDay,
} from 'date-fns';
import {
  Calendar, Clock, ChevronLeft, ChevronRight, Building2,
  AlertTriangle, CheckCircle2, User, Loader2, ChevronDown,
  Plus, Paperclip, X, Check, Tag, FileText,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import type { Task, TaskPriority, TaskStatus, CreateTaskInput } from '@/types/app';

// ── Types ──────────────────────────────────────────────────────────────────────
interface TeamMember {
  id: string;
  first_name: string | null;
  last_name:  string | null;
  avatar_url: string | null;
  job_title:  string | null;
}

interface Hospital { id: string; name: string; color: string | null; }

interface Subtask { id: string; text: string; done: boolean; }

interface TaskModalProps {
  task:        Task | null;
  teamMembers: TeamMember[];
  tasks?:      Task[];
  onSubmit:    (data: CreateTaskInput) => void;
  onClose:     () => void;
  isPending:   boolean;
}

// ── Priority config ────────────────────────────────────────────────────────────
const PRIORITY_CONFIG: Record<TaskPriority, { label: string; idle: string; active: string; dot: string; badge: string }> = {
  low:    { label: 'Low',    idle: 'text-slate-500 border-slate-200 bg-white hover:bg-slate-50',             active: 'bg-slate-600 text-white border-slate-600',    dot: 'bg-slate-400',  badge: 'bg-slate-100 text-slate-600'   },
  medium: { label: 'Medium', idle: 'text-amber-600 border-amber-200 bg-amber-50/60 hover:bg-amber-100',      active: 'bg-amber-500 text-white border-amber-500',    dot: 'bg-amber-400',  badge: 'bg-amber-100 text-amber-700'   },
  high:   { label: 'High',   idle: 'text-orange-600 border-orange-200 bg-orange-50/60 hover:bg-orange-100',  active: 'bg-orange-500 text-white border-orange-500',  dot: 'bg-orange-500', badge: 'bg-orange-100 text-orange-700' },
  urgent: { label: 'Urgent', idle: 'text-red-600 border-red-200 bg-red-50/60 hover:bg-red-100',              active: 'bg-red-600 text-white border-red-600',        dot: 'bg-red-500',    badge: 'bg-red-100 text-red-700'       },
};

// ── Status config ──────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<TaskStatus, { label: string; idle: string; active: string }> = {
  todo:        { label: 'To Do',       idle: 'text-slate-500 border-slate-200 bg-white hover:bg-slate-50',             active: 'bg-slate-700 text-white border-slate-700'     },
  in_progress: { label: 'In Progress', idle: 'text-blue-600 border-blue-200 bg-blue-50/60 hover:bg-blue-100',          active: 'bg-blue-600 text-white border-blue-600'       },
  review:      { label: 'In Review',   idle: 'text-amber-600 border-amber-200 bg-amber-50/60 hover:bg-amber-100',      active: 'bg-amber-500 text-white border-amber-500'     },
  done:        { label: 'Done',        idle: 'text-emerald-600 border-emerald-200 bg-emerald-50/60 hover:bg-emerald-100', active: 'bg-emerald-600 text-white border-emerald-600' },
  cancelled:   { label: 'Cancelled',   idle: 'text-red-500 border-red-200 bg-red-50/60 hover:bg-red-100',              active: 'bg-red-500 text-white border-red-500'         },
};

// ── Time slots ─────────────────────────────────────────────────────────────────
const TIME_SLOTS = (() => {
  const slots: { label: string; value: string }[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const value  = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
      const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      const ampm   = h < 12 ? 'AM' : 'PM';
      slots.push({ label: `${hour12}:${m.toString().padStart(2,'0')} ${ampm}`, value });
    }
  }
  return slots;
})();

const SUGGESTED_TIMES = [
  { label: '8:00 AM',  value: '08:00' },
  { label: '9:00 AM',  value: '09:00' },
  { label: '12:00 PM', value: '12:00' },
  { label: '2:30 PM',  value: '14:30' },
  { label: '4:00 PM',  value: '16:00' },
  { label: '5:30 PM',  value: '17:30' },
];

const QUICK_CHIPS = [
  { label: '🔴 High Priority', priority: 'urgent' as TaskPriority, status: null },
  { label: '📋 Follow Up',     priority: 'medium' as TaskPriority, status: 'todo' as TaskStatus },
  { label: '👥 Meeting',       priority: 'medium' as TaskPriority, status: null },
  { label: '📚 Training',      priority: 'medium' as TaskPriority, status: null },
  { label: '✅ Compliance',    priority: 'high'   as TaskPriority, status: 'in_progress' as TaskStatus },
  { label: '⚙️ Operations',    priority: 'high'   as TaskPriority, status: null },
];

const CATEGORIES = ['General', 'Clinical', 'Administrative', 'Training', 'Compliance', 'Operations', 'HR', 'Finance'];
const DEPARTMENTS = ['', 'Medical', 'Surgery', 'Emergency', 'Admin & HR', 'Reception', 'Pharmacy', 'Radiology', 'Operations'];

// ── Label ─────────────────────────────────────────────────────────────────────
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">{children}</p>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function TaskModal({ task, teamMembers, tasks = [], onSubmit, onClose, isPending }: TaskModalProps) {
  // Core fields
  const [priority,    setPriority]    = useState<TaskPriority>(task?.priority   ?? 'medium');
  const [status,      setStatus]      = useState<TaskStatus>(task?.status       ?? 'todo');
  const [assignedTo,  setAssignedTo]  = useState<string>(task?.assigned_to      ?? '');
  const [hospitalId,  setHospitalId]  = useState<string>(task?.hospital_id      ?? '');
  const [dueDate,     setDueDate]     = useState<Date | null>(task?.due_date ? parseISO(task.due_date) : null);
  const [dueTime,     setDueTime]     = useState<string>(task?.due_date ? format(parseISO(task.due_date), 'HH:mm') : '');

  // New fields (UI only)
  const [subtasks,      setSubtasks]      = useState<Subtask[]>([]);
  const [newSubtask,    setNewSubtask]    = useState('');
  const [notes,         setNotes]         = useState('');
  const [selectedCat,   setSelectedCat]   = useState('');
  const [department,    setDepartment]    = useState('');
  const [tags,          setTags]          = useState<string[]>([]);
  const [tagInput,      setTagInput]      = useState('');

  // Dropdown toggles
  const [calOpen,      setCalOpen]      = useState(false);
  const [timeOpen,     setTimeOpen]     = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [calMonth,     setCalMonth]     = useState<Date>(task?.due_date ? parseISO(task.due_date) : new Date());

  const assigneeRef = useRef<HTMLDivElement>(null);
  const timeRef     = useRef<HTMLDivElement>(null);

  // Hospitals via React Query (cached)
  const { data: hospitals = [] } = useQuery<Hospital[]>({
    queryKey: ['hospitals'],
    queryFn: async () => {
      const { data } = await createSupabaseBrowserClient()
        .from('hospitals').select('id,name,color').order('name');
      return (data ?? []) as Hospital[];
    },
  });

  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      title:       task?.title       ?? '',
      description: task?.description ?? '',
    },
  });

  // Click-outside for dropdowns
  useEffect(() => {
    function handleDown(e: MouseEvent) {
      if (assigneeRef.current && !assigneeRef.current.contains(e.target as Node)) setAssigneeOpen(false);
      if (timeRef.current     && !timeRef.current.contains(e.target as Node))     setTimeOpen(false);
    }
    document.addEventListener('mousedown', handleDown);
    return () => document.removeEventListener('mousedown', handleDown);
  }, []);

  // Derived
  const today         = startOfDay(new Date());
  const selectedMember = teamMembers.find(m => m.id === assignedTo);
  const memberName     = selectedMember
    ? `${selectedMember.first_name ?? ''} ${selectedMember.last_name ?? ''}`.trim()
    : '';

  const memberTasks   = tasks.filter(t => t.assigned_to === assignedTo && t.id !== task?.id);
  const activeTasks   = memberTasks.filter(t => !['done','cancelled'].includes(t.status));
  const dueTodayCount = memberTasks.filter(t => t.due_date && isSameDay(parseISO(t.due_date), today) && !['done','cancelled'].includes(t.status)).length;
  const overdueCount  = memberTasks.filter(t => t.due_date && isBefore(parseISO(t.due_date), today) && !['done','cancelled'].includes(t.status)).length;
  const conflictCount = dueDate && assignedTo
    ? tasks.filter(t => t.assigned_to === assignedTo && t.id !== task?.id && t.due_date && isSameDay(parseISO(t.due_date), dueDate) && !['done','cancelled'].includes(t.status)).length
    : 0;

  const timeLabelDisplay = dueTime ? (TIME_SLOTS.find(t => t.value === dueTime)?.label ?? dueTime) : null;

  // Calendar days
  const calDays: Date[] = [];
  {
    let d = startOfWeek(startOfMonth(calMonth));
    const calEnd = endOfWeek(endOfMonth(calMonth));
    while (d <= calEnd) { calDays.push(d); d = addDays(d, 1); }
  }

  const quickDates = [
    { label: 'Today',        date: new Date() },
    { label: 'Tomorrow',     date: addDays(new Date(), 1) },
    { label: 'Next Week',    date: addDays(new Date(), 7) },
    { label: 'End of Month', date: endOfMonth(new Date()) },
  ];

  // Subtask helpers
  function addSubtask() {
    const t = newSubtask.trim();
    if (!t) return;
    setSubtasks(prev => [...prev, { id: crypto.randomUUID(), text: t, done: false }]);
    setNewSubtask('');
  }
  function toggleSubtask(id: string) {
    setSubtasks(prev => prev.map(s => s.id === id ? { ...s, done: !s.done } : s));
  }
  function removeSubtask(id: string) {
    setSubtasks(prev => prev.filter(s => s.id !== id));
  }

  // Tag helpers
  function addTag(val: string) {
    const t = val.trim();
    if (t && !tags.includes(t)) setTags(prev => [...prev, t]);
    setTagInput('');
  }
  function removeTag(t: string) { setTags(prev => prev.filter(x => x !== t)); }

  // Submit
  function onFormSubmit(values: { title: string; description: string }, asDraft = false) {
    let fullDescription = values.description || '';
    if (subtasks.length > 0) {
      fullDescription += (fullDescription ? '\n\n' : '') + '**Subtasks:**\n' +
        subtasks.map(s => `- [${s.done ? 'x' : ' '}] ${s.text}`).join('\n');
    }
    if (notes) {
      fullDescription += (fullDescription ? '\n\n' : '') + '**Notes:**\n' + notes;
    }

    let dueDateISO: string | null = null;
    if (dueDate) {
      const d = new Date(dueDate);
      if (dueTime) { const [h, m] = dueTime.split(':').map(Number); d.setHours(h, m, 0, 0); }
      dueDateISO = d.toISOString();
    }
    onSubmit({
      title:       values.title,
      description: fullDescription || null,
      priority,
      status:      asDraft ? 'todo' : status,
      due_date:    dueDateISO,
      assigned_to: assignedTo || null,
      hospital_id: hospitalId || null,
    });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent
        className="sm:max-w-none max-w-none p-0 gap-0 overflow-hidden border-0 shadow-2xl"
        style={{ width: '90vw', height: '88vh', maxHeight: '88vh' }}
      >
        <form
          onSubmit={handleSubmit(v => onFormSubmit(v))}
          className="flex flex-col overflow-hidden bg-white"
          style={{ height: '88vh' }}
        >
          {/* ── Top bar ─────────────────────────────────────────────────── */}
          <div className="shrink-0 flex items-center justify-between px-8 py-4 pr-16 border-b border-slate-100 bg-white">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                {task ? 'Edit Task' : 'Create Task'}
              </h2>
              <p className="text-sm text-slate-400 mt-0.5">
                {task ? 'Update task details below' : 'Fill in the details to create a new task for your team'}
              </p>
            </div>
            {/* Quick chips inline in header area on wide screens */}
            <div className="hidden lg:flex items-center gap-2 flex-wrap mr-4">
              {QUICK_CHIPS.map(chip => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => { setPriority(chip.priority); if (chip.status) setStatus(chip.status); }}
                  className="px-3 py-1.5 rounded-full text-xs font-medium bg-white border border-slate-200 text-slate-600 hover:border-[#1e3a5f] hover:text-[#1e3a5f] hover:bg-blue-50/60 transition-all whitespace-nowrap"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          {/* Quick chips on smaller screens */}
          <div className="lg:hidden shrink-0 flex items-center gap-2 px-8 py-2.5 border-b border-slate-100 bg-slate-50/80 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0">Quick:</span>
            {QUICK_CHIPS.map(chip => (
              <button
                key={chip.label}
                type="button"
                onClick={() => { setPriority(chip.priority); if (chip.status) setStatus(chip.status); }}
                className="px-3 py-1 rounded-full text-xs font-medium bg-white border border-slate-200 text-slate-600 hover:border-[#1e3a5f] hover:text-[#1e3a5f] transition-all"
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* ── Body ────────────────────────────────────────────────────── */}
          <div className="flex-1 min-h-0 overflow-hidden grid grid-cols-1 lg:grid-cols-[1fr_380px]">

            {/* ─── LEFT COLUMN ─────────────────────────────────────────── */}
            <div className="overflow-y-auto min-h-0 px-8 py-6 space-y-7 border-r border-slate-100">

              {/* Title */}
              <div>
                <input
                  {...register('title', { required: 'Title is required' })}
                  placeholder="Task title…"
                  autoFocus
                  className={`w-full text-2xl font-semibold text-slate-900 placeholder:text-slate-300 bg-transparent outline-none border-b-2 pb-3 focus:border-[#1e3a5f] transition-colors ${errors.title ? 'border-red-400' : 'border-slate-200'}`}
                />
                {errors.title && (
                  <p className="text-xs text-red-500 mt-1.5">{errors.title.message as string}</p>
                )}
              </div>

              {/* Description */}
              <div>
                <FieldLabel>Description</FieldLabel>
                <Textarea
                  {...register('description')}
                  placeholder="Add context, requirements, or instructions for this task…"
                  rows={8}
                  className="resize-none text-sm text-slate-700 placeholder:text-slate-300 bg-slate-50/60 border-slate-200 focus:border-[#1e3a5f] rounded-xl leading-relaxed"
                />
              </div>

              {/* Priority */}
              <div>
                <FieldLabel>Priority</FieldLabel>
                <div className="flex gap-2 flex-wrap">
                  {(['low','medium','high','urgent'] as TaskPriority[]).map(p => {
                    const cfg    = PRIORITY_CONFIG[p];
                    const active = priority === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPriority(p)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all ${active ? cfg.active : cfg.idle}`}
                      >
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${active ? 'bg-white/80' : cfg.dot}`} />
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Status */}
              <div>
                <FieldLabel>Status</FieldLabel>
                <div className="flex gap-2 flex-wrap">
                  {(['todo','in_progress','review','done','cancelled'] as TaskStatus[]).map(s => {
                    const cfg    = STATUS_CONFIG[s];
                    const active = status === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setStatus(s)}
                        className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition-all ${active ? cfg.active : cfg.idle}`}
                      >
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Subtasks / Checklist */}
              <div>
                <FieldLabel>Subtasks</FieldLabel>
                <div className="space-y-2">
                  {subtasks.map(st => (
                    <div key={st.id} className="flex items-center gap-3 group px-3 py-2.5 rounded-xl bg-white border border-slate-100 hover:border-slate-200 transition-all">
                      <button
                        type="button"
                        onClick={() => toggleSubtask(st.id)}
                        className={`h-5 w-5 rounded flex items-center justify-center shrink-0 border-2 transition-all ${st.done ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 hover:border-emerald-400'}`}
                      >
                        {st.done && <Check className="h-3 w-3 text-white" />}
                      </button>
                      <span className={`flex-1 text-sm ${st.done ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                        {st.text}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeSubtask(st.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-red-50 text-slate-300 hover:text-red-500 transition-all"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}

                  <div className="flex items-center gap-2 mt-2">
                    <input
                      value={newSubtask}
                      onChange={e => setNewSubtask(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSubtask(); } }}
                      placeholder="Add a subtask and press Enter…"
                      className="flex-1 text-sm px-3.5 py-2.5 border-2 border-dashed border-slate-200 rounded-xl bg-white placeholder:text-slate-300 focus:border-[#1e3a5f] focus:outline-none transition-colors"
                    />
                    <button
                      type="button"
                      onClick={addSubtask}
                      className="h-10 w-10 rounded-xl bg-slate-100 hover:bg-[#1e3a5f] hover:text-white text-slate-500 flex items-center justify-center transition-all shrink-0"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>

                  {subtasks.length > 0 && (
                    <p className="text-xs text-slate-400">
                      {subtasks.filter(s => s.done).length}/{subtasks.length} completed
                    </p>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="h-3.5 w-3.5 text-slate-400" />
                  <FieldLabel>Notes</FieldLabel>
                </div>
                <Textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Add private notes, context, or reminders for this task…"
                  rows={3}
                  className="resize-none text-sm text-slate-700 placeholder:text-slate-300 bg-slate-50/60 border-slate-200 focus:border-[#1e3a5f] rounded-xl"
                />
              </div>

              {/* Attachments */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Paperclip className="h-3.5 w-3.5 text-slate-400" />
                  <FieldLabel>Attachments</FieldLabel>
                </div>
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-slate-300 hover:bg-slate-50/60 cursor-pointer transition-all group">
                  <Paperclip className="h-7 w-7 text-slate-300 group-hover:text-slate-400 mx-auto mb-2 transition-colors" />
                  <p className="text-sm font-medium text-slate-400 group-hover:text-slate-500 transition-colors">Drop files here or click to attach</p>
                  <p className="text-xs text-slate-300 mt-1">PDF, Images, Documents — up to 10MB each</p>
                </div>
              </div>
            </div>

            {/* ─── RIGHT COLUMN ────────────────────────────────────────── */}
            <div className="overflow-y-auto min-h-0 px-6 py-6 space-y-6 bg-slate-50/40 border-t border-slate-100 lg:border-t-0">

              {/* Assignee */}
              <div>
                <FieldLabel>Assignee</FieldLabel>
                <div ref={assigneeRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setAssigneeOpen(v => !v)}
                    className={`w-full flex items-center gap-3 px-4 py-3 bg-white border rounded-xl text-sm text-left transition-all ${assigneeOpen ? 'border-[#1e3a5f] ring-2 ring-[#1e3a5f]/10' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    {selectedMember ? (
                      <>
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarImage src={selectedMember.avatar_url ?? undefined} />
                          <AvatarFallback className="text-xs bg-[#1e3a5f]/10 text-[#1e3a5f] font-semibold">
                            {selectedMember.first_name?.[0]}{selectedMember.last_name?.[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-800 text-sm truncate">{memberName}</p>
                          {selectedMember.job_title && (
                            <p className="text-[11px] text-slate-400 truncate">{selectedMember.job_title}</p>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                          <User className="h-4 w-4 text-slate-400" />
                        </div>
                        <span className="text-slate-400 text-sm flex-1">Unassigned</span>
                      </>
                    )}
                    <ChevronDown className={`h-4 w-4 text-slate-300 shrink-0 transition-transform ${assigneeOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {assigneeOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-60 overflow-y-auto">
                      <div className="p-2">
                        <button
                          type="button"
                          onClick={() => { setAssignedTo(''); setAssigneeOpen(false); }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors text-left"
                        >
                          <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                            <User className="h-3.5 w-3.5 text-slate-400" />
                          </div>
                          <span className="text-sm text-slate-400">Unassigned</span>
                        </button>
                        {teamMembers.map(m => {
                          const name = `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim();
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => { setAssignedTo(m.id); setAssigneeOpen(false); }}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors text-left ${assignedTo === m.id ? 'bg-blue-50/70' : ''}`}
                            >
                              <Avatar className="h-8 w-8 shrink-0">
                                <AvatarImage src={m.avatar_url ?? undefined} />
                                <AvatarFallback className="text-xs bg-[#1e3a5f]/10 text-[#1e3a5f] font-semibold">
                                  {m.first_name?.[0]}{m.last_name?.[0]}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-700 truncate">{name}</p>
                                {m.job_title && <p className="text-[11px] text-slate-400 truncate">{m.job_title}</p>}
                              </div>
                              {assignedTo === m.id && <CheckCircle2 className="h-4 w-4 text-[#1e3a5f] shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Workload */}
                {selectedMember && (
                  <div className="mt-3 bg-white border border-slate-200 rounded-xl px-4 py-3.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">Current Workload</p>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-2xl font-bold text-slate-800 leading-none">{activeTasks.length}</p>
                        <p className="text-[11px] text-slate-400 mt-1">Active</p>
                      </div>
                      <div>
                        <p className={`text-2xl font-bold leading-none ${dueTodayCount > 0 ? 'text-amber-600' : 'text-slate-800'}`}>{dueTodayCount}</p>
                        <p className="text-[11px] text-slate-400 mt-1">Due Today</p>
                      </div>
                      <div>
                        <p className={`text-2xl font-bold leading-none ${overdueCount > 0 ? 'text-red-600' : 'text-slate-800'}`}>{overdueCount}</p>
                        <p className="text-[11px] text-slate-400 mt-1">Overdue</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Due Date — inline expandable calendar */}
              <div>
                <FieldLabel>Due Date</FieldLabel>
                <button
                  type="button"
                  onClick={() => setCalOpen(v => !v)}
                  className={`w-full flex items-center gap-3 px-4 py-3 bg-white border rounded-xl text-sm text-left transition-all ${calOpen ? 'border-[#1e3a5f] ring-2 ring-[#1e3a5f]/10' : 'border-slate-200 hover:border-slate-300'}`}
                >
                  <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
                  {dueDate ? (
                    <span className="flex-1 font-semibold text-slate-800">{format(dueDate, 'EEE, MMM d yyyy')}</span>
                  ) : (
                    <span className="flex-1 text-slate-400">Pick a due date</span>
                  )}
                  <div className="flex items-center gap-1">
                    {dueDate && (
                      <span
                        role="button"
                        onClick={e => { e.stopPropagation(); setDueDate(null); }}
                        className="text-slate-300 hover:text-slate-500 transition-colors text-lg leading-none"
                      >
                        ×
                      </span>
                    )}
                    <ChevronDown className={`h-4 w-4 text-slate-300 transition-transform ${calOpen ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {calOpen && (
                  <div className="mt-2 bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                    {/* Quick picks */}
                    <div className="grid grid-cols-2 gap-1.5 mb-4">
                      {quickDates.map(q => (
                        <button
                          key={q.label}
                          type="button"
                          onClick={() => { setDueDate(q.date); setCalMonth(q.date); setCalOpen(false); }}
                          className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all text-left ${dueDate && isSameDay(dueDate, q.date) ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-[#1e3a5f] hover:text-[#1e3a5f] hover:bg-blue-50/60'}`}
                        >
                          {q.label}
                        </button>
                      ))}
                    </div>

                    {/* Month nav */}
                    <div className="flex items-center justify-between mb-3">
                      <button type="button" onClick={() => setCalMonth(m => subMonths(m, 1))}
                        className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                        <ChevronLeft className="h-4 w-4 text-slate-500" />
                      </button>
                      <span className="text-sm font-semibold text-slate-700">{format(calMonth, 'MMMM yyyy')}</span>
                      <button type="button" onClick={() => setCalMonth(m => addMonths(m, 1))}
                        className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                        <ChevronRight className="h-4 w-4 text-slate-500" />
                      </button>
                    </div>

                    {/* Day headers */}
                    <div className="grid grid-cols-7 mb-1">
                      {['Su','Mo','Tu','We','Th','Fr','Sa'].map((d, i) => (
                        <div key={i} className="text-center text-[10px] font-bold text-slate-400 py-1">{d}</div>
                      ))}
                    </div>

                    {/* Days */}
                    <div className="grid grid-cols-7 gap-0.5">
                      {calDays.map((day, i) => {
                        const inMonth  = isSameMonth(day, calMonth);
                        const selected = dueDate && isSameDay(day, dueDate);
                        const todayDay = isToday(day);
                        const past     = isBefore(day, today) && !isSameDay(day, today);
                        return (
                          <button
                            key={i}
                            type="button"
                            disabled={past}
                            onClick={() => { setDueDate(day); setCalOpen(false); }}
                            className={`w-full aspect-square flex items-center justify-center rounded-lg text-xs font-medium transition-all disabled:cursor-not-allowed
                              ${selected ? 'bg-[#1e3a5f] text-white shadow-sm' : ''}
                              ${todayDay && !selected ? 'ring-2 ring-[#1e3a5f] ring-inset text-[#1e3a5f] font-bold' : ''}
                              ${!selected && !todayDay && inMonth && !past ? 'text-slate-700 hover:bg-slate-100' : ''}
                              ${past || !inMonth ? 'text-slate-200' : ''}
                            `}
                          >
                            {format(day, 'd')}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Due Time */}
              <div>
                <FieldLabel>Due Time</FieldLabel>
                <div ref={timeRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setTimeOpen(v => !v)}
                    className={`w-full flex items-center gap-3 px-4 py-3 bg-white border rounded-xl text-sm text-left transition-all ${timeOpen ? 'border-[#1e3a5f] ring-2 ring-[#1e3a5f]/10' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <Clock className="h-4 w-4 text-slate-400 shrink-0" />
                    {timeLabelDisplay ? (
                      <span className="flex-1 font-semibold text-slate-800">{timeLabelDisplay}</span>
                    ) : (
                      <span className="flex-1 text-slate-400">Set a time</span>
                    )}
                    {dueTime ? (
                      <span
                        role="button"
                        onClick={e => { e.stopPropagation(); setDueTime(''); }}
                        className="text-slate-300 hover:text-slate-500 transition-colors text-lg leading-none"
                      >
                        ×
                      </span>
                    ) : (
                      <ChevronDown className={`h-4 w-4 text-slate-300 transition-transform ${timeOpen ? 'rotate-180' : ''}`} />
                    )}
                  </button>

                  {timeOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-50">
                      <div className="px-4 pt-3.5 pb-2.5 border-b border-slate-100">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">Suggested</p>
                        <div className="grid grid-cols-3 gap-1.5">
                          {SUGGESTED_TIMES.map(t => (
                            <button
                              key={t.value}
                              type="button"
                              onClick={() => { setDueTime(t.value); setTimeOpen(false); }}
                              className={`px-2.5 py-2 rounded-lg text-xs font-medium border transition-all ${dueTime === t.value ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-[#1e3a5f] hover:text-[#1e3a5f]'}`}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="px-4 pt-2.5 pb-1">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">All Times</p>
                      </div>
                      <div className="max-h-44 overflow-y-auto px-4 pb-3 grid grid-cols-2 gap-0.5">
                        {TIME_SLOTS.map(t => (
                          <button
                            key={t.value}
                            type="button"
                            onClick={() => { setDueTime(t.value); setTimeOpen(false); }}
                            className={`px-3 py-2 rounded-lg text-xs font-medium transition-all text-left ${dueTime === t.value ? 'bg-[#1e3a5f] text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Conflict warning */}
              {conflictCount > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3.5 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-amber-800">Schedule Conflict</p>
                      <p className="text-xs text-amber-600 mt-0.5">
                        {memberName} already has {conflictCount} task{conflictCount !== 1 ? 's' : ''} due on this date.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => dueDate && setDueDate(addDays(dueDate, 1))}
                      className="flex-1 text-xs font-semibold px-3 py-2 bg-white border border-amber-200 text-amber-700 rounded-lg hover:bg-amber-100 transition-colors"
                    >
                      Move to tomorrow
                    </button>
                    <button
                      type="button"
                      onClick={() => setAssignedTo('')}
                      className="flex-1 text-xs font-semibold px-3 py-2 bg-white border border-amber-200 text-amber-700 rounded-lg hover:bg-amber-100 transition-colors"
                    >
                      Reassign
                    </button>
                  </div>
                </div>
              )}

              {/* Hospital */}
              {hospitals.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Building2 className="h-3.5 w-3.5 text-slate-400" />
                    <FieldLabel>Hospital</FieldLabel>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setHospitalId('')}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${hospitalId === '' ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
                    >
                      All
                    </button>
                    {hospitals.map(h => (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => setHospitalId(h.id)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${hospitalId === h.id ? 'text-white border-transparent' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                        style={hospitalId === h.id ? { backgroundColor: h.color ?? '#1e3a5f', borderColor: h.color ?? '#1e3a5f' } : {}}
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: h.color ?? '#94a3b8' }} />
                        {h.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Department */}
              <div>
                <FieldLabel>Department</FieldLabel>
                <select
                  value={department}
                  onChange={e => setDepartment(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:border-[#1e3a5f] focus:ring-2 focus:ring-[#1e3a5f]/10 focus:outline-none transition-all appearance-none cursor-pointer"
                >
                  <option value="">No department</option>
                  {DEPARTMENTS.filter(Boolean).map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              {/* Category */}
              <div>
                <FieldLabel>Category</FieldLabel>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCat(cat === selectedCat ? '' : cat)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${selectedCat === cat ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tags */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Tag className="h-3.5 w-3.5 text-slate-400" />
                  <FieldLabel>Tags</FieldLabel>
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2.5">
                    {tags.map(tag => (
                      <span key={tag} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-medium rounded-full">
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          className="text-blue-400 hover:text-blue-700 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); }
                      if (e.key === ',' && tagInput.trim()) { e.preventDefault(); addTag(tagInput.replace(',', '')); }
                    }}
                    placeholder="Type a tag and press Enter…"
                    className="flex-1 text-sm px-3.5 py-2.5 border border-slate-200 rounded-xl bg-white placeholder:text-slate-300 focus:border-[#1e3a5f] focus:ring-2 focus:ring-[#1e3a5f]/10 focus:outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => addTag(tagInput)}
                    className="h-10 w-10 rounded-xl bg-slate-100 hover:bg-[#1e3a5f] hover:text-white text-slate-500 flex items-center justify-center transition-all shrink-0"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

            </div>
          </div>

          {/* ── Footer ────────────────────────────────────────────────── */}
          <div className="shrink-0 flex items-center justify-between px-8 py-4 border-t border-slate-100 bg-white">
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-slate-500 hover:text-slate-700 font-medium transition-colors px-2"
            >
              Cancel
            </button>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={isPending}
                onClick={handleSubmit(v => onFormSubmit(v, true))}
                className="px-5 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-50"
              >
                Save Draft
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="flex items-center gap-2 px-7 py-2.5 text-sm font-semibold text-white bg-[#1e3a5f] hover:bg-[#16304f] rounded-xl transition-colors disabled:opacity-50 shadow-sm"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    {task ? 'Update Task' : 'Create Task'}
                  </>
                )}
              </button>
            </div>
          </div>

        </form>
      </DialogContent>
    </Dialog>
  );
}
