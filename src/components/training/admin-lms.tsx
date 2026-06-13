'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Pencil, Trash2, Eye, EyeOff, Loader2, X,
  BookOpen, Users, BarChart3, Route, FileText, HelpCircle,
  CheckCircle2, AlertCircle, GraduationCap, Award, Upload,
  ChevronDown, ChevronUp, Save, Film, Image, FileUp,
  Link2, AlignLeft, File as FileIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import dynamic from 'next/dynamic';
import type { ContentModule } from './module-builder';

const ModuleContentBuilder = dynamic(
  () => import('./module-builder').then(m => m.ModuleContentBuilder),
  { ssr: false, loading: () => <div className="h-32 rounded-2xl bg-gray-50 border border-gray-100 animate-pulse" /> },
);
import {
  getAdminCourses, createCourse, updateCourse, deleteCourse,
  getModulesForCourse, createModule, updateModule, deleteModule,
  getQuizForAdmin, upsertQuiz, createQuizQuestion, updateQuizQuestion, deleteQuizQuestion,
  getAdminLearningPaths, createLearningPath, updateLearningPath,
  getAdminEnrollments, getDetailedEnrollments, getTrainingAnalytics,
  assignCourse, assignCourseToAll, assignCourseByRoles, getOrgUsers,
  getCourseAssignmentInfo, reorderModules,
  addCourseToPath, removeCourseFromPath, seedDefaultPaths, seedDefaultCourses, getModuleViewCounts,
  type LMSCourse, type LMSModule, type QuizDefinition, type QuizQuestion,
  type LearningPath, type LMSAnalytics, type DetailedEnrollment,
} from '@/lib/actions/training';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const CATEGORIES = ['compliance', 'clinical', 'onboarding', 'leadership', 'hr', 'operations', 'safety', 'osha', 'cpr'];
const LEVELS     = ['beginner', 'intermediate', 'advanced'];
const COMPLIANCE = ['OSHA', 'CPR', 'Safety', 'Hospital Compliance', 'HIPAA', 'Fire Safety'];
const COLORS     = ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899'];
const CONTENT_TYPES: LMSModule['content_type'][] = ['article', 'video', 'pdf', 'docx', 'photo', 'link'];

const CONTENT_TYPE_META: Record<LMSModule['content_type'], { label: string; icon: React.ReactNode; accept?: string; isFile?: boolean }> = {
  article: { label: 'Article',  icon: <AlignLeft className="h-3.5 w-3.5" /> },
  link:    { label: 'Link',     icon: <Link2 className="h-3.5 w-3.5" /> },
  pdf:     { label: 'PDF',      icon: <FileIcon className="h-3.5 w-3.5" />, accept: '.pdf,application/pdf', isFile: true },
  docx:    { label: 'Document', icon: <FileText className="h-3.5 w-3.5" />, accept: '.docx,.doc,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document', isFile: true },
  video:   { label: 'Video',   icon: <Film className="h-3.5 w-3.5" />, accept: 'video/*', isFile: true },
  photo:   { label: 'Photo',   icon: <Image className="h-3.5 w-3.5" />, accept: 'image/*', isFile: true },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

type AdminTab = 'courses' | 'enrollments';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function Badge({ children, color = 'gray' }: { children: React.ReactNode; color?: string }) {
  const cls: Record<string, string> = {
    green:  'bg-green-50 text-green-700 border-green-100',
    red:    'bg-red-50 text-red-700 border-red-100',
    amber:  'bg-amber-50 text-amber-700 border-amber-100',
    gray:   'bg-gray-50 text-gray-600 border-gray-100',
    blue:   'bg-blue-50 text-blue-700 border-blue-100',
  };
  return (
    <span className={cn('inline-flex items-center text-[10px] font-semibold border rounded-full px-2 py-0.5', cls[color] ?? cls.gray)}>
      {children}
    </span>
  );
}

function StatCard({ label, value, icon, sub }: { label: string; value: number | string; icon: React.ReactNode; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[12px] text-gray-500">{label}</p>
        <div className="h-8 w-8 rounded-lg bg-orange-50 flex items-center justify-center text-orange-500">
          {icon}
        </div>
      </div>
      <p className="text-[26px] font-bold text-gray-900">{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Course Form — Full-screen page
// ─────────────────────────────────────────────────────────────

type VideoPlatform = 'youtube' | 'udemy' | 'coursera' | 'upgrad' | 'vimeo' | 'other';

interface VideoLink {
  url: string;
  title: string;
  platform: VideoPlatform;
  youtubeId: string | null;
}

type AssignMode = 'none' | 'all' | 'roles';

const ASSIGN_ROLE_OPTIONS: Array<{ role: string; label: string; color: string }> = [
  { role: 'csr',              label: 'Reception / CSR',        color: '#10b981' },
  { role: 'va',               label: 'Vet Assistants',         color: '#f59e0b' },
  { role: 'doctor',           label: 'Doctors',                color: '#3b82f6' },
  { role: 'hr',               label: 'HR',                     color: '#8b5cf6' },
  { role: 'practice_manager', label: 'Managers',               color: '#f97316' },
  { role: 'it_admin',         label: 'IT Admin',               color: '#6366f1' },
  { role: 'marketing',        label: 'Marketing',              color: '#ec4899' },
  { role: 'org_admin',        label: 'Org Admin',              color: '#ef4444' },
  { role: 'hospital_admin',   label: 'Hospital Admin',         color: '#ef4444' },
  { role: 'super_admin',      label: 'Super Admin',            color: '#1e293b' },
];

const PLATFORM_META: Record<VideoPlatform, { label: string; color: string; bg: string }> = {
  youtube:  { label: 'YouTube',  color: '#dc2626', bg: '#fef2f2' },
  udemy:    { label: 'Udemy',    color: '#a435f0', bg: '#f5f3ff' },
  coursera: { label: 'Coursera', color: '#0056d2', bg: '#eff6ff' },
  upgrad:   { label: 'UpGrad',   color: '#e63851', bg: '#fff1f2' },
  vimeo:    { label: 'Vimeo',    color: '#1ab7ea', bg: '#ecfeff' },
  other:    { label: 'Link',     color: '#64748b', bg: '#f8fafc' },
};

function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/))([a-zA-Z0-9_-]{11})/);
  return m?.[1] ?? null;
}

function detectPlatform(url: string): VideoPlatform {
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube';
  if (/udemy\.com/i.test(url)) return 'udemy';
  if (/coursera\.org/i.test(url)) return 'coursera';
  if (/upgrad\.com/i.test(url)) return 'upgrad';
  if (/vimeo\.com/i.test(url)) return 'vimeo';
  return 'other';
}

