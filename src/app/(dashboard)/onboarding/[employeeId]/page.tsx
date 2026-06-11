import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { getOnboardingRecord, getOrgProfiles } from '@/lib/actions/onboarding';
import { EmployeeOnboarding } from '@/components/onboarding/employee-onboarding';

export async function generateMetadata({ params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params;
  const res = await getOnboardingRecord(employeeId);
  return { title: res.success ? `${res.data.employeeName} — Onboarding` : 'Onboarding' };
}

const ADMIN_ROLES = ['super_admin', 'org_admin', 'hospital_admin', 'practice_manager', 'hr'];

export default async function EmployeeOnboardingPage({
  params,
  searchParams,
}: {
  params:       Promise<{ employeeId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { employeeId } = await params;
  const { tab }        = await searchParams;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createSupabaseAdminClient();

  const [recordRes, profilesRes, hospRolesRes, orgRolesRes] = await Promise.all([
    getOnboardingRecord(employeeId),
    getOrgProfiles(),
    admin.from('user_hospital_roles').select('role').eq('user_id', user.id),
    admin.from('org_user_roles').select('role').eq('user_id', user.id),
  ]);

  const allRoles = [
    ...(hospRolesRes.data ?? []).map(r => r.role),
    ...(orgRolesRes.data ?? []).map(r => r.role),
  ];

  if (!recordRes.success) {
    // No onboarding record — redirect admins (and users with no roles) to dashboard
    if (allRoles.some(r => ADMIN_ROLES.includes(r)) || allRoles.length === 0) {
      redirect('/dashboard');
    }
    notFound();
  }

  const isAdmin = allRoles.some(r => ADMIN_ROLES.includes(r));
  const isOwnRecord = user.id === recordRes.data.employee_id;

  const VALID_TABS = ['overview','checklist','documents','training','meetings','compliance','activity'] as const;
  type Tab = typeof VALID_TABS[number];
  const initialTab: Tab = VALID_TABS.includes(tab as Tab) ? (tab as Tab) : 'overview';

  return (
    <EmployeeOnboarding
      record={recordRes.data}
      profiles={profilesRes.success ? profilesRes.data : []}
      userId={user.id}
      isAdmin={isAdmin}
      isOwnRecord={isOwnRecord}
      initialTab={initialTab}
    />
  );
}
