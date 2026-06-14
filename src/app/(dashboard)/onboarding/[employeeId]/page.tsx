import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { getWizardData } from '@/lib/actions/onboarding-wizard';
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard';
import { getOnboardingRecord, getOrgProfiles } from '@/lib/actions/onboarding';
import { EmployeeOnboarding } from '@/components/onboarding/employee-onboarding';

export async function generateMetadata() {
  return { title: 'Employee Onboarding — VetOS' };
}

const ADMIN_ROLES = ['super_admin', 'org_admin', 'hospital_admin', 'practice_manager', 'hr'];

export default async function EmployeeOnboardingPage({
  params,
  searchParams,
}: {
  params:       Promise<{ employeeId: string }>;
  searchParams: Promise<{ view?: string; tab?: string }>;
}) {
  const { employeeId } = await params;
  const { view, tab }  = await searchParams;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createSupabaseAdminClient();

  const [hospRolesRes, orgRolesRes] = await Promise.all([
    admin.from('user_hospital_roles').select('role').eq('user_id', user.id),
    admin.from('org_user_roles').select('role').eq('user_id', user.id),
  ]);

  const allRoles = [
    ...(hospRolesRes.data ?? []).map((r: { role: string }) => r.role),
    ...(orgRolesRes.data ?? []).map((r: { role: string }) => r.role),
  ];

  const isAdmin    = allRoles.some(r => ADMIN_ROLES.includes(r));
  const isOwnRecord = user.id === employeeId;

  // HR/admin viewing someone else's record → legacy detail view (unless forced to wizard)
  if (isAdmin && !isOwnRecord && view !== 'wizard') {
    const [recordRes, profilesRes] = await Promise.all([
      getOnboardingRecord(employeeId),
      getOrgProfiles(),
    ]);

    if (!recordRes.success) redirect('/dashboard');

    const VALID_TABS = ['overview','checklist','documents','training','meetings','compliance','activity'] as const;
    type Tab = typeof VALID_TABS[number];
    const initialTab: Tab = VALID_TABS.includes(tab as Tab) ? (tab as Tab) : 'overview';

    return (
      <div className="absolute inset-0 overflow-y-auto bg-slate-50/70">
        <div className="px-6 py-6">
          <EmployeeOnboarding
            record={recordRes.data}
            profiles={profilesRes.success ? profilesRes.data : []}
            userId={user.id}
            isAdmin={isAdmin}
            isOwnRecord={isOwnRecord}
            initialTab={initialTab}
          />
        </div>
      </div>
    );
  }

  // Employee or admin-as-wizard → new 8-step wizard
  const wizardRes = await getWizardData(employeeId);

  if (!wizardRes.data) {
    if (isAdmin) redirect('/dashboard');
    notFound();
  }

  return (
    <div className="absolute inset-0 overflow-y-auto bg-slate-50/70">
      <OnboardingWizard initialData={wizardRes.data} />
    </div>
  );
}
