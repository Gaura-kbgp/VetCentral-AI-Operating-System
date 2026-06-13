'use client';

import React, { useState, useEffect, useTransition, useRef } from 'react';
import { X, Tag, Loader2, Archive, Globe, Building2, Lock, Upload, FileText, FileSpreadsheet, File, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { createKBDocument, updateKBDocument, archiveKBDocument, getOrCreateKBTag, saveKBAttachment } from '@/lib/actions/knowledge';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { KBDocument, KBCategory, KBTag, KBDocStatus, KBVisibility } from '@/types/app';

interface KBDocumentModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  document: KBDocument | null;
  categories: KBCategory[];
  tags: KBTag[];
  onSaved: (doc: KBDocument) => void;
  onArchived: (id: string) => void;
}

const VISIBILITY_OPTIONS: { value: KBVisibility; label: string; icon: React.ReactNode }[] = [
  { value: 'org',        label: 'Entire Organization', icon: <Globe className="h-3.5 w-3.5" /> },
  { value: 'hospital',   label: 'Hospital Only',        icon: <Building2 className="h-3.5 w-3.5" /> },
  { value: 'restricted', label: 'Restricted Access',    icon: <Lock className="h-3.5 w-3.5" /> },
];

export function KBDocumentModal({
  open, onOpenChange, document, categories, tags: allTags,
  onSaved, onArchived,
}: KBDocumentModalProps) {
  const isEdit = !!document;

  const [title, setTitle]               = useState('');
  const [description, setDescription]   = useState('');
  const [content, setContent]           = useState('');
  const [categoryId, setCategoryId]     = useState<string | null>(null);
  const [status, setStatus]             = useState<KBDocStatus>('draft');
  const [visibility, setVisibility]     = useState<KBVisibility>('org');
  const [selectedTags, setSelectedTags] = useState<KBTag[]>([]);
  const [tagInput, setTagInput]         = useState('');
  const [changeSummary, setChangeSummary] = useState('');
  const [isPending, startTransition]    = useTransition();
  const [isArchiving, startArchive]     = useTransition();
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver]     = useState(false);
  const fileInputRef                    = useRef<HTMLInputElement>(null);

  const ACCEPTED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx'];

  function getFileIcon(type: string) {
    if (type.includes('pdf'))                                     return <FileText className="h-3.5 w-3.5 text-red-500 shrink-0" />;
    if (type.includes('word') || type.includes('msword'))         return <FileText className="h-3.5 w-3.5 text-blue-500 shrink-0" />;
    if (type.includes('sheet') || type.includes('excel'))         return <FileSpreadsheet className="h-3.5 w-3.5 text-green-600 shrink-0" />;
    return <File className="h-3.5 w-3.5 text-slate-400 shrink-0" />;
  }

  function formatFileSize(bytes: number) {
    if (bytes < 1024)            return `${bytes} B`;
    if (bytes < 1024 * 1024)     return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function handleFileSelect(files: FileList | null) {
    if (!files) return;
    const valid = Array.from(files).filter(f => {
      const ext = '.' + f.name.split('.').pop()?.toLowerCase();
      return ACCEPTED_EXTENSIONS.includes(ext);
    });
    const invalid = files.length - valid.length;
    if (invalid > 0) toast.warning(`${invalid} file(s) skipped — only PDF, Word, and Excel files are allowed`);
    setPendingFiles(prev => [...prev, ...valid]);
  }

  function removePendingFile(index: number) {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  }

  useEffect(() => {
    if (open) {
      if (document) {
        setTitle(document.title);
        setDescription(document.description ?? '');
        setContent(document.content ?? '');
        setCategoryId(document.category_id);
        setStatus(document.status);
        setVisibility(document.visibility);
        setSelectedTags(document.tags ?? []);
        setChangeSummary('');
      } else {
        setTitle('');
        setDescription('');
        setContent('');
        setCategoryId(null);
        setStatus('draft');
        setVisibility('org');
        setSelectedTags([]);
        setTagInput('');
        setChangeSummary('');
        setPendingFiles([]);
      }
    }
  }, [open, document]);

  const addTag = async (name: string) => {
    const n = name.trim();
    if (!n || selectedTags.some(t => t.name.toLowerCase() === n.toLowerCase())) return;
    const result = await getOrCreateKBTag(n);
    if (result.success) {
      setSelectedTags(prev => [...prev, result.data]);
    }
    setTagInput('');
  };

  const removeTag = (id: string) => setSelectedTags(prev => prev.filter(t => t.id !== id));

  const handleSuggestTag = (tag: KBTag) => {
    if (!selectedTags.some(t => t.id === tag.id)) {
      setSelectedTags(prev => [...prev, tag]);
    }
    setTagInput('');
  };

  const suggestedTags = allTags.filter(
    t => tagInput.trim() &&
         t.name.toLowerCase().includes(tagInput.toLowerCase()) &&
         !selectedTags.some(s => s.id === t.id)
  );

  const handleSubmit = (publishNow = false) => {
    if (!title.trim()) { toast.error('Title is required'); return; }

    startTransition(async () => {
      const finalStatus: KBDocStatus = publishNow ? 'published' : status;
      const input = {
        title: title.trim(),
        description: description.trim() || null,
        content,
        category_id: categoryId,
        status: finalStatus,
        visibility,
        tag_ids: selectedTags.map(t => t.id),
        change_summary: changeSummary.trim() || undefined,
      };

      const result = isEdit
        ? await updateKBDocument(document!.id, input)
        : await createKBDocument(input);

      if (!result.success) { toast.error(result.error); return; }

      // Upload any staged files to Supabase Storage
      if (pendingFiles.length > 0) {
        const supabase = createSupabaseBrowserClient();
        const docId = result.data.id;
        let uploadedCount = 0;

        for (const file of pendingFiles) {
          const storagePath = `kb/${docId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
          const { error: uploadError } = await supabase.storage
            .from('knowledge-base')
            .upload(storagePath, file, { upsert: false });

          if (uploadError) {
            toast.error(`Failed to upload "${file.name}": ${uploadError.message}`);
            continue;
          }

          const attResult = await saveKBAttachment(docId, {
            file_name: file.name,
            file_type: file.type || 'application/octet-stream',
            file_size: file.size,
            storage_path: storagePath,
          });

          if (attResult.success) {
            uploadedCount++;
          } else {
            toast.error(`Saved doc but could not record attachment "${file.name}"`);
          }
        }

        if (uploadedCount > 0) {
          toast.success(`${uploadedCount} file${uploadedCount > 1 ? 's' : ''} attached`);
        }
      }

      onSaved(result.data);
      onOpenChange(false);
    });
  };

  const handleArchive = () => {
    if (!document) return;
    startArchive(async () => {
      const result = await archiveKBDocument(document.id);
      if (result.success) {
        onArchived(document.id);
        onOpenChange(false);
      } else {
        toast.error(result.error);
      }
    });
  };

  const charCount = content.length;
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-slate-100 shrink-0">
          <DialogTitle>{isEdit ? 'Edit Document' : 'New Document'}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Title */}
          <div className="space-y-1">
            <Label htmlFor="kb-title" className="text-xs font-medium text-slate-600">
              Title <span className="text-red-400">*</span>
            </Label>
            <Input
              id="kb-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Document title…"
              className="text-base font-semibold"
            />
          </div>

          {/* Description */}
          <div className="space-y-1">
            <Label htmlFor="kb-desc" className="text-xs font-medium text-slate-600">
              Short Description
            </Label>
            <Input
              id="kb-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Brief summary shown in listings…"
            />
          </div>

          {/* Category — visual pill grid */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Category</Label>
            {categories.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Loading categories…</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {/* None option */}
                <button
                  type="button"
                  onClick={() => setCategoryId(null)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[12px] font-semibold transition-all',
                    categoryId === null
                      ? 'bg-slate-700 text-white border-slate-700 shadow-sm'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700'
                  )}
                >
                  {categoryId === null && <CheckCircle2 className="h-3 w-3 text-white/80" />}
                  None
                </button>

                {categories.map(cat => {
                  const isSelected = categoryId === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategoryId(cat.id)}
                      className={cn(
                        'flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[12px] font-semibold transition-all',
                        isSelected
                          ? 'text-white border-transparent shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                      )}
                      style={isSelected ? { backgroundColor: cat.color, borderColor: cat.color } : {}}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: isSelected ? 'rgba(255,255,255,0.7)' : cat.color }}
                      />
                      {isSelected && <CheckCircle2 className="h-3 w-3 text-white/80" />}
                      {cat.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Status + Visibility row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Status</Label>
              <div className="flex gap-2">
                {(['draft', 'published'] as KBDocStatus[]).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={cn(
                      'flex-1 py-2 rounded-xl border text-[12px] font-semibold transition-all capitalize',
                      status === s
                        ? s === 'published'
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                          : 'bg-amber-500 text-white border-amber-500 shadow-sm'
                        : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700'
                    )}
                  >
                    {s === 'published' ? '✓ Published' : '✎ Draft'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Visibility</Label>
              <div className="flex gap-2">
                {VISIBILITY_OPTIONS.map(o => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setVisibility(o.value)}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border text-[11px] font-semibold transition-all',
                      visibility === o.value
                        ? 'bg-[#1e3a5f] text-white border-[#1e3a5f] shadow-sm'
                        : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700'
                    )}
                  >
                    {o.icon}{o.label.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-1">
            <Label className="text-xs font-medium text-slate-600">Tags</Label>
            <div className="flex flex-wrap gap-1.5 min-h-8 rounded-lg border border-input bg-transparent px-2 py-1.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
              {selectedTags.map(t => (
                <span
                  key={t.id}
                  className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 rounded px-1.5 py-0.5"
                >
                  <Tag className="h-2.5 w-2.5" />
                  {t.name}
                  <button onClick={() => removeTag(t.id)} className="hover:text-red-500 ml-0.5">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
              <input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput); }
                  if (e.key === 'Backspace' && !tagInput && selectedTags.length) {
                    removeTag(selectedTags[selectedTags.length - 1]!.id);
                  }
                }}
                placeholder={selectedTags.length === 0 ? 'Add tags (Enter or comma)…' : ''}
                className="flex-1 min-w-30 text-xs bg-transparent outline-none placeholder:text-muted-foreground"
              />
            </div>
            {suggestedTags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {suggestedTags.slice(0, 8).map(t => (
                  <button
                    key={t.id}
                    onClick={() => handleSuggestTag(t)}
                    className="text-[10px] bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 px-1.5 py-0.5 rounded border border-transparent hover:border-indigo-100 transition-colors"
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Attachments */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">Attachments</Label>
            <div
              className={cn(
                'border-2 border-dashed rounded-lg px-4 py-5 text-center cursor-pointer transition-colors select-none',
                isDragOver
                  ? 'border-indigo-400 bg-indigo-50'
                  : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
              )}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={e => {
                e.preventDefault();
                setIsDragOver(false);
                handleFileSelect(e.dataTransfer.files);
              }}
            >
              <Upload className="h-5 w-5 text-slate-400 mx-auto mb-1.5" />
              <p className="text-xs text-slate-500">
                Drop files here or{' '}
                <span className="text-indigo-600 font-medium">click to browse</span>
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                PDF, Word (.doc .docx), Excel (.xls .xlsx)
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.xls,.xlsx"
                className="hidden"
                onChange={e => { handleFileSelect(e.target.files); e.target.value = ''; }}
              />
            </div>

            {pendingFiles.length > 0 && (
              <div className="space-y-1 mt-1">
                {pendingFiles.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 text-xs bg-white border border-slate-200 rounded-md px-2.5 py-1.5"
                  >
                    {getFileIcon(file.type)}
                    <span className="flex-1 truncate text-slate-700">{file.name}</span>
                    <span className="text-slate-400 shrink-0">{formatFileSize(file.size)}</span>
                    <button
                      type="button"
                      onClick={() => removePendingFile(idx)}
                      className="text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Content */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label htmlFor="kb-content" className="text-xs font-medium text-slate-600">Content</Label>
              <span className="text-[10px] text-slate-400">{wordCount} words · {charCount} chars</span>
            </div>
            <Textarea
              id="kb-content"
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Write your document content here. Markdown is supported…"
              className="min-h-70 font-mono text-xs resize-none"
            />
          </div>

          {/* Change summary (edit only) */}
          {isEdit && (
            <div className="space-y-1">
              <Label htmlFor="kb-summary" className="text-xs font-medium text-slate-600">Change Summary</Label>
              <Input
                id="kb-summary"
                value={changeSummary}
                onChange={e => setChangeSummary(e.target.value)}
                placeholder="What changed? (saved with version history)"
                className="text-xs"
              />
            </div>
          )}
        </div>

        <DialogFooter className="px-5 py-3 border-t border-slate-100 shrink-0 flex items-center justify-between gap-2 bg-transparent mx-0 mb-0 rounded-none">
          <div className="flex items-center gap-2">
            {isEdit && document?.status !== 'archived' && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleArchive}
                disabled={isArchiving || isPending}
                className="text-slate-500 hover:text-red-600 hover:border-red-200 gap-1.5"
              >
                {isArchiving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
                Archive
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            {status !== 'published' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSubmit(false)}
                disabled={isPending}
              >
                {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                Save Draft
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => handleSubmit(status !== 'published')}
              disabled={isPending}
              className="gap-1.5"
            >
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {status === 'published' ? (isEdit ? 'Save Changes' : 'Publish') : 'Publish'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
