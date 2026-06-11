'use client';

import { Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import HRClient from '@/app/(dashboard)/hr/client';
import type { EmployeeRow } from '@/lib/actions/hr';
import { TableSkeleton } from './skeletons';
import type { SectionProps } from './types';

const HR_ACCESS_ROLES = ['super_admin', 'org_admin', 'hospital_admin', 'practice_manager', 'hr'];

export function HRSection({ userId, orgId }: SectionProps) {
  const { data } = useQuery({
    queryKey: ['hr-data', userId, orgId],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();

      const { data: callerRoles } = await supabase
        .from('user_hospital_roles').select('role').eq('user_id', userId);

      if (!callerRoles?.some(r => HR_ACCESS_ROLES.includes(r.role))) {
        return { employees: [] as EmployeeRow[], hospitals: [] as { id: string; name: string; color: string | null }[] };
      }

      const [profilesRes, hospitalsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, first_name, last_name, email, job_title, department, avatar_url, is_active, created_at, last_seen_at')
          .eq('org_id', orgId)
          .order('first_name'),
        supabase.from('hospitals').select('id, name, color').eq('org_id', orgId).order('name'),
      ]);

      const profileList  = profilesRes.data ?? [];
      const hospitalList = hospitalsRes.data ?? [];
      const userIds      = profileList.map(p => p.id);
      const hospitalMap  = new Map(hospitalList.map(h => [h.id, h]));

      const { data: allRoles } = userIds.length > 0
        ? await supabase.from('user_hospital_roles').select('user_id, role, hospital_id').in('user_id', userIds)
        : { data: [] };

      const rolesByUser = new Map<string, EmployeeRow['roles']>();
      for (const r of (allRoles ?? [])) {
        if (!rolesByUser.has(r.user_id)) rolesByUser.set(r.user_id, []);
        rolesByUser.get(r.user_id)!.push({
          role: r.role,
          hospital: hospitalMap.get(r.hospital_id) ?? null,
        });
      }

      const employees: EmployeeRow[] = profileList.map(p => ({
        ...p,
        roles: rolesByUser.get(p.id) ?? [],
      }));

      return { employees, hospitals: hospitalList };
    },
  });

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="HR Management"
        description="Manage employees, roles, and access credentials"
        color="navy"
        variant="banner"
        icon={<Users className="h-7 w-7" />}
      />
      {data ? <HRClient employees={data.employees} hospitals={data.hospitals} /> : <TableSkeleton />}
    </div>
  );
}
