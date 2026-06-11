'use client';

import { Shield } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import RolesAdmin from '@/components/admin/roles-admin';
import PermissionMatrix from '@/components/admin/PermissionMatrix';
import { canAccessRoute } from '@/lib/permissions';
import { getOrgRoleAssignments } from '@/lib/actions/rbac';
import type { AppRole } from '@/types/database';
import { TableSkeleton } from './skeletons';
import type { SectionProps } from './types';

const ROLE_PRIORITY: AppRole[] = [
  'super_admin', 'org_admin', 'hospital_admin', 'practice_manager',
  'it_admin', 'doctor', 'hr', 'marketing', 'csr', 'va', 'viewer',
];

export function AdminRolesSection({ userId }: SectionProps) {
  const { data } = useQuery({
    queryKey: ['admin-roles-data', userId],
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

      if (!canAccessRoute(currentRole, '/admin/roles')) {
        return { assignments: [], hospitals: [], users: [], currentRole, hasAccess: false };
      }

      const [assignmentsRes, hospitalsRes, usersRes] = await Promise.all([
        getOrgRoleAssignments(),
        supabase.from('hospitals').select('id,name,color').order('name'),
        supabase.from('profiles').select('id,first_name,last_name,email,avatar_url,job_title,is_active').order('first_name'),
      ]);

      return {
        assignments: assignmentsRes.success ? assignmentsRes.data : [],
        hospitals: (hospitalsRes.data ?? []) as { id: string; name: string; color: string | null }[],
        users: usersRes.data ?? [],
        currentRole,
        hasAccess: true,
      };
    },
  });

  if (!data) return <TableSkeleton />;
  if (!data.hasAccess) {
    return <div className="text-center py-16 text-slate-400">You don&apos;t have access to Roles &amp; Permissions.</div>;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Roles & Permissions"
        description="Manage role assignments and view the permission matrix across the organization"
        color="navy"
        variant="banner"
        icon={<Shield className="h-7 w-7" />}
      />
      <section>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Role Assignments</h2>
        <RolesAdmin
          assignments={data.assignments as Parameters<typeof RolesAdmin>[0]['assignments']}
          hospitals={data.hospitals as Parameters<typeof RolesAdmin>[0]['hospitals']}
          users={data.users as Parameters<typeof RolesAdmin>[0]['users']}
          currentRole={data.currentRole}
        />
      </section>
      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Permission Matrix</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Visual overview of what each role can access across all modules.
          </p>
        </div>
        <PermissionMatrix />
      </section>
    </div>
  );
}
