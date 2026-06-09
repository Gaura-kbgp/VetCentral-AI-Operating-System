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
import {
  getAdminCourses, createCourse, updateCourse, deleteCourse,
  getModulesForCourse, createModule, updateModule, deleteModule,
  getQuizForAdmin, upsertQuiz, createQuizQuestion, updateQuizQuestion, deleteQuizQuestion,
  getAdminLearningPaths, createLearningPath, updateLearningPath,
  getAdminEnrollments, getTrainingAnalytics, assignCourse, getOrgUsers,
  addCourseToPath, removeCourseFromPath, seedDefaultPaths, getModuleViewCounts,
  type LMSCourse, type LMSModule, type QuizDefinition, type QuizQuestion,
  type LearningPath, type LMSAnalytics,
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

type AdminTab = 'courses' | 'analytics' | 'enrollments' | 'paths';

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
// Course Form Modal
// ─────────────────────────────────────────────────────────────

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
  const [saving, setSaving] = useState(false);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string>(course?.thumbnail_url ?? '');
  const [materialFiles, setMaterialFiles] = useState<File[]>([]);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const thumbInputRef = useRef<HTMLInputElement>(null);
  const materialInputRef = useRef<HTMLInputElement>(null);

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

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

  const removeMaterial = (idx: number) => {
    setMaterialFiles(f => f.filter((_, i) => i !== idx));
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

    // Upload files if we have a new course ID
    if (courseId && (thumbnailFile || materialFiles.length > 0)) {
      try {
        if (thumbnailFile) {
          setUploadStatus('Uploading thumbnail…');
          const fd = new FormData();
          fd.append('file', thumbnailFile);
          fd.append('courseId', courseId);
          const res = await fetch('/api/v1/training/upload', { method: 'POST', body: fd });
          const json = await res.json();
          if (json.success) {
            await updateCourse(courseId, { thumbnail_url: json.url });
          }
        }

        for (let i = 0; i < materialFiles.length; i++) {
          const file = materialFiles[i];
          setUploadStatus(`Uploading material ${i + 1}/${materialFiles.length}…`);
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
      } catch {
        // uploads are best-effort; course already saved
      }
    }

    setSaving(false);
    setUploadStatus('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-[16px] font-bold text-gray-900">
            {course ? 'Edit Course' : 'Create Course'}
          </h2>
          <button onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-[12px] font-semibold text-gray-600 mb-1">Title *</label>
            <input
              value={form.title}
              onChange={e => set('title', e.target.value)}
              className="w-full h-9 px-3 border border-gray-200 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-orange-300"
              placeholder="e.g. OSHA Safety Training 2024"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-[12px] font-semibold text-gray-600 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none"
              placeholder="Brief description of this course"
            />
          </div>

          {/* Category + Level */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-semibold text-gray-600 mb-1">Category</label>
              <select
                value={form.category}
                onChange={e => set('category', e.target.value)}
                className="w-full h-9 px-3 border border-gray-200 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-orange-300 capitalize"
              >
                <option value="">— None —</option>
                {CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-gray-600 mb-1">Level</label>
              <select
                value={form.level}
                onChange={e => set('level', e.target.value)}
                className="w-full h-9 px-3 border border-gray-200 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-orange-300 capitalize"
              >
                {LEVELS.map(l => <option key={l} value={l} className="capitalize">{l}</option>)}
              </select>
            </div>
          </div>

          {/* Compliance */}
          <div>
            <label className="block text-[12px] font-semibold text-gray-600 mb-1">Compliance Type</label>
            <select
              value={form.compliance_type}
              onChange={e => set('compliance_type', e.target.value)}
              className="w-full h-9 px-3 border border-gray-200 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-orange-300"
            >
              <option value="">— Not a compliance course —</option>
              {COMPLIANCE.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Numeric fields */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[12px] font-semibold text-gray-600 mb-1">Pass Score %</label>
              <input
                type="number" min="0" max="100"
                value={form.pass_score}
                onChange={e => set('pass_score', e.target.value)}
                className="w-full h-9 px-3 border border-gray-200 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-gray-600 mb-1">Est. Hours</label>
              <input
                type="number" min="0" step="0.5"
                value={form.estimated_hours}
                onChange={e => set('estimated_hours', e.target.value)}
                className="w-full h-9 px-3 border border-gray-200 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-gray-600 mb-1">Due in (days)</label>
              <input
                type="number" min="1"
                value={form.due_days}
                onChange={e => set('due_days', e.target.value)}
                placeholder="—"
                className="w-full h-9 px-3 border border-gray-200 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-gray-600 mb-1">Cert Expires After (days)</label>
            <input
              type="number" min="1"
              value={form.expires_after_days}
              onChange={e => set('expires_after_days', e.target.value)}
              placeholder="— Never —"
              className="w-full h-9 px-3 border border-gray-200 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
          </div>

          {/* Color */}
          <div>
            <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">Cover Color</label>
            <div className="flex items-center gap-2 flex-wrap">
              {COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => set('cover_color', c)}
                  className={cn(
                    'h-7 w-7 rounded-full transition-transform',
                    form.cover_color === c ? 'scale-125 ring-2 ring-offset-1 ring-gray-400' : 'hover:scale-110',
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-[12px] font-semibold text-gray-600 mb-1">Tags (comma separated)</label>
            <input
              value={form.tags}
              onChange={e => set('tags', e.target.value)}
              className="w-full h-9 px-3 border border-gray-200 rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-orange-300"
              placeholder="annual, all-staff, clinical"
            />
          </div>

          {/* Thumbnail Upload */}
          <div>
            <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">Course Thumbnail</label>
            {thumbnailPreview ? (
              <div className="relative w-full h-32 rounded-xl overflow-hidden border border-gray-200 group">
                <img src={thumbnailPreview} alt="Thumbnail" className="w-full h-full object-cover" />
                <button
                  onClick={() => { setThumbnailFile(null); setThumbnailPreview(''); }}
                  className="absolute top-2 right-2 h-6 w-6 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3 text-white" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => thumbInputRef.current?.click()}
                className="w-full h-24 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center gap-1.5 hover:border-orange-300 hover:bg-orange-50 transition-colors"
              >
                <Image className="h-5 w-5 text-gray-400" />
                <span className="text-[12px] text-gray-400">Click to upload thumbnail (JPG, PNG, WebP)</span>
              </button>
            )}
            <input
              ref={thumbInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleThumbnailSelect}
              className="hidden"
            />
          </div>

          {/* Course Materials Upload */}
          <div>
            <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">Course Materials</label>
            <button
              type="button"
              onClick={() => materialInputRef.current?.click()}
              className="w-full h-16 border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center gap-2 hover:border-orange-300 hover:bg-orange-50 transition-colors"
            >
              <FileUp className="h-4 w-4 text-gray-400" />
              <span className="text-[12px] text-gray-400">Add PDF, Word doc, or image files</span>
            </button>
            <input
              ref={materialInputRef}
              type="file"
              multiple
              accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/webp"
              onChange={handleMaterialSelect}
              className="hidden"
            />
            {materialFiles.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {materialFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100">
                    <FileIcon className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                    <span className="text-[12px] text-gray-700 flex-1 truncate">{f.name}</span>
                    <span className="text-[11px] text-gray-400 shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                    <button onClick={() => removeMaterial(i)} className="h-5 w-5 rounded flex items-center justify-center hover:bg-gray-200 transition-colors shrink-0">
                      <X className="h-3 w-3 text-gray-400" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {!course && materialFiles.length > 0 && (
              <p className="mt-1.5 text-[11px] text-gray-400">Files will be uploaded as course modules after the course is created.</p>
            )}
          </div>

          {/* Toggles */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_required}
                onChange={e => set('is_required', e.target.checked)}
                className="h-4 w-4 rounded accent-orange-500"
              />
              <span className="text-[13px] text-gray-700">Required course</span>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="h-9 px-4 rounded-xl text-gray-600 text-[13px] hover:bg-gray-100 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !form.title.trim()}
            className="flex items-center gap-2 h-9 px-5 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-[13px] font-semibold transition-colors"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {uploadStatus || (course ? 'Saving…' : 'Creating…')}
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                {course ? 'Save Changes' : 'Create Course'}
              </>
            )}
          </button>
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

                  {/* Link URL */}
                  {needsUrl && (
                    <input
                      value={form.content_url}
                      onChange={e => setForm(f => ({ ...f, content_url: e.target.value }))}
                      placeholder="https://…"
                      className="w-full h-9 px-3 border border-orange-200 rounded-lg text-[14px] bg-white focus:outline-none"
                    />
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
  const [newQ, setNewQ]       = useState({ question_text: '', question_type: 'multiple_choice' as QuizQuestion['question_type'], explanation: '', points: '1', options: [{ text: '', is_correct: true }, { text: '', is_correct: false }, { text: '', is_correct: false }, { text: '', is_correct: false }] });

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
    const opts = newQ.question_type === 'true_false'
      ? [{ id: crypto.randomUUID(), text: 'True', is_correct: true }, { id: crypto.randomUUID(), text: 'False', is_correct: false }]
      : newQ.options.filter(o => o.text.trim()).map(o => ({ id: crypto.randomUUID(), text: o.text, is_correct: o.is_correct }));

    await createQuizQuestion(quiz.id, {
      question_text: newQ.question_text.trim(),
      question_type: newQ.question_type,
      options: opts,
      explanation: newQ.explanation || null,
      points: parseInt(newQ.points) || 1,
    });
    await load();
    setAddingQ(false);
    setNewQ({ question_text: '', question_type: 'multiple_choice', explanation: '', points: '1', options: [{ text: '', is_correct: true }, { text: '', is_correct: false }, { text: '', is_correct: false }, { text: '', is_correct: false }] });
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
                    <div className="grid grid-cols-3 gap-3">
                      <select
                        value={newQ.question_type}
                        onChange={e => setNewQ(q => ({ ...q, question_type: e.target.value as any }))}
                        className="h-8 px-2 border border-orange-200 rounded-lg text-[13px] bg-white focus:outline-none"
                      >
                        <option value="multiple_choice">Multiple Choice</option>
                        <option value="true_false">True / False</option>
                      </select>
                      <input type="number" min="1" value={newQ.points} onChange={e => setNewQ(q => ({ ...q, points: e.target.value }))} placeholder="Points" className="h-8 px-2 border border-orange-200 rounded-lg text-[13px] bg-white focus:outline-none" />
                    </div>
                    {newQ.question_type === 'multiple_choice' && (
                      <div className="space-y-2">
                        <p className="text-[11px] font-semibold text-gray-600">Options (check the correct answer)</p>
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
// Enrollments Tab
// ─────────────────────────────────────────────────────────────

function EnrollmentsTab({ courses }: { courses: LMSCourse[] }) {
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [showAssign, setShowAssign]   = useState(false);
  const [assignCourseId, setAssignCourseId] = useState('');
  const [users, setUsers]             = useState<any[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [dueDate, setDueDate]         = useState('');
  const [assigning, setAssigning]     = useState(false);
  const [assignMsg, setAssignMsg]     = useState('');

  useEffect(() => {
    getAdminEnrollments().then(res => {
      if (res.success) setEnrollments(res.data);
      setLoading(false);
    });
  }, []);

  const openAssign = async () => {
    const res = await getOrgUsers();
    if (res.success) setUsers(res.data);
    setShowAssign(true);
  };

  const doAssign = async () => {
    if (!assignCourseId || selectedUsers.size === 0) return;
    setAssigning(true);
    const res = await assignCourse(assignCourseId, [...selectedUsers], dueDate || null);
    setAssignMsg(res.success ? `Assigned to ${res.data.assigned} user${res.data.assigned !== 1 ? 's' : ''}` : res.error ?? 'Error');
    setAssigning(false);
    setSelectedUsers(new Set());
    setShowAssign(false);
  };

  const filtered = enrollments.filter(e =>
    !search || e.user_name.toLowerCase().includes(search.toLowerCase()) || e.course_title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by user or course…"
          className="flex-1 h-9 px-3 border border-gray-200 rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-300"
        />
        <button
          onClick={openAssign}
          className="flex items-center gap-2 h-9 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold transition-colors"
        >
          <Upload className="h-4 w-4" /> Assign Course
        </button>
      </div>

      {assignMsg && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-[12px] text-green-700 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" /> {assignMsg}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['User', 'Course', 'Progress', 'Due', 'Completed'].map(h => (
                  <th key={h} className="text-left text-[11px] font-bold uppercase tracking-widest text-gray-400 px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map(e => (
                <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50/50 last:border-0">
                  <td className="px-4 py-3 text-[13px] font-medium text-gray-900">{e.user_name}</td>
                  <td className="px-4 py-3 text-[13px] text-gray-600 max-w-[180px] truncate">{e.course_title}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-orange-400 rounded-full" style={{ width: `${e.progress_pct}%` }} />
                      </div>
                      <span className="text-[11px] text-gray-400">{e.progress_pct}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-gray-500">
                    {e.due_date ? new Date(e.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {e.completed_at
                      ? <Badge color="green">Done</Badge>
                      : e.due_date && new Date(e.due_date) < new Date()
                        ? <Badge color="red">Overdue</Badge>
                        : <Badge color="amber">In Progress</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="text-center text-gray-400 py-8 text-[13px]">No enrollments found.</p>
          )}
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
              <div>
                <label className="block text-[12px] font-semibold text-gray-600 mb-1.5">Staff ({selectedUsers.size} selected)</label>
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
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setShowAssign(false)} className="h-9 px-4 rounded-xl text-gray-600 text-[13px] hover:bg-gray-100">Cancel</button>
              <button onClick={doAssign} disabled={assigning || !assignCourseId || selectedUsers.size === 0} className="flex items-center gap-2 h-9 px-5 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-[13px] font-semibold">
                {assigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Assign to {selectedUsers.size} user{selectedUsers.size !== 1 ? 's' : ''}
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

function CoursesTab({ hospitals }: { hospitals: Array<{ id: string; name: string; color: string | null }> }) {
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
    if (res.success) setCourses(res.data);
    setLoading(false);
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (data: any): Promise<string | undefined> => {
    let courseId: string | undefined;
    if (editCourse) {
      await updateCourse(editCourse.id, data);
    } else {
      const res = await createCourse(data);
      if (res.success) courseId = res.data.id;
    }
    await load();
    setShowForm(false);
    setEditCourse(null);
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
                  {[course.category, course.level, `${course.estimated_hours}h`].filter(Boolean).join(' · ')}
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
  const [tab, setTab] = useState<AdminTab>('courses');
  const [courses, setCourses] = useState<LMSCourse[]>([]);

  useEffect(() => {
    getAdminCourses().then(res => { if (res.success) setCourses(res.data); });
  }, []);

  const tabs: Array<{ id: AdminTab; label: string; icon: React.ReactNode }> = [
    { id: 'courses',     label: 'Courses',        icon: <GraduationCap className="h-4 w-4" /> },
    { id: 'enrollments', label: 'Enrollments',    icon: <Users className="h-4 w-4" /> },
    { id: 'paths',       label: 'Learning Paths', icon: <Route className="h-4 w-4" /> },
    { id: 'analytics',   label: 'Analytics',      icon: <BarChart3 className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-5">
      {/* Sub-tabs */}
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
      </div>

      {tab === 'courses'     && <CoursesTab hospitals={hospitals} />}
      {tab === 'enrollments' && <EnrollmentsTab courses={courses} />}
      {tab === 'paths'       && <PathsTab />}
      {tab === 'analytics'   && <AnalyticsTab />}
    </div>
  );
}
