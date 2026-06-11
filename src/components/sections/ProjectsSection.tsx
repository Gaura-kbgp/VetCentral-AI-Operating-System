'use client';

import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { getProjectDashboard, getOrgHospitals, getProjectTemplates } from '@/lib/actions/projects';
import { ProjectDashboard } from '@/components/projects/project-dashboard';
import { BannerCardGridSkeleton } from './skeletons';
import type { SectionProps } from './types';

const ADMIN_ROLES = ['super_admin', 'org_admin', 'hospital_admin', 'practice_manager'];

export function ProjectsSection({ userId }: SectionProps) {
  const { data } = useQuery({
    queryKey: ['projects-data', userId],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const [dashRes, hospitalsRes, templatesRes, rolesRes] = await Promise.all([
        getProjectDashboard(),
        getOrgHospitals(),
        getProjectTemplates(),
        supabase.from('user_hospital_roles').select('role').eq('user_id', userId),
      ]);
      return {
        stats:     dashRes.success ? dashRes.data.stats : null,
        projects:  dashRes.success ? dashRes.data.projects : [],
        hospitals: hospitalsRes.success ? hospitalsRes.data : [],
        templates: templatesRes.success ? templatesRes.data : [],
        isAdmin:   rolesRes.data?.some(r => ADMIN_ROLES.includes(r.role)) ?? false,
      };
    },
  });

  if (!data) return <BannerCardGridSkeleton />;

  return (
    <ProjectDashboard
      stats={data.stats as Parameters<typeof ProjectDashboard>[0]['stats']}
      projects={data.projects as Parameters<typeof ProjectDashboard>[0]['projects']}
      hospitals={data.hospitals as Parameters<typeof ProjectDashboard>[0]['hospitals']}
      templates={data.templates as Parameters<typeof ProjectDashboard>[0]['templates']}
      userId={userId}
      isAdmin={data.isAdmin}
    />
  );
}
