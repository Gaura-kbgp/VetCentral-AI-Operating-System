'use client';

import { FileText } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import AuditLogsAdmin from '@/components/admin/audit-logs-admin';
import { canAccessRoute } from '@/lib/permissions';
import type { AppRole } from '@/types/database';
import { TableSkeleton } from './skeletons';
import type { SectionProps } from './types';

const ROLE_PRIORITY: AppRole[] = [
  'super_admin', 'org_admin', 'hospital_admin', 'practice_manager',
  'it_admin', 'doctor', 'hr', 'marketing', 'csr', 'va', 'viewer',
];

export function AdminAuditLogsSection({ userId }: SectionProps) {
  const { data } = useQuery({
    queryKey: ['admin-audit-logs-data', userId],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const [hospRoles, orgRoles] = await Promise.all([
        supabase.from('user_hospital_roles').select('role').eq('user_id', userId),
        supabase.from('org_user_roles').select('role').eq('user_id', userId),
      ]);
      const allRoles = [
        ...(hospRoles.data ?? []).map(r => r.role),
        ...(orgRoles.data ?? []).map(r => r.role),
      ] as AppRole[];
      const currentRole = ROLE_PRIORITY.find(r => allRoles.includes(r)) ?? null;

      if (!canAccessRoute(currentRole, '/admin/audit-logs')) {
        return { logs: [], hasAccess: false };
      }

      const { data: rawLogs } = await supabase
        .from('audit_logs')
        .select(`
          id, action, resource_type, resource_id, user_id,
          ip_address, created_at, severity, old_data, new_data, metadata,
          actor:user_id(id,first_name,last_name,avatar_url,email)
        `)
        .order('created_at', { ascending: false })
        .limit(500);

      const logs = (rawLogs ?? []).map(l => ({
        ...l,
        actor: Array.isArray(l.actor) ? (l.actor[0] ?? null) : l.actor,
      }));

      return { logs, hasAccess: true };
    },
  });

  if (!data) return <TableSkeleton />;
  if (!data.hasAccess) {
    return <div className="text-center py-16 text-slate-400">You don&apos;t have access to Audit Logs.</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Logs"
        description="Complete record of all actions taken across the system"
        color="slate"
        variant="banner"
        icon={<FileText className="h-7 w-7" />}
      />
      <AuditLogsAdmin logs={data.logs as Parameters<typeof AuditLogsAdmin>[0]['logs']} />
    </div>
  );
}
