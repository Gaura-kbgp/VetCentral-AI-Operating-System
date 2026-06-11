'use client';

import { CheckSquare } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import TasksClient from '@/components/tasks/tasks-client';
import { TableSkeleton } from './skeletons';
import type { SectionProps } from './types';

export function TasksSection({ userId }: SectionProps) {
  const { data } = useQuery({
    queryKey: ['tasks-data', userId],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const [tasksRes, profilesRes] = await Promise.all([
        supabase
          .from('tasks')
          .select('*, assignee:assigned_to(id,first_name,last_name,avatar_url), creator:created_by(id,first_name,last_name,avatar_url)')
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('profiles')
          .select('id,first_name,last_name,avatar_url,job_title')
          .eq('is_active', true)
          .order('first_name'),
      ]);
      return { tasks: tasksRes.data ?? [], teamMembers: profilesRes.data ?? [] };
    },
  });

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="My Tasks"
        description="Track and manage your assigned work"
        color="navy"
        variant="banner"
        icon={<CheckSquare className="h-7 w-7" />}
        action={<div id="task-create-portal" />}
      />
      {data ? (
        <TasksClient
          initialTasks={data.tasks as Parameters<typeof TasksClient>[0]['initialTasks']}
          teamMembers={data.teamMembers as Parameters<typeof TasksClient>[0]['teamMembers']}
          currentUserId={userId}
        />
      ) : <TableSkeleton />}
    </div>
  );
}
