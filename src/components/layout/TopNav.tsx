'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Search, Calendar, Bell, Mail, X, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import AccountMenu, { type AccountMenuProfile } from './AccountMenu';
import type { AppRole } from '@/types/database';

interface Notification {
  id: string;
  title: string;
  body: string | null;
  type: string | null;
  created_at: string;
  is_read: boolean;
}

interface TopNavProps {
  user: AccountMenuProfile | null;
  role: AppRole | null;
  hospitals: { id: string; name: string; color: string | null }[];
  unreadCount?: number;
}

export default function TopNav({ user, role, unreadCount = 0 }: TopNavProps) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [query, setQuery] = useState('');
  const [bellOpen, setBellOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [localUnread, setLocalUnread] = useState(unreadCount);
  const bellRef = useRef<HTMLDivElement>(null);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) router.push(`/knowledge-base?q=${encodeURIComponent(query.trim())}`);
  }

  async function openBell() {
    setBellOpen(v => !v);
    if (!bellOpen) {
      const { data } = await supabase
        .from('notifications')
        .select('id, title, body, type, created_at, is_read')
        .order('created_at', { ascending: false })
        .limit(8);
      setNotifications(data ?? []);
    }
  }

  async function markAllRead() {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('is_read', false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setLocalUnread(0);
  }

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function timeAgo(iso: string) {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60)    return 'just now';
    if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  const TYPE_COLOR: Record<string, string> = {
    sop:          'bg-blue-100 text-blue-600',
    employee:     'bg-green-100 text-green-600',
    project:      'bg-purple-100 text-purple-600',
    announcement: 'bg-orange-100 text-orange-600',
  };

  return (
    <header className="relative z-20 flex items-center h-17 px-6 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shrink-0 gap-4">

      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex-1 max-w-lg">
        <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
          <Search className="h-4 w-4 text-gray-400 shrink-0" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search VetCentral..."
            className="flex-1 text-sm bg-transparent outline-none text-gray-700 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-500"
          />
        </div>
      </form>

      {/* Right icons */}
      <div className="flex items-center gap-1 ml-auto">

        {/* Calendar icon */}
        <Link
          href="/calendar"
          title="Master Calendar"
          className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
        >
          <Calendar className="h-5 w-5" />
        </Link>

        {/* Bell — notifications dropdown */}
        <div ref={bellRef} className="relative">
          <button
            type="button"
            title="Notifications"
            onClick={openBell}
            className="relative w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-800 dark:hover:text-gray-200 transition-colors cursor-pointer"
          >
            <Bell className="h-5 w-5" />
            {localUnread > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-orange-500 rounded-full" />
            )}
          </button>

          {/* Dropdown panel */}
          {bellOpen && (
            <div className="absolute right-0 top-full mt-2 w-96 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden z-50">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-semibold text-gray-900 dark:text-gray-100">Notifications</span>
                  {localUnread > 0 && (
                    <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-orange-500 text-white text-[11px] font-bold">
                      {localUnread}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {localUnread > 0 && (
                    <button
                      onClick={markAllRead}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 px-2 py-1 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors cursor-pointer"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Mark all read
                    </button>
                  )}
                  <button
                    onClick={() => setBellOpen(false)}
                    className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 transition-colors cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Notification list */}
              <div className="max-h-[380px] overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Bell className="h-10 w-10 text-gray-200 dark:text-gray-700 mb-3" />
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">All caught up</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">No new notifications</p>
                  </div>
                ) : (
                  notifications.map((n, idx) => (
                    <div
                      key={n.id}
                      className={[
                        'flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors',
                        idx < notifications.length - 1 ? 'border-b border-gray-50 dark:border-gray-800' : '',
                        !n.is_read ? 'bg-blue-50/40 dark:bg-blue-900/10 hover:bg-blue-50 dark:hover:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800',
                      ].join(' ')}
                    >
                      <div className="mt-1.5 shrink-0">
                        {!n.is_read
                          ? <span className="w-2 h-2 rounded-full bg-blue-500 block" />
                          : <span className="w-2 h-2 rounded-full bg-transparent block" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-[13px] leading-snug ${!n.is_read ? 'font-semibold text-gray-900 dark:text-gray-100' : 'font-medium text-gray-700 dark:text-gray-300'}`}>
                            {n.title}
                          </p>
                          <span className="text-[11px] text-gray-400 dark:text-gray-500 shrink-0 mt-0.5">
                            {timeAgo(n.created_at)}
                          </span>
                        </div>
                        {n.body && (
                          <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{n.body}</p>
                        )}
                        {n.type && (
                          <span className={`inline-block mt-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${TYPE_COLOR[n.type] ?? 'bg-gray-100 text-gray-500'}`}>
                            {n.type}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-2.5">
                <Link
                  href="/notifications"
                  onClick={() => setBellOpen(false)}
                  className="block text-center text-[13px] font-medium text-blue-600 hover:text-blue-700 py-1 transition-colors"
                >
                  View all notifications
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Mail icon */}
        <Link
          href="/communication"
          title="Communications"
          className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
        >
          <Mail className="h-5 w-5" />
        </Link>

        {/* Divider */}
        <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1" />

        {/* User avatar dropdown */}
        <AccountMenu profile={user} role={role} unreadCount={localUnread} />
      </div>
    </header>
  );
}
