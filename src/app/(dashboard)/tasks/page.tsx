import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { CheckSquare } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import TasksClient from '@/components/tasks/tasks-client';
import { Button } from '@/components/ui/button';

export default async function TasksPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [tasksResult, profilesResult] = await Promise.all([
    supabase
      .from('tasks')
      .select(`
        *,
        assignee:assigned_to(id,first_name,last_name,avatar_url),
        creator:created_by(id,first_name,last_name,avatar_url)
      `)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('profiles')
      .select('id,first_name,last_name,avatar_url,job_title')
      .eq('is_active', true)
      .order('first_name'),
  ]);

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="My Tasks"
        description="Track and manage your assigned work"
        color="navy"
        icon={<CheckSquare className="h-7 w-7" />}
        action={<div id="task-create-portal" />}
      />
      <TasksClient
        initialTasks={tasksResult.data ?? []}
        teamMembers={profilesResult.data ?? []}
        currentUserId={user.id}
      />
    </div>
  );
}
