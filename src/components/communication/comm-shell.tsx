'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Hash, Megaphone, Lock, Users, Plus, Send, Trash2,
  MessageSquare, X, Search, Smile, Paperclip, Phone,
  Video, Info, ChevronDown, ChevronRight, Bell, BellOff,
  MoreHorizontal, AtSign, Bold, Italic, Link2,
  Check, Edit2, Star,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  getMessages, sendMessage as sendMessageAction,
  deleteMessage as deleteMessageAction, createChannel,
  getReactions, toggleReaction,
  type Channel, type Message, type MessageAuthor,
} from '@/lib/actions/communication';

// ── Constants ─────────────────────────────────────────────
const TYPE_ORDER: Record<Channel['channel_type'], number> = {
  announcement: 0, public: 1, private: 2, direct: 3,
};

const AVATAR_PALETTE = [
  '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B',
  '#EF4444', '#06B6D4', '#EC4899', '#14B8A6',
  '#6366F1', '#F97316',
];

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '🔥', '👀', '✅', '😮'];

const EMOJI_PICKER_GRID = [
  '😀','😂','😍','🥰','😎','🤔','😮','😭',
  '👍','👎','❤️','🔥','🎉','✅','⚠️','💡',
  '🏥','🐾','💊','🩺','📋','📅','🔔','📌',
];

// ── Helpers ────────────────────────────────────────────────
function avatarColor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

function initials(author: MessageAuthor | null): string {
  if (!author) return '?';
  return ((author.first_name?.[0] ?? '') + (author.last_name?.[0] ?? '')).toUpperCase() || '?';
}