const CATEGORY_LABELS: Record<string, string> = {
  compliance: 'Compliance', clinical: 'Clinical', onboarding: 'Onboarding',
  leadership: 'Leadership', hr: 'HR', operations: 'Operations',
  safety: 'Safety', osha: 'OSHA', cpr: 'CPR',
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">{children}</p>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[13px] font-semibold text-slate-700">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

function CourseFormModal({
  course, hospitals, onSave, onClose,
}: {
  course?: LMSCourse | null;
  hospitals: Array<{ id: string; name: string; color: string | null }>;
  onSave: (data: any) => Promise<string | undefined>;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    title: course?.title ?? '',
    description: course?.description ?? '',
    category: course?.category ?? '',
    level: course?.level ?? 'beginner',
    is_required: course?.is_required ?? false,
    compliance_type: course?.compliance_type ?? '',
    expires_after_days: course?.expires_after_days?.toString() ?? '',
    pass_score: course?.pass_score?.toString() ?? '80',
    estimated_hours: course?.estimated_hours?.toString() ?? '1',
    due_days: course?.due_days?.toString() ?? '',
    cover_color: course?.cover_color ?? '#f97316',
    tags: (course?.tags ?? []).join(', '),
    hospital_id: course?.hospital_id ?? '',
  });
  const [saving, setSaving]             = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [thumbnailFile, setThumbnailFile]   = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string>(course?.thumbnail_url ?? '');
  const [materialFiles, setMaterialFiles] = useState<File[]>([]);
  // rich content modules
  const [contentModules, setContentModules] = useState<ContentModule[]>([]);
  const [modulesLoading, setModulesLoading] = useState(!!course);
  const initialDbIds = useRef<string[]>([]);
  // assignment
  const [assignMode, setAssignMode]   = useState<AssignMode>('none');
  const [assignRoles, setAssignRoles] = useState<string[]>([]);
  const [assignInfo, setAssignInfo]   = useState<{ assignedCount: number; totalStaff: number } | null>(null);
  const thumbInputRef    = useRef<HTMLInputElement>(null);
  const materialInputRef = useRef<HTMLInputElement>(null);

  // edit mode: load existing modules + current assignment status
  useEffect(() => {
    if (!course?.id) return;
    getModulesForCourse(course.id).then(r => {
      if (r.success) {
        const mapped: ContentModule[] = r.data.map(m => ({
          id: m.id,
          dbId: m.id,
          title: m.title,
          content_type: (['article', 'video', 'pdf', 'link'].includes(m.content_type) ? m.content_type : 'article') as ContentModule['content_type'],
          content: m.content ?? '',
          content_url: m.content_url ?? '',
          duration_mins: m.duration_mins ?? 0,
          is_required: m.is_required ?? false,
        }));
        setContentModules(mapped);
        initialDbIds.current = mapped.map(m => m.dbId!).filter(Boolean);
      }
      setModulesLoading(false);
    });
    getCourseAssignmentInfo(course.id).then(r => {
      if (r.success) setAssignInfo(r.data);
    });
  }, [course?.id]);

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const toggleAssignRole = (role: string) =>
    setAssignRoles(r => r.includes(role) ? r.filter(x => x !== role) : [...r, role]);

  const handleThumbnailSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setThumbnailFile(file);
    setThumbnailPreview(URL.createObjectURL(file));
    e.target.value = '';
  };

  const handleMaterialSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setMaterialFiles(f => [...f, ...files]);
    e.target.value = '';
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    const courseData = {
      title: form.title.trim(),
      description: form.description || null,
      category: form.category || null,
      level: form.level,
      is_required: form.is_required,
      compliance_type: form.compliance_type || null,
      expires_after_days: form.expires_after_days ? parseInt(form.expires_after_days) : null,
      pass_score: parseInt(form.pass_score) || 80,
      estimated_hours: parseFloat(form.estimated_hours) || 1,
      due_days: form.due_days ? parseInt(form.due_days) : null,
      cover_color: form.cover_color,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      hospital_id: form.hospital_id || null,
    };
    const courseId = await onSave(courseData);

    if (courseId && (thumbnailFile || materialFiles.length > 0)) {
      try {
        if (thumbnailFile) {
          setUploadStatus('Uploading thumbnail…');
          const fd = new FormData();
          fd.append('file', thumbnailFile);
          fd.append('courseId', courseId);
          const res = await fetch('/api/v1/training/upload', { method: 'POST', body: fd });
          const json = await res.json();
          if (json.success) await updateCourse(courseId, { thumbnail_url: json.url });
        }
        for (let i = 0; i < materialFiles.length; i++) {
          const file = materialFiles[i];
          setUploadStatus(`Uploading file ${i + 1} of ${materialFiles.length}…`);
          const fd = new FormData();
          fd.append('file', file);
          fd.append('courseId', courseId);
          const res = await fetch('/api/v1/training/upload', { method: 'POST', body: fd });
          const json = await res.json();
          if (json.success) {
            await createModule(courseId, {
              title: file.name.replace(/\.[^.]+$/, ''),
              content_type: json.contentType as any,
              content_url: json.url,
              file_name: json.fileName,
              storage_path: json.path,
              file_size: json.fileSize,
              duration_mins: 0,
              is_required: false,
            });
          }
        }
      } catch { /* uploads best-effort */ }
    }

    // sync curriculum modules: delete removed, update existing, create new, fix order
    if (courseId) {
      setUploadStatus('Saving modules…');
      const keptDbIds = new Set(contentModules.map(m => m.dbId).filter(Boolean) as string[]);
      const deletedIds = initialDbIds.current.filter(id => !keptDbIds.has(id));
      await Promise.all(deletedIds.map(id => deleteModule(id)));

      const orderUpdates: Array<{ id: string; sort_order: number }> = [];
      for (let i = 0; i < contentModules.length; i++) {
        const cm = contentModules[i];
        const payload = {
          title: cm.title.trim() || `Module ${i + 1}`,
          content_type: cm.content_type,
          content: cm.content_type === 'article' ? cm.content : null,
          content_url: cm.content_url || null,
          duration_mins: cm.duration_mins || 0,
          is_required: cm.is_required,
        };
        if (cm.dbId) {
          await updateModule(cm.dbId, payload as any);
          orderUpdates.push({ id: cm.dbId, sort_order: i });
        } else {
          const created = await createModule(courseId, { ...payload, sort_order: i });
          if (created.success) orderUpdates.push({ id: created.data.id, sort_order: i });
        }
      }
      if (orderUpdates.length > 0) await reorderModules(orderUpdates);
    }

    // assignment
    if (courseId && assignMode !== 'none') {
      setUploadStatus('Assigning course to staff…');
      let assignResult: { success: boolean; error?: string; data?: { assigned: number } } = { success: true };
      if (assignMode === 'all') {
        assignResult = await assignCourseToAll(courseId);
      } else if (assignMode === 'roles' && assignRoles.length > 0) {
        assignResult = await assignCourseByRoles(courseId, assignRoles);
      }
      if (assignResult.success && assignResult.data) {
        setUploadStatus(`✓ Assigned to ${assignResult.data.assigned} staff member${assignResult.data.assigned !== 1 ? 's' : ''}`);
        await new Promise(r => setTimeout(r, 1200));
      } else if (!assignResult.success) {
        setUploadStatus(`Assignment failed: ${(assignResult as any).error ?? 'unknown error'}`);
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    setSaving(false);
    setUploadStatus('');
    onClose();
  };

  const inputCls = 'w-full px-4 py-2.5 border border-slate-200 rounded-xl text-[14px] bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400 transition-colors placeholder:text-slate-300';
  const selectCls = inputCls + ' cursor-pointer';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 flex">
      {/* Sidebar preview panel */}
      <div
        className="hidden lg:flex w-80 shrink-0 flex-col justify-between p-8"
        style={{ background: `linear-gradient(160deg, ${form.cover_color}ee 0%, ${form.cover_color}99 100%)` }}
      >
        {/* Back / branding */}
        <div>
          <button onClick={onClose} className="flex items-center gap-2 text-white/80 hover:text-white text-[13px] font-semibold transition-colors mb-8">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
            Back
          </button>

          {/* Live course card preview */}
          <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-5 border border-white/20">
            <div className="flex items-start justify-between gap-2 mb-4">
              <div className="w-12 h-12 rounded-xl bg-white/25 flex items-center justify-center">
                <GraduationCap className="h-6 w-6 text-white" />
              </div>
              {form.is_required && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 bg-white/20 text-white rounded-full border border-white/30">
                  Required
                </span>
              )}
            </div>
            <h3 className="text-white font-bold text-[16px] leading-snug line-clamp-2 min-h-[40px]">
              {form.title || 'Course Title'}
            </h3>
            {form.description && (
              <p className="text-white/70 text-[12px] mt-2 line-clamp-3">{form.description}</p>
            )}
            <div className="flex items-center gap-3 mt-4 text-white/60 text-[11px] font-medium">
              {form.estimated_hours && <span>{form.estimated_hours}h</span>}
              {form.level && <span className="capitalize">· {form.level}</span>}
              {form.category && <span className="capitalize">· {CATEGORY_LABELS[form.category] ?? form.category}</span>}
            </div>
            {/* Mini progress bar */}
            <div className="mt-4 h-1.5 bg-white/20 rounded-full">
              <div className="h-full w-0 bg-white rounded-full" />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-white/50 text-[11px] font-semibold uppercase tracking-wider">Course Colour</p>
          <div className="flex flex-wrap gap-2">
            {COLORS.map(c => (
              <button
                key={c}
                onClick={() => set('cover_color', c)}
                className={cn(
                  'h-8 w-8 rounded-full border-2 transition-all',
                  form.cover_color === c
                    ? 'border-white scale-110 shadow-lg'
                    : 'border-transparent opacity-70 hover:opacity-100 hover:scale-105',
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Main form panel */}
      <div className="flex-1 bg-white flex flex-col min-h-0 overflow-hidden">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-8 py-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${form.cover_color}20` }}>
              <GraduationCap className="h-5 w-5" style={{ color: form.cover_color }} />
            </div>
            <div>
              <h1 className="text-[17px] font-bold text-slate-900">{course ? 'Edit Course' : 'Create New Course'}</h1>
              <p className="text-[12px] text-slate-400">Fill in the details below to {course ? 'update' : 'publish'} this course</p>
            </div>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-xl hover:bg-slate-100 flex items-center justify-center transition-colors">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-8 py-8 space-y-10">

            {/* ── Section 1: Basic Info ──────────────────────── */}
            <div>
              <SectionLabel>Basic Information</SectionLabel>
              <div className="space-y-5 p-6 bg-slate-50 rounded-2xl border border-slate-100">
                <Field label="Course Title *">
                  <input
                    value={form.title}
                    onChange={e => set('title', e.target.value)}
                    className={inputCls}
                    placeholder="e.g. OSHA Safety Training 2024"
                    autoFocus
                  />
                </Field>
                <Field label="Description">
                  <textarea
                    value={form.description}
                    onChange={e => set('description', e.target.value)}
                    rows={3}
                    className={inputCls + ' resize-none'}
                    placeholder="What will staff learn in this course?"
                  />
                </Field>
              </div>
            </div>

            {/* ── Section 2: Category & Level ───────────────── */}
            <div>
              <SectionLabel>Category & Audience</SectionLabel>
              <div className="grid grid-cols-2 gap-4 p-6 bg-slate-50 rounded-2xl border border-slate-100">
                <Field label="Category">
                  <select value={form.category} onChange={e => set('category', e.target.value)} className={selectCls}>
                    <option value="">— None —</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>)}
                  </select>
                </Field>
                <Field label="Difficulty Level">
                  <select value={form.level} onChange={e => set('level', e.target.value)} className={selectCls}>
                    {LEVELS.map(l => <option key={l} value={l} className="capitalize">{l.charAt(0).toUpperCase() + l.slice(1)}</option>)}
                  </select>
                </Field>
                <div className="col-span-2">
                  <Field label="Compliance Type" hint="Leave blank if this is not a compliance/regulatory course">
                    <select value={form.compliance_type} onChange={e => set('compliance_type', e.target.value)} className={selectCls}>
                      <option value="">— Not a compliance course —</option>
                      {COMPLIANCE.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>
                </div>
              </div>
            </div>

            {/* ── Section 3: Settings ───────────────────────── */}
            <div>
              <SectionLabel>Course Settings</SectionLabel>
              <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 space-y-5">
                <div className="grid grid-cols-3 gap-4">
                  <Field label="Pass Score %" hint="Minimum % to pass the quiz">
                    <input type="number" min="0" max="100" value={form.pass_score} onChange={e => set('pass_score', e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Estimated Hours">
                    <input type="number" min="0" step="0.5" value={form.estimated_hours} onChange={e => set('estimated_hours', e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Due in (days)" hint="Days after assignment">
                    <input type="number" min="1" value={form.due_days} onChange={e => set('due_days', e.target.value)} placeholder="—" className={inputCls} />
                  </Field>
                </div>
                <Field label="Certificate Expires After (days)" hint="Leave blank if certificate never expires">
                  <input type="number" min="1" value={form.expires_after_days} onChange={e => set('expires_after_days', e.target.value)} placeholder="— Never expires —" className={inputCls} />
                </Field>
                <Field label="Tags" hint="Comma-separated, e.g. annual, all-staff, clinical">
                  <input value={form.tags} onChange={e => set('tags', e.target.value)} className={inputCls} placeholder="annual, all-staff, clinical" />
                </Field>
                {/* Required toggle */}
                <label className={cn(
                  'flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all',
                  form.is_required ? 'border-orange-400 bg-orange-50' : 'border-slate-200 bg-white hover:border-slate-300',
                )}>
                  <input
                    type="checkbox"
                    checked={form.is_required}
                    onChange={e => set('is_required', e.target.checked)}
                    className="h-4 w-4 accent-orange-500"
                  />
                  <div>
                    <p className="text-[14px] font-semibold text-slate-800">Mark as Required</p>
                    <p className="text-[12px] text-slate-400">All assigned staff must complete this course</p>
                  </div>
                  {form.is_required && (
                    <span className="ml-auto text-[11px] font-bold text-orange-600 bg-orange-100 px-2.5 py-1 rounded-full">Required</span>
                  )}
                </label>
              </div>
            </div>

            {/* ── Section 4: Media & Materials ─────────────── */}
            <div>
              <SectionLabel>Cover Thumbnail & Materials</SectionLabel>
              <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 space-y-5">
                {/* Thumbnail */}
                <Field label="Course Thumbnail">
                  {thumbnailPreview ? (
                    <div className="relative w-full h-40 rounded-xl overflow-hidden border border-slate-200 group">
                      <img src={thumbnailPreview} alt="Thumbnail" className="w-full h-full object-cover" />
                      <button
                        onClick={() => { setThumbnailFile(null); setThumbnailPreview(''); }}
                        className="absolute top-3 right-3 h-7 w-7 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3.5 w-3.5 text-white" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => thumbInputRef.current?.click()}
                      className="w-full h-32 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center gap-2 hover:border-orange-300 hover:bg-orange-50/50 transition-colors"
                    >
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                        <Image className="h-5 w-5 text-slate-400" />
                      </div>
                      <div className="text-center">
                        <p className="text-[13px] font-semibold text-slate-600">Click to upload thumbnail</p>
                        <p className="text-[11px] text-slate-400">JPG, PNG, WebP up to 5 MB</p>
                      </div>
                    </button>
                  )}
                  <input ref={thumbInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleThumbnailSelect} className="hidden" />
                </Field>

                {/* Materials */}
                <Field label="Course Materials" hint={!course ? 'Files will be created as modules after saving' : undefined}>
                  <button
                    type="button"
                    onClick={() => materialInputRef.current?.click()}
                    className="w-full h-20 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center gap-3 hover:border-orange-300 hover:bg-orange-50/50 transition-colors"
                  >
                    <FileUp className="h-5 w-5 text-slate-400" />
                    <div className="text-left">
                      <p className="text-[13px] font-semibold text-slate-600">Upload PDF, Video, Images or Docs</p>
                      <p className="text-[11px] text-slate-400">PDF, DOC, MP4, JPG, PNG up to 200 MB each</p>
                    </div>
                  </button>
                  <input
                    ref={materialInputRef}
                    type="file"
                    multiple
                    accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/webp,video/*"
                    onChange={handleMaterialSelect}
                    className="hidden"
                  />
                  {materialFiles.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {materialFiles.map((f, i) => (
                        <div key={i} className="flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-slate-200">
                          <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
                            <FileIcon className="h-4 w-4 text-orange-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium text-slate-800 truncate">{f.name}</p>
                            <p className="text-[11px] text-slate-400">{(f.size / 1024 / 1024).toFixed(2)} MB</p>
                          </div>
                          <button onClick={() => setMaterialFiles(ff => ff.filter((_, j) => j !== i))} className="h-7 w-7 rounded-lg hover:bg-red-50 flex items-center justify-center transition-colors shrink-0">
                            <X className="h-3.5 w-3.5 text-red-400" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </Field>
              </div>
            </div>

            {/* ── Section 5: Module Content Builder ─────────── */}
            <div>
              <SectionLabel>Course Modules & Content</SectionLabel>
              <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
                <p className="text-[12px] text-slate-500">
                  Build your course curriculum — articles with rich text & photos, videos, PDF references and links.
                  Drag the cards to reorder. Each module is tracked individually for every employee.
                </p>
                <ModuleContentBuilder
                  modules={contentModules}
                  onChange={setContentModules}
                  loading={modulesLoading}
                />
              </div>
            </div>

            {/* ── Section 6: Assignment ─────────────────────── */}
            <div>
              <SectionLabel>Assign Course</SectionLabel>
              <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
                {/* current assignment status (edit mode) */}
                {assignInfo && assignInfo.assignedCount > 0 && (
                  <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    <p className="text-[13px] font-semibold text-emerald-700">
                      Currently assigned to {assignInfo.assignedCount} of {assignInfo.totalStaff} staff members
                    </p>
                  </div>
                )}
                <p className="text-[12px] text-slate-500">
                  {assignInfo && assignInfo.assignedCount > 0
                    ? 'Choose an option below to assign to more staff, or leave as-is to keep current assignments.'
                    : 'Optionally assign this course right after saving. You can also assign from the Enrollments tab later.'}
                </p>

                {/* Mode selector */}
                <div className="space-y-2">
                  {([
                    { mode: 'none'  as AssignMode, label: 'Don\'t assign now',                icon: '○', desc: 'I\'ll assign manually from the Enrollments tab' },
                    { mode: 'all'   as AssignMode, label: 'Assign to All Staff',               icon: '★', desc: 'Every active staff member including Super Admin, Admin & HR' },
                    { mode: 'roles' as AssignMode, label: 'Assign by Role',                    icon: '◈', desc: 'Choose which roles receive this course' },
                  ]).map(opt => (
                    <label
                      key={opt.mode}
                      className={cn(
                        'flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all',
                        assignMode === opt.mode
                          ? 'border-orange-400 bg-orange-50'
                          : 'border-slate-200 bg-white hover:border-slate-300',
                      )}
                    >
                      <input
                        type="radio"
                        name="assignMode"
                        value={opt.mode}
                        checked={assignMode === opt.mode}
                        onChange={() => setAssignMode(opt.mode)}
                        className="mt-0.5 accent-orange-500"
                      />
                      <div>
                        <p className="text-[14px] font-semibold text-slate-800">{opt.label}</p>
                        <p className="text-[12px] text-slate-400">{opt.desc}</p>
                      </div>
                      {opt.mode === 'all' && assignMode === 'all' && (
                        <span className="ml-auto shrink-0 text-[11px] font-bold text-orange-600 bg-orange-100 px-2.5 py-1 rounded-full">All Staff</span>
                      )}
                    </label>
                  ))}
                </div>

                {/* Role pills (shown only in roles mode) */}
                {assignMode === 'roles' && (
                  <div>
                    <p className="text-[12px] font-semibold text-slate-600 mb-2">Select roles to assign:</p>
                    <div className="flex flex-wrap gap-2">
                      {ASSIGN_ROLE_OPTIONS.map(opt => {
                        const active = assignRoles.includes(opt.role);
                        return (
                          <button
                            key={opt.role}
                            type="button"
                            onClick={() => toggleAssignRole(opt.role)}
                            className={cn(
                              'px-3 py-1.5 rounded-xl text-[12px] font-semibold border-2 transition-all',
                              active ? 'text-white border-transparent' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300',
                            )}
                            style={active ? { backgroundColor: opt.color, borderColor: opt.color } : {}}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                    {assignRoles.length > 0 && (
                      <p className="mt-2 text-[12px] text-slate-500">
                        {assignRoles.length} role{assignRoles.length > 1 ? 's' : ''} selected — all active staff with these roles will be enrolled.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Mobile colour picker */}
            <div className="lg:hidden">
              <SectionLabel>Course Colour</SectionLabel>
              <div className="flex flex-wrap gap-3 p-6 bg-slate-50 rounded-2xl border border-slate-100">
                {COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => set('cover_color', c)}
                    className={cn(
                      'h-9 w-9 rounded-full border-2 transition-all',
                      form.cover_color === c ? 'border-slate-600 scale-110' : 'border-transparent hover:scale-105',
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* Footer actions */}
        <div className="shrink-0 flex items-center justify-between px-8 py-5 border-t border-slate-100 bg-white">
          <div className="text-[12px] text-slate-400">
            {uploadStatus && (
              <span className="flex items-center gap-2 text-orange-600 font-semibold">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {uploadStatus}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="h-10 px-6 rounded-xl text-slate-600 text-[14px] font-medium hover:bg-slate-100 transition-colors">
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || !form.title.trim()}
              className="flex items-center gap-2 h-10 px-7 rounded-xl text-white text-[14px] font-bold transition-all disabled:opacity-50"
              style={{ backgroundColor: form.cover_color }}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Saving…' : course ? 'Save Changes' : 'Create Course'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Module Manager (within a selected course)
// ─────────────────────────────────────────────────────────────

type ModuleForm = {
  title: string;
  description: string;
  content_type: LMSModule['content_type'];
  content_url: string;
  content: string;
  duration_mins: string;
  is_required: boolean;
  file_name: string;
  storage_path: string;
  file_size: number | null;
};

const EMPTY_FORM: ModuleForm = {
  title: '', description: '', content_type: 'article',
  content_url: '', content: '', duration_mins: '0',
  is_required: true, file_name: '', storage_path: '', file_size: null,
};

function ModuleManager({ course, onClose }: { course: LMSCourse; onClose: () => void }) {
  const [modules, setModules]     = useState<LMSModule[]>([]);
  const [viewCounts, setViewCounts] = useState<Record<string, number>>({});
  const [loading, setLoading]     = useState(true);
  const [adding, setAdding]       = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm]           = useState<ModuleForm>(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [modRes, counts] = await Promise.all([
      getModulesForCourse(course.id),
      getModuleViewCounts(course.id),
    ]);
    if (modRes.success) setModules(modRes.data);
    setViewCounts(counts);
    setLoading(false);
  }, [course.id]);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => { setForm(EMPTY_FORM); setUploadError(null); };

  const meta = CONTENT_TYPE_META[form.content_type];

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    setUploadProgress(10);

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('courseId', course.id);

      setUploadProgress(40);
      const res = await fetch('/api/v1/training/upload', { method: 'POST', body: fd });
      setUploadProgress(90);
      const json = await res.json();

      if (!res.ok || !json.success) {
        setUploadError(json.error ?? 'Upload failed');
      } else {
        setForm(f => ({
          ...f,
          content_url: json.url,
          file_name: json.fileName,
          storage_path: json.path,
          file_size: json.fileSize,
        }));
      }
    } catch (err) {
      setUploadError('Network error — upload failed');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const clearFile = async () => {
    if (form.storage_path) {
      await fetch(`/api/v1/training/upload?path=${encodeURIComponent(form.storage_path)}`, { method: 'DELETE' });
    }
    setForm(f => ({ ...f, content_url: '', file_name: '', storage_path: '', file_size: null }));
    setUploadError(null);
  };

  const handleSave = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      description: form.description || null,
      content_type: form.content_type,
      content_url: form.content_url || null,
      content: form.content || null,
      duration_mins: parseInt(form.duration_mins) || 0,
      is_required: form.is_required,
      file_name: form.file_name || null,
      storage_path: form.storage_path || null,
      file_size: form.file_size,
    };

    if (editingId) {
      await updateModule(editingId, payload);
    } else {
      await createModule(course.id, payload);
    }
    await load();
    setAdding(false);
    setEditingId(null);
    resetForm();
    setSaving(false);
  };

  const startEdit = (m: LMSModule) => {
    setForm({
      title: m.title,
      description: m.description ?? '',
      content_type: m.content_type,
      content_url: m.content_url ?? '',
      content: m.content ?? '',
      duration_mins: m.duration_mins.toString(),
      is_required: m.is_required,
      file_name: m.file_name ?? '',
      storage_path: m.storage_path ?? '',
      file_size: m.file_size ?? null,
    });
    setEditingId(m.id);
    setAdding(true);
    setUploadError(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this module?')) return;
    const mod = modules.find(m => m.id === id);
    if (mod?.storage_path) {
      await fetch(`/api/v1/training/upload?path=${encodeURIComponent(mod.storage_path)}`, { method: 'DELETE' });
    }
    await deleteModule(id);
    await load();
  };

  const isFileType = meta.isFile;
  const needsUrl   = form.content_type === 'link';
  const needsContent = ['article'].includes(form.content_type);
  const hasUploadedFile = !!form.content_url && isFileType;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-[16px] font-bold text-gray-900">Modules</h2>
            <p className="text-[12px] text-gray-400">{course.title}</p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-gray-100 flex items-center justify-center">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
            </div>
          ) : (
            <>
              {modules.map((m, i) => (
                <div key={m.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <span className="h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center text-[11px] font-bold text-gray-600 shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-900 truncate">{m.title}</p>
                    <p className="text-[11px] text-gray-400 capitalize">
                      {CONTENT_TYPE_META[m.content_type]?.label ?? m.content_type}
                      {m.file_name ? ` · ${m.file_name}` : ''}
                      {m.file_size ? ` · ${formatBytes(m.file_size)}` : ''}
                      {` · ${m.duration_mins}m`}
                    </p>
                  </div>
                  {viewCounts[m.id] > 0 && (
                    <span className="flex items-center gap-1 text-[11px] text-gray-400 shrink-0">
                      <Eye className="h-3 w-3" /> {viewCounts[m.id]}
                    </span>
                  )}
                  {m.is_required && <Badge color="red">Required</Badge>}
                  {m.content_url && isFileType && (
                    <a href={m.content_url} target="_blank" rel="noopener noreferrer"
                      className="h-7 w-7 rounded-lg hover:bg-blue-50 flex items-center justify-center transition-colors"
                      title="Preview file">
                      <Eye className="h-3.5 w-3.5 text-blue-500" />
                    </a>
                  )}
                  <button onClick={() => startEdit(m)} className="h-7 w-7 rounded-lg hover:bg-gray-200 flex items-center justify-center transition-colors">
                    <Pencil className="h-3.5 w-3.5 text-gray-500" />
                  </button>
                  <button onClick={() => handleDelete(m.id)} className="h-7 w-7 rounded-lg hover:bg-red-50 flex items-center justify-center transition-colors">
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </button>
                </div>
              ))}

              {/* Add/Edit form */}
              {adding && (
                <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl space-y-3">
                  <p className="text-[12px] font-bold text-orange-700">{editingId ? 'Edit Module' : 'Add Module'}</p>

                  {/* Title */}
                  <input
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="Module title *"
                    className="w-full h-9 px-3 border border-orange-200 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
                  />

                  {/* Content type + duration row */}
                  <div className="grid grid-cols-2 gap-3">
                    <select
                      value={form.content_type}
                      onChange={e => {
                        setForm(f => ({ ...f, content_type: e.target.value as LMSModule['content_type'], content_url: '', file_name: '', storage_path: '', file_size: null }));
                        setUploadError(null);
                      }}
                      className="h-9 px-3 border border-orange-200 rounded-lg text-[14px] bg-white focus:outline-none"
                    >
                      {CONTENT_TYPES.map(t => (
                        <option key={t} value={t}>{CONTENT_TYPE_META[t].label}</option>
                      ))}
                    </select>
                    <input
                      type="number" min="0"
                      value={form.duration_mins}
                      onChange={e => setForm(f => ({ ...f, duration_mins: e.target.value }))}
                      placeholder="Duration (mins)"
                      className="h-9 px-3 border border-orange-200 rounded-lg text-[14px] bg-white focus:outline-none"
                    />
                  </div>

                  {/* File upload zone */}
                  {isFileType && (
                    <div>
                      {hasUploadedFile ? (
                        <div className="flex items-center gap-3 p-3 bg-white border border-orange-200 rounded-xl">
                          <div className="h-9 w-9 rounded-lg bg-orange-100 flex items-center justify-center shrink-0 text-orange-600">
                            {meta.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium text-gray-900 truncate">{form.file_name}</p>
                            {form.file_size && (
                              <p className="text-[11px] text-gray-400">{formatBytes(form.file_size)}</p>
                            )}
                          </div>
                          <a href={form.content_url} target="_blank" rel="noopener noreferrer"
                            className="h-7 px-2 rounded-lg hover:bg-blue-50 flex items-center gap-1 text-[11px] text-blue-600 shrink-0 transition-colors">
                            <Eye className="h-3 w-3" /> Preview
                          </a>
                          <button onClick={clearFile} className="h-7 w-7 rounded-lg hover:bg-red-50 flex items-center justify-center shrink-0 transition-colors">
                            <X className="h-3.5 w-3.5 text-red-500" />
                          </button>
                        </div>
                      ) : (
                        <div>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept={meta.accept}
                            onChange={handleFileSelect}
                            className="hidden"
                          />
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            className="w-full flex flex-col items-center gap-2 py-6 border-2 border-dashed border-orange-200 rounded-xl hover:border-orange-400 hover:bg-orange-50/50 transition-colors disabled:opacity-60"
                          >
                            {uploading ? (
                              <>
                                <Loader2 className="h-7 w-7 text-orange-400 animate-spin" />
                                <p className="text-[12px] text-orange-600 font-medium">Uploading…</p>
                                <div className="w-32 h-1.5 bg-orange-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-orange-400 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                                </div>
                              </>
                            ) : (
                              <>
                                <FileUp className="h-7 w-7 text-orange-400" />
                                <p className="text-[13px] text-gray-700 font-medium">
                                  Click to upload {meta.label}
                                </p>
                                <p className="text-[11px] text-gray-400">
                                  {form.content_type === 'video' ? 'MP4, WebM, MOV up to 200 MB' :
                                   form.content_type === 'pdf'   ? 'PDF up to 200 MB' :
                                   form.content_type === 'docx'  ? 'DOC, DOCX up to 200 MB' :
                                                                   'JPG, PNG, GIF, WebP up to 200 MB'}
                                </p>
                              </>
                            )}
                          </button>
                        </div>
                      )}
                      {uploadError && (
                        <p className="mt-1.5 text-[11px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5">
                          {uploadError}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Link URL — with platform quick-pick */}
                  {needsUrl && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { label: 'YouTube',  prefix: 'https://www.youtube.com/watch?v=' },
                          { label: 'Udemy',    prefix: 'https://www.udemy.com/course/' },
                          { label: 'Coursera', prefix: 'https://www.coursera.org/learn/' },
                          { label: 'Upgrad',   prefix: 'https://www.upgrad.com/courses/' },
                        ].map(p => (
                          <button
                            key={p.label}
                            type="button"
                            onClick={() => setForm(f => ({ ...f, content_url: f.content_url.startsWith('http') ? f.content_url : p.prefix }))}
                            className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-white border border-orange-200 text-orange-700 hover:bg-orange-50 transition-colors"
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                      <input
                        value={form.content_url}
                        onChange={e => setForm(f => ({ ...f, content_url: e.target.value }))}
                        placeholder="Paste YouTube, Udemy, Coursera, Upgrad or any URL…"
                        className="w-full h-9 px-3 border border-orange-200 rounded-lg text-[14px] bg-white focus:outline-none"
                      />
                    </div>
                  )}

                  {/* Article content */}
                  {needsContent && (
                    <textarea
                      value={form.content}
                      onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                      rows={5}
                      placeholder="Write article content here (HTML supported)"
                      className="w-full px-3 py-2 border border-orange-200 rounded-lg text-[14px] bg-white focus:outline-none resize-none"
                    />
                  )}

                  {/* Description */}
                  <input
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Short description (optional)"
                    className="w-full h-9 px-3 border border-orange-200 rounded-lg text-[14px] bg-white focus:outline-none"
                  />

                  {/* Footer row */}
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.is_required}
                        onChange={e => setForm(f => ({ ...f, is_required: e.target.checked }))}
                        className="accent-orange-500"
                      />
                      <span className="text-[12px] text-gray-700">Required module</span>
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setAdding(false); setEditingId(null); resetForm(); }}
                        className="h-8 px-3 rounded-lg text-gray-600 text-[12px] hover:bg-gray-200 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={saving || !form.title.trim() || uploading}
                        className="flex items-center gap-1.5 h-8 px-4 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-[12px] font-semibold transition-colors"
                      >
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {!adding && (
                <button
                  onClick={() => setAdding(true)}
                  className="w-full flex items-center justify-center gap-2 h-10 rounded-xl border-2 border-dashed border-gray-200 text-gray-500 text-[13px] hover:border-orange-300 hover:text-orange-500 transition-colors"
                >
                  <Plus className="h-4 w-4" /> Add Module
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Quiz Builder
// ─────────────────────────────────────────────────────────────

function QuizBuilder({ course, onClose }: { course: LMSCourse; onClose: () => void }) {
  const [quiz, setQuiz]       = useState<QuizDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [qForm, setQForm]     = useState({ title: '', pass_score: '80', max_attempts: '3', time_limit: '', randomize: false });
  const [saving, setSaving]   = useState(false);
  const [addingQ, setAddingQ] = useState(false);
  const [newQ, setNewQ]       = useState({ question_text: '', question_type: 'multiple_choice' as QuizQuestion['question_type'], explanation: '', points: '1', correct_answer: '', options: [{ text: '', is_correct: true }, { text: '', is_correct: false }, { text: '', is_correct: false }, { text: '', is_correct: false }] });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getQuizForAdmin(course.id);
    if (res.success && res.data) {
      setQuiz(res.data);
      setQForm({ title: res.data.title, pass_score: res.data.pass_score.toString(), max_attempts: res.data.max_attempts.toString(), time_limit: res.data.time_limit?.toString() ?? '', randomize: res.data.randomize });
    }
    setLoading(false);
  }, [course.id]);

  useEffect(() => { load(); }, [load]);

  const saveQuiz = async () => {
    setSaving(true);
    const res = await upsertQuiz(course.id, {
      title: qForm.title || `${course.title} Quiz`,
      pass_score: parseInt(qForm.pass_score) || 80,
      max_attempts: parseInt(qForm.max_attempts) || 3,
      time_limit: qForm.time_limit ? parseInt(qForm.time_limit) : null,
      randomize: qForm.randomize,
    });
    if (res.success) setQuiz(res.data);
    setSaving(false);
  };

  const addQuestion = async () => {
    if (!quiz || !newQ.question_text.trim()) return;
    setSaving(true);
    const opts =
      newQ.question_type === 'true_false'
        ? [{ id: crypto.randomUUID(), text: 'True', is_correct: true }, { id: crypto.randomUUID(), text: 'False', is_correct: false }]
        : newQ.question_type === 'fill_in_blank' || newQ.question_type === 'essay'
          ? []
          : newQ.options.filter(o => o.text.trim()).map(o => ({ id: crypto.randomUUID(), text: o.text, is_correct: o.is_correct }));

    await createQuizQuestion(quiz.id, {
      question_text: newQ.question_text.trim(),
      question_type: newQ.question_type,
      options: opts,
      correct_answer: newQ.question_type === 'fill_in_blank' ? (newQ.correct_answer.trim() || null) : null,
      explanation: newQ.explanation || null,
      points: parseInt(newQ.points) || 1,
    });
    await load();
    setAddingQ(false);
    setNewQ({ question_text: '', question_type: 'multiple_choice', explanation: '', points: '1', correct_answer: '', options: [{ text: '', is_correct: true }, { text: '', is_correct: false }, { text: '', is_correct: false }, { text: '', is_correct: false }] });
    setSaving(false);
  };

  const deleteQ = async (id: string) => {
    if (!confirm('Delete this question?')) return;
    await deleteQuizQuestion(id);
    await load();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-[16px] font-bold text-gray-900">Quiz Builder</h2>
            <p className="text-[12px] text-gray-400">{course.title}</p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-gray-100 flex items-center justify-center"><X className="h-4 w-4 text-gray-500" /></button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
            {/* Quiz settings */}
            <div className="p-4 bg-gray-50 rounded-xl space-y-3">
              <p className="text-[12px] font-bold text-gray-600 uppercase tracking-widest">Quiz Settings</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1">Pass Score %</label>
                  <input type="number" min="0" max="100" value={qForm.pass_score} onChange={e => setQForm(f => ({ ...f, pass_score: e.target.value }))} className="w-full h-8 px-2.5 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-300" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1">Max Attempts</label>
                  <input type="number" min="1" value={qForm.max_attempts} onChange={e => setQForm(f => ({ ...f, max_attempts: e.target.value }))} className="w-full h-8 px-2.5 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-300" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1">Time Limit (min)</label>
                  <input type="number" min="1" value={qForm.time_limit} placeholder="None" onChange={e => setQForm(f => ({ ...f, time_limit: e.target.value }))} className="w-full h-8 px-2.5 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-300" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={qForm.randomize} onChange={e => setQForm(f => ({ ...f, randomize: e.target.checked }))} className="accent-orange-500" />
                  <span className="text-[12px] text-gray-700">Randomize question order</span>
                </label>
                <button onClick={saveQuiz} disabled={saving} className="flex items-center gap-1.5 h-8 px-4 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-[12px] font-semibold transition-colors">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save Settings
                </button>
              </div>
            </div>

            {/* Questions */}
            {quiz && (
              <>
                <p className="text-[12px] font-bold text-gray-600 uppercase tracking-widest">Questions ({(quiz.questions ?? []).length})</p>
                {(quiz.questions ?? []).map((q, i) => (
                  <div key={q.id} className="p-3 bg-gray-50 border border-gray-100 rounded-xl">
                    <div className="flex items-start gap-3">
                      <span className="h-5 w-5 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-600 shrink-0 mt-0.5">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-gray-900">{q.question_text}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5 capitalize">{q.question_type.replace('_', ' ')} · {q.points} pt{q.points !== 1 ? 's' : ''}</p>
                        <div className="mt-1.5 space-y-1">
                          {q.options.map(o => (
                            <p key={o.id} className={cn('text-[11px] flex items-center gap-1.5', o.is_correct ? 'text-green-600 font-semibold' : 'text-gray-500')}>
                              {o.is_correct ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : <span className="h-3 w-3 rounded-full border border-gray-300 shrink-0 inline-block" />}
                              {o.text}
                            </p>
                          ))}
                        </div>
                      </div>
                      <button onClick={() => deleteQ(q.id)} className="h-7 w-7 rounded-lg hover:bg-red-50 flex items-center justify-center shrink-0">
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </button>
                    </div>
                  </div>
                ))}

                {/* Add question form */}
                {addingQ && (
                  <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl space-y-3">
                    <textarea
                      value={newQ.question_text}
                      onChange={e => setNewQ(q => ({ ...q, question_text: e.target.value }))}
                      rows={2}
                      placeholder="Question text *"
                      className="w-full px-3 py-2 border border-orange-200 rounded-lg text-[14px] bg-white focus:outline-none resize-none"
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <select
                        value={newQ.question_type}
                        onChange={e => setNewQ(q => ({ ...q, question_type: e.target.value as any, correct_answer: '', options: [{ text: '', is_correct: true }, { text: '', is_correct: false }, { text: '', is_correct: false }, { text: '', is_correct: false }] }))}
                        className="h-8 px-2 border border-orange-200 rounded-lg text-[13px] bg-white focus:outline-none"
                      >
                        <option value="multiple_choice">Multiple Choice</option>
                        <option value="true_false">True / False</option>
                        <option value="fill_in_blank">Fill in the Blank</option>
                        <option value="essay">Detailed Answer (Essay)</option>
                      </select>
                      <input type="number" min="1" value={newQ.points} onChange={e => setNewQ(q => ({ ...q, points: e.target.value }))} placeholder="Points" className="h-8 px-2 border border-orange-200 rounded-lg text-[13px] bg-white focus:outline-none" />
                    </div>

                    {/* Multiple choice options */}
                    {newQ.question_type === 'multiple_choice' && (
                      <div className="space-y-2">
                        <p className="text-[11px] font-semibold text-gray-600">Options — select the correct answer</p>
                        {newQ.options.map((opt, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="correct"
                              checked={opt.is_correct}
                              onChange={() => setNewQ(q => ({ ...q, options: q.options.map((o, j) => ({ ...o, is_correct: j === i })) }))}
                              className="accent-orange-500"
                            />
                            <input
                              value={opt.text}
                              onChange={e => setNewQ(q => ({ ...q, options: q.options.map((o, j) => j === i ? { ...o, text: e.target.value } : o) }))}
                              placeholder={`Option ${i + 1}`}
                              className="flex-1 h-7 px-2 border border-orange-200 rounded-lg text-[13px] bg-white focus:outline-none"
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Fill in blank — correct answer */}
                    {newQ.question_type === 'fill_in_blank' && (
                      <div>
                        <p className="text-[11px] font-semibold text-gray-600 mb-1">Correct Answer</p>
                        <input
                          value={newQ.correct_answer}
                          onChange={e => setNewQ(q => ({ ...q, correct_answer: e.target.value }))}
                          placeholder="Type the exact correct answer"
                          className="w-full h-8 px-2.5 border border-orange-300 bg-orange-50 rounded-lg text-[13px] focus:outline-none"
                        />
                        <p className="text-[10px] text-gray-400 mt-1">Matching is case-insensitive</p>
                      </div>
                    )}

                    {/* Essay — no auto-grading */}
                    {newQ.question_type === 'essay' && (
                      <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
                        <p className="text-[12px] text-blue-700 font-semibold">Essay / Detailed Answer</p>
                        <p className="text-[11px] text-blue-500 mt-0.5">Students write a full answer. This question awards full points automatically (manually review responses via the enrollment view).</p>
                      </div>
                    )}
                    <input
                      value={newQ.explanation}
                      onChange={e => setNewQ(q => ({ ...q, explanation: e.target.value }))}
                      placeholder="Explanation (shown after answer)"
                      className="w-full h-8 px-2.5 border border-orange-200 rounded-lg text-[13px] bg-white focus:outline-none"
                    />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setAddingQ(false)} className="h-8 px-3 rounded-lg text-gray-600 text-[12px] hover:bg-gray-200">Cancel</button>
                      <button onClick={addQuestion} disabled={saving || !newQ.question_text.trim()} className="flex items-center gap-1.5 h-8 px-4 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-[12px] font-semibold">
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add
                      </button>
                    </div>
                  </div>
                )}

                {!addingQ && (
                  <button onClick={() => setAddingQ(true)} className="w-full flex items-center justify-center gap-2 h-9 rounded-xl border-2 border-dashed border-gray-200 text-gray-500 text-[13px] hover:border-orange-300 hover:text-orange-500 transition-colors">
                    <Plus className="h-4 w-4" /> Add Question
                  </button>
                )}
              </>
            )}

            {!quiz && (
              <div className="text-center py-8">
                <HelpCircle className="h-12 w-12 text-gray-200 mx-auto mb-3" />
                <p className="text-[14px] text-gray-500">Save quiz settings first to add questions</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Analytics Tab
// ─────────────────────────────────────────────────────────────

function AnalyticsTab() {
  const [analytics, setAnalytics] = useState<LMSAnalytics | null>(null);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    getTrainingAnalytics().then(res => {
      if (res.success) setAnalytics(res.data);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>;
  if (!analytics) return <p className="text-center text-gray-400 py-12">No analytics data yet.</p>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Courses"   value={analytics.totalCourses}   icon={<GraduationCap className="h-4 w-4" />} />
        <StatCard label="Total Enrollments" value={analytics.totalEnrollments} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Completion Rate" value={`${analytics.completionRate}%`} icon={<CheckCircle2 className="h-4 w-4" />} sub={`avg ${analytics.avgProgress}% progress`} />
        <StatCard label="Compliance Rate" value={`${analytics.complianceRate}%`} icon={<Award className="h-4 w-4" />} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Overdue Items"   value={analytics.overdueCount}    icon={<AlertCircle className="h-4 w-4" />} />
        <StatCard label="Certificates"   value={analytics.certificateCount} icon={<Award className="h-4 w-4" />} />
      </div>

      {analytics.topCourses.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          <p className="px-5 py-3 text-[12px] font-bold uppercase tracking-widest text-gray-400 border-b border-gray-100">Top Courses</p>
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-[11px] font-bold text-gray-400 uppercase tracking-widest px-5 py-2.5">Course</th>
                <th className="text-right text-[11px] font-bold text-gray-400 uppercase tracking-widest px-5 py-2.5">Enrolled</th>
                <th className="text-right text-[11px] font-bold text-gray-400 uppercase tracking-widest px-5 py-2.5">Completed</th>
                <th className="text-right text-[11px] font-bold text-gray-400 uppercase tracking-widest px-5 py-2.5">Rate</th>
              </tr>
            </thead>
            <tbody>
              {analytics.topCourses.map(c => (
                <tr key={c.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                  <td className="px-5 py-3 text-[13px] font-medium text-gray-900">{c.title}</td>
                  <td className="px-5 py-3 text-right text-[13px] text-gray-600">{c.enrolled}</td>
                  <td className="px-5 py-3 text-right text-[13px] text-gray-600">{c.completed}</td>
                  <td className="px-5 py-3 text-right text-[13px] font-semibold text-orange-600">
                    {c.enrolled > 0 ? `${Math.round((c.completed / c.enrolled) * 100)}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Enrollment helpers
// ─────────────────────────────────────────────────────────────

function fmtTime(secs: number): string {
  if (secs < 60)   return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

function StatusBadge({ e }: { e: DetailedEnrollment }) {
  if (e.completed_at) return <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">✓ Completed</span>;
  if (e.due_date && new Date(e.due_date) < new Date()) return <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-red-50 text-red-600">⚠ Overdue</span>;
  if (e.progress_pct > 0) return <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">▶ In Progress</span>;
  return <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-500">○ Not Started</span>;
}

// ─────────────────────────────────────────────────────────────
// Enrollments Tab
// ─────────────────────────────────────────────────────────────

function EnrollmentsTab({ courses }: { courses: LMSCourse[] }) {
  const [enrollments, setEnrollments]   = useState<DetailedEnrollment[]>([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [search, setSearch]             = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'not_started' | 'in_progress' | 'completed' | 'overdue'>('all');
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [showAssign, setShowAssign]     = useState(false);
  const [assignCourseId, setAssignCourseId] = useState('');
  const [users, setUsers]             = useState<any[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [assignAll, setAssignAll]     = useState(false);
  const [dueDate, setDueDate]         = useState('');
  const [assigning, setAssigning]     = useState(false);
  const [assignMsg, setAssignMsg]     = useState('');

  const load = async () => {
    const res = await getDetailedEnrollments();
    if (res.success) setEnrollments(res.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const openAssign = async () => {
    const res = await getOrgUsers();
    if (res.success) setUsers(res.data);
    setAssignAll(false);
    setSelectedUsers(new Set());
    setShowAssign(true);
  };

  const doAssign = async () => {
    if (!assignCourseId) return;
    setAssigning(true);
    let res;
    if (assignAll) {
      res = await assignCourseToAll(assignCourseId, dueDate || null);
    } else {
      if (selectedUsers.size === 0) { setAssigning(false); return; }
      res = await assignCourse(assignCourseId, [...selectedUsers], dueDate || null);
    }
    setAssignMsg(res.success
      ? `Assigned to ${(res.data as any).assigned} staff member${(res.data as any).assigned !== 1 ? 's' : ''}`
      : (res as any).error ?? 'Error');
    setAssigning(false);
    setSelectedUsers(new Set());
    setAssignAll(false);
    setShowAssign(false);
    await load();
  };

  // derived stats
  const total     = enrollments.length;
  const completed = enrollments.filter(e => e.completed_at).length;
  const overdue   = enrollments.filter(e => !e.completed_at && e.due_date && new Date(e.due_date) < new Date()).length;
  const inProg    = enrollments.filter(e => !e.completed_at && e.progress_pct > 0).length;
  const avgPct    = total ? Math.round(enrollments.reduce((s, e) => s + e.progress_pct, 0) / total) : 0;
  const totalTime = enrollments.reduce((s, e) => s + e.time_spent_secs, 0);

  // group by user for expanded view
  const byUser: Record<string, DetailedEnrollment[]> = {};
  for (const e of enrollments) {
    if (!byUser[e.user_id]) byUser[e.user_id] = [];
    byUser[e.user_id].push(e);
  }

  const statusMatch = (e: DetailedEnrollment) => {
    if (filterStatus === 'completed')   return !!e.completed_at;
    if (filterStatus === 'overdue')     return !e.completed_at && !!e.due_date && new Date(e.due_date) < new Date();
    if (filterStatus === 'in_progress') return !e.completed_at && e.progress_pct > 0;
    if (filterStatus === 'not_started') return !e.completed_at && e.progress_pct === 0;
    return true;
  };

  const filteredUsers = Object.entries(byUser).filter(([, rows]) => {
    const name = rows[0].user_name.toLowerCase();
    const matchSearch = !search || name.includes(search.toLowerCase())
      || rows.some(r => r.course_title.toLowerCase().includes(search.toLowerCase()));
    const matchStatus = filterStatus === 'all' || rows.some(statusMatch);
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-5">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total Enrolled', value: total,     color: '#6366f1' },
          { label: 'Completed',      value: completed, color: '#10b981' },
          { label: 'In Progress',    value: inProg,    color: '#3b82f6' },
          { label: 'Overdue',        value: overdue,   color: '#ef4444' },
          { label: 'Avg Progress',   value: `${avgPct}%`, color: '#f97316' },
          { label: 'Total Time',     value: fmtTime(totalTime), color: '#8b5cf6' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider mb-1">{s.label}</p>
            <p className="text-[22px] font-bold" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search staff or course…"
          className="flex-1 min-w-[180px] h-9 px-3 border border-gray-200 rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-300"
        />
        {/* Status filter pills */}
        {(['all','in_progress','completed','overdue','not_started'] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={cn(
              'h-8 px-3 rounded-lg text-[12px] font-semibold transition-colors',
              filterStatus === s ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
            )}
          >
            {s === 'all' ? 'All' : s === 'in_progress' ? 'In Progress' : s === 'not_started' ? 'Not Started' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
        <button
          onClick={refresh}
          disabled={refreshing}
          className="h-8 w-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors ml-auto"
          title="Refresh"
        >
          {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>}
        </button>
        <button
          onClick={openAssign}
          className="flex items-center gap-2 h-8 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold transition-colors"
        >
          <Upload className="h-3.5 w-3.5" /> Assign Course
        </button>
      </div>

      {assignMsg && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-[12px] text-green-700 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" /> {assignMsg}
        </div>
      )}

      {/* Per-employee expandable list */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>
      ) : filteredUsers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <Users className="h-10 w-10 text-gray-200 mx-auto mb-3" />
          <p className="text-[14px] font-semibold text-gray-400">No enrollments found</p>
          <p className="text-[12px] text-gray-300 mt-1">Assign courses to staff from the button above</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredUsers.map(([userId, rows]) => {
            const e0 = rows[0];
            const userCompleted = rows.filter(r => r.completed_at).length;
            const userOverdue   = rows.filter(r => !r.completed_at && r.due_date && new Date(r.due_date) < new Date()).length;
            const userAvgPct    = Math.round(rows.reduce((s, r) => s + r.progress_pct, 0) / rows.length);
            const userTime      = rows.reduce((s, r) => s + r.time_spent_secs, 0);
            const isOpen        = expandedUser === userId;

            return (
              <div key={userId} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Employee row header */}
                <button
                  onClick={() => setExpandedUser(isOpen ? null : userId)}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50/60 transition-colors text-left"
                >
                  {/* Avatar */}
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-bold text-[14px] shrink-0">
                    {e0.user_name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                  {/* Name + meta */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-bold text-gray-900">{e0.user_name}</p>
                    <p className="text-[11px] text-gray-400 truncate">{[e0.job_title, e0.department].filter(Boolean).join(' · ')}</p>
                  </div>
                  {/* Stats */}
                  <div className="hidden sm:flex items-center gap-6 shrink-0">
                    <div className="text-center">
                      <p className="text-[18px] font-bold text-gray-800">{rows.length}</p>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider">Courses</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[18px] font-bold text-emerald-600">{userCompleted}</p>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider">Done</p>
                    </div>
                    {userOverdue > 0 && (
                      <div className="text-center">
                        <p className="text-[18px] font-bold text-red-500">{userOverdue}</p>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider">Overdue</p>
                      </div>
                    )}
                    <div className="text-center">
                      <p className="text-[18px] font-bold text-orange-500">{userAvgPct}%</p>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider">Avg</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[14px] font-bold text-violet-600">{fmtTime(userTime)}</p>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider">Time</p>
                    </div>
                  </div>
                  {/* Chevron */}
                  <div className={cn('h-7 w-7 rounded-lg bg-gray-100 flex items-center justify-center transition-transform shrink-0', isOpen && 'rotate-180')}>
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  </div>
                </button>

                {/* Expanded: per-course rows */}
                {isOpen && (
                  <div className="border-t border-gray-100 divide-y divide-gray-50">
                    {/* Course table header */}
                    <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] gap-3 px-5 py-2 bg-gray-50">
                      {['Course', 'Progress', 'Modules', 'Time Spent', 'Due Date', 'Status'].map(h => (
                        <p key={h} className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{h}</p>
                      ))}
                    </div>
                    {rows.filter(r => filterStatus === 'all' || statusMatch(r)).map(r => (
                      <div key={r.id} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] gap-3 items-center px-5 py-3.5 hover:bg-orange-50/30 transition-colors">
                        {/* Course name */}
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: r.course_color }} />
                          <p className="text-[13px] font-semibold text-gray-800 truncate">{r.course_title}</p>
                        </div>
                        {/* Progress bar */}
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${r.progress_pct}%`, backgroundColor: r.completed_at ? '#10b981' : r.course_color }}
                            />
                          </div>
                          <span className="text-[11px] font-bold text-gray-500 shrink-0">{r.progress_pct}%</span>
                        </div>
                        {/* Modules */}
                        <p className="text-[13px] text-gray-600">
                          {r.modules_done}<span className="text-gray-300">/{r.modules_total}</span>
                        </p>
                        {/* Time */}
                        <p className="text-[13px] font-semibold text-violet-600">{fmtTime(r.time_spent_secs)}</p>
                        {/* Due */}
                        <p className={cn('text-[12px]', r.due_date && !r.completed_at && new Date(r.due_date) < new Date() ? 'text-red-500 font-bold' : 'text-gray-400')}>
                          {fmtDate(r.due_date)}
                        </p>
                        {/* Status */}
                        <StatusBadge e={r} />
                      </div>
                    ))}
                    {/* Last activity footer */}
                    <div className="px-5 py-2.5 bg-gray-50/50 flex items-center justify-between">
                      <p className="text-[11px] text-gray-400">
                        Last activity: {rows.reduce((latest, r) => {
                          if (!r.last_activity) return latest;
                          if (!latest) return r.last_activity;
                          return r.last_activity > latest ? r.last_activity : latest;
                        }, null as string | null) ? fmtDate(rows.reduce((latest, r) => {
                          if (!r.last_activity) return latest;
                          if (!latest) return r.last_activity;
                          return r.last_activity > latest ? r.last_activity : latest;
                        }, null as string | null)) : 'No activity yet'}
                      </p>
                      <p className="text-[11px] text-gray-400">Enrolled {fmtDate(e0.enrolled_at)}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Assign modal */}
      {showAssign && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-[16px] font-bold text-gray-900">Assign Course</h2>
              <button onClick={() => setShowAssign(false)} className="h-8 w-8 rounded-lg hover:bg-gray-100 flex items-center justify-center"><X className="h-4 w-4 text-gray-500" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              <div>
                <label className="block text-[12px] font-semibold text-gray-600 mb-1">Course</label>
                <select value={assignCourseId} onChange={e => setAssignCourseId(e.target.value)} className="w-full h-9 px-3 border border-gray-200 rounded-xl text-[14px] focus:outline-none focus:ring-2 focus:ring-orange-300">
                  <option value="">— Select a course —</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-gray-600 mb-1">Due Date (optional)</label>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="w-full h-9 px-3 border border-gray-200 rounded-xl text-[14px] focus:outline-none focus:ring-2 focus:ring-orange-300" />
              </div>
              <label className="flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all"
                style={{ borderColor: assignAll ? '#f97316' : '#e5e7eb', backgroundColor: assignAll ? '#fff7ed' : 'white' }}>
                <input type="checkbox" checked={assignAll} onChange={e => { setAssignAll(e.target.checked); if (e.target.checked) setSelectedUsers(new Set()); }} className="accent-orange-500 h-4 w-4" />
                <div>
                  <p className="text-[13px] font-bold text-gray-900">Assign to All Staff</p>
                  <p className="text-[11px] text-gray-400">Includes Super Admin, Admin & HR — {users.length} people total</p>
                </div>
              </label>
              {!assignAll && (
                <div>
                  <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">Select Staff ({selectedUsers.size} selected)</label>
                  <div className="border border-gray-200 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
                    {users.map(u => (
                      <label key={u.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0">
                        <input type="checkbox" checked={selectedUsers.has(u.id)} onChange={() => setSelectedUsers(prev => { const n = new Set(prev); n.has(u.id) ? n.delete(u.id) : n.add(u.id); return n; })} className="accent-orange-500" />
                        <div>
                          <p className="text-[13px] font-medium text-gray-900">{u.name}</p>
                          {(u.department || u.job_title) && <p className="text-[11px] text-gray-400">{[u.department, u.job_title].filter(Boolean).join(' · ')}</p>}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setShowAssign(false)} className="h-9 px-4 rounded-xl text-gray-600 text-[13px] hover:bg-gray-100">Cancel</button>
              <button
                onClick={doAssign}
                disabled={assigning || !assignCourseId || (!assignAll && selectedUsers.size === 0)}
                className="flex items-center gap-2 h-9 px-5 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-[13px] font-semibold"
              >
                {assigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {assignAll ? 'Assign to All Staff' : `Assign to ${selectedUsers.size} user${selectedUsers.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Courses Tab
// ─────────────────────────────────────────────────────────────

function CoursesTab({ hospitals, onCoursesChange, refreshKey }: {
  hospitals: Array<{ id: string; name: string; color: string | null }>;
  onCoursesChange?: () => void;
  refreshKey?: number;
}) {
  const [courses, setCourses]         = useState<LMSCourse[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [showForm, setShowForm]       = useState(false);
  const [editCourse, setEditCourse]   = useState<LMSCourse | null>(null);
  const [modulesCourse, setModulesCourse] = useState<LMSCourse | null>(null);
  const [quizCourse, setQuizCourse]   = useState<LMSCourse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getAdminCourses({ search: search || undefined });
    if (res.success) { setCourses(res.data); onCoursesChange?.(); }
    setLoading(false);
  }, [search]);

  useEffect(() => { load(); }, [load]);
  // re-load when parent signals a refresh (e.g. after seeding default courses)
  useEffect(() => { if (refreshKey) load(); }, [refreshKey]);

  const handleSave = async (data: any): Promise<string | undefined> => {
    let courseId: string | undefined;
    if (editCourse) {
      await updateCourse(editCourse.id, data);
      courseId = editCourse.id; // return existing ID so assignment runs
    } else {
      const res = await createCourse(data);
      if (res.success) courseId = res.data.id;
    }
    await load();
    // do NOT close modal here — CourseFormModal.handleSubmit calls onClose() itself
    // after uploads and assignment are done
    return courseId;
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this course? All enrollments and progress will be lost.')) return;
    await deleteCourse(id);
    await load();
  };

  const togglePublish = async (course: LMSCourse) => {
    await updateCourse(course.id, { is_published: !course.is_published });
    await load();
  };

  const filtered = search
    ? courses.filter(c => c.title.toLowerCase().includes(search.toLowerCase()))
    : courses;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search courses…"
          className="flex-1 h-9 px-3 border border-gray-200 rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-300"
        />
        <button
          onClick={() => { setEditCourse(null); setShowForm(true); }}
          className="flex items-center gap-2 h-9 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold transition-colors"
        >
          <Plus className="h-4 w-4" /> New Course
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>
      ) : (
        <div className="space-y-2">
          {filtered.map(course => (
            <div key={course.id} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${course.cover_color}20` }}>
                <GraduationCap className="h-5 w-5" style={{ color: course.cover_color }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[14px] font-semibold text-gray-900 truncate">{course.title}</p>
                  {!course.is_published && <Badge color="amber">Draft</Badge>}
                  {course.is_required && <Badge color="red">Required</Badge>}
                  {course.compliance_type && <Badge color="blue">{course.compliance_type}</Badge>}
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5 capitalize">
                  {[
                    `${(course as any).module_count ?? 0} module${((course as any).module_count ?? 0) !== 1 ? 's' : ''}`,
                    course.category, course.level, `${course.estimated_hours}h`,
                  ].filter(Boolean).join(' · ')}
                </p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => togglePublish(course)}
                  className={cn(
                    'flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium transition-colors',
                    course.is_published
                      ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      : 'bg-green-50 text-green-700 hover:bg-green-100',
                  )}
                  title={course.is_published ? 'Unpublish' : 'Publish'}
                >
                  {course.is_published ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  {course.is_published ? 'Unpublish' : 'Publish'}
                </button>
                <button onClick={() => setModulesCourse(course)} className="h-8 px-3 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-[12px] font-medium flex items-center gap-1.5 transition-colors">
                  <FileText className="h-3.5 w-3.5" /> Modules
                </button>
                <button onClick={() => setQuizCourse(course)} className="h-8 px-3 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 text-[12px] font-medium flex items-center gap-1.5 transition-colors">
                  <HelpCircle className="h-3.5 w-3.5" /> Quiz
                </button>
                <button onClick={() => { setEditCourse(course); setShowForm(true); }} className="h-8 w-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors">
                  <Pencil className="h-3.5 w-3.5 text-gray-500" />
                </button>
                <button onClick={() => handleDelete(course.id)} className="h-8 w-8 rounded-lg hover:bg-red-50 flex items-center justify-center transition-colors">
                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                </button>
              </div>
            </div>
          ))}

          {filtered.length === 0 && !loading && (
            <div className="text-center py-16">
              <GraduationCap className="h-14 w-14 text-gray-200 mx-auto mb-3" />
              <p className="text-[15px] text-gray-500">No courses yet. Create your first course.</p>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <CourseFormModal
          course={editCourse}
          hospitals={hospitals}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditCourse(null); }}
        />
      )}
      {modulesCourse && <ModuleManager course={modulesCourse} onClose={() => setModulesCourse(null)} />}
      {quizCourse && <QuizBuilder course={quizCourse} onClose={() => setQuizCourse(null)} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Learning Paths Tab
// ─────────────────────────────────────────────────────────────

function PathsTab() {
  const [paths, setPaths]     = useState<LearningPath[]>([]);
  const [courses, setCourses] = useState<LMSCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding]   = useState(false);
  const [form, setForm]       = useState({ title: '', description: '', role_target: '', cover_color: '#f97316' });
  const [saving, setSaving]   = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [addingCourse, setAddingCourse] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [pathsRes, coursesRes] = await Promise.all([getAdminLearningPaths(), getAdminCourses()]);
    if (pathsRes.success) setPaths(pathsRes.data);
    if (coursesRes.success) setCourses(coursesRes.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    await createLearningPath({ title: form.title.trim(), description: form.description || null, role_target: form.role_target || null, cover_color: form.cover_color });
    await load();
    setAdding(false);
    setForm({ title: '', description: '', role_target: '', cover_color: '#f97316' });
    setSaving(false);
  };

  const togglePath = async (path: LearningPath) => {
    await updateLearningPath(path.id, { is_published: !path.is_published });
    await load();
  };

  const addCourse = async (pathId: string) => {
    if (!selectedCourseId) return;
    await addCourseToPath(pathId, selectedCourseId);
    await load();
    setAddingCourse(null);
    setSelectedCourseId('');
  };

  const removeCourse = async (pathId: string, courseId: string) => {
    await removeCourseFromPath(pathId, courseId);
    await load();
  };

  const handleSeed = async () => {
    setSeeding(true);
    await seedDefaultPaths();
    await load();
    setSeeding(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={handleSeed} disabled={seeding} className="flex items-center gap-2 h-9 px-4 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-[13px] font-medium transition-colors disabled:opacity-60">
          {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <GraduationCap className="h-4 w-4" />}
          Seed Defaults
        </button>
        <button onClick={() => setAdding(true)} className="flex items-center gap-2 h-9 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold transition-colors ml-auto">
          <Plus className="h-4 w-4" /> New Path
        </button>
      </div>

      {adding && (
        <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl space-y-3">
          <p className="text-[12px] font-bold text-orange-700">New Learning Path</p>
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Path title *" className="w-full h-9 px-3 border border-orange-200 rounded-lg text-[14px] bg-white focus:outline-none" />
          <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Description" className="w-full h-9 px-3 border border-orange-200 rounded-lg text-[14px] bg-white focus:outline-none" />
          <input value={form.role_target} onChange={e => setForm(f => ({ ...f, role_target: e.target.value }))} placeholder="Target role (e.g. doctor, va, csr)" className="w-full h-9 px-3 border border-orange-200 rounded-lg text-[14px] bg-white focus:outline-none" />
          <div className="flex items-center gap-2 flex-wrap">
            {COLORS.map(c => <button key={c} onClick={() => setForm(f => ({ ...f, cover_color: c }))} className={cn('h-6 w-6 rounded-full', form.cover_color === c ? 'ring-2 ring-offset-1 ring-gray-400 scale-125' : 'hover:scale-110')} style={{ backgroundColor: c }} />)}
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setAdding(false)} className="h-8 px-3 rounded-lg text-gray-600 text-[12px] hover:bg-gray-200">Cancel</button>
            <button onClick={handleCreate} disabled={saving || !form.title.trim()} className="flex items-center gap-1.5 h-8 px-4 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-[12px] font-semibold">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Create
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>
      ) : paths.length === 0 ? (
        <div className="text-center py-16">
          <Route className="h-14 w-14 text-gray-200 mx-auto mb-3" />
          <p className="text-[15px] text-gray-500">No learning paths. Create one or seed defaults.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {paths.map(path => (
            <div key={path.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="h-1.5" style={{ backgroundColor: path.cover_color }} />
              <div className="p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[14px] font-semibold text-gray-900">{path.title}</p>
                    {!path.is_published && <Badge color="amber">Draft</Badge>}
                    {path.role_target && <Badge color="blue">{path.role_target}</Badge>}
                  </div>
                  <p className="text-[12px] text-gray-400 mt-0.5">{path.course_count} courses</p>
                </div>
                <button onClick={() => togglePath(path)} className={cn('flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium transition-colors', path.is_published ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-green-50 text-green-700 hover:bg-green-100')}>
                  {path.is_published ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  {path.is_published ? 'Unpublish' : 'Publish'}
                </button>
                <button onClick={() => setExpanded(expanded === path.id ? null : path.id)} className="h-8 w-8 rounded-lg hover:bg-gray-100 flex items-center justify-center">
                  {expanded === path.id ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
                </button>
              </div>

              {expanded === path.id && (
                <div className="px-4 pb-4 space-y-2 border-t border-gray-50 pt-3">
                  {((path.courses ?? []) as any[]).map((c: any) => (
                    <div key={c.id} className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-lg">
                      <GraduationCap className="h-4 w-4 text-gray-400 shrink-0" />
                      <p className="flex-1 text-[13px] text-gray-700 truncate">{c.title}</p>
                      <button onClick={() => removeCourse(path.id, c.id)} className="h-6 w-6 rounded hover:bg-red-50 flex items-center justify-center">
                        <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      </button>
                    </div>
                  ))}
                  {addingCourse === path.id ? (
                    <div className="flex items-center gap-2">
                      <select value={selectedCourseId} onChange={e => setSelectedCourseId(e.target.value)} className="flex-1 h-8 px-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none">
                        <option value="">— Select course —</option>
                        {courses.filter(c => !((path.courses ?? []) as any[]).find((pc: any) => pc.id === c.id)).map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                      </select>
                      <button onClick={() => addCourse(path.id)} disabled={!selectedCourseId} className="h-8 px-3 rounded-lg bg-orange-500 text-white text-[12px] disabled:opacity-50">Add</button>
                      <button onClick={() => setAddingCourse(null)} className="h-8 px-3 rounded-lg hover:bg-gray-100 text-gray-600 text-[12px]">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setAddingCourse(path.id)} className="flex items-center gap-1.5 text-[12px] text-orange-600 hover:text-orange-700">
                      <Plus className="h-3.5 w-3.5" /> Add course
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// AdminLMS root
// ─────────────────────────────────────────────────────────────

interface AdminLMSProps {
  orgId: string;
  hospitals: Array<{ id: string; name: string; color: string | null }>;
}

export function AdminLMS({ orgId, hospitals }: AdminLMSProps) {
  const [tab, setTab]           = useState<AdminTab>('courses');
  const [courses, setCourses]   = useState<LMSCourse[]>([]);
  const [seeding, setSeeding]   = useState(false);
  const [seedMsg, setSeedMsg]   = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const loadCourses = () => getAdminCourses().then(res => { if (res.success) setCourses(res.data); });
  useEffect(() => { loadCourses(); }, []);

  const handleSeedCourses = async () => {
    setSeeding(true);
    const res = await seedDefaultCourses();
    if (res.success) {
      setSeedMsg(res.data.seeded > 0 ? `${res.data.seeded} new courses added!` : 'All default courses already exist.');
      await loadCourses();
      setRefreshKey(k => k + 1); // force CoursesTab to reload
    }
    setSeeding(false);
    setTimeout(() => setSeedMsg(''), 4000);
  };

  const tabs: Array<{ id: AdminTab; label: string; icon: React.ReactNode }> = [
    { id: 'courses',     label: 'Courses',     icon: <GraduationCap className="h-4 w-4" /> },
    { id: 'enrollments', label: 'Enrollments', icon: <Users className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-5">
      {/* Sub-tabs + seed button */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors',
              tab === t.id
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            )}
          >
            {t.icon} {t.label}
          </button>
        ))}
        <button
          onClick={handleSeedCourses}
          disabled={seeding}
          className="ml-auto mb-1 flex items-center gap-1.5 h-7 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-[12px] font-medium transition-colors disabled:opacity-60"
          title="Add 6 pre-built courses with YouTube videos"
        >
          {seeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookOpen className="h-3.5 w-3.5" />}
          Add Sample Courses
        </button>
      </div>

      {seedMsg && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 text-[13px] text-green-700 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" /> {seedMsg}
        </div>
      )}

      {tab === 'courses'     && <CoursesTab hospitals={hospitals} onCoursesChange={loadCourses} refreshKey={refreshKey} />}
      {tab === 'enrollments' && <EnrollmentsTab courses={courses} />}
    </div>
  );
}
