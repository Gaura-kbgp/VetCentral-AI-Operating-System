'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  X, Upload, FileText, FileSpreadsheet, Image as ImageIcon,
  CheckCircle2, AlertCircle, Loader2, BookOpen, MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────

export type UploadMode = 'chat' | 'kb';

export interface AttachmentResult {
  mode: 'chat';
  text: string;
  file_name: string;
  file_type: string;
  file_size: number;
}

type ZoneStatus = 'idle' | 'selected' | 'uploading' | 'done' | 'error';

interface FileAttachmentZoneProps {
  isOpen: boolean;
  onClose: () => void;
  onAttach: (result: AttachmentResult) => void;
  onKBUploadComplete: (fileName: string, chunks: number) => void;
  selectedHospitalId: string | null;
  initialFile?: File | null;
}

// ── Constants ────────────────────────────────────────────────────

const ACCEPT = '.pdf,.docx,.txt,.csv,.xlsx,.png,.jpg,.jpeg,.webp,.gif';
const MAX_MB = 15;
const MAX_BYTES = MAX_MB * 1024 * 1024;

function fileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext))
    return <ImageIcon className="h-5 w-5 text-violet-400" />;
  if (['xlsx', 'csv'].includes(ext))
    return <FileSpreadsheet className="h-5 w-5 text-emerald-400" />;
  return <FileText className="h-5 w-5 text-violet-400" />;
}

function formatSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Component ─────────────────────────────────────────────────────

