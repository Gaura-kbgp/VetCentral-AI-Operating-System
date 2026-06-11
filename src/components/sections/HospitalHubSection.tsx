'use client';

import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { getHospitalCards } from '@/lib/actions/hospital-hub';
import { HubShell } from '@/components/hospital-hub/hub-shell';
import { BannerCardGridSkeleton } from './skeletons';
import type { SectionProps } from './types';
import type { ViewRole } from '@/lib/actions/hospital-hub';

const EXECUTIVE_ROLES = ['super_admin', 'org_admin'];
const MANAGER_ROLES   = ['hospital_admin', 'practice_manager'];

export function HospitalHubSection({ userId }: SectionProps) {
  const { data } = useQuery({
    queryKey: ['hospital-hub-init', userId],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();

      const [myRolesRes, orgRolesRes, cardsRes] = await Promise.all([
        supabase.from('user_hospital_roles').select('hospital_id, role').eq('user_id', userId),
        supabase.from('org_user_roles').select('role').eq('user_id', userId),
        getHospitalCards(),
      ]);

      const allRoles = [
        ...(myRolesRes.data ?? []).map(r => r.role),
        ...(orgRolesRes.data ?? []).map(r => r.role),
      ];

      const viewRole: ViewRole = allRoles.some(r => EXECUTIVE_ROLES.includes(r))
        ? 'executive'
        : allRoles.some(r => MANAGER_ROLES.includes(r))
          ? 'manager'
          : 'staff';

      const allCards     = cardsRes.success ? cardsRes.data : [];
      const isExecutive  = viewRole === 'executive';
      const assignedIds  = new Set((myRolesRes.data ?? []).map(r => r.hospital_id));

      const hospitals = isExecutive
        ? allCards
        : allCards.filter(c => assignedIds.has(c.id));

      return { hospitals, viewRole, userRoles: allRoles };
    },
    staleTime: 60_000,
  });

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden px-6 py-5">
      {data ? (
        <HubShell
          hospitals={data.hospitals}
          userId={userId}
          viewRole={data.viewRole}
          userRoles={data.userRoles}
        />
      ) : <BannerCardGridSkeleton />}
    </div>
  );
}
