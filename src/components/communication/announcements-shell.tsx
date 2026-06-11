'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Megaphone, Building2, Users, GraduationCap, AlertTriangle,
  Search, Plus, Pin, Star, Eye, Send, X, Inbox, Loader2,
  Settings, ChevronRight, Bell, Calendar,
} from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  getMessages, sendMessage as sendMessageAction,
  type Channel, type Message, type MessageAuthor,
} from '@/lib/actions/communication';
import type { AppRole } from '@/types/database';

// ── Types ─────────────────────────────────────────────────────────────────────
type Priority = 'emergency' | 'high' | 'medium' | 'normal';
type CategoryId = 'all' | 'leadership' | 'hr' | 'hospital' | 'training' | 'emergency' | 'operations' | 'events';

interface EnrichedAnnouncement extends Message {
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
  { id: 'all',        label: 'All Notices',          icon: Inbox,         accent: 'text-slate-600',  match: () => true },
  { id: 'leadership', label: 'Leadership',            icon: Megaphone,     accent: 'text-amber-600',  match: ch => /announc|leadership|executive/i.test(ch.name) },
  { id: 'hr',         label: 'HR & People',           icon: Users,         accent: 'text-purple-600', match: ch => /\bhr\b|human.res|policy|payroll|staffing/i.test(ch.name) },
  { id: 'hospital',   label: 'Hospital Updates',      icon: Building2,     accent: 'text-blue-600',   match: ch => /hospital|clinic/i.test(ch.name) },
  { id: 'training',   label: 'Training & Education',  icon: GraduationCap, accent: 'text-green-600',  match: ch => /train|educat|learning|course/i.test(ch.name) },
  { id: 'emergency',  label: 'Emergency Alerts',      icon: AlertTriangle, accent: 'text-red-600',    match: ch => /emerg|urgent|alert|critical/i.test(ch.name) },
  { id: 'operations', label: 'Operations',            icon: Settings,      accent: 'text-orange-600', match: ch => /operat|ops\b|facilit|mainten/i.test(ch.name) },
  { id: 'events',     label: 'Events & Meetings',     icon: Calendar,      accent: 'text-indigo-600', match: ch => /event|meet|schedule/i.test(ch.name) },
];

const PRIORITY_CONFIG: Record<Priority, { label: string; dot: string; bg: string; text: string; bar: string }> = {
  emergency: { label: 'Emergency', dot: 'bg-red-600',    bg: 'bg-red-50',    text: 'text-red-700',    bar: 'bg-red-600'    },
  high:      { label: 'High',      dot: 'bg-amber-500',  bg: 'bg-amber-50',  text: 'text-amber-700',  bar: 'bg-amber-500'  },
  medium:    { label: 'Medium',    dot: 'bg-blue-400',   bg: 'bg-blue-50',   text: 'text-blue-600',   bar: 'bg-blue-400'   },
  normal:    { label: 'Notice',    dot: 'bg-slate-300',  bg: 'bg-slate-50',  text: 'text-slate-500',  bar: 'bg-slate-300'  },
};

const POSTER_ROLES: AppRole[] = ['super_admin', 'org_admin', 'hospital_admin', 'practice_manager', 'hr'];

// ── Helpers ───────────────────────────────────────────────────────────────────
const AVATAR_COLORS = ['#8B5CF6','#3B82F6','#10B981','#F59E0B','#EF4444','#06B6D4','#EC4899'];

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
  if (upper.includes('URGENT') || upper.includes('ACTION REQUIRED')) return 'high';
  if (ch.channel_type === 'announcement') return 'high';
  if (upper.includes('IMPORTANT') || upper.includes('REMINDER')) return 'medium';
  return 'normal';
}

