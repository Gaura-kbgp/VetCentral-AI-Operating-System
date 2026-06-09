'use client';

import { useState, useRef, useCallback } from 'react';
import {
  FileText, Search, Plus, Filter, X, Upload, Eye, Download,
  Trash2, Edit2, ChevronRight, Tag, Clock, Building2,
  FolderOpen, BookOpen, Shield, Users, GraduationCap,
  Megaphone, Monitor, Settings, FileIcon, AlertCircle,
  CheckCircle, Archive, Globe, Lock,
} from 'lucide-react';
import type { Document, DocCategory, DocTag } from '@/lib/actions/documents';
import {
  createDocument, updateDocument, deleteDocument, publishDocument, archiveDocument,
} from '@/lib/actions/documents';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024)         return `${bytes} B`;
  if (bytes < 1048576)      return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824)   return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(1)} GB`;
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)   return 'just now';
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30)  return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

const CAT_ICONS: Record<string, React.ReactNode> = {
  FileText: <FileText className="h-4 w-4" />,
  Shield:   <Shield className="h-4 w-4" />,
  Users:    <Users className="h-4 w-4" />,
  ShieldCheck: <Shield className="h-4 w-4" />,
  GraduationCap: <GraduationCap className="h-4 w-4" />,
  Megaphone: <Megaphone className="h-4 w-4" />,
  Monitor:  <Monitor className="h-4 w-4" />,
  Settings: <Settings className="h-4 w-4" />,
  FolderOpen: <FolderOpen className="h-4 w-4" />,
};

const STATUS_CONFIG = {
  draft:     { label: 'Draft',     color: 'bg-amber-100 text-amber-700',   icon: <Edit2 className="h-3 w-3" /> },
  published: { label: 'Published', color: 'bg-green-100 text-green-700',   icon: <CheckCircle className="h-3 w-3" /> },
  archived:  { label: 'Archived',  color: 'bg-slate-100 text-slate-500',   icon: <Archive className="h-3 w-3" /> },
};

const VISIBILITY_CONFIG = {
  org:        { label: 'Organization', icon: <Globe className="h-3.5 w-3.5" /> },
  hospital:   { label: 'Hospital',     icon: <Building2 className="h-3.5 w-3.5" /> },
  restricted: { label: 'Restricted',   icon: <Lock className="h-3.5 w-3.5" /> },
};

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface Props {
  initialDocs:       Document[];
  categories:        DocCategory[];
  tags:              DocTag[];
  hospitals:         Array<{ id: string; name: string }>;
  canManage:         boolean;
}

interface DocForm {
  title:        string;
  description:  string;
  content:      string;
  category_id:  string;
  hospital_id:  string;
  status:       'draft' | 'published';
  visibility:   'org' | 'hospital' | 'restricted';
  tag_ids:      string[];
  change_summary: string;
}

const EMPTY_FORM: DocForm = {
  title: '', description: '', content: '', category_id: '',
  hospital_id: '', status: 'draft', visibility: 'org', tag_ids: [], change_summary: '',
};

// ─────────────────────────────────────────────────────────────
// Document Card
// ─────────────────────────────────────────────────────────────

function DocCard({
  doc, onView, onEdit, onDelete, canManage,
}: {
  doc: Document;
  onView: (doc: Document) => void;
  onEdit: (doc: Document) => void;
  onDelete: (doc: Document) => void;
  canManage: boolean;
}) {
  const status = STATUS_CONFIG[doc.status] ?? STATUS_CONFIG.draft;
  return (
    <div
      onClick={() => onView(doc)}
      className="group relative bg-white rounded-xl border border-slate-200 p-4 cursor-pointer hover:border-blue-300 hover:shadow-md transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className="mt-0.5 flex-shrink-0 rounded-lg p-2"
            style={{ backgroundColor: doc.categoryColor ? `${doc.categoryColor}20` : '#f1f5f9' }}
          >
            <FileText className="h-4 w-4" style={{ color: doc.categoryColor ?? '#64748b' }} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 text-sm truncate group-hover:text-blue-700">{doc.title}</p>
            {doc.description && (
              <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{doc.description}</p>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${status.color}`}>
                {status.icon}{status.label}
              </span>
              {doc.categoryName && (
                <span className="text-xs text-slate-400">{doc.categoryName}</span>
              )}
              {doc.tags.slice(0, 2).map(tag => (
                <span key={tag.id} className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${tag.color}20`, color: tag.color }}>
                  <Tag className="h-2.5 w-2.5" />{tag.name}
                </span>
              ))}
            </div>
          </div>
        </div>
        {canManage && (
          <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
            <button onClick={() => onEdit(doc)} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600">
              <Edit2 className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => onDelete(doc)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{relativeTime(doc.updated_at)}</span>
          <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{doc.view_count}</span>
          {doc.hospitalName && (
            <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{doc.hospitalName}</span>
          )}
        </div>
        <span className="text-xs text-slate-400">v{doc.version}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Document Modal
// ─────────────────────────────────────────────────────────────

function DocModal({ doc, onClose, canManage, onEdit }: {
  doc: Document; onClose: () => void; canManage: boolean; onEdit: () => void;
}) {
  const status = STATUS_CONFIG[doc.status] ?? STATUS_CONFIG.draft;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="rounded-xl p-2.5 bg-blue-50">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">{doc.title}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${status.color}`}>
                  {status.icon}{status.label}
                </span>
                {doc.categoryName && <span className="text-xs text-slate-400">{doc.categoryName}</span>}
                <span className="text-xs text-slate-400">v{doc.version}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canManage && (
              <button onClick={onEdit} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100">
                <Edit2 className="h-4 w-4" />Edit
              </button>
            )}
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {doc.description && (
            <p className="text-slate-600 text-sm leading-relaxed">{doc.description}</p>
          )}
          {doc.content && (
            <div className="prose prose-sm max-w-none">
              <div className="bg-slate-50 rounded-xl p-5 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap font-mono">
                {doc.content}
              </div>
            </div>
          )}
          {doc.tags.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Tags</p>
              <div className="flex flex-wrap gap-2">
                {doc.tags.map(tag => (
                  <span key={tag.id} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium" style={{ backgroundColor: `${tag.color}20`, color: tag.color }}>
                    <Tag className="h-3 w-3" />{tag.name}
                  </span>
                ))}
              </div>
            </div>
          )}
          {doc.attachments && doc.attachments.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Attachments</p>
              <div className="space-y-2">
                {doc.attachments.map(att => (
                  <div key={att.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <FileIcon className="h-4 w-4 text-slate-400" />
                      <div>
                        <p className="text-sm font-medium text-slate-700">{att.file_name}</p>
                        <p className="text-xs text-slate-400">{formatBytes(att.file_size)}</p>
                      </div>
                    </div>
                    <a href={att.public_url} target="_blank" rel="noreferrer" className="p-2 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50">
                      <Download className="h-4 w-4" />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="text-xs text-slate-400 border-t border-slate-100 pt-4 grid grid-cols-2 gap-2">
            <span>Created: {doc.createdBy ?? 'Unknown'} · {relativeTime(doc.created_at)}</span>
            <span>Updated: {doc.updatedBy ?? 'Unknown'} · {relativeTime(doc.updated_at)}</span>
            {doc.hospitalName && <span>Hospital: {doc.hospitalName}</span>}
            <span>Visibility: {VISIBILITY_CONFIG[doc.visibility]?.label}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Create / Edit Modal
// ─────────────────────────────────────────────────────────────

function EditModal({
  doc, categories, tags, hospitals, onClose,
}: {
  doc?: Document;
  categories: DocCategory[];
  tags: DocTag[];
  hospitals: Array<{ id: string; name: string }>;
  onClose: (refresh?: boolean) => void;
}) {
  const isEdit = !!doc;
  const [form, setForm] = useState<DocForm>(doc ? {
    title:        doc.title,
    description:  doc.description ?? '',
    content:      doc.content,
    category_id:  doc.category_id ?? '',
    hospital_id:  doc.hospital_id ?? '',
    status:       doc.status === 'archived' ? 'draft' : doc.status,
    visibility:   doc.visibility,
    tag_ids:      doc.tags.map(t => t.id),
    change_summary: '',
  } : EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const [uploading, setUploading]  = useState(false);
  const [uploadPct, setUploadPct]  = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (k: keyof DocForm, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  const toggleTag = (tagId: string) => {
    setForm(f => ({
      ...f,
      tag_ids: f.tag_ids.includes(tagId)
        ? f.tag_ids.filter(id => id !== tagId)
        : [...f.tag_ids, tagId],
    }));
  };

  const handleFileUpload = async (file: File) => {
    if (!doc) return;
    setUploading(true);
    setUploadPct(10);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('documentId', doc.id);
    try {
      setUploadPct(50);
      const res = await fetch('/api/v1/documents', { method: 'POST', body: fd });
      const json = await res.json();
      setUploadPct(100);
      if (!json.success) setError(json.error ?? 'Upload failed');
    } catch {
      setError('Upload failed');
    } finally {
      setUploading(false);
      setUploadPct(0);
    }
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) { setError('Title is required'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        title:        form.title,
        description:  form.description || undefined,
        content:      form.content,
        category_id:  form.category_id || undefined,
        hospital_id:  form.hospital_id || undefined,
        status:       form.status,
        visibility:   form.visibility,
        tag_ids:      form.tag_ids,
        change_summary: form.change_summary || undefined,
      };
      const result = isEdit
        ? await updateDocument(doc.id, payload)
        : await createDocument(payload);
      if (!result.success) { setError(result.error); return; }
      onClose(true);
    } catch { setError('Something went wrong'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">{isEdit ? 'Edit Document' : 'New Document'}</h2>
          <button onClick={() => onClose()} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Title *</label>
            <input
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="Document title"
              className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Description</label>
            <input
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Brief description"
              className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Content</label>
            <textarea
              value={form.content}
              onChange={e => set('content', e.target.value)}
              placeholder="Document content or notes..."
              rows={6}
              className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Category</label>
              <select value={form.category_id} onChange={e => set('category_id', e.target.value)} className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">All Categories</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Hospital</label>
              <select value={form.hospital_id} onChange={e => set('hospital_id', e.target.value)} className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">All Hospitals</option>
                {hospitals.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value as 'draft' | 'published')} className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Visibility</label>
              <select value={form.visibility} onChange={e => set('visibility', e.target.value as 'org' | 'hospital' | 'restricted')} className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="org">Organization</option>
                <option value="hospital">Hospital Only</option>
                <option value="restricted">Restricted</option>
              </select>
            </div>
          </div>
          {tags.length > 0 && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Tags</label>
              <div className="flex flex-wrap gap-2">
                {tags.map(tag => (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag.id)}
                    className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full transition-all ${
                      form.tag_ids.includes(tag.id)
                        ? 'font-semibold'
                        : 'opacity-50 hover:opacity-80'
                    }`}
                    style={{
                      backgroundColor: form.tag_ids.includes(tag.id) ? `${tag.color}30` : '#f1f5f9',
                      color: form.tag_ids.includes(tag.id) ? tag.color : '#64748b',
                    }}
                  >
                    <Tag className="h-2.5 w-2.5" />{tag.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {isEdit && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Change Summary</label>
              <input
                value={form.change_summary}
                onChange={e => set('change_summary', e.target.value)}
                placeholder="What changed? (optional)"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
          {isEdit && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Attach File</label>
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/50 transition-colors"
              >
                <Upload className="h-5 w-5 text-slate-400 mx-auto mb-1" />
                <p className="text-xs text-slate-500">Click to upload a file</p>
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }}
                />
              </div>
              {uploading && (
                <div className="mt-2">
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${uploadPct}%` }} />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Uploading...</p>
                </div>
              )}
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-xl px-4 py-3">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />{error}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200">
          <button onClick={() => onClose()} className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Document'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Shell
// ─────────────────────────────────────────────────────────────

export function DocumentsShell({ initialDocs, categories, tags, hospitals, canManage }: Props) {
  const [docs, setDocs]               = useState<Document[]>(initialDocs);
  const [search, setSearch]           = useState('');
  const [selectedCat, setSelectedCat] = useState('');
  const [selectedStatus, setStatus]   = useState('published');
  const [viewingDoc, setViewingDoc]   = useState<Document | null>(null);
  const [editingDoc, setEditingDoc]   = useState<Document | undefined>(undefined);
  const [showEditModal, setShowEditModal] = useState(false);
  const [deleting, setDeleting]       = useState<string | null>(null);

  const filtered = docs.filter(d => {
    if (selectedStatus && d.status !== selectedStatus) return false;
    if (selectedCat && d.category_id !== selectedCat) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        d.title.toLowerCase().includes(s) ||
        (d.description ?? '').toLowerCase().includes(s)
      );
    }
    return true;
  });

  const handleDelete = useCallback(async (doc: Document) => {
    if (!confirm(`Delete "${doc.title}"? This cannot be undone.`)) return;
    setDeleting(doc.id);
    try {
      const res = await deleteDocument(doc.id);
      if (res.success) setDocs(prev => prev.filter(d => d.id !== doc.id));
    } finally {
      setDeleting(null);
    }
  }, []);

  const handleEditClose = useCallback((refresh?: boolean) => {
    setShowEditModal(false);
    setEditingDoc(undefined);
    if (refresh) {
      // Reload page to get fresh data
      window.location.reload();
    }
  }, []);

  const totalDocs      = docs.length;
  const publishedCount = docs.filter(d => d.status === 'published').length;
  const draftCount     = docs.filter(d => d.status === 'draft').length;

  return (
    <div className="flex h-full gap-0 min-h-0">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 border-r border-slate-200 bg-slate-50 flex flex-col overflow-y-auto">
        <div className="p-4 border-b border-slate-200">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Status</p>
          {([
            { value: '', label: 'All Documents', count: totalDocs },
            { value: 'published', label: 'Published', count: publishedCount },
            { value: 'draft', label: 'Drafts', count: draftCount },
          ] as const).map(s => (
            <button
              key={s.value}
              onClick={() => setStatus(s.value as any)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm mb-1 transition-colors ${
                selectedStatus === s.value
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>{s.label}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${selectedStatus === s.value ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-500'}`}>
                {s.count}
              </span>
            </button>
          ))}
        </div>
        <div className="p-4 flex-1">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Categories</p>
          <button
            onClick={() => setSelectedCat('')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm mb-1 transition-colors ${!selectedCat ? 'bg-white border border-slate-200 font-semibold text-slate-900 shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
          >
            <span className="flex items-center gap-2"><FolderOpen className="h-3.5 w-3.5 text-slate-400" />All</span>
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCat(cat.id)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm mb-1 transition-colors ${selectedCat === cat.id ? 'bg-white border border-slate-200 font-semibold text-slate-900 shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
            >
              <span className="flex items-center gap-2">
                <span style={{ color: cat.color }}>{CAT_ICONS[cat.icon] ?? <FileText className="h-3.5 w-3.5" />}</span>
                <span className="truncate">{cat.name}</span>
              </span>
              {(cat.docCount ?? 0) > 0 && (
                <span className="text-xs text-slate-400">{cat.docCount}</span>
              )}
            </button>
          ))}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-200 bg-white">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search documents..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <span className="text-sm text-slate-400">{filtered.length} doc{filtered.length !== 1 ? 's' : ''}</span>
          {canManage && (
            <button
              onClick={() => { setEditingDoc(undefined); setShowEditModal(true); }}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />New Document
            </button>
          )}
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <BookOpen className="h-12 w-12 text-slate-300 mb-3" />
              <p className="text-slate-500 font-medium">No documents found</p>
              <p className="text-slate-400 text-sm mt-1">
                {search ? 'Try a different search term' : 'Create your first document to get started'}
              </p>
              {canManage && !search && (
                <button
                  onClick={() => { setEditingDoc(undefined); setShowEditModal(true); }}
                  className="mt-4 flex items-center gap-2 px-4 py-2 text-sm font-semibold text-blue-600 bg-blue-50 rounded-xl hover:bg-blue-100"
                >
                  <Plus className="h-4 w-4" />Create Document
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(doc => (
                <DocCard
                  key={doc.id}
                  doc={doc}
                  canManage={canManage}
                  onView={setViewingDoc}
                  onEdit={d => { setEditingDoc(d); setShowEditModal(true); }}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* View Modal */}
      {viewingDoc && (
        <DocModal
          doc={viewingDoc}
          canManage={canManage}
          onClose={() => setViewingDoc(null)}
          onEdit={() => { setEditingDoc(viewingDoc); setViewingDoc(null); setShowEditModal(true); }}
        />
      )}

      {/* Edit/Create Modal */}
      {showEditModal && (
        <EditModal
          doc={editingDoc}
          categories={categories}
          tags={tags}
          hospitals={hospitals}
          onClose={handleEditClose}
        />
      )}
    </div>
  );
}
