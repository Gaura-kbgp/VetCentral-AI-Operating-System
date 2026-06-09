import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ClipboardList } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { ScheduleAdminClient } from '@/components/admin/schedule-admin-client';

export const metadata = { title: 'Schedule Requests – VetOS' };

export default async function ScheduleRequestsPage() {
  const supabase = await createSupabaseServerClient();
  const admin    = createSupabaseAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Auth guard — check both role tables
  const [{ data: hospRoles }, { data: orgRoles }] = await Promise.all([
    admin.from('user_hospital_roles').select('role').eq('user_id', user.id),
    admin.from('org_user_roles').select('role').eq('user_id', user.id),
  ]);
  const allRoles = [
    ...(hospRoles ?? []).map(r => r.role),
    ...(orgRoles ?? []).map(r => r.role),
  ];
  const isAdmin = allRoles.some(r =>
    ['super_admin', 'org_admin', 'hospital_admin', 'practice_manager'].includes(r)
  );
  if (!isAdmin) redirect('/dashboard');

  const { data: requests, error } = await admin
    .from('schedule_requests')
    .select(`
      *,
      requester:profiles!requested_by(first_name, last_name, email, avatar_url, job_title),
      hospital:hospitals(name, color),
      approver:profiles!approved_by(first_name, last_name)
    `)
    .order('created_at', { ascending: false });

  const rows = (requests ?? []).map(r => ({
    ...r,
    requester: Array.isArray(r.requester) ? (r.requester[0] ?? null) : r.requester,
    hospital:  Array.isArray(r.hospital)  ? (r.hospital[0]  ?? null) : r.hospital,
    approver:  Array.isArray(r.approver)  ? (r.approver[0]  ?? null) : r.approver,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Schedule Requests"
        description="Review and approve calendar event requests from staff"
        color="navy"
        icon={<ClipboardList className="h-7 w-7" />}
      />
      {error ? (
        <div className="rounded-xl bg-red-50 border border-red-200 p-6 text-red-700 text-sm">
          Error loading schedule requests: {error.message}
        </div>
      ) : (
        <ScheduleAdminClient requests={rows} />
      )}
    </div>
  );
}
