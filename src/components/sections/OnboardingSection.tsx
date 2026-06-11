'use client';

import { UserPlus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { OnboardingDashboard } from '@/components/onboarding/onboarding-dashboard';
import {
  getOnboardingDashboard, getOnboardingTemplates, getOrgEmployees, getOrgProfiles,
} from '@/lib/actions/onboarding';
import { BannerCardGridSkeleton } from './skeletons';
import type { SectionProps } from './types';

const ADMIN_ROLES = ['super_admin', 'org_admin', 'hospital_admin', 'practice_manager', 'hr'];

export function OnboardingSection({ userId }: SectionProps) {
  const { data } = useQuery({
    queryKey: ['onboarding-data', userId],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const [dashRes, templatesRes, employeesRes, profilesRes, hospRolesRes, orgRolesRes] = await Promise.all([
        getOnboardingDashboard(),
        getOnboardingTemplates(),
        getOrgEmployees(),
        getOrgProfiles(),
        supabase.from('user_hospital_roles').select('role').eq('user_id', userId),
        supabase.from('org_user_roles').select('role').eq('user_id', userId),
      ]);

      const allRoles = [
        ...(hospRolesRes.data ?? []).map(r => r.role),
        ...(orgRolesRes.data ?? []).map(r => r.role),
      ];

      return {
        stats:              dashRes.success      ? dashRes.data.stats   : null,
        records:            dashRes.success      ? dashRes.data.records : [],
        templates:          templatesRes.success  ? templatesRes.data    : [],
        employees:          employeesRes.success  ? employeesRes.data    : [],
        profiles:           profilesRes.success   ? profilesRes.data     : [],
        isAdmin:            allRoles.some(r => ADMIN_ROLES.includes(r)),
        canStartOnboarding: allRoles.includes('hr'),
      };
    },
  });

  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader
        title="Employee Onboarding"
        description="Standardized onboarding workflow for new employees"
        color="green"
        variant="banner"
        icon={<UserPlus className="h-7 w-7" />}
      />
      {data ? (
        <OnboardingDashboard
          stats={data.stats as Parameters<typeof OnboardingDashboard>[0]['stats']}
          records={data.records as Parameters<typeof OnboardingDashboard>[0]['records']}
          templates={data.templates as Parameters<typeof OnboardingDashboard>[0]['templates']}
          employees={data.employees as Parameters<typeof OnboardingDashboard>[0]['employees']}
          profiles={data.profiles as Parameters<typeof OnboardingDashboard>[0]['profiles']}
          userId={userId}
          isAdmin={data.isAdmin}
          canStartOnboarding={data.canStartOnboarding}
        />
      ) : <BannerCardGridSkeleton />}
    </div>
  );
}
