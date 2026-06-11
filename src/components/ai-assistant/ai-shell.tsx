'use client';

import React, {
  useState, useRef, useEffect, useCallback, useTransition,
} from 'react';
import {
  Sparkles, Send, Plus, Trash2, Upload, FileText, X,
  ChevronRight, BookOpen, Loader2, AlertCircle,
  CheckCircle2, MessageSquare, Building2, Paperclip,
  FileUp, Clock, ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { FileAttachmentZone, type AttachmentResult } from './file-attachment-zone';

// ── Types ──────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  isStreaming?: boolean;
  createdAt: string;
}

interface Source {
  title: string;
  similarity: number;
  source_type?: string;
}

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  hospital_id: string | null;
}

interface Hospital {
  id: string;
  name: string;
  color: string;
}

interface UploadRecord {
  id: string;
  file_name: string;
  file_type: string;
  status: 'processing' | 'indexed' | 'failed';
  chunk_count: number;
  created_at: string;
}

interface AIShellProps {
  userId: string;
  orgId: string;
  hospitals: Hospital[];
  userName: string;
}

// ── Suggestions ────────────────────────────────────────────────

const SUGGESTIONS = [
  { text: 'How do I run a CBC test?' },
  { text: 'Show me the vaccination schedule' },
  { text: 'What are the OSHA requirements?' },
  { text: 'Find the employee handbook' },
  { text: 'Emergency procedures for critical care' },
  { text: 'How to operate the X-ray machine?' },
];

// ── Markdown renderer ──────────────────────────────────────────

function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-semibold mt-4 mb-1 text-slate-800">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-bold mt-5 mb-2 text-slate-900">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-lg font-bold mt-5 mb-2 text-slate-900">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="bg-slate-100 text-violet-700 rounded px-1 py-0.5 text-xs font-mono">$1</code>')
    .replace(/```[\w]*\n([\s\S]*?)```/g, '<pre class="bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-x-auto my-2 text-xs font-mono whitespace-pre-wrap"><code>$1</code></pre>')
    .replace(/^\s*[-*+] (.+)$/gm, '<li class="ml-4 list-disc mb-0.5">$1</li>')
    .replace(/^\s*\d+\. (.+)$/gm, '<li class="ml-4 list-decimal mb-0.5">$1</li>')
    .replace(/(<li.*<\/li>\n?)+/g, (m) => `<ul class="my-2 space-y-0.5">${m}</ul>`)
    .replace(/\n\n/g, '</p><p class="mb-2">')
    .replace(/\n/g, '<br />');
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileTypeLabel(ext: string): string {
  const map: Record<string, string> = {
    pdf: 'PDF', docx: 'DOCX', txt: 'TXT', csv: 'CSV',
    xlsx: 'XLSX', png: 'PNG', jpg: 'JPG', jpeg: 'JPG', webp: 'WEBP', gif: 'GIF',
  };
  return map[ext.toLowerCase()] ?? ext.toUpperCase();
}

// ── Main Shell ─────────────────────────────────────────────────

