'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FolderOpen, Plus, Search, X, ChevronLeft, CheckCircle2,
  Circle, Clock, AlertTriangle, Users, Calendar, Loader2,
  Trash2, User, ClipboardList, CheckSquare, ThumbsUp,
  ThumbsDown, Send, AlertCircle, Flag, MoreVertical,
  Layers, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AppRole } from '@/types/database';
import type {
  ProjectFull, ProjectChecklistItem, ContributorInput,
  ProjectPriority, ProjectStatus,
} from '@/lib/actions/projects';
import {
  createProjectFull, updateProjectChecklistItem, submitProjectForReview,
  approveProject, rejectProjectReview, deleteProjectFull, getOrgMembersAdmin,
} from '@/lib/actions/projects';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const CAN_CREATE_ROLES: AppRole[] = ['super_admin', 'org_admin', 'hospital_admin', 'hr'];
const CAN_APPROVE_ROLES: AppRole[] = ['super_admin', 'org_admin', 'hospital_admin', 'hr'];

const COLOR_PRESETS = [
  '#f97316', '#3b82f6', '#22c55e', '#8b5cf6',
  '#ef4444', '#14b8a6', '#ec4899', '#f59e0b',
  '#6366f1', '#84cc16', '#0ea5e9', '#d946ef',
];

const STATUS_META: Record<string, { label: string; bg: string; text: string; dot: string; ring: string }> = {
  planning:  { label: 'Planning',   bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500',    ring: 'ring-blue-200'    },
  active:    { label: 'Active',     bg: 'bg-green-50',   text: 'text-green-700',   dot: 'bg-green-500',   ring: 'ring-green-200'   },
  on_hold:   { label: 'On Hold',    bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500',   ring: 'ring-amber-200'   },
  review:    { label: 'In Review',  bg: 'bg-purple-50',  text: 'text-purple-700',  dot: 'bg-purple-500',  ring: 'ring-purple-200'  },
  completed: { label: 'Completed',  bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', ring: 'ring-emerald-200' },
  cancelled: { label: 'Cancelled',  bg: 'bg-gray-50',    text: 'text-gray-500',    dot: 'bg-gray-400',    ring: 'ring-gray-200'    },
};

const PRIORITY_META: Record<ProjectPriority, { label: string; cls: string; icon: string }> = {
  low:    { label: 'Low',    cls: 'bg-slate-100 text-slate-600',  icon: '↓' },
  medium: { label: 'Medium', cls: 'bg-blue-100 text-blue-700',    icon: '→' },
  high:   { label: 'High',   cls: 'bg-amber-100 text-amber-700',  icon: '↑' },
  urgent: { label: 'Urgent', cls: 'bg-red-100 text-red-700',      icon: '⚡' },
};

const STATUS_FILTERS: Array<{ id: ProjectStatus | 'all'; label: string }> = [
  { id: 'all',       label: 'All'        },
  { id: 'active',    label: 'Active'     },
  { id: 'planning',  label: 'Planning'   },
  { id: 'review',    label: 'In Review'  },
  { id: 'completed', label: 'Completed'  },
  { id: 'on_hold',   label: 'On Hold'    },
];

const AVATAR_COLORS = ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6'];

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function avatarColor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
}

function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateShort(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─────────────────────────────────────────────────────────────
// Small UI components
// ─────────────────────────────────────────────────────────────

function Avatar({ name, avatar_url, size = 7 }: { name: string; avatar_url?: string | null; size?: number }) {
  const sizeClass = size === 7 ? 'h-7 w-7 text-[10px]' : size === 9 ? 'h-9 w-9 text-xs' : 'h-8 w-8 text-[11px]';
  if (avatar_url) {
    return <img src={avatar_url} alt={name} className={cn('rounded-full object-cover shrink-0', sizeClass)} />;
  }
  return (
    <div className={cn('rounded-full flex items-center justify-center shrink-0 font-semibold text-white', sizeClass)}
      style={{ backgroundColor: avatarColor(name) }}>
      {initials(name)}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? STATUS_META.active;
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold', m.bg, m.text)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', m.dot)} />
      {m.label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: ProjectPriority }) {
  const m = PRIORITY_META[priority] ?? PRIORITY_META.medium;
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium', m.cls)}>
      <Flag className="h-3 w-3" />
      {m.label}
    </span>
  );
}

function ProgressRing({ pct, color, size = 40 }: { pct: number; color: string; size?: number }) {
  const r = size / 2 - 4;
  const circ = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ height: size, width: size }}>
      <svg className="-rotate-90" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} strokeWidth="3" fill="none" stroke="#f1f5f9" />
        <circle cx={size/2} cy={size/2} r={r} strokeWidth="3" fill="none"
          stroke={color} strokeDasharray={circ}
          strokeDashoffset={circ - (pct / 100) * circ} strokeLinecap="round"
          className="transition-all duration-500" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span style={{ fontSize: size < 40 ? 8 : 9 }} className="font-bold text-gray-700">{pct}%</span>
      </div>
    </div>
  );
}

