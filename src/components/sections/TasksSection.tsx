'use client';

import { useState, useEffect } from 'react';
import { TasksShell } from '@/components/tasks/tasks-shell';
import { getTasksAssignedByMe, getMyReceivedTasks } from '@/lib/actions/tasks';
import type { TaskWithDetails } from '@/lib/tasks-types';
import type { SectionProps } from './types';
import { TableSkeleton } from './skeletons';
import type { AppRole } from '@/types/database';

const ASSIGNER_ROLES: AppRole[] = ['super_admin', 'org_admin', 'hospital_admin', 'practice_manager', 'hr'];

export function TasksSection({ userId, role }: SectionProps) {
  const isAssigner = !!role && ASSIGNER_ROLES.includes(role);

  const [assignedByMe, setAssignedByMe] = useState<TaskWithDetails[] | null>(null);
  const [myReceived, setMyReceived] = useState<TaskWithDetails[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [r1, r2] = await Promise.all([
        isAssigner ? getTasksAssignedByMe() : Promise.resolve({ success: true, data: [] as TaskWithDetails[] }),
        getMyReceivedTasks(),
      ]);
      if (!alive) return;
      setAssignedByMe(r1.success ? r1.data : []);
      setMyReceived(r2.success ? r2.data : []);
      setLoading(false);
    };
    load();
    return () => { alive = false; };
  }, [isAssigner]);

  if (loading || assignedByMe === null || myReceived === null) return <TableSkeleton />;

  return (
    <TasksShell
      role={role}
      currentUserId={userId}
      assignedByMe={assignedByMe}
      myReceivedTasks={myReceived}
    />
  );
}
