import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getProjectDashboard, getOrgHospitals, getProjectTemplates } from '@/lib/actions/projects';
import { ProjectDashboard } from '@/components/projects/project-dashboard';

export const metadata = { title: 'Projects — VetOS' };

const ADMIN_ROLES = ['super_admin', 'org_admin', 'hospital_admin', 'practice_manager'];

export default async function ProjectsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [dashRes, hospitalsRes, templatesRes, rolesRes] = await Promise.all([
    getProjectDashboard(),
    getOrgHospitals(),
    getProjectTemplates(),
    supabase.from('user_hospital_roles').select('role').eq('user_id', user.id),
  ]);

  const isAdmin = rolesRes.data?.some(r => ADMIN_ROLES.includes(r.role)) ?? false;

  return (
    <ProjectDashboard
      stats={dashRes.success ? dashRes.data.stats : null}
      projects={dashRes.success ? dashRes.data.projects : []}
      hospitals={hospitalsRes.success ? hospitalsRes.data : []}
      templates={templatesRes.success ? templatesRes.data : []}
      userId={user.id}
      isAdmin={isAdmin}
    />
  );
}
