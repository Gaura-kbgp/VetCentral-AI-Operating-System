import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getTasksAssignedByMe, getMyReceivedTasks } from '@/lib/actions/tasks';
// types come from tasks-types; actions re-export them but page only needs the functions
import { TasksShell } from '@/components/tasks/tasks-shell';
import type { AppRole } from '@/types/database';

const ASSIGNER_ROLES: AppRole[] = ['super_admin', 'org_admin', 'hospital_admin', 'practice_manager', 'hr'];

export default async function TasksPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin.from('profiles').select('org_id').eq('id', user.id).single();
  const { data: roleRow } = await admin.from('org_user_roles').select('role').eq('user_id', user.id).single();
  const role = (roleRow?.role ?? null) as AppRole | null;
  const isAssigner = !!role && ASSIGNER_ROLES.includes(role);

  const [r1, r2] = await Promise.all([
    isAssigner ? getTasksAssignedByMe() : Promise.resolve({ success: true as const, data: [] }),
    getMyReceivedTasks(),
  ]);

  return (
    <TasksShell
      role={role}
      currentUserId={user.id}
      assignedByMe={r1.success ? r1.data : []}
      myReceivedTasks={r2.success ? r2.data : []}
    />
  );
}
