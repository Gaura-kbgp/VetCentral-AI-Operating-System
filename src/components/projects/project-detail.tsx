'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  FolderOpen, ArrowLeft, Plus, CheckCircle2, Clock, Users, Calendar,
  FileText, BarChart3, Activity, X, Loader2, MoreHorizontal, Trash2,
  Edit3, MessageSquare, ChevronDown, ChevronRight, GripVertical,
  AlertTriangle, Globe, Tag, User, Paperclip, Send, Star,
  TrendingUp, CheckSquare, SquareDashed, Building2, Zap,
  List, Columns, CalendarDays, GitBranch, Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  getProjectTasks, getProjectMembers, getTaskComments, getProjectActivity,
  getProjectFiles, getOrgProfiles,
  createTask, updateTask, deleteTask, addComment, deleteComment,
  addMember, removeMember, updateProject,
} from '@/lib/actions/projects';
import type {
  Project, ProjectTask, ProjectMember, ProjectComment, ProjectActivity,
  ProjectFile, ProjectPriority,
} from '@/lib/actions/projects';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const PRIORITY_CFG: Record<ProjectPriority, { label: string; cls: string; dot: string }> = {
  low:    { label: 'Low',    cls: 'bg-gray-100 text-gray-600',  dot: 'bg-gray-400'  },
  medium: { label: 'Medium', cls: 'bg-blue-50 text-blue-700',   dot: 'bg-blue-500'  },
  high:   { label: 'High',   cls: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  urgent: { label: 'Urgent', cls: 'bg-red-50 text-red-700',     dot: 'bg-red-500'   },
};

const STATUS_COLS = [
  { key: 'todo',        label: 'To Do',       bg: 'bg-gray-50',    border: 'border-gray-200',   headerCls: 'bg-gray-100 text-gray-600' },
  { key: 'in_progress', label: 'In Progress', bg: 'bg-blue-50/40', border: 'border-blue-100',   headerCls: 'bg-blue-100 text-blue-700' },
  { key: 'review',      label: 'Review',      bg: 'bg-amber-50/40',border: 'border-amber-100',  headerCls: 'bg-amber-100 text-amber-700' },
  { key: 'done',        label: 'Done',        bg: 'bg-green-50/40',border: 'border-green-100',  headerCls: 'bg-green-100 text-green-700' },
] as const;

type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done' | 'cancelled';
type DetailTab = 'overview' | 'tasks' | 'calendar' | 'documents' | 'team' | 'activity' | 'analytics';
type TaskView  = 'list' | 'kanban' | 'calendar' | 'timeline';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

function Avatar({ name, size = 7 }: { name?: string | null; size?: number }) {
  const s = `h-${size} w-${size}`;
  return (
    <div className={cn(s, 'rounded-full bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center shrink-0')}>
      <span className="text-white font-bold" style={{ fontSize: size * 1.6 }}>{initials(name)}</span>
    </div>
  );
}

function ProgressRing({ pct, color, size = 48 }: { pct: number; color: string; size?: number }) {
  const r = (size / 2) - 4; const circ = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ height: size, width: size }}>
      <svg style={{ height: size, width: size }} className="-rotate-90" viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} strokeWidth="4" fill="none" stroke="#f1f5f9" />
        <circle cx={size/2} cy={size/2} r={r} strokeWidth="4" fill="none"
          stroke={color} strokeDasharray={circ}
          strokeDashoffset={circ - (pct / 100) * circ} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <p className="text-[10px] font-bold text-gray-700">{pct}%</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Task Detail Slide-out Panel
// ─────────────────────────────────────────────────────────────

interface TaskPanelProps {
  task: ProjectTask;
  projectId: string;
  profiles: Array<{ id: string; name: string; avatar_url?: string | null }>;
  userId: string;
  onClose: () => void;
  onUpdate: (t: ProjectTask) => void;
  onDelete: (id: string) => void;
}

