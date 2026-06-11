'use client';

import { Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import UsersAdmin, { type UserRow } from '@/components/admin/users-admin';
import { canAccessRoute } from '@/lib/permissions';
import type { AppRole } from '@/types/database';
import { TableSkeleton } from './skeletons';
import type { SectionProps } from './types';

const ROLE_PRIORITY: AppRole[] = [
  'super_admin', 'org_admin', 'hospital_admin', 'practice_manager',
  'it_admin', 'doctor', 'hr', 'marketing', 'csr', 'va', 'viewer',
];

export function AdminUsersSection({ userId }: SectionProps) {
  const { data } = useQuery({
    queryKey: ['admin-users-data', userId],
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

      if (!canAccessRoute(currentRole, '/admin/users')) {
        return { users: [] as UserRow[], hospitals: [] as { id: string; name: string; color: string | null }[], hasAccess: false };
      }

      const [usersResult, hospitalsResult] = await Promise.all([
        supabase
          .from('profiles')
          .select(`
            id, first_name, last_name, email, job_title, department,
            avatar_url, is_active, created_at, last_seen_at,
            roles:user_hospital_roles!user_hospital_roles_user_id_fkey(role, hospital:hospital_id(id,name,color))
          `)
          .order('first_name'),
        supabase.from('hospitals').select('id,name,color').order('name'),
      ]);

      const users: UserRow[] = (usersResult.data ?? []).map(u => ({
        ...u,
        roles: ((u as { roles?: unknown[] }).roles ?? []).map((r: unknown) => {
          const roleObj = r as { role: string; hospital: unknown };
          return {
            role: roleObj.role,
            hospital: Array.isArray(roleObj.hospital) ? (roleObj.hospital[0] ?? null) : (roleObj.hospital as { id: string; name: string; color: string | null } | null),
          };
        }),
      }));

      return { users, hospitals: hospitalsResult.data ?? [], hasAccess: true };
    },
  });

  if (!data) return <TableSkeleton />;
  if (!data.hasAccess) {
    return <div className="text-center py-16 text-slate-400">You don&apos;t have access to User Management.</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Management"
        description="Manage staff accounts, roles, and hospital assignments"
        color="navy"
        variant="banner"
        icon={<Users className="h-7 w-7" />}
      />
      <UsersAdmin users={data.users} hospitals={data.hospitals} currentUserId={userId} />
    </div>
  );
}
