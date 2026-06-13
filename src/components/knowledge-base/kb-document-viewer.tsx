'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Edit2, Clock, Eye, Tag, Globe, Building2, Lock,
  BookOpen, History, Share2, Printer, FileText, Archive,
  RotateCcw, ChevronRight, Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { KBDocumentModal } from './kb-document-modal';
import { KBVersionHistory } from './kb-version-history';
import { restoreKBDocument, publishKBDocument } from '@/lib/actions/knowledge';
import type { KBDocument, KBCategory, KBTag, KBVersion, KBDocStatus } from '@/types/app';

interface KBDocumentViewerProps {
  document: KBDocument;
  versions: KBVersion[];
  categories: KBCategory[];
  tags: KBTag[];
}

const STATUS_COLOR: Record<KBDocStatus, string> = {
  draft:     'bg-amber-50 text-amber-700 border-amber-200',
  published: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  archived:  'bg-slate-100 text-slate-500 border-slate-200',
};

const VISIBILITY_ICON: Record<string, React.ReactNode> = {
  org:        <Globe className="h-3 w-3" />,
  hospital:   <Building2 className="h-3 w-3" />,
  restricted: <Lock className="h-3 w-3" />,
};

const VISIBILITY_LABEL: Record<string, string> = {
  org:        'Organization',
  hospital:   'Hospital only',
  restricted: 'Restricted',
};

