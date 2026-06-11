'use client';

import { Calendar } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import MasterCalendarClient from '@/components/calendar/calendar-client';
import { CalendarSkeleton } from './skeletons';
import type { SectionProps } from './types';

const ROLE_PRIORITY = ['super_admin','org_admin','hospital_admin','practice_manager','it_admin','doctor','hr','marketing','csr','va','viewer'];

export function CalendarSection({ userId }: SectionProps) {
  const { data } = useQuery({
    queryKey: ['calendar-data', userId],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const now   = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString();
      const end   = new Date(now.getFullYear(), now.getMonth() + 4, 0).toISOString();
      const [eventsRes, hospitalsRes, rolesRes] = await Promise.all([
        supabase
          .from('calendar_events')
          .select('*, attendees:calendar_event_attendees(*)')
          .gte('start_time', start)
          .lte('start_time', end)
          .eq('is_cancelled', false)
          .order('start_time'),
        supabase.from('hospitals').select('id, name, color').order('name'),
        supabase.from('user_hospital_roles').select('role').eq('user_id', userId),
      ]);
      const userRoles = (rolesRes.data ?? []).map(r => r.role);
      return {
        events:    eventsRes.data    ?? [],
        hospitals: hospitalsRes.data ?? [],
        userRole:  ROLE_PRIORITY.find(r => userRoles.includes(r)) ?? null,
      };
    },
  });

  return (
    <div>
      <PageHeader
        title="Master Calendar"
        description="Unified schedule across all hospital locations"
        color="navy"
        variant="banner"
        icon={<Calendar className="h-7 w-7" />}
      />
      {data ? (
        <MasterCalendarClient
          initialEvents={data.events as Parameters<typeof MasterCalendarClient>[0]['initialEvents']}
          hospitals={data.hospitals}
          userId={userId}
          userRole={data.userRole}
        />
      ) : <CalendarSkeleton />}
    </div>
  );
}
