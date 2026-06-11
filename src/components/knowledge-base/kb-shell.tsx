'use client';

import React, { useState, useMemo, useCallback, useTransition, useEffect, useRef } from 'react';
import {
  Search, Plus, FileText, Clock, Eye, X, LayoutGrid, List,
  Loader2, ChevronRight, Archive, BookOpen, Tag,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { KBDocumentModal } from './kb-document-modal';
import type { KBDocument, KBCategory, KBTag, KBDocStatus } from '@/types/app';
import { getKBDocuments, getKBDocument, searchKBDocuments } from '@/lib/actions/knowledge';

interface KBShellProps {
  initialCategories: KBCategory[];
  initialTags: KBTag[];
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

export function KBShell({ initialCategories, initialTags }: KBShellProps) {
  const [documents, setDocuments]     = useState<KBDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [categories]                  = useState<KBCategory[]>(initialCategories);
  const [tags]                        = useState<KBTag[]>(initialTags);

  const [search, setSearch]           = useState('');
  const [activeTab, setActiveTab]     = useState<string>('all');  // 'all' | category.id | 'archived'
  const [viewMode, setViewMode]       = useState<ViewMode>('list');
  const [modalOpen, setModalOpen]     = useState(false);
  const [editDoc, setEditDoc]         = useState<KBDocument | null>(null);

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

  // Build tabs: All + each category + Archived
  const tabs = useMemo(() => {
    const base = [{ id: 'all', name: 'All Documents', color: null as string | null }];
    const cats = categories
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(c => ({ id: c.id, name: c.name, color: c.color }));
    const archive = [{ id: 'archived', name: 'Archived', color: null as string | null }];
    return [...base, ...cats, ...archive];
  }, [categories]);

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

  // Client-side filter by active tab (server handles search text)
  const filtered = useMemo(() => {
    if (activeTab === 'archived') return documents.filter(d => d.status === 'archived');
    const nonArchived = documents.filter(d => d.status !== 'archived');
    if (activeTab === 'all') return nonArchived;
    return nonArchived.filter(d => d.category_id === activeTab);
  }, [documents, activeTab]);

  // Additional client-side search on top of server results
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
    const result = await getKBDocument(doc.id);
    setEditDoc(result.success ? result.data : doc);
    setModalOpen(true);
  };
  const openDoc = (doc: KBDocument) => { void openEdit(doc); };

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

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* ── Top bar ─────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-6 py-4 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <BookOpen className="h-5 w-5 text-[#1e3a5f] shrink-0" />
          <h1 className="text-lg font-bold text-slate-900 leading-none">Knowledge Base</h1>
          <span className="text-xs text-slate-400 hidden sm:block">· Single source of truth for all hospital documentation</span>
        </div>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {/* View toggle */}
          <div className="flex items-center bg-slate-100 rounded-md p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={cn('p-1.5 rounded transition-all', viewMode === 'list' ? 'bg-white shadow-sm text-slate-700' : 'text-slate-400 hover:text-slate-600')}
              title="List view"
            >
              <List className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={cn('p-1.5 rounded transition-all', viewMode === 'grid' ? 'bg-white shadow-sm text-slate-700' : 'text-slate-400 hover:text-slate-600')}
              title="Grid view"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
          </div>
          {/* New Document */}
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#1e3a5f] hover:bg-[#16304f] text-white text-xs font-medium rounded-md transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            New Document
          </button>
        </div>
      </div>

      {/* ── Search bar ──────────────────────────────────────── */}
      <div className="px-6 py-3 bg-white border-b border-slate-200 shrink-0">
        <div className="relative max-w-2xl">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <Input
            placeholder="Search by title, content, category, or tag…"
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
            className="pl-10 pr-9 h-10 text-sm bg-slate-50 border-slate-200 focus:bg-white focus:border-[#1e3a5f] focus:ring-1 focus:ring-[#1e3a5f]/20 rounded-lg"
          />
          {search && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 shrink-0 overflow-x-auto">
        <div className="flex px-6 gap-0 min-w-max">
          {tabs.map(tab => {
            const count   = tabCounts[tab.id] ?? 0;
            const active  = activeTab === tab.id;
            const isArchive = tab.id === 'archived';
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                  active
                    ? 'border-[#1e3a5f] text-[#1e3a5f]'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                )}
              >
                {isArchive && <Archive className="h-3.5 w-3.5" />}
                {tab.color && !isArchive && (
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tab.color }} />
                )}
                {tab.name}
                <span className={cn(
                  'text-[11px] px-1.5 py-0.5 rounded-full font-semibold min-w-[18px] text-center',
                  active ? 'bg-[#1e3a5f] text-white' : 'bg-slate-100 text-slate-500'
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-white">
        {docsLoading ? (
          <div className="flex items-center justify-center py-24 gap-2 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading documents…</span>
          </div>
        ) : displayed.length === 0 ? (
          <EmptyState hasSearch={!!search} onNew={openCreate} />
        ) : viewMode === 'list' ? (
          <ListView docs={displayed} onOpen={openDoc} onEdit={openEdit} />
        ) : (
          <GridView docs={displayed} onOpen={openDoc} onEdit={openEdit} />
        )}
      </div>

      {/* ── Count footer ────────────────────────────────────── */}
      {!docsLoading && displayed.length > 0 && (
        <div className="shrink-0 px-6 py-2 bg-slate-50 border-t border-slate-100 text-xs text-slate-400">
          {displayed.length} {displayed.length === 1 ? 'document' : 'documents'}
          {search && <span> matching &ldquo;{search}&rdquo;</span>}
        </div>
      )}

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

// ── List View ─────────────────────────────────────────────
function ListView({ docs, onOpen, onEdit }: {
  docs: KBDocument[];
  onOpen: (d: KBDocument) => void;
  onEdit: (d: KBDocument, e?: React.MouseEvent) => void;
}) {
  return (
    <div>
      {/* Column headers */}
      <div className="grid grid-cols-[1fr_140px_110px_90px_60px_40px] gap-3 px-5 py-2 border-b border-slate-100 bg-slate-50/80">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Document</span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Category</span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Last Updated</span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Status</span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Version</span>
        <span />
      </div>

      {/* Rows */}
      <div className="divide-y divide-slate-50">
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
      className="grid grid-cols-[1fr_140px_110px_90px_60px_40px] gap-3 items-center px-5 py-3 hover:bg-slate-50 cursor-pointer group transition-colors"
    >
      {/* Document name + description */}
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${catColor}18` }}
        >
          <FileText className="h-4 w-4" style={{ color: catColor }} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800 truncate group-hover:text-[#1e3a5f] transition-colors">
            {doc.title}
          </p>
          {doc.description && (
            <p className="text-xs text-slate-400 truncate">{doc.description}</p>
          )}
          {doc.tags && doc.tags.length > 0 && (
            <div className="flex items-center gap-1 mt-0.5">
              {doc.tags.slice(0, 3).map(t => (
                <span key={t.id} className="inline-flex items-center gap-0.5 text-[10px] text-slate-400 bg-slate-100 px-1.5 rounded">
                  <Tag className="h-2.5 w-2.5" />{t.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Category */}
      <div className="min-w-0">
        {doc.category ? (
          <span
            className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md truncate max-w-full"
            style={{ backgroundColor: `${doc.category.color}15`, color: doc.category.color }}
          >
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: doc.category.color }} />
            <span className="truncate">{doc.category.name}</span>
          </span>
        ) : (
          <span className="text-xs text-slate-300">—</span>
        )}
      </div>

      {/* Last updated */}
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        <Clock className="h-3.5 w-3.5 shrink-0" />
        {timeAgo(doc.updated_at)}
      </div>

      {/* Status */}
      <div>
        <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded border', STATUS_STYLE[doc.status])}>
          {STATUS_LABEL[doc.status]}
        </span>
      </div>

      {/* Version */}
      <div className="text-xs text-slate-400 font-mono">
        v{doc.version}
      </div>

      {/* Arrow */}
      <div className="flex items-center justify-end">
        <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-[#1e3a5f] transition-colors" />
      </div>
    </div>
  );
}

// ── Grid View ─────────────────────────────────────────────
function GridView({ docs, onOpen, onEdit }: {
  docs: KBDocument[];
  onOpen: (d: KBDocument) => void;
  onEdit: (d: KBDocument, e?: React.MouseEvent) => void;
}) {
  return (
    <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {docs.map(doc => {
        const catColor = doc.category?.color ?? '#94A3B8';
        return (
          <div
            key={doc.id}
            onClick={() => onOpen(doc)}
            className="bg-white border border-slate-100 rounded-xl p-4 hover:shadow-md hover:border-slate-200 cursor-pointer transition-all group flex flex-col gap-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div
                className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${catColor}18` }}
              >
                <FileText className="h-4.5 w-4.5" style={{ color: catColor }} />
              </div>
              <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0', STATUS_STYLE[doc.status])}>
                {STATUS_LABEL[doc.status]}
              </span>
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 line-clamp-2 group-hover:text-[#1e3a5f] transition-colors leading-snug">
                {doc.title}
              </p>
              {doc.description && (
                <p className="text-[12px] text-slate-400 line-clamp-2 mt-1 leading-relaxed">{doc.description}</p>
              )}
            </div>

            {doc.category && (
              <span
                className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-md self-start"
                style={{ backgroundColor: `${doc.category.color}15`, color: doc.category.color }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: doc.category.color }} />
                {doc.category.name}
              </span>
            )}

            {doc.tags && doc.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {doc.tags.slice(0, 3).map(t => (
                  <span key={t.id} className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                    #{t.name}
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-50">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />{timeAgo(doc.updated_at)}
              </span>
              <span className="flex items-center gap-1 font-mono">
                v{doc.version}
                <span className="mx-1">·</span>
                <Eye className="h-3 w-3" />{doc.view_count}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────
function EmptyState({ hasSearch, onNew }: { hasSearch: boolean; onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
        <BookOpen className="h-8 w-8 text-slate-300" />
      </div>
      {hasSearch ? (
        <>
          <p className="text-base font-semibold text-slate-600">No documents found</p>
          <p className="text-sm text-slate-400 mt-1">Try different keywords or clear the search</p>
        </>
      ) : (
        <>
          <p className="text-base font-semibold text-slate-600">No documents yet</p>
          <p className="text-sm text-slate-400 mt-1 mb-5">Create your first document to build the knowledge base</p>
          <button
            type="button"
            onClick={onNew}
            className="flex items-center gap-2 px-4 py-2 bg-[#1e3a5f] hover:bg-[#16304f] text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Document
          </button>
        </>
      )}
    </div>
  );
}
