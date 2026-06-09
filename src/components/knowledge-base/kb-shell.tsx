'use client';

import React, { useState, useMemo, useCallback, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen, Search, Plus, FolderOpen, Tag, Archive,
  FileText, ChevronRight, Clock, Eye,
  X, LayoutGrid, List, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { KBDocumentModal } from './kb-document-modal';
import type { KBDocument, KBCategory, KBTag, KBDocStatus } from '@/types/app';
import { getKBDocuments, getKBDocument, searchKBDocuments } from '@/lib/actions/knowledge';

interface KBShellProps {
  initialCategories: KBCategory[];
  initialTags: KBTag[];
}

type ViewMode = 'grid' | 'list';
type SidebarView = 'categories' | 'tags' | 'archived';

const STATUS_LABEL: Record<KBDocStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
};

const STATUS_COLOR: Record<KBDocStatus, string> = {
  draft:     'bg-amber-100 text-amber-700 border-amber-200',
  published: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  archived:  'bg-slate-100 text-slate-500 border-slate-200',
};

function timeAgo(iso: string): string {
  const secs = (Date.now() - new Date(iso).getTime()) / 1000;
  if (secs < 60)   return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function initials(doc: KBDocument): string {
  const a = doc.author;
  if (!a) return '?';
  return `${a.first_name?.[0] ?? ''}${a.last_name?.[0] ?? ''}`.toUpperCase() || '?';
}

export function KBShell({ initialCategories, initialTags }: KBShellProps) {
  const router = useRouter();
  const [documents, setDocuments]   = useState<KBDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [categories] = useState<KBCategory[]>(initialCategories);
  const [tags] = useState<KBTag[]>(initialTags);

  const [search, setSearch] = useState('');
  const [sidebarView, setSidebarView] = useState<SidebarView>('categories');
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [activeTagId, setActiveTagId] = useState<string | null>(null);
  const [activeStatus, setActiveStatus] = useState<KBDocStatus | 'all'>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [modalOpen, setModalOpen] = useState(false);
  const [editDoc, setEditDoc] = useState<KBDocument | null>(null);
  const [, startTransition] = useTransition();

  // Load documents client-side so the shell renders immediately
  useEffect(() => {
    getKBDocuments({ status: 'all' })
      .then(r => { if (r.success) setDocuments(r.data); })
      .finally(() => setDocsLoading(false));
  }, []);

  const handleSearch = useCallback(async (q: string) => {
    setSearch(q);
    if (!q.trim()) return;
    startTransition(async () => {
      setDocsLoading(true);
      const result = await searchKBDocuments(q);
      if (result.success) setDocuments(result.data);
      setDocsLoading(false);
    });
  }, []);

  const clearSearch = () => {
    setSearch('');
    setDocsLoading(true);
    getKBDocuments({ status: 'all' })
      .then(r => { if (r.success) setDocuments(r.data); })
      .finally(() => setDocsLoading(false));
  };

  const filtered = useMemo(() => {
    let list = documents;
    if (sidebarView === 'archived') {
      list = list.filter(d => d.status === 'archived');
    } else {
      list = list.filter(d => d.status !== 'archived');
      if (activeCategoryId) list = list.filter(d => d.category_id === activeCategoryId);
      if (activeTagId)      list = list.filter(d => d.tags?.some(t => t.id === activeTagId));
      if (activeStatus !== 'all') list = list.filter(d => d.status === activeStatus);
    }
    return list;
  }, [documents, sidebarView, activeCategoryId, activeTagId, activeStatus]);

  const categoryCounts = useMemo(() => {
    const nonArchived = documents.filter(d => d.status !== 'archived');
    return Object.fromEntries(
      categories.map(c => [c.id, nonArchived.filter(d => d.category_id === c.id).length])
    );
  }, [documents, categories]);

  const openCreate = () => { setEditDoc(null); setModalOpen(true); };
  const openEdit = async (doc: KBDocument) => {
    // List query excludes content — fetch the full document before opening the editor
    if (doc.content !== undefined) {
      setEditDoc(doc);
      setModalOpen(true);
    } else {
      const result = await getKBDocument(doc.id);
      setEditDoc(result.success ? result.data : doc);
      setModalOpen(true);
    }
  };

  const onDocumentSaved = (saved: KBDocument) => {
    setDocuments(prev => {
      const idx = prev.findIndex(d => d.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [saved, ...prev];
    });
    toast.success(editDoc ? 'Document updated' : 'Document created');
  };

  const onDocumentArchived = (id: string) => {
    setDocuments(prev =>
      prev.map(d => d.id === id ? { ...d, status: 'archived' as KBDocStatus } : d)
    );
    toast.success('Document archived');
  };

  const selectCategory = (id: string | null) => {
    setActiveCategoryId(id);
    setActiveTagId(null);
    setSidebarView('categories');
  };

  const selectTag = (id: string | null) => {
    setActiveTagId(id);
    setActiveCategoryId(null);
    setSidebarView('tags');
  };

  const archiveCount = documents.filter(d => d.status === 'archived').length;
  const activeCategory = categories.find(c => c.id === activeCategoryId);
  const activeTag      = tags.find(t => t.id === activeTagId);

  return (
    <div className="flex flex-1 min-h-0 gap-0 rounded-xl border border-slate-100 bg-white overflow-hidden mt-4">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-slate-100 flex flex-col bg-slate-50/60">
        <div className="p-3 border-b border-slate-100">
          <Button
            onClick={openCreate}
            className="w-full justify-start gap-2 h-8 text-xs"
            size="sm"
          >
            <Plus className="h-3.5 w-3.5" />
            New Document
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {/* All Docs */}
          <SidebarItem
            icon={<BookOpen className="h-3.5 w-3.5" />}
            label="All Documents"
            count={documents.filter(d => d.status !== 'archived').length}
            active={sidebarView === 'categories' && !activeCategoryId && !activeTagId}
            onClick={() => { setSidebarView('categories'); selectCategory(null); setActiveStatus('all'); }}
          />

          <div className="pt-2 pb-1 px-2">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Categories</p>
          </div>

          {categories.map(cat => (
            <SidebarItem
              key={cat.id}
              icon={<span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />}
              label={cat.name}
              count={categoryCounts[cat.id] ?? 0}
              active={sidebarView === 'categories' && activeCategoryId === cat.id}
              onClick={() => selectCategory(cat.id)}
            />
          ))}

          {tags.length > 0 && (
            <>
              <div className="pt-3 pb-1 px-2">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Tags</p>
              </div>
              {tags.slice(0, 12).map(tag => (
                <SidebarItem
                  key={tag.id}
                  icon={<Tag className="h-3 w-3" />}
                  label={tag.name}
                  active={sidebarView === 'tags' && activeTagId === tag.id}
                  onClick={() => selectTag(tag.id)}
                />
              ))}
            </>
          )}

          <div className="pt-3 pb-1 px-2">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Status</p>
          </div>
          {(['draft', 'published'] as KBDocStatus[]).map(s => (
            <SidebarItem
              key={s}
              icon={<span className={cn('w-2 h-2 rounded-full', s === 'published' ? 'bg-emerald-400' : 'bg-amber-400')} />}
              label={STATUS_LABEL[s]}
              count={documents.filter(d => d.status === s).length}
              active={activeStatus === s && sidebarView === 'categories'}
              onClick={() => { setActiveStatus(s); setActiveCategoryId(null); setActiveTagId(null); setSidebarView('categories'); }}
            />
          ))}

          <div className="pt-3" />
          <SidebarItem
            icon={<Archive className="h-3.5 w-3.5" />}
            label="Archive"
            count={archiveCount}
            active={sidebarView === 'archived'}
            onClick={() => { setSidebarView('archived'); setActiveCategoryId(null); setActiveTagId(null); }}
          />
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <Input
              placeholder="Search documents…"
              value={search}
              onChange={e => handleSearch(e.target.value)}
              className="pl-8 h-8 text-xs bg-slate-50 border-slate-200"
            />
            {search && (
              <button
                onClick={clearSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              className={cn('p-1.5', viewMode === 'list' ? 'bg-slate-100 text-slate-700' : 'text-slate-400 hover:text-slate-600')}
            >
              <List className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={cn('p-1.5', viewMode === 'grid' ? 'bg-slate-100 text-slate-700' : 'text-slate-400 hover:text-slate-600')}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
          </div>

          <span className="text-xs text-slate-400 ml-auto shrink-0">
            {filtered.length} {filtered.length === 1 ? 'doc' : 'docs'}
          </span>
        </div>

        {/* Section header */}
        <div className="px-4 py-2 flex items-center gap-2 border-b border-slate-50">
          <FolderOpen className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-xs font-medium text-slate-600">
            {sidebarView === 'archived'
              ? 'Archived Documents'
              : activeCategory
                ? activeCategory.name
                : activeTag
                  ? `#${activeTag.name}`
                  : activeStatus !== 'all'
                    ? STATUS_LABEL[activeStatus as KBDocStatus]
                    : 'All Documents'}
          </span>
        </div>

        {/* Document list */}
        <div className="flex-1 overflow-y-auto">
          {docsLoading ? (
            <div className="flex items-center justify-center py-20 gap-2 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading documents…</span>
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState sidebarView={sidebarView} onNew={openCreate} />
          ) : viewMode === 'list' ? (
            <ListView
              docs={filtered}
              onOpen={d => router.push(`/knowledge-base/${d.id}`)}
              onEdit={d => void openEdit(d)}
            />
          ) : (
            <GridView
              docs={filtered}
              onOpen={d => router.push(`/knowledge-base/${d.id}`)}
              onEdit={d => void openEdit(d)}
            />
          )}
        </div>
      </div>

      {/* Create/Edit modal */}
      <KBDocumentModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        document={editDoc}
        categories={categories}
        tags={tags}
        onSaved={onDocumentSaved}
        onArchived={onDocumentArchived}
      />
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────

function SidebarItem({
  icon, label, count, active, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors text-left',
        active
          ? 'bg-indigo-50 text-indigo-700 font-medium'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
      )}
    >
      <span className="shrink-0 text-slate-400">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && (
        <span className={cn('text-[10px] tabular-nums', active ? 'text-indigo-500' : 'text-slate-400')}>
          {count}
        </span>
      )}
    </button>
  );
}

function ListView({
  docs, onOpen, onEdit,
}: {
  docs: KBDocument[];
  onOpen: (d: KBDocument) => void;
  onEdit: (d: KBDocument) => void;
}) {
  return (
    <div className="divide-y divide-slate-50">
      {docs.map(doc => (
        <div
          key={doc.id}
          onClick={() => onOpen(doc)}
          className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50/60 cursor-pointer group transition-colors"
        >
          <div
            className="mt-0.5 h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: doc.category?.color ? `${doc.category.color}20` : '#F1F5F9' }}
          >
            <FileText className="h-3.5 w-3.5" style={{ color: doc.category?.color ?? '#94A3B8' }} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 mb-0.5">
              <p className="text-sm font-medium text-slate-800 truncate flex-1 group-hover:text-indigo-700 transition-colors">
                {doc.title}
              </p>
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded border shrink-0', STATUS_COLOR[doc.status])}>
                {STATUS_LABEL[doc.status]}
              </span>
            </div>
            {doc.description && (
              <p className="text-xs text-slate-400 truncate mb-1">{doc.description}</p>
            )}
            <div className="flex items-center gap-3 text-[10px] text-slate-400">
              {doc.category && (
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: doc.category.color }} />
                  {doc.category.name}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                {timeAgo(doc.updated_at)}
              </span>
              <span className="flex items-center gap-1">
                <Eye className="h-2.5 w-2.5" />
                {doc.view_count}
              </span>
              {doc.tags && doc.tags.length > 0 && (
                <span className="flex items-center gap-1 flex-wrap">
                  {doc.tags.slice(0, 3).map(t => (
                    <span key={t.id} className="bg-slate-100 text-slate-500 px-1 rounded">#{t.name}</span>
                  ))}
                </span>
              )}
            </div>
          </div>

          <button
            onClick={e => { e.stopPropagation(); onEdit(doc); }}
            className="shrink-0 text-slate-300 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity text-xs px-2 py-1 rounded hover:bg-indigo-50"
          >
            Edit
          </button>
          <ChevronRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-indigo-500 shrink-0 mt-0.5 transition-colors" />
        </div>
      ))}
    </div>
  );
}

function GridView({
  docs, onOpen, onEdit,
}: {
  docs: KBDocument[];
  onOpen: (d: KBDocument) => void;
  onEdit: (d: KBDocument) => void;
}) {
  return (
    <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {docs.map(doc => (
        <div
          key={doc.id}
          onClick={() => onOpen(doc)}
          className="bg-white border border-slate-100 rounded-xl p-3.5 hover:shadow-md hover:border-indigo-100 cursor-pointer transition-all group flex flex-col gap-2"
        >
          <div className="flex items-start justify-between gap-2">
            <div
              className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: doc.category?.color ? `${doc.category.color}20` : '#F1F5F9' }}
            >
              <FileText className="h-4 w-4" style={{ color: doc.category?.color ?? '#94A3B8' }} />
            </div>
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded border shrink-0 mt-0.5', STATUS_COLOR[doc.status])}>
              {STATUS_LABEL[doc.status]}
            </span>
          </div>

          <div className="flex-1">
            <p className="text-xs font-semibold text-slate-800 line-clamp-2 group-hover:text-indigo-700 transition-colors leading-snug">
              {doc.title}
            </p>
            {doc.description && (
              <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">{doc.description}</p>
            )}
          </div>

          {doc.tags && doc.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {doc.tags.slice(0, 2).map(t => (
                <span key={t.id} className="text-[10px] bg-slate-100 text-slate-500 px-1.5 rounded">#{t.name}</span>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-50">
            <span className="flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" />{timeAgo(doc.updated_at)}
            </span>
            <span className="flex items-center gap-1">
              <Eye className="h-2.5 w-2.5" />{doc.view_count}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ sidebarView, onNew }: { sidebarView: SidebarView; onNew: () => void }) {
  if (sidebarView === 'archived') {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Archive className="h-10 w-10 text-slate-200 mb-3" />
        <p className="text-sm font-medium text-slate-500">No archived documents</p>
        <p className="text-xs text-slate-400 mt-1">Archived documents will appear here</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <BookOpen className="h-10 w-10 text-slate-200 mb-3" />
      <p className="text-sm font-medium text-slate-500">No documents yet</p>
      <p className="text-xs text-slate-400 mt-1 mb-4">Create your first document to get started</p>
      <Button onClick={onNew} size="sm" className="gap-2">
        <Plus className="h-3.5 w-3.5" />
        New Document
      </Button>
    </div>
  );
}