function TaskPanel({ task, projectId, profiles, userId, onClose, onUpdate, onDelete }: TaskPanelProps) {
  const [comments,    setComments]    = useState<ProjectComment[]>([]);
  const [newComment,  setNewComment]  = useState('');
  const [saving,      setSaving]      = useState(false);
  const [editing,     setEditing]     = useState(false);
  const [editTitle,   setEditTitle]   = useState(task.title);
  const [editDesc,    setEditDesc]    = useState(task.description ?? '');
  const [editStatus,  setEditStatus]  = useState<TaskStatus>(task.status as TaskStatus);
  const [editPri,     setEditPri]     = useState<ProjectPriority>(task.priority as ProjectPriority);
  const [editAssign,  setEditAssign]  = useState(task.assigned_to ?? '');
  const [editDue,     setEditDue]     = useState(task.due_date ?? '');
  const authorName = (c: ProjectComment) => c.authorName ?? 'Unknown';

  useEffect(() => {
    getTaskComments(task.id).then(r => { if (r.success) setComments(r.data); });
  }, [task.id]);

  async function saveEdit() {
    setSaving(true);
    const res = await updateTask(task.id, {
      title: editTitle, description: editDesc || null,
      status: editStatus, priority: editPri,
      assigned_to: editAssign || null, due_date: editDue || null,
    });
    if (res.success) { onUpdate(res.data); setEditing(false); }
    setSaving(false);
  }

  async function sendComment() {
    if (!newComment.trim()) return;
    const res = await addComment(projectId, task.id, newComment.trim());
    if (res.success) { setComments(c => [...c, res.data]); setNewComment(''); }
  }

  async function handleDeleteComment(id: string) {
    await deleteComment(id);
    setComments(c => c.filter(x => x.id !== id));
  }

  const pc = PRIORITY_CFG[task.priority as ProjectPriority] ?? PRIORITY_CFG.medium;

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-lg bg-white h-full overflow-y-auto shadow-2xl border-l border-gray-100 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <CheckSquare className="h-4.5 w-4.5 text-orange-500" />
            <span className="text-[13px] font-bold text-gray-700">Task Detail</span>
          </div>
          <div className="flex items-center gap-2">
            {!editing && (
              <button onClick={() => setEditing(true)} className="h-8 w-8 rounded-xl hover:bg-gray-100 flex items-center justify-center">
                <Edit3 className="h-4 w-4 text-gray-400" />
              </button>
            )}
            <button
              onClick={() => { if (confirm('Delete this task?')) { onDelete(task.id); onClose(); } }}
              className="h-8 w-8 rounded-xl hover:bg-red-50 flex items-center justify-center"
            >
              <Trash2 className="h-4 w-4 text-red-400" />
            </button>
            <button onClick={onClose} className="h-8 w-8 rounded-xl hover:bg-gray-100 flex items-center justify-center">
              <X className="h-4 w-4 text-gray-400" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {editing ? (
            <div className="space-y-3">
              <input
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-gray-200 text-[14px] font-bold focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
              <textarea
                value={editDesc}
                onChange={e => setEditDesc(e.target.value)}
                placeholder="Description…"
                rows={3}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block mb-1">Status</label>
                  <select value={editStatus} onChange={e => setEditStatus(e.target.value as TaskStatus)}
                    className="w-full h-9 px-3 rounded-xl border border-gray-200 text-[12px] focus:outline-none focus:ring-2 focus:ring-orange-300">
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="review">Review</option>
                    <option value="done">Done</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block mb-1">Priority</label>
                  <select value={editPri} onChange={e => setEditPri(e.target.value as ProjectPriority)}
                    className="w-full h-9 px-3 rounded-xl border border-gray-200 text-[12px] focus:outline-none focus:ring-2 focus:ring-orange-300">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block mb-1">Assignee</label>
                  <select value={editAssign} onChange={e => setEditAssign(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl border border-gray-200 text-[12px] focus:outline-none focus:ring-2 focus:ring-orange-300">
                    <option value="">Unassigned</option>
                    {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block mb-1">Due Date</label>
                  <input type="date" value={editDue} onChange={e => setEditDue(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl border border-gray-200 text-[12px] focus:outline-none focus:ring-2 focus:ring-orange-300" />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditing(false)}
                  className="flex-1 h-9 rounded-xl border border-gray-200 text-[12px] font-medium text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
                <button onClick={saveEdit} disabled={saving}
                  className="flex-1 h-9 rounded-xl bg-orange-500 text-white text-[12px] font-bold hover:bg-orange-600 flex items-center justify-center gap-1.5 disabled:opacity-60">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Save
                </button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <h2 className="text-[16px] font-bold text-gray-900 mb-2">{task.title}</h2>
                {task.description && <p className="text-[13px] text-gray-500 leading-relaxed">{task.description}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3 text-[12px]">
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Status</p>
                  <p className="font-semibold text-gray-700 capitalize">{task.status.replace('_', ' ')}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Priority</p>
                  <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded-full', pc.cls)}>{pc.label}</span>
                </div>
                {task.assigneeName && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Assigned To</p>
                    <div className="flex items-center gap-1.5">
                      <Avatar name={task.assigneeName} size={5} />
                      <p className="font-semibold text-gray-700 truncate">{task.assigneeName}</p>
                    </div>
                  </div>
                )}
                {task.due_date && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Due Date</p>
                    <p className="font-semibold text-gray-700">{fmtDate(task.due_date)}</p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Comments */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
              <MessageSquare className="h-3.5 w-3.5" /> Comments ({comments.length})
            </p>
            <div className="space-y-3 mb-3">
              {comments.map(c => (
                <div key={c.id} className="flex items-start gap-2.5">
                  <Avatar name={c.authorName} size={7} />
                  <div className="flex-1 bg-gray-50 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-[12px] font-bold text-gray-700">{authorName(c)}</p>
                      <p className="text-[10px] text-gray-400">{fmtAgo(c.created_at)}</p>
                      {c.user_id === userId && (
                        <button onClick={() => handleDeleteComment(c.id)} className="ml-auto text-gray-300 hover:text-red-400 transition-colors">
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    <p className="text-[12px] text-gray-600 leading-relaxed">{c.content}</p>
                  </div>
                </div>
              ))}
              {comments.length === 0 && (
                <p className="text-[12px] text-gray-400 text-center py-4">No comments yet.</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <input
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendComment()}
                placeholder="Add a comment…"
                className="flex-1 h-9 px-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
              <button
                onClick={sendComment}
                disabled={!newComment.trim()}
                className="h-9 w-9 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-40 flex items-center justify-center transition-colors"
              >
                <Send className="h-4 w-4 text-white" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Task Row (List view)
// ─────────────────────────────────────────────────────────────

function TaskRow({
  task, onSelect, onStatusChange,
}: {
  task: ProjectTask;
  onSelect: () => void;
  onStatusChange: (id: string, status: TaskStatus) => void;
}) {
  const pc = PRIORITY_CFG[task.priority as ProjectPriority] ?? PRIORITY_CFG.medium;
  const today = new Date().toISOString().slice(0, 10);
  const overdue = task.due_date && task.due_date < today && task.status !== 'done' && task.status !== 'cancelled';

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors group border',
        task.status === 'done' ? 'border-green-100 bg-green-50/30' : 'border-transparent',
      )}
    >
      <button
        onClick={() => onStatusChange(task.id, task.status === 'done' ? 'todo' : 'done')}
        className="shrink-0"
      >
        {task.status === 'done'
          ? <CheckCircle2 className="h-5 w-5 text-green-500" />
          : <SquareDashed className="h-5 w-5 text-gray-300 hover:text-orange-400 transition-colors" />
        }
      </button>

      <div className="flex-1 min-w-0 cursor-pointer" onClick={onSelect}>
        <p className={cn('text-[13px] font-medium text-gray-800 truncate', task.status === 'done' && 'line-through text-gray-400')}>
          {task.title}
        </p>
        {task.description && (
          <p className="text-[11px] text-gray-400 truncate mt-0.5">{task.description}</p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {task.assigneeName && (
          <Avatar name={task.assigneeName} size={6} />
        )}
        <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full hidden sm:block', pc.cls)}>{pc.label}</span>
        {task.due_date && (
          <span className={cn('text-[10px] font-medium hidden md:block', overdue ? 'text-red-600' : 'text-gray-400')}>
            {fmtDate(task.due_date)}
          </span>
        )}
        <button onClick={onSelect} className="h-7 w-7 rounded-lg hover:bg-gray-100 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
          <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Kanban Board
// ─────────────────────────────────────────────────────────────

function KanbanBoard({
  tasks, onSelect, onStatusChange,
}: {
  tasks: ProjectTask[];
  onSelect: (t: ProjectTask) => void;
  onStatusChange: (id: string, status: TaskStatus) => void;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  function handleDrop(status: string) {
    if (dragging) onStatusChange(dragging, status as TaskStatus);
    setDragging(null); setDragOver(null);
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {STATUS_COLS.map(col => {
        const colTasks = tasks.filter(t => t.status === col.key);
        return (
          <div
            key={col.key}
            className={cn('flex-shrink-0 w-72 rounded-2xl border flex flex-col', col.bg, col.border, dragOver === col.key && 'ring-2 ring-orange-300')}
            onDragOver={e => { e.preventDefault(); setDragOver(col.key); }}
            onDragLeave={() => setDragOver(null)}
            onDrop={() => handleDrop(col.key)}
          >
            <div className={cn('flex items-center justify-between px-4 py-3 rounded-t-2xl', col.headerCls)}>
              <div className="flex items-center gap-2">
                <p className="text-[12px] font-bold uppercase tracking-wider">{col.label}</p>
                <span className="text-[10px] font-bold bg-white/60 rounded-full px-2 py-0.5">{colTasks.length}</span>
              </div>
            </div>
            <div className="flex-1 p-3 space-y-2 min-h-[120px]">
              {colTasks.map(t => {
                const pc = PRIORITY_CFG[t.priority as ProjectPriority] ?? PRIORITY_CFG.medium;
                return (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={() => setDragging(t.id)}
                    onDragEnd={() => setDragging(null)}
                    onClick={() => onSelect(t)}
                    className={cn(
                      'bg-white rounded-xl p-3 shadow-sm border border-gray-100 cursor-grab active:cursor-grabbing hover:shadow-md transition-all',
                      dragging === t.id && 'opacity-50 rotate-2',
                    )}
                  >
                    <div className="flex items-start gap-2 mb-2">
                      <GripVertical className="h-4 w-4 text-gray-200 mt-0.5 shrink-0" />
                      <p className="text-[13px] font-medium text-gray-800 flex-1 leading-tight">{t.title}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full', pc.cls)}>{pc.label}</span>
                      {t.due_date && (
                        <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                          <Clock className="h-2.5 w-2.5" />{fmtDate(t.due_date)}
                        </span>
                      )}
                      {t.assigneeName && (
                        <div className="ml-auto">
                          <Avatar name={t.assigneeName} size={5} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Calendar View (Month Grid)
// ─────────────────────────────────────────────────────────────

function CalendarView({ tasks }: { tasks: ProjectTask[] }) {
  const [month, setMonth] = useState(() => {
    const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() };
  });

  const firstDay = new Date(month.year, month.month, 1).getDay();
  const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();

  const tasksByDay = useMemo(() => {
    const map = new Map<string, ProjectTask[]>();
    tasks.forEach(t => {
      if (!t.due_date) return;
      const key = t.due_date.slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), t]);
    });
    return map;
  }, [tasks]);

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  function prevMonth() { setMonth(m => { const d = new Date(m.year, m.month - 1); return { year: d.getFullYear(), month: d.getMonth() }; }); }
  function nextMonth() { setMonth(m => { const d = new Date(m.year, m.month + 1); return { year: d.getFullYear(), month: d.getMonth() }; }); }

  const today = new Date();

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <button onClick={prevMonth} className="h-8 w-8 rounded-xl hover:bg-gray-100 flex items-center justify-center">
          <ChevronDown className="h-4 w-4 text-gray-500 rotate-90" />
        </button>
        <p className="text-[15px] font-bold text-gray-900">{MONTHS[month.month]} {month.year}</p>
        <button onClick={nextMonth} className="h-8 w-8 rounded-xl hover:bg-gray-100 flex items-center justify-center">
          <ChevronDown className="h-4 w-4 text-gray-500 -rotate-90" />
        </button>
      </div>
      <div className="grid grid-cols-7">
        {DAYS.map(d => (
          <div key={d} className="text-center py-2 text-[11px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-50">
            {d}
          </div>
        ))}
        {Array.from({ length: firstDay }).map((_, i) => <div key={`pad-${i}`} className="border-b border-r border-gray-50 min-h-[80px]" />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const key = `${month.year}-${String(month.month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
          const dayTasks = tasksByDay.get(key) ?? [];
          const isToday = today.getFullYear() === month.year && today.getMonth() === month.month && today.getDate() === day;
          return (
            <div key={day} className={cn('border-b border-r border-gray-50 min-h-[80px] p-1.5', isToday && 'bg-orange-50/50')}>
              <p className={cn('text-[12px] font-bold w-6 h-6 flex items-center justify-center rounded-full mb-1',
                isToday ? 'bg-orange-500 text-white' : 'text-gray-700')}>
                {day}
              </p>
              {dayTasks.slice(0, 2).map(t => {
                const pc = PRIORITY_CFG[t.priority as ProjectPriority] ?? PRIORITY_CFG.medium;
                return (
                  <div key={t.id} className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-md mb-0.5 truncate', pc.cls)}>
                    {t.title}
                  </div>
                );
              })}
              {dayTasks.length > 2 && (
                <p className="text-[10px] text-gray-400">+{dayTasks.length - 2} more</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Timeline View
// ─────────────────────────────────────────────────────────────

function TimelineView({ tasks, projectColor }: { tasks: ProjectTask[]; projectColor: string }) {
  const withDates = tasks.filter(t => t.due_date).sort((a, b) => (a.due_date ?? '') < (b.due_date ?? '') ? -1 : 1);
  const today = new Date().toISOString().slice(0, 10);

  if (withDates.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
        <CalendarDays className="h-12 w-12 text-gray-200 mx-auto mb-3" />
        <p className="text-[14px] text-gray-400">No tasks with due dates</p>
      </div>
    );
  }

  const minDate = new Date(withDates[0].due_date!);
  const maxDate = new Date(withDates[withDates.length - 1].due_date!);
  const totalDays = Math.max(1, (maxDate.getTime() - minDate.getTime()) / 86400000);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <p className="text-[13px] font-bold text-gray-900">Timeline — {withDates.length} tasks with due dates</p>
      </div>
      <div className="p-4 space-y-2">
        {withDates.map(t => {
          const taskDate = new Date(t.due_date!);
          const offset = (taskDate.getTime() - minDate.getTime()) / 86400000;
          const pct = totalDays === 0 ? 0 : (offset / totalDays) * 80;
          const isOverdue = t.due_date! < today && t.status !== 'done';
          const isDone = t.status === 'done';
          const barColor = isDone ? '#22c55e' : isOverdue ? '#ef4444' : projectColor;

          return (
            <div key={t.id} className="flex items-center gap-3">
              <p className="text-[12px] text-gray-600 truncate w-48 shrink-0">{t.title}</p>
              <div className="flex-1 bg-gray-100 rounded-full h-6 relative overflow-hidden">
                <div
                  className="absolute top-0 h-full rounded-full flex items-center px-2"
                  style={{ left: `${pct}%`, width: `${Math.max(60, 200 - pct * 2)}px`, backgroundColor: `${barColor}30`, border: `1px solid ${barColor}` }}
                >
                  <span className="text-[10px] font-bold truncate" style={{ color: barColor }}>
                    {fmtDate(t.due_date!)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Tasks Tab
// ─────────────────────────────────────────────────────────────

function TasksTab({
  project, profiles, userId,
}: {
  project: Project;
  profiles: Array<{ id: string; name: string; avatar_url?: string | null }>;
  userId: string;
}) {
  const [tasks,      setTasks]      = useState<ProjectTask[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [view,       setView]       = useState<TaskView>('list');
  const [selected,   setSelected]   = useState<ProjectTask | null>(null);
  const [search,     setSearch]     = useState('');
  const [filterSt,   setFilterSt]   = useState('');
  const [filterPri,  setFilterPri]  = useState('');
  const [creating,   setCreating]   = useState(false);
  const [newTitle,   setNewTitle]   = useState('');
  const [newPri,     setNewPri]     = useState<ProjectPriority>('medium');
  const [newAssign,  setNewAssign]  = useState('');
  const [newDue,     setNewDue]     = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getProjectTasks(project.id).then(r => {
      if (r.success) setTasks(r.data);
      setLoading(false);
    });
  }, [project.id]);

  const filtered = useMemo(() => {
    let list = tasks;
    if (filterSt)  list = list.filter(t => t.status === filterSt);
    if (filterPri) list = list.filter(t => t.priority === filterPri);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(t => t.title.toLowerCase().includes(s));
    }
    return list;
  }, [tasks, filterSt, filterPri, search]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setSubmitting(true);
    const res = await createTask({
      project_id:  project.id,
      title:       newTitle.trim(),
      priority:    newPri,
      assigned_to: newAssign || null,
      due_date:    newDue || null,
    });
    if (res.success) {
      setTasks(ts => [...ts, res.data]);
      setNewTitle(''); setNewPri('medium'); setNewAssign(''); setNewDue('');
      setCreating(false);
    }
    setSubmitting(false);
  }

  async function handleStatusChange(id: string, status: TaskStatus) {
    const res = await updateTask(id, { status });
    if (res.success) setTasks(ts => ts.map(t => t.id === id ? res.data : t));
  }

  async function handleDelete(id: string) {
    await deleteTask(id);
    setTasks(ts => ts.filter(t => t.id !== id));
  }

  const VIEWS: Array<{ id: TaskView; icon: typeof List; label: string }> = [
    { id: 'list',     icon: List,        label: 'List'     },
    { id: 'kanban',   icon: Columns,     label: 'Kanban'   },
    { id: 'calendar', icon: CalendarDays,label: 'Calendar' },
    { id: 'timeline', icon: GitBranch,   label: 'Timeline' },
  ];

  const done  = tasks.filter(t => t.status === 'done').length;
  const total = tasks.length;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search tasks…"
            className="w-full h-9 pl-8 pr-3 rounded-xl border border-gray-200 text-[12px] focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white" />
        </div>
        <select value={filterSt} onChange={e => setFilterSt(e.target.value)}
          className="h-9 px-3 rounded-xl border border-gray-200 text-[12px] bg-white focus:outline-none focus:ring-2 focus:ring-orange-300">
          <option value="">All Status</option>
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="review">Review</option>
          <option value="done">Done</option>
        </select>
        <select value={filterPri} onChange={e => setFilterPri(e.target.value)}
          className="h-9 px-3 rounded-xl border border-gray-200 text-[12px] bg-white focus:outline-none focus:ring-2 focus:ring-orange-300">
          <option value="">All Priority</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        {/* View toggle */}
        <div className="flex items-center bg-white border border-gray-200 rounded-xl p-0.5 gap-0.5">
          {VIEWS.map(v => (
            <button key={v.id} onClick={() => setView(v.id)}
              className={cn('h-8 px-3 rounded-lg flex items-center gap-1.5 text-[11px] font-medium transition-all',
                view === v.id ? 'bg-slate-900 text-white' : 'text-gray-500 hover:text-gray-800')}>
              <v.icon className="h-3.5 w-3.5" />
              <span className="hidden sm:block">{v.label}</span>
            </button>
          ))}
        </div>

        <button onClick={() => setCreating(c => !c)}
          className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[12px] font-bold transition-colors shrink-0">
          <Plus className="h-4 w-4" /> Add Task
        </button>
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-4 py-2.5">
          <p className="text-[11px] text-gray-500 shrink-0">{done}/{total} done</p>
          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${total ? (done/total)*100 : 0}%`, backgroundColor: project.color }} />
          </div>
          <p className="text-[11px] font-bold text-gray-700 shrink-0">{total ? Math.round((done/total)*100) : 0}%</p>
        </div>
      )}

      {/* Create form */}
      {creating && (
        <form onSubmit={handleCreate} className="bg-white border-2 border-orange-200 rounded-2xl p-4 space-y-3 shadow-sm">
          <p className="text-[12px] font-bold uppercase tracking-widest text-orange-500">New Task</p>
          <input value={newTitle} onChange={e => setNewTitle(e.target.value)}
            placeholder="Task title…" required autoFocus
            className="w-full h-10 px-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-300" />
          <div className="grid grid-cols-3 gap-2">
            <select value={newPri} onChange={e => setNewPri(e.target.value as ProjectPriority)}
              className="h-9 px-3 rounded-xl border border-gray-200 text-[12px] focus:outline-none focus:ring-2 focus:ring-orange-300">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            <select value={newAssign} onChange={e => setNewAssign(e.target.value)}
              className="h-9 px-3 rounded-xl border border-gray-200 text-[12px] focus:outline-none focus:ring-2 focus:ring-orange-300">
              <option value="">Unassigned</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input type="date" value={newDue} onChange={e => setNewDue(e.target.value)}
              className="h-9 px-3 rounded-xl border border-gray-200 text-[12px] focus:outline-none focus:ring-2 focus:ring-orange-300" />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setCreating(false)}
              className="flex-1 h-9 rounded-xl border border-gray-200 text-[12px] font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={submitting}
              className="flex-1 h-9 rounded-xl bg-orange-500 text-white text-[12px] font-bold hover:bg-orange-600 flex items-center justify-center gap-1.5 disabled:opacity-60">
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Create
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-center py-16"><Loader2 className="h-8 w-8 animate-spin text-orange-400 mx-auto" /></div>
      ) : view === 'list' ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
          {filtered.length === 0 ? (
            <div className="text-center py-16">
              <CheckSquare className="h-12 w-12 text-gray-200 mx-auto mb-3" />
              <p className="text-[14px] text-gray-400">No tasks found</p>
            </div>
          ) : (
            filtered.map(t => (
              <TaskRow key={t.id} task={t} onSelect={() => setSelected(t)} onStatusChange={handleStatusChange} />
            ))
          )}
        </div>
      ) : view === 'kanban' ? (
        <KanbanBoard tasks={filtered} onSelect={setSelected} onStatusChange={handleStatusChange} />
      ) : view === 'calendar' ? (
        <CalendarView tasks={filtered} />
      ) : (
        <TimelineView tasks={filtered} projectColor={project.color} />
      )}

      {selected && (
        <TaskPanel
          task={selected}
          projectId={project.id}
          profiles={profiles}
          userId={userId}
          onClose={() => setSelected(null)}
          onUpdate={updated => { setTasks(ts => ts.map(t => t.id === updated.id ? updated : t)); setSelected(updated); }}
          onDelete={id => { handleDelete(id); }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Overview Tab
// ─────────────────────────────────────────────────────────────

function OverviewTab({ project }: { project: Project }) {
  const done    = project.completedCount ?? 0;
  const total   = project.taskCount ?? 0;
  const pending = total - done;
  const today   = new Date().toISOString().slice(0, 10);
  const isOverdue = project.due_date && project.due_date < today && project.status !== 'completed';
  const daysLeft  = project.due_date ? Math.ceil((new Date(project.due_date).getTime() - Date.now()) / 86400000) : null;

  return (
    <div className="space-y-5">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Tasks',    val: total,   icon: CheckSquare, cls: 'text-blue-600',   bg: 'bg-blue-50' },
          { label: 'Completed',      val: done,    icon: CheckCircle2,cls: 'text-green-600',  bg: 'bg-green-50' },
          { label: 'Remaining',      val: pending, icon: Clock,       cls: 'text-amber-600',  bg: 'bg-amber-50' },
          { label: 'Progress',       val: `${project.progress_pct}%`, icon: TrendingUp, cls: 'text-orange-600', bg: 'bg-orange-50' },
        ].map(s => (
          <div key={s.label} className={cn('rounded-2xl p-4 flex items-center gap-3 border border-gray-100', s.bg)}>
            <div className="h-10 w-10 bg-white rounded-xl flex items-center justify-center shadow-sm shrink-0">
              <s.icon className={cn('h-5 w-5', s.cls)} />
            </div>
            <div>
              <p className="text-[22px] font-bold text-gray-900 leading-none">{s.val}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Progress + timeline */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-bold text-gray-900">Project Progress</p>
          <p className="text-[13px] font-bold" style={{ color: project.color }}>{project.progress_pct}%</p>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${project.progress_pct}%`, backgroundColor: project.color }} />
        </div>
        <div className="grid grid-cols-2 gap-4 text-[12px]">
          {project.start_date && (
            <div>
              <p className="text-gray-400 mb-0.5">Start Date</p>
              <p className="font-semibold text-gray-700">{fmtDate(project.start_date)}</p>
            </div>
          )}
          {project.due_date && (
            <div>
              <p className="text-gray-400 mb-0.5">Due Date</p>
              <p className={cn('font-semibold', isOverdue ? 'text-red-600' : 'text-gray-700')}>
                {fmtDate(project.due_date)}
                {daysLeft !== null && (
                  <span className="ml-1.5 text-[10px] font-normal">
                    ({isOverdue ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? 'today' : `${daysLeft}d left`})
                  </span>
                )}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Description */}
      {project.description && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-[12px] font-bold uppercase tracking-widest text-gray-400 mb-2">Description</p>
          <p className="text-[13px] text-gray-600 leading-relaxed">{project.description}</p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Team Tab
// ─────────────────────────────────────────────────────────────

function TeamTab({
  projectId, profiles, userId, isAdmin,
}: {
  projectId: string;
  profiles: Array<{ id: string; name: string; avatar_url?: string | null }>;
  userId: string;
  isAdmin: boolean;
}) {
  const [members,  setMembers]  = useState<ProjectMember[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [addId,    setAddId]    = useState('');
  const [addRole,  setAddRole]  = useState('member');
  const [adding,   setAdding]   = useState(false);

  useEffect(() => {
    getProjectMembers(projectId).then(r => { if (r.success) setMembers(r.data); setLoading(false); });
  }, [projectId]);

  async function handleAdd() {
    if (!addId) return;
    setAdding(true);
    const res = await addMember(projectId, addId, addRole as import('@/lib/actions/projects').MemberRole);
    if (res.success) {
      const refreshed = await getProjectMembers(projectId);
      if (refreshed.success) setMembers(refreshed.data);
      setAddId('');
    }
    setAdding(false);
  }

  async function handleRemove(uid: string) {
    await removeMember(projectId, uid);
    setMembers(m => m.filter(x => x.user_id !== uid));
  }

  const existingIds = new Set(members.map(m => m.user_id));
  const available   = profiles.filter(p => !existingIds.has(p.id));

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-[12px] font-bold uppercase tracking-widest text-gray-400 mb-3">Add Team Member</p>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={addId} onChange={e => setAddId(e.target.value)}
              className="flex-1 h-9 px-3 rounded-xl border border-gray-200 text-[12px] focus:outline-none focus:ring-2 focus:ring-orange-300">
              <option value="">Select person…</option>
              {available.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={addRole} onChange={e => setAddRole(e.target.value)}
              className="w-32 h-9 px-3 rounded-xl border border-gray-200 text-[12px] focus:outline-none focus:ring-2 focus:ring-orange-300">
              <option value="viewer">Viewer</option>
              <option value="member">Member</option>
              <option value="manager">Manager</option>
            </select>
            <button onClick={handleAdd} disabled={!addId || adding}
              className="h-9 px-4 rounded-xl bg-orange-500 text-white text-[12px] font-bold hover:bg-orange-600 disabled:opacity-60 flex items-center gap-1.5">
              {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Add
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin text-orange-400 mx-auto" /></div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
          {members.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-10 w-10 text-gray-200 mx-auto mb-3" />
              <p className="text-[13px] text-gray-400">No members yet</p>
            </div>
          ) : members.map(m => (
            <div key={m.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/50">
              <Avatar name={m.firstName ? `${m.firstName} ${m.lastName ?? ''}`.trim() : undefined} size={9} />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-gray-800">{m.firstName ? `${m.firstName} ${m.lastName ?? ''}`.trim() : 'Unknown'}</p>
                <p className="text-[11px] text-gray-400 capitalize">{m.role}</p>
              </div>
              <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full',
                m.role === 'owner'   ? 'bg-orange-50 text-orange-600' :
                m.role === 'manager' ? 'bg-purple-50 text-purple-600' :
                'bg-gray-100 text-gray-500')}>
                {m.role}
              </span>
              {isAdmin && m.user_id !== userId && m.role !== 'owner' && (
                <button onClick={() => handleRemove(m.user_id)}
                  className="h-7 w-7 rounded-lg hover:bg-red-50 flex items-center justify-center transition-colors">
                  <X className="h-3.5 w-3.5 text-red-400" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Activity Tab
// ─────────────────────────────────────────────────────────────

function ActivityTab({ projectId }: { projectId: string }) {
  const [items,   setItems]   = useState<ProjectActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProjectActivity(projectId).then(r => { if (r.success) setItems(r.data); setLoading(false); });
  }, [projectId]);

  if (loading) return <div className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin text-orange-400 mx-auto" /></div>;

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
              <div className="h-8 w-8 rounded-full bg-orange-50 flex items-center justify-center shrink-0 mt-0.5">
                <Activity className="h-3.5 w-3.5 text-orange-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-gray-700">
                  <span className="font-semibold">{item.userName ?? 'System'}</span>
                  {' '}{item.action}
                  {item.resource_type && <span className="text-gray-400"> ({item.resource_type})</span>}
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
// Documents Tab
// ─────────────────────────────────────────────────────────────

function DocumentsTab({ projectId }: { projectId: string }) {
  const [files,   setFiles]   = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProjectFiles(projectId).then(r => { if (r.success) setFiles(r.data); setLoading(false); });
  }, [projectId]);

  function fmtSize(bytes?: number) {
    if (!bytes) return '';
    if (bytes < 1024)       return `${bytes} B`;
    if (bytes < 1048576)    return `${(bytes/1024).toFixed(1)} KB`;
    return `${(bytes/1048576).toFixed(1)} MB`;
  }

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-[12px] text-amber-700">
        File uploads require Supabase Storage configuration. Files uploaded via tasks will appear here.
      </div>

      {loading ? (
        <div className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin text-orange-400 mx-auto" /></div>
      ) : files.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <Paperclip className="h-12 w-12 text-gray-200 mx-auto mb-3" />
          <p className="text-[14px] text-gray-400">No files attached yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
          {files.map(f => (
            <div key={f.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50">
              <div className="h-9 w-9 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
                <FileText className="h-4.5 w-4.5 text-blue-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-gray-800 truncate">{f.file_name}</p>
                <p className="text-[11px] text-gray-400">{f.file_type} {f.file_size ? `· ${fmtSize(f.file_size)}` : ''} · {fmtDate(f.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Analytics Tab
// ─────────────────────────────────────────────────────────────

function AnalyticsTab({ project, tasks }: { project: Project; tasks: ProjectTask[] }) {
  const byStatus = useMemo(() => {
    const m: Record<string, number> = {};
    tasks.forEach(t => { m[t.status] = (m[t.status] ?? 0) + 1; });
    return m;
  }, [tasks]);

  const byPriority = useMemo(() => {
    const m: Record<string, number> = {};
    tasks.forEach(t => { m[t.priority] = (m[t.priority] ?? 0) + 1; });
    return m;
  }, [tasks]);

  const maxSt  = Math.max(1, ...Object.values(byStatus));
  const maxPri = Math.max(1, ...Object.values(byPriority));

  const statusLabels: Record<string, string> = { todo: 'To Do', in_progress: 'In Progress', review: 'Review', done: 'Done', cancelled: 'Cancelled' };
  const statusColors: Record<string, string> = { todo: '#94a3b8', in_progress: '#3b82f6', review: '#f59e0b', done: '#22c55e', cancelled: '#ef4444' };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* By Status */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-[13px] font-bold text-gray-900 mb-4">Tasks by Status</p>
          <div className="space-y-3">
            {Object.entries(byStatus).map(([s, n]) => (
              <div key={s}>
                <div className="flex justify-between mb-1">
                  <p className="text-[12px] text-gray-600">{statusLabels[s] ?? s}</p>
                  <p className="text-[12px] font-bold text-gray-800">{n}</p>
                </div>
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(n / maxSt) * 100}%`, backgroundColor: statusColors[s] ?? '#94a3b8' }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* By Priority */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-[13px] font-bold text-gray-900 mb-4">Tasks by Priority</p>
          <div className="space-y-3">
            {['urgent','high','medium','low'].map(p => {
              const n = byPriority[p] ?? 0;
              const pc = PRIORITY_CFG[p as ProjectPriority];
              return (
                <div key={p}>
                  <div className="flex justify-between mb-1">
                    <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded-full', pc.cls)}>{pc.label}</span>
                    <p className="text-[12px] font-bold text-gray-800">{n}</p>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={cn('h-full rounded-full', pc.dot)} style={{ width: `${(n / maxPri) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Completion gauge */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-center gap-6">
        <ProgressRing pct={project.progress_pct} color={project.color} size={80} />
        <div>
          <p className="text-[20px] font-bold text-gray-900">{project.progress_pct}% Complete</p>
          <p className="text-[13px] text-gray-500 mt-0.5">
            {project.completedCount ?? 0} of {project.taskCount ?? 0} tasks done
          </p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Project Detail Root
// ─────────────────────────────────────────────────────────────

interface ProjectDetailProps {
  project: Project;
  profiles: Array<{ id: string; name: string; avatar_url?: string | null }>;
  userId: string;
  isAdmin: boolean;
  initialTab?: DetailTab;
}

export function ProjectDetail({ project, profiles, userId, isAdmin, initialTab = 'overview' }: ProjectDetailProps) {
  const router = useRouter();
  const [tab,   setTab]   = useState<DetailTab>(initialTab);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [live,  setLive]  = useState(false);

  // preload tasks for analytics
  useEffect(() => {
    getProjectTasks(project.id).then(r => { if (r.success) setTasks(r.data); });
  }, [project.id]);

  // Realtime
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const ch = supabase.channel(`project-${project.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_tasks', filter: `project_id=eq.${project.id}` },
        () => { router.refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_comments', filter: `project_id=eq.${project.id}` },
        () => {})
      .subscribe(s => setLive(s === 'SUBSCRIBED'));
    return () => { supabase.removeChannel(ch); };
  }, [project.id, router]);

  const TABS: Array<{ id: DetailTab; icon: typeof FolderOpen; label: string }> = [
    { id: 'overview',   icon: FolderOpen,  label: 'Overview'  },
    { id: 'tasks',      icon: CheckSquare, label: 'Tasks'     },
    { id: 'calendar',   icon: Calendar,    label: 'Calendar'  },
    { id: 'documents',  icon: FileText,    label: 'Documents' },
    { id: 'team',       icon: Users,       label: 'Team'      },
    { id: 'activity',   icon: Activity,    label: 'Activity'  },
    { id: 'analytics',  icon: BarChart3,   label: 'Analytics' },
  ];

  const sc = project.status === 'completed' ? 'bg-emerald-50 text-emerald-700'
           : project.status === 'on_hold'   ? 'bg-amber-50 text-amber-700'
           : project.status === 'cancelled' ? 'bg-red-50 text-red-600'
           : project.status === 'planning'  ? 'bg-blue-50 text-blue-700'
           : 'bg-green-50 text-green-700';

  return (
    <div className="flex flex-col gap-5 pb-12 max-w-5xl mx-auto">
      {/* Header */}
      <div className="rounded-2xl overflow-hidden shadow-xl">
        <div className="h-2 w-full" style={{ background: `linear-gradient(90deg, ${project.color}, ${project.color}66)` }} />
        <div className="bg-white px-6 py-5 border border-gray-100 rounded-b-2xl border-t-0">
          <div className="flex items-start gap-4">
            <Link href="/projects" className="mt-1 h-8 w-8 rounded-xl hover:bg-gray-100 flex items-center justify-center shrink-0 transition-colors">
              <ArrowLeft className="h-4 w-4 text-gray-400" />
            </Link>
            <div className="h-12 w-12 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${project.color}20` }}>
              <FolderOpen className="h-6 w-6" style={{ color: project.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap mb-1">
                <h1 className="text-[20px] font-bold text-gray-900 truncate">{project.name}</h1>
                {project.is_cross_hospital && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-purple-500 text-white rounded-full px-2 py-0.5">
                    <Globe className="h-2.5 w-2.5" /> Cross-Hospital
                  </span>
                )}
                <span className={cn('text-[11px] font-bold px-2.5 py-0.5 rounded-full', sc)}>
                  {project.status.replace('_', ' ')}
                </span>
                <div className="flex items-center gap-1.5 bg-gray-50 rounded-full px-2.5 py-1">
                  <div className={cn('h-2 w-2 rounded-full', live ? 'bg-green-400 animate-pulse' : 'bg-gray-300')} />
                  <p className="text-[10px] text-gray-400 font-medium">{live ? 'Live' : '…'}</p>
                </div>
              </div>
              {project.description && (
                <p className="text-[12px] text-gray-500 line-clamp-2">{project.description}</p>
              )}
              <div className="flex items-center gap-4 mt-2 text-[11px] text-gray-400 flex-wrap">
                {project.hospitalName && (
                  <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{project.hospitalName}</span>
                )}
                {project.ownerName && (
                  <span className="flex items-center gap-1"><User className="h-3 w-3" />{project.ownerName}</span>
                )}
                {project.due_date && (
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Due {fmtDate(project.due_date)}</span>
                )}
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              <ProgressRing pct={project.progress_pct} color={project.color} size={44} />
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 bg-white border border-gray-100 rounded-2xl p-1.5 shadow-sm overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-1.5 h-8 px-3 rounded-xl text-[12px] font-medium whitespace-nowrap transition-all',
              tab === t.id ? 'text-white shadow-sm' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100',
            )}
            style={tab === t.id ? { backgroundColor: project.color } : {}}
          >
            <t.icon className="h-3.5 w-3.5" />
            <span className="hidden sm:block">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {tab === 'overview'  && <OverviewTab  project={project} />}
        {tab === 'tasks'     && <TasksTab     project={project} profiles={profiles} userId={userId} />}
        {tab === 'calendar'  && <CalendarView tasks={tasks} />}
        {tab === 'documents' && <DocumentsTab projectId={project.id} />}
        {tab === 'team'      && <TeamTab      projectId={project.id} profiles={profiles} userId={userId} isAdmin={isAdmin} />}
        {tab === 'activity'  && <ActivityTab  projectId={project.id} />}
        {tab === 'analytics' && <AnalyticsTab project={project} tasks={tasks} />}
      </div>
    </div>
  );
}
