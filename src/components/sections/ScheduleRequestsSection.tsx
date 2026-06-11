'use client';

import { ClipboardList } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { ScheduleAdminClient } from '@/components/admin/schedule-admin-client';
import { TableSkeleton } from './skeletons';
import type { SectionProps } from './types';

const ADMIN_ROLES = ['super_admin', 'org_admin', 'hospital_admin', 'practice_manager'];

export function ScheduleRequestsSection({ userId }: SectionProps) {
  const { data, error } = useQuery({
    queryKey: ['schedule-requests-data', userId],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const [hospRolesRes, orgRolesRes] = await Promise.all([
        supabase.from('user_hospital_roles').select('role').eq('user_id', userId),
        supabase.from('org_user_roles').select('role').eq('user_id', userId),
      ]);
      const allRoles = [
        ...(hospRolesRes.data ?? []).map(r => r.role),
        ...(orgRolesRes.data ?? []).map(r => r.role),
      ];
      const isAdmin = allRoles.some(r => ADMIN_ROLES.includes(r));
      if (!isAdmin) return { requests: [], isAdmin: false };

      const { data: requests, error: reqErr } = await supabase
        .from('schedule_requests')
        .select(`
          *,
          requester:profiles!requested_by(first_name, last_name, email, avatar_url, job_title),
          hospital:hospitals(name, color),
          approver:profiles!approved_by(first_name, last_name)
        `)
        .order('created_at', { ascending: false });

      if (reqErr) throw new Error(reqErr.message);

      const rows = (requests ?? []).map(r => ({
        ...r,
        requester: Array.isArray(r.requester) ? (r.requester[0] ?? null) : r.requester,
        hospital:  Array.isArray(r.hospital)  ? (r.hospital[0]  ?? null) : r.hospital,
        approver:  Array.isArray(r.approver)  ? (r.approver[0]  ?? null) : r.approver,
      }));
      return { requests: rows, isAdmin: true };
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Schedule Requests"
        description="Review and approve calendar event requests from staff"
        color="navy"
        variant="banner"
        icon={<ClipboardList className="h-7 w-7" />}
      />
      {error ? (
        <div className="rounded-xl bg-red-50 border border-red-200 p-6 text-red-700 text-sm">
          Error loading schedule requests: {(error as Error).message}
        </div>
      ) : data ? (
        <ScheduleAdminClient
          requests={data.requests as Parameters<typeof ScheduleAdminClient>[0]['requests']}
        />
      ) : <TableSkeleton />}
    </div>
  );
}
