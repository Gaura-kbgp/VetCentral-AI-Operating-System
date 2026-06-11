'use client';

import { GraduationCap } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { LMSShell } from '@/components/training/lms-shell';
import { BannerListSkeleton } from './skeletons';
import type { SectionProps } from './types';

const TRAINING_ADMIN_ROLES = ['super_admin', 'org_admin', 'hospital_admin', 'hr'];

export function TrainingSection({ userId, orgId }: SectionProps) {
  const { data } = useQuery({
    queryKey: ['training-data', userId],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const [hospRoles, orgRoles, hospitalsRes] = await Promise.all([
        supabase.from('user_hospital_roles').select('role').eq('user_id', userId),
        supabase.from('org_user_roles').select('role').eq('user_id', userId),
        supabase.from('hospitals').select('id, name, color').order('name'),
      ]);
      const allRoles = [
        ...(hospRoles.data ?? []).map(r => r.role),
        ...(orgRoles.data ?? []).map(r => r.role),
      ];
      return {
        isAdmin: allRoles.some(r => TRAINING_ADMIN_ROLES.includes(r)),
        hospitals: (hospitalsRes.data ?? []) as { id: string; name: string; color: string | null }[],
      };
    },
  });

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Training Academy"
        description="Learning management system for all hospital staff"
        color="navy"
        variant="banner"
        icon={<GraduationCap className="h-7 w-7" />}
      />
      {data ? (
        <LMSShell
          userId={userId}
          orgId={orgId}
          isAdmin={data.isAdmin}
          hospitals={data.hospitals}
        />
      ) : <BannerListSkeleton />}
    </div>
  );
}
