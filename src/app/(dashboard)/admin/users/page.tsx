import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import UsersAdmin, { type UserRow } from '@/components/admin/users-admin';
import { canAccessRoute } from '@/lib/permissions';
import type { AppRole } from '@/types/database';

const ROLE_PRIORITY: AppRole[] = [
  'super_admin', 'org_admin', 'hospital_admin', 'practice_manager',
  'it_admin', 'doctor', 'hr', 'marketing', 'csr', 'va', 'viewer',
];

export const metadata = { title: 'User Management – VetOS' };

export default async function AdminUsersPage() {
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

  if (!canAccessRoute(currentRole, '/admin/users')) redirect('/dashboard');

  const [usersResult, hospitalsResult] = await Promise.all([
    adminClient
      .from('profiles')
      .select(`
        id, first_name, last_name, email, job_title, department,
        avatar_url, is_active, created_at, last_seen_at,
        roles:user_hospital_roles!user_hospital_roles_user_id_fkey(role, hospital:hospital_id(id,name,color))
      `)
      .order('first_name'),
    adminClient.from('hospitals').select('id,name,color').order('name'),
  ]);

  const users: UserRow[] = (usersResult.data ?? []).map(u => ({
    ...u,
    roles: (u.roles ?? []).map(r => ({
      role: r.role,
      hospital: Array.isArray(r.hospital) ? (r.hospital[0] ?? null) : (r.hospital as { id: string; name: string; color: string | null } | null),
    })),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Management"
        description="Manage staff accounts, roles, and hospital assignments"
        color="navy"
        icon={<Users className="h-7 w-7" />}
      />
      <UsersAdmin
        users={users}
        hospitals={hospitalsResult.data ?? []}
        currentUserId={user.id}
      />
    </div>
  );
}
