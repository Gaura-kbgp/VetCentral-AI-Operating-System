'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Megaphone, Search, X, Loader2, Send, AlertTriangle,
  Users, ChevronDown, ChevronUp, Sparkles, Clock,
  Image as ImageIcon, Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  getMessages, postAnnouncement,
  type Channel, type Message, type MessageAuthor,
} from '@/lib/actions/communication';
import type { AppRole } from '@/types/database';

// ─────────────────────────────────────────────────────────────
// Types & config
// ─────────────────────────────────────────────────────────────
type Priority = 'emergency' | 'urgent' | 'normal';

interface Announcement extends Message {
  channel: Channel;
  priority: Priority;
}

interface Announcer {
  user_id: string;
  author: MessageAuthor | null;
  count: number;
  latest: string;
}

const POSTER_ROLES: AppRole[] = ['super_admin', 'org_admin', 'hospital_admin', 'practice_manager', 'hr'];

const AVATAR_COLORS = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#06B6D4', '#EC4899', '#6366F1'];

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

// content may be plain text OR JSON { text, images, priority? } when photos/priority set
function parseAnnouncement(content: string): { text: string; images: string[]; priority?: Priority } {
  if (content.startsWith('{')) {
    try {
      const parsed = JSON.parse(content);
      if (typeof parsed?.text === 'string') {
        return {
          text: parsed.text,
          images: Array.isArray(parsed.images) ? parsed.images : [],
          priority: parsed.priority as Priority | undefined,
        };
      }
    } catch { /* fall through to plain text */ }
  }
  return { text: content, images: [] };
}

function detectPriority(content: string): Priority {
  const p = parseAnnouncement(content);
  if (p.priority) return p.priority;
  const up = p.text.toUpperCase();
  if (up.includes('EMERGENCY') || up.includes('CODE RED') || up.includes('CRITICAL')) return 'emergency';
  if (up.includes('URGENT') || up.includes('ACTION REQUIRED') || up.includes('IMPORTANT')) return 'urgent';
  return 'normal';
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

// ─────────────────────────────────────────────────────────────
// Photo grid + lightbox
// ─────────────────────────────────────────────────────────────
function PhotoGrid({ images, onOpen }: { images: string[]; onOpen: (url: string) => void }) {
  if (images.length === 0) return null;
  if (images.length === 1) {
    return (
      <button onClick={() => onOpen(images[0])} className="block w-full mt-3 rounded-xl overflow-hidden border border-slate-100 group">
        <img src={images[0]} alt="" className="w-full max-h-96 object-cover group-hover:scale-[1.02] transition-transform duration-300" />
      </button>
    );
  }
  const shown = images.slice(0, 4);
  const extra = images.length - 4;
  return (
    <div className={cn('grid gap-1.5 mt-3 rounded-xl overflow-hidden', shown.length === 2 ? 'grid-cols-2' : 'grid-cols-2')}>
      {shown.map((url, i) => (
        <button
          key={i}
          onClick={() => onOpen(url)}
          className={cn(
            'relative block overflow-hidden border border-slate-100 group',
            shown.length === 3 && i === 0 ? 'row-span-2' : '',
          )}
        >
          <img src={url} alt="" className="w-full h-44 object-cover group-hover:scale-[1.03] transition-transform duration-300" />
          {i === 3 && extra > 0 && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <span className="text-white text-[18px] font-bold">+{extra}</span>
            </div>
          )}
        </button>
      ))}
    </div>
  );
}

function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm p-6" onClick={onClose}>
      <button className="absolute top-5 right-5 h-10 w-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors">
        <X className="h-5 w-5 text-white" />
      </button>
      <img src={url} alt="" className="max-w-full max-h-full rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Announcement card
