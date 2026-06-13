'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Search, Send, Plus, Users, UserPlus, X, Loader2,
  Check, MessageSquare, Hash, Lock, Megaphone, ChevronLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  getChatList, getMessages, sendMessage as sendAction,
  getOrgMembers, getChannelMembers, createGroupChat, addChannelMembers,
  startDirectChat,
  type ChatListItem, type Message, type MessageAuthor, type OrgMember,
} from '@/lib/actions/communication';
import type { AppRole } from '@/types/database';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const GROUP_COLORS = ['#0d9488', '#7c3aed', '#db2777', '#ea580c', '#2563eb', '#059669', '#9333ea', '#dc2626'];

function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return GROUP_COLORS[Math.abs(h) % GROUP_COLORS.length];
}

function initials(name: string) {
  return name.split(/[\s-]+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

function timeShort(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  const days = (now.getTime() - d.getTime()) / 86400000;
  if (days < 7) return d.toLocaleDateString('en-US', { weekday: 'short' });
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
}

function authorName(a: MessageAuthor | null) {
  if (!a) return 'Unknown';
  return [a.first_name, a.last_name].filter(Boolean).join(' ') || 'Unknown';
}

const MANAGE_ROLES: Array<AppRole> = ['super_admin', 'org_admin', 'hospital_admin', 'hr'];

// ─────────────────────────────────────────────────────────────
// Member picker (shared by New Group + Add Member modals)
// ─────────────────────────────────────────────────────────────
function MemberPicker({
  members, selected, onToggle, excludeIds,
}: {
  members: OrgMember[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  excludeIds?: Set<string>;
}) {
  const [q, setQ] = useState('');

  const list = useMemo(() => {
    const seen = new Set<string>();
    return members.filter(m => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      if (excludeIds?.has(m.id)) return false;
      if (q && !m.name.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [members, excludeIds, q]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search members…"
          className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-teal-400"
        />
      </div>
      <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
        {list.length === 0 && (
          <p className="text-[12px] text-slate-400 text-center py-6">No members found</p>
        )}
        {list.map(m => {
          const isSel = selected.has(m.id);
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onToggle(m.id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-left',
                isSel ? 'bg-teal-50 border border-teal-200' : 'hover:bg-slate-50 border border-transparent',
              )}
            >
              <div
                className="h-9 w-9 rounded-full flex items-center justify-center text-white text-[12px] font-bold shrink-0"
                style={{ backgroundColor: colorFor(m.name) }}
              >
                {initials(m.name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-slate-800 truncate">{m.name}</p>
                {m.job_title && <p className="text-[11px] text-slate-400 truncate">{m.job_title}</p>}
              </div>
              <div className={cn(
                'h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors',
                isSel ? 'bg-teal-500 border-teal-500' : 'border-slate-300',
              )}>
                {isSel && <Check className="h-3 w-3 text-white" />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// New Group modal
// ─────────────────────────────────────────────────────────────
function NewGroupModal({
  members, onClose, onCreated,
}: { members: OrgMember[]; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState('');

  const toggle = (id: string) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const create = async () => {
    if (!name.trim()) { setErr('Enter a group name'); return; }
    setCreating(true); setErr('');
    const r = await createGroupChat(name.trim(), Array.from(selected));
    if (r.success) onCreated(r.data.id);
    else { setErr(r.error ?? 'Could not create group'); setCreating(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-[16px] font-bold text-slate-900 flex items-center gap-2">
            <Users className="h-4 w-4 text-teal-500" /> New Group
          </h3>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>

        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Group name (e.g. front-desk-team)"
          className="w-full h-11 px-4 rounded-xl border border-slate-200 text-[14px] focus:outline-none focus:ring-2 focus:ring-teal-400"
        />

        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">
            Add members {selected.size > 0 && <span className="text-teal-600">· {selected.size} selected</span>}
          </p>
          <MemberPicker members={members} selected={selected} onToggle={toggle} />
        </div>

        {err && <p className="text-[12px] text-red-500">{err}</p>}

        <button
          onClick={create}
          disabled={creating || !name.trim()}
          className="w-full h-11 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-[14px] font-semibold flex items-center justify-center gap-2 transition-colors"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Create Group
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Add Member modal
// ─────────────────────────────────────────────────────────────
function AddMemberModal({
  channelId, channelName, members, existingIds, onClose, onAdded,
}: {
  channelId: string;
  channelName: string;
  members: OrgMember[];
  existingIds: Set<string>;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState('');

  const toggle = (id: string) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const add = async () => {
    if (!selected.size) return;
    setAdding(true); setErr('');
    const r = await addChannelMembers(channelId, Array.from(selected));
    if (r.success) onAdded();
    else { setErr(r.error ?? 'Could not add members'); setAdding(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-[16px] font-bold text-slate-900 flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-teal-500" /> Add to {channelName}
          </h3>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>

        <MemberPicker members={members} selected={selected} onToggle={toggle} excludeIds={existingIds} />

        {err && <p className="text-[12px] text-red-500">{err}</p>}

        <button
          onClick={add}
          disabled={adding || !selected.size}
          className="w-full h-11 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-[14px] font-semibold flex items-center justify-center gap-2 transition-colors"
        >
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Add {selected.size > 0 ? `${selected.size} Member${selected.size !== 1 ? 's' : ''}` : 'Members'}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// New Chat modal — pick one person to message directly
// ─────────────────────────────────────────────────────────────
function NewChatModal({
  members, onClose, onStarted,
}: { members: OrgMember[]; onClose: () => void; onStarted: (channelId: string) => void }) {
  const [q, setQ] = useState('');
  const [startingId, setStartingId] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const list = useMemo(() => {
    const seen = new Set<string>();
    return members.filter(m => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return !q || m.name.toLowerCase().includes(q.toLowerCase());
    });
  }, [members, q]);

  const start = async (id: string) => {
    setStartingId(id); setErr('');
    const r = await startDirectChat(id);
    if (r.success) onStarted(r.data.id);
    else { setErr(r.error ?? 'Could not start chat'); setStartingId(null); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-[16px] font-bold text-slate-900 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-teal-500" /> New Chat
          </h3>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
          <input
            autoFocus
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search people…"
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-teal-400"
          />
        </div>

        <div className="max-h-72 overflow-y-auto space-y-1 pr-1">
          {list.length === 0 && (
            <p className="text-[12px] text-slate-400 text-center py-6">No members found</p>
          )}
          {list.map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => start(m.id)}
              disabled={!!startingId}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-teal-50 transition-colors text-left disabled:opacity-50"
            >
              <div
                className="h-10 w-10 rounded-full flex items-center justify-center text-white text-[13px] font-bold shrink-0"
                style={{ backgroundColor: colorFor(m.name) }}
              >
                {initials(m.name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-semibold text-slate-800 truncate">{m.name}</p>
                {m.job_title && <p className="text-[11px] text-slate-400 truncate">{m.job_title}</p>}
              </div>
              {startingId === m.id
                ? <Loader2 className="h-4 w-4 animate-spin text-teal-500 shrink-0" />
                : <Send className="h-3.5 w-3.5 text-slate-300 shrink-0" />}
            </button>
          ))}
        </div>

        {err && <p className="text-[12px] text-red-500">{err}</p>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Message bubble
// ─────────────────────────────────────────────────────────────
function Bubble({ msg, isOwn, showName }: { msg: Message; isOwn: boolean; showName: boolean }) {
  const name = authorName(msg.author);
  return (
    <div className={cn('flex w-full px-4', isOwn ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[75%] sm:max-w-[60%] rounded-2xl px-3.5 py-2 shadow-sm',
          isOwn
            ? 'bg-teal-600 text-white rounded-br-md'
            : 'bg-white text-slate-800 rounded-bl-md border border-slate-100',
        )}
      >
        {!isOwn && showName && (
          <p className="text-[11.5px] font-bold mb-0.5" style={{ color: colorFor(name) }}>{name}</p>
        )}
        <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
        <p className={cn('text-[10px] mt-0.5 text-right', isOwn ? 'text-teal-100' : 'text-slate-300')}>
          {new Date(msg.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main shell
// ─────────────────────────────────────────────────────────────
interface MessagesShellProps {
  currentUserId: string;
  currentUserName: string;
  role: AppRole | null;
}

export function MessagesShell({ currentUserId, currentUserName, role }: MessagesShellProps) {
  const canManage = !!role && MANAGE_ROLES.includes(role);

  const [chats, setChats]             = useState<ChatListItem[]>([]);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [activeId, setActiveId]       = useState<string | null>(null);
  const [messages, setMessages]       = useState<Message[]>([]);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const [input, setInput]             = useState('');
  const [sending, setSending]         = useState(false);
  const [search, setSearch]           = useState('');
  const [orgMembers, setOrgMembers]   = useState<OrgMember[]>([]);
  const [channelMembers, setChannelMembers] = useState<OrgMember[]>([]);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  const active = chats.find(c => c.id === activeId) ?? null;

  // ── load chat list ──
  const loadChats = useCallback(async (selectFirst = false) => {
    const r = await getChatList();
    if (r.success) {
      setChats(r.data);
      if (selectFirst && r.data.length > 0) setActiveId(prev => prev ?? r.data[0].id);
    }
    setChatsLoading(false);
  }, []);

  useEffect(() => { loadChats(true); }, [loadChats]);

  // refresh chat list previews periodically
  useEffect(() => {
    const t = setInterval(() => loadChats(), 15000);
    return () => clearInterval(t);
  }, [loadChats]);

  // org members for pickers — lazy-load when any picker opens
  useEffect(() => {
    if ((showNewGroup || showAddMember || showNewChat) && orgMembers.length === 0) {
      getOrgMembers().then(r => { if (r.success) setOrgMembers(r.data); });
    }
  }, [showNewGroup, showAddMember, showNewChat, orgMembers.length]);

  // ── load messages + members on channel switch ──
  useEffect(() => {
    if (!activeId) return;
    setMsgsLoading(true);
    setMessages([]);
    getMessages(activeId).then(r => {
      if (r.success) setMessages(r.data);
      setMsgsLoading(false);
    });
    getChannelMembers(activeId).then(r => {
      if (r.success) setChannelMembers(r.data);
    });
  }, [activeId]);

  // autoscroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages.length, msgsLoading]);

  // ── realtime new messages ──
  useEffect(() => {
    if (!activeId) return;
    const supabase = createSupabaseBrowserClient();
    const sub = supabase
      .channel(`chat-${activeId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${activeId}` },
        async payload => {
          const raw = payload.new as Record<string, unknown>;
          const uid = raw.user_id as string;
          let author: MessageAuthor | null = null;
          const { data } = await supabase
            .from('profiles')
            .select('id,first_name,last_name,avatar_url,job_title')
            .eq('id', uid)
            .single();
          if (data) author = data as MessageAuthor;
          const newMsg: Message = {
            id: raw.id as string, channel_id: raw.channel_id as string, user_id: uid,
            content: raw.content as string, content_type: 'text', parent_id: null,
            is_edited: false, is_deleted: false,
            created_at: raw.created_at as string, updated_at: raw.created_at as string, author,
          };
          setMessages(prev => prev.some(m => m.id === newMsg.id) ? prev : [...prev, newMsg]);
        })
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [activeId]);

  // ── send ──
  const handleSend = async () => {
    if (!input.trim() || !activeId || sending) return;
    const text = input.trim();
    setInput('');
    setSending(true);
    inputRef.current?.focus();
    const r = await sendAction(activeId, text);
    if (r.success) {
      setMessages(prev => prev.some(m => m.id === r.data.id) ? prev : [...prev, r.data]);
      // update sidebar preview instantly
      setChats(prev => prev.map(c => c.id === activeId
        ? { ...c, last_message: text, last_message_at: r.data.created_at, last_sender: currentUserName.split(' ')[0] }
        : c));
    }
    setSending(false);
  };

  const filteredChats = chats.filter(c => !search || c.display_name.toLowerCase().includes(search.toLowerCase()));
  const existingMemberIds = useMemo(() => new Set(channelMembers.map(m => m.id)), [channelMembers]);

  // group messages by day
  const grouped = useMemo(() => {
    const out: Array<{ day: string; msgs: Message[] }> = [];
    for (const m of messages) {
      const day = dayLabel(m.created_at);
      const last = out[out.length - 1];
      if (last && last.day === day) last.msgs.push(m);
      else out.push({ day, msgs: [m] });
    }
    return out;
  }, [messages]);

  return (
    <div className="flex-1 min-h-0 flex bg-white border-t border-slate-200 overflow-hidden shadow-sm">

      {/* ════ LEFT: chat list ════ */}
      <div className={cn(
        'w-full sm:w-80 shrink-0 border-r border-slate-100 flex flex-col bg-white',
        mobileChatOpen && 'hidden sm:flex',
      )}>
        {/* header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h2 className="text-[16px] font-bold text-slate-900">Chats</h2>
          <div className="flex items-center gap-1.5">
            {/* anyone can start a 1:1 chat */}
            <button
              onClick={() => setShowNewChat(true)}
              title="New chat"
              className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-slate-100 hover:bg-teal-50 hover:text-teal-700 text-slate-600 text-[12px] font-semibold transition-colors"
            >
              <MessageSquare className="h-3.5 w-3.5" /> New Chat
            </button>
            {canManage && (
              <button
                onClick={() => setShowNewGroup(true)}
                className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-[12px] font-semibold transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Group
              </button>
            )}
          </div>
        </div>

        {/* search */}
        <div className="px-3 py-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search chats…"
              className="w-full h-9 pl-9 pr-3 rounded-xl bg-slate-50 border border-slate-100 text-[13px] focus:outline-none focus:ring-2 focus:ring-teal-300 focus:bg-white transition-colors"
            />
          </div>
        </div>

        {/* list */}
        <div className="flex-1 overflow-y-auto">
          {chatsLoading && (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-300" /></div>
          )}
          {!chatsLoading && filteredChats.length === 0 && (
            <p className="text-[12px] text-slate-400 text-center py-10">No chats found</p>
          )}
          {filteredChats.map(c => {
            const color = colorFor(c.display_name);
            const isActive = c.id === activeId;
            return (
              <button
                key={c.id}
                onClick={() => { setActiveId(c.id); setMobileChatOpen(true); }}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-slate-50',
                  isActive ? 'bg-teal-50' : 'hover:bg-slate-50',
                )}
              >
                {/* avatar — person initials for DMs, icons for groups */}
                <div
                  className="h-11 w-11 rounded-full flex items-center justify-center text-white shrink-0 text-[13px] font-bold"
                  style={{ backgroundColor: color }}
                >
                  {c.is_dm
                    ? initials(c.display_name)
                    : c.channel_type === 'announcement'
                      ? <Megaphone className="h-5 w-5" />
                      : c.channel_type === 'private'
                        ? <Lock className="h-4.5 w-4.5" />
                        : <Hash className="h-5 w-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className={cn('text-[14px] font-semibold truncate', isActive ? 'text-teal-800' : 'text-slate-800')}>
                      {c.display_name}
                    </p>
                    {c.last_message_at && (
                      <span className="text-[10.5px] text-slate-400 shrink-0">{timeShort(c.last_message_at)}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-[12px] text-slate-400 truncate flex-1 min-w-0">
                      {c.last_message
                        ? <>{c.last_sender ? <span className="font-medium">{c.last_sender}: </span> : null}{c.last_message}</>
                        : <span className="italic">No messages yet</span>}
                    </p>
                    {c.unread_count > 0 && c.id !== activeId && (
                      <span className="shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-teal-500 text-white text-[10.5px] font-bold flex items-center justify-center">
                        {c.unread_count > 99 ? '99+' : c.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ════ RIGHT: conversation ════ */}
      <div className={cn(
        'flex-1 min-w-0 flex flex-col bg-[#f5f3ee]',
        !mobileChatOpen && 'hidden sm:flex',
      )}>
        {!active ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-300">
            <MessageSquare className="h-14 w-14" />
            <p className="text-[14px] text-slate-400">Select a chat to start messaging</p>
          </div>
        ) : (
          <>
            {/* chat header */}
            <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-slate-100 shrink-0">
              <button onClick={() => setMobileChatOpen(false)} className="sm:hidden h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100">
                <ChevronLeft className="h-4 w-4 text-slate-500" />
              </button>
              <div
                className="h-10 w-10 rounded-full flex items-center justify-center text-white shrink-0 text-[12px] font-bold"
                style={{ backgroundColor: colorFor(active.display_name) }}
              >
                {active.is_dm
                  ? initials(active.display_name)
                  : active.channel_type === 'private' ? <Lock className="h-4 w-4" /> : <Hash className="h-4.5 w-4.5" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14.5px] font-bold text-slate-900 truncate">{active.display_name}</p>
                <p className="text-[11.5px] text-slate-400 truncate">
                  {active.is_dm
                    ? (active.dm_other?.job_title ?? 'Direct message')
                    : channelMembers.length > 0
                      ? channelMembers.slice(0, 4).map(m => m.name.split(' ')[0]).join(', ') + (channelMembers.length > 4 ? ` +${channelMembers.length - 4} more` : '')
                      : `${active.member_count} member${active.member_count !== 1 ? 's' : ''}`}
                </p>
              </div>
              {canManage && !active.is_dm && (
                <button
                  onClick={() => setShowAddMember(true)}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-slate-100 hover:bg-teal-50 hover:text-teal-700 text-slate-600 text-[12px] font-semibold transition-colors"
                >
                  <UserPlus className="h-3.5 w-3.5" /> Add Member
                </button>
              )}
            </div>

            {/* messages */}
            <div className="flex-1 overflow-y-auto py-4 space-y-1.5">
              {msgsLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-slate-300" /></div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-16 text-slate-300">
                  <MessageSquare className="h-10 w-10" />
                  <p className="text-[13px] text-slate-400">No messages yet — say hello 👋</p>
                </div>
              ) : (
                grouped.map(g => (
                  <div key={g.day} className="space-y-1.5">
                    <div className="flex justify-center py-1.5">
                      <span className="px-3 py-1 rounded-full bg-white text-[11px] font-medium text-slate-400 shadow-sm">
                        {g.day}
                      </span>
                    </div>
                    {g.msgs.map((m, i) => (
                      <Bubble
                        key={m.id}
                        msg={m}
                        isOwn={m.user_id === currentUserId}
                        showName={!active.is_dm && (i === 0 || g.msgs[i - 1].user_id !== m.user_id)}
                      />
                    ))}
                  </div>
                ))
              )}
              <div ref={bottomRef} />
            </div>

            {/* input bar */}
            <div className="px-4 py-3 bg-white border-t border-slate-100 shrink-0">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
                  }}
                  rows={1}
                  placeholder={`Message ${active.display_name}…`}
                  className="flex-1 max-h-32 px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-[13.5px] resize-none focus:outline-none focus:ring-2 focus:ring-teal-300 focus:bg-white transition-colors"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || sending}
                  className="h-10 w-10 rounded-full bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white flex items-center justify-center shrink-0 transition-colors"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-[10.5px] text-slate-300 mt-1.5 ml-1">Enter to send · Shift+Enter for new line</p>
            </div>
          </>
        )}
      </div>

      {/* ════ Modals ════ */}
      {showNewGroup && (
        <NewGroupModal
          members={orgMembers.filter(m => m.id !== currentUserId)}
          onClose={() => setShowNewGroup(false)}
          onCreated={async id => {
            setShowNewGroup(false);
            await loadChats();
            setActiveId(id);
            setMobileChatOpen(true);
          }}
        />
      )}
      {showNewChat && (
        <NewChatModal
          members={orgMembers.filter(m => m.id !== currentUserId)}
          onClose={() => setShowNewChat(false)}
          onStarted={async id => {
            setShowNewChat(false);
            await loadChats();
            setActiveId(id);
            setMobileChatOpen(true);
          }}
        />
      )}
      {showAddMember && active && (
        <AddMemberModal
          channelId={active.id}
          channelName={active.display_name}
          members={orgMembers}
          existingIds={existingMemberIds}
          onClose={() => setShowAddMember(false)}
          onAdded={() => {
            setShowAddMember(false);
            getChannelMembers(active.id).then(r => { if (r.success) setChannelMembers(r.data); });
          }}
        />
      )}
    </div>
  );
}
