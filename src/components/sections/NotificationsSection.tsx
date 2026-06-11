'use client';

import { Bell } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import NotificationList from '@/components/notifications/notification-list';
import { BannerListSkeleton } from './skeletons';
import type { SectionProps } from './types';

export function NotificationsSection({ userId }: SectionProps) {
  const { data } = useQuery({
    queryKey: ['notifications-data', userId],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data: notifications } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100);
      return notifications ?? [];
    },
  });

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        title="Notifications"
        description="Stay up to date with activity across VetOS"
        color="navy"
        variant="banner"
        icon={<Bell className="h-7 w-7" />}
      />
      {data ? (
        <NotificationList
          initialNotifications={data as Parameters<typeof NotificationList>[0]['initialNotifications']}
          userId={userId}
        />
      ) : <BannerListSkeleton />}
    </div>
  );
}
