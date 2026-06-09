'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  FolderOpen, Plus, Search, Filter, Building2, Users, Calendar,
  CheckCircle2, Clock, AlertTriangle, ChevronRight, Sparkles,
  BarChart3, Star, Globe, Tag, X, Loader2, MoreHorizontal,
  Trash2, Edit3, ArrowUpRight, Zap, RefreshCw, TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  createProject, deleteProject,
} from '@/lib/actions/projects';
import type {
  Project, ProjectStats, ProjectTemplate, ProjectPriority,
} from '@/lib/actions/projects';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<ProjectPriority, { label: string; cls: string; dot: string }> = {
  low:    { label: 'Low',    cls: 'bg-gray-100 text-gray-600',    dot: 'bg-gray-400'   },
  medium: { label: 'Medium', cls: 'bg-blue-50 text-blue-700',     dot: 'bg-blue-500'   },
  high:   { label: 'High',   cls: 'bg-amber-50 text-amber-700',   dot: 'bg-amber-500'  },
  urgent: { label: 'Urgent', cls: 'bg-red-50 text-red-700',       dot: 'bg-red-500'    },
};

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  planning:  { label: 'Planning',   cls: 'bg-blue-50 text-blue-700'    },
  active:    { label: 'Active',     cls: 'bg-green-50 text-green-700'  },
  on_hold:   { label: 'On Hold',    cls: 'bg-amber-50 text-amber-700'  },
  completed: { label: 'Completed',  cls: 'bg-emerald-50 text-emerald-700' },
  cancelled: { label: 'Cancelled',  cls: 'bg-red-50 text-red-600'     },
};