// ─────────────────────────────────────────────────────────────
function AnnouncementCard({ item, onOpenImage }: { item: Announcement; onOpenImage: (url: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const { text, images } = parseAnnouncement(item.content);
  const isLong = text.length > 280;
  const shown = expanded || !isLong ? text : text.slice(0, 280).trimEnd() + '…';
  const name = authorName(item.author);

  return (
    <div className={cn(
      'bg-white rounded-2xl border shadow-sm overflow-hidden transition-shadow hover:shadow-md',
      item.priority === 'emergency' ? 'border-red-200' :
      item.priority === 'urgent'    ? 'border-amber-200' : 'border-slate-100',
    )}>
      {/* priority stripe */}
      {item.priority !== 'normal' && (
        <div className={cn('h-1 w-full', item.priority === 'emergency' ? 'bg-red-500' : 'bg-amber-400')} />
      )}

      <div className="p-5">
        {/* header: author + time */}
        <div className="flex items-start gap-3">
          <div
            className="h-11 w-11 rounded-full flex items-center justify-center text-white text-[14px] font-bold shrink-0 shadow-sm"
            style={{ backgroundColor: avatarColor(item.user_id) }}
          >
            {authorInitials(item.author)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[14.5px] font-bold text-slate-900">{name}</p>
              {item.priority === 'emergency' && (
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">
                  <AlertTriangle className="h-2.5 w-2.5" /> Emergency
                </span>
              )}
              {item.priority === 'urgent' && (
                <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
                  Urgent
                </span>
              )}
              {isToday(item.created_at) && item.priority === 'normal' && (
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">
                  <Sparkles className="h-2.5 w-2.5" /> New
                </span>
              )}
            </div>
            <p className="text-[12px] text-slate-400 mt-0.5">
              {item.author?.job_title ? `${item.author.job_title} · ` : ''}{timeAgo(item.created_at)}
            </p>
          </div>
        </div>

        {/* content */}
        {shown && (
          <p className="text-[14px] text-slate-700 leading-relaxed whitespace-pre-wrap mt-3.5">
            {shown}
          </p>
        )}

        {isLong && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1 text-[12.5px] font-semibold text-blue-600 hover:text-blue-700 mt-2 transition-colors"
          >
            {expanded ? <>Show less <ChevronUp className="h-3.5 w-3.5" /></> : <>Read more <ChevronDown className="h-3.5 w-3.5" /></>}
          </button>
        )}

        {/* photos */}
        <PhotoGrid images={images} onOpen={onOpenImage} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Shell
// ─────────────────────────────────────────────────────────────
interface AnnouncementsShellProps {
  initialChannels: Channel[];
  currentUserId: string;
  role: AppRole | null;
}

export function AnnouncementsShell({ initialChannels, currentUserId, role }: AnnouncementsShellProps) {
  const [channels] = useState<Channel[]>(initialChannels.filter(ch => ch.channel_type === 'announcement'));
  const [items, setItems]     = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [filterAuthor, setFilterAuthor] = useState<string | null>(null);

  // composer
  const [draft, setDraft]             = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [posting, setPosting]         = useState(false);
  const [photos, setPhotos]           = useState<Array<{ file: File; preview: string }>>([]);
  const [postErr, setPostErr]         = useState('');
  const [composerPriority, setComposerPriority] = useState<Priority>('normal');
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const canPost = role ? POSTER_ROLES.includes(role) : false;
  const postChannel = channels[0] ?? null;

  // ── load ──
  useEffect(() => {
    if (channels.length === 0) { setLoading(false); return; }
    Promise.all(channels.map(ch => getMessages(ch.id).then(r => ({ ch, msgs: r.success ? r.data : [] }))))
      .then(results => {
        const all: Announcement[] = [];
        for (const { ch, msgs } of results)
          for (const m of msgs)
            all.push({ ...m, channel: ch, priority: detectPriority(m.content) });
        all.sort((a, b) => b.created_at.localeCompare(a.created_at));
        setItems(all);
        setLoading(false);
      });
  }, [channels]);

  // ── realtime ──
  useEffect(() => {
    if (channels.length === 0) return;
    const supabase = createSupabaseBrowserClient();
    const subs = channels.map(ch =>
      supabase
        .channel(`ann-${ch.id}`)
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${ch.id}` },
          async payload => {
            const raw = payload.new as Record<string, unknown>;
            const uid = raw.user_id as string;
            let author: MessageAuthor | null = null;
            const { data } = await supabase
              .from('profiles').select('id,first_name,last_name,avatar_url,job_title').eq('id', uid).single();
            if (data) author = data as MessageAuthor;
            const ann: Announcement = {
              id: raw.id as string, channel_id: raw.channel_id as string, user_id: uid,
              content: raw.content as string, content_type: 'text', parent_id: null,
              is_edited: false, is_deleted: false,
              created_at: raw.created_at as string, updated_at: raw.created_at as string,
              author, channel: ch, priority: detectPriority(raw.content as string),
            };
            setItems(prev => prev.some(m => m.id === ann.id) ? prev : [ann, ...prev]);
          })
        .subscribe(),
    );
    return () => { subs.forEach(s => supabase.removeChannel(s)); };
  }, [channels]);

  // ── announcers (sidebar) ──
  const announcers: Announcer[] = useMemo(() => {
    const map = new Map<string, Announcer>();
    for (const m of items) {
      const e = map.get(m.user_id);
      if (e) {
        e.count++;
        if (m.created_at > e.latest) e.latest = m.created_at;
        if (!e.author && m.author) e.author = m.author;
      } else {
        map.set(m.user_id, { user_id: m.user_id, author: m.author, count: 1, latest: m.created_at });
      }
    }
    return [...map.values()].sort((a, b) => b.latest.localeCompare(a.latest));
  }, [items]);

  // ── filtered feed ──
  const feed = useMemo(() => {
    let list = items;
    if (filterAuthor) list = list.filter(m => m.user_id === filterAuthor);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(m =>
        parseAnnouncement(m.content).text.toLowerCase().includes(q) ||
        authorName(m.author).toLowerCase().includes(q));
    }
    return list;
  }, [items, filterAuthor, search]);

  const todayCount = items.filter(m => isToday(m.created_at)).length;
  const emergencyCount = items.filter(m => m.priority === 'emergency').length;

  // ── photos ──
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, 6 - photos.length);
    setPhotos(prev => [...prev, ...files.map(file => ({ file, preview: URL.createObjectURL(file) }))]);
    e.target.value = '';
  };

  const removePhoto = (i: number) => {
    setPhotos(prev => {
      URL.revokeObjectURL(prev[i].preview);
      return prev.filter((_, j) => j !== i);
    });
  };

  // ── post ──
  const handlePost = async () => {
    if ((!draft.trim() && photos.length === 0) || !postChannel || posting) return;
    setPosting(true);
    setPostErr('');

    // upload photos first
    const urls: string[] = [];
    for (const p of photos) {
      const fd = new FormData();
      fd.append('file', p.file);
      try {
        const res = await fetch('/api/v1/comm/upload', { method: 'POST', body: fd });
        const json = await res.json();
        if (json.success) urls.push(json.url);
        else { setPostErr(json.error ?? 'Photo upload failed'); setPosting(false); return; }
      } catch {
        setPostErr('Photo upload failed — check your connection');
        setPosting(false);
        return;
      }
    }

    const r = await postAnnouncement(postChannel.id, draft.trim(), urls, composerPriority);
    if (r.success) {
      const ann: Announcement = { ...r.data, channel: postChannel, priority: detectPriority(r.data.content) };
      setItems(prev => prev.some(m => m.id === ann.id) ? prev : [ann, ...prev]);
      photos.forEach(p => URL.revokeObjectURL(p.preview));
      setDraft('');
      setPhotos([]);
      setComposerPriority('normal');
      setComposerOpen(false);
    } else {
      setPostErr(r.error ?? 'Could not post announcement');
    }
    setPosting(false);
  };

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden gap-4">

      {/* ════ LEFT: Announcers sidebar ════ */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-4 border-b border-slate-100">
          <p className="text-[13px] font-bold text-slate-900 flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-500" /> Announcers
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">People posting updates</p>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {/* All */}
          <button
            onClick={() => setFilterAuthor(null)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors',
              !filterAuthor ? 'bg-[#1e3a5f] text-white shadow-sm' : 'hover:bg-slate-50 text-slate-700',
            )}
          >
            <div className={cn(
              'h-9 w-9 rounded-full flex items-center justify-center shrink-0',
              !filterAuthor ? 'bg-white/15' : 'bg-slate-100',
            )}>
              <Megaphone className={cn('h-4 w-4', !filterAuthor ? 'text-white' : 'text-slate-500')} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold truncate">All Announcements</p>
              <p className={cn('text-[11px]', !filterAuthor ? 'text-white/60' : 'text-slate-400')}>
                {items.length} notice{items.length !== 1 ? 's' : ''}
              </p>
            </div>
          </button>

          {/* per-announcer */}
          {announcers.map(a => {
            const name = authorName(a.author);
            const active = filterAuthor === a.user_id;
            return (
              <button
                key={a.user_id}
                onClick={() => setFilterAuthor(active ? null : a.user_id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors',
                  active ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50 border border-transparent',
                )}
              >
                <div
                  className="h-9 w-9 rounded-full flex items-center justify-center text-white text-[12px] font-bold shrink-0"
                  style={{ backgroundColor: avatarColor(a.user_id) }}
                >
                  {authorInitials(a.author)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn('text-[13px] font-semibold truncate', active ? 'text-blue-800' : 'text-slate-800')}>{name}</p>
                  <p className="text-[11px] text-slate-400 truncate">
                    {a.author?.job_title ?? `${a.count} announcement${a.count !== 1 ? 's' : ''}`}
                  </p>
                </div>
                <span className={cn(
                  'text-[10.5px] font-bold px-2 py-0.5 rounded-full shrink-0',
                  active ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500',
                )}>
                  {a.count}
                </span>
              </button>
            );
          })}

          {!loading && announcers.length === 0 && (
            <p className="text-[12px] text-slate-400 text-center py-8">No announcers yet</p>
          )}
        </div>

        {/* mini stats */}
        <div className="grid grid-cols-2 border-t border-slate-100">
          <div className="flex flex-col items-center py-3 border-r border-slate-100">
            <p className="text-[18px] font-bold text-blue-600 leading-none">{todayCount}</p>
            <p className="text-[10px] text-slate-400 font-medium mt-1 flex items-center gap-1"><Clock className="h-2.5 w-2.5" /> Today</p>
          </div>
          <div className="flex flex-col items-center py-3">
            <p className="text-[18px] font-bold text-red-500 leading-none">{emergencyCount}</p>
            <p className="text-[10px] text-slate-400 font-medium mt-1 flex items-center gap-1"><AlertTriangle className="h-2.5 w-2.5" /> Emergency</p>
          </div>
        </div>
      </aside>

      {/* ════ RIGHT: Feed ════ */}
      <div className="flex-1 min-w-0 flex flex-col gap-3 overflow-hidden">

        {/* search bar */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex-1 flex items-center gap-2 bg-white border border-slate-200 rounded-2xl px-4 py-2.5 shadow-sm">
            <Search className="h-4 w-4 text-slate-300 shrink-0" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search announcements or people…"
              className="flex-1 text-[13.5px] bg-transparent outline-none text-slate-700 placeholder:text-slate-300 min-w-0"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-slate-300 hover:text-slate-500">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {filterAuthor && (
            <button
              onClick={() => setFilterAuthor(null)}
              className="flex items-center gap-1.5 h-10 px-4 rounded-2xl bg-blue-50 border border-blue-200 text-blue-700 text-[12.5px] font-semibold shrink-0 hover:bg-blue-100 transition-colors"
            >
              {authorName(announcers.find(a => a.user_id === filterAuthor)?.author ?? null)}
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* feed scroll area */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pb-4 pr-1">

          {/* composer (allowed roles only) */}
          {canPost && postChannel && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              {!composerOpen ? (
                <button
                  onClick={() => { setComposerOpen(true); setTimeout(() => composerRef.current?.focus(), 50); }}
                  className="w-full flex items-center gap-3 text-left"
                >
                  <div className="h-10 w-10 rounded-full bg-[#1e3a5f] flex items-center justify-center shrink-0">
                    <Megaphone className="h-4.5 w-4.5 text-white" />
                  </div>
                  <span className="flex-1 h-10 flex items-center px-4 rounded-full bg-slate-50 border border-slate-200 text-[13.5px] text-slate-400 hover:bg-slate-100 transition-colors">
                    Share an announcement with all staff…
                  </span>
                </button>
              ) : (
                <div className="space-y-3">
                  {/* priority selector */}
                  <div className="flex items-center gap-2">
                    <span className="text-[11.5px] font-semibold text-slate-400 uppercase tracking-wide shrink-0">Priority:</span>
                    {(['normal', 'urgent', 'emergency'] as Priority[]).map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setComposerPriority(p)}
                        className={cn(
                          'flex items-center gap-1.5 h-7 px-3 rounded-full text-[11.5px] font-bold border transition-colors capitalize',
                          composerPriority === p
                            ? p === 'emergency' ? 'bg-red-500 text-white border-red-500'
                            : p === 'urgent'    ? 'bg-amber-400 text-white border-amber-400'
                            : 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                            : p === 'emergency' ? 'bg-red-50 text-red-400 border-red-200 hover:bg-red-100'
                            : p === 'urgent'    ? 'bg-amber-50 text-amber-500 border-amber-200 hover:bg-amber-100'
                            : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100',
                        )}
                      >
                        {p === 'emergency' && <AlertTriangle className="h-3 w-3" />}
                        {p}
                      </button>
                    ))}
                  </div>

                  <textarea
                    ref={composerRef}
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    rows={4}
                    placeholder={
                      composerPriority === 'emergency'
                        ? 'Describe the emergency situation…'
                        : composerPriority === 'urgent'
                        ? 'Describe the urgent matter…'
                        : 'Write your announcement…'
                    }
                    className={cn(
                      'w-full px-4 py-3 rounded-xl border bg-slate-50 text-[14px] text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:bg-white resize-none transition-colors',
                      composerPriority === 'emergency' ? 'border-red-200 focus:ring-red-300'
                      : composerPriority === 'urgent'   ? 'border-amber-200 focus:ring-amber-300'
                      : 'border-slate-200 focus:ring-blue-300',
                    )}
                  />

                  {/* photo previews */}
                  {photos.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {photos.map((p, i) => (
                        <div key={i} className="relative group">
                          <img src={p.preview} alt="" className="h-20 w-20 object-cover rounded-xl border border-slate-200" />
                          <button
                            onClick={() => removePhoto(i)}
                            className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-slate-700 hover:bg-red-500 text-white flex items-center justify-center shadow transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      {photos.length < 6 && (
                        <button
                          onClick={() => photoInputRef.current?.click()}
                          className="h-20 w-20 rounded-xl border-2 border-dashed border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 flex items-center justify-center text-slate-300 hover:text-blue-400 transition-colors"
                        >
                          <Plus className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  )}

                  {postErr && <p className="text-[12px] text-red-500">{postErr}</p>}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => photoInputRef.current?.click()}
                        className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-[12.5px] font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 transition-colors"
                      >
                        <ImageIcon className="h-4 w-4" /> Add Photos
                      </button>
                      <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        multiple
                        className="hidden"
                        onChange={handlePhotoSelect}
                      />
                      <p className="text-[11.5px] text-slate-400 hidden sm:block">Visible to all staff instantly</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { photos.forEach(p => URL.revokeObjectURL(p.preview)); setComposerOpen(false); setDraft(''); setPhotos([]); setPostErr(''); setComposerPriority('normal'); }}
                        className="h-9 px-4 rounded-xl border border-slate-200 text-[13px] font-medium text-slate-500 hover:bg-slate-50 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handlePost}
                        disabled={(!draft.trim() && photos.length === 0) || posting}
                        className="flex items-center gap-2 h-9 px-5 rounded-xl bg-[#1e3a5f] hover:bg-[#16304f] disabled:opacity-50 text-white text-[13px] font-semibold transition-colors"
                      >
                        {posting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        {posting ? 'Posting…' : 'Post'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* cards */}
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-20">
              <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
              <p className="text-[13px] text-slate-400">Loading announcements…</p>
            </div>
          ) : feed.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-20 bg-white rounded-2xl border border-slate-100">
              <div className="h-14 w-14 rounded-2xl bg-slate-50 flex items-center justify-center">
                <Megaphone className="h-7 w-7 text-slate-200" />
              </div>
              <p className="text-[14px] font-semibold text-slate-500">No announcements yet</p>
              <p className="text-[12px] text-slate-400">
                {search || filterAuthor ? 'Try clearing the search or filter.' : canPost ? 'Be the first to share an update!' : 'Check back later for updates.'}
              </p>
            </div>
          ) : (
            feed.map(item => <AnnouncementCard key={item.id} item={item} onOpenImage={setLightboxUrl} />)
          )}
        </div>
      </div>

      {lightboxUrl && <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </div>
  );
}
