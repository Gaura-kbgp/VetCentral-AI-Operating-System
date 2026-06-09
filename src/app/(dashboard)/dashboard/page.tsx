import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { AppRole } from '@/types/database';

import ExecutiveDashboard   from '@/components/dashboard/ExecutiveDashboard';
import HospitalAdminDashboard from '@/components/dashboard/HospitalAdminDashboard';
import HRDashboard          from '@/components/dashboard/HRDashboard';
import ManagerDashboard     from '@/components/dashboard/ManagerDashboard';
import ITDashboard          from '@/components/dashboard/ITDashboard';
import StaffDashboard       from '@/components/dashboard/StaffDashboard';

const ROLE_PRIORITY: AppRole[] = [
  'super_admin', 'org_admin', 'hospital_admin', 'practice_manager',
  'it_admin', 'hr', 'doctor', 'marketing', 'csr', 'va', 'viewer',
];

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createSupabaseAdminClient();

  const [profileRes, orgRolesRes, hospitalRolesRes] = await Promise.all([
    admin.from('profiles').select('first_name, org_id').eq('id', user.id).single(),
    admin.from('org_user_roles').select('role').eq('user_id', user.id),
    admin.from('user_hospital_roles').select('role, hospital_id').eq('user_id', user.id).limit(1),
  ]);

  const firstName  = profileRes.data?.first_name ?? 'there';
  const orgId      = profileRes.data?.org_id ?? '';
  const hospitalId = hospitalRolesRes.data?.[0]?.hospital_id ?? null;

  // Collect all roles from both tables
  const allRoles: string[] = [
    ...(orgRolesRes.data ?? []).map(r => r.role),
    ...(hospitalRolesRes.data ?? []).map(r => r.role),
  ];

  // Pick highest-priority role
  const dominantRole: AppRole | null =
    ROLE_PRIORITY.find(r => allRoles.includes(r)) ?? null;

  const baseProps = { userId: user.id, orgId, firstName, hospitalId };

  // Executives: super_admin, org_admin
  if (dominantRole === 'super_admin' || dominantRole === 'org_admin') {
    return <ExecutiveDashboard {...baseProps} role={dominantRole} />;
  }

  // Hospital admin
  if (dominantRole === 'hospital_admin') {
    return <HospitalAdminDashboard {...baseProps} />;
  }

  // HR
  if (dominantRole === 'hr') {
    return <HRDashboard {...baseProps} />;
  }

  // Practice manager
  if (dominantRole === 'practice_manager') {
    return <ManagerDashboard {...baseProps} />;
  }

  // IT Admin
  if (dominantRole === 'it_admin') {
    return <ITDashboard {...baseProps} />;
  }

  // Everyone else: doctor, va, csr, marketing, viewer (+ null)
  return <StaffDashboard {...baseProps} role={dominantRole} />;
}
