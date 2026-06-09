import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import {
  getOrgOverview, getHospitalCards, getUpcomingEventsAllHospitals,
} from '@/lib/actions/hospital-hub';
import type { ViewRole } from '@/lib/actions/hospital-hub';
import { HubShell } from '@/components/hospital-hub/hub-shell';

export const metadata = { title: 'Hospital Hub — Operations Center' };

const EXECUTIVE_ROLES = ['super_admin', 'org_admin'];
const MANAGER_ROLES   = ['hospital_admin', 'practice_manager'];

export default async function HospitalHubPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createSupabaseAdminClient();

  const { data: profile } = await admin
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single();

  const [{ data: myRoles }, { data: orgRoles }, { data: org }] = await Promise.all([
    admin.from('user_hospital_roles').select('hospital_id, role').eq('user_id', user.id),
    admin.from('org_user_roles').select('role').eq('user_id', user.id),
    profile?.org_id
      ? admin.from('organizations').select('name').eq('id', profile.org_id).single()
      : Promise.resolve({ data: null }),
  ]);

  const hospitalRoleSet = new Set((myRoles ?? []).map(r => r.role));
  const orgRoleSet      = new Set((orgRoles ?? []).map(r => r.role));
  const allRoles        = new Set([...hospitalRoleSet, ...orgRoleSet]);

  const viewRole: ViewRole = [...allRoles].some(r => EXECUTIVE_ROLES.includes(r))
    ? 'executive'
    : [...allRoles].some(r => MANAGER_ROLES.includes(r))
      ? 'manager'
      : 'staff';

  const [overviewRes, cardsRes, eventsRes] = await Promise.all([
    getOrgOverview(),
    getHospitalCards(),
    getUpcomingEventsAllHospitals(25),
  ]);

  // Executives (super_admin/org_admin) see all hospitals; others see assigned only
  const isExecutive = viewRole === 'executive';
  const assignedIds = [...new Set((myRoles ?? []).map(r => r.hospital_id))];
  const myHospitalIds = isExecutive
    ? (cardsRes.success ? cardsRes.data.map(c => c.id) : assignedIds)
    : assignedIds;

  return (
    <HubShell
      orgName={org?.name ?? 'Operations Center'}
      overview={overviewRes.success ? overviewRes.data : null}
      cards={cardsRes.success ? cardsRes.data : []}
      crossEvents={eventsRes.success ? eventsRes.data : []}
      myHospitalIds={myHospitalIds}
      userId={user.id}
      viewRole={viewRole}
    />
  );
}