function timeAgo(iso: string): string {
  const secs = (Date.now() - new Date(iso).getTime()) / 1000;
  if (secs < 60)    return 'just now';
  if (secs < 3600)  return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function renderMarkdown(text: string): string {
  // Simple markdown-to-HTML renderer (no external deps)
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // headings
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-5 mb-2 text-slate-800">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold mt-6 mb-2 text-slate-800">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mt-6 mb-3 text-slate-900">$1</h1>')
    // bold / italic
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    // code blocks
    .replace(/```[\w]*\n([\s\S]*?)```/g, '<pre class="bg-slate-50 border border-slate-200 rounded-lg p-4 overflow-x-auto my-3 text-xs font-mono"><code>$1</code></pre>')
    .replace(/`(.+?)`/g, '<code class="bg-slate-100 text-slate-700 rounded px-1 py-0.5 text-xs font-mono">$1</code>')
    // blockquotes
    .replace(/^&gt; (.+)$/gm, '<blockquote class="border-l-4 border-indigo-200 pl-4 italic text-slate-500 my-2">$1</blockquote>')
    // unordered lists
    .replace(/^\s*[-*+] (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    // ordered lists
    .replace(/^\s*\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
    // horizontal rule
    .replace(/^---$/gm, '<hr class="border-slate-200 my-4" />')
    // links
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="text-indigo-600 underline hover:text-indigo-800" target="_blank" rel="noopener">$1</a>')
    // line breaks -> paragraphs
    .replace(/\n\n/g, '</p><p class="mb-3">')
    .replace(/\n/g, '<br />');
}

export function KBDocumentViewer({ document: doc, versions, categories, tags }: KBDocumentViewerProps) {
  const router = useRouter();
  const [currentDoc, setCurrentDoc] = useState<KBDocument>(doc);
  const [editOpen, setEditOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const handleRestore = async () => {
    setIsRestoring(true);
    const result = await restoreKBDocument(currentDoc.id);
    setIsRestoring(false);
    if (result.success) {
      setCurrentDoc(prev => ({ ...prev, status: 'draft', archived_at: null }));
      toast.success('Document restored to draft');
    } else {
      toast.error(result.error);
    }
  };

  const handlePublish = async () => {
    setIsPublishing(true);
    const result = await publishKBDocument(currentDoc.id);
    setIsPublishing(false);
    if (result.success) {
      setCurrentDoc(result.data);
      toast.success('Document published');
    } else {
      toast.error(result.error);
    }
  };

  const contentHtml = currentDoc.content
    ? `<p class="mb-3">${renderMarkdown(currentDoc.content)}</p>`
    : '<p class="text-slate-400 italic">No content yet.</p>';

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-slate-100 bg-white shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/knowledge-base')}
          className="gap-1.5 text-slate-500 hover:text-slate-800 -ml-1"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Button>

        <div className="flex items-center gap-1 text-[11px] text-slate-400">
          <span>Knowledge Base</span>
          <ChevronRight className="h-3 w-3" />
          {currentDoc.category && (
            <>
              <span style={{ color: currentDoc.category.color }}>{currentDoc.category.name}</span>
              <ChevronRight className="h-3 w-3" />
            </>
          )}
          <span className="text-slate-600 font-medium truncate max-w-[200px]">{currentDoc.title}</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Download PDF — always visible, opens print-ready page */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.open(`/api/v1/documents/pdf?id=${currentDoc.id}&print=1`, '_blank')}
            className="gap-1.5 text-xs text-blue-600 border-blue-200 hover:bg-blue-50"
          >
            <Download className="h-3.5 w-3.5" />
            Download PDF
          </Button>

          {currentDoc.status === 'archived' ? (
            <Button
              size="sm"
              variant="outline"
              onClick={handleRestore}
              disabled={isRestoring}
              className="gap-1.5 text-xs"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restore
            </Button>
          ) : (
            <>
              {currentDoc.status === 'draft' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handlePublish}
                  disabled={isPublishing}
                  className="gap-1.5 text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                >
                  Publish
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setHistoryOpen(true)}
                className="gap-1.5 text-xs"
              >
                <History className="h-3.5 w-3.5" />
                History
              </Button>
              <Button
                size="sm"
                onClick={() => setEditOpen(true)}
                className="gap-1.5 text-xs"
              >
                <Edit2 className="h-3.5 w-3.5" />
                Edit
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Document content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-8 py-8">
            {/* Meta */}
            <div className="flex flex-wrap items-center gap-2 mb-6">
              <span className={cn('text-xs px-2 py-0.5 rounded border font-medium', STATUS_COLOR[currentDoc.status])}>
                {currentDoc.status.charAt(0).toUpperCase() + currentDoc.status.slice(1)}
              </span>
              <span className="flex items-center gap-1 text-xs text-slate-500">
                {VISIBILITY_ICON[currentDoc.visibility]}
                {VISIBILITY_LABEL[currentDoc.visibility]}
              </span>
              {currentDoc.category && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full border font-medium"
                  style={{
                    backgroundColor: `${currentDoc.category.color}15`,
                    color: currentDoc.category.color,
                    borderColor: `${currentDoc.category.color}30`,
                  }}
                >
                  {currentDoc.category.name}
                </span>
              )}
            </div>

            <h1 className="text-2xl font-bold text-slate-900 mb-2 leading-tight">
              {currentDoc.title}
            </h1>
            {currentDoc.description && (
              <p className="text-base text-slate-500 mb-6 leading-relaxed">{currentDoc.description}</p>
            )}

            {/* Author / meta row */}
            <div className="flex items-center gap-4 py-3 border-y border-slate-100 mb-8 text-xs text-slate-500">
              {currentDoc.author && (
                <span className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[9px] font-bold">
                    {(currentDoc.author.first_name?.[0] ?? '') + (currentDoc.author.last_name?.[0] ?? '')}
                  </span>
                  {currentDoc.author.first_name} {currentDoc.author.last_name}
                  {currentDoc.author.job_title && <span className="text-slate-400">· {currentDoc.author.job_title}</span>}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Updated {timeAgo(currentDoc.updated_at)}
              </span>
              <span className="flex items-center gap-1">
                <Eye className="h-3 w-3" />
                {currentDoc.view_count} views
              </span>
              <span className="ml-auto">v{currentDoc.version}</span>
            </div>

            {/* Rendered content */}
            <div
              className="prose prose-slate max-w-none text-sm leading-relaxed text-slate-700"
              dangerouslySetInnerHTML={{ __html: contentHtml }}
            />

            {/* Tags */}
            {currentDoc.tags && currentDoc.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-10 pt-6 border-t border-slate-100">
                {currentDoc.tags.map(t => (
                  <span
                    key={t.id}
                    className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full"
                  >
                    <Tag className="h-2.5 w-2.5" />
                    {t.name}
                  </span>
                ))}
              </div>
            )}

            {/* Published info */}
            {currentDoc.status === 'published' && currentDoc.published_at && (
              <p className="text-[11px] text-slate-400 mt-6">
                Published {new Date(currentDoc.published_at).toLocaleDateString('en-US', { dateStyle: 'long' })}
              </p>
            )}
          </div>
        </div>

        {/* Right sidebar — version history panel (when open) */}
        {historyOpen && (
          <div className="w-72 shrink-0 border-l border-slate-100 overflow-y-auto bg-slate-50/50">
            <KBVersionHistory
              documentId={currentDoc.id}
              versions={versions}
              onRollback={(updated) => {
                setCurrentDoc(updated);
                setHistoryOpen(false);
                toast.success('Rolled back successfully');
              }}
              onClose={() => setHistoryOpen(false)}
            />
          </div>
        )}
      </div>

      {/* Edit modal */}
      <KBDocumentModal
        open={editOpen}
        onOpenChange={setEditOpen}
        document={currentDoc}
        categories={categories}
        tags={tags}
        onSaved={(saved) => { setCurrentDoc(saved); toast.success('Document updated'); }}
        onArchived={() => {
          setCurrentDoc(prev => ({ ...prev, status: 'archived' }));
          toast.success('Document archived');
        }}
      />
    </div>
  );
}
