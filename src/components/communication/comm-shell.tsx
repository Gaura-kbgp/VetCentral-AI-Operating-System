'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Megaphone, Building2, Users, Settings, GraduationCap,
  AlertTriangle, Calendar, MessageSquare, Search, Plus,
  Mail, Inbox, Star, Eye, Send, X, Stethoscope,
  AlertCircle, Loader2, Pin, ChevronRight,
} from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  getMessages, sendMessage as sendMessageAction,
  type Channel, type Message, type MessageAuthor,
} from '@/lib/actions/communication';

// ── Types ─────────────────────────────────────────────────────────────────────
type Priority = 'emergency' | 'high' | 'medium' | 'normal';
type CategoryId = 'all' | 'announcements' | 'hospital' | 'hr' | 'doctor'
  | 'operations' | 'training' | 'emergency' | 'events' | 'general';

interface EnrichedMessage extends Message {
  channel: Channel;
  priority: Priority;
}

interface Category {
  id: CategoryId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  match: (ch: Channel) => boolean;
}

// ── Config ────────────────────────────────────────────────────────────────────
const CATEGORIES: Category[] = [
  { id: 'all',           label: 'All Communications',        icon: Inbox,          accent: 'text-slate-600',  match: () => true },
  { id: 'announcements', label: 'Leadership Announcements',  icon: Megaphone,      accent: 'text-amber-600',  match: ch => ch.channel_type === 'announcement' || /announc|leadership/i.test(ch.name) },
  { id: 'hospital',      label: 'Hospital Updates',          icon: Building2,      accent: 'text-blue-600',   match: ch => /hospital|clinic|update/i.test(ch.name) },
  { id: 'hr',            label: 'HR Communications',         icon: Users,          accent: 'text-purple-600', match: ch => /\bhr\b|human.res|payroll|policy|staffing/i.test(ch.name) },
  { id: 'doctor',        label: 'Doctor Communications',     icon: Stethoscope,    accent: 'text-teal-600',   match: ch => /doctor|medical|clinical|\bvet\b|physician/i.test(ch.name) },
  { id: 'operations',    label: 'Operations Alerts',         icon: Settings,       accent: 'text-orange-600', match: ch => /operat|ops\b|facilit|mainten/i.test(ch.name) },
  { id: 'training',      label: 'Training Updates',          icon: GraduationCap,  accent: 'text-green-600',  match: ch => /train|education|learning|course/i.test(ch.name) },
  { id: 'emergency',     label: 'Emergency Broadcasts',      icon: AlertTriangle,  accent: 'text-red-600',    match: ch => /emerg|urgent|critical|alert/i.test(ch.name) },
  { id: 'events',        label: 'Events & Meetings',         icon: Calendar,       accent: 'text-indigo-600', match: ch => /event|meet|schedul|calendar/i.test(ch.name) },
  { id: 'general',       label: 'General',                   icon: MessageSquare,  accent: 'text-slate-500',  match: ch => /general|team|all.staff/i.test(ch.name) },
];