const COLOR_PRESETS = [
  '#f97316','#3b82f6','#22c55e','#8b5cf6',
  '#ef4444','#14b8a6','#ec4899','#f59e0b',
];

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function ProgressRing({ pct, color }: { pct: number; color: string }) {
  const r = 16; const circ = 2 * Math.PI * r;
  return (
    <div className="relative h-10 w-10 shrink-0">
      <svg className="h-10 w-10 -rotate-90" viewBox="0 0 38 38">
        <circle cx="19" cy="19" r={r} strokeWidth="3" fill="none" stroke="#f1f5f9" />
        <circle cx="19" cy="19" r={r} strokeWidth="3" fill="none"
          stroke={color} strokeDasharray={circ}
          strokeDashoffset={circ - (pct / 100) * circ} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <p className="text-[9px] font-bold text-gray-700">{pct}%</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Stats Bar
// ─────────────────────────────────────────────────────────────

function StatsBar({ stats }: { stats: ProjectStats }) {
  const tiles = [
    { icon: FolderOpen,    val: stats.total,      label: 'Total Projects',  cls: 'text-slate-500',  bg: 'bg-slate-50'   },
    { icon: TrendingUp,    val: stats.active,     label: 'Active',          cls: 'text-green-600',  bg: 'bg-green-50'   },
    { icon: CheckCircle2,  val: stats.completed,  label: 'Completed',       cls: 'text-emerald-600',bg: 'bg-emerald-50' },
    { icon: AlertTriangle, val: stats.overdue,    label: 'Overdue',         cls: 'text-red-600',    bg: 'bg-red-50'     },
    { icon: Clock,         val: stats.dueSoon,    label: 'Due This Week',   cls: 'text-amber-600',  bg: 'bg-amber-50'   },
    { icon: Star,          val: stats.myProjects, label: 'My Projects',     cls: 'text-blue-600',   bg: 'bg-blue-50'    },
  ];
  return (
    <div className="grid grid-cols-3 xl:grid-cols-6 gap-3">
      {tiles.map(t => (
        <div key={t.label} className={cn('rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3', t.bg)}>
          <div className={cn('h-9 w-9 rounded-xl flex items-center justify-center shrink-0 bg-white shadow-sm')}>
            <t.icon className={cn('h-4.5 w-4.5', t.cls)} />
          </div>
          <div>
            <p className="text-[22px] font-bold text-gray-900 leading-none">{t.val}</p>
            <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{t.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Project Card
// ─────────────────────────────────────────────────────────────

function ProjectCard({
  project, userId, onDelete,
}: {
  project: Project;
  userId: string;
  onDelete: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const color = project.color;
  const pc    = PRIORITY_CONFIG[project.priority] ?? PRIORITY_CONFIG.medium;
  const sc    = STATUS_CONFIG[project.status]     ?? STATUS_CONFIG.active;
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = project.due_date && project.due_date < today && project.status !== 'completed' && project.status !== 'cancelled';
  const days  = project.due_date ? daysUntil(project.due_date) : null;

  async function handleDelete() {
    if (!confirm(`Delete "${project.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    await deleteProject(project.id);
    onDelete(project.id);
  }

  return (
    <div className={cn(
      'bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col group hover:shadow-md transition-all duration-200',
      isOverdue ? 'border-red-200 ring-1 ring-red-100' : 'border-gray-100',
    )}>
      <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, ${color}, ${color}88)` }} />

      <div className="p-5 flex flex-col gap-4 flex-1">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}18` }}>
            <FolderOpen className="h-5 w-5" style={{ color }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href={`/projects/${project.id}`}
                className="text-[14px] font-bold text-gray-900 hover:text-orange-600 transition-colors leading-tight line-clamp-1"
              >
                {project.name}
              </Link>
              {project.is_cross_hospital && (
                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider bg-purple-500 text-white rounded-full px-1.5 py-0.5">
                  <Globe className="h-2.5 w-2.5" /> Cross
                </span>
              )}
            </div>
            {project.description && (
              <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">{project.description}</p>
            )}
          </div>

          {/* Menu */}
          <div className="relative shrink-0">
            <button
              onClick={() => setMenuOpen(m => !m)}
              className="h-7 w-7 rounded-lg hover:bg-gray-100 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
            >
              <MoreHorizontal className="h-4 w-4 text-gray-400" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-8 z-20 bg-white rounded-xl shadow-lg border border-gray-100 py-1 min-w-[140px]">
                <Link
                  href={`/projects/${project.id}`}
                  className="flex items-center gap-2 px-3 py-2 text-[12px] text-gray-700 hover:bg-gray-50"
                  onClick={() => setMenuOpen(false)}
                >
                  <ArrowUpRight className="h-3.5 w-3.5" /> Open
                </Link>
                <Link
                  href={`/projects/${project.id}?tab=tasks`}
                  className="flex items-center gap-2 px-3 py-2 text-[12px] text-gray-700 hover:bg-gray-50"
                  onClick={() => setMenuOpen(false)}
                >
                  <Edit3 className="h-3.5 w-3.5" /> Tasks
                </Link>
                {(userId === project.created_by || userId === project.owner_id) && (
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex items-center gap-2 px-3 py-2 text-[12px] text-red-600 hover:bg-red-50 w-full"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> {deleting ? 'Deleting…' : 'Delete'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Progress + status row */}
        <div className="flex items-center gap-3">
          <ProgressRing pct={project.progress_pct} color={color} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', sc.cls)}>{sc.label}</span>
              <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', pc.cls)}>{pc.label}</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${project.progress_pct}%`, backgroundColor: color }} />
            </div>
          </div>
        </div>

        {/* Meta row */}
        <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-500">
          {project.hospitalName && (
            <div className="flex items-center gap-1 truncate">
              <Building2 className="h-3 w-3 shrink-0" style={{ color: project.hospitalColor ?? '#6b7280' }} />
              <span className="truncate">{project.hospitalName}</span>
            </div>
          )}
          {project.ownerName && (
            <div className="flex items-center gap-1 truncate">
              <Users className="h-3 w-3 shrink-0" />
              <span className="truncate">{project.ownerName}</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 shrink-0 text-gray-400" />
            <span>{project.completedCount ?? 0}/{project.taskCount ?? 0} tasks</span>
          </div>
          {project.due_date && (
            <div className={cn('flex items-center gap-1', isOverdue ? 'text-red-600 font-semibold' : days !== null && days <= 7 ? 'text-amber-600' : '')}>
              <Clock className="h-3 w-3 shrink-0" />
              {isOverdue
                ? `${Math.abs(days ?? 0)}d overdue`
                : days !== null && days === 0
                  ? 'Due today'
                  : days !== null && days > 0
                    ? `${days}d left`
                    : fmtDate(project.due_date)}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 mt-auto pt-3 border-t border-gray-50">
          <Link
            href={`/projects/${project.id}`}
            className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-xl bg-gray-50 hover:bg-gray-100 text-[12px] font-medium text-gray-600 transition-colors border border-gray-100"
          >
            <ArrowUpRight className="h-3.5 w-3.5" /> Open
          </Link>
          <Link
            href={`/projects/${project.id}?tab=tasks`}
            className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-xl text-[12px] font-medium text-white transition-colors"
            style={{ backgroundColor: color }}
          >
            <Zap className="h-3.5 w-3.5" /> Tasks
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Create Project Modal
// ─────────────────────────────────────────────────────────────

interface CreateModalProps {
  hospitals: Array<{ id: string; name: string; color: string }>;
  templates: ProjectTemplate[];
  onClose: () => void;
  onCreated: (p: Project) => void;
}

function CreateProjectModal({ hospitals, templates, onClose, onCreated }: CreateModalProps) {
  const [step,          setStep]          = useState<'template' | 'form'>('template');
  const [selectedTpl,   setSelectedTpl]   = useState<string | null>(null);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState('');
  const [form, setForm] = useState({
    name:              '',
    description:       '',
    hospital_id:       '',
    priority:          'medium' as ProjectPriority,
    start_date:        '',
    due_date:          '',
    color:             '#f97316',
    is_cross_hospital: false,
  });

  function onField(k: keyof typeof form, v: string | boolean) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Project name is required.'); return; }
    setLoading(true); setError('');
    try {
      const res = await createProject({
        name:              form.name,
        description:       form.description || null,
        hospital_id:       form.hospital_id || null,
        priority:          form.priority,
        start_date:        form.start_date || null,
        due_date:          form.due_date   || null,
        color:             form.color,
        is_cross_hospital: form.is_cross_hospital,
        template_id:       selectedTpl || null,
      });
      if (!res.success) { setError(res.error); return; }
      onCreated(res.data);
      onClose();
    } finally {
      setLoading(false);
    }
  }

  const TEMPLATE_ICONS: Record<string, string> = {
    events: '📅', hr: '👥', compliance: '🛡️', training: '🎓',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-orange-50 flex items-center justify-center">
              <FolderOpen className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-gray-900">New Project</h2>
              <p className="text-[11px] text-gray-400">{step === 'template' ? 'Choose a template or start blank' : 'Fill in project details'}</p>
            </div>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-xl hover:bg-gray-100 flex items-center justify-center">
            <X className="h-4 w-4 text-gray-400" />
          </button>
        </div>

        {step === 'template' ? (
          <div className="p-6 space-y-4">
            <button
              onClick={() => { setSelectedTpl(null); setStep('form'); }}
              className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-dashed border-gray-200 hover:border-orange-300 hover:bg-orange-50/30 transition-all text-left group"
            >
              <div className="h-10 w-10 rounded-xl bg-gray-100 group-hover:bg-orange-100 flex items-center justify-center text-[20px] shrink-0">
                ✦
              </div>
              <div>
                <p className="text-[13px] font-bold text-gray-900">Start Blank</p>
                <p className="text-[11px] text-gray-400">Build your project from scratch</p>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-orange-400 ml-auto" />
            </button>

            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Templates</p>
            <div className="grid grid-cols-2 gap-3">
              {templates.map(t => (
                <button
                  key={t.id}
                  onClick={() => {
                    setSelectedTpl(t.id);
                    setForm(f => ({ ...f, color: t.color, name: '' }));
                    setStep('form');
                  }}
                  className="flex items-start gap-3 p-4 rounded-xl border border-gray-100 hover:border-orange-200 hover:bg-orange-50/30 transition-all text-left group"
                >
                  <div
                    className="h-10 w-10 rounded-xl flex items-center justify-center text-[20px] shrink-0"
                    style={{ backgroundColor: `${t.color}20` }}
                  >
                    {TEMPLATE_ICONS[t.category ?? ''] ?? '📁'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[12px] font-bold text-gray-900 leading-tight">{t.name}</p>
                    {t.description && (
                      <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-2">{t.description}</p>
                    )}
                    <p className="text-[10px] text-gray-400 mt-1">
                      {Array.isArray(t.default_tasks) ? t.default_tasks.length : 0} pre-built tasks
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Color */}
            <div className="flex items-center gap-2 mb-1">
              <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 flex-1">Project Color</p>
              <div className="flex gap-1.5">
                {COLOR_PRESETS.map(c => (
                  <button
                    key={c} type="button"
                    onClick={() => onField('color', c)}
                    className={cn('h-6 w-6 rounded-full border-2 transition-all', form.color === c ? 'border-gray-900 scale-110' : 'border-transparent')}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-gray-400 block mb-1.5">
                Project Name <span className="text-red-400">*</span>
              </label>
              <input
                value={form.name}
                onChange={e => onField('name', e.target.value)}
                placeholder="e.g. Staff Onboarding — Q3 2026"
                className="w-full h-10 px-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-300"
                required
              />
            </div>

            {/* Description */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-gray-400 block mb-1.5">Description</label>
              <textarea
                value={form.description}
                onChange={e => onField('description', e.target.value)}
                placeholder="What is this project about?"
                rows={2}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none"
              />
            </div>

            {/* Hospital + Cross-hospital */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-widest text-gray-400 block mb-1.5">Hospital</label>
                <select
                  value={form.hospital_id}
                  onChange={e => onField('hospital_id', e.target.value)}
                  disabled={form.is_cross_hospital}
                  className="w-full h-10 px-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:opacity-50"
                >
                  <option value="">Select hospital</option>
                  {hospitals.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-widest text-gray-400 block mb-1.5">Priority</label>
                <select
                  value={form.priority}
                  onChange={e => onField('priority', e.target.value as ProjectPriority)}
                  className="w-full h-10 px-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-300"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_cross_hospital}
                onChange={e => {
                  onField('is_cross_hospital', e.target.checked);
                  if (e.target.checked) onField('hospital_id', '');
                }}
                className="h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-300"
              />
              <span className="text-[12px] text-gray-700">Cross-hospital project (spans multiple hospitals)</span>
            </label>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-widest text-gray-400 block mb-1.5">Start Date</label>
                <input
                  type="date" value={form.start_date}
                  onChange={e => onField('start_date', e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-widest text-gray-400 block mb-1.5">Due Date</label>
                <input
                  type="date" value={form.due_date}
                  onChange={e => onField('due_date', e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>
            </div>

            {error && (
              <p className="text-[12px] text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button" onClick={() => setStep('template')}
                className="flex-1 h-10 rounded-xl border border-gray-200 text-[13px] font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Back
              </button>
              <button
                type="submit" disabled={loading}
                className="flex-1 h-10 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {loading ? 'Creating…' : 'Create Project'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Project Dashboard (root export)
// ─────────────────────────────────────────────────────────────

type DashTab = 'all' | 'mine' | 'cross' | 'completed';

interface ProjectDashboardProps {
  stats: ProjectStats | null;
  projects: Project[];
  hospitals: Array<{ id: string; name: string; color: string }>;
  templates: ProjectTemplate[];
  userId: string;
  isAdmin: boolean;
}

export function ProjectDashboard({
  stats, projects: initialProjects, hospitals, templates, userId, isAdmin,
}: ProjectDashboardProps) {
  const router = useRouter();
  const [projects,    setProjects]    = useState<Project[]>(initialProjects);
  const [showCreate,  setShowCreate]  = useState(false);
  const [activeTab,   setActiveTab]   = useState<DashTab>('all');
  const [search,      setSearch]      = useState('');
  const [filterHosp,  setFilterHosp]  = useState('');
  const [filterPri,   setFilterPri]   = useState('');
  const [isLive,      setIsLive]      = useState(false);

  // ── Supabase Realtime ──
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const ch = supabase
      .channel('projects-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' },
        () => { router.refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_tasks' },
        () => { router.refresh(); })
      .subscribe(s => setIsLive(s === 'SUBSCRIBED'));
    return () => { supabase.removeChannel(ch); };
  }, [router]);

  // Keep local list in sync with incoming server data (on refresh)
  useEffect(() => { setProjects(initialProjects); }, [initialProjects]);

  const filtered = useMemo(() => {
    let list = projects;
    if (activeTab === 'mine')  list = list.filter(p => p.owner_id === userId || p.created_by === userId);
    if (activeTab === 'cross') list = list.filter(p => p.is_cross_hospital);
    if (activeTab === 'completed') list = list.filter(p => p.status === 'completed');
    if (activeTab === 'all')   list = list.filter(p => p.status !== 'completed');
    if (filterHosp)   list = list.filter(p => p.hospital_id === filterHosp || p.is_cross_hospital);
    if (filterPri)    list = list.filter(p => p.priority === filterPri);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(s) ||
        (p.description ?? '').toLowerCase().includes(s) ||
        (p.hospitalName ?? '').toLowerCase().includes(s)
      );
    }
    return list;
  }, [projects, activeTab, filterHosp, filterPri, search, userId]);

  const TABS: Array<{ id: DashTab; label: string; count: number }> = [
    { id: 'all',       label: 'Active',      count: projects.filter(p => !['completed','cancelled'].includes(p.status)).length },
    { id: 'mine',      label: 'My Projects', count: projects.filter(p => p.owner_id === userId || p.created_by === userId).length },
    { id: 'cross',     label: 'Cross-Hospital', count: projects.filter(p => p.is_cross_hospital).length },
    { id: 'completed', label: 'Completed',   count: projects.filter(p => p.status === 'completed').length },
  ];

  const crossHospProjects = projects.filter(p => p.is_cross_hospital && p.status === 'active');

  return (
    <div className="flex flex-col gap-6 pb-12">

      {/* ── Header ── */}
      <div className="rounded-2xl bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 text-white px-6 py-6 shadow-xl">
        <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="h-8 w-8 rounded-xl bg-orange-500 flex items-center justify-center">
                <FolderOpen className="h-4.5 w-4.5 text-white" />
              </div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Project Management</p>
              <div className="flex items-center gap-1.5 bg-white/10 rounded-full px-2.5 py-1">
                <div className={cn('h-2 w-2 rounded-full', isLive ? 'bg-green-400 animate-pulse' : 'bg-slate-500')} />
                <p className="text-[10px] font-semibold text-slate-300">{isLive ? 'Live' : 'Connecting'}</p>
              </div>
            </div>
            <h1 className="text-[24px] font-bold text-white tracking-tight">Projects</h1>
            <p className="text-[12px] text-slate-400 mt-0.5">Track initiatives across all hospitals · Asana-powered workflow</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/ai-assistant"
              className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-slate-300 text-[12px] font-medium transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5" /> Ask AI
            </Link>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-[13px] font-bold transition-colors"
            >
              <Plus className="h-4 w-4" /> New Project
            </button>
          </div>
        </div>

        {/* Cross-hospital spotlight */}
        {crossHospProjects.length > 0 && (
          <div className="bg-white/10 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
            <Globe className="h-4 w-4 text-purple-300 shrink-0" />
            <p className="text-[12px] text-slate-300 font-medium">
              {crossHospProjects.length} cross-hospital project{crossHospProjects.length !== 1 ? 's' : ''} active:
            </p>
            {crossHospProjects.slice(0, 3).map(p => (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="text-[11px] font-bold px-2.5 py-1 rounded-full text-white border border-white/20 hover:bg-white/20 transition-colors"
                style={{ backgroundColor: `${p.color}40` }}
              >
                {p.name}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ── Stats ── */}
      {stats && <StatsBar stats={stats} />}

      {/* ── Filter bar ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search projects…"
            className="w-full h-10 pl-9 pr-4 border border-gray-200 rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white shadow-sm"
          />
        </div>
        <select
          value={filterHosp}
          onChange={e => setFilterHosp(e.target.value)}
          className="h-10 px-3 border border-gray-200 rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white shadow-sm"
        >
          <option value="">All Hospitals</option>
          {hospitals.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
        <select
          value={filterPri}
          onChange={e => setFilterPri(e.target.value)}
          className="h-10 px-3 border border-gray-200 rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white shadow-sm"
        >
          <option value="">All Priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <button
          onClick={() => { setSearch(''); setFilterHosp(''); setFilterPri(''); }}
          className="h-10 px-3 border border-gray-200 rounded-xl bg-white text-[12px] text-gray-500 hover:text-gray-700 shadow-sm"
        >
          Clear
        </button>
        <div className="h-10 px-3 flex items-center rounded-xl border border-gray-200 bg-white text-[13px] text-gray-500 shadow-sm">
          {filtered.length} shown
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex items-center gap-1 bg-white border border-gray-100 rounded-2xl p-1.5 shadow-sm overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              'flex items-center gap-2 h-8 px-4 rounded-xl text-[12px] font-medium whitespace-nowrap transition-all',
              activeTab === t.id
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100',
            )}
          >
            {t.label}
            <span className={cn(
              'text-[10px] font-bold rounded-full px-1.5 py-0.5',
              activeTab === t.id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500',
            )}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── Project Grid ── */}
      {filtered.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <FolderOpen className="h-16 w-16 text-gray-200 mx-auto mb-4" />
          <p className="text-[16px] font-semibold text-gray-600 mb-2">No projects found</p>
          <p className="text-[13px] text-gray-400 mb-6">Create your first project to get started.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 h-10 px-6 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-bold transition-colors"
          >
            <Plus className="h-4 w-4" /> New Project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map(p => (
            <ProjectCard
              key={p.id}
              project={p}
              userId={userId}
              onDelete={id => setProjects(ps => ps.filter(x => x.id !== id))}
            />
          ))}
        </div>
      )}

      {/* ── Create Modal ── */}
      {showCreate && (
        <CreateProjectModal
          hospitals={hospitals}
          templates={templates}
          onClose={() => setShowCreate(false)}
          onCreated={p => {
            setProjects(ps => [p, ...ps]);
            router.push(`/projects/${p.id}`);
          }}
        />
      )}
    </div>
  );
}
