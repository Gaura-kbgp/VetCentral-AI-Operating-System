'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Hash, Lock, Megaphone, Plus, Search, Send, Loader2, X, Check,
  UserPlus, Pencil, Trash2, Smile, Users, ChevronDown, ChevronRight,
  MessageSquare, CornerDownRight, Settings2, AtSign, Bold, Italic,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  getChatList, getTopLevelMessages, getThreadReplies,
  sendMessage as sendAction, deleteMessage, editMessage,
  getOrgMembers, createChannel, getReactions, toggleReaction, startDirectChat,
  type ChatListItem, type Message, type MessageAuthor, type OrgMember, type Reaction,
} from '@/lib/actions/communication';
import type { AppRole } from '@/types/database';

// ── Helpers ──────────────────────────────────────────────────────────────────
const PALETTE = ['#0d9488','#7c3aed','#db2777','#ea580c','#2563eb','#059669','#9333ea','#dc2626','#0891b2','#d97706'];
function colorFor(s: string) {
  let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}
function initials(name: string) {
  return name.split(/[\s-]+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}
function authorName(a: MessageAuthor | null) {
  if (!a) return 'Unknown';
  return [a.first_name, a.last_name].filter(Boolean).join(' ') || 'Unknown';
}
function timeStr(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function dayLabel(iso: string) {
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

const QUICK_EMOJIS = ['👍','❤️','😂','😮','😢','🎉','🔥','✅','💯','🙏','😅','🤝','👏','😍','🤔','😊'];

// ── Types ─────────────────────────────────────────────────────────────────────
interface MsgGroup { userId: string; author: MessageAuthor | null; messages: Message[] }

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const bg = colorFor(name);
  const fs = size > 28 ? 13 : 10;
  const br = size > 28 ? 8 : 6;
  return (
    <div className="flex items-center justify-center shrink-0 text-white font-bold"
      style={{ width: size, height: size, fontSize: fs, backgroundColor: bg, borderRadius: br }}>
      {initials(name)}
    </div>
  );
}

// ── Channel icon ──────────────────────────────────────────────────────────────
function ChanIcon({ type, cls }: { type: string; cls?: string }) {
  if (type === 'announcement') return <Megaphone className={cls} />;
  if (type === 'private')      return <Lock className={cls} />;
  return <Hash className={cls} />;
}

// ── Reaction pill ─────────────────────────────────────────────────────────────
function ReactionPill({ emoji, count, mine, onToggle }: { emoji: string; count: number; mine: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle}
      className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] border transition-all select-none',
        mine ? 'bg-blue-100 border-blue-300 text-blue-800 hover:bg-blue-200'
             : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300')}>
      <span>{emoji}</span>
      <span className="font-semibold">{count}</span>
    </button>
  );
}