function relativeDate(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fullDateTime(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    + ' at '
    + new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ── Component ─────────────────────────────────────────────────────────────────
interface AnnouncementsShellProps {
  initialChannels: Channel[];
  currentUserId: string;
  role: AppRole | null;
}

export function AnnouncementsShell({ initialChannels, currentUserId, role }: AnnouncementsShellProps) {
  const [channels]  = useState<Channel[]>(initialChannels.filter(ch => ch.channel_type === 'announcement'));
  const [allItems, setAllItems]   = useState<EnrichedAnnouncement[]>([]);
  const [loading, setLoading]     = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<CategoryId>('all');
  const [readIds, setReadIds]     = useState<Set<string>>(new Set());
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [search, setSearch]       = useState('');
  const [showPost, setShowPost]   = useState(false);
  const [postChannel, setPostChannel] = useState('');
  const [postContent, setPostContent] = useState('');
  const [posting, setPosting]     = useState(false);

  const canPost = role ? POSTER_ROLES.includes(role) : false;

  // Load all announcement channel messages
  useEffect(() => {
    if (channels.length === 0) { setLoading(false); return; }
    setLoading(true);
    Promise.all(channels.map(ch => getMessages(ch.id).then(r => ({ ch, msgs: r.success ? r.data : [] }))))
      .then(results => {
        const enriched: EnrichedAnnouncement[] = [];
        for (const { ch, msgs } of results)
          for (const msg of msgs)
            enriched.push({ ...msg, channel: ch, priority: detectPriority(msg, ch) });
        enriched.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setAllItems(enriched);
        setLoading(false);
      });
  }, [channels]);

  // Realtime
  useEffect(() => {
    if (channels.length === 0) return;
    const supabase = createSupabaseBrowserClient();
    const subs = channels.map(ch =>
      supabase
        .channel(`ann-${ch.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${ch.id}` },
          payload => {
            const raw = payload.new as Record<string, unknown>;
            const stub: Message = {
              id: raw.id as string, channel_id: raw.channel_id as string, user_id: raw.user_id as string,
              content: raw.content as string, content_type: 'text', parent_id: null,
              is_edited: false, is_deleted: false,
              created_at: raw.created_at as string, updated_at: raw.created_at as string, author: null,
            };
            setAllItems(prev => [{ ...stub, channel: ch, priority: detectPriority(stub, ch) }, ...prev.filter(m => m.id !== stub.id)]);
          })
        .subscribe()
    );
    return () => { subs.forEach(s => supabase.removeChannel(s)); };
  }, [channels]);

  const stats = useMemo(() => ({
    unread:    allItems.filter(m => !readIds.has(m.id)).length,
    pinned:    allItems.filter(m => pinnedIds.has(m.id)).length,
    emergency: allItems.filter(m => m.priority === 'emergency').length,
    today:     allItems.filter(m => relativeDate(m.created_at) === 'Today').length,
  }), [allItems, readIds, pinnedIds]);

  const categoryCounts = useMemo(() => {
    const out: Partial<Record<CategoryId, number>> = {};
    for (const cat of CATEGORIES)
      out[cat.id] = allItems.filter(m => !readIds.has(m.id) && cat.match(m.channel)).length;
    return out as Record<CategoryId, number>;
  }, [allItems, readIds]);

  const filteredItems = useMemo(() => {
    const cat = CATEGORIES.find(c => c.id === activeCategory)!;
    let list = allItems.filter(m => cat.match(m.channel));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(m => m.content.toLowerCase().includes(q) || authorName(m.author).toLowerCase().includes(q));
    }
    return list.sort((a, b) => {
      const ap = pinnedIds.has(a.id), bp = pinnedIds.has(b.id);
      if (ap && !bp) return -1; if (!ap && bp) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [allItems, activeCategory, search, pinnedIds]);

  const selected = filteredItems.find(m => m.id === selectedId) ?? null;
  const currentCat = CATEGORIES.find(c => c.id === activeCategory)!;

  const markRead  = (id: string) => setReadIds(prev => { const n = new Set(prev); n.add(id); return n; });
  const togglePin = (id: string) => setPinnedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const handleSelect = (id: string) => { setSelectedId(id); markRead(id); };

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postContent.trim() || !postChannel || posting) return;
    setPosting(true);
    const result = await sendMessageAction(postChannel, postContent.trim());
    if (result.success) {
      const ch = channels.find(c => c.id === postChannel)!;
      const enriched: EnrichedAnnouncement = { ...result.data, channel: ch, priority: detectPriority(result.data, ch) };
      setAllItems(prev => [enriched, ...prev]);
      setReadIds(prev => { const n = new Set(prev); n.add(enriched.id); return n; });
      setShowPost(false); setPostContent(''); setPostChannel('');
    }
    setPosting(false);
  };

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden rounded-xl border border-slate-200 shadow-sm bg-white">

      {/* ── LEFT: Category Nav ───────────────────────────────────────────────── */}
      <aside className="w-56 shrink-0 flex flex-col border-r border-slate-100 bg-white">

        <div className="px-4 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#1e3a5f] flex items-center justify-center shrink-0">
              <Megaphone className="h-3.5 w-3.5 text-white" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900 leading-tight">Notice Board</p>
              <p className="text-[10px] text-slate-400">Official Announcements</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          {CATEGORIES.map(cat => {
            const active = activeCategory === cat.id;
            const count  = categoryCounts[cat.id];
            return (
              <button key={cat.id} onClick={() => setActiveCategory(cat.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all ${active ? 'bg-[#1e3a5f] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}>
                <cat.icon className={`h-4 w-4 shrink-0 ${active ? 'text-white' : cat.accent}`} />
                <span className="flex-1 text-xs font-medium truncate">{cat.label}</span>
                {count > 0 && !active && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${cat.id === 'emergency' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {canPost && (
          <div className="p-3 border-t border-slate-100">
            <button
              onClick={() => setShowPost(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1e3a5f] hover:bg-[#16304f] text-white text-xs font-semibold rounded-xl transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Post Announcement
            </button>
          </div>
        )}
      </aside>

      {/* ── CENTER: Announcement List ─────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col border-r border-slate-100">

        {/* Stats */}
        <div className="shrink-0 grid grid-cols-4 gap-0 border-b border-slate-100 bg-white">
          {[
            { label: 'Unread',    value: stats.unread,    icon: Bell,          bg: 'bg-blue-50',   text: 'text-blue-700'  },
            { label: 'Today',     value: stats.today,     icon: Megaphone,     bg: 'bg-amber-50',  text: 'text-amber-700' },
            { label: 'Pinned',    value: stats.pinned,    icon: Pin,           bg: 'bg-indigo-50', text: 'text-indigo-700'},
            { label: 'Emergency', value: stats.emergency, icon: AlertTriangle, bg: 'bg-red-50',    text: 'text-red-700'   },
          ].map((s, i) => (
            <div key={s.label} className={`flex items-center gap-3 px-4 py-3.5 ${i < 3 ? 'border-r border-slate-100' : ''} ${s.bg}`}>
              <s.icon className={`h-4 w-4 shrink-0 ${s.text}`} />
              <div>
                <p className={`text-xl font-bold leading-none ${s.text}`}>{s.value}</p>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Search + toolbar */}
        <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-white">
          <div className="flex-1 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
            <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search announcements…"
              className="flex-1 text-sm bg-transparent outline-none text-slate-700 placeholder:text-slate-400 min-w-0" />
            {search && <button onClick={() => setSearch('')} className="text-slate-300 hover:text-slate-500"><X className="h-3.5 w-3.5" /></button>}
          </div>
        </div>

        {/* List header */}
        <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-slate-100 bg-slate-50">
          <currentCat.icon className={`h-3.5 w-3.5 shrink-0 ${currentCat.accent}`} />
          <span className="text-xs font-semibold text-slate-700">{currentCat.label}</span>
          <span className="text-xs text-slate-400">· {filteredItems.length} notice{filteredItems.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Announcement rows */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
              <p className="text-sm text-slate-400">Loading notices…</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-12 px-6">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                <Megaphone className="h-7 w-7 text-slate-300" />
              </div>
              <p className="text-sm font-semibold text-slate-500">No announcements</p>
              <p className="text-xs text-slate-400 mt-1">{search ? 'Try a different search.' : 'No notices in this category.'}</p>
            </div>
          ) : (
            filteredItems.map(item => {
              const isSelected = selectedId === item.id;
              const isRead     = readIds.has(item.id);
              const isPinned   = pinnedIds.has(item.id);
              const pCfg       = PRIORITY_CONFIG[item.priority];
              const subject    = item.content.replace(/\n+/g, ' ').slice(0, 72) + (item.content.length > 72 ? '…' : '');
              const preview    = item.content.replace(/\n+/g, ' ').slice(0, 115) + (item.content.length > 115 ? '…' : '');

              return (
                <button key={item.id} onClick={() => handleSelect(item.id)}
                  className={`w-full text-left border-b border-slate-100 transition-all group ${
                    isSelected
                      ? 'bg-blue-50/70 border-l-[3px] border-l-[#1e3a5f]'
                      : isRead
                        ? 'bg-white hover:bg-slate-50 border-l-[3px] border-l-transparent'
                        : 'bg-white hover:bg-amber-50/30 border-l-[3px] border-l-amber-400'
                  }`}>
                  {/* Priority bar */}
                  <div className={`h-0.5 w-full ${pCfg.bar} opacity-60`} />
                  <div className="px-4 py-4">
                    <div className="flex items-start gap-3">
                      <div className="flex flex-col items-center gap-2 pt-0.5 shrink-0 w-3">
                        <span className={`w-2.5 h-2.5 rounded-full ${pCfg.dot}`} />
                        {!isRead && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {isPinned && <Pin className="h-3 w-3 text-amber-500 shrink-0" />}
                          <span className={`flex-1 text-sm truncate ${!isRead ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>
                            {subject || '(No content)'}
                          </span>
                          <span className="text-[11px] text-slate-400 shrink-0">{relativeDate(item.created_at)}</span>
                        </div>
                        <p className="text-[12px] text-slate-400 leading-snug truncate mb-2">{preview}</p>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${pCfg.bg} ${pCfg.text}`}>
                            {pCfg.label}
                          </span>
                          <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full capitalize">
                            {item.channel.name.replace(/-/g, ' ')}
                          </span>
                          <span className="text-[11px] text-slate-400">— {authorName(item.author)}</span>
                        </div>
                      </div>
                      {isSelected && <ChevronRight className="h-4 w-4 text-[#1e3a5f] shrink-0 mt-1" />}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── RIGHT: Detail Panel ───────────────────────────────────────────────── */}
      <div className="w-[360px] shrink-0 flex flex-col bg-white">
        {selected ? (
          <>
            {/* Priority stripe */}
            <div className={`h-1 w-full ${PRIORITY_CONFIG[selected.priority].bar}`} />

            <div className="shrink-0 px-5 pt-5 pb-4 border-b border-slate-100 space-y-4">
              {/* Badges */}
              <div className="flex items-center gap-2 flex-wrap">
                {(() => { const p = PRIORITY_CONFIG[selected.priority]; return (
                  <span className={`text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${p.bg} ${p.text}`}>
                    {p.label}
                  </span>
                ); })()}
                <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full capitalize">
                  {selected.channel.name.replace(/-/g, ' ')}
                </span>
                <span className="text-[10px] font-medium text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full">
                  Official Announcement
                </span>
              </div>

              {/* Author */}
              <div className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-xl px-3 py-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[13px] font-bold text-white shrink-0"
                  style={{ backgroundColor: avatarColor(selected.user_id) }}>
                  {authorInitials(selected.author)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{authorName(selected.author)}</p>
                  {selected.author?.job_title && <p className="text-[11px] text-slate-400">{selected.author.job_title}</p>}
                </div>
              </div>

              <p className="text-[11px] text-slate-400">{fullDateTime(selected.created_at)}</p>
            </div>

            {/* Full content */}
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">Announcement</p>
              <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-4">
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{selected.content}</p>
              </div>

              <div className="mt-5 space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Details</p>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Channel</span>
                    <span className="font-medium text-slate-700 capitalize">{selected.channel.name.replace(/-/g, ' ')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Posted</span>
                    <span className="font-medium text-slate-700">{relativeDate(selected.created_at)}</span>
                  </div>
                  {selected.channel.description && (
                    <div className="flex items-start gap-3 justify-between">
                      <span className="text-slate-400 shrink-0">About</span>
                      <span className="font-medium text-slate-700 text-right">{selected.channel.description}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Action bar */}
            <div className="shrink-0 flex items-center gap-2 px-5 py-3.5 border-t border-slate-100 bg-slate-50/50">
              <button onClick={() => markRead(selected.id)}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-2 rounded-xl hover:bg-white border border-transparent hover:border-slate-200 transition-all">
                <Eye className="h-3.5 w-3.5" />
                Mark Read
              </button>
              <button onClick={() => togglePin(selected.id)}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl border transition-all ${
                  pinnedIds.has(selected.id)
                    ? 'text-amber-600 bg-amber-50 border-amber-200'
                    : 'text-slate-500 hover:text-amber-600 border-transparent hover:border-amber-200 hover:bg-amber-50'
                }`}>
                <Star className={`h-3.5 w-3.5 ${pinnedIds.has(selected.id) ? 'fill-amber-500 text-amber-500' : ''}`} />
                {pinnedIds.has(selected.id) ? 'Pinned' : 'Pin'}
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
              <Megaphone className="h-8 w-8 text-slate-300" />
            </div>
            <p className="text-sm font-semibold text-slate-500">Select an announcement</p>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Choose a notice from the list to read the full announcement.
            </p>
          </div>
        )}
      </div>

      {/* ── POST MODAL ─────────────────────────────────────────────────────────── */}
      {showPost && canPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) { setShowPost(false); setPostContent(''); } }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-[#16304f] bg-[#1e3a5f] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Post Announcement</h3>
                <p className="text-[12px] text-white/60 mt-0.5">This will be visible to all staff</p>
              </div>
              <button onClick={() => { setShowPost(false); setPostContent(''); }}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handlePost} className="p-6 space-y-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Channel *</p>
                <select value={postChannel} onChange={e => setPostChannel(e.target.value)} required
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-700 bg-slate-50 focus:border-[#1e3a5f] focus:ring-2 focus:ring-[#1e3a5f]/10 outline-none transition-all">
                  <option value="">Select announcement channel…</option>
                  {channels.map(ch => <option key={ch.id} value={ch.id}>{ch.name.replace(/-/g, ' ')}</option>)}
                </select>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Announcement *</p>
                <textarea value={postContent} onChange={e => setPostContent(e.target.value)}
                  placeholder="Write the announcement here…&#10;&#10;Tip: Start with URGENT: or EMERGENCY: to flag critical notices."
                  rows={7} required
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder:text-slate-300 bg-slate-50 focus:border-[#1e3a5f] focus:ring-2 focus:ring-[#1e3a5f]/10 outline-none resize-none transition-all" />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { setShowPost(false); setPostContent(''); }}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={!postContent.trim() || !postChannel || posting}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1e3a5f] hover:bg-[#16304f] disabled:opacity-50 text-white text-sm font-semibold transition-colors">
                  {posting ? <><Loader2 className="h-4 w-4 animate-spin" />Posting…</> : <><Send className="h-4 w-4" />Post Announcement</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
