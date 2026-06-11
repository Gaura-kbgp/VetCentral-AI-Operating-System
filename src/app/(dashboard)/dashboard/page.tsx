import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { AppRole } from '@/types/database';
import type { SectionKey } from '@/types/sections';
import { ContentRenderer } from '@/components/spa/ContentRenderer';

import ExecutiveDashboard     from '@/components/dashboard/ExecutiveDashboard';
import HospitalAdminDashboard from '@/components/dashboard/HospitalAdminDashboard';
import HRDashboard            from '@/components/dashboard/HRDashboard';
import ManagerDashboard       from '@/components/dashboard/ManagerDashboard';
import ITDashboard            from '@/components/dashboard/ITDashboard';
import StaffDashboard         from '@/components/dashboard/StaffDashboard';

const ROLE_PRIORITY: AppRole[] = [
  'super_admin', 'org_admin', 'hospital_admin', 'practice_manager',
  'it_admin', 'hr', 'doctor', 'marketing', 'csr', 'va', 'viewer',
];

interface PageProps {
  searchParams: Promise<{ section?: string; id?: string }>;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const initialSection = (params.section as SectionKey) || 'dashboard';
  const initialSubId   = params.id || null;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createSupabaseAdminClient();

  const [profileRes, orgRolesRes, hospitalRolesRes] = await Promise.all([
    admin.from('profiles').select('first_name, org_id').eq('id', user.id).single(),
    admin.from('org_user_roles').select('role').eq('user_id', user.id),
    admin.from('user_hospital_roles').select('role, hospital_id').eq('user_id', user.id).limit(1),
  ]);

  const firstName  = profileRes.data?.first_name ?? '';
  const orgId      = profileRes.data?.org_id ?? '';
  const hospitalId = hospitalRolesRes.data?.[0]?.hospital_id ?? null;

  const allRoles: string[] = [
    ...(orgRolesRes.data ?? []).map(r => r.role),
    ...(hospitalRolesRes.data ?? []).map(r => r.role),
  ];
  const role: AppRole | null = ROLE_PRIORITY.find(r => allRoles.includes(r)) ?? null;

  const baseProps = { userId: user.id, orgId, firstName, hospitalId };

  // Server-render the role-specific dashboard. Passed as children (server composition
  // pattern) so ContentRenderer (client) never imports server-only modules.
  let dashboardContent: React.ReactNode;
  if (role === 'super_admin' || role === 'org_admin') {
    dashboardContent = <ExecutiveDashboard {...baseProps} role={role} />;
  } else if (role === 'hospital_admin') {
    dashboardContent = <HospitalAdminDashboard {...baseProps} />;
  } else if (role === 'hr') {
    dashboardContent = <HRDashboard {...baseProps} />;
  } else if (role === 'practice_manager') {
    dashboardContent = <ManagerDashboard {...baseProps} />;
  } else if (role === 'it_admin') {
    dashboardContent = <ITDashboard {...baseProps} />;
  } else {
    dashboardContent = <StaffDashboard {...baseProps} role={role} />;
  }

  return (
    <ContentRenderer
      userId={user.id}
      orgId={orgId}
      role={role}
      firstName={firstName}
      hospitalId={hospitalId}
      initialSection={initialSection}
      initialSubId={initialSubId}
    >
      {dashboardContent}
    </ContentRenderer>
  );
}