export function AIShell({ hospitals, userName }: AIShellProps) {
  const [messages, setMessages]               = useState<ChatMessage[]>([]);
  const [conversations, setConversations]     = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming]         = useState(false);
  const [input, setInput]                     = useState('');
  const [selectedHospitalId, setSelectedHospitalId] = useState<string | null>(
    hospitals[0]?.id ?? null,
  );
  const [uploads, setUploads]                 = useState<UploadRecord[]>([]);
  const [loadingConv, setLoadingConv]         = useState(false);
  const [historyOpen, setHistoryOpen]         = useState(false);
  const [uploadsOpen, setUploadsOpen]         = useState(false);
  const [, startTransition]                   = useTransition();

  const [showAttachZone, setShowAttachZone]   = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<AttachmentResult | null>(null);
  const [chatDragOver, setChatDragOver]       = useState(false);
  const [dragDropFile, setDragDropFile]       = useState<File | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLTextAreaElement>(null);
  const abortRef       = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    fetch('/api/v1/ai/history')
      .then(r => r.json())
      .then(d => setConversations(d.conversations ?? []))
      .catch(() => {});
  }, []);

  const loadUploads = useCallback(() => {
    fetch('/api/v1/ai/upload')
      .then(r => r.json())
      .then(d => setUploads(d.uploads ?? []))
      .catch(() => {});
  }, []);

  const loadConversation = useCallback(async (convId: string) => {
    setLoadingConv(true);
    setMessages([]);
    setCurrentConversationId(convId);
    setHistoryOpen(false);
    try {
      const res  = await fetch(`/api/v1/ai/messages?conversation_id=${convId}`);
      const data = await res.json();
      const msgs: ChatMessage[] = (data.messages ?? []).map((m: {
        id: string; role: 'user' | 'assistant'; content: string;
        source_chunks?: Source[]; created_at: string;
      }) => ({
        id: m.id, role: m.role, content: m.content,
        sources: m.source_chunks ?? [], createdAt: m.created_at,
      }));
      setMessages(msgs);
    } catch {
      toast.error('Failed to load conversation');
    } finally {
      setLoadingConv(false);
    }
  }, []);

  const startNewChat = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setMessages([]);
    setCurrentConversationId(null);
    setIsStreaming(false);
    setInput('');
    setPendingAttachment(null);
    setHistoryOpen(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;

    const attachment = pendingAttachment;
    setInput('');
    setPendingAttachment(null);
    setIsStreaming(true);

    const displayContent = attachment ? `[📎 ${attachment.file_name}]\n\n${trimmed}` : trimmed;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(), role: 'user',
      content: displayContent, createdAt: new Date().toISOString(),
    };
    const assistantMsgId = crypto.randomUUID();
    const assistantMsg: ChatMessage = {
      id: assistantMsgId, role: 'assistant',
      content: '', isStreaming: true, createdAt: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const body: Record<string, unknown> = {
        message: trimmed, conversation_id: currentConversationId,
        hospital_id: selectedHospitalId,
      };
      if (attachment) {
        body.file_context = {
          text: attachment.text, file_name: attachment.file_name,
          file_type: attachment.file_type, file_size: attachment.file_size,
        };
      }

      const res = await fetch('/api/v1/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader  = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') break;
          try {
            const event = JSON.parse(raw) as { type: string; value: unknown };
            if (event.type === 'conversation_id') {
              const convId = event.value as string;
              setCurrentConversationId(convId);
              startTransition(() => {
                fetch('/api/v1/ai/history')
                  .then(r => r.json())
                  .then(d => setConversations(d.conversations ?? []))
                  .catch(() => {});
              });
            } else if (event.type === 'text') {
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId
                  ? { ...m, content: m.content + (event.value as string) }
                  : m,
              ));
            } else if (event.type === 'sources') {
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId
                  ? { ...m, sources: event.value as Source[], isStreaming: false }
                  : m,
              ));
            }
          } catch { /* ignore partial chunks */ }
        }
      }

      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId ? { ...m, isStreaming: false } : m,
      ));
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setMessages(prev => prev.map(m =>
          m.id === assistantMsgId
            ? { ...m, content: m.content || '_(stopped)_', isStreaming: false }
            : m,
        ));
      } else {
        toast.error('Failed to get a response. Please try again.');
        setMessages(prev => prev.filter(m => m.id !== assistantMsgId));
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isStreaming, pendingAttachment, currentConversationId, selectedHospitalId, startTransition]);

  const stopStreaming = useCallback(() => { abortRef.current?.abort(); }, []);

  const deleteConversation = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/v1/ai/history?id=${id}`, { method: 'DELETE' });
    setConversations(prev => prev.filter(c => c.id !== id));
    if (currentConversationId === id) startNewChat();
  }, [currentConversationId, startNewChat]);

  const handleDeleteUpload = useCallback(async (id: string) => {
    await fetch(`/api/v1/ai/upload?id=${id}`, { method: 'DELETE' });
    setUploads(prev => prev.filter(u => u.id !== id));
    toast.success('Document removed from knowledge base');
  }, []);

  const handleAttach = useCallback((result: AttachmentResult) => {
    setPendingAttachment(result);
    setDragDropFile(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleKBUploadComplete = useCallback((fileName: string, chunks: number) => {
    toast.success(`"${fileName}" indexed — ${chunks} chunks ready`);
    loadUploads();
    setUploadsOpen(true);
  }, [loadUploads]);

  const openAttachZone = useCallback((file?: File) => {
    setDragDropFile(file ?? null);
    setShowAttachZone(true);
  }, []);

  const handleChatDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setChatDragOver(true); }
  }, []);
  const handleChatDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setChatDragOver(false);
  }, []);
  const handleChatDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setChatDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) openAttachZone(file);
  }, [openAttachZone]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  }, [input, sendMessage]);

  const groupedConversations = conversations.reduce<Record<string, Conversation[]>>((acc, conv) => {
    const label = timeLabel(conv.updated_at);
    (acc[label] ??= []).push(conv);
    return acc;
  }, {});

  const firstName = userName.split(' ')[0] || 'there';

  // ── Render ─────────────────────────────────────────────────

  return (
    <>
      <FileAttachmentZone
        isOpen={showAttachZone}
        onClose={() => { setShowAttachZone(false); setDragDropFile(null); }}
        onAttach={handleAttach}
        onKBUploadComplete={handleKBUploadComplete}
        selectedHospitalId={selectedHospitalId}
        initialFile={dragDropFile}
      />

      {/* History drawer overlay */}
      {historyOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20"
          onClick={() => setHistoryOpen(false)}
        />
      )}

      {/* History drawer */}
      <div className={cn(
        'fixed top-0 left-0 bottom-0 z-50 w-72 bg-white border-r border-slate-200 shadow-xl flex flex-col transition-transform duration-200',
        historyOpen ? 'translate-x-0' : '-translate-x-full',
      )}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <span className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-400" /> Chat History
          </span>
          <button onClick={() => setHistoryOpen(false)} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-3 border-b border-slate-100">
          <button
            onClick={startNewChat}
            className="w-full flex items-center justify-center gap-2 h-9 rounded-lg bg-[#1e3a5f] hover:bg-[#162d4a] text-white text-sm font-medium transition-colors"
          >
            <Plus className="h-4 w-4" /> New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {conversations.length === 0 ? (
            <div className="text-center py-12">
              <MessageSquare className="h-8 w-8 text-slate-200 mx-auto mb-2" />
              <p className="text-xs text-slate-400">No conversations yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(groupedConversations).map(([label, convs]) => (
                <div key={label}>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">{label}</p>
                  <div className="space-y-0.5">
                    {convs.map(conv => (
                      <div
                        key={conv.id}
                        onClick={() => loadConversation(conv.id)}
                        className={cn(
                          'group flex items-center gap-2 w-full text-left px-2.5 py-2 rounded-lg cursor-pointer text-xs transition-colors',
                          currentConversationId === conv.id
                            ? 'bg-blue-50 text-blue-800 font-medium'
                            : 'text-slate-600 hover:bg-slate-50',
                        )}
                      >
                        <MessageSquare className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="flex-1 truncate">{conv.title || 'Chat'}</span>
                        <button
                          onClick={(e) => deleteConversation(conv.id, e)}
                          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-opacity"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Uploads drawer overlay */}
      {uploadsOpen && (
        <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setUploadsOpen(false)} />
      )}

      {/* Uploads drawer */}
      <div className={cn(
        'fixed top-0 right-0 bottom-0 z-50 w-80 bg-white border-l border-slate-200 shadow-xl flex flex-col transition-transform duration-200',
        uploadsOpen ? 'translate-x-0' : 'translate-x-full',
      )}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <span className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-slate-400" /> Knowledge Sources
          </span>
          <button onClick={() => setUploadsOpen(false)} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-3 border-b border-slate-100">
          <button
            onClick={() => { openAttachZone(); }}
            className="w-full flex items-center justify-center gap-2 h-9 rounded-lg border-2 border-dashed border-slate-200 hover:border-blue-300 text-slate-500 hover:text-blue-600 text-sm transition-colors"
          >
            <Upload className="h-4 w-4" /> Upload Document
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {uploads.length === 0 ? (
            <div className="text-center py-12">
              <BookOpen className="h-8 w-8 text-slate-200 mx-auto mb-2" />
              <p className="text-xs text-slate-400">No documents indexed yet</p>
            </div>
          ) : (
            uploads.map(up => (
              <div key={up.id} className="flex items-start gap-2 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2.5 group">
                <FileText className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-700 truncate">{up.file_name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {up.status === 'indexed' && (
                      <span className="flex items-center gap-0.5 text-[10px] text-emerald-600">
                        <CheckCircle2 className="h-2.5 w-2.5" /> {up.chunk_count} chunks
                      </span>
                    )}
                    {up.status === 'processing' && (
                      <span className="flex items-center gap-0.5 text-[10px] text-amber-600">
                        <Loader2 className="h-2.5 w-2.5 animate-spin" /> Processing
                      </span>
                    )}
                    {up.status === 'failed' && (
                      <span className="flex items-center gap-0.5 text-[10px] text-red-500">
                        <AlertCircle className="h-2.5 w-2.5" /> Failed
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteUpload(up.id)}
                  className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-opacity"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Main layout ─────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-h-0 bg-white">

        {/* Top toolbar */}
        <div className="flex items-center justify-between px-5 py-2.5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setHistoryOpen(true)}
              className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-[#1e3a5f] hover:bg-slate-100 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Clock className="h-3.5 w-3.5" />
              History
              <span className="ml-0.5 bg-slate-200 text-slate-600 text-[10px] font-semibold rounded-full px-1.5 py-0.5 leading-none">
                {conversations.length}
              </span>
            </button>

            <button
              onClick={startNewChat}
              className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-[#1e3a5f] hover:bg-slate-100 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              New Chat
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Hospital selector */}
            {hospitals.length > 1 && (
              <div className="relative">
                <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                <select
                  value={selectedHospitalId ?? ''}
                  onChange={e => setSelectedHospitalId(e.target.value || null)}
                  className="pl-7 pr-6 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-300 appearance-none"
                >
                  <option value="">All Hospitals</option>
                  {hospitals.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
              </div>
            )}

            <button
              onClick={() => { loadUploads(); setUploadsOpen(true); }}
              className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-[#1e3a5f] hover:bg-slate-100 px-3 py-1.5 rounded-lg transition-colors"
            >
              <FileUp className="h-3.5 w-3.5" />
              Sources
            </button>

            {isStreaming && (
              <button
                onClick={stopStreaming}
                className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5 transition-colors"
              >
                <X className="h-3 w-3" /> Stop
              </button>
            )}
          </div>
        </div>

        {/* Messages area */}
        <div
          className="flex-1 overflow-y-auto relative"
          onDragOver={handleChatDragOver}
          onDragLeave={handleChatDragLeave}
          onDrop={handleChatDrop}
        >
          {/* Drag overlay */}
          {chatDragOver && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-blue-50/90 border-2 border-dashed border-blue-400 rounded-lg pointer-events-none">
              <div className="text-center">
                <Paperclip className="h-10 w-10 text-blue-500 mx-auto mb-2" />
                <p className="text-sm font-semibold text-blue-700">Drop file to attach</p>
                <p className="text-xs text-blue-500 mt-1">PDF, DOCX, TXT, CSV, XLSX, Images</p>
              </div>
            </div>
          )}

          {loadingConv ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
            </div>
          ) : messages.length === 0 ? (
            /* ── Empty / welcome state ── */
            <div className="flex flex-col items-center justify-center min-h-full py-16 px-6 text-center">
              <h2 className="text-[26px] font-semibold text-slate-800 mb-2 leading-tight">
                How can I help you today?
              </h2>
              <p className="text-[15px] text-slate-500 mb-10">
                Try asking about SOPs, training materials, or hospital policies
              </p>

              <div className="grid grid-cols-2 gap-3 w-full max-w-2xl">
                {SUGGESTIONS.map(s => (
                  <button
                    key={s.text}
                    onClick={() => sendMessage(s.text)}
                    className="text-left text-[13.5px] bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-xl px-4 py-3.5 transition-colors text-slate-700 hover:text-slate-900 shadow-sm"
                  >
                    {s.text}
                  </button>
                ))}
              </div>

              <p className="mt-10 text-xs text-slate-400">
                Hi {firstName}! You can also{' '}
                <button
                  onClick={() => openAttachZone()}
                  className="text-blue-500 hover:text-blue-700 underline underline-offset-2"
                >
                  attach a file
                </button>{' '}
                to ask questions about any document.
              </p>
            </div>
          ) : (
            /* ── Message list ── */
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
              {messages.map(msg => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* ── Input area ──────────────────────────────────────── */}
        <div className="shrink-0 px-5 pb-5 pt-3 border-t border-slate-100">
          <div className="max-w-3xl mx-auto space-y-2">

            {/* Pending attachment */}
            {pendingAttachment && (
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
                <FileText className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <span className="text-xs font-medium text-blue-700 truncate">{pendingAttachment.file_name}</span>
                  <span className="text-[10px] text-blue-400 shrink-0">
                    {fileTypeLabel(pendingAttachment.file_type)} · {formatSize(pendingAttachment.file_size)}
                  </span>
                  <span className="text-[10px] text-emerald-500 flex items-center gap-0.5 shrink-0">
                    <CheckCircle2 className="h-3 w-3" /> Ready
                  </span>
                </div>
                <button
                  onClick={() => setPendingAttachment(null)}
                  className="text-blue-400 hover:text-red-500 transition-colors shrink-0"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Input bar */}
            <div className={cn(
              'flex items-end gap-2 rounded-2xl border bg-white shadow-sm transition-shadow px-3 py-2',
              chatDragOver ? 'border-blue-400 shadow-md'
                : isStreaming ? 'border-blue-200'
                : 'border-slate-200 focus-within:border-slate-300 focus-within:shadow-md',
            )}>
              <button
                onClick={() => openAttachZone()}
                disabled={isStreaming}
                className={cn(
                  'mb-1 p-1.5 rounded-lg transition-colors',
                  pendingAttachment ? 'text-blue-600 bg-blue-100'
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100',
                  isStreaming && 'opacity-40 cursor-not-allowed',
                )}
                title="Attach file"
              >
                <Paperclip className="h-4 w-4" />
              </button>

              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  pendingAttachment
                    ? `Ask a question about ${pendingAttachment.file_name}…`
                    : 'Ask VetCentral anything…'
                }
                disabled={isStreaming}
                rows={1}
                className="flex-1 resize-none bg-transparent text-[14px] text-slate-800 placeholder:text-slate-400 py-2 focus:outline-none max-h-40 overflow-y-auto"
                style={{ minHeight: '40px' }}
                onInput={e => {
                  const el = e.currentTarget;
                  el.style.height = 'auto';
                  el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
                }}
              />

              <div className="mb-1">
                {isStreaming ? (
                  <button
                    onClick={stopStreaming}
                    className="h-8 w-8 rounded-xl bg-red-100 hover:bg-red-200 text-red-600 flex items-center justify-center transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    onClick={() => sendMessage(input)}
                    disabled={!input.trim() && !pendingAttachment}
                    className="h-8 w-8 rounded-xl bg-[#1e3a5f] hover:bg-[#162d4a] disabled:bg-slate-200 disabled:text-slate-400 text-white flex items-center justify-center transition-colors"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            <p className="text-[11px] text-slate-400 text-center">
              Enter to send · Shift+Enter for new line · Attach PDF, DOCX, TXT, CSV, XLSX, Images (max 15 MB)
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Message Bubble ─────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex gap-3', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="h-8 w-8 rounded-full bg-[#1e3a5f] flex items-center justify-center shrink-0 mt-0.5">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
      )}

      <div className={cn('max-w-[80%] space-y-1.5', isUser ? 'items-end' : 'items-start')}>
        <div className={cn(
          'rounded-2xl px-4 py-3 text-sm leading-relaxed',
          isUser
            ? 'bg-[#1e3a5f] text-white rounded-tr-sm'
            : 'bg-slate-50 border border-slate-100 text-slate-800 rounded-tl-sm',
        )}>
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : message.isStreaming && !message.content ? (
            <div className="flex items-center gap-1.5 py-0.5">
              <span className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          ) : (
            <div
              className="prose prose-sm max-w-none prose-p:mb-2 prose-p:mt-0"
              dangerouslySetInnerHTML={{ __html: `<p class="mb-2">${renderMarkdown(message.content)}</p>` }}
            />
          )}
          {message.isStreaming && message.content && (
            <span className="inline-block h-3.5 w-0.5 bg-slate-400 animate-pulse ml-0.5 align-middle" />
          )}
        </div>

        {!isUser && !message.isStreaming && message.sources && message.sources.length > 0 && (
          <SourceCitations sources={message.sources} />
        )}

        <p className={cn('text-[10px] text-slate-400 px-1', isUser ? 'text-right' : 'text-left')}>
          {new Date(message.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>

      {isUser && (
        <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center shrink-0 mt-0.5 text-slate-600 text-xs font-bold">
          U
        </div>
      )}
    </div>
  );
}

// ── Source Citations ───────────────────────────────────────────

function SourceCitations({ sources }: { sources: Source[] }) {
  const [open, setOpen] = useState(false);
  const unique = sources.filter((s, i, arr) => arr.findIndex(x => x.title === s.title) === i);
  const isAttachment = unique.length === 1 && unique[0].source_type === 'attachment';

  return (
    <div className="text-xs">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-slate-500 hover:text-[#1e3a5f] transition-colors"
      >
        {isAttachment ? <FileText className="h-3 w-3" /> : <BookOpen className="h-3 w-3" />}
        <span>
          {isAttachment ? 'Answered from attached file'
            : `${unique.length} source${unique.length !== 1 ? 's' : ''} used`}
        </span>
        <ChevronRight className={cn('h-3 w-3 transition-transform', open && 'rotate-90')} />
      </button>

      {open && (
        <div className="mt-1.5 space-y-1">
          {unique.map((s, i) => (
            <div key={i} className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-2.5 py-1.5">
              <FileText className="h-3 w-3 text-blue-400 shrink-0" />
              <span className="flex-1 text-blue-800 font-medium truncate">{s.title}</span>
              {s.source_type !== 'attachment' && (
                <span className="text-blue-400 shrink-0 text-[10px]">{(s.similarity * 100).toFixed(0)}% match</span>
              )}
              {s.source_type === 'attachment' && (
                <span className="text-blue-400 shrink-0 text-[10px]">Attached</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
