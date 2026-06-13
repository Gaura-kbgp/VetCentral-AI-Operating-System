'use client';

import { useState, useRef } from 'react';
import {
  FileText, Film, ExternalLink, Plus, X, GripVertical,
  ChevronDown, ChevronUp, Clock, ArrowUp, ArrowDown,
  CheckCircle2, Image as ImageIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { RichContentEditor } from './rich-content-editor';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
export interface ContentModule {
  id: string;             // local uuid (stable React key)
  dbId?: string;          // set when the module already exists in DB
  title: string;
  content_type: 'article' | 'video' | 'pdf' | 'link';
  content: string;        // HTML for article
  content_url?: string;   // URL for video/pdf/link
  duration_mins: number;
  is_required: boolean;
}

const TYPE_META: Record<ContentModule['content_type'], {
  label: string; icon: React.ReactNode; chip: string; dot: string;
}> = {
  article: { label: 'Article', icon: <FileText className="h-3.5 w-3.5" />,     chip: 'bg-blue-50 text-blue-600 border-blue-100',       dot: 'bg-blue-400' },
  video:   { label: 'Video',   icon: <Film className="h-3.5 w-3.5" />,         chip: 'bg-red-50 text-red-600 border-red-100',          dot: 'bg-red-400' },
  pdf:     { label: 'PDF',     icon: <FileText className="h-3.5 w-3.5" />,     chip: 'bg-emerald-50 text-emerald-600 border-emerald-100', dot: 'bg-emerald-400' },
  link:    { label: 'Link',    icon: <ExternalLink className="h-3.5 w-3.5" />, chip: 'bg-purple-50 text-purple-600 border-purple-100', dot: 'bg-purple-400' },
};

function ytIdOf(url: string | undefined): string | null {
  if (!url) return null;
  return url.match(/(?:v=|youtu\.be\/|embed\/)([^&?/]+)/)?.[1] ?? null;
}

// ─────────────────────────────────────────────────────────────
// Single module card
// ─────────────────────────────────────────────────────────────
function ModuleCard({
  module, index, total, expanded, dragging,
  onToggle, onUpdate, onRemove, onMove,
  onDragStart, onDragOver, onDrop, onDragEnd,
}: {
  module: ContentModule;
  index: number;
  total: number;
  expanded: boolean;
  dragging: boolean;
  onToggle: () => void;
  onUpdate: (patch: Partial<ContentModule>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const meta = TYPE_META[module.content_type];
  const ytId = module.content_type === 'video' ? ytIdOf(module.content_url) : null;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={cn(
        'rounded-2xl border bg-white transition-all',
        dragging ? 'opacity-40 border-dashed border-orange-300' : 'border-slate-200 shadow-sm',
        expanded && !dragging && 'border-orange-200 ring-1 ring-orange-100',
      )}
    >
      {/* ── Header row ── */}
      <div className="flex items-center gap-2 px-3 py-3">
        {/* drag handle */}
        <span className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 shrink-0" title="Drag to reorder">
          <GripVertical className="h-4 w-4" />
        </span>

        {/* number */}
        <div className="h-7 w-7 rounded-lg bg-slate-100 flex items-center justify-center text-[11px] font-bold text-slate-500 shrink-0">
          {index + 1}
        </div>

        {/* type chip */}
        <span className={cn('flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-wide shrink-0', meta.chip)}>
          {meta.icon}{meta.label}
        </span>

        {/* title */}
        <input
          value={module.title}
          onChange={e => onUpdate({ title: e.target.value })}
          onClick={e => e.stopPropagation()}
          placeholder="Module title…"
          className="flex-1 min-w-0 text-[14px] font-semibold text-slate-800 bg-transparent focus:outline-none placeholder:text-slate-300"
        />

        {/* duration */}
        <div className="flex items-center gap-1 shrink-0 bg-slate-50 rounded-lg px-2 py-1 border border-slate-100">
          <Clock className="h-3 w-3 text-slate-400" />
          <input
            type="number"
            min={0}
            value={module.duration_mins || ''}
            onChange={e => onUpdate({ duration_mins: parseInt(e.target.value) || 0 })}
            onClick={e => e.stopPropagation()}
            placeholder="0"
            className="w-10 text-[12px] font-medium text-slate-600 bg-transparent focus:outline-none text-center"
          />
          <span className="text-[10px] text-slate-400">min</span>
        </div>

        {/* up / down */}
        <div className="flex flex-col shrink-0">
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0}
            className="h-4 w-6 flex items-center justify-center text-slate-300 hover:text-orange-500 disabled:opacity-20 transition-colors">
            <ArrowUp className="h-3 w-3" />
          </button>
          <button type="button" onClick={() => onMove(1)} disabled={index === total - 1}
            className="h-4 w-6 flex items-center justify-center text-slate-300 hover:text-orange-500 disabled:opacity-20 transition-colors">
            <ArrowDown className="h-3 w-3" />
          </button>
        </div>

        {/* expand / delete */}
        <button type="button" onClick={onToggle}
          className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 transition-colors shrink-0">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <button type="button" onClick={onRemove}
          className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors shrink-0">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* collapsed summary */}
      {!expanded && (
        <div className="px-12 pb-3 -mt-1">
          <p className="text-[11px] text-slate-400 truncate">
            {module.content_type === 'article'
              ? (module.content ? `${module.content.replace(/<[^>]+>/g, ' ').trim().slice(0, 90)}…` : 'No content yet — click to edit')
              : (module.content_url || 'No URL yet — click to edit')}
          </p>
        </div>
      )}

      {/* ── Expanded editor ── */}
      {expanded && (
        <div className="border-t border-slate-100 p-4 space-y-3 bg-slate-50/50 rounded-b-2xl">
          {module.content_type === 'article' && (
            <RichContentEditor
              value={module.content}
              onChange={html => onUpdate({ content: html })}
              placeholder="Write the lesson content — add photos, videos and PDF references from the toolbar…"
              minHeight={220}
            />
          )}

          {module.content_type !== 'article' && (
            <div className="space-y-3">
              <input
                value={module.content_url ?? ''}
                onChange={e => onUpdate({ content_url: e.target.value })}
                placeholder={
                  module.content_type === 'video' ? 'https://youtube.com/watch?v=…  (YouTube, Vimeo or direct video URL)' :
                  module.content_type === 'pdf'   ? 'https://…  (PDF file URL)' :
                  'https://…  (external course / resource URL)'
                }
                className="w-full h-11 px-4 rounded-xl border border-slate-200 text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
              {ytId && (
                <div className="aspect-video max-w-md rounded-xl overflow-hidden bg-black shadow">
                  <iframe src={`https://www.youtube.com/embed/${ytId}`} className="w-full h-full" allowFullScreen title={module.title} />
                </div>
              )}
            </div>
          )}

          {/* required toggle */}
          <label className="flex items-center gap-2 cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={module.is_required}
              onChange={e => onUpdate({ is_required: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-400"
            />
            <span className="text-[12px] text-slate-600">Required to complete the course</span>
          </label>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Module Content Builder
// ─────────────────────────────────────────────────────────────
interface ModuleBuilderProps {
  modules: ContentModule[];
  onChange: (modules: ContentModule[]) => void;
  loading?: boolean;
}

export function ModuleContentBuilder({ modules, onChange, loading }: ModuleBuilderProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const dragIndex = useRef<number | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const totalMins = modules.reduce((s, m) => s + (m.duration_mins || 0), 0);

  const addModule = (type: ContentModule['content_type']) => {
    const id = crypto.randomUUID();
    onChange([...modules, {
      id,
      title: '',
      content_type: type,
      content: '',
      content_url: '',
      duration_mins: type === 'video' ? 10 : 5,
      is_required: true,
    }]);
    setExpandedId(id);
    setShowTypePicker(false);
  };

  const update = (id: string, patch: Partial<ContentModule>) =>
    onChange(modules.map(m => m.id === id ? { ...m, ...patch } : m));

  const remove = (id: string) => {
    onChange(modules.filter(m => m.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const move = (index: number, dir: -1 | 1) => {
    const to = index + dir;
    if (to < 0 || to >= modules.length) return;
    const next = [...modules];
    [next[index], next[to]] = [next[to], next[index]];
    onChange(next);
  };

  const handleDrop = (targetIndex: number) => {
    const from = dragIndex.current;
    if (from === null || from === targetIndex) return;
    const next = [...modules];
    const [moved] = next.splice(from, 1);
    next.splice(targetIndex, 0, moved);
    onChange(next);
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1].map(i => <div key={i} className="h-14 rounded-2xl bg-slate-100 animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* summary bar */}
      {modules.length > 0 && (
        <div className="flex items-center gap-4 px-1">
          <span className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-600">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            {modules.length} module{modules.length !== 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-1.5 text-[12px] text-slate-400">
            <Clock className="h-3.5 w-3.5" />
            {totalMins >= 60 ? `${Math.floor(totalMins / 60)}h ${totalMins % 60}m` : `${totalMins}m`} total
          </span>
          <span className="text-[11px] text-slate-300 ml-auto">drag cards or use arrows to reorder</span>
        </div>
      )}

      {/* module cards */}
      <div className="space-y-2">
        {modules.map((m, i) => (
          <ModuleCard
            key={m.id}
            module={m}
            index={i}
            total={modules.length}
            expanded={expandedId === m.id}
            dragging={draggingId === m.id}
            onToggle={() => setExpandedId(expandedId === m.id ? null : m.id)}
            onUpdate={patch => update(m.id, patch)}
            onRemove={() => remove(m.id)}
            onMove={dir => move(i, dir)}
            onDragStart={e => { dragIndex.current = i; setDraggingId(m.id); e.dataTransfer.effectAllowed = 'move'; }}
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
            onDrop={e => { e.preventDefault(); handleDrop(i); }}
            onDragEnd={() => { dragIndex.current = null; setDraggingId(null); }}
          />
        ))}
      </div>

      {/* empty state */}
      {modules.length === 0 && !showTypePicker && (
        <div className="flex flex-col items-center gap-2 py-8 border-2 border-dashed border-slate-200 rounded-2xl">
          <ImageIcon className="h-8 w-8 text-slate-200" />
          <p className="text-[13px] text-slate-400">No modules yet — build your course curriculum below</p>
        </div>
      )}

      {/* add module */}
      {showTypePicker ? (
        <div className="p-4 rounded-2xl border-2 border-orange-200 bg-orange-50/50 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-bold text-slate-600 uppercase tracking-wider">Choose module type</p>
            <button type="button" onClick={() => setShowTypePicker(false)} className="h-6 w-6 flex items-center justify-center rounded-lg hover:bg-white text-slate-400">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(Object.keys(TYPE_META) as Array<ContentModule['content_type']>).map(type => {
              const meta = TYPE_META[type];
              const desc = type === 'article' ? 'Rich text, photos, embeds' :
                           type === 'video'   ? 'YouTube, Vimeo or URL' :
                           type === 'pdf'     ? 'Reference document' : 'External resource';
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => addModule(type)}
                  className="flex flex-col items-start gap-1.5 p-3 rounded-xl border border-slate-200 bg-white hover:border-orange-300 hover:shadow-sm transition-all text-left"
                >
                  <span className={cn('flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] font-bold uppercase', meta.chip)}>
                    {meta.icon}{meta.label}
                  </span>
                  <span className="text-[11px] text-slate-400 leading-tight">{desc}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowTypePicker(true)}
          className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl border-2 border-dashed border-slate-300 text-slate-500 hover:border-orange-400 hover:text-orange-600 hover:bg-orange-50/50 text-[13px] font-semibold transition-all"
        >
          <Plus className="h-4 w-4" /> Add Module
        </button>
      )}
    </div>
  );
}