// ── Emoji picker ──────────────────────────────────────────────────────────────
function EmojiPicker({ onSelect, onClose }: { onSelect: (e: string) => void; onClose: () => void }) {
  return (
    <div className="absolute bottom-full mb-1 right-0 z-50 bg-white rounded-xl shadow-2xl border border-slate-200 p-2 w-56"
      onClick={e => e.stopPropagation()}>
      <div className="grid grid-cols-8 gap-0.5">
        {QUICK_EMOJIS.map(e => (
          <button key={e} onClick={() => { onSelect(e); onClose(); }}
            className="w-[28px] h-[28px] flex items-center justify-center rounded hover:bg-slate-100 text-[15px] transition-colors">
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Create Channel Modal ──────────────────────────────────────────────────────
function CreateChannelModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (ch: ChatListItem) => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'public' | 'private'>('public');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!name.trim()) { setErr('Channel name is required'); return; }
    setBusy(true); setErr('');
    const r = await createChannel(name.trim(), desc.trim() || null, type);
    if (r.success) {
      const item: ChatListItem = {
        ...r.data,
        last_message: null, last_message_at: null, last_sender: null,
        member_count: 1, is_dm: false, display_name: r.data.name, dm_other: null, unread_count: 0,
      };
      onCreated(item);
    } else {
      setErr(r.error ?? 'Could not create channel');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-[17px] font-bold text-slate-900">Create a channel</h3>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>
        <p className="text-[13px] text-slate-500 -mt-2">Channels are where your team communicates. Best when organized around a topic.</p>

        {/* Name */}
        <div>
          <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5">Name</label>
          <div className="flex items-center border border-slate-200 rounded-xl px-3 focus-within:ring-2 focus-within:ring-blue-200 focus-within:border-blue-400 transition-all">
            <Hash className="h-4 w-4 text-slate-300 shrink-0" />
            <input autoFocus value={name}
              onChange={e => setName(e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))}
              placeholder="e.g. clinical-team"
              className="flex-1 h-10 px-2 text-[14px] outline-none bg-transparent text-slate-800" />
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Lowercase letters, numbers, and hyphens only.</p>
        </div>

        {/* Type */}
        <div>
          <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 block mb-2">Visibility</label>
          <div className="grid grid-cols-2 gap-2">
            {(['public', 'private'] as const).map(t => (
              <button key={t} type="button" onClick={() => setType(t)}
                className={cn('flex items-start gap-2.5 p-3 rounded-xl border-2 text-left transition-all',
                  type === t ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300')}>
                <div className="mt-0.5">
                  {t === 'public' ? <Hash className="h-4 w-4 text-slate-500" /> : <Lock className="h-4 w-4 text-slate-500" />}
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-slate-800 capitalize">{t}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{t === 'public' ? 'Anyone can join' : 'Invite only'}</p>
                </div>
                {type === t && <Check className="h-4 w-4 text-blue-500 ml-auto shrink-0 mt-0.5" />}
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="text-[11px] font-bold uppercase tracking-widest text-slate-400 block mb-1.5">Description <span className="text-slate-300 normal-case font-normal">(optional)</span></label>
          <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="What's this channel about?"
            className="w-full h-10 px-3 rounded-xl border border-slate-200 text-[14px] focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 text-slate-800 transition-all" />
        </div>

        {err && <p className="text-[12px] text-red-500">{err}</p>}

        <button onClick={submit} disabled={busy || !name.trim()}
          className="w-full h-11 rounded-xl bg-[#1d4ed8] hover:bg-[#1e40af] disabled:opacity-50 text-white text-[14px] font-semibold flex items-center justify-center gap-2 transition-colors">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Create Channel
        </button>
      </div>
    </div>
  );
}

// ── New DM Modal ──────────────────────────────────────────────────────────────
function NewDMModal({ members, currentUserId, onClose, onStarted }: {
  members: OrgMember[];
  currentUserId: string;
  onClose: () => void;
  onStarted: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const [starting, setStarting] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const list = useMemo(() => {
    const seen = new Set<string>();
    return members.filter(m => {
      if (m.id === currentUserId || seen.has(m.id)) return false;
      seen.add(m.id);
      return !q || m.name.toLowerCase().includes(q.toLowerCase());
    });
  }, [members, q, currentUserId]);

  const start = async (id: string) => {
    setStarting(id); setErr('');
    const r = await startDirectChat(id);
    if (r.success) onStarted(r.data.id);
    else { setErr(r.error ?? 'Could not start chat'); setStarting(null); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-[17px] font-bold text-slate-900">New direct message</h3>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search people…"
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-all" />
        </div>
        <div className="max-h-72 overflow-y-auto space-y-0.5">
          {list.length === 0 && (
            <div className="text-center py-8">
              <Users className="h-8 w-8 text-slate-200 mx-auto mb-2" />
              <p className="text-[13px] text-slate-400">No people found</p>
            </div>
          )}
          {list.map(m => (
            <button key={m.id} onClick={() => start(m.id)} disabled={!!starting}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 text-left transition-colors disabled:opacity-50">
              <Avatar name={m.name} size={36} />
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-semibold text-slate-800 truncate">{m.name}</p>
                {m.job_title && <p className="text-[11px] text-slate-400 truncate">{m.job_title}</p>}
              </div>
              {starting === m.id && <Loader2 className="h-4 w-4 animate-spin text-blue-500 shrink-0" />}
            </button>
          ))}
        </div>
        {err && <p className="text-[12px] text-red-500">{err}</p>}
      </div>
    </div>
  );
}

// ── MAIN SHELL ────────────────────────────────────────────────────────────────
interface SlackShellProps {
  currentUserId: string;
  currentUserName: string;
  role?: AppRole | null;
}

export function SlackShell({ currentUserId, currentUserName, role }: SlackShellProps) {
  const canManage = role && ['super_admin','org_admin','hospital_admin','practice_manager','hr'].includes(role);

  // Chat list
  const [chats, setChats]               = useState<ChatListItem[]>([]);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [activeId, setActiveId]         = useState<string | null>(null);

  // Messages
  const [messages, setMessages]   = useState<Message[]>([]);
  const [msgsLoading, setMsgsLoading] = useState(false);

  // Reactions: messageId -> Reaction[]
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});

  // Emoji picker
  const [emojiFor, setEmojiFor] = useState<string | null>(null);

  // Editing
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editContent, setEditContent]   = useState('');

  // Thread panel
  const [threadParent, setThreadParent]   = useState<Message | null>(null);
  const [threadMsgs, setThreadMsgs]       = useState<Message[]>([]);
  const [threadInput, setThreadInput]     = useState('');
  const [threadSending, setThreadSending] = useState(false);
  const [threadLoading, setThreadLoading] = useState(false);

  // Main input
  const [input, setInput]   = useState('');
  const [sending, setSending] = useState(false);

  // Modals
  const [showCreateCh, setShowCreateCh] = useState(false);
  const [showNewDM, setShowNewDM]       = useState(false);
  const [orgMembers, setOrgMembers]     = useState<OrgMember[]>([]);

  // Search
  const [searchQ, setSearchQ] = useState('');

  // Sidebar collapse
  const [chOpen, setChOpen]   = useState(true);
  const [dmOpen, setDmOpen]   = useState(true);
  const [annOpen, setAnnOpen] = useState(true);

  // Refs
  const bottomRef       = useRef<HTMLDivElement>(null);
  const threadBottomRef = useRef<HTMLDivElement>(null);
  const inputRef        = useRef<HTMLTextAreaElement>(null);

  const active = chats.find(c => c.id === activeId) ?? null;

  // ── Load chat list ──────────────────────────────────────────────────────────
  const loadChats = useCallback(async (selectFirst = false) => {
    const r = await getChatList();
    if (r.success) {
      setChats(r.data);
      if (selectFirst && r.data.length > 0) setActiveId(prev => prev ?? r.data[0].id);
    }
    setChatsLoading(false);
  }, []);

  useEffect(() => { loadChats(true); }, [loadChats]);
  useEffect(() => {
    const t = setInterval(() => loadChats(), 20000);
    return () => clearInterval(t);
  }, [loadChats]);

  // ── Load org members (lazy) ────────────────────────────────────────────────
  useEffect(() => {
    if (showNewDM && orgMembers.length === 0) {
      getOrgMembers().then(r => { if (r.success) setOrgMembers(r.data); });
    }
  }, [showNewDM, orgMembers.length]);

  // ── Load messages for active channel ───────────────────────────────────────
  useEffect(() => {
    if (!activeId) return;
    setMsgsLoading(true);
    setMessages([]);
    setReactions({});
    setThreadParent(null);
    getTopLevelMessages(activeId).then(async r => {
      if (r.success) {
        setMessages(r.data);
        if (r.data.length > 0) {
          const rr = await getReactions(r.data.map(m => m.id));
          if (rr.success) {
            const byMsg: Record<string, Reaction[]> = {};
            for (const rx of rr.data) (byMsg[rx.message_id] ??= []).push(rx);
            setReactions(byMsg);
          }
        }
      }
      setMsgsLoading(false);
    });
  }, [activeId]);

  // ── Autoscroll ─────────────────────────────────────────────────────────────
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length, msgsLoading]);
  useEffect(() => { threadBottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [threadMsgs.length]);

  // ── Realtime ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeId) return;
    const supabase = createSupabaseBrowserClient();
    const sub = supabase
      .channel(`slack-${activeId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${activeId}` },
        async payload => {
          const raw = payload.new as Record<string, unknown>;
          if (raw.parent_id) return; // thread reply → skip main view
          const uid = raw.user_id as string;
          const { data: profile } = await supabase
            .from('profiles').select('id,first_name,last_name,avatar_url,job_title').eq('id', uid).single();
          const msg: Message = {
            id: raw.id as string, channel_id: raw.channel_id as string, user_id: uid,
            content: raw.content as string, content_type: 'text', parent_id: null,
            is_edited: false, is_deleted: false,
            created_at: raw.created_at as string, updated_at: raw.created_at as string,
            author: profile ?? null,
          };
          setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
        })
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [activeId]);

  // ── Thread: load replies ───────────────────────────────────────────────────
  useEffect(() => {
    if (!threadParent || !activeId) { setThreadMsgs([]); return; }
    setThreadLoading(true);
    getThreadReplies(activeId, threadParent.id).then(r => {
      if (r.success) setThreadMsgs(r.data);
      setThreadLoading(false);
    });
  }, [threadParent, activeId]);

  // ── Thread realtime ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!threadParent || !activeId) return;
    const supabase = createSupabaseBrowserClient();
    const sub = supabase
      .channel(`thread-${threadParent.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${activeId}` },
        async payload => {
          const raw = payload.new as Record<string, unknown>;
          if (raw.parent_id !== threadParent.id) return;
          const uid = raw.user_id as string;
          const { data: profile } = await supabase
            .from('profiles').select('id,first_name,last_name,avatar_url,job_title').eq('id', uid).single();
          const msg: Message = {
            id: raw.id as string, channel_id: raw.channel_id as string, user_id: uid,
            content: raw.content as string, content_type: 'text', parent_id: threadParent.id,
            is_edited: false, is_deleted: false,
            created_at: raw.created_at as string, updated_at: raw.created_at as string,
            author: profile ?? null,
          };
          setThreadMsgs(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
        })
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [threadParent, activeId]);

  // ── Send ───────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!input.trim() || !activeId || sending) return;
    const text = input.trim();
    setInput('');
    setSending(true);
    inputRef.current?.focus();
    const r = await sendAction(activeId, text);
    if (r.success) {
      setMessages(prev => prev.some(m => m.id === r.data.id) ? prev : [...prev, r.data]);
      setChats(prev => prev.map(c => c.id === activeId
        ? { ...c, last_message: text, last_message_at: r.data.created_at, last_sender: currentUserName.split(' ')[0] }
        : c));
    }
    setSending(false);
  };

  // ── Send thread reply ──────────────────────────────────────────────────────
  const handleThreadSend = async () => {
    if (!threadInput.trim() || !activeId || !threadParent || threadSending) return;
    const text = threadInput.trim();
    setThreadInput('');
    setThreadSending(true);
    const r = await sendAction(activeId, text, threadParent.id);
    if (r.success) setThreadMsgs(prev => [...prev, r.data]);
    setThreadSending(false);
  };

  // ── Reaction ───────────────────────────────────────────────────────────────
  const handleReaction = async (messageId: string, emoji: string) => {
    const r = await toggleReaction(messageId, emoji);
    if (r.success) {
      setReactions(prev => {
        const curr = prev[messageId] ?? [];
        if (r.data.added) {
          return { ...prev, [messageId]: [...curr, { message_id: messageId, user_id: currentUserId, emoji }] };
        }
        return { ...prev, [messageId]: curr.filter(x => !(x.user_id === currentUserId && x.emoji === emoji)) };
      });
    }
    setEmojiFor(null);
  };

  // ── Edit ───────────────────────────────────────────────────────────────────
  const startEdit = (msg: Message) => { setEditingId(msg.id); setEditContent(msg.content); };
  const submitEdit = async () => {
    if (!editingId || !editContent.trim()) { setEditingId(null); return; }
    const r = await editMessage(editingId, editContent.trim());
    if (r.success) setMessages(prev => prev.map(m => m.id === editingId ? r.data : m));
    setEditingId(null); setEditContent('');
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (messageId: string) => {
    if (!confirm('Delete this message? This cannot be undone.')) return;
    const r = await deleteMessage(messageId);
    if (r.success) setMessages(prev => prev.filter(m => m.id !== messageId));
  };

  // ── Sidebar organisation ───────────────────────────────────────────────────
  const { announcements, pubChannels, privChannels, dms } = useMemo(() => ({
    announcements: chats.filter(c => c.channel_type === 'announcement'),
    pubChannels:   chats.filter(c => c.channel_type === 'public'),
    privChannels:  chats.filter(c => c.channel_type === 'private' && !c.is_dm),
    dms:           chats.filter(c => c.is_dm || c.channel_type === 'direct'),
  }), [chats]);

  const filteredBySearch = useMemo(() => {
    if (!searchQ.trim()) return null;
    const q = searchQ.toLowerCase();
    return chats.filter(c => c.display_name.toLowerCase().includes(q));
  }, [chats, searchQ]);

  // ── Message grouping ───────────────────────────────────────────────────────
  const grouped = useMemo<MsgGroup[]>(() => {
    const out: MsgGroup[] = [];
    for (const msg of messages) {
      const last = out[out.length - 1];
      const gap = last?.messages.length
        ? new Date(msg.created_at).getTime() - new Date(last.messages[last.messages.length - 1].created_at).getTime()
        : Infinity;
      if (last && last.userId === msg.user_id && gap < 5 * 60000) {
        last.messages.push(msg);
      } else {
        out.push({ userId: msg.user_id, author: msg.author, messages: [msg] });
      }
    }
    return out;
  }, [messages]);

  const dayGroups = useMemo(() => {
    const out: Array<{ day: string; groups: MsgGroup[] }> = [];
    for (const g of grouped) {
      const day = dayLabel(g.messages[0].created_at);
      const last = out[out.length - 1];
      if (last && last.day === day) last.groups.push(g);
      else out.push({ day, groups: [g] });
    }
    return out;
  }, [grouped]);

  // ── Sidebar channel item ───────────────────────────────────────────────────
  function SidebarItem({ chat }: { chat: ChatListItem }) {
    const isActive  = chat.id === activeId;
    const hasUnread = chat.unread_count > 0 && !isActive;
    return (
      <button onClick={() => setActiveId(chat.id)}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-1 rounded-md text-left transition-all text-[14px] group',
          isActive   ? 'bg-white/15 text-white'
          : hasUnread ? 'text-white font-semibold hover:bg-white/10'
                      : 'text-[#b9cad8] hover:bg-white/10 hover:text-[#dce8f5]',
        )}>
        <div className="shrink-0">
          {chat.is_dm || chat.channel_type === 'direct'
            ? <Avatar name={chat.display_name} size={20} />
            : <ChanIcon type={chat.channel_type} cls="h-3.5 w-3.5 opacity-60" />
          }
        </div>
        <span className="flex-1 truncate">{chat.display_name}</span>
        {hasUnread && (
          <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-white text-[#1e2a3a] text-[10px] font-bold flex items-center justify-center">
            {chat.unread_count > 99 ? '99+' : chat.unread_count}
          </span>
        )}
      </button>
    );
  }

  // ── Sidebar section header ─────────────────────────────────────────────────
  function SidebarSection({ label, open, onToggle, onAdd, addTitle }: {
    label: string; open: boolean; onToggle: () => void; onAdd?: () => void; addTitle?: string;
  }) {
    return (
      <div className="flex items-center gap-1 px-3 py-1 mt-3">
        <button onClick={onToggle} className="flex items-center gap-1 flex-1 text-[11px] font-bold uppercase tracking-widest text-[#7a8fa0] hover:text-[#a8b9cc] transition-colors">
          {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
          {label}
        </button>
        {onAdd && (
          <button onClick={onAdd} title={addTitle}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/10 text-[#7a8fa0] hover:text-[#a8b9cc] transition-colors">
            <Plus className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-1 w-full min-h-0 overflow-hidden bg-white rounded-xl border border-slate-200 shadow-sm"
      onClick={() => setEmojiFor(null)}>

      {/* ════ LEFT SIDEBAR ════════════════════════════════════════════════════ */}
      <aside className="w-[240px] shrink-0 flex flex-col bg-[#1a2535] overflow-hidden">

        {/* Workspace header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg, #2563eb 0%, #1e3a5f 100%)' }}>
              <span className="text-[10px] font-extrabold text-white">VC</span>
            </div>
            <div className="min-w-0">
              <p className="text-[14px] font-bold text-white truncate leading-tight">VetCentral</p>
              <p className="text-[10px] text-[#7a8fa0] leading-tight">Communication</p>
            </div>
          </div>
          <button onClick={() => setShowCreateCh(true)} title="Create channel"
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors shrink-0">
            <Settings2 className="h-4 w-4 text-[#7a8fa0]" />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2">
          <div className="flex items-center gap-2 bg-white/8 border border-white/10 rounded-lg px-3 py-1.5 focus-within:border-white/20 transition-all">
            <Search className="h-3.5 w-3.5 text-[#7a8fa0] shrink-0" />
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Jump to…"
              className="flex-1 bg-transparent text-[13px] text-white placeholder:text-[#7a8fa0] outline-none" />
            {searchQ && (
              <button onClick={() => setSearchQ('')} className="text-[#7a8fa0] hover:text-white">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          {chatsLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-white/20" /></div>
          ) : filteredBySearch ? (
            // Search results
            <div className="px-1 pt-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#7a8fa0] px-2 mb-1">Results</p>
              {filteredBySearch.length === 0
                ? <p className="text-[12px] text-[#7a8fa0] px-2 py-2">No matches for &quot;{searchQ}&quot;</p>
                : filteredBySearch.map(c => <SidebarItem key={c.id} chat={c} />)
              }
            </div>
          ) : (
            <>
              {/* Announcements */}
              {announcements.length > 0 && (
                <>
                  <SidebarSection label="Announcements" open={annOpen} onToggle={() => setAnnOpen(v => !v)} />
                  {annOpen && announcements.map(c => <SidebarItem key={c.id} chat={c} />)}
                </>
              )}

              {/* Channels */}
              <SidebarSection
                label="Channels"
                open={chOpen}
                onToggle={() => setChOpen(v => !v)}
                onAdd={canManage ? () => setShowCreateCh(true) : undefined}
                addTitle="Add channel"
              />
              {chOpen && (
                <>
                  {pubChannels.map(c => <SidebarItem key={c.id} chat={c} />)}
                  {privChannels.map(c => <SidebarItem key={c.id} chat={c} />)}
                  {pubChannels.length === 0 && privChannels.length === 0 && (
                    <p className="text-[12px] text-[#7a8fa0] px-3 py-1">No channels yet</p>
                  )}
                  {canManage && (
                    <button onClick={() => setShowCreateCh(true)}
                      className="w-full flex items-center gap-2 px-3 py-1 rounded-md text-[13px] text-[#7a8fa0] hover:bg-white/10 hover:text-[#a8b9cc] transition-colors mt-0.5">
                      <Plus className="h-3.5 w-3.5" /> Add a channel
                    </button>
                  )}
                </>
              )}

              {/* Direct Messages */}
              <SidebarSection
                label="Direct messages"
                open={dmOpen}
                onToggle={() => setDmOpen(v => !v)}
                onAdd={() => setShowNewDM(true)}
                addTitle="New message"
              />
              {dmOpen && (
                <>
                  {dms.map(c => <SidebarItem key={c.id} chat={c} />)}
                  {dms.length === 0 && (
                    <button onClick={() => setShowNewDM(true)}
                      className="w-full flex items-center gap-2 px-3 py-1 rounded-md text-[13px] text-[#7a8fa0] hover:bg-white/10 hover:text-[#a8b9cc] transition-colors">
                      <UserPlus className="h-3.5 w-3.5" /> Message a colleague
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </nav>

        {/* Current user footer */}
        <div className="shrink-0 flex items-center gap-2.5 px-3 py-2.5 border-t border-white/10 bg-[#151e2c]">
          <Avatar name={currentUserName} size={28} />
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold text-white truncate">{currentUserName}</p>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
              <span className="text-[10px] text-[#7a8fa0]">Active</span>
            </div>
          </div>
        </div>
      </aside>

      {/* ════ MAIN CONTENT ════════════════════════════════════════════════════ */}
      <div className="flex-1 min-w-0 flex overflow-hidden">

        {/* Channel / DM view */}
        <div className={cn('flex-1 min-w-0 flex flex-col', threadParent ? 'border-r border-slate-200' : '')}>

          {!active ? (
            /* Empty state */
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-300 px-8 text-center">
              <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center">
                <MessageSquare className="h-10 w-10 text-slate-300" />
              </div>
              <div>
                <p className="text-[17px] font-bold text-slate-500">
                  {chatsLoading ? 'Loading channels…' : 'Welcome to VetCentral Communication'}
                </p>
                <p className="text-[13px] text-slate-400 mt-1">
                  Select a channel or direct message from the sidebar to start.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Channel header */}
              <div className="shrink-0 flex items-center gap-3 px-5 py-3 bg-white border-b border-slate-100 shadow-[0_1px_0_rgba(0,0,0,0.06)]">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {active.is_dm || active.channel_type === 'direct'
                    ? <Avatar name={active.display_name} size={30} />
                    : <ChanIcon type={active.channel_type} cls="h-5 w-5 text-slate-600 shrink-0" />
                  }
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold text-slate-900 leading-tight truncate">{active.display_name}</p>
                    {active.description && (
                      <p className="text-[11px] text-slate-400 leading-tight truncate">{active.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {!active.is_dm && (
                    <button className="flex items-center gap-1.5 text-[12px] text-slate-400 hover:text-slate-600 transition-colors">
                      <Users className="h-3.5 w-3.5" />
                      <span>{active.member_count}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Messages area */}
              <div className="flex-1 overflow-y-auto bg-white" onClick={() => setEmojiFor(null)}>
                {msgsLoading ? (
                  <div className="flex justify-center py-16">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center gap-4 py-16 px-8 text-center">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                      style={{ backgroundColor: active.is_dm ? colorFor(active.display_name) + '20' : '#f0f4ff' }}>
                      {active.is_dm || active.channel_type === 'direct'
                        ? <Avatar name={active.display_name} size={44} />
                        : <ChanIcon type={active.channel_type} cls="h-8 w-8 text-[#2563eb]" />
                      }
                    </div>
                    <div>
                      <p className="text-[18px] font-bold text-slate-800">
                        {active.is_dm ? active.display_name : `#${active.display_name}`}
                      </p>
                      <p className="text-[13px] text-slate-500 mt-1 max-w-sm">
                        {active.is_dm
                          ? `This is the beginning of your direct message history with ${active.display_name}.`
                          : active.description
                            ? active.description
                            : `This is the very beginning of the #${active.display_name} channel.`
                        }
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="px-4 py-4">
                    {dayGroups.map((dg, dgi) => (
                      <div key={dgi}>
                        {/* Day separator */}
                        <div className="flex items-center gap-3 my-5">
                          <div className="flex-1 h-px bg-slate-100" />
                          <span className="text-[11px] font-semibold text-slate-400 px-3 py-0.5 rounded-full border border-slate-100 bg-white whitespace-nowrap">
                            {dg.day}
                          </span>
                          <div className="flex-1 h-px bg-slate-100" />
                        </div>

                        {/* Message groups */}
                        {dg.groups.map((g, gi) => {
                          const gName = authorName(g.author);
                          return (
                            <div key={gi} className="mb-0.5">
                              {g.messages.map((msg, mi) => {
                                const isFirst = mi === 0;
                                const reacts = reactions[msg.id] ?? [];
                                const reactMap: Record<string, { count: number; mine: boolean }> = {};
                                for (const rx of reacts) {
                                  if (!reactMap[rx.emoji]) reactMap[rx.emoji] = { count: 0, mine: false };
                                  reactMap[rx.emoji].count++;
                                  if (rx.user_id === currentUserId) reactMap[rx.emoji].mine = true;
                                }

                                return (
                                  <div key={msg.id}
                                    className="relative group px-2 py-0.5 rounded-lg hover:bg-slate-50/80 transition-colors"
                                    onClick={e => e.stopPropagation()}>

                                    <div className="flex items-start gap-3">
                                      {/* Avatar column: show avatar on first msg, hover time on rest */}
                                      <div className="w-9 shrink-0 mt-0.5">
                                        {isFirst
                                          ? <Avatar name={gName} size={36} />
                                          : (
                                            <span className="block text-right text-[10px] text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity pt-0.5 pr-0.5 leading-tight">
                                              {timeStr(msg.created_at)}
                                            </span>
                                          )
                                        }
                                      </div>

                                      <div className="flex-1 min-w-0">
                                        {/* Name + time (first only) */}
                                        {isFirst && (
                                          <div className="flex items-baseline gap-2 mb-0.5">
                                            <span className="text-[14px] font-bold text-slate-900 hover:underline cursor-pointer">{gName}</span>
                                            <span className="text-[11.5px] text-slate-400">{timeStr(msg.created_at)}</span>
                                            {msg.is_edited && <span className="text-[10.5px] text-slate-300 italic">(edited)</span>}
                                          </div>
                                        )}

                                        {/* Message content or edit input */}
                                        {editingId === msg.id ? (
                                          <div className="space-y-1.5">
                                            <textarea autoFocus value={editContent}
                                              onChange={e => setEditContent(e.target.value)}
                                              onKeyDown={e => {
                                                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitEdit(); }
                                                if (e.key === 'Escape') setEditingId(null);
                                              }}
                                              rows={2}
                                              className="w-full px-3 py-2 rounded-lg border border-blue-300 bg-blue-50 text-[14px] text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-blue-200" />
                                            <div className="flex items-center gap-2 text-[11.5px]">
                                              <button onClick={submitEdit} className="px-3 py-1 rounded-md bg-[#1d4ed8] text-white font-semibold hover:bg-[#1e40af]">Save</button>
                                              <button onClick={() => setEditingId(null)} className="px-3 py-1 rounded-md bg-slate-100 text-slate-600 font-semibold hover:bg-slate-200">Cancel</button>
                                              <span className="text-slate-400">escape to cancel · enter to save</span>
                                            </div>
                                          </div>
                                        ) : (
                                          <p className="text-[14px] text-slate-800 leading-relaxed whitespace-pre-wrap break-words">
                                            {msg.content}
                                          </p>
                                        )}

                                        {/* Reactions */}
                                        {Object.keys(reactMap).length > 0 && editingId !== msg.id && (
                                          <div className="flex flex-wrap gap-1 mt-1.5">
                                            {Object.entries(reactMap).map(([emoji, { count, mine }]) => (
                                              <ReactionPill key={emoji} emoji={emoji} count={count} mine={mine}
                                                onToggle={() => handleReaction(msg.id, emoji)} />
                                            ))}
                                            <button
                                              onClick={e => { e.stopPropagation(); setEmojiFor(prev => prev === msg.id ? null : msg.id); }}
                                              className="inline-flex items-center justify-center w-8 h-[26px] rounded-full border border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600 text-[13px] transition-colors">
                                              <Smile className="h-3.5 w-3.5" />
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {/* Hover toolbar */}
                                    {editingId !== msg.id && (
                                      <div className="absolute -top-3.5 right-4 z-20 hidden group-hover:flex items-center gap-0.5 bg-white border border-slate-200 rounded-lg shadow-lg px-1 py-0.5">
                                        {/* Quick emoji */}
                                        {QUICK_EMOJIS.slice(0, 4).map(emoji => (
                                          <button key={emoji}
                                            onClick={e => { e.stopPropagation(); handleReaction(msg.id, emoji); }}
                                            className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-100 text-[14px] transition-colors">
                                            {emoji}
                                          </button>
                                        ))}
                                        <div className="w-px h-4 bg-slate-200 mx-0.5" />
                                        {/* Emoji picker */}
                                        <div className="relative">
                                          <button
                                            onClick={e => { e.stopPropagation(); setEmojiFor(prev => prev === msg.id ? null : msg.id); }}
                                            title="Add reaction"
                                            className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-100 text-slate-500 transition-colors">
                                            <Smile className="h-3.5 w-3.5" />
                                          </button>
                                          {emojiFor === msg.id && (
                                            <EmojiPicker
                                              onSelect={emoji => handleReaction(msg.id, emoji)}
                                              onClose={() => setEmojiFor(null)}
                                            />
                                          )}
                                        </div>
                                        {/* Reply in thread */}
                                        <button onClick={e => { e.stopPropagation(); setThreadParent(msg); }}
                                          title="Reply in thread"
                                          className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-100 text-slate-500 transition-colors">
                                          <CornerDownRight className="h-3.5 w-3.5" />
                                        </button>
                                        {/* Own message actions */}
                                        {msg.user_id === currentUserId && (
                                          <>
                                            <div className="w-px h-4 bg-slate-200 mx-0.5" />
                                            <button onClick={e => { e.stopPropagation(); startEdit(msg); }}
                                              title="Edit message"
                                              className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-100 text-slate-500 transition-colors">
                                              <Pencil className="h-3.5 w-3.5" />
                                            </button>
                                            <button onClick={e => { e.stopPropagation(); handleDelete(msg.id); }}
                                              title="Delete message"
                                              className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-50 text-red-400 transition-colors">
                                              <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                    </div>
                    ))}
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Input bar */}
              <div className="shrink-0 px-4 py-3 bg-white border-t border-slate-100">
                <div className="border border-slate-200 rounded-xl focus-within:border-slate-300 focus-within:shadow-sm transition-all overflow-hidden">
                  {/* Formatting toolbar */}
                  <div className="flex items-center gap-0.5 px-3 pt-2 pb-1 border-b border-slate-100">
                    {[Bold, Italic, AtSign].map((Icon, i) => (
                      <button key={i} type="button"
                        className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                        <Icon className="h-3.5 w-3.5" />
                      </button>
                    ))}
                  </div>
                  <textarea ref={inputRef} value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
                    }}
                    rows={2}
                    placeholder={`Message ${active.is_dm || active.channel_type === 'direct' ? active.display_name : `#${active.display_name}`}…`}
                    className="w-full px-4 py-2.5 text-[14px] text-slate-800 placeholder:text-slate-400 bg-transparent resize-none focus:outline-none max-h-36"
                  />
                  <div className="flex items-center justify-between px-3 pb-2">
                    <div className="flex items-center gap-0.5">
                      <button type="button"
                        className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                        <Smile className="h-4 w-4" />
                      </button>
                    </div>
                    <button onClick={handleSend} disabled={!input.trim() || sending}
                      className="h-8 px-4 rounded-lg bg-[#1d4ed8] hover:bg-[#1e40af] disabled:opacity-40 text-white text-[13px] font-semibold flex items-center gap-1.5 transition-colors">
                      {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      Send
                    </button>
                  </div>
                </div>
                <p className="text-[10.5px] text-slate-300 mt-1.5 ml-1">Enter to send · Shift+Enter for new line</p>
              </div>
            </>
          )}
        </div>

        {/* ════ THREAD PANEL ════════════════════════════════════════════════════ */}
        {threadParent && (
          <div className="w-[320px] shrink-0 flex flex-col bg-white border-l border-slate-100">
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between px-4 py-3.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <CornerDownRight className="h-4 w-4 text-slate-400" />
                <span className="text-[15px] font-bold text-slate-800">Thread</span>
              </div>
              <button onClick={() => { setThreadParent(null); setThreadMsgs([]); }}
                className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
                <X className="h-4 w-4 text-slate-400" />
              </button>
            </div>

            {/* Parent message preview */}
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-start gap-2.5">
                <Avatar name={authorName(threadParent.author)} size={28} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5 mb-0.5">
                    <span className="text-[12.5px] font-bold text-slate-800">{authorName(threadParent.author)}</span>
                    <span className="text-[10.5px] text-slate-400">{timeStr(threadParent.created_at)}</span>
                  </div>
                  <p className="text-[12.5px] text-slate-600 leading-relaxed line-clamp-3 whitespace-pre-wrap">
                    {threadParent.content}
                  </p>
                </div>
              </div>
            </div>

            {/* Thread replies */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {threadLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
                </div>
              ) : threadMsgs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <CornerDownRight className="h-8 w-8 text-slate-200 mb-3" />
                  <p className="text-[13px] font-medium text-slate-500">No replies yet</p>
                  <p className="text-[11px] text-slate-400 mt-1">Be the first to reply to this thread</p>
                </div>
              ) : (
                threadMsgs.map(msg => (
                  <div key={msg.id} className="flex items-start gap-2.5">
                    <Avatar name={authorName(msg.author)} size={28} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-1.5 mb-0.5">
                        <span className="text-[12.5px] font-bold text-slate-800">{authorName(msg.author)}</span>
                        <span className="text-[10.5px] text-slate-400">{timeStr(msg.created_at)}</span>
                      </div>
                      <p className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                ))
              )}
              <div ref={threadBottomRef} />
            </div>

            {/* Thread input */}
            <div className="shrink-0 px-3 pb-3 pt-2 border-t border-slate-100">
              <div className="flex items-end gap-2">
                <textarea value={threadInput} onChange={e => setThreadInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleThreadSend(); }
                  }}
                  rows={2}
                  placeholder="Reply in thread…"
                  className="flex-1 max-h-24 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-[13px] text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-blue-200 focus:bg-white transition-all" />
                <button onClick={handleThreadSend} disabled={!threadInput.trim() || threadSending}
                  className="h-9 w-9 rounded-xl bg-[#1d4ed8] hover:bg-[#1e40af] disabled:opacity-40 text-white flex items-center justify-center shrink-0 transition-colors">
                  {threadSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                </button>
              </div>
              <p className="text-[10px] text-slate-300 mt-1 ml-1">Enter to send · Shift+Enter for new line</p>
            </div>
          </div>
        )}
      </div>

      {/* ════ MODALS ════════════════════════════════════════════════════════════ */}
      {showCreateCh && (
        <CreateChannelModal
          onClose={() => setShowCreateCh(false)}
          onCreated={ch => {
            setChats(prev => [...prev, ch]);
            setActiveId(ch.id);
            setShowCreateCh(false);
          }}
        />
      )}
      {showNewDM && (
        <NewDMModal
          members={orgMembers}
          currentUserId={currentUserId}
          onClose={() => setShowNewDM(false)}
          onStarted={async id => {
            setShowNewDM(false);
            await loadChats();
            setActiveId(id);
          }}
        />
      )}
    </div>
  );
}
