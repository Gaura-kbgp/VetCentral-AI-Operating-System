'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send, Inbox, ArrowUpRight, Search, X, Paperclip, Download,
  FileText, Image, Loader2, CheckCircle2, Clock, User,
  ChevronLeft, AlertCircle, Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { AppRole } from '@/types/database';
import type {
  DirectRequest, RequestReply, OrgMember, ReplyFile, DirectSubtype,
} from '@/lib/actions/direct-requests';
import {
  getDirectInbox, getDirectSent, getRequestReplies,
  markDirectRequestRead, addReply, createDirectRequest, getOrgMembersForDirect,
} from '@/lib/actions/direct-requests';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function personName(p: { first_name: string | null; last_name: string | null } | null) {
  if (!p) return 'Unknown';
  return [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown';
}

const AVATAR_COLORS = ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899'];
function avatarColor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
}

function Avatar({ id, name, size = 8 }: { id: string; name: string; size?: number }) {
  return (
    <div
      className={cn(`h-${size} w-${size} rounded-full flex items-center justify-center text-white font-bold shrink-0`)}
      style={{ backgroundColor: avatarColor(id), fontSize: size <= 8 ? 11 : 13 }}
    >
      {initials(name)}
    </div>
  );
}

const SUBTYPE_META: Record<DirectSubtype, { label: string; color: string }> = {
  general:             { label: 'General',             color: 'bg-slate-100 text-slate-600' },
  medical_certificate: { label: 'Medical Certificate', color: 'bg-red-50 text-red-600' },
  work_report:         { label: 'Work Report',         color: 'bg-amber-50 text-amber-700' },
};

function fileIcon(type: string) {
  if (type.startsWith('image/')) return <Image className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
}

// ─────────────────────────────────────────────────────────────
// Send Request Modal
// ─────────────────────────────────────────────────────────────

interface SendModalProps {
  defaultSubtype?: DirectSubtype;
  role: AppRole | null;
  onClose: () => void;
  onSent: (req: DirectRequest) => void;
}

const ADMIN_ROLES: AppRole[] = ['super_admin', 'org_admin', 'hospital_admin', 'practice_manager', 'hr'];

