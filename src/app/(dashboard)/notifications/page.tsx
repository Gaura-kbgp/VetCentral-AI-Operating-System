import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Bell } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import NotificationList from '@/components/notifications/notification-list';

export default async function NotificationsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: notifications } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        title="Notifications"
        description="Stay up to date with activity across VetOS"
        color="navy"
        icon={<Bell className="h-7 w-7" />}
      />
      <NotificationList initialNotifications={notifications ?? []} userId={user.id} />
    </div>
  );
}
