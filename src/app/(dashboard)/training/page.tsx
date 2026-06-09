import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { GraduationCap } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { LMSShell } from '@/components/training/lms-shell';

const TRAINING_ADMIN_ROLES = ['super_admin', 'org_admin', 'hospital_admin', 'hr'];

export const metadata = { title: 'Training Academy' };

export default async function TrainingPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createSupabaseAdminClient();

  const [profileRes, hospRolesRes, orgRolesRes, hospitalsRes] = await Promise.all([
    supabase.from('profiles').select('org_id').eq('id', user.id).single(),
    admin.from('user_hospital_roles').select('role').eq('user_id', user.id),
    admin.from('org_user_roles').select('role').eq('user_id', user.id),
    supabase.from('hospitals').select('id, name, color').order('name'),
  ]);

  const orgId = profileRes.data?.org_id ?? '';
  const allRoles = [
    ...(hospRolesRes.data ?? []),
    ...(orgRolesRes.data ?? []),
  ].map(r => r.role);
  const isAdmin = allRoles.some(r => TRAINING_ADMIN_ROLES.includes(r));
  const hospitals = hospitalsRes.data ?? [];

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Training Academy"
        description="Complete your courses, track compliance, and earn certifications"
        color="orange"
        icon={<GraduationCap className="h-7 w-7" />}
      />
      <LMSShell
        userId={user.id}
        orgId={orgId}
        isAdmin={isAdmin}
        hospitals={hospitals}
      />
    </div>
  );
}
