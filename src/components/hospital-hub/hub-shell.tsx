'use client';

import React, { useState, useTransition } from 'react';
import {
  Building2, Users, FileText, FolderOpen, Layers,
  ClipboardList, GraduationCap, MapPin, Phone, Globe,
  ChevronRight, Bell, BellPlus, X, AlertTriangle,
  BookOpen, ExternalLink, Search, Pencil, Plus,
  Trash2, Save, Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '@/store/app-store';
import {
  getHospitalWorkspaceData,
  createHospitalAnnouncement,
} from '@/lib/actions/hospital-hub';
import {
  updateHospital,
  createHospital,
  deleteHospital,
} from '@/lib/actions/hospitals';
import type {
  HospitalCard, ViewRole,
  HospitalAnnouncement, WorkspaceResource,
} from '@/lib/actions/hospital-hub';
import type { SectionKey } from '@/types/sections';
import { PageHeader } from '@/components/ui/page-header';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const POSTER_ROLES = ['super_admin', 'org_admin', 'hospital_admin', 'practice_manager', 'hr'];

const PRIORITY_CONFIG = {
  urgent: { label: 'Urgent', dot: 'bg-red-500',   badge: 'text-red-700 bg-red-50 border-red-200'         },
  high:   { label: 'High',   dot: 'bg-orange-400', badge: 'text-orange-700 bg-orange-50 border-orange-200' },
  normal: { label: 'Normal', dot: 'bg-slate-300',  badge: 'text-slate-600 bg-slate-50 border-slate-200'    },
} as const;

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  FileText, BookOpen, FolderOpen, Layers, GraduationCap, Users,
  Shield: Layers, Settings: Layers,
};

const PRESET_COLORS = [
  '#2563EB', '#7C3AED', '#059669', '#DC2626',
  '#D97706', '#0891B2', '#6B7280', '#1e3a5f',
];

function relativeTime(iso: string) {
  const diff  = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);
  if (mins < 1)   return 'Just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7)   return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─────────────────────────────────────────────────────────────
// Hospital Selector  (3 equal-width horizontal tiles)
// ─────────────────────────────────────────────────────────────

