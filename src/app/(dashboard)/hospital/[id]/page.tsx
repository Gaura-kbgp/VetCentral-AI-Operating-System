import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { getHospitalDetail, getHospitalAnalytics } from '@/lib/actions/hospital-hub';
import { HospitalDetail } from '@/components/hospital-hub/hospital-detail';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await getHospitalDetail(id);
  return { title: res.success ? `${res.data.name} — Hospital Hub` : 'Hospital' };
}

const ADMIN_ROLES = ['super_admin', 'org_admin', 'hospital_admin', 'practice_manager'];

export default async function HospitalPage({
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

  const admin = createSupabaseAdminClient();

  // Resolve by UUID or slug
  const hospitalRes = await getHospitalDetail(id);
  if (!hospitalRes.success || !hospitalRes.data) notFound();

  const hospitalId = hospitalRes.data.id;

  const [analyticsRes, myRoleRes, allHospRolesRes, orgRolesRes] = await Promise.all([
    getHospitalAnalytics(hospitalId),
    admin.from('user_hospital_roles').select('role').eq('hospital_id', hospitalId).eq('user_id', user.id).maybeSingle(),
    admin.from('user_hospital_roles').select('role').eq('user_id', user.id),
    admin.from('org_user_roles').select('role').eq('user_id', user.id),
  ]);

  const allRoles = [
    ...(allHospRolesRes.data ?? []).map(r => r.role),
    ...(orgRolesRes.data ?? []).map(r => r.role),
  ];
  const isAdmin = allRoles.some(r => ADMIN_ROLES.includes(r));

  const validTabs = ['overview', 'employees', 'departments', 'calendar', 'training', 'projects', 'documents', 'analytics'] as const;
  type ValidTab = typeof validTabs[number];
  const initialTab: ValidTab | undefined = validTabs.includes(tab as ValidTab) ? (tab as ValidTab) : undefined;

  return (
    <HospitalDetail
      hospital={hospitalRes.data}
      analytics={analyticsRes.success ? analyticsRes.data : null}
      myRole={myRoleRes?.data?.role ?? null}
      isAdmin={isAdmin}
      userId={user.id}
      initialTab={initialTab}
    />
  );
}