function AvatarStack({ contributors, max = 4 }: { contributors: { name: string; avatar_url: string | null }[]; max?: number }) {
  const shown = contributors.slice(0, max);
  const extra = contributors.length - max;
  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((c, i) => (
        <div key={i} className="ring-2 ring-white rounded-full">
          <Avatar name={c.name} avatar_url={c.avatar_url} size={7} />
        </div>
      ))}
      {extra > 0 && (
        <div className="ring-2 ring-white rounded-full h-7 w-7 bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600">
          +{extra}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Stat chip
// ─────────────────────────────────────────────────────────────

function StatChip({ value, label, color, active, onClick }: {
  value: number; label: string; color: string; active?: boolean; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all text-left',
        active
          ? 'bg-[#1e3a5f] text-white border-[#1e3a5f] shadow-md'
          : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm text-slate-700',
      )}
    >
      <span className={cn('text-lg font-bold leading-none', active ? 'text-white' : color)}>{value}</span>
      <span className={cn('text-xs font-medium', active ? 'text-blue-100' : 'text-slate-500')}>{label}</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Project Card (list view)
// ─────────────────────────────────────────────────────────────

function ProjectCard({
  project, canManage, onOpen, onDelete,
}: {
  project: ProjectFull;
  canManage: boolean;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const today  = new Date().toISOString().slice(0, 10);
  const overdue = project.due_date && project.due_date < today
    && project.status !== 'completed' && project.status !== 'cancelled';
  const doneItems  = project.checklist.filter(i => i.checked).length;
  const totalItems = project.checklist.length;

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Delete "${project.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    setMenuOpen(false);
    await deleteProjectFull(project.id);
    onDelete(project.id);
  }

  return (
    <div
      onClick={() => onOpen(project.id)}
      className={cn(
        'group bg-white rounded-2xl border overflow-hidden flex flex-col cursor-pointer',
        'hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200',
        overdue ? 'border-red-200' : 'border-slate-100',
        project.status === 'review' ? 'ring-2 ring-purple-200' : '',
      )}
    >
      {/* Color bar */}
      <div className="h-1" style={{ background: `linear-gradient(90deg, ${project.color}, ${project.color}66)` }} />

      <div className="p-5 flex flex-col gap-4 flex-1">
        {/* Header row */}
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${project.color}18` }}>
            <FolderOpen className="h-5 w-5" style={{ color: project.color }} />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-bold text-slate-900 leading-snug line-clamp-1 group-hover:text-[#1e3a5f] transition-colors">
              {project.name}
            </p>
            {project.description && (
              <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">{project.description}</p>
            )}
          </div>

          {/* Menu */}
          {canManage && (
            <div className="relative shrink-0" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => setMenuOpen(m => !m)}
                className="h-7 w-7 rounded-lg hover:bg-slate-100 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreVertical className="h-4 w-4 text-slate-400" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-8 z-30 bg-white rounded-xl shadow-xl border border-slate-100 py-1.5 min-w-[140px]">
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex items-center gap-2 px-3 py-2 text-[12px] text-red-600 hover:bg-red-50 w-full rounded-lg mx-1"
                    style={{ width: 'calc(100% - 8px)' }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {deleting ? 'Deleting…' : 'Delete Project'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Status + Priority row */}
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={project.status} />
          <PriorityBadge priority={project.priority} />
          {overdue && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-600 text-[11px] font-medium rounded-full">
              <AlertTriangle className="h-3 w-3" />
              Overdue
            </span>
          )}
          {project.status === 'review' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 text-purple-600 text-[11px] font-medium rounded-full">
              <Clock className="h-3 w-3" />
              Awaiting Approval
            </span>
          )}
        </div>

        {/* Progress */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-400 font-medium">Progress</span>
            <span className="text-[11px] font-bold text-slate-700">{project.progress_pct}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${project.progress_pct}%`, background: `linear-gradient(90deg, ${project.color}, ${project.color}cc)` }}
            />
          </div>
          {totalItems > 0 && (
            <p className="text-[10px] text-slate-400">
              <CheckSquare className="inline h-3 w-3 mr-0.5" />
              {doneItems}/{totalItems} checklist items
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-50 mt-auto">
          <AvatarStack contributors={project.contributors} />
          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            {project.start_date && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {fmtDateShort(project.start_date)}
                {project.due_date && <> → {fmtDateShort(project.due_date)}</>}
              </span>
            )}
            <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
          </div>
        </div>

        {/* Rejection note banner */}
        {project.reviewNote && project.status === 'active' && (
          <div className="mt-1 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-[11px] text-amber-700 font-medium flex items-center gap-1">
              <AlertCircle className="h-3 w-3 shrink-0" />
              Revision needed: {project.reviewNote}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Project Detail View
// ─────────────────────────────────────────────────────────────

function ProjectDetailView({
  project, canApprove, currentUserId,
  onBack, onUpdate, onDelete,
}: {
  project: ProjectFull;
  canApprove: boolean;
  currentUserId: string;
  onBack: () => void;
  onUpdate: (p: ProjectFull) => void;
  onDelete: (id: string) => void;
}) {
  const [busy, setBusy]             = useState<string | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [tab, setTab]               = useState<'overview' | 'checklist' | 'contributors'>('overview');

  const isContributor = project.contributors.some(c => c.userId === currentUserId);
  const canSubmit     = (isContributor || project.created_by === currentUserId)
    && (project.status === 'active' || project.status === 'planning');
  const canAct        = canApprove && project.status === 'review';

  const doneItems  = project.checklist.filter(i => i.checked).length;
  const totalItems = project.checklist.length;

  async function handleChecklistToggle(itemId: string, checked: boolean) {
    const result = await updateProjectChecklistItem(project.id, itemId, checked);
    if (result.success) onUpdate(result.data);
  }

  async function handleSubmitReview() {
    setBusy('submit');
    const result = await submitProjectForReview(project.id);
    if (result.success) onUpdate(result.data);
    setBusy(null);
  }

  async function handleApprove() {
    setBusy('approve');
    const result = await approveProject(project.id);
    if (result.success) onUpdate(result.data);
    setBusy(null);
  }

  async function handleReject() {
    if (!rejectNote.trim()) return;
    setBusy('reject');
    const result = await rejectProjectReview(project.id, rejectNote);
    if (result.success) { onUpdate(result.data); setShowReject(false); setRejectNote(''); }
    setBusy(null);
  }

  async function handleDelete() {
    if (!confirm(`Delete "${project.name}"? This cannot be undone.`)) return;
    await deleteProjectFull(project.id);
    onDelete(project.id);
    onBack();
  }

  const today = new Date().toISOString().slice(0, 10);
  const overdue = project.due_date && project.due_date < today
    && project.status !== 'completed' && project.status !== 'cancelled';

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── Sticky header ──────────────────────────────────── */}
      <div className="shrink-0 bg-white border-b border-slate-100 px-6 py-4">
        <div className="flex items-center gap-4 flex-wrap">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors font-medium"
          >
            <ChevronLeft className="h-4 w-4" />
            All Projects
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="h-5 w-5 rounded" style={{ backgroundColor: project.color }} />
              <h2 className="text-base font-bold text-slate-900 truncate">{project.name}</h2>
              <StatusBadge status={project.status} />
              <PriorityBadge priority={project.priority} />
              {overdue && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-600 text-[11px] font-medium rounded-full">
                  <AlertTriangle className="h-3 w-3" />Overdue
                </span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {canSubmit && (
              <button
                onClick={handleSubmitReview}
                disabled={!!busy}
                className="flex items-center gap-2 px-4 py-2 bg-[#1e3a5f] text-white text-sm font-medium rounded-xl hover:bg-[#162d4f] transition-colors disabled:opacity-60"
              >
                {busy === 'submit' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Submit for Review
              </button>
            )}
            {canAct && (
              <>
                <button
                  onClick={handleApprove}
                  disabled={!!busy}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-60"
                >
                  {busy === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsUp className="h-4 w-4" />}
                  Approve
                </button>
                <button
                  onClick={() => setShowReject(true)}
                  disabled={!!busy}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 transition-colors disabled:opacity-60"
                >
                  <ThumbsDown className="h-4 w-4" />
                  Reject
                </button>
              </>
            )}
            {project.status === 'completed' && (
              <span className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 text-sm font-semibold rounded-xl">
                <CheckCircle2 className="h-4 w-4" />
                Completed
              </span>
            )}
          </div>
        </div>

        {/* Rejection note */}
        {project.reviewNote && project.status === 'active' && (
          <div className="mt-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-amber-700">Revision Requested</p>
              <p className="text-xs text-amber-600 mt-0.5">{project.reviewNote}</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mt-4 bg-slate-50 rounded-xl p-1 w-fit">
          {(['overview', 'checklist', 'contributors'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'px-4 py-1.5 rounded-lg text-[13px] font-medium transition-all capitalize',
                tab === t
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700',
              )}
            >
              {t === 'overview' && 'Overview'}
              {t === 'checklist' && `Checklist ${totalItems > 0 ? `(${doneItems}/${totalItems})` : ''}`}
              {t === 'contributors' && `Contributors (${project.contributors.length})`}
            </button>
          ))}
        </div>
      </div>

      {/* ── Scrollable content ─────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-6">

        {/* OVERVIEW TAB */}
        {tab === 'overview' && (
          <div className="max-w-3xl space-y-6">
            {/* Description */}
            {project.description && (
              <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Description</p>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{project.description}</p>
              </div>
            )}

            {/* Key details */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Status</p>
                <StatusBadge status={project.status} />
              </div>
              <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Priority</p>
                <PriorityBadge priority={project.priority} />
              </div>
              <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Start Date</p>
                <p className="text-sm font-semibold text-slate-800">{fmtDate(project.start_date) ?? '—'}</p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">End Date</p>
                <p className={cn('text-sm font-semibold', overdue ? 'text-red-600' : 'text-slate-800')}>
                  {fmtDate(project.due_date) ?? '—'}
                </p>
              </div>
            </div>

            {/* Progress card */}
            <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Overall Progress</p>
                <div className="flex items-center gap-3">
                  <ProgressRing pct={project.progress_pct} color={project.color} size={48} />
                </div>
              </div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${project.progress_pct}%`, background: `linear-gradient(90deg, ${project.color}, ${project.color}99)` }}
                />
              </div>
              <div className="flex justify-between mt-2">
                <p className="text-[11px] text-slate-400">{doneItems} of {totalItems} checklist items done</p>
                <p className="text-[11px] font-bold text-slate-700">{project.progress_pct}%</p>
              </div>
            </div>

            {/* Quick contributor list */}
            {project.contributors.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Team</p>
                <div className="flex flex-wrap gap-2">
                  {project.contributors.map(c => (
                    <div key={c.userId} className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-full">
                      <Avatar name={c.name} avatar_url={c.avatar_url} size={7} />
                      <span className="text-[12px] font-medium text-slate-700">{c.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* CHECKLIST TAB */}
        {tab === 'checklist' && (
          <div className="max-w-2xl">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {/* Checklist header */}
              <div className="px-6 py-4 border-b border-slate-50 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-900">Project Checklist</p>
                  <p className="text-xs text-slate-400 mt-0.5">{doneItems} of {totalItems} items completed</p>
                </div>
                {totalItems > 0 && (
                  <div className="flex items-center gap-3">
                    <ProgressRing pct={project.progress_pct} color={project.color} size={44} />
                  </div>
                )}
              </div>

              {/* Progress bar */}
              {totalItems > 0 && (
                <div className="px-6 py-3 bg-slate-50 border-b border-slate-100">
                  <div className="h-2.5 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${project.progress_pct}%`, background: `linear-gradient(90deg, ${project.color}, ${project.color}aa)` }}
                    />
                  </div>
                </div>
              )}

              {/* Items */}
              {project.checklist.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <ClipboardList className="h-10 w-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm text-slate-400">No checklist items added to this project.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {project.checklist.map((item, idx) => (
                    <ChecklistRow
                      key={item.id}
                      item={item}
                      idx={idx}
                      disabled={project.status === 'completed' || project.status === 'cancelled'}
                      onToggle={(checked) => handleChecklistToggle(item.id, checked)}
                    />
                  ))}
                </div>
              )}

              {/* Submit for review CTA */}
              {canSubmit && totalItems > 0 && doneItems === totalItems && (
                <div className="px-6 py-4 bg-emerald-50 border-t border-emerald-100 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">All items completed!</p>
                    <p className="text-xs text-emerald-600">Ready to submit for review and approval.</p>
                  </div>
                  <button
                    onClick={handleSubmitReview}
                    disabled={!!busy}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-60"
                  >
                    {busy === 'submit' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Submit for Review
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* CONTRIBUTORS TAB */}
        {tab === 'contributors' && (
          <div className="max-w-2xl">
            {project.contributors.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-12 text-center">
                <Users className="h-10 w-10 text-slate-200 mx-auto mb-3" />
                <p className="text-sm text-slate-400">No contributors assigned.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {project.contributors.map(c => (
                  <div key={c.userId} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-start gap-4">
                    <Avatar name={c.name} avatar_url={c.avatar_url} size={9} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[14px] font-bold text-slate-900">{c.name}</p>
                        <span className={cn(
                          'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                          c.role === 'owner'
                            ? 'bg-[#1e3a5f] text-white'
                            : 'bg-slate-100 text-slate-600',
                        )}>
                          {c.role}
                        </span>
                        {c.jobTitle && (
                          <span className="text-[11px] text-slate-400">{c.jobTitle}</span>
                        )}
                      </div>
                      {c.contribution ? (
                        <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{c.contribution}</p>
                      ) : (
                        <p className="text-sm text-slate-300 mt-1.5 italic">No contribution description</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Reject Modal ───────────────────────────────────── */}
      {showReject && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Request Revision</h3>
              <p className="text-xs text-slate-400 mt-0.5">Provide feedback so the team can improve the project.</p>
            </div>
            <div className="px-6 py-5">
              <label className="block text-xs font-semibold text-slate-600 mb-2">Revision Notes</label>
              <textarea
                value={rejectNote}
                onChange={e => setRejectNote(e.target.value)}
                placeholder="Explain what needs to be changed or improved…"
                rows={4}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
                autoFocus
              />
            </div>
            <div className="px-6 pb-5 flex gap-3 justify-end">
              <button
                onClick={() => { setShowReject(false); setRejectNote(''); }}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectNote.trim() || busy === 'reject'}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {busy === 'reject' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsDown className="h-4 w-4" />}
                Send Revision Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Checklist row (separate to avoid closure re-render) ──────

function ChecklistRow({
  item, idx, disabled, onToggle,
}: {
  item: ProjectChecklistItem;
  idx: number;
  disabled: boolean;
  onToggle: (checked: boolean) => void;
}) {
  const [localChecked, setLocalChecked] = useState(item.checked);

  useEffect(() => { setLocalChecked(item.checked); }, [item.checked]);

  function handleChange() {
    if (disabled) return;
    const next = !localChecked;
    setLocalChecked(next);
    onToggle(next);
  }

  return (
    <div
      onClick={handleChange}
      className={cn(
        'flex items-start gap-4 px-6 py-4 transition-colors',
        disabled ? 'opacity-70' : 'hover:bg-slate-50 cursor-pointer',
        localChecked ? 'opacity-75' : '',
      )}
    >
      <div className="mt-0.5 shrink-0">
        {localChecked
          ? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          : <Circle className="h-5 w-5 text-slate-300" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm text-slate-800 leading-snug', localChecked && 'line-through text-slate-400')}>
          {item.text}
        </p>
        {item.checked_at && localChecked && (
          <p className="text-[10px] text-slate-400 mt-0.5">
            Completed {fmtDate(item.checked_at)}
          </p>
        )}
      </div>
      <span className="shrink-0 text-[11px] text-slate-300 font-medium mt-0.5">#{idx + 1}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Create Project Modal (4-step wizard)
// ─────────────────────────────────────────────────────────────

interface OrgMember { id: string; name: string; avatar_url: string | null; jobTitle: string | null }

function CreateProjectModal({
  currentUserId, onClose, onCreate,
}: {
  currentUserId: string;
  onClose: () => void;
  onCreate: (p: ProjectFull) => void;
}) {
  const [step, setStep]   = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Step 1 – Basic Info
  const [name, setName]         = useState('');
  const [desc, setDesc]         = useState('');
  const [priority, setPriority] = useState<ProjectPriority>('medium');
  const [color, setColor]       = useState(COLOR_PRESETS[0]);

  // Step 2 – Timeline
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate]     = useState('');

  // Step 3 – Contributors
  const [members, setMembers]   = useState<OrgMember[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [selected, setSelected] = useState<Record<string, string>>({});  // userId → contribution

  // Step 4 – Checklist
  const [checkInput, setCheckInput] = useState('');
  const [checklist, setChecklist]   = useState<string[]>([]);

  // Load members when step 3 is reached
  useEffect(() => {
    if (step !== 3 || members.length > 0) return;
    setLoadingMembers(true);
    getOrgMembersAdmin().then(r => {
      if (r.success) setMembers(r.data);
      setLoadingMembers(false);
    });
  }, [step]);

  function toggleMember(id: string) {
    setSelected(prev => {
      const next = { ...prev };
      if (id in next) delete next[id];
      else next[id] = '';
      return next;
    });
  }

  function setContribution(id: string, value: string) {
    setSelected(prev => ({ ...prev, [id]: value }));
  }

  function addCheckItem() {
    const t = checkInput.trim();
    if (!t) return;
    setChecklist(prev => [...prev, t]);
    setCheckInput('');
  }

  function removeCheckItem(i: number) {
    setChecklist(prev => prev.filter((_, idx) => idx !== i));
  }

  function canNext() {
    if (step === 1) return name.trim().length > 0;
    return true;
  }

  async function handleCreate() {
    setSaving(true);
    setError('');
    const contributors: ContributorInput[] = Object.entries(selected).map(([userId, contribution]) => ({
      userId, contribution,
    }));
    const result = await createProjectFull({
      name: name.trim(),
      description: desc.trim() || null,
      priority,
      color,
      start_date: startDate || null,
      due_date:   endDate || null,
      contributors,
      checklist,
    });
    if (result.success) {
      onCreate(result.data);
      onClose();
    } else {
      setError(result.error ?? 'Failed to create project');
    }
    setSaving(false);
  }

  const STEPS = ['Basic Info', 'Timeline', 'Contributors', 'Checklist'];

  const filteredMembers = members.filter(m =>
    !memberSearch || m.name.toLowerCase().includes(memberSearch.toLowerCase()),
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${color}18` }}>
                <FolderOpen className="h-5 w-5" style={{ color }} />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">New Project</h2>
                <p className="text-xs text-slate-400">Step {step} of {STEPS.length} — {STEPS[step - 1]}</p>
              </div>
            </div>
            <button onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-slate-100 flex items-center justify-center">
              <X className="h-4 w-4 text-slate-400" />
            </button>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-0">
            {STEPS.map((s, i) => (
              <div key={i} className="flex items-center flex-1">
                <div className={cn(
                  'h-2.5 w-2.5 rounded-full shrink-0 transition-all',
                  i + 1 < step  ? 'bg-[#1e3a5f]' :
                  i + 1 === step ? 'bg-[#1e3a5f] ring-4 ring-blue-100' :
                  'bg-slate-200',
                )} />
                {i < STEPS.length - 1 && (
                  <div className={cn('h-0.5 flex-1 transition-all', i + 1 < step ? 'bg-[#1e3a5f]' : 'bg-slate-200')} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* ── Step 1: Basic Info ────────────────────────── */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Project Title <span className="text-red-500">*</span>
                </label>
                <input
                  autoFocus
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Q3 Staff Training Initiative"
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 placeholder:text-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Description</label>
                <textarea
                  value={desc}
                  onChange={e => setDesc(e.target.value)}
                  placeholder="What is this project about? What are the goals?"
                  rows={3}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none placeholder:text-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Priority</label>
                <div className="flex gap-2 flex-wrap">
                  {(Object.keys(PRIORITY_META) as ProjectPriority[]).map(p => (
                    <button
                      key={p}
                      onClick={() => setPriority(p)}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] font-medium transition-all',
                        priority === p
                          ? 'border-[#1e3a5f] bg-[#1e3a5f] text-white shadow-sm'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300',
                      )}
                    >
                      <Flag className="h-3 w-3" />
                      {PRIORITY_META[p].label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Project Color</label>
                <div className="flex gap-2 flex-wrap">
                  {COLOR_PRESETS.map(c => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className={cn(
                        'h-8 w-8 rounded-lg transition-all',
                        color === c ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : 'hover:scale-105',
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Timeline ──────────────────────────── */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-700">
                <Calendar className="inline h-4 w-4 mr-1.5" />
                Set the project timeline. Both dates are optional but recommended.
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">End Date / Deadline</label>
                <input
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>

              {startDate && endDate && (
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs text-slate-500 font-medium">Duration</p>
                  <p className="text-sm font-bold text-slate-800 mt-1">
                    {Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000))} days
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Contributors ──────────────────────── */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500">
                Select team members and describe what each person will contribute to this project.
              </p>

              {loadingMembers ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                    <input
                      value={memberSearch}
                      onChange={e => setMemberSearch(e.target.value)}
                      placeholder="Search team members…"
                      className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                    />
                  </div>

                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {filteredMembers.map(m => {
                      const isSelf    = m.id === currentUserId;
                      const isChecked = m.id in selected;
                      return (
                        <div key={m.id} className={cn(
                          'rounded-xl border transition-all',
                          isChecked ? 'border-[#1e3a5f] bg-blue-50/60' : 'border-slate-200 bg-white hover:border-slate-300',
                        )}>
                          <div
                            className="flex items-center gap-3 p-3 cursor-pointer"
                            onClick={() => toggleMember(m.id)}
                          >
                            <div className={cn(
                              'h-5 w-5 rounded flex items-center justify-center shrink-0 border-2 transition-all',
                              isChecked ? 'border-[#1e3a5f] bg-[#1e3a5f]' : 'border-slate-300',
                            )}>
                              {isChecked && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                            </div>
                            <Avatar name={m.name} avatar_url={m.avatar_url} size={7} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-800">
                                {m.name}
                                {isSelf && <span className="ml-1 text-[10px] text-[#1e3a5f] font-bold">(You)</span>}
                              </p>
                              {m.jobTitle && <p className="text-[11px] text-slate-400">{m.jobTitle}</p>}
                            </div>
                          </div>
                          {isChecked && (
                            <div className="px-3 pb-3">
                              <input
                                value={selected[m.id] ?? ''}
                                onChange={e => setContribution(m.id, e.target.value)}
                                placeholder={isSelf ? 'Your role (e.g. Project lead, oversight)' : `${m.name.split(' ')[0]}'s role in this project…`}
                                className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 placeholder:text-slate-300"
                                onClick={e => e.stopPropagation()}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {filteredMembers.length === 0 && (
                      <p className="text-sm text-slate-400 text-center py-6">No members found</p>
                    )}
                  </div>

                  {Object.keys(selected).length > 0 && (
                    <p className="text-xs text-slate-500 font-medium">
                      {Object.keys(selected).length} member{Object.keys(selected).length !== 1 ? 's' : ''} selected
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Step 4: Checklist ─────────────────────────── */}
          {step === 4 && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500">
                Add checklist items that must be completed before the project can be submitted for review.
              </p>

              <div className="flex gap-2">
                <input
                  value={checkInput}
                  onChange={e => setCheckInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCheckItem(); }}}
                  placeholder="Add a checklist item and press Enter…"
                  className="flex-1 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 placeholder:text-slate-300"
                  autoFocus
                />
                <button
                  onClick={addCheckItem}
                  disabled={!checkInput.trim()}
                  className="px-4 py-2 bg-[#1e3a5f] text-white rounded-xl text-sm font-medium hover:bg-[#162d4f] disabled:opacity-40 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {checklist.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-xl border border-slate-100">
                  <ClipboardList className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">No checklist items yet.</p>
                  <p className="text-xs text-slate-300 mt-0.5">Add items above, or skip this step.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {checklist.map((item, i) => (
                    <div key={i} className="flex items-center gap-3 px-3.5 py-2.5 bg-white rounded-xl border border-slate-100 group">
                      <Circle className="h-4 w-4 text-slate-300 shrink-0" />
                      <span className="flex-1 text-sm text-slate-700">{item}</span>
                      <span className="text-[11px] text-slate-300 font-medium">#{i + 1}</span>
                      <button
                        onClick={() => removeCheckItem(i)}
                        className="h-6 w-6 rounded-lg hover:bg-red-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3.5 w-3.5 text-red-400" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 shrink-0 flex justify-between items-center">
          <button
            onClick={() => step === 1 ? onClose() : setStep(s => s - 1)}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-xl transition-colors font-medium"
          >
            {step === 1 ? 'Cancel' : '← Back'}
          </button>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">{step}/{STEPS.length}</span>
            {step < 4 ? (
              <button
                onClick={() => setStep(s => s + 1)}
                disabled={!canNext()}
                className="flex items-center gap-2 px-5 py-2 bg-[#1e3a5f] text-white text-sm font-medium rounded-xl hover:bg-[#162d4f] disabled:opacity-40 transition-colors"
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={handleCreate}
                disabled={saving || !name.trim()}
                className="flex items-center gap-2 px-5 py-2 bg-[#1e3a5f] text-white text-sm font-medium rounded-xl hover:bg-[#162d4f] disabled:opacity-40 transition-colors"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
                {saving ? 'Creating…' : 'Create Project'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Check icon (for step indicator)
// ─────────────────────────────────────────────────────────────

function Check({ className, strokeWidth = 2 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={strokeWidth}>
      <polyline points="20 6 9 16 4 11" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Shell
// ─────────────────────────────────────────────────────────────

interface Props {
  projects: ProjectFull[];
  role: AppRole | null;
  currentUserId: string;
}

export default function ProjectsShell({ projects: initialProjects, role, currentUserId }: Props) {
  const [localProjects, setLocalProjects] = useState<ProjectFull[]>(initialProjects);
  const [view, setView]         = useState<'list' | 'detail'>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'all'>('all');
  const [search, setSearch]     = useState('');

  useEffect(() => { setLocalProjects(initialProjects); }, [initialProjects]);

  const canCreate  = !!role && CAN_CREATE_ROLES.includes(role);
  const canApprove = !!role && CAN_APPROVE_ROLES.includes(role);

  const selectedProject = localProjects.find(p => p.id === selectedId) ?? null;

  const stats = useMemo(() => ({
    total:     localProjects.length,
    active:    localProjects.filter(p => p.status === 'active').length,
    review:    localProjects.filter(p => p.status === 'review').length,
    completed: localProjects.filter(p => p.status === 'completed').length,
  }), [localProjects]);

  const filtered = useMemo(() => {
    return localProjects.filter(p => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())
        && !(p.description?.toLowerCase().includes(search.toLowerCase()))) return false;
      return true;
    });
  }, [localProjects, statusFilter, search]);

  function openProject(id: string) {
    setSelectedId(id);
    setView('detail');
  }

  function backToList() {
    setView('list');
    setSelectedId(null);
  }

  function updateProject(updated: ProjectFull) {
    setLocalProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
  }

  function removeProject(id: string) {
    setLocalProjects(prev => prev.filter(p => p.id !== id));
  }

  function addProject(p: ProjectFull) {
    setLocalProjects(prev => [p, ...prev]);
  }

  // ── Detail View ───────────────────────────────────────────
  if (view === 'detail' && selectedProject) {
    return (
      <>
        <ProjectDetailView
          project={selectedProject}
          canApprove={canApprove}
          currentUserId={currentUserId}
          onBack={backToList}
          onUpdate={updateProject}
          onDelete={removeProject}
        />
      </>
    );
  }

  // ── List View ─────────────────────────────────────────────
  return (
    <>
      <div className="h-full flex flex-col overflow-hidden">
        {/* Sticky header */}
        <div className="shrink-0 bg-white border-b border-slate-100 shadow-sm">
          <div className="px-6 pt-5 pb-4">
            {/* Title row */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#1e3a5f] to-[#2563eb] flex items-center justify-center shadow-sm">
                  <Layers className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900 leading-tight">Projects</h1>
                  <p className="text-xs text-slate-400 mt-0.5">Track team projects and approvals</p>
                </div>
              </div>
              {canCreate && (
                <button
                  onClick={() => setShowCreate(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-[#1e3a5f] text-white text-sm font-semibold rounded-xl hover:bg-[#162d4f] transition-all shadow-sm hover:shadow-md"
                >
                  <Plus className="h-4 w-4" />
                  Add Project
                </button>
              )}
            </div>

            {/* Stats row */}
            <div className="flex gap-2 flex-wrap mb-4">
              <StatChip value={stats.total}     label="Total"       color="text-slate-600" active={statusFilter === 'all'}       onClick={() => setStatusFilter('all')}       />
              <StatChip value={stats.active}    label="Active"      color="text-green-600" active={statusFilter === 'active'}    onClick={() => setStatusFilter('active')}    />
              <StatChip value={stats.review}    label="In Review"   color="text-purple-600" active={statusFilter === 'review'}   onClick={() => setStatusFilter('review')}   />
              <StatChip value={stats.completed} label="Completed"   color="text-emerald-600" active={statusFilter === 'completed'} onClick={() => setStatusFilter('completed')} />
            </div>

            {/* Search + Filter row */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search projects…"
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-slate-50 focus:bg-white transition-colors"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                    <X className="h-4 w-4 text-slate-400" />
                  </button>
                )}
              </div>

              {/* Status filter pills */}
              <div className="flex gap-1.5 overflow-x-auto">
                {STATUS_FILTERS.slice(1).map(f => (
                  <button
                    key={f.id}
                    onClick={() => setStatusFilter(f.id)}
                    className={cn(
                      'px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap border transition-all',
                      statusFilter === f.id
                        ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300 bg-white',
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="h-16 w-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4">
                <FolderOpen className="h-7 w-7 text-slate-300" />
              </div>
              <p className="text-base font-semibold text-slate-600 mb-1">
                {search || statusFilter !== 'all' ? 'No projects match your filters' : 'No projects yet'}
              </p>
              <p className="text-sm text-slate-400 mb-4">
                {search || statusFilter !== 'all'
                  ? 'Try adjusting your search or filter'
                  : canCreate
                    ? 'Create the first project for your team'
                    : 'Projects will appear here once created'}
              </p>
              {canCreate && !search && statusFilter === 'all' && (
                <button
                  onClick={() => setShowCreate(true)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-[#1e3a5f] text-white text-sm font-semibold rounded-xl hover:bg-[#162d4f] transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Create First Project
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {filtered.map(p => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  canManage={canCreate || p.created_by === currentUserId || p.owner_id === currentUserId}
                  onOpen={openProject}
                  onDelete={removeProject}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateProjectModal
          currentUserId={currentUserId}
          onClose={() => setShowCreate(false)}
          onCreate={addProject}
        />
      )}
    </>
  );
}