function HospitalSelector({
  hospitals, selectedId, onSelect, isSuperAdmin, onAddNew,
}: {
  hospitals: HospitalCard[];
  selectedId: string;
  onSelect: (id: string) => void;
  isSuperAdmin: boolean;
  onAddNew: () => void;
}) {
  return (
    <div className="flex items-stretch gap-3">
      {hospitals.map(h => {
        const active = selectedId === h.id;
        const color  = h.color ?? '#2563EB';
        return (
          <button
            key={h.id}
            onClick={() => onSelect(h.id)}
            className={cn(
              'relative group flex flex-col items-start gap-2 px-4 py-4 rounded-xl border transition-all duration-150 text-left overflow-hidden flex-1',
              active ? 'bg-white shadow-md' : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm',
            )}
            style={active ? { borderColor: color } : {}}
          >
            {/* Top color bar */}
            <div
              className="absolute inset-x-0 top-0 h-[3px]"
              style={{ backgroundColor: color, opacity: active ? 1 : 0.2 }}
            />
            <div
              className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: active ? `${color}18` : '#f1f5f9' }}
            >
              <Building2 className="h-[18px] w-[18px]" style={{ color: active ? color : '#94a3b8' }} />
            </div>
            <div className="min-w-0 w-full">
              <p
                className={cn('text-[13px] font-semibold leading-snug', active ? 'text-slate-900' : 'text-slate-600 group-hover:text-slate-900')}
                style={active ? { color } : {}}
              >
                {h.name}
              </p>
              {h.address && (
                <p className="text-[11px] text-slate-400 mt-0.5 truncate">{h.address.split(',').slice(0, 2).join(',')}</p>
              )}
            </div>
          </button>
        );
      })}

      {/* Add Hospital button — super_admin only */}
      {isSuperAdmin && (
        <button
          onClick={onAddNew}
          className="flex flex-col items-center justify-center gap-1.5 px-5 py-4 rounded-xl border-2 border-dashed border-slate-200 hover:border-[#1e3a5f] hover:bg-slate-50 text-slate-400 hover:text-[#1e3a5f] transition-all group shrink-0"
        >
          <Plus className="h-5 w-5" />
          <span className="text-[11px] font-semibold whitespace-nowrap">Add Hospital</span>
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Hospital Form (shared for add + edit)
// ─────────────────────────────────────────────────────────────

interface HospitalFormData {
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  description: string;
  color: string;
}

function HospitalForm({
  initial,
  onSave,
  onCancel,
  onDelete,
  isNew,
}: {
  initial: HospitalFormData;
  onSave: (data: HospitalFormData) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
  isNew?: boolean;
}) {
  const [form,    setForm]    = useState<HospitalFormData>(initial);
  const [error,   setError]   = useState('');
  const [confirm, setConfirm] = useState(false);
  const [saving,  startSave]  = useTransition();
  const [deleting, startDel]  = useTransition();

  function field(key: keyof HospitalFormData) {
    return {
      value: form[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm(f => ({ ...f, [key]: e.target.value })),
    };
  }

  const inputCls = 'w-full h-9 px-3 text-[13px] border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-200';
  const labelCls = 'block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1';

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-bold text-slate-800">{isNew ? 'Add New Hospital' : 'Edit Hospital'}</p>
        <button onClick={onCancel} className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-slate-200 text-slate-400 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Name + Color */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2">
          <label className={labelCls}>Hospital Name *</label>
          <input {...field('name')} placeholder="e.g. Riverside Animal Hospital" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Brand Color</label>
          <div className="flex items-center gap-2 flex-wrap">
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setForm(f => ({ ...f, color: c }))}
                className={cn('h-7 w-7 rounded-lg border-2 transition-all', form.color === c ? 'border-slate-700 scale-110' : 'border-transparent hover:scale-105')}
                style={{ backgroundColor: c }}
              />
            ))}
            <input
              type="color"
              value={form.color}
              onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
              className="h-7 w-7 rounded-lg border border-slate-200 cursor-pointer"
              title="Custom color"
            />
          </div>
        </div>
      </div>

      {/* Address + Phone */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Address</label>
          <input {...field('address')} placeholder="123 Main St, City, State ZIP" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Phone</label>
          <input {...field('phone')} placeholder="(703) 555-0100" className={inputCls} />
        </div>
      </div>

      {/* Email + Website */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Email</label>
          <input {...field('email')} placeholder="info@hospital.com" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Website</label>
          <input {...field('website')} placeholder="https://hospital.com" className={inputCls} />
        </div>
      </div>

      {/* Description */}
      <div>
        <label className={labelCls}>Description</label>
        <textarea
          {...field('description')}
          placeholder="Brief description of this hospital…"
          rows={2}
          className="w-full px-3 py-2 text-[13px] border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
        />
      </div>

      {error && <p className="text-[12px] text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-200">{error}</p>}

      {/* Action buttons */}
      <div className="flex items-center gap-3 pt-1">
        {/* Delete (edit mode only) */}
        {onDelete && !isNew && (
          confirm ? (
            <div className="flex items-center gap-2">
              <p className="text-[12px] text-red-600 font-medium">Delete permanently?</p>
              <button
                type="button"
                disabled={deleting}
                onClick={() => startDel(async () => {
                  setError('');
                  await onDelete();
                })}
                className="h-8 px-3 text-[12px] font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50 transition-colors"
              >
                {deleting ? 'Deleting…' : 'Yes, Delete'}
              </button>
              <button type="button" onClick={() => setConfirm(false)} className="h-8 px-3 text-[12px] font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirm(true)}
              className="flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />Delete Hospital
            </button>
          )
        )}
        <div className="flex items-center gap-2 ml-auto">
          <button type="button" onClick={onCancel} className="h-8 px-4 text-[12px] font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              if (!form.name.trim()) { setError('Hospital name is required'); return; }
              setError('');
              startSave(async () => {
                try { await onSave(form); }
                catch (e: any) { setError(e?.message ?? 'Save failed'); }
              });
            }}
            className="flex items-center gap-1.5 h-8 px-4 text-[12px] font-semibold text-white bg-[#1e3a5f] hover:bg-[#162e4d] rounded-lg disabled:opacity-50 transition-colors"
          >
            <Save className="h-3.5 w-3.5" />{saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Hospital Info header (with edit for super_admin)
// ─────────────────────────────────────────────────────────────

function HospitalInfoHeader({
  hospital, isSuperAdmin, onSaved, onDeleted,
}: {
  hospital: HospitalCard;
  isSuperAdmin: boolean;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const color = hospital.color ?? '#2563EB';

  async function handleSave(form: HospitalFormData) {
    const res = await updateHospital(hospital.id, form);
    if (!res.success) throw new Error((res as any).error ?? 'Update failed');
    onSaved();
    setEditing(false);
  }

  async function handleDelete() {
    const res = await deleteHospital(hospital.id);
    if (!res.success) throw new Error((res as any).error ?? 'Delete failed');
    onDeleted();
  }

  return (
    <div className="space-y-3">
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="h-[3px]" style={{ backgroundColor: color }} />
        <div className="flex items-start gap-4 px-5 py-4">
          <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}15` }}>
            <Building2 className="h-5 w-5" style={{ color }} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[15px] font-bold text-slate-900 leading-snug">{hospital.name}</h2>
            <div className="flex items-center gap-5 mt-1.5 flex-wrap">
              {hospital.address && (
                <span className="flex items-center gap-1.5 text-[12px] text-slate-500">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />{hospital.address}
                </span>
              )}
              {hospital.phone && (
                <a href={`tel:${hospital.phone}`} className="flex items-center gap-1.5 text-[12px] text-slate-500 hover:text-slate-800 transition-colors">
                  <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" />{hospital.phone}
                </a>
              )}
              {hospital.website && (
                <a href={hospital.website} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[12px] text-slate-500 hover:text-slate-800 transition-colors">
                  <Globe className="h-3.5 w-3.5 shrink-0 text-slate-400" />Website <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            {hospital.description && (
              <p className="text-[12px] text-slate-400 mt-1.5 leading-relaxed">{hospital.description}</p>
            )}
          </div>
          {isSuperAdmin && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium text-slate-500 hover:text-[#1e3a5f] border border-slate-200 hover:border-[#1e3a5f] rounded-lg transition-colors shrink-0"
            >
              <Pencil className="h-3.5 w-3.5" />Edit
            </button>
          )}
        </div>
      </div>

      {/* Inline edit form */}
      {editing && (
        <HospitalForm
          initial={{
            name:        hospital.name,
            address:     hospital.address      ?? '',
            phone:       hospital.phone        ?? '',
            email:       hospital.email        ?? '',
            website:     hospital.website      ?? '',
            description: hospital.description  ?? '',
            color:       hospital.color        ?? '#2563EB',
          }}
          onSave={handleSave}
          onCancel={() => setEditing(false)}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Add Hospital panel (super_admin only)
// ─────────────────────────────────────────────────────────────

function AddHospitalPanel({
  orgId,
  onCreated,
  onCancel,
}: {
  orgId?: string;
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  async function handleSave(form: HospitalFormData) {
    const res = await createHospital(form);
    if (!res.success) throw new Error((res as any).error ?? 'Create failed');
    onCreated((res.data as any)?.id ?? '');
  }

  return (
    <HospitalForm
      initial={{ name: '', address: '', phone: '', email: '', website: '', description: '', color: '#2563EB' }}
      onSave={handleSave}
      onCancel={onCancel}
      isNew
    />
  );
}

// ─────────────────────────────────────────────────────────────
// Snapshot KPI Cards
// ─────────────────────────────────────────────────────────────

interface KPIItem {
  icon: React.ElementType;
  label: string;
  value: number;
  section: SectionKey;
  alert?: boolean;
}

function SnapshotCards({
  snapshot, onNavigate,
}: {
  snapshot: {
    staffCount: number; documentCount: number; projectCount: number;
    departmentCount: number; openRequestCount: number; trainingDueCount: number;
  };
  onNavigate: (section: SectionKey) => void;
}) {
  const kpis: KPIItem[] = [
    { icon: Users,         label: 'Staff Members',  value: snapshot.staffCount,       section: 'hr' },
    { icon: FileText,      label: 'Documents',       value: snapshot.documentCount,    section: 'knowledge-base' },
    { icon: FolderOpen,    label: 'Projects',        value: snapshot.projectCount,     section: 'projects' },
    { icon: Layers,        label: 'Departments',     value: snapshot.departmentCount,  section: 'admin-departments' },
    { icon: ClipboardList, label: 'Open Requests',   value: snapshot.openRequestCount, section: 'schedule-requests', alert: snapshot.openRequestCount > 0 },
    { icon: GraduationCap, label: 'Training Due',    value: snapshot.trainingDueCount, section: 'training',          alert: snapshot.trainingDueCount > 0 },
  ];

  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
      {kpis.map(k => (
        <button
          key={k.label}
          onClick={() => onNavigate(k.section)}
          className={cn(
            'group flex flex-col items-center gap-2 py-4 px-3 rounded-xl border text-center transition-all hover:shadow-sm',
            k.alert ? 'bg-red-50 border-red-200 hover:border-red-300' : 'bg-white border-slate-200 hover:border-slate-300',
          )}
        >
          <k.icon className={cn('h-4 w-4', k.alert ? 'text-red-500' : 'text-slate-400 group-hover:text-slate-600')} />
          <span className={cn('text-[22px] font-bold leading-none tabular-nums', k.alert ? 'text-red-600' : 'text-slate-900')}>
            {k.value}
          </span>
          <span className={cn('text-[11px] leading-tight', k.alert ? 'text-red-500 font-medium' : 'text-slate-500')}>
            {k.label}
          </span>
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Announcements Panel
// ─────────────────────────────────────────────────────────────

function AnnouncementsPanel({
  announcements, canPost, hospitalId, onRefresh,
}: {
  announcements: HospitalAnnouncement[];
  canPost: boolean;
  hospitalId: string;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title,    setTitle]    = useState('');
  const [content,  setContent]  = useState('');
  const [priority, setPriority] = useState<'normal' | 'high' | 'urgent'>('normal');
  const [formErr,  setFormErr]  = useState('');
  const [posting,  startPost]   = useTransition();

  function submitAnnouncement(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setFormErr('Title is required'); return; }
    setFormErr('');
    startPost(async () => {
      const res = await createHospitalAnnouncement(hospitalId, { title, content, priority });
      if (res.success) {
        setTitle(''); setContent(''); setPriority('normal');
        setShowForm(false); onRefresh();
      } else if (!res.success) setFormErr(res.error ?? 'Failed');
    });
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-slate-400" />
          <p className="text-[13px] font-semibold text-slate-800">Announcements</p>
          {announcements.length > 0 && (
            <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-slate-100 text-[11px] font-bold text-slate-600 flex items-center justify-center">
              {announcements.length}
            </span>
          )}
        </div>
        {canPost && !showForm && (
          <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 h-7 px-3 text-[12px] font-semibold text-white bg-[#1e3a5f] hover:bg-[#162e4d] rounded-lg transition-colors">
            <BellPlus className="h-3.5 w-3.5" />Post
          </button>
        )}
      </div>

      {showForm && (
        <div className="px-4 pt-3">
          <form onSubmit={submitAnnouncement} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-semibold text-slate-700">New Announcement</p>
              <button type="button" onClick={() => setShowForm(false)} className="h-6 w-6 flex items-center justify-center rounded-lg hover:bg-slate-200 text-slate-400">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title…" className="w-full h-9 px-3 text-[13px] border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-200" />
            <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Details (optional)…" rows={2} className="w-full px-3 py-2 text-[13px] border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none" />
            <div className="flex items-center gap-3">
              <select value={priority} onChange={e => setPriority(e.target.value as 'normal' | 'high' | 'urgent')} className="h-8 px-2 text-[12px] border border-slate-200 rounded-lg bg-white focus:outline-none">
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
              {formErr && <p className="flex-1 text-[11px] text-red-600">{formErr}</p>}
              <div className="flex gap-2 ml-auto">
                <button type="button" onClick={() => setShowForm(false)} className="h-8 px-3 text-[12px] font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">Cancel</button>
                <button type="submit" disabled={posting} className="h-8 px-4 text-[12px] font-semibold text-white bg-[#1e3a5f] hover:bg-[#162e4d] rounded-lg disabled:opacity-50 transition-colors">
                  {posting ? 'Posting…' : 'Post'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      <div className="divide-y divide-slate-50">
        {announcements.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Bell className="h-8 w-8 text-slate-200 mb-2" />
            <p className="text-[13px] text-slate-400">No active announcements</p>
            {canPost && !showForm && <button onClick={() => setShowForm(true)} className="mt-2 text-[12px] text-[#1e3a5f] font-medium hover:underline">Post the first announcement</button>}
          </div>
        ) : announcements.map(ann => {
          const pc     = PRIORITY_CONFIG[ann.priority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.normal;
          const isOpen = expanded === ann.id;
          return (
            <div key={ann.id}>
              <button className="w-full flex items-start gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors text-left" onClick={() => setExpanded(isOpen ? null : ann.id)}>
                <span className={cn('h-2 w-2 rounded-full mt-1.5 shrink-0', pc.dot)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[13px] font-semibold text-slate-900">{ann.title}</p>
                    {ann.priority !== 'normal' && <span className={cn('text-[10px] font-bold uppercase tracking-wide border rounded-full px-1.5 py-0.5', pc.badge)}>{pc.label}</span>}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">{ann.createdBy ?? 'Admin'} · {relativeTime(ann.created_at)}</p>
                </div>
                <ChevronRight className={cn('h-4 w-4 text-slate-300 shrink-0 mt-0.5 transition-transform duration-150', isOpen && 'rotate-90')} />
              </button>
              {isOpen && ann.content && (
                <div className="mx-4 mb-3 px-3 py-2.5 bg-slate-50 rounded-lg">
                  <p className="text-[12px] text-slate-600 leading-relaxed whitespace-pre-wrap">{ann.content}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Quick Resources Panel
// ─────────────────────────────────────────────────────────────

function ResourcesPanel({ resources, onNavigate }: { resources: WorkspaceResource[]; onNavigate: (s: SectionKey) => void }) {
  const [search, setSearch] = useState('');
  const filtered = resources.filter(r => !search || r.title.toLowerCase().includes(search.toLowerCase()) || (r.categoryName ?? '').toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="bg-white border border-slate-200 rounded-xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-slate-400" />
          <p className="text-[13px] font-semibold text-slate-800">Quick Resources</p>
        </div>
        <button onClick={() => onNavigate('knowledge-base')} className="flex items-center gap-1 text-[11px] text-[#1e3a5f] font-medium hover:underline">
          View all <ChevronRight className="h-3 w-3" />
        </button>
      </div>
      {resources.length > 4 && (
        <div className="px-4 pt-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search resources…" className="w-full h-8 pl-8 pr-3 text-[12px] border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-200" />
          </div>
        </div>
      )}
      <div className="p-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <BookOpen className="h-8 w-8 text-slate-200 mb-2" />
            <p className="text-[13px] text-slate-400">{resources.length === 0 ? 'No published documents yet' : 'No results found'}</p>
            <button onClick={() => onNavigate('knowledge-base')} className="mt-2 text-[12px] text-[#1e3a5f] font-medium hover:underline">Open Knowledge Base</button>
          </div>
        ) : filtered.map(r => {
          const color = r.categoryColor ?? '#6366f1';
          const Icon  = CATEGORY_ICONS[r.categoryIcon ?? ''] ?? FileText;
          return (
            <button key={r.id} onClick={() => onNavigate('knowledge-base')} className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 text-left transition-colors">
              <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}15` }}>
                <Icon className="h-4 w-4" style={{ color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-slate-800 truncate group-hover:text-[#1e3a5f] transition-colors">{r.title}</p>
                {r.categoryName && <p className="text-[11px] text-slate-400">{r.categoryName}</p>}
              </div>
              <ExternalLink className="h-3.5 w-3.5 text-slate-300 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Workspace Skeleton
// ─────────────────────────────────────────────────────────────

function WorkspaceSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-[76px] bg-slate-100 rounded-xl" />
      <div className="grid grid-cols-6 gap-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-24 bg-slate-100 rounded-xl" />)}</div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="h-56 bg-slate-100 rounded-xl" />
        <div className="h-56 bg-slate-100 rounded-xl" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Hub Shell (root export)
// ─────────────────────────────────────────────────────────────

interface HubShellProps {
  hospitals: HospitalCard[];
  userId: string;
  viewRole: ViewRole;
  userRoles: string[];
}

export function HubShell({ hospitals: initialHospitals, userId, viewRole, userRoles }: HubShellProps) {
  const navigate     = useAppStore(s => s.navigate);
  const queryClient  = useQueryClient();
  const canPost      = userRoles.some(r => POSTER_ROLES.includes(r));
  const isSuperAdmin = userRoles.includes('super_admin');

  const [hospitals,   setHospitals]   = useState<HospitalCard[]>(initialHospitals);
  const [selectedId,  setSelectedId]  = useState<string>(initialHospitals[0]?.id ?? '');
  const [showAddForm, setShowAddForm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['hospital-workspace', selectedId],
    queryFn:  () => getHospitalWorkspaceData(selectedId),
    enabled:  !!selectedId,
    staleTime: 30_000,
  });

  const workspace    = data?.success ? data.data : null;
  const selectedCard = hospitals.find(h => h.id === selectedId);

  function invalidateWorkspace() {
    queryClient.invalidateQueries({ queryKey: ['hospital-workspace', selectedId] });
  }

  function handleHospitalSaved() {
    // Refresh hospitals list + workspace
    queryClient.invalidateQueries({ queryKey: ['hospital-hub-init'] });
    queryClient.invalidateQueries({ queryKey: ['hospital-workspace', selectedId] });
  }

  function handleHospitalDeleted() {
    const remaining = hospitals.filter(h => h.id !== selectedId);
    setHospitals(remaining);
    setSelectedId(remaining[0]?.id ?? '');
    queryClient.invalidateQueries({ queryKey: ['hospital-hub-init'] });
  }

  function handleHospitalCreated(newId: string) {
    setShowAddForm(false);
    queryClient.invalidateQueries({ queryKey: ['hospital-hub-init'] });
    if (newId) setSelectedId(newId);
  }

  if (hospitals.length === 0 && !showAddForm) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <PageHeader title="Hospital Hub" description="Hospital-specific resources and information" color="navy" variant="banner" icon={<Building2 className="h-7 w-7" />} />
        <div className="flex flex-col items-center justify-center flex-1 py-24 text-center gap-4">
          <Building2 className="h-12 w-12 text-slate-200" />
          <div>
            <p className="text-[15px] font-semibold text-slate-600">No hospitals found</p>
            <p className="text-[13px] text-slate-400 mt-1">Seed hospitals from Admin Settings to get started.</p>
          </div>
          {isSuperAdmin && (
            <button onClick={() => setShowAddForm(true)} className="flex items-center gap-2 h-9 px-4 text-[13px] font-semibold text-white bg-[#1e3a5f] hover:bg-[#162e4d] rounded-xl transition-colors">
              <Plus className="h-4 w-4" />Add First Hospital
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Banner header */}
      <PageHeader
        title="Hospital Hub"
        description="Hospital-specific resources and information"
        color="navy"
        variant="banner"
        icon={<Building2 className="h-7 w-7" />}
      />

      {/* Everything below header scrolls as ONE unit */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-4 pb-10">

        {/* Hospital Selector */}
        <HospitalSelector
          hospitals={hospitals}
          selectedId={selectedId}
          onSelect={id => { setSelectedId(id); setShowAddForm(false); }}
          isSuperAdmin={isSuperAdmin}
          onAddNew={() => { setShowAddForm(true); setSelectedId(''); }}
        />

        {/* Add Hospital form */}
        {showAddForm && (
          <AddHospitalPanel
            onCreated={handleHospitalCreated}
            onCancel={() => { setShowAddForm(false); setSelectedId(hospitals[0]?.id ?? ''); }}
          />
        )}

        {/* Loading skeleton */}
        {!showAddForm && selectedId && isLoading && !workspace && <WorkspaceSkeleton />}

        {/* Workspace */}
        {!showAddForm && workspace && selectedCard && (
          <>
            {/* 1 — Hospital Information */}
            <HospitalInfoHeader
              hospital={selectedCard}
              isSuperAdmin={isSuperAdmin}
              onSaved={handleHospitalSaved}
              onDeleted={handleHospitalDeleted}
            />

            {/* 2 — KPI Cards */}
            <SnapshotCards snapshot={workspace.snapshot} onNavigate={navigate} />

            {/* 3 & 4 — Announcements + Resources */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <AnnouncementsPanel
                announcements={workspace.announcements}
                canPost={canPost}
                hospitalId={selectedId}
                onRefresh={invalidateWorkspace}
              />
              <ResourcesPanel resources={workspace.resources} onNavigate={navigate} />
            </div>

            {/* Alerts strip */}
            {(workspace.snapshot.openRequestCount > 3 || workspace.snapshot.trainingDueCount > 0) && (
              <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="flex-1 text-[12px] text-amber-700 space-y-0.5">
                  {workspace.snapshot.trainingDueCount > 0 && (
                    <p><strong>{workspace.snapshot.trainingDueCount} staff</strong> have training due. <button onClick={() => navigate('training')} className="underline font-semibold">View Training</button></p>
                  )}
                  {workspace.snapshot.openRequestCount > 3 && (
                    <p><strong>{workspace.snapshot.openRequestCount} requests</strong> pending. <button onClick={() => navigate('schedule-requests')} className="underline font-semibold">Review</button></p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
