import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getOnboardingDashboard, getOnboardingTemplates, getOrgEmployees, getOrgProfiles } from '@/lib/actions/onboarding';
import { OnboardingDashboard } from '@/components/onboarding/onboarding-dashboard';

export const metadata = { title: 'Employee Onboarding — VetOS' };

export default async function OnboardingPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createSupabaseAdminClient();

  const [dashRes, templatesRes, employeesRes, profilesRes, hospRolesRes, orgRolesRes] = await Promise.all([
    getOnboardingDashboard(),
    getOnboardingTemplates(),
    getOrgEmployees(),
    getOrgProfiles(),
    // hospital-scoped roles (hospital_admin, practice_manager, hr, etc.)
    admin.from('user_hospital_roles').select('role').eq('user_id', user.id),
    // org-scoped roles (super_admin, org_admin)
    admin.from('org_user_roles').select('role').eq('user_id', user.id),
  ]);

  const ADMIN_ROLES = ['super_admin', 'org_admin', 'hospital_admin', 'practice_manager', 'hr'];
  const allRoles = [
    ...(hospRolesRes.data ?? []).map(r => r.role),
    ...(orgRolesRes.data ?? []).map(r => r.role),
  ];
  const isAdmin = allRoles.some(r => ADMIN_ROLES.includes(r));
  // Only HR role can start onboarding; admins/super admins can only track
  const canStartOnboarding = allRoles.includes('hr');

  return (
    <OnboardingDashboard
      stats={dashRes.success ? dashRes.data.stats : null}
      records={dashRes.success ? dashRes.data.records : []}
      templates={templatesRes.success ? templatesRes.data : []}
      employees={employeesRes.success ? employeesRes.data : []}
      profiles={profilesRes.success ? profilesRes.data : []}
      userId={user.id}
      isAdmin={isAdmin}
      canStartOnboarding={canStartOnboarding}
    />
  );
}
