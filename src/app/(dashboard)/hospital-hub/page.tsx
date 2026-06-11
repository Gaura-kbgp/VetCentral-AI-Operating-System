import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getHospitalCards } from '@/lib/actions/hospital-hub';
import type { ViewRole } from '@/lib/actions/hospital-hub';
import { HubShell } from '@/components/hospital-hub/hub-shell';

export const metadata = { title: 'Hospital Hub' };

const EXECUTIVE_ROLES = ['super_admin', 'org_admin'];
const MANAGER_ROLES   = ['hospital_admin', 'practice_manager'];

export default async function HospitalHubPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createSupabaseAdminClient();

  const [{ data: myRoles }, { data: orgRoles }, cardsRes] = await Promise.all([
    admin.from('user_hospital_roles').select('hospital_id, role').eq('user_id', user.id),
    admin.from('org_user_roles').select('role').eq('user_id', user.id),
    getHospitalCards(),
  ]);

  const allRoles = [
    ...(myRoles  ?? []).map(r => r.role),
    ...(orgRoles ?? []).map(r => r.role),
  ];

  const viewRole: ViewRole = allRoles.some(r => EXECUTIVE_ROLES.includes(r))
    ? 'executive'
    : allRoles.some(r => MANAGER_ROLES.includes(r))
      ? 'manager'
      : 'staff';

  const allCards    = cardsRes.success ? cardsRes.data : [];
  const isExecutive = viewRole === 'executive';
  const assignedIds = new Set((myRoles ?? []).map(r => r.hospital_id));

  const hospitals = isExecutive
    ? allCards
    : allCards.filter(c => assignedIds.has(c.id));

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden px-6 py-5 bg-white">
      <HubShell
        hospitals={hospitals}
        userId={user.id}
        viewRole={viewRole}
        userRoles={allRoles}
      />
    </div>
  );
}
