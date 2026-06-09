import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { CheckSquare, Clock, AlertTriangle, TrendingUp, CheckCircle2, User, Calendar } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { ApprovalsClient } from '@/components/admin/approvals-client';

export const metadata = { title: 'Approval Center – VetOS' };

export default async function ApprovalsPage() {
  const supabase    = await createSupabaseServerClient();
  const admin       = createSupabaseAdminClient();
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
    ['super_admin', 'org_admin', 'hospital_admin', 'practice_manager', 'hr'].includes(r)
  );
  if (!isAdmin) redirect('/dashboard');

  // Fetch requests with requester profile
  const { data: requests, error } = await admin
    .from('requests')
    .select(`
      id, request_type, status, priority, title, description,
      requested_by, created_at, updated_at, due_date,
      approved_at, rejected_at, rejection_reason, escalation_reason,
      requester:profiles!requested_by(first_name, last_name, email, avatar_url)
    `)
    .order('created_at', { ascending: false })
    .limit(200);

  const rows = (requests ?? []).map((r) => ({
    ...r,
    requester: Array.isArray(r.requester) ? (r.requester[0] ?? null) : r.requester,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approval Center"
        description="Review and process requests across the organization"
        color="navy"
        icon={<CheckSquare className="h-7 w-7" />}
      />
      {error ? (
        <div className="rounded-xl bg-red-50 border border-red-200 p-6 text-red-700 text-sm">
          Error loading requests: {error.message}
        </div>
      ) : (
        <ApprovalsClient requests={rows} currentUserId={user.id} />
      )}
    </div>
  );
}
