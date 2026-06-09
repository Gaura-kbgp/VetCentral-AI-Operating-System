'use client';

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import {
  Bell, CheckCheck, Trash2, MessageSquare, CheckSquare,
  Calendar, BookOpen, FileText, Megaphone, GitPullRequest
} from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { markNotificationRead, markAllNotificationsRead, deleteNotification } from '@/lib/actions/notifications';
import type { Notification, NotificationKind } from '@/types/app';

const KIND_CONFIG: Record<NotificationKind, { icon: React.ReactNode; color: string }> = {
  message_mention:      { icon: <MessageSquare className="h-4 w-4" />,  color: 'text-blue-500 bg-blue-50' },
  channel_message:      { icon: <MessageSquare className="h-4 w-4" />,  color: 'text-blue-400 bg-blue-50' },
  task_assigned:        { icon: <CheckSquare className="h-4 w-4" />,    color: 'text-green-500 bg-green-50' },
  task_due:             { icon: <CheckSquare className="h-4 w-4" />,    color: 'text-orange-500 bg-orange-50' },
  workflow_update:      { icon: <GitPullRequest className="h-4 w-4" />, color: 'text-purple-500 bg-purple-50' },
  calendar_reminder:    { icon: <Calendar className="h-4 w-4" />,       color: 'text-teal-500 bg-teal-50' },
  training_assigned:    { icon: <BookOpen className="h-4 w-4" />,       color: 'text-indigo-500 bg-indigo-50' },
  document_shared:      { icon: <FileText className="h-4 w-4" />,       color: 'text-slate-500 bg-slate-50' },
  system_announcement:  { icon: <Megaphone className="h-4 w-4" />,      color: 'text-red-500 bg-red-50' },
};

interface Props {
  initialNotifications: Notification[];
  userId: string;
}

export default function NotificationList({ initialNotifications, userId }: Props) {
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const [isPending, startTransition] = useTransition();
  const supabase = createSupabaseBrowserClient();

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        setNotifications(prev => [payload.new as Notification, ...prev]);
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        setNotifications(prev =>
          prev.map(n => n.id === (payload.new as Notification).id ? { ...n, ...payload.new as Notification } : n)
        );
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase, userId]);

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const filtered    = tab === 'unread' ? notifications.filter(n => !n.is_read) : notifications;

  function handleMarkRead(id: string) {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    startTransition(async () => {
      const r = await markNotificationRead(id);
      if (!r.success) toast.error(r.error);
    });
  }

  function handleMarkAll() {
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    startTransition(async () => {
      const r = await markAllNotificationsRead();
      if (r.success) toast.success('All notifications marked as read');
      else toast.error(r.error);
    });
  }

  function handleDelete(id: string) {
    setNotifications(prev => prev.filter(n => n.id !== id));
    startTransition(async () => {
      const r = await deleteNotification(id);
      if (!r.success) toast.error(r.error);
    });
  }

  return (
    <div className="space-y-4">
      {/* Header controls */}
      <div className="flex items-center justify-between">
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'all' | 'unread')}>
          <TabsList className="h-8">
            <TabsTrigger value="all" className="text-xs px-3">
              All ({notifications.length})
            </TabsTrigger>
            <TabsTrigger value="unread" className="text-xs px-3">
              Unread
              {unreadCount > 0 && (
                <Badge className="ml-1.5 h-4 min-w-4 px-1 text-[10px] bg-blue-600 text-white border-0">
                  {unreadCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {unreadCount > 0 && (
          <Button
            variant="outline" size="sm"
            onClick={handleMarkAll}
            disabled={isPending}
            className="gap-1.5 h-8 text-xs"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </Button>
        )}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Bell className="h-12 w-12 text-slate-200 mb-3" />
          <p className="text-slate-500 font-medium">
            {tab === 'unread' ? 'All caught up!' : 'No notifications yet'}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {tab === 'unread' ? 'You have no unread notifications' : 'Notifications will appear here'}
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map(n => (
            <NotificationItem
              key={n.id}
              notification={n}
              onMarkRead={handleMarkRead}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationItem({
  notification: n,
  onMarkRead,
  onDelete,
}: {
  notification: Notification;
  onMarkRead: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const cfg = KIND_CONFIG[n.type] ?? KIND_CONFIG.system_announcement;

  return (
    <div
      className={`group flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer
        ${n.is_read
          ? 'bg-white border-slate-100 hover:bg-slate-50'
          : 'bg-blue-50/60 border-blue-100 hover:bg-blue-50'
        }`}
      onClick={() => !n.is_read && onMarkRead(n.id)}
    >
      {/* Icon */}
      <div className={`mt-0.5 h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${cfg.color}`}>
        {cfg.icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-sm leading-snug ${n.is_read ? 'text-slate-600' : 'text-slate-900 font-medium'}`}>
            {n.title}
          </p>
          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            {!n.is_read && (
              <button
                onClick={e => { e.stopPropagation(); onMarkRead(n.id); }}
                className="h-6 w-6 flex items-center justify-center rounded text-slate-400 hover:text-blue-600 hover:bg-blue-100 transition-colors"
                title="Mark as read"
              >
                <CheckCheck className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={e => { e.stopPropagation(); onDelete(n.id); }}
              className="h-6 w-6 flex items-center justify-center rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {n.body && <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{n.body}</p>}
        <p className="text-[11px] text-slate-400 mt-1">
          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
        </p>
      </div>

      {/* Unread dot */}
      {!n.is_read && (
        <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />
      )}
    </div>
  );
}
