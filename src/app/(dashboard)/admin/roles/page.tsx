import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Shield } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import RolesAdmin from '@/components/admin/roles-admin';
import PermissionMatrix from '@/components/admin/PermissionMatrix';
import { canAccessRoute } from '@/lib/permissions';
import { getOrgRoleAssignments } from '@/lib/actions/rbac';
import type { AppRole } from '@/types/database';

const ROLE_PRIORITY: AppRole[] = [
  'super_admin', 'org_admin', 'hospital_admin', 'practice_manager',
  'it_admin', 'doctor', 'hr', 'marketing', 'csr', 'va', 'viewer',
];

export const metadata = { title: 'Roles & Permissions – VetOS' };

export default async function RolesPage() {
  const supabase = await createSupabaseServerClient();
  const adminClient = createSupabaseAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Resolve actor's highest role
  const [hospRoles, orgRoles] = await Promise.all([
    adminClient.from('user_hospital_roles').select('role').eq('user_id', user.id),
    adminClient.from('org_user_roles').select('role').eq('user_id', user.id),
  ]);
  const allRoles = [
    ...(hospRoles.data ?? []).map(r => r.role),
    ...(orgRoles.data ?? []).map(r => r.role),
  ] as AppRole[];
  const currentRole = ROLE_PRIORITY.find(r => allRoles.includes(r)) ?? null;

  if (!canAccessRoute(currentRole, '/admin/roles')) redirect('/dashboard');

  // Fetch data
  const [assignmentsRes, hospitalsRes, usersRes] = await Promise.all([
    getOrgRoleAssignments(),
    adminClient.from('hospitals').select('id,name,color').order('name'),
    adminClient
      .from('profiles')
      .select('id,first_name,last_name,email,avatar_url,job_title,is_active')
      .order('first_name'),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Roles & Permissions"
        description="Manage role assignments and view the permission matrix across the organization"
        color="navy"
        icon={<Shield className="h-7 w-7" />}
      />

      {/* Assignment manager */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Role Assignments</h2>
        <RolesAdmin
          assignments={assignmentsRes.success ? assignmentsRes.data : []}
          hospitals={hospitalsRes.data ?? []}
          users={usersRes.data ?? []}
          currentRole={currentRole}
        />
      </section>

      {/* Permission matrix */}
      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Permission Matrix</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Visual overview of what each role can access across all modules.
            Database RLS independently enforces these boundaries.
          </p>
        </div>
        <PermissionMatrix />
      </section>
    </div>
  );
}