function displayName(author: MessageAuthor | null): string {
  if (!author) return 'Unknown';
  return [author.first_name, author.last_name].filter(Boolean).join(' ') || 'Unknown';
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const msgStart   = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays   = Math.round((todayStart - msgStart) / 86_400_000);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (diffDays === 0) return time;
  if (diffDays === 1) return `Yesterday ${time}`;
  if (diffDays < 7) return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${time}`;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${time}`;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.round(
    (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
     new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86_400_000
  );
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function isSameDay(a: string, b: string): boolean {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ── Sub-components ─────────────────────────────────────────
function ChannelIcon({ type, className, style }: { type: Channel['channel_type']; className?: string; style?: React.CSSProperties }) {
  const props = { className: cn('h-3.5 w-3.5 shrink-0', className), style };
  if (type === 'announcement') return <Megaphone {...props} />;
  if (type === 'private')      return <Lock      {...props} />;
  if (type === 'direct')       return <AtSign    {...props} />;
  return <Hash {...props} />;
}

function Avatar({ author, userId, size = 'md', className }: {
  author: MessageAuthor | null; userId: string;
  size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string;
}) {
  const dim = size === 'xs' ? 'h-5 w-5 text-[9px]'
            : size === 'sm' ? 'h-7 w-7 text-[10px]'
            : size === 'lg' ? 'h-10 w-10 text-[13px]'
            : 'h-8 w-8 text-[11px]';
  if (author?.avatar_url) {
    return <img src={author.avatar_url} alt={displayName(author)}
      className={cn('rounded-xl object-cover shrink-0', dim, className)} />;
  }
  return (
    <div className={cn('rounded-xl flex items-center justify-center font-bold text-white shrink-0', dim, className)}
      style={{ backgroundColor: avatarColor(userId) }}>
      {initials(author)}
    </div>
  );
}

// ── Types ──────────────────────────────────────────────────
interface ReactionMap { [msgId: string]: { [emoji: string]: string[] } }
interface MessageGroup {
  key: string; userId: string; author: MessageAuthor | null; messages: Message[];
}
interface UnreadMap { [channelId: string]: number }

// ── Main Component ─────────────────────────────────────────
interface CommShellProps {
  initialChannels: Channel[];
  currentUserId: string;
  currentUserName: string;
}

export function CommShell({ initialChannels, currentUserId, currentUserName }: CommShellProps) {
  const [channels, setChannels]               = useState<Channel[]>(initialChannels);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(initialChannels[0]?.id ?? null);
  const [messages, setMessages]               = useState<Message[]>([]);
  const [reactions, setReactions]             = useState<ReactionMap>({});
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [input, setInput]                     = useState('');
  const [sending, setSending]                 = useState(false);
  const [hoveredMsgId, setHoveredMsgId]       = useState<string | null>(null);
  const [showCreate, setShowCreate]           = useState(false);
  const [newName, setNewName]                 = useState('');
  const [newDesc, setNewDesc]                 = useState('');
  const [newType, setNewType]                 = useState<'public' | 'private' | 'announcement'>('public');
  const [creating, setCreating]               = useState(false);
  const [createError, setCreateError]         = useState<string | null>(null);
  const [profileCache, setProfileCache]       = useState<Map<string, MessageAuthor>>(new Map());
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [sendError, setSendError]             = useState<string | null>(null);
  const [unread, setUnread]                   = useState<UnreadMap>({});
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [mutedChannels, setMutedChannels]     = useState<Set<string>>(new Set());
  const [showInfo, setShowInfo]               = useState(false);
  const [searchQuery, setSearchQuery]         = useState('');
  const [showSearch, setShowSearch]           = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef   = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLTextAreaElement>(null);
  const atBottomRef    = useRef(true);
  const emojiRef       = useRef<HTMLDivElement>(null);

  // ── Derived ──────────────────────────────────────────────
  const sortedChannels = useMemo(
    () => [...channels].sort((a, b) => {
      const td = (TYPE_ORDER[a.channel_type] ?? 9) - (TYPE_ORDER[b.channel_type] ?? 9);
      return td !== 0 ? td : a.name.localeCompare(b.name);
    }),
    [channels],
  );

  const announcementChannels = useMemo(() => sortedChannels.filter(c => c.channel_type === 'announcement'), [sortedChannels]);
  const publicChannels       = useMemo(() => sortedChannels.filter(c => c.channel_type === 'public'), [sortedChannels]);
  const privateChannels      = useMemo(() => sortedChannels.filter(c => c.channel_type === 'private'), [sortedChannels]);

  const activeChannel = useMemo(() => channels.find(c => c.id === activeChannelId) ?? null, [channels, activeChannelId]);
  const isAnnouncement = activeChannel?.channel_type === 'announcement';

  const messageGroups = useMemo((): MessageGroup[] => {
    const groups: MessageGroup[] = [];
    const filtered = searchQuery.trim()
      ? messages.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
      : messages;
    for (const msg of filtered) {
      const last    = groups[groups.length - 1];
      const lastMsg = last?.messages[last.messages.length - 1];
      const sameAuthor = last && last.userId === msg.user_id;
      const closeTime  = lastMsg && (new Date(msg.created_at).getTime() - new Date(lastMsg.created_at).getTime()) < 5 * 60_000;
      if (sameAuthor && closeTime) { last.messages.push(msg); }
      else groups.push({ key: msg.id, userId: msg.user_id, author: msg.author, messages: [msg] });
    }
    return groups;
  }, [messages, searchQuery]);

  const userInitials = currentUserName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
  const totalUnread  = Object.values(unread).reduce((s, n) => s + n, 0);

  // ── Scroll ────────────────────────────────────────────────
  const scrollToBottom = useCallback((instant = false) => {
    if (instant || atBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: instant ? 'instant' : 'smooth' } as ScrollIntoViewOptions);
    }
  }, []);
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 60;
  }, []);

  // ── Load messages ─────────────────────────────────────────
  useEffect(() => {
    if (!activeChannelId) return;
    setLoadingMessages(true);
    setMessages([]);
    setReactions({});
    atBottomRef.current = true;
    setShowSearch(false);
    setSearchQuery('');

    getMessages(activeChannelId).then(result => {
      if (result.success) {
        const msgs = result.data;
        setMessages(msgs);
        setProfileCache(prev => {
          const next = new Map(prev);
          for (const m of msgs) if (m.author) next.set(m.user_id, m.author);
          return next;
        });
        const ids = msgs.map(m => m.id);
        if (ids.length) {
          getReactions(ids).then(rr => {
            if (rr.success) {
              const map: ReactionMap = {};
              for (const r of rr.data) {
                if (!map[r.message_id]) map[r.message_id] = {};
                if (!map[r.message_id][r.emoji]) map[r.message_id][r.emoji] = [];
                map[r.message_id][r.emoji].push(r.user_id);
              }
              setReactions(map);
            }
          });
        }
        // Clear unread for active channel
        setUnread(prev => ({ ...prev, [activeChannelId]: 0 }));
      }
      setLoadingMessages(false);
    });
  }, [activeChannelId]);

  useEffect(() => { if (!loadingMessages) scrollToBottom(true); }, [loadingMessages]);
  useEffect(() => { scrollToBottom(); }, [messages.length]);

  // ── Realtime ──────────────────────────────────────────────
  useEffect(() => {
    if (!activeChannelId) return;
    const supabase = createSupabaseBrowserClient();
    const sub = supabase
      .channel(`comm-${activeChannelId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${activeChannelId}` },
        async (payload) => {
          const raw = payload.new as Record<string, unknown>;
          const userId = raw.user_id as string;
          let author = profileCache.get(userId) ?? null;
          if (!author) {
            const { data } = await supabase.from('profiles')
              .select('id, first_name, last_name, avatar_url, job_title')
              .eq('id', userId).single();
            if (data) {
              author = data as MessageAuthor;
              setProfileCache(prev => new Map(prev).set(userId, data as MessageAuthor));
            }
          }
          const newMsg: Message = {
            id: raw.id as string, channel_id: raw.channel_id as string,
            user_id: userId, content: raw.content as string,
            content_type: (raw.content_type as string) ?? 'text',
            parent_id: (raw.parent_id as string | null) ?? null,
            is_edited: (raw.is_edited as boolean) ?? false,
            is_deleted: (raw.is_deleted as boolean) ?? false,
            created_at: raw.created_at as string,
            updated_at: (raw.updated_at ?? raw.created_at) as string,
            author,
          };
          setMessages(prev => prev.some(m => m.id === newMsg.id) ? prev : [...prev, newMsg]);
        })
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [activeChannelId]);

  // ── Send / Delete / React ─────────────────────────────────
  const handleSend = async () => {
    if (!input.trim() || !activeChannelId || sending) return;
    const text = input.trim();
    setInput('');
    setSending(true);
    inputRef.current?.focus();
    const result = await sendMessageAction(activeChannelId, text);
    if (result.success) {
      setSendError(null);
      setMessages(prev => prev.some(m => m.id === result.data.id) ? prev : [...prev, result.data]);
      if (result.data.author) setProfileCache(prev => new Map(prev).set(result.data.user_id, result.data.author!));
    } else {
      setSendError(result.error ?? 'Failed to send message');
      setInput(text); // restore the text so user doesn't lose it
    }
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleDelete = async (msgId: string) => {
    const result = await deleteMessageAction(msgId);
    if (result.success) setMessages(prev => prev.filter(m => m.id !== msgId));
  };

  const handleReact = async (msgId: string, emoji: string) => {
    const result = await toggleReaction(msgId, emoji);
    if (!result.success) return;
    setReactions(prev => {
      const msg = { ...(prev[msgId] ?? {}) };
      const existing = msg[emoji] ?? [];
      if (result.data.added) { msg[emoji] = [...existing, currentUserId]; }
      else {
        const next = existing.filter(uid => uid !== currentUserId);
        if (next.length === 0) delete msg[emoji]; else msg[emoji] = next;
      }
      return { ...prev, [msgId]: msg };
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || creating) return;
    setCreating(true); setCreateError(null);
    const result = await createChannel(newName.trim(), newDesc.trim() || null, newType);
    if (result.success) {
      setChannels(prev => [...prev, result.data]);
      setActiveChannelId(result.data.id);
      setShowCreate(false);
      setNewName(''); setNewDesc(''); setNewType('public');
    } else { setCreateError(result.error); }
    setCreating(false);
  };

  const toggleSection = (section: string) =>
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section); else next.add(section);
      return next;
    });

  const toggleMute = (channelId: string) =>
    setMutedChannels(prev => {
      const next = new Set(prev);
      if (next.has(channelId)) next.delete(channelId); else next.add(channelId);
      return next;
    });

  const switchChannel = (id: string) => {
    if (id === activeChannelId) return;
    setActiveChannelId(id);
    atBottomRef.current = true;
    inputRef.current?.focus();
  };

  // ── Channel list item ─────────────────────────────────────
  function ChannelItem({ ch }: { ch: Channel }) {
    const isActive = ch.id === activeChannelId;
    const isMuted  = mutedChannels.has(ch.id);
    const count    = unread[ch.id] ?? 0;
    return (
      <button
        onClick={() => switchChannel(ch.id)}
        className={cn(
          'group w-full flex items-center gap-2 px-3 py-[5px] rounded-lg text-[13px] transition-all',
          isActive
            ? 'bg-white/20 text-white font-semibold'
            : count > 0 ? 'text-white hover:bg-white/10 font-semibold'
            : 'text-white/60 hover:bg-white/10 hover:text-white/90',
        )}
      >
        <ChannelIcon type={ch.channel_type} className={isActive ? 'text-white' : 'text-white/50 group-hover:text-white/80'} />
        <span className="flex-1 truncate text-left">{ch.name}</span>
        {isMuted && <BellOff className="h-3 w-3 text-white/30 shrink-0" />}
        {!isMuted && count > 0 && (
          <span className="shrink-0 min-w-[18px] h-[18px] bg-white text-[10px] font-bold text-[#1e3a5f] rounded-full flex items-center justify-center px-1">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>
    );
  }

  // ── Section header ────────────────────────────────────────
  function SectionHeader({ id, label, count }: { id: string; label: string; count?: number }) {
    const collapsed = collapsedSections.has(id);
    return (
      <button
        onClick={() => toggleSection(id)}
        className="w-full flex items-center gap-1.5 px-2 py-1 mt-3 mb-0.5 text-[11px] font-bold uppercase tracking-widest text-white/40 hover:text-white/70 transition-colors"
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {label}
        {count !== undefined && count > 0 && (
          <span className="ml-auto text-[10px] font-bold bg-white/20 text-white px-1.5 py-0.5 rounded-full">{count}</span>
        )}
      </button>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden rounded-xl border border-gray-200 shadow-lg bg-white">

      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className="w-64 shrink-0 flex flex-col"
        style={{ background: 'linear-gradient(180deg, #1e2d4a 0%, #1a2540 60%, #162038 100%)' }}>

        {/* Workspace header */}
        <div className="px-4 py-3.5 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center shrink-0">
                <span className="text-white text-[12px] font-bold">V</span>
              </div>
              <div>
                <p className="text-[13px] font-bold text-white leading-tight">VetCentral</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <p className="text-[10px] text-white/50">Online</p>
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="h-7 w-7 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors"
              title="New channel"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Channel navigation */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0">

          {/* Announcements */}
          {announcementChannels.length > 0 && (
            <>
              <SectionHeader id="announcements" label="Announcements" />
              {!collapsedSections.has('announcements') &&
                announcementChannels.map(ch => <ChannelItem key={ch.id} ch={ch} />)}
            </>
          )}

          {/* Channels */}
          {publicChannels.length > 0 && (
            <>
              <SectionHeader id="channels" label="Channels" count={publicChannels.filter(c => (unread[c.id] ?? 0) > 0).length} />
              {!collapsedSections.has('channels') &&
                publicChannels.map(ch => <ChannelItem key={ch.id} ch={ch} />)}
            </>
          )}

          {/* Private */}
          {privateChannels.length > 0 && (
            <>
              <SectionHeader id="private" label="Private" />
              {!collapsedSections.has('private') &&
                privateChannels.map(ch => <ChannelItem key={ch.id} ch={ch} />)}
            </>
          )}

          {/* Add channel button */}
          <button
            onClick={() => setShowCreate(true)}
            className="w-full flex items-center gap-2 px-3 py-[5px] mt-2 rounded-lg text-[13px] text-white/40 hover:text-white/70 hover:bg-white/10 transition-colors"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" />
            <span>Add a channel</span>
          </button>
        </nav>

        {/* User footer */}
        <div className="border-t border-white/10 px-3 py-3 flex items-center gap-2.5">
          <div className="relative shrink-0">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-white text-[11px]"
              style={{ backgroundColor: avatarColor(currentUserId) }}>
              {userInitials}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-[#1a2540]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold text-white truncate">{currentUserName}</p>
            <p className="text-[10px] text-white/40">Active now</p>
          </div>
          <button className="shrink-0 text-white/30 hover:text-white/70 transition-colors">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* ── Main Area ────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col bg-white overflow-hidden">
        {activeChannel ? (
          <>
            {/* Channel header */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 shrink-0 bg-white shadow-sm">
              <div className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                isAnnouncement ? 'bg-amber-100' : 'bg-blue-50',
              )}>
                <ChannelIcon type={activeChannel.channel_type}
                  className={isAnnouncement ? 'text-amber-600' : 'text-blue-600'} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-[15px] font-bold text-gray-900 leading-tight">{activeChannel.name}</h2>
                  {isAnnouncement && (
                    <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                      ANNOUNCEMENTS
                    </span>
                  )}
                </div>
                {activeChannel.description && (
                  <p className="text-[12px] text-gray-400 truncate leading-tight">{activeChannel.description}</p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => { setShowSearch(v => !v); setSearchQuery(''); }}
                  className={cn('p-2 rounded-lg transition-colors',
                    showSearch ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100')}>
                  <Search className="h-4 w-4" />
                </button>
                <button onClick={() => setShowInfo(v => !v)}
                  className={cn('p-2 rounded-lg transition-colors',
                    showInfo ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100')}>
                  <Info className="h-4 w-4" />
                </button>
                <button onClick={() => toggleMute(activeChannel.id)}
                  className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                  title={mutedChannels.has(activeChannel.id) ? 'Unmute' : 'Mute'}>
                  {mutedChannels.has(activeChannel.id)
                    ? <BellOff className="h-4 w-4" />
                    : <Bell className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Search bar (expanded when active) */}
            {showSearch && (
              <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/80">
                <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
                  <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  <input
                    autoFocus
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder={`Search in #${activeChannel.name}…`}
                    className="flex-1 text-[13px] outline-none text-gray-700 placeholder:text-gray-400"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="text-gray-400 hover:text-gray-600">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {searchQuery && (
                  <p className="text-[11px] text-gray-400 mt-1.5 px-1">
                    {messageGroups.length > 0
                      ? `${messageGroups.reduce((s, g) => s + g.messages.length, 0)} result(s)`
                      : 'No results found'}
                  </p>
                )}
              </div>
            )}

            {/* Messages area */}
            <div ref={containerRef} onScroll={handleScroll}
              className="flex-1 overflow-y-auto px-4 py-4 space-y-0.5 bg-white">

              {loadingMessages ? (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <div className="flex gap-1.5">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="w-2.5 h-2.5 bg-blue-400 rounded-full animate-bounce"
                        style={{ animationDelay: `${i * 150}ms` }} />
                    ))}
                  </div>
                  <p className="text-[13px] text-gray-400 font-medium">Loading messages…</p>
                </div>
              ) : messages.length === 0 ? (
                /* Welcome / empty state */
                <div className="flex flex-col items-center justify-center h-full text-center py-10">
                  <div className={cn(
                    'w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-sm',
                    isAnnouncement ? 'bg-amber-100' : 'bg-blue-50',
                  )}>
                    <ChannelIcon type={activeChannel.channel_type}
                      className={cn('h-8 w-8', isAnnouncement ? 'text-amber-500' : 'text-blue-500')} />
                  </div>
                  <h3 className="text-[18px] font-bold text-gray-800 mb-1">
                    Welcome to #{activeChannel.name}
                  </h3>
                  {activeChannel.description && (
                    <p className="text-[14px] text-gray-400 max-w-sm mb-3">{activeChannel.description}</p>
                  )}
                  <p className="text-[13px] text-gray-400">
                    {isAnnouncement
                      ? 'This channel is for announcements. Post updates for the whole team.'
                      : 'This is the very beginning of the conversation. Say hello!'}
                  </p>
                  <button
                    onClick={() => inputRef.current?.focus()}
                    className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold rounded-xl transition-colors"
                  >
                    {isAnnouncement ? 'Post an announcement' : 'Start a conversation'}
                  </button>
                </div>
              ) : (
                <>
                  {messageGroups.map((group, gi) => {
                    const prevGroup = messageGroups[gi - 1];
                    const showDate  = !prevGroup ||
                      !isSameDay(prevGroup.messages[prevGroup.messages.length - 1].created_at, group.messages[0].created_at);
                    const isOwn = group.userId === currentUserId;

                    return (
                      <div key={group.key}>
                        {/* Date divider */}
                        {showDate && (
                          <div className="flex items-center gap-3 my-5">
                            <div className="flex-1 h-px bg-gray-100" />
                            <span className="text-[11px] font-bold text-gray-400 bg-gray-50 border border-gray-100 rounded-full px-3 py-1">
                              {dayLabel(group.messages[0].created_at)}
                            </span>
                            <div className="flex-1 h-px bg-gray-100" />
                          </div>
                        )}

                        {/* Message group — WhatsApp style */}
                        <div className={cn(
                          'flex gap-2 px-2 py-1 -mx-2',
                          isOwn ? 'flex-row-reverse' : 'flex-row',
                        )}>
                          {/* Avatar — only for others, aligned to bottom of group */}
                          {!isOwn && (
                            <div className="shrink-0 self-end pb-0.5">
                              <Avatar author={group.author} userId={group.userId} />
                            </div>
                          )}
                          {/* Spacer to keep own messages from stretching full width */}
                          {isOwn && <div className="w-8 shrink-0" />}

                          {/* Bubble column */}
                          <div className={cn(
                            'flex flex-col gap-0.5 max-w-[65%] min-w-0',
                            isOwn ? 'items-end' : 'items-start',
                          )}>
                            {/* Sender name — only for others */}
                            {!isOwn && (
                              <div className="flex items-baseline gap-2 px-1 mb-0.5">
                                <span className="text-[12px] font-bold text-gray-700 leading-tight">
                                  {displayName(group.author)}
                                </span>
                                {group.author?.job_title && (
                                  <span className="text-[10px] text-gray-400 font-medium hidden sm:inline">
                                    {group.author.job_title}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Individual messages */}
                            {group.messages.map((msg, mi) => {
                              const msgReactions = reactions[msg.id] ?? {};
                              const hasReactions = Object.keys(msgReactions).length > 0;
                              const isHovered    = hoveredMsgId === msg.id;
                              const isLast       = mi === group.messages.length - 1;

                              return (
                                <div key={msg.id}
                                  className={cn('relative flex flex-col', isOwn ? 'items-end' : 'items-start')}
                                  onMouseEnter={() => setHoveredMsgId(msg.id)}
                                  onMouseLeave={() => setHoveredMsgId(null)}>

                                  {/* Bubble */}
                                  <div className={cn(
                                    'px-3.5 py-2 text-[14px] leading-relaxed break-words max-w-full',
                                    isOwn
                                      ? 'bg-blue-600 text-white rounded-t-2xl rounded-bl-2xl rounded-br-md'
                                      : 'bg-gray-100 text-gray-800 rounded-t-2xl rounded-br-2xl rounded-bl-md',
                                    mi > 0 && isOwn  && 'rounded-tr-md',
                                    mi > 0 && !isOwn && 'rounded-tl-md',
                                  )}>
                                    <p className="whitespace-pre-wrap">
                                      {msg.content}
                                      {msg.is_edited && (
                                        <span className={cn('text-[10px] ml-2 font-medium', isOwn ? 'text-blue-200' : 'text-gray-400')}>
                                          (edited)
                                        </span>
                                      )}
                                    </p>
                                  </div>

                                  {/* Timestamp — only on last bubble of group */}
                                  {isLast && (
                                    <span className="text-[10px] text-gray-400 mt-0.5 px-1">
                                      {formatTime(msg.created_at)}
                                    </span>
                                  )}

                                  {/* Reactions */}
                                  {hasReactions && (
                                    <div className={cn('flex flex-wrap gap-1 mt-1 mb-0.5', isOwn ? 'justify-end' : 'justify-start')}>
                                      {Object.entries(msgReactions).map(([emoji, userIds]) => (
                                        <button key={emoji} onClick={() => handleReact(msg.id, emoji)}
                                          className={cn(
                                            'flex items-center gap-1 px-2 py-0.5 rounded-lg text-[12px] border transition-all font-medium',
                                            userIds.includes(currentUserId)
                                              ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm'
                                              : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700',
                                          )}>
                                          <span>{emoji}</span>
                                          <span className="font-bold text-[11px]">{userIds.length}</span>
                                        </button>
                                      ))}
                                      <button onClick={() => setHoveredMsgId(msg.id)}
                                        className="flex items-center px-1.5 py-0.5 rounded-lg border border-dashed border-gray-200 text-gray-400 hover:border-blue-200 hover:text-blue-500 transition-colors">
                                        <Plus className="h-3 w-3" />
                                      </button>
                                    </div>
                                  )}

                                  {/* Hover action bar */}
                                  {isHovered && (
                                    <div className={cn(
                                      'absolute -top-4 flex items-center gap-0.5 bg-white border border-gray-200 rounded-xl shadow-lg px-1.5 py-1 z-20',
                                      isOwn ? 'right-0' : 'left-0',
                                    )}>
                                      {QUICK_EMOJIS.map(emoji => (
                                        <button key={emoji} onClick={() => handleReact(msg.id, emoji)}
                                          className="w-7 h-7 flex items-center justify-center text-[14px] rounded-lg hover:bg-gray-100 transition-colors hover:scale-110 active:scale-95"
                                          title={`React with ${emoji}`}>
                                          {emoji}
                                        </button>
                                      ))}
                                      <div className="w-px h-4 bg-gray-200 mx-0.5" />
                                      {isOwn ? (
                                        <button onClick={() => handleDelete(msg.id)}
                                          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                                          title="Delete">
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                      ) : (
                                        <button className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors" title="More">
                                          <MoreHorizontal className="h-3.5 w-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} className="h-2" />
                </>
              )}
            </div>

            {/* ── Input area ──────────────────────────────────── */}
            <div className="shrink-0 px-4 pb-4 pt-2 bg-white">
              {sendError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-2">
                  <X className="h-3.5 w-3.5 text-red-500 shrink-0" />
                  <p className="text-[12px] text-red-600 flex-1">{sendError}</p>
                  <button onClick={() => setSendError(null)} className="text-red-400 hover:text-red-600">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              <div className="relative border border-gray-200 rounded-2xl bg-white shadow-sm focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100 transition-all overflow-hidden">

                {/* Top formatting bar */}
                <div className="flex items-center gap-1 px-3 pt-2.5 pb-1.5 border-b border-gray-100">
                  <button className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" title="Bold">
                    <Bold className="h-3.5 w-3.5" />
                  </button>
                  <button className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" title="Italic">
                    <Italic className="h-3.5 w-3.5" />
                  </button>
                  <button className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" title="Link">
                    <Link2 className="h-3.5 w-3.5" />
                  </button>
                  <div className="w-px h-3.5 bg-gray-200 mx-1" />
                  <button className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" title="Mention">
                    <AtSign className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setShowEmojiPicker(v => !v)}
                    className={cn('p-1 rounded transition-colors',
                      showEmojiPicker ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100')}
                    title="Emoji">
                    <Smile className="h-3.5 w-3.5" />
                  </button>
                  <button className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" title="Attach">
                    <Paperclip className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Emoji picker */}
                {showEmojiPicker && (
                  <div ref={emojiRef} className="absolute bottom-full mb-2 left-4 bg-white border border-gray-200 rounded-2xl shadow-xl p-3 z-30">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Emoji</p>
                    <div className="grid grid-cols-8 gap-0.5">
                      {EMOJI_PICKER_GRID.map(emoji => (
                        <button key={emoji} onClick={() => { setInput(v => v + emoji); setShowEmojiPicker(false); inputRef.current?.focus(); }}
                          className="w-8 h-8 flex items-center justify-center text-[16px] rounded-lg hover:bg-gray-100 transition-colors hover:scale-125 active:scale-100">
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Text area */}
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isAnnouncement
                    ? `Post an announcement to #${activeChannel.name}…`
                    : `Message #${activeChannel.name}…`}
                  rows={1}
                  style={{ resize: 'none' }}
                  className="w-full px-4 py-2.5 text-[14px] text-gray-800 placeholder:text-gray-400 outline-none leading-relaxed bg-white"
                  onInput={e => {
                    const el = e.currentTarget;
                    el.style.height = 'auto';
                    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
                  }}
                />

                {/* Bottom bar: hint + send */}
                <div className="flex items-center justify-between px-3 pb-2 pt-1">
                  <span className="text-[11px] text-gray-300 select-none">
                    {input.trim() ? 'Shift+Enter for new line' : 'Enter to send · Shift+Enter for newline'}
                  </span>
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || sending}
                    className={cn(
                      'flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-[13px] font-semibold transition-all',
                      input.trim() && !sending
                        ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed',
                    )}
                  >
                    {sending
                      ? <div className="h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      : <Send className="h-3.5 w-3.5" />}
                    <span>{sending ? 'Sending…' : 'Send'}</span>
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="h-8 w-8 text-blue-400" />
              </div>
              <p className="text-[16px] font-semibold text-gray-600">Select a channel to start</p>
              <p className="text-[13px] text-gray-400 mt-1">Choose a channel from the sidebar</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Channel Info Panel ────────────────────────────────── */}
      {showInfo && activeChannel && (
        <aside className="w-64 shrink-0 border-l border-gray-100 bg-gray-50/50 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100">
            <h3 className="text-[13px] font-bold text-gray-800">Channel Info</h3>
            <button onClick={() => setShowInfo(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Icon + name */}
            <div className="text-center py-3">
              <div className={cn('w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3',
                isAnnouncement ? 'bg-amber-100' : 'bg-blue-100')}>
                <ChannelIcon type={activeChannel.channel_type}
                  className={cn('h-7 w-7', isAnnouncement ? 'text-amber-600' : 'text-blue-600')} />
              </div>
              <p className="text-[15px] font-bold text-gray-900">#{activeChannel.name}</p>
              <span className={cn('inline-block mt-1 text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full',
                isAnnouncement ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700')}>
                {activeChannel.channel_type}
              </span>
            </div>

            {/* Description */}
            {activeChannel.description && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">About</p>
                <p className="text-[13px] text-gray-600 leading-relaxed">{activeChannel.description}</p>
              </div>
            )}

            {/* Stats */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Stats</p>
              <div className="space-y-1.5">
                <div className="flex justify-between text-[12px]">
                  <span className="text-gray-500">Messages</span>
                  <span className="font-semibold text-gray-700">{messages.length}</span>
                </div>
                <div className="flex justify-between text-[12px]">
                  <span className="text-gray-500">Last activity</span>
                  <span className="font-semibold text-gray-700">
                    {messages.length > 0 ? timeAgo(messages[messages.length - 1].created_at) : '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </aside>
      )}

      {/* ── Create Channel Modal ──────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) { setShowCreate(false); setCreateError(null); } }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            {/* Modal header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between"
              style={{ background: 'linear-gradient(135deg, #1e2d4a, #2d4a6e)' }}>
              <div>
                <h3 className="text-[16px] font-bold text-white">Create Channel</h3>
                <p className="text-[12px] text-white/60 mt-0.5">Add a new channel to your workspace</p>
              </div>
              <button onClick={() => { setShowCreate(false); setCreateError(null); }}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-6 space-y-5">
              {/* Channel type picker */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                  Channel Type
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['public', 'private', 'announcement'] as const).map(type => {
                    const isSelected = newType === type;
                    const typeColors: Record<string, string> = {
                      public: '#3B82F6', private: '#8B5CF6', announcement: '#F59E0B',
                    };
                    return (
                      <button key={type} type="button" onClick={() => setNewType(type)}
                        className={cn(
                          'flex flex-col items-center gap-2 px-3 py-4 rounded-xl border-2 transition-all',
                          isSelected ? 'border-current shadow-sm' : 'border-gray-200 hover:border-gray-300',
                        )}
                        style={isSelected ? { borderColor: typeColors[type], backgroundColor: `${typeColors[type]}10` } : {}}>
                        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', isSelected ? '' : 'bg-gray-100')}
                          style={isSelected ? { backgroundColor: `${typeColors[type]}20` } : {}}>
                          <ChannelIcon type={type}
                            className={cn('h-4 w-4', isSelected ? '' : 'text-gray-400')}
                            style={isSelected ? { color: typeColors[type] } : undefined} />
                        </div>
                        <span className={cn('text-[12px] font-semibold capitalize', isSelected ? '' : 'text-gray-500')}
                          style={isSelected ? { color: typeColors[type] } : {}}>
                          {type}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Name input */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                  Channel Name *
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                    <ChannelIcon type={newType} />
                  </div>
                  <input type="text" value={newName}
                    onChange={e => setNewName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                    placeholder="e.g. clinic-updates"
                    autoFocus
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-[14px] text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition-all"
                  />
                </div>
              </div>

              {/* Description input */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                  Description <span className="normal-case font-normal text-gray-400">(optional)</span>
                </label>
                <input type="text" value={newDesc} onChange={e => setNewDesc(e.target.value)}
                  placeholder="What is this channel about?"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-[14px] text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition-all"
                />
              </div>

              {createError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                  <X className="h-4 w-4 text-red-500 shrink-0" />
                  <p className="text-[12px] text-red-600">{createError}</p>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => { setShowCreate(false); setCreateError(null); }}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-[14px] font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={!newName.trim() || creating}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-[#1e2d4a] hover:bg-[#162038] disabled:opacity-50 text-white text-[14px] font-semibold transition-colors flex items-center justify-center gap-2">
                  {creating
                    ? <><div className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Creating…</>
                    : <><Check className="h-4 w-4" />Create Channel</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