export function FileAttachmentZone({
  isOpen,
  onClose,
  onAttach,
  onKBUploadComplete,
  selectedHospitalId,
  initialFile,
}: FileAttachmentZoneProps) {
  const [status, setStatus]       = useState<ZoneStatus>('idle');
  const [selectedFile, setFile]   = useState<File | null>(null);
  const [mode, setMode]           = useState<UploadMode>('chat');
  const [isDragOver, setDragOver] = useState(false);
  const [progress, setProgress]   = useState(0);
  const [progressLabel, setLabel] = useState('');
  const [errorMsg, setError]      = useState('');
  const [doneResult, setResult]   = useState<AttachmentResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setStatus('idle');
      setFile(null);
      setMode('chat');
      setDragOver(false);
      setProgress(0);
      setLabel('');
      setError('');
      setResult(null);
    }
  }, [isOpen]);

  // Pre-load an initial file (from drag-drop on the chat area)
  useEffect(() => {
    if (isOpen && initialFile) {
      handleFileSelected(initialFile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialFile]);

  const handleFileSelected = useCallback((file: File) => {
    if (file.size > MAX_BYTES) {
      setError(`File too large (max ${MAX_MB} MB)`);
      setStatus('error');
      return;
    }
    setFile(file);
    setStatus('selected');
    setError('');
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelected(file);
  }, [handleFileSelected]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const simulateProgress = useCallback((
    stages: Array<{ label: string; target: number; delay: number }>,
  ) => {
    let i = 0;
    const run = () => {
      if (i >= stages.length) return;
      const { label, target, delay } = stages[i++];
      setLabel(label);
      const tick = () => {
        setProgress(p => {
          if (p >= target) { setTimeout(run, 200); return p; }
          setTimeout(tick, delay);
          return Math.min(p + 2, target);
        });
      };
      tick();
    };
    run();
  }, []);

  const handleAttach = useCallback(async () => {
    if (!selectedFile || status === 'uploading') return;

    setStatus('uploading');
    setProgress(0);

    if (mode === 'chat') {
      simulateProgress([
        { label: 'Uploading…',        target: 30, delay: 30 },
        { label: 'Extracting text…',  target: 80, delay: 25 },
        { label: 'Almost ready…',     target: 95, delay: 40 },
      ]);

      const form = new FormData();
      form.append('file', selectedFile);

      try {
        const res  = await fetch('/api/v1/ai/attach', { method: 'POST', body: form });
        const data = await res.json();

        if (!res.ok) {
          setError(data.error ?? 'Failed to process file');
          setStatus('error');
          return;
        }

        setProgress(100);
        setLabel('Ready');
        const result: AttachmentResult = {
          mode: 'chat',
          text:      data.text,
          file_name: data.file_name,
          file_type: data.file_type,
          file_size: data.file_size,
        };
        setResult(result);
        setStatus('done');
      } catch {
        setError('Network error. Please try again.');
        setStatus('error');
      }
    } else {
      // Mode 2: Save to Knowledge Base
      simulateProgress([
        { label: 'Uploading…',           target: 25, delay: 30 },
        { label: 'Extracting text…',     target: 50, delay: 25 },
        { label: 'Generating embeddings…', target: 80, delay: 20 },
        { label: 'Indexing…',            target: 95, delay: 40 },
      ]);

      const form = new FormData();
      form.append('file', selectedFile);
      if (selectedHospitalId) form.append('hospital_id', selectedHospitalId);

      try {
        const res  = await fetch('/api/v1/ai/upload', { method: 'POST', body: form });
        const data = await res.json();

        if (!res.ok) {
          setError(data.error ?? 'Failed to index file');
          setStatus('error');
          return;
        }

        setProgress(100);
        setLabel('Indexed');
        setStatus('done');
        onKBUploadComplete(selectedFile.name, data.upload?.chunk_count ?? 0);
      } catch {
        setError('Network error. Please try again.');
        setStatus('error');
      }
    }
  }, [selectedFile, status, mode, selectedHospitalId, simulateProgress, onKBUploadComplete]);

  const handleConfirm = useCallback(() => {
    if (mode === 'chat' && doneResult) {
      onAttach(doneResult);
    }
    onClose();
  }, [mode, doneResult, onAttach, onClose]);

  if (!isOpen) return null;

  const isProcessing = status === 'uploading';
  const isDone       = status === 'done';
  const isError      = status === 'error';

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Panel */}
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Attach File</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">Add a file for the AI to read and answer questions about</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 rounded-full p-1 hover:bg-slate-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Drop Zone */}
          {(status === 'idle' || status === 'error') && (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
                isDragOver
                  ? 'border-violet-400 bg-violet-50'
                  : 'border-slate-200 hover:border-violet-300 hover:bg-violet-50/40',
              )}
            >
              <div className="h-12 w-12 rounded-xl bg-violet-100 flex items-center justify-center mx-auto mb-3">
                <Upload className="h-6 w-6 text-violet-500" />
              </div>
              <p className="text-sm font-medium text-slate-700 mb-1">
                {isDragOver ? 'Drop file here' : 'Drop file here or click to browse'}
              </p>
              <p className="text-[11px] text-slate-400">
                PDF, DOCX, TXT, CSV, XLSX, PNG, JPG, WEBP — max {MAX_MB} MB
              </p>
              {isError && (
                <p className="mt-2 text-xs text-red-500 flex items-center justify-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {errorMsg}
                </p>
              )}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) handleFileSelected(f);
              e.target.value = '';
            }}
          />

          {/* File preview */}
          {selectedFile && status !== 'idle' && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              {/* File info row */}
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0">
                  {fileIcon(selectedFile.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{selectedFile.name}</p>
                  <p className="text-[11px] text-slate-400">{formatSize(selectedFile.size)}</p>
                </div>
                {!isProcessing && !isDone && (
                  <button
                    onClick={() => { setFile(null); setStatus('idle'); setError(''); }}
                    className="text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                {isDone && (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                )}
              </div>

              {/* Progress bar */}
              {(isProcessing || isDone) && (
                <div className="space-y-1.5">
                  <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-300',
                        isDone ? 'bg-emerald-500' : 'bg-violet-500',
                      )}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 flex items-center gap-1">
                    {isProcessing && <Loader2 className="h-3 w-3 animate-spin" />}
                    {progressLabel}
                    {isProcessing && ` (${progress}%)`}
                  </p>
                </div>
              )}

              {/* Error */}
              {isError && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {errorMsg}
                </p>
              )}
            </div>
          )}

          {/* Mode selector — shown when file selected and not yet uploading */}
          {selectedFile && (status === 'selected' || isDone) && !isProcessing && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-600">How would you like to use this file?</p>
              <div className="grid grid-cols-2 gap-2">
                {/* Mode 1: Chat only */}
                <button
                  onClick={() => setMode('chat')}
                  disabled={isDone && mode !== 'chat'}
                  className={cn(
                    'flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-colors',
                    mode === 'chat'
                      ? 'border-violet-400 bg-violet-50 ring-1 ring-violet-400'
                      : 'border-slate-200 hover:border-violet-200 hover:bg-violet-50/30',
                    isDone && mode !== 'chat' && 'opacity-40 cursor-not-allowed',
                  )}
                >
                  <div className={cn(
                    'h-7 w-7 rounded-lg flex items-center justify-center',
                    mode === 'chat' ? 'bg-violet-100' : 'bg-slate-100',
                  )}>
                    <MessageSquare className={cn('h-3.5 w-3.5', mode === 'chat' ? 'text-violet-600' : 'text-slate-400')} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-800">Chat only</p>
                    <p className="text-[10px] text-slate-400 leading-tight">Temporary · AI reads it now</p>
                  </div>
                </button>

                {/* Mode 2: Knowledge Base */}
                <button
                  onClick={() => setMode('kb')}
                  disabled={isDone && mode !== 'kb'}
                  className={cn(
                    'flex flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-colors',
                    mode === 'kb'
                      ? 'border-violet-400 bg-violet-50 ring-1 ring-violet-400'
                      : 'border-slate-200 hover:border-violet-200 hover:bg-violet-50/30',
                    isDone && mode !== 'kb' && 'opacity-40 cursor-not-allowed',
                  )}
                >
                  <div className={cn(
                    'h-7 w-7 rounded-lg flex items-center justify-center',
                    mode === 'kb' ? 'bg-violet-100' : 'bg-slate-100',
                  )}>
                    <BookOpen className={cn('h-3.5 w-3.5', mode === 'kb' ? 'text-violet-600' : 'text-slate-400')} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-800">Save to Knowledge Base</p>
                    <p className="text-[10px] text-slate-400 leading-tight">Permanent · Indexed for all</p>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50/60">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-200 transition-colors"
          >
            Cancel
          </button>

          {!isDone ? (
            <button
              onClick={handleAttach}
              disabled={!selectedFile || isProcessing || isError}
              className={cn(
                'px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors',
                !selectedFile || isProcessing || isError
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-violet-600 hover:bg-violet-700 text-white',
              )}
            >
              {isProcessing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isProcessing ? 'Processing…' : mode === 'chat' ? 'Process File' : 'Upload to KB'}
            </button>
          ) : (
            <button
              onClick={handleConfirm}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 transition-colors"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {mode === 'chat' ? 'Attach to Chat' : 'Done'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
