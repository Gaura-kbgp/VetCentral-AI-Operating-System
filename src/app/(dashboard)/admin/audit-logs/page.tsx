import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { FileText } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import AuditLogsAdmin from '@/components/admin/audit-logs-admin';
import { canAccessRoute } from '@/lib/permissions';
import type { AppRole } from '@/types/database';

const ROLE_PRIORITY: AppRole[] = [
  'super_admin', 'org_admin', 'hospital_admin', 'practice_manager',
  'it_admin', 'doctor', 'hr', 'marketing', 'csr', 'va', 'viewer',
];

export const metadata = { title: 'Audit Logs – VetOS' };

export default async function AuditLogsPage() {
  const supabase    = await createSupabaseServerClient();
  const adminClient = createSupabaseAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [hospRoles, orgRoles] = await Promise.all([
    adminClient.from('user_hospital_roles').select('role').eq('user_id', user.id),
    adminClient.from('org_user_roles').select('role').eq('user_id', user.id),
  ]);
  const allRoles = [
    ...(hospRoles.data ?? []).map(r => r.role),
    ...(orgRoles.data ?? []).map(r => r.role),
  ] as AppRole[];
  const currentRole = ROLE_PRIORITY.find(r => allRoles.includes(r)) ?? null;

  if (!canAccessRoute(currentRole, '/admin/audit-logs')) redirect('/dashboard');

  const { data: rawLogs } = await adminClient
    .from('audit_logs')
    .select(`
      id, action, resource_type, resource_id, user_id,
      ip_address, created_at, severity, old_data, new_data, metadata,
      actor:user_id(id,first_name,last_name,avatar_url,email)
    `)
    .order('created_at', { ascending: false })
    .limit(500);

  // Supabase FK joins return arrays; normalise to a single object
  const logs = (rawLogs ?? []).map(l => ({
    ...l,
    actor: Array.isArray(l.actor) ? (l.actor[0] ?? null) : l.actor,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Logs"
        description="Complete record of all actions taken across the system"
        color="slate"
        icon={<FileText className="h-7 w-7" />}
      />
      <AuditLogsAdmin logs={logs ?? []} />
    </div>
  );
}
