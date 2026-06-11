import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Calendar } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import MasterCalendarClient from '@/components/calendar/calendar-client';

export const metadata = { title: 'Master Calendar' };

export default async function CalendarPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const now   = new Date();
  // Fetch 2 months back and 4 months forward so the client has full context
  const start = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString();
  const end   = new Date(now.getFullYear(), now.getMonth() + 4, 0).toISOString();

  const [eventsResult, hospitalsResult, rolesResult] = await Promise.all([
    supabase
      .from('calendar_events')
      .select('*, attendees:calendar_event_attendees(*)')
      .gte('start_time', start)
      .lte('start_time', end)
      .eq('is_cancelled', false)
      .order('start_time'),
    supabase
      .from('hospitals')
      .select('id, name, color')
      .order('name'),
    supabase
      .from('user_hospital_roles')
      .select('role')
      .eq('user_id', user.id),
  ]);

  const ROLE_PRIORITY = ['super_admin','org_admin','hospital_admin','practice_manager','it_admin','doctor','hr','marketing','csr','va','viewer'];
  const userRoles = (rolesResult.data ?? []).map(r => r.role);
  const highestRole = ROLE_PRIORITY.find(r => userRoles.includes(r)) ?? null;

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Master Calendar"
        description="Unified calendar across all three hospitals"
        color="navy"
        variant="banner"
        icon={<Calendar className="h-7 w-7" />}
      />
      <MasterCalendarClient
        initialEvents={eventsResult.data ?? []}
        hospitals={hospitalsResult.data ?? []}
        userId={user.id}
        userRole={highestRole}
      />
    </div>
  );
}