function SendModal({ defaultSubtype = 'general', role, onClose, onSent }: SendModalProps) {
  const isAdmin = !!role && ADMIN_ROLES.includes(role);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<OrgMember | null>(null);
  const [subtype, setSubtype] = useState<DirectSubtype>(defaultSubtype);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const [step, setStep] = useState<'person' | 'details'>('person');

  useEffect(() => {
    getOrgMembersForDirect().then(r => {
      if (r.success) setMembers(r.data);
      setLoading(false);
    });
  }, []);

  const filtered = members.filter(m =>
    !search || m.name.toLowerCase().includes(search.toLowerCase()) ||
    (m.job_title ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  const subtypeOptions: DirectSubtype[] = isAdmin
    ? ['general', 'medical_certificate', 'work_report']
    : ['general'];

  const autoTitle: Record<DirectSubtype, string> = {
    general:             '',
    medical_certificate: 'Medical Certificate Required',
    work_report:         'Work Details Report Request',
  };

  const selectMember = (m: OrgMember) => {
    setSelected(m);
    setStep('details');
    if (!title && subtype !== 'general') setTitle(autoTitle[subtype]);
  };

  const changeSubtype = (s: DirectSubtype) => {
    setSubtype(s);
    if (autoTitle[s]) setTitle(autoTitle[s]);
  };

  const handleSubmit = async () => {
    if (!selected) { setErr('Select a recipient'); return; }
    if (!title.trim()) { setErr('Title is required'); return; }
    if (!message.trim()) { setErr('Message is required'); return; }
    setSubmitting(true); setErr('');
    const r = await createDirectRequest({
      assigned_to: selected.id,
      title: title.trim(),
      message: message.trim(),
      subtype,
    });
    if (r.success) { onSent(r.data); onClose(); }
    else { setErr(r.error ?? 'Failed to send'); setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[88vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            {step === 'details' && (
              <button onClick={() => setStep('person')} className="h-8 w-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400">
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <div>
              <h2 className="text-[16px] font-bold text-slate-900">Send Request</h2>
              <p className="text-[11.5px] text-slate-400">
                {step === 'person' ? 'Choose a recipient' : `To: ${selected?.name}`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="h-9 w-9 flex items-center justify-center rounded-xl hover:bg-slate-100">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {step === 'person' && (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
                <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search by name or role…"
                  className="w-full h-11 pl-9 pr-3 rounded-xl border border-slate-200 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 bg-slate-50 focus:bg-white" />
              </div>
              {loading ? (
                <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-300" /></div>
              ) : (
                <div className="space-y-1.5">
                  {filtered.length === 0
                    ? <p className="text-[13px] text-slate-400 text-center py-8">No members found</p>
                    : filtered.map(m => (
                      <button key={m.id} onClick={() => selectMember(m)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-colors text-left">
                        <Avatar id={m.id} name={m.name} size={9} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13.5px] font-semibold text-slate-800 truncate">{m.name}</p>
                          <p className="text-[11.5px] text-slate-400 truncate">{m.job_title ?? m.role}</p>
                        </div>
                      </button>
                    ))
                  }
                </div>
              )}
            </>
          )}

          {step === 'details' && selected && (
            <>
              {/* Subtype (admin only has extra options) */}
              {subtypeOptions.length > 1 && (
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2 block">Request Type</label>
                  <div className="flex gap-2 flex-wrap">
                    {subtypeOptions.map(s => (
                      <button key={s} type="button" onClick={() => changeSubtype(s)}
                        className={cn('h-8 px-3 rounded-xl border text-[12px] font-semibold transition-colors',
                          subtype === s ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50',
                        )}>
                        {SUBTYPE_META[s].label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Title *</label>
                <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="What are you requesting?"
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 bg-slate-50 focus:bg-white" />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Message *</label>
                <textarea value={message} onChange={e => setMessage(e.target.value)} rows={5}
                  placeholder="Describe what you need…"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-[13.5px] resize-none focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 bg-slate-50 focus:bg-white" />
              </div>

              {err && (
                <p className="text-[12px] text-red-600 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" />{err}
                </p>
              )}
            </>
          )}
        </div>

        {step === 'details' && (
          <div className="shrink-0 border-t border-slate-100 px-6 py-4 flex gap-3">
            <button onClick={onClose} className="h-10 px-5 rounded-xl border border-slate-200 text-[13px] font-medium text-slate-500 hover:bg-slate-50">
              Cancel
            </button>
            <button onClick={handleSubmit} disabled={submitting || !title.trim() || !message.trim()}
              className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl bg-[#1e3a5f] hover:bg-[#16304f] disabled:opacity-50 text-white text-[13.5px] font-semibold transition-colors">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {submitting ? 'Sending…' : 'Send Request'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Thread View
// ─────────────────────────────────────────────────────────────

function ThreadView({
  request,
  currentUserId,
  onBack,
  onReplied,
}: {
  request: DirectRequest;
  currentUserId: string;
  onBack: () => void;
  onReplied: (requestId: string) => void;
}) {
  const [replies, setReplies] = useState<RequestReply[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isRecipient = request.assigned_to === currentUserId;

  useEffect(() => {
    let alive = true;
    getRequestReplies(request.id).then(r => {
      if (alive && r.success) setReplies(r.data);
      setLoadingReplies(false);
    });
    if (isRecipient && !request.read_at) markDirectRequestRead(request.id).catch(() => {});
    return () => { alive = false; };
  }, [request.id, isRecipient, request.read_at]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [replies]);

  const uploadToStorage = async (files: File[]): Promise<ReplyFile[]> => {
    const supabase = createSupabaseBrowserClient();
    const results: ReplyFile[] = [];
    for (const file of files) {
      const path = `${request.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { error } = await supabase.storage.from('request-attachments').upload(path, file);
      if (!error) {
        const { data: urlData } = supabase.storage.from('request-attachments').getPublicUrl(path);
        results.push({ name: file.name, url: urlData.publicUrl, type: file.type, size: file.size });
      }
    }
    return results;
  };

  const handleSend = async () => {
    if (!replyText.trim() && uploadFiles.length === 0) return;
    setSending(true);
    let fileRecords: ReplyFile[] = [];
    if (uploadFiles.length > 0) {
      setUploadingFiles(true);
      fileRecords = await uploadToStorage(uploadFiles);
      setUploadingFiles(false);
    }
    const r = await addReply(request.id, replyText.trim(), fileRecords);
    if (r.success) {
      setReplies(prev => [...prev, r.data]);
      setReplyText('');
      setUploadFiles([]);
      onReplied(request.id);
    }
    setSending(false);
  };

  const person = isRecipient ? request.sender : request.recipient;
  const pName = personName(person);

  return (
    <div className="flex flex-col h-full">
      {/* Thread header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-white">
        <button onClick={onBack} className="h-9 w-9 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400">
          <ChevronLeft className="h-5 w-5" />
        </button>
        {person && <Avatar id={person.id} name={pName} size={8} />}
        <div className="flex-1 min-w-0">
          <p className="text-[13.5px] font-bold text-slate-900 truncate">{request.title}</p>
          <p className="text-[11.5px] text-slate-400">
            {isRecipient ? `From: ${pName}` : `To: ${pName}`} · {fmtDate(request.created_at)}
          </p>
        </div>
        <span className={cn('shrink-0 text-[10.5px] font-bold px-2.5 py-1 rounded-full', SUBTYPE_META[request.subtype].color)}>
          {SUBTYPE_META[request.subtype].label}
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
        {/* Original request bubble */}
        <div className="flex gap-3">
          {request.sender && <Avatar id={request.sender.id} name={personName(request.sender)} size={8} />}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[12px] font-bold text-slate-700">{personName(request.sender)}</span>
              <span className="text-[11px] text-slate-400">{fmtDate(request.created_at)}</span>
              <span className="text-[10px] bg-[#1e3a5f]/10 text-[#1e3a5f] px-1.5 py-0.5 rounded font-semibold">Request</span>
            </div>
            <div className="bg-[#1e3a5f]/5 border border-[#1e3a5f]/10 rounded-2xl rounded-tl-sm px-4 py-3">
              <p className="text-[13.5px] text-slate-800 whitespace-pre-wrap leading-relaxed">{request.description}</p>
            </div>
          </div>
        </div>

        {/* Replies */}
        {loadingReplies ? (
          <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-slate-300" /></div>
        ) : replies.map(reply => {
          const isMe = reply.author_id === currentUserId;
          const authorName = personName(reply.author);
          return (
            <div key={reply.id} className={cn('flex gap-3', isMe && 'flex-row-reverse')}>
              {reply.author && <Avatar id={reply.author.id} name={authorName} size={8} />}
              <div className={cn('max-w-[80%]', isMe && 'items-end flex flex-col')}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[12px] font-bold text-slate-700">{isMe ? 'You' : authorName}</span>
                  <span className="text-[11px] text-slate-400">{fmtDate(reply.created_at)}</span>
                </div>
                <div className={cn(
                  'rounded-2xl px-4 py-3',
                  isMe ? 'bg-[#1e3a5f] text-white rounded-tr-sm' : 'bg-slate-100 text-slate-800 rounded-tl-sm',
                )}>
                  {reply.content && (
                    <p className="text-[13.5px] whitespace-pre-wrap leading-relaxed">{reply.content}</p>
                  )}
                  {reply.files.length > 0 && (
                    <div className={cn('mt-2 space-y-1.5', reply.content && 'pt-2 border-t', isMe ? 'border-white/20' : 'border-slate-200')}>
                      {reply.files.map((f, i) => (
                        <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" download={f.name}
                          className={cn('flex items-center gap-2 text-[12px] rounded-xl px-3 py-2 transition-colors',
                            isMe ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200',
                          )}>
                          {fileIcon(f.type)}
                          <span className="flex-1 truncate font-medium">{f.name}</span>
                          <Download className="h-3.5 w-3.5 shrink-0 opacity-70" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Reply composer */}
      <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-3">
        {uploadFiles.length > 0 && (
          <div className="flex gap-2 flex-wrap mb-2">
            {uploadFiles.map((f, i) => (
              <div key={i} className="flex items-center gap-1.5 bg-slate-100 rounded-lg px-2.5 py-1.5 text-[11.5px] text-slate-700">
                {fileIcon(f.type)}
                <span className="max-w-[120px] truncate">{f.name}</span>
                <button onClick={() => setUploadFiles(prev => prev.filter((_, j) => j !== i))}>
                  <X className="h-3 w-3 text-slate-400 hover:text-slate-600" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <div className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 focus-within:ring-2 focus-within:ring-[#1e3a5f]/20 focus-within:border-[#1e3a5f] transition-all">
            <textarea
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Write a reply… (Enter to send)"
              rows={2}
              className="w-full bg-transparent text-[13.5px] text-slate-800 resize-none focus:outline-none placeholder:text-slate-400"
            />
          </div>
          <input ref={fileInputRef} type="file" multiple className="hidden"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
            onChange={e => setUploadFiles(prev => [...prev, ...Array.from(e.target.files ?? [])])} />
          <button onClick={() => fileInputRef.current?.click()}
            className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 shrink-0">
            <Paperclip className="h-5 w-5" />
          </button>
          <button onClick={handleSend} disabled={sending || (!replyText.trim() && uploadFiles.length === 0)}
            className="h-10 w-10 flex items-center justify-center rounded-xl bg-[#1e3a5f] hover:bg-[#16304f] disabled:opacity-40 text-white shrink-0 transition-colors">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Request List Item
// ─────────────────────────────────────────────────────────────

function RequestListItem({
  request, currentUserId, isInbox, onClick,
}: {
  request: DirectRequest;
  currentUserId: string;
  isInbox: boolean;
  onClick: () => void;
}) {
  const person = isInbox ? request.sender : request.recipient;
  const pName = personName(person);
  const unread = isInbox && !request.read_at;
  const replied = request.status === 'completed';

  return (
    <button onClick={onClick}
      className={cn(
        'w-full flex items-start gap-3 px-4 py-3.5 rounded-2xl border transition-all text-left hover:shadow-sm',
        unread ? 'bg-[#1e3a5f]/[0.03] border-[#1e3a5f]/20' : 'bg-white border-slate-100',
        'hover:border-slate-200',
      )}>
      {unread && <div className="h-2 w-2 rounded-full bg-[#1e3a5f] mt-2 shrink-0" />}
      {!unread && person && <Avatar id={person.id} name={pName} size={8} />}
      {unread && person && <Avatar id={person.id} name={pName} size={8} />}

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={cn('text-[13.5px] truncate', unread ? 'font-bold text-slate-900' : 'font-semibold text-slate-800')}>
            {request.title}
          </p>
          <span className="text-[11px] text-slate-400 shrink-0">{fmtDate(request.created_at)}</span>
        </div>
        <p className="text-[12px] text-slate-500 mt-0.5">{isInbox ? `From: ${pName}` : `To: ${pName}`}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className={cn('text-[10.5px] font-semibold px-2 py-0.5 rounded-full', SUBTYPE_META[request.subtype].color)}>
            {SUBTYPE_META[request.subtype].label}
          </span>
          {replied
            ? <span className="flex items-center gap-1 text-[11px] text-emerald-600"><CheckCircle2 className="h-3 w-3" /> Replied</span>
            : <span className="flex items-center gap-1 text-[11px] text-amber-600"><Clock className="h-3 w-3" /> Pending</span>}
        </div>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Shell
// ─────────────────────────────────────────────────────────────

interface DirectRequestsShellProps {
  currentUserId: string;
  role: AppRole | null;
  initialInbox: DirectRequest[];
  initialSent: DirectRequest[];
  defaultTab?: 'inbox' | 'sent';
  defaultSubtype?: DirectSubtype;
  onUnreadChange?: (count: number) => void;
}

type Tab = 'inbox' | 'sent';

export function DirectRequestsShell({
  currentUserId, role, initialInbox, initialSent, defaultTab = 'inbox',
  defaultSubtype, onUnreadChange,
}: DirectRequestsShellProps) {
  const [tab, setTab] = useState<Tab>(defaultTab);
  const [inbox, setInbox] = useState<DirectRequest[]>(initialInbox);
  const [sent, setSent] = useState<DirectRequest[]>(initialSent);

  // Sync internal tab when the outer shell switches between inbox/sent
  useEffect(() => { setTab(defaultTab); }, [defaultTab]);
  const [search, setSearch] = useState('');
  const [openRequest, setOpenRequest] = useState<DirectRequest | null>(null);
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendModalSubtype, setSendModalSubtype] = useState<DirectSubtype>(defaultSubtype ?? 'general');

  const unread = inbox.filter(r => !r.read_at).length;
  useEffect(() => { onUnreadChange?.(unread); }, [unread, onUnreadChange]);

  const active = tab === 'inbox' ? inbox : sent;
  const filtered = active.filter(r =>
    !search || r.title.toLowerCase().includes(search.toLowerCase()) ||
    personName(tab === 'inbox' ? r.sender : r.recipient).toLowerCase().includes(search.toLowerCase()),
  );

  const handleSent = useCallback((req: DirectRequest) => {
    setSent(prev => [req, ...prev]);
  }, []);

  const handleReplied = useCallback((requestId: string) => {
    setInbox(prev => prev.map(r => r.id === requestId ? { ...r, status: 'completed' } : r));
    setSent(prev => prev.map(r => r.id === requestId ? { ...r, status: 'completed' } : r));
  }, []);

  const handleOpenRequest = (req: DirectRequest) => {
    setOpenRequest(req);
    if (tab === 'inbox' && !req.read_at) {
      setInbox(prev => prev.map(r => r.id === req.id ? { ...r, read_at: new Date().toISOString() } : r));
    }
  };

  const openSendModal = (subtype: DirectSubtype = 'general') => {
    setSendModalSubtype(subtype);
    setShowSendModal(true);
  };

  if (openRequest) {
    return (
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <ThreadView
          request={openRequest}
          currentUserId={currentUserId}
          onBack={() => setOpenRequest(null)}
          onReplied={handleReplied}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-white flex-wrap">
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          <button onClick={() => setTab('inbox')}
            className={cn('relative h-8 px-4 rounded-lg text-[13px] font-semibold transition-colors',
              tab === 'inbox' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
            )}>
            <span className="flex items-center gap-1.5">
              <Inbox className="h-3.5 w-3.5" /> Inbox
            </span>
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                {unread}
              </span>
            )}
          </button>
          <button onClick={() => setTab('sent')}
            className={cn('h-8 px-4 rounded-lg text-[13px] font-semibold transition-colors flex items-center gap-1.5',
              tab === 'sent' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
            )}>
            <ArrowUpRight className="h-3.5 w-3.5" /> Sent
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-300" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            className="h-8 pl-8 pr-3 rounded-xl border border-slate-200 text-[12.5px] bg-slate-50 focus:outline-none focus:ring-1 focus:ring-[#1e3a5f]/30 w-40" />
        </div>

        <button onClick={() => openSendModal()}
          className="ml-auto flex items-center gap-1.5 h-9 px-4 rounded-xl bg-[#1e3a5f] hover:bg-[#16304f] text-white text-[12.5px] font-semibold transition-colors">
          <Plus className="h-4 w-4" /> Send Request
        </button>
      </div>

      {/* List */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center">
              {tab === 'inbox' ? <Inbox className="h-7 w-7 text-slate-300" /> : <ArrowUpRight className="h-7 w-7 text-slate-300" />}
            </div>
            <p className="text-[14px] font-semibold text-slate-400">
              {tab === 'inbox' ? 'No requests received yet' : 'No requests sent yet'}
            </p>
            {tab === 'sent' && (
              <button onClick={() => openSendModal()}
                className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-[#1e3a5f] text-white text-[12.5px] font-semibold hover:bg-[#16304f]">
                <Plus className="h-4 w-4" /> Send your first request
              </button>
            )}
          </div>
        ) : (
          filtered.map(req => (
            <RequestListItem
              key={req.id}
              request={req}
              currentUserId={currentUserId}
              isInbox={tab === 'inbox'}
              onClick={() => handleOpenRequest(req)}
            />
          ))
        )}
      </div>

      {showSendModal && (
        <SendModal
          defaultSubtype={sendModalSubtype}
          role={role}
          onClose={() => setShowSendModal(false)}
          onSent={handleSent}
        />
      )}
    </div>
  );
}
