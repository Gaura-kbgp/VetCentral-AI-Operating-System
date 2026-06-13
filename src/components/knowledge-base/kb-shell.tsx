'use client';

import React, { useState, useMemo, useCallback, useTransition, useEffect, useRef } from 'react';
import {
  Search, Plus, FileText, Clock, Eye, X, LayoutGrid, List,
  Loader2, ChevronRight, Archive, BookOpen, Tag, Download,
  ArrowLeft, Globe, Building2, Lock, Hash, CheckCircle2, Edit2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { KBDocumentModal } from './kb-document-modal';
import type { KBDocument, KBCategory, KBTag, KBDocStatus } from '@/types/app';
import type { AppRole } from '@/types/database';
import { getKBDocuments, getKBDocument, searchKBDocuments } from '@/lib/actions/knowledge';

// Roles that can create / edit / delete documents
const MANAGE_ROLES: AppRole[] = ['super_admin', 'org_admin', 'hospital_admin', 'hr', 'practice_manager'];

interface KBShellProps {
  initialCategories: KBCategory[];
  initialTags: KBTag[];
  role: AppRole | null;
}

type ViewMode = 'list' | 'grid';

const STATUS_LABEL: Record<KBDocStatus, string> = {
  draft:     'Draft',
  published: 'Published',
  archived:  'Archived',
};

const STATUS_STYLE: Record<KBDocStatus, string> = {
  draft:     'bg-amber-50 text-amber-700 border-amber-200',
  published: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  archived:  'bg-slate-100 text-slate-500 border-slate-200',
};

function timeAgo(iso: string): string {
  const secs = (Date.now() - new Date(iso).getTime()) / 1000;
  if (secs < 60)    return 'just now';
  if (secs < 3600)  return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 86400 * 7) return `${Math.floor(secs / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function KBShell({ initialCategories, initialTags, role }: KBShellProps) {
  const canManage = role ? MANAGE_ROLES.includes(role) : false;

  const [documents, setDocuments]     = useState<KBDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  // Use props directly — useState would freeze the initial (empty placeholder) value
  const categories = initialCategories;
  const tags       = initialTags;

  const [search, setSearch]           = useState('');
  const [activeTab, setActiveTab]     = useState<string>('all');
  const [viewMode, setViewMode]       = useState<ViewMode>('grid');
  const [modalOpen, setModalOpen]     = useState(false);
  const [editDoc, setEditDoc]         = useState<KBDocument | null>(null);
  // Read-only viewer for non-manager roles
  const [readDoc, setReadDoc]         = useState<KBDocument | null>(null);

  const [, startTransition] = useTransition();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getKBDocuments({ status: 'all' })
      .then(r => { if (r.success) setDocuments(r.data); })
      .finally(() => setDocsLoading(false));
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!value.trim()) {
      setDocsLoading(true);
      getKBDocuments({ status: 'all' })
        .then(r => { if (r.success) setDocuments(r.data); })
        .finally(() => setDocsLoading(false));
      return;
    }
    searchTimer.current = setTimeout(() => {
      startTransition(async () => {
        setDocsLoading(true);
        const result = await searchKBDocuments(value);
        if (result.success) setDocuments(result.data);
        setDocsLoading(false);
      });
    }, 400);
  }, []);

  const clearSearch = () => handleSearchChange('');

  // Tab counts
  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0, archived: 0 };
    for (const cat of categories) counts[cat.id] = 0;
    for (const doc of documents) {
      if (doc.status === 'archived') {
        counts.archived = (counts.archived ?? 0) + 1;
      } else {
        counts.all = (counts.all ?? 0) + 1;
        if (doc.category_id) counts[doc.category_id] = (counts[doc.category_id] ?? 0) + 1;
      }
    }
    return counts;
  }, [documents, categories]);

  // Category tabs — only show categories + All + Archived
  const catTabs = useMemo(() => {
    return categories
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [categories]);

  // Filtered documents
  const filtered = useMemo(() => {
    if (activeTab === 'archived') return documents.filter(d => d.status === 'archived');
    const nonArchived = documents.filter(d => d.status !== 'archived');
    if (activeTab === 'all') return nonArchived;
    return nonArchived.filter(d => d.category_id === activeTab);
  }, [documents, activeTab]);

  const displayed = useMemo(() => {
    if (!search.trim()) return filtered;
    const q = search.toLowerCase();
    return filtered.filter(d =>
      d.title.toLowerCase().includes(q) ||
      (d.description ?? '').toLowerCase().includes(q) ||
      (d.category?.name ?? '').toLowerCase().includes(q) ||
      (d.tags ?? []).some(t => t.name.toLowerCase().includes(q))
    );
  }, [filtered, search]);

  const openCreate = () => { setEditDoc(null); setModalOpen(true); };
  const openEdit   = async (doc: KBDocument, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!canManage) return;
    const result = await getKBDocument(doc.id);
    setEditDoc(result.success ? result.data : doc);
    setModalOpen(true);
  };
  const openDoc = async (doc: KBDocument) => {
    // Always open read view first; managers see an Edit button inside it
    const result = await getKBDocument(doc.id);
    setReadDoc(result.success ? result.data : doc);
  };

  const onDocumentSaved = (saved: KBDocument) => {
    setDocuments(prev => {
      const idx = prev.findIndex(d => d.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return [saved, ...prev];
    });
    toast.success(editDoc ? 'Document updated' : 'Document created');
  };

  const onDocumentArchived = (id: string) => {
    setDocuments(prev => prev.map(d => d.id === id ? { ...d, status: 'archived' as KBDocStatus } : d));
    toast.success('Document archived');
  };

  // ── Read-only full-panel view ──────────────────────────────
  if (readDoc) {
    return (
      <KBReadView
        doc={readDoc}
        onBack={() => setReadDoc(null)}
        canManage={canManage}
        onEdit={() => { setReadDoc(null); void openEdit(readDoc); }}
      />
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* ── Banner Header ────────────────────────────────────── */}
      <div
        className="-mx-6 -mt-6 px-8 py-10 shrink-0 flex items-end justify-between gap-4"
        style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #16304f 100%)' }}
      >
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
              <BookOpen className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-[28px] font-bold text-white leading-tight">Knowledge Base</h1>
              <p className="text-white/60 text-[13px]">Single source of truth for all hospital documentation</p>
            </div>
          </div>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-2 px-5 py-2.5 bg-white text-[#1e3a5f] text-[13px] font-bold rounded-xl hover:bg-white/90 transition-all shrink-0 shadow-lg"
          >
            <Plus className="h-4 w-4" />
            New Document
          </button>
        )}
      </div>

      {/* ── Search + View Toggle ─────────────────────────────── */}
      <div className="px-0 py-4 bg-white border-b border-slate-100 shrink-0 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <Input
            placeholder="Search documents, SOPs, policies…"
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
            className="pl-11 pr-9 h-11 text-sm bg-slate-50 border-slate-200 focus:bg-white focus:border-[#1e3a5f] focus:ring-2 focus:ring-[#1e3a5f]/10 rounded-xl"
          />
          {search && (
            <button type="button" onClick={clearSearch}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {/* View toggle */}
        <div className="flex items-center bg-slate-100 rounded-xl p-1 shrink-0">
          <button type="button" onClick={() => setViewMode('grid')}
            className={cn('p-2 rounded-lg transition-all', viewMode === 'grid' ? 'bg-[#1e3a5f] text-white shadow-sm' : 'text-slate-400 hover:text-slate-600')}
            title="Grid view">
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setViewMode('list')}
            className={cn('p-2 rounded-lg transition-all', viewMode === 'list' ? 'bg-[#1e3a5f] text-white shadow-sm' : 'text-slate-400 hover:text-slate-600')}
            title="List view">
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Category Filter Pills ────────────────────────────── */}
      <div className="bg-white shrink-0 pb-3 overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          {/* All Documents */}
          <PillTab
            active={activeTab === 'all'}
            onClick={() => setActiveTab('all')}
            count={tabCounts.all ?? 0}
            label="All Documents"
            color={null}
          />
          {/* Category pills */}
          {catTabs.map(cat => (
            <PillTab
              key={cat.id}
              active={activeTab === cat.id}
              onClick={() => setActiveTab(cat.id)}
              count={tabCounts[cat.id] ?? 0}
              label={cat.name}
              color={cat.color}
            />
          ))}
          {/* Archived */}
          <PillTab
            active={activeTab === 'archived'}
            onClick={() => setActiveTab('archived')}
            count={tabCounts.archived ?? 0}
            label="Archived"
            color={null}
            icon={<Archive className="h-3 w-3" />}
          />
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-slate-50/40">
        {docsLoading ? (
          <div className="flex items-center justify-center py-24 gap-2 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading documents…</span>
          </div>
        ) : displayed.length === 0 ? (
          <EmptyState hasSearch={!!search} onNew={openCreate} />
        ) : viewMode === 'grid' ? (
          <GridView docs={displayed} onOpen={openDoc} />
        ) : (
          <ListView docs={displayed} onOpen={openDoc} onEdit={openEdit} />
        )}
      </div>

      {/* ── Footer count ────────────────────────────────────── */}
      {!docsLoading && displayed.length > 0 && (
        <div className="shrink-0 px-1 py-2 bg-white border-t border-slate-100 text-[11px] text-slate-400">
          {displayed.length} {displayed.length === 1 ? 'document' : 'documents'}
          {search && <span> matching &ldquo;{search}&rdquo;</span>}
        </div>
      )}

      {canManage && (
        <KBDocumentModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          document={editDoc}
          categories={categories}
          tags={tags}
          onSaved={onDocumentSaved}
          onArchived={onDocumentArchived}
        />
      )}
    </div>
  );
}

// ── Pill Tab ──────────────────────────────────────────────
function PillTab({ active, onClick, count, label, color, icon }: {
  active: boolean;
  onClick: () => void;
  count: number;
  label: string;
  color: string | null;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold transition-all whitespace-nowrap border',
        active
          ? 'bg-[#1e3a5f] text-white border-[#1e3a5f] shadow-sm'
          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:text-slate-800 hover:bg-slate-50'
      )}
    >
      {icon && <span className={active ? 'text-white/70' : 'text-slate-400'}>{icon}</span>}
      {color && !active && (
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      )}
      {label}
      <span className={cn(
        'text-[11px] px-1.5 py-0.5 rounded-full font-bold min-w-5 text-center',
        active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
      )}>
        {count}
      </span>
    </button>
  );
}

// ── Grid View ─────────────────────────────────────────────
function GridView({ docs, onOpen }: {
  docs: KBDocument[];
  onOpen: (d: KBDocument) => void;
}) {
  return (
    <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {docs.map(doc => {
        const catColor = doc.category?.color ?? '#94A3B8';
        return (
          <div
            key={doc.id}
            onClick={() => onOpen(doc)}
            className="bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-lg hover:border-slate-300 cursor-pointer transition-all group flex flex-col gap-3"
          >
            {/* Icon + Status */}
            <div className="flex items-start justify-between gap-2">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${catColor}18` }}>
                <FileText className="h-5 w-5" style={{ color: catColor }} />
              </div>
              <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0', STATUS_STYLE[doc.status])}>
                {STATUS_LABEL[doc.status]}
              </span>
            </div>

            {/* Title + description */}
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-bold text-slate-800 line-clamp-2 group-hover:text-[#1e3a5f] transition-colors leading-snug mb-1">
                {doc.title}
              </p>
              {doc.description && (
                <p className="text-[12px] text-slate-400 line-clamp-2 leading-relaxed">{doc.description}</p>
              )}
            </div>

            {/* Category */}
            {doc.category && (
              <span
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg self-start"
                style={{ backgroundColor: `${doc.category.color}15`, color: doc.category.color }}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: doc.category.color }} />
                {doc.category.name}
              </span>
            )}

            {/* Tags */}
            {doc.tags && doc.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {doc.tags.slice(0, 3).map(t => (
                  <span key={t.id} className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                    #{t.name}
                  </span>
                ))}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-3 border-t border-slate-100">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />{timeAgo(doc.updated_at)}
              </span>
              <span className="flex items-center gap-2">
                <span className="flex items-center gap-0.5">
                  <Eye className="h-3 w-3" />{doc.view_count}
                </span>
                <span className="font-mono">v{doc.version}</span>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── List View ─────────────────────────────────────────────
function ListView({ docs, onOpen, onEdit }: {
  docs: KBDocument[];
  onOpen: (d: KBDocument) => void;
  onEdit: (d: KBDocument, e?: React.MouseEvent) => void;
}) {
  return (
    <div className="p-4">
      {/* Header row */}
      <div className="grid grid-cols-[1fr_160px_110px_100px_60px_32px] gap-3 px-4 py-2 mb-1">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Document</span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Category</span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Last Updated</span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Status</span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Version</span>
        <span />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
        {docs.map(doc => (
          <ListRow key={doc.id} doc={doc} onOpen={onOpen} onEdit={onEdit} />
        ))}
      </div>
    </div>
  );
}

function ListRow({ doc, onOpen, onEdit }: {
  doc: KBDocument;
  onOpen: (d: KBDocument) => void;
  onEdit: (d: KBDocument, e?: React.MouseEvent) => void;
}) {
  const catColor = doc.category?.color ?? '#94A3B8';
  return (
    <div
      onClick={() => onOpen(doc)}
      className="grid grid-cols-[1fr_160px_110px_100px_60px_32px] gap-3 items-center px-4 py-3.5 hover:bg-slate-50 cursor-pointer group transition-colors"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${catColor}18` }}>
          <FileText className="h-4 w-4" style={{ color: catColor }} />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-slate-800 truncate group-hover:text-[#1e3a5f] transition-colors">
            {doc.title}
          </p>
          {doc.description && (
            <p className="text-[11px] text-slate-400 truncate">{doc.description}</p>
          )}
        </div>
      </div>
      <div>
        {doc.category ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-lg"
            style={{ backgroundColor: `${doc.category.color}15`, color: doc.category.color }}>
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: doc.category.color }} />
            <span className="truncate max-w-27.5">{doc.category.name}</span>
          </span>
        ) : (
          <span className="text-xs text-slate-300">—</span>
        )}
      </div>
      <div className="flex items-center gap-1.5 text-[12px] text-slate-400">
        <Clock className="h-3.5 w-3.5 shrink-0" />
        {timeAgo(doc.updated_at)}
      </div>
      <div>
        <span className={cn('text-[10px] font-semibold px-2 py-1 rounded-full border', STATUS_STYLE[doc.status])}>
          {STATUS_LABEL[doc.status]}
        </span>
      </div>
      <div className="text-[12px] text-slate-400 font-mono">v{doc.version}</div>
      <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-[#1e3a5f] transition-colors" />
    </div>
  );
}

// ── Markdown renderer (mirrors the document viewer) ──────
function renderMd(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3 class="text-[14px] font-bold text-slate-800 mt-5 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-[17px] font-bold text-[#1e3a5f] mt-7 mb-2 pb-1.5 border-b border-slate-100">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-[22px] font-extrabold text-[#1e3a5f] mt-6 mb-3">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-slate-900">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/```[\w]*\n([\s\S]*?)```/g, '<pre class="bg-slate-50 border border-slate-200 rounded-xl p-4 overflow-x-auto my-3 text-xs font-mono text-slate-700"><code>$1</code></pre>')
    .replace(/`(.+?)`/g, '<code class="bg-slate-100 text-[#1e3a5f] rounded px-1.5 py-0.5 text-[12px] font-mono">$1</code>')
    .replace(/^&gt; (.+)$/gm, '<blockquote class="border-l-4 border-[#1e3a5f]/30 pl-4 italic text-slate-500 my-3 bg-slate-50 py-2 rounded-r-lg">$1</blockquote>')
    .replace(/^\s*[-*+] (.+)$/gm, '<li class="ml-5 list-disc text-slate-700 mb-1">$1</li>')
    .replace(/^\s*\d+\. (.+)$/gm, '<li class="ml-5 list-decimal text-slate-700 mb-1">$1</li>')
    .replace(/(<li.*<\/li>\n?)+/g, '<ul class="my-3 space-y-0.5">$&</ul>')
    .replace(/^---$/gm, '<hr class="border-slate-200 my-6" />')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="text-[#1e3a5f] underline underline-offset-2 hover:text-blue-700" target="_blank" rel="noopener">$1</a>')
    .replace(/\n\n/g, '</p><p class="mb-3 text-slate-700 leading-relaxed">')
    .replace(/\n/g, '<br />');
}

// ── Read-only Document View (for non-manager roles) ───────
function KBReadView({
  doc, onBack, canManage, onEdit,
}: {
  doc: KBDocument;
  onBack: () => void;
  canManage: boolean;
  onEdit: () => void;
}) {
  const catColor    = doc.category?.color ?? '#1e3a5f';
  const contentHtml = doc.content
    ? `<p class="mb-3 text-slate-700 leading-relaxed">${renderMd(doc.content)}</p>`
    : '<p class="text-slate-400 italic">No content available.</p>';

  const visibilityLabel: Record<string, { label: string; Icon: React.ElementType }> = {
    org:        { label: 'Organisation-wide',  Icon: Globe },
    hospital:   { label: 'Hospital only',       Icon: Building2 },
    restricted: { label: 'Restricted access',   Icon: Lock },
  };
  const vis = visibilityLabel[doc.visibility] ?? visibilityLabel.org;

  return (
    <div className="flex flex-col h-full min-h-0 -mx-6 -mt-6 -mb-6">
      {/* ── Top bar ──────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-3 px-6 py-3.5 bg-white border-b border-slate-100">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-500 hover:text-[#1e3a5f] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Knowledge Base
        </button>
        <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
        {doc.category && (
          <>
            <span className="text-[12px] font-semibold" style={{ color: catColor }}>{doc.category.name}</span>
            <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
          </>
        )}
        <span className="text-[12px] text-slate-600 font-medium truncate max-w-xs">{doc.title}</span>

        <div className="ml-auto flex items-center gap-2">
          {canManage && (
            <button
              onClick={onEdit}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-200 text-[12px] font-semibold text-slate-600 hover:bg-slate-50 hover:text-[#1e3a5f] transition-all"
            >
              <Edit2 className="h-3.5 w-3.5" />
              Edit
            </button>
          )}
          <button
            onClick={() => window.open(`/api/v1/documents/pdf?id=${doc.id}&print=1`, '_blank')}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#1e3a5f] text-white text-[12px] font-semibold hover:bg-[#16304f] transition-all"
          >
            <Download className="h-3.5 w-3.5" />
            Download PDF
          </button>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-slate-50/40">
        <div className="max-w-3xl mx-auto px-8 py-10">

          {/* Category badge */}
          {doc.category && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-bold mb-5"
              style={{ backgroundColor: `${catColor}15`, color: catColor }}>
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: catColor }} />
              {doc.category.name}
            </div>
          )}

          {/* Title */}
          <h1 className="text-[30px] font-extrabold text-slate-900 leading-tight mb-3">{doc.title}</h1>

          {/* Description */}
          {doc.description && (
            <p className="text-[15px] text-slate-500 leading-relaxed mb-6">{doc.description}</p>
          )}

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 py-4 border-y border-slate-200 mb-8">
            <span className={cn('text-[11px] font-bold px-2.5 py-1 rounded-full border',
              doc.status === 'published' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
              doc.status === 'draft'     ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                           'bg-slate-100 text-slate-500 border-slate-200')}>
              {doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}
            </span>
            <span className="flex items-center gap-1.5 text-[12px] text-slate-500">
              <vis.Icon className="h-3.5 w-3.5 text-slate-400" />
              {vis.label}
            </span>
            <span className="flex items-center gap-1.5 text-[12px] text-slate-500">
              <Clock className="h-3.5 w-3.5 text-slate-400" />
              Updated {timeAgo(doc.updated_at)}
            </span>
            <span className="flex items-center gap-1.5 text-[12px] text-slate-500">
              <Eye className="h-3.5 w-3.5 text-slate-400" />
              {doc.view_count} views
            </span>
            <span className="ml-auto text-[11px] font-mono text-slate-400">v{doc.version}</span>
          </div>

          {/* Content */}
          <div
            className="prose prose-slate max-w-none text-[14px]"
            dangerouslySetInnerHTML={{ __html: contentHtml }}
          />

          {/* Tags */}
          {doc.tags && doc.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-10 pt-6 border-t border-slate-100">
              {doc.tags.map(t => (
                <span key={t.id}
                  className="inline-flex items-center gap-1.5 text-[11px] bg-slate-100 text-slate-600 px-2.5 py-1.5 rounded-full font-medium">
                  <Hash className="h-2.5 w-2.5" />
                  {t.name}
                </span>
              ))}
            </div>
          )}

          {/* Published date */}
          {doc.status === 'published' && doc.published_at && (
            <p className="text-[11px] text-slate-400 mt-6 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              Published {new Date(doc.published_at).toLocaleDateString('en-US', { dateStyle: 'long' })}
            </p>
          )}

          {/* Download footer card */}
          <div className="mt-10 p-5 bg-white border border-slate-200 rounded-2xl flex items-center justify-between gap-4">
            <div>
              <p className="text-[13px] font-bold text-slate-800">Download this document</p>
              <p className="text-[12px] text-slate-400 mt-0.5">Save a PDF copy for offline reference</p>
            </div>
            <button
              onClick={() => window.open(`/api/v1/documents/pdf?id=${doc.id}&print=1`, '_blank')}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#1e3a5f] hover:bg-[#16304f] text-white text-[13px] font-semibold rounded-xl transition-all shrink-0"
            >
              <Download className="h-4 w-4" />
              Download PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────
function EmptyState({ hasSearch, onNew }: { hasSearch: boolean; onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-4">
      <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center mb-5">
        <BookOpen className="h-10 w-10 text-slate-300" />
      </div>
      {hasSearch ? (
        <>
          <p className="text-[16px] font-bold text-slate-600">No documents found</p>
          <p className="text-[13px] text-slate-400 mt-1">Try different keywords or clear the search</p>
        </>
      ) : (
        <>
          <p className="text-[16px] font-bold text-slate-600">No documents yet</p>
          <p className="text-[13px] text-slate-400 mt-1 mb-6">Create your first document to build the knowledge base</p>
          <button type="button" onClick={onNew}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#1e3a5f] hover:bg-[#16304f] text-white text-[13px] font-semibold rounded-xl transition-colors">
            <Plus className="h-4 w-4" />
            New Document
          </button>
        </>
      )}
    </div>
  );
}
