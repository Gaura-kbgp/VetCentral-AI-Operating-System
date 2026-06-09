import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { getProject, getOrgProfiles } from '@/lib/actions/projects';
import { ProjectDetail } from '@/components/projects/project-detail';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await getProject(id);
  return { title: res.success ? `${res.data.name} — Projects` : 'Project' };
}

const ADMIN_ROLES = ['super_admin', 'org_admin', 'hospital_admin', 'practice_manager'];

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id }  = await params;
  const { tab } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [projectRes, profilesRes, rolesRes] = await Promise.all([
    getProject(id),
    getOrgProfiles(),
    supabase.from('user_hospital_roles').select('role').eq('user_id', user.id),
  ]);

  if (!projectRes.success || !projectRes.data) notFound();

  const isAdmin = rolesRes.data?.some(r => ADMIN_ROLES.includes(r.role)) ?? false;

  const validTabs = ['overview','tasks','calendar','documents','team','activity','analytics'] as const;
  type ValidTab = typeof validTabs[number];
  const initialTab: ValidTab = validTabs.includes(tab as ValidTab) ? (tab as ValidTab) : 'overview';

  return (
    <ProjectDetail
      project={projectRes.data}
      profiles={profilesRes.success ? profilesRes.data.map(p => ({ id: p.id, name: p.name, avatar_url: p.avatar_url })) : []}
      userId={user.id}
      isAdmin={isAdmin}
      initialTab={initialTab}
    />
  );
}
