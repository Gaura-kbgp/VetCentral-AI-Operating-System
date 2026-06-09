import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { Users } from 'lucide-react';
import HRClient from './client';
import type { EmployeeRow } from '@/lib/actions/hr';

const HR_ACCESS_ROLES = ['super_admin', 'org_admin', 'hospital_admin', 'practice_manager', 'hr'];

export default async function HRPageServer() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createSupabaseAdminClient();

  // Get caller's org_id and check access — two separate queries, no FK join
  const { data: callerProfile } = await admin
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single();

  if (!callerProfile?.org_id) redirect('/dashboard');

  const orgId = callerProfile.org_id;

  const { data: callerRoles } = await admin
    .from('user_hospital_roles')
    .select('role')
    .eq('user_id', user.id);

  const hasAccess = callerRoles?.some(r => HR_ACCESS_ROLES.includes(r.role));
  if (!hasAccess) redirect('/dashboard');

  // Fetch all profiles in this org
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, first_name, last_name, email, job_title, department, avatar_url, is_active, created_at, last_seen_at')
    .eq('org_id', orgId)
    .order('first_name');

  const profileList = profiles ?? [];

  // Fetch all role assignments for these users
  const userIds = profileList.map(p => p.id);
  const { data: allRoles } = userIds.length > 0
    ? await admin
        .from('user_hospital_roles')
        .select('user_id, role, hospital_id')
        .in('user_id', userIds)
    : { data: [] };

  // Fetch all hospitals in this org
  const { data: hospitals } = await admin
    .from('hospitals')
    .select('id, name, color')
    .eq('org_id', orgId)
    .order('name');

  const hospitalList = hospitals ?? [];
  const hospitalMap = new Map(hospitalList.map(h => [h.id, h]));

  // Group roles by user_id
  const rolesByUser = new Map<string, EmployeeRow['roles']>();
  for (const r of (allRoles ?? [])) {
    if (!rolesByUser.has(r.user_id)) rolesByUser.set(r.user_id, []);
    rolesByUser.get(r.user_id)!.push({
      role: r.role,
      hospital: hospitalMap.get(r.hospital_id) ?? null,
    });
  }

  // Assemble final employee rows
  const employees: EmployeeRow[] = profileList.map(p => ({
    ...p,
    roles: rolesByUser.get(p.id) ?? [],
  }));

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="HR Management"
        description="Manage employees, roles, and access credentials"
        color="navy"
        icon={<Users className="h-7 w-7" />}
      />
      <HRClient
        employees={employees}
        hospitals={hospitalList}
      />
    </div>
  );
}