const PRIORITY_CONFIG: Record<Priority, { label: string; dot: string; bg: string; text: string; border: string }> = {
  emergency: { label: 'Emergency', dot: 'bg-red-600',    bg: 'bg-red-100',    text: 'text-red-700',    border: 'border-red-200'    },
  high:      { label: 'High',      dot: 'bg-amber-500',  bg: 'bg-amber-100',  text: 'text-amber-700',  border: 'border-amber-200'  },
  medium:    { label: 'Medium',    dot: 'bg-blue-400',   bg: 'bg-blue-50',    text: 'text-blue-600',   border: 'border-blue-100'   },
  normal:    { label: 'Normal',    dot: 'bg-slate-300',  bg: 'bg-slate-100',  text: 'text-slate-500',  border: 'border-slate-200'  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const AVATAR_COLORS = ['#8B5CF6','#3B82F6','#10B981','#F59E0B','#EF4444','#06B6D4','#EC4899','#6366F1'];

function avatarColor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function authorName(a: MessageAuthor | null) {
  if (!a) return 'System';
  return [a.first_name, a.last_name].filter(Boolean).join(' ') || 'Unknown';
}

function authorInitials(a: MessageAuthor | null) {
  if (!a) return 'S';
  return ((a.first_name?.[0] ?? '') + (a.last_name?.[0] ?? '')).toUpperCase() || '?';
}

function detectPriority(msg: Message, ch: Channel): Priority {
  const upper = msg.content.toUpperCase();
  if (upper.includes('EMERGENCY') || upper.includes('CODE RED') || upper.includes('CRITICAL ALERT')) return 'emergency';
  if (ch.channel_type === 'announcement') return 'high';
  if (upper.includes('URGENT') || upper.includes('ACTION REQUIRED') || upper.includes('IMMEDIATE')) return 'high';
  if (upper.includes('IMPORTANT') || upper.includes('REMINDER') || upper.includes('PLEASE NOTE')) return 'medium';
  return 'normal';
}

function relativeDate(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Yesterday';
  if (d < 7) return new Date(iso).toLocaleDateString('en-US', { weekday: 'short' });
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fullDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) +
    ' at ' + new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ── Label ─────────────────────────────────────────────────────────────────────
function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">{children}</p>;
}

// ── Mini avatar ───────────────────────────────────────────────────────────────
function MiniAvatar({ author, userId }: { author: MessageAuthor | null; userId: string }) {
  if (author?.avatar_url) {
    return <img src={author.avatar_url} alt={authorName(author)} className="w-5 h-5 rounded-full object-cover shrink-0" />;
  }
  return (
    <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
      style={{ backgroundColor: avatarColor(userId) }}>
      {authorInitials(author)}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
interface CommShellProps {
  initialChannels: Channel[];
  currentUserId: string;
  currentUserName: string;
}

export function CommShell({ initialChannels, currentUserId, currentUserName }: CommShellProps) {
  const [channels]           = useState<Channel[]>(initialChannels);
  const [allMessages, setAllMessages] = useState<EnrichedMessage[]>([]);
  const [loading, setLoading]         = useState(true);
  const [selectedId, setSelectedId]   = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<CategoryId>('all');
  const [readIds, setReadIds]         = useState<Set<string>>(new Set());
  const [pinnedIds, setPinnedIds]     = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [showCompose, setShowCompose] = useState(false);
  const [composeChannelId, setComposeChannelId] = useState('');
  const [composeContent, setComposeContent]     = useState('');
  const [composeSending, setComposeSending]     = useState(false);

  // ── Load all channel messages in parallel ─────────────────────────────────
  useEffect(() => {
    if (channels.length === 0) { setLoading(false); return; }
    setLoading(true);
    Promise.all(channels.map(ch => getMessages(ch.id).then(r => ({ ch, msgs: r.success ? r.data : [] }))))
      .then(results => {
        const enriched: EnrichedMessage[] = [];
        for (const { ch, msgs } of results) {
          for (const msg of msgs) {
            enriched.push({ ...msg, channel: ch, priority: detectPriority(msg, ch) });
          }
        }
        enriched.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setAllMessages(enriched);
        setLoading(false);
      });
  }, [channels]);

  // ── Realtime: all channels ────────────────────────────────────────────────
  useEffect(() => {
    if (channels.length === 0) return;
    const supabase = createSupabaseBrowserClient();
    const subs = channels.map(ch =>
      supabase
        .channel(`comm-center-${ch.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${ch.id}` },
          payload => {
            const raw = payload.new as Record<string, unknown>;
            const stub: Message = {
              id: raw.id as string, channel_id: raw.channel_id as string, user_id: raw.user_id as string,
              content: raw.content as string, content_type: 'text', parent_id: null,
              is_edited: false, is_deleted: false,
              created_at: raw.created_at as string, updated_at: raw.created_at as string, author: null,
            };
            const enriched: EnrichedMessage = { ...stub, channel: ch, priority: detectPriority(stub, ch) };
            setAllMessages(prev => [enriched, ...prev.filter(m => m.id !== enriched.id)]);
          })
        .subscribe()
    );
    return () => { subs.forEach(s => supabase.removeChannel(s)); };
  }, [channels]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    unread:         allMessages.filter(m => !readIds.has(m.id)).length,
    announcements:  allMessages.filter(m => m.channel.channel_type === 'announcement').length,
    actionRequired: allMessages.filter(m => m.priority === 'high' && !readIds.has(m.id)).length,
    emergency:      allMessages.filter(m => m.priority === 'emergency').length,
  }), [allMessages, readIds]);

  // ── Category unread counts ────────────────────────────────────────────────
  const categoryCounts = useMemo(() => {
    const out: Partial<Record<CategoryId, number>> = {};
    for (const cat of CATEGORIES) {
      out[cat.id] = allMessages.filter(m => !readIds.has(m.id) && cat.match(m.channel)).length;
    }
    return out as Record<CategoryId, number>;
  }, [allMessages, readIds]);

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filteredMessages = useMemo(() => {
    const cat = CATEGORIES.find(c => c.id === activeCategory)!;
    let list = allMessages.filter(m => cat.match(m.channel));
    if (priorityFilter !== 'all') list = list.filter(m => m.priority === priorityFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(m =>
        m.content.toLowerCase().includes(q) ||
        authorName(m.author).toLowerCase().includes(q) ||
        m.channel.name.toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => {
      const ap = pinnedIds.has(a.id), bp = pinnedIds.has(b.id);
      if (ap && !bp) return -1;
      if (!ap && bp) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [allMessages, activeCategory, priorityFilter, searchQuery, pinnedIds]);

  const selectedMessage = filteredMessages.find(m => m.id === selectedId) ?? null;
  const currentCat = CATEGORIES.find(c => c.id === activeCategory)!;

  const markRead    = (id: string) => setReadIds(prev => { const n = new Set(prev); n.add(id); return n; });
  const togglePin   = (id: string) => setPinnedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const handleSelect = (id: string) => { setSelectedId(id); markRead(id); };

  const handleCompose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!composeContent.trim() || !composeChannelId || composeSending) return;
    setComposeSending(true);
    const result = await sendMessageAction(composeChannelId, composeContent.trim());
    if (result.success) {
      const ch = channels.find(c => c.id === composeChannelId)!;
      const enriched: EnrichedMessage = { ...result.data, channel: ch, priority: detectPriority(result.data, ch) };
      setAllMessages(prev => [enriched, ...prev]);
      setReadIds(prev => { const n = new Set(prev); n.add(enriched.id); return n; });
      setShowCompose(false);
      setComposeContent('');
      setComposeChannelId('');
    }
    setComposeSending(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-1 min-h-0 overflow-hidden rounded-xl border border-slate-200 shadow-sm bg-white">

      {/* ── LEFT NAV ───────────────────────────────────────────────────────── */}
      <aside className="w-60 shrink-0 flex flex-col border-r border-slate-100 bg-white">

        {/* Header */}
        <div className="px-4 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#1e3a5f] flex items-center justify-center shrink-0">
              <Megaphone className="h-3.5 w-3.5 text-white" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900 leading-tight">Communications</p>
              <p className="text-[10px] text-slate-400">Enterprise Center</p>
            </div>
          </div>
        </div>

        {/* Category nav */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          {CATEGORIES.map(cat => {
            const active  = activeCategory === cat.id;
            const count   = categoryCounts[cat.id];
            const isEmerg = cat.id === 'emergency';
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-left transition-all ${active ? 'bg-[#1e3a5f] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'}`}
              >
                <cat.icon className={`h-4 w-4 shrink-0 ${active ? 'text-white' : cat.accent}`} />
                <span className="flex-1 text-xs font-medium truncate">{cat.label}</span>
                {count > 0 && !active && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${isEmerg ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Compose */}
        <div className="p-3 border-t border-slate-100">
          <button
            onClick={() => setShowCompose(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1e3a5f] hover:bg-[#16304f] text-white text-xs font-semibold rounded-xl transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Compose Message
          </button>
        </div>
      </aside>

      {/* ── CENTER: LIST ───────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col border-r border-slate-100 bg-slate-50/20">

        {/* KPI stats bar */}
        <div className="shrink-0 grid grid-cols-4 gap-0 border-b border-slate-100 bg-white">
          {[
            { label: 'Unread',          value: stats.unread,         icon: Mail,          bg: 'bg-blue-50',   text: 'text-blue-700',   dot: 'bg-blue-500'   },
            { label: 'Announcements',   value: stats.announcements,  icon: Megaphone,     bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-500'  },
            { label: 'Action Required', value: stats.actionRequired, icon: AlertCircle,   bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
            { label: 'Emergency',       value: stats.emergency,      icon: AlertTriangle, bg: 'bg-red-50',    text: 'text-red-700',    dot: 'bg-red-500'    },
          ].map((s, i) => (
            <div key={s.label} className={`flex items-center gap-3 px-5 py-3.5 ${i < 3 ? 'border-r border-slate-100' : ''} ${s.bg}`}>
              <s.icon className={`h-5 w-5 shrink-0 ${s.text}`} />
              <div>
                <p className={`text-2xl font-bold leading-none ${s.text}`}>{s.value}</p>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-white">
          <div className="flex-1 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
            <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search communications…"
              className="flex-1 text-sm bg-transparent outline-none text-slate-700 placeholder:text-slate-400 min-w-0"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-slate-300 hover:text-slate-500">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <select
            value={priorityFilter}
            onChange={e => setPriorityFilter(e.target.value)}
            className="text-xs border border-slate-200 rounded-xl px-3 py-2.5 bg-white text-slate-600 outline-none focus:border-[#1e3a5f] cursor-pointer"
          >
            <option value="all">All Priority</option>
            <option value="emergency">Emergency</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="normal">Normal</option>
          </select>
        </div>

        {/* List header */}
        <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50">
          <currentCat.icon className={`h-3.5 w-3.5 shrink-0 ${currentCat.accent}`} />
          <span className="text-xs font-semibold text-slate-700">{currentCat.label}</span>
          <span className="text-xs text-slate-400">· {filteredMessages.length} message{filteredMessages.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Message rows */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
              <p className="text-sm text-slate-400">Loading communications…</p>
            </div>
          ) : filteredMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-12 px-6">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                <Inbox className="h-7 w-7 text-slate-300" />
              </div>
              <p className="text-sm font-semibold text-slate-500">No communications</p>
              <p className="text-xs text-slate-400 mt-1">
                {searchQuery ? 'Try a different search query.' : 'No messages in this category yet.'}
              </p>
            </div>
          ) : (
            filteredMessages.map(msg => {
              const isSelected = selectedId === msg.id;
              const isRead     = readIds.has(msg.id);
              const isPinned   = pinnedIds.has(msg.id);
              const pCfg       = PRIORITY_CONFIG[msg.priority];
              const subject    = msg.content.replace(/\n+/g, ' ').slice(0, 70) + (msg.content.length > 70 ? '…' : '');
              const preview    = msg.content.replace(/\n+/g, ' ').slice(0, 110) + (msg.content.length > 110 ? '…' : '');

              return (
                <button
                  key={msg.id}
                  onClick={() => handleSelect(msg.id)}
                  className={`w-full text-left border-b border-slate-100 px-4 py-3.5 transition-all group ${
                    isSelected
                      ? 'bg-blue-50/70 border-l-[3px] border-l-[#1e3a5f]'
                      : isRead
                        ? 'bg-white hover:bg-slate-50/70 border-l-[3px] border-l-transparent'
                        : 'bg-white hover:bg-blue-50/30 border-l-[3px] border-l-blue-300'
                  }`}
                >
                  <div className="flex items-start gap-3">

                    {/* Priority + unread column */}
                    <div className="flex flex-col items-center gap-2 pt-1 shrink-0 w-3">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${pCfg.dot}`} />
                      {!isRead && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">

                      {/* Row 1: Subject + date */}
                      <div className="flex items-center gap-2 mb-0.5">
                        {isPinned && <Pin className="h-3 w-3 text-amber-500 shrink-0" />}
                        <span className={`flex-1 text-sm truncate ${!isRead ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>
                          {subject || '(No content)'}
                        </span>
                        <span className="text-[11px] text-slate-400 shrink-0">{relativeDate(msg.created_at)}</span>
                      </div>

                      {/* Row 2: Preview */}
                      <p className="text-[12px] text-slate-400 leading-snug truncate mb-2">
                        {preview}
                      </p>

                      {/* Row 3: Metadata chips */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${pCfg.bg} ${pCfg.text}`}>
                          {pCfg.label}
                        </span>
                        <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full capitalize">
                          {msg.channel.name.replace(/-/g, ' ')}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] text-slate-400">
                          <MiniAvatar author={msg.author} userId={msg.user_id} />
                          {authorName(msg.author)}
                        </span>
                      </div>
                    </div>

                    {/* Arrow indicator */}
                    {isSelected && <ChevronRight className="h-4 w-4 text-[#1e3a5f] shrink-0 mt-1" />}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── RIGHT: DETAIL ──────────────────────────────────────────────────── */}
      <div className="w-[360px] shrink-0 flex flex-col bg-white">
        {selectedMessage ? (
          <>
            {/* Detail header */}
            <div className="shrink-0 px-5 pt-5 pb-4 border-b border-slate-100 space-y-4">

              {/* Badges row */}
              <div className="flex items-center gap-2 flex-wrap">
                {(() => {
                  const p = PRIORITY_CONFIG[selectedMessage.priority];
                  return (
                    <span className={`text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${p.bg} ${p.text}`}>
                      {p.label} Priority
                    </span>
                  );
                })()}
                <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full capitalize">
                  {selectedMessage.channel.name.replace(/-/g, ' ')}
                </span>
                <span className="text-[10px] font-medium text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full capitalize">
                  {selectedMessage.channel.channel_type}
                </span>
              </div>

              {/* Author card */}
              <div className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-xl px-3 py-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[13px] font-bold text-white shrink-0"
                  style={{ backgroundColor: avatarColor(selectedMessage.user_id) }}>
                  {authorInitials(selectedMessage.author)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{authorName(selectedMessage.author)}</p>
                  {selectedMessage.author?.job_title && (
                    <p className="text-[11px] text-slate-400">{selectedMessage.author.job_title}</p>
                  )}
                </div>
              </div>

              {/* Timestamp */}
              <p className="text-[11px] text-slate-400">{fullDate(selectedMessage.created_at)}</p>
            </div>

            {/* Message body */}
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5">
              <FieldLabel>Message</FieldLabel>
              <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-4">
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {selectedMessage.content}
                </p>
              </div>

              {/* Channel info */}
              <div className="mt-5 space-y-3">
                <FieldLabel>Channel Details</FieldLabel>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Channel</span>
                    <span className="font-medium text-slate-700 capitalize">{selectedMessage.channel.name.replace(/-/g, ' ')}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Type</span>
                    <span className="font-medium text-slate-700 capitalize">{selectedMessage.channel.channel_type}</span>
                  </div>
                  {selectedMessage.channel.description && (
                    <div className="flex items-start justify-between gap-3 text-xs">
                      <span className="text-slate-400 shrink-0">About</span>
                      <span className="font-medium text-slate-700 text-right">{selectedMessage.channel.description}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Action bar */}
            <div className="shrink-0 flex items-center gap-2 px-5 py-3.5 border-t border-slate-100 bg-slate-50/50">
              <button
                onClick={() => markRead(selectedMessage.id)}
                title="Mark as read"
                className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-2 rounded-xl hover:bg-white border border-transparent hover:border-slate-200 transition-all"
              >
                <Eye className="h-3.5 w-3.5" />
                Read
              </button>
              <button
                onClick={() => togglePin(selectedMessage.id)}
                title={pinnedIds.has(selectedMessage.id) ? 'Unpin' : 'Pin'}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl border transition-all ${pinnedIds.has(selectedMessage.id) ? 'text-amber-600 bg-amber-50 border-amber-200' : 'text-slate-500 hover:text-amber-600 border-transparent hover:border-amber-200 hover:bg-amber-50'}`}
              >
                {pinnedIds.has(selectedMessage.id) ? <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" /> : <Star className="h-3.5 w-3.5" />}
                {pinnedIds.has(selectedMessage.id) ? 'Pinned' : 'Pin'}
              </button>
              <div className="flex-1" />
              {selectedMessage.channel.channel_type !== 'announcement' && (
                <button
                  onClick={() => { setComposeChannelId(selectedMessage.channel_id); setShowCompose(true); }}
                  className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#1e3a5f] hover:bg-[#16304f] px-4 py-2 rounded-xl transition-colors"
                >
                  <Send className="h-3.5 w-3.5" />
                  Reply
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
              <Mail className="h-8 w-8 text-slate-300" />
            </div>
            <p className="text-sm font-semibold text-slate-500">No message selected</p>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Select a communication from the list to view its full content and details.
            </p>
          </div>
        )}
      </div>

      {/* ── COMPOSE MODAL ──────────────────────────────────────────────────── */}
      {showCompose && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) { setShowCompose(false); setComposeChannelId(''); setComposeContent(''); } }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">

            {/* Modal header */}
            <div className="px-6 py-4 border-b border-[#16304f] bg-[#1e3a5f] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Compose Communication</h3>
                <p className="text-[12px] text-white/60 mt-0.5">Post a message to a communication channel</p>
              </div>
              <button
                onClick={() => { setShowCompose(false); setComposeChannelId(''); setComposeContent(''); }}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCompose} className="p-6 space-y-5">

              {/* Channel select */}
              <div>
                <FieldLabel>Channel *</FieldLabel>
                <select
                  value={composeChannelId}
                  onChange={e => setComposeChannelId(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-700 bg-slate-50 focus:border-[#1e3a5f] focus:ring-2 focus:ring-[#1e3a5f]/10 outline-none transition-all"
                >
                  <option value="">Select a channel…</option>
                  {channels.map(ch => (
                    <option key={ch.id} value={ch.id}>
                      {ch.name.replace(/-/g, ' ')} ({ch.channel_type})
                    </option>
                  ))}
                </select>
              </div>

              {/* Message */}
              <div>
                <FieldLabel>Message *</FieldLabel>
                <textarea
                  value={composeContent}
                  onChange={e => setComposeContent(e.target.value)}
                  placeholder="Write your communication here…&#10;&#10;Use URGENT or EMERGENCY prefix to flag critical messages."
                  rows={6}
                  required
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder:text-slate-300 bg-slate-50 focus:border-[#1e3a5f] focus:ring-2 focus:ring-[#1e3a5f]/10 outline-none resize-none transition-all"
                />
                <p className="text-[11px] text-slate-400 mt-1.5">
                  Tip: Start with <code className="bg-slate-100 px-1 rounded">URGENT:</code> or <code className="bg-slate-100 px-1 rounded">EMERGENCY:</code> to flag critical communications.
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowCompose(false); setComposeChannelId(''); setComposeContent(''); }}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!composeContent.trim() || !composeChannelId || composeSending}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1e3a5f] hover:bg-[#16304f] disabled:opacity-50 text-white text-sm font-semibold transition-colors"
                >
                  {composeSending
                    ? <><Loader2 className="h-4 w-4 animate-spin" />Sending…</>
                    : <><Send className="h-4 w-4" />Post Message</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
