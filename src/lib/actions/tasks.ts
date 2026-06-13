'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import { writeAuditLog } from '@/lib/audit';
import type { ActionResult } from '@/types/app';
import {
  parseTaskContent, serializeTaskContent, enrichTask,
} from '@/lib/tasks-types';
import type { TaskWithDetails, AssignableMember, AssignTaskInput, ChecklistItem } from '@/lib/tasks-types';

export type {
  TaskPriority, TaskStatus, TaskType, ChecklistItem,
  TaskWithDetails, AssignableMember, TaskStats, AssignTaskInput,
} from '@/lib/tasks-types';

// ─────────────────────────────────────────────────────────────
// Context helper
// ─────────────────────────────────────────────────────────────

async function ctx() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin.from('profiles')
    .select('org_id, first_name, last_name').eq('id', user.id).single();
  if (!profile?.org_id) return null;
  return { user, admin, orgId: profile.org_id as string, profile };
}

// ─────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────

const SEL = '*, assignee:assigned_to(id,first_name,last_name,avatar_url,job_title), creator:created_by(id,first_name,last_name,avatar_url)';

export async function getTasksAssignedByMe(): Promise<ActionResult<TaskWithDetails[]>> {
  const c = await ctx(); if (!c) return { success: false, error: 'Unauthorized' };
  const { data, error } = await c.admin.from('tasks').select(SEL)
    .eq('org_id', c.orgId).eq('created_by', c.user.id)
    .order('created_at', { ascending: false });
  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []).map(t => enrichTask(t as Record<string, unknown>)) };
}

export async function getAllOrgTasks(): Promise<ActionResult<TaskWithDetails[]>> {
  const c = await ctx(); if (!c) return { success: false, error: 'Unauthorized' };
  const { data, error } = await c.admin.from('tasks').select(SEL)
    .eq('org_id', c.orgId).order('created_at', { ascending: false });
  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []).map(t => enrichTask(t as Record<string, unknown>)) };
}

export async function getMyReceivedTasks(): Promise<ActionResult<TaskWithDetails[]>> {
  const c = await ctx(); if (!c) return { success: false, error: 'Unauthorized' };
  const { data, error } = await c.admin.from('tasks').select(SEL)
    .eq('org_id', c.orgId).eq('assigned_to', c.user.id)
    .order('created_at', { ascending: false });
  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []).map(t => enrichTask(t as Record<string, unknown>)) };
}

export async function getMyReceivedTaskCount(): Promise<ActionResult<number>> {
  const c = await ctx(); if (!c) return { success: false, error: 'Unauthorized' };
  const { count, error } = await c.admin.from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', c.orgId).eq('assigned_to', c.user.id)
    .not('status', 'in', '("done","cancelled")');
  if (error) return { success: false, error: error.message };
  return { success: true, data: count ?? 0 };
}

export async function getAssignableMembers(): Promise<ActionResult<AssignableMember[]>> {
  const c = await ctx(); if (!c) return { success: false, error: 'Unauthorized' };

  const { data: saRoles } = await c.admin.from('org_user_roles')
    .select('user_id').eq('role', 'super_admin');
  const saIds = new Set((saRoles ?? []).map((r: Record<string, string>) => r.user_id));

  const { data: profiles, error } = await c.admin.from('profiles')
    .select('id,first_name,last_name,job_title,department')
    .eq('org_id', c.orgId).eq('is_active', true);
  if (error) return { success: false, error: error.message };

  const eligible = (profiles ?? []).filter((p: Record<string, string>) => !saIds.has(p.id));
  const ids = eligible.map((p: Record<string, string>) => p.id);

  const [{ data: activeTasks }, { data: orgRoles }] = await Promise.all([
    c.admin.from('tasks').select('assigned_to')
      .in('assigned_to', ids).not('status', 'in', '("done","cancelled")'),
    c.admin.from('org_user_roles').select('user_id,role').in('user_id', ids),
  ]);

  const countMap: Record<string, number> = {};
  for (const t of activeTasks ?? []) {
    if (t.assigned_to) countMap[t.assigned_to] = (countMap[t.assigned_to] ?? 0) + 1;
  }
  const roleMap: Record<string, string> = {};
  for (const r of (orgRoles ?? []) as Array<{ user_id: string; role: string }>) roleMap[r.user_id] = r.role;

  return {
    success: true,
    data: eligible.map((p: Record<string, string>) => ({
      id: p.id,
      name: [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown',
      role: roleMap[p.id] ?? 'staff',
      job_title: p.job_title ?? null,
      department: p.department ?? null,
      active_task_count: countMap[p.id] ?? 0,
    })),
  };
}

export async function getUserTaskLoad(userId: string): Promise<ActionResult<{ count: number; titles: string[] }>> {
  const c = await ctx(); if (!c) return { success: false, error: 'Unauthorized' };
  const { data, error } = await c.admin.from('tasks').select('id,title')
    .eq('org_id', c.orgId).eq('assigned_to', userId)
    .not('status', 'in', '("done","cancelled")');
  if (error) return { success: false, error: error.message };
  return { success: true, data: { count: (data ?? []).length, titles: (data ?? []).map((t: Record<string, string>) => t.title) } };
}

// ─────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────

export async function assignTask(input: AssignTaskInput): Promise<ActionResult<TaskWithDetails>> {
  const c = await ctx(); if (!c) return { success: false, error: 'Unauthorized' };

  const description = serializeTaskContent(input.type, input.notes, input.items);
  const { data, error } = await c.admin.from('tasks')
    .insert({
      org_id: c.orgId, title: input.title.trim(), description,
      priority: input.priority, status: 'todo',
      due_date: input.due_date ?? null,
      assigned_to: input.assigned_to, created_by: c.user.id,
    })
    .select(SEL).single();
  if (error) return { success: false, error: error.message };

  const assignerName = [c.profile.first_name, c.profile.last_name].filter(Boolean).join(' ') || 'Your manager';
  try {
    await c.admin.from('notifications').insert({
      user_id: input.assigned_to, org_id: c.orgId,
      type: 'task_assigned',
      title: 'New Task Assigned',
      body: `${assignerName} assigned you: "${input.title}"`,
      link: '/dashboard?section=tasks',
      is_read: false,
      metadata: { task_id: data.id, assigner_id: c.user.id },
    });
  } catch { /* non-fatal */ }

  await writeAuditLog({ org_id: c.orgId, user_id: c.user.id, action: 'create', resource_type: 'task', resource_id: data.id, new_data: data as Record<string, unknown> });
  revalidatePath('/tasks');
  return { success: true, data: enrichTask(data as Record<string, unknown>) };
}

export async function updateTaskItems(taskId: string, items: ChecklistItem[]): Promise<ActionResult<TaskWithDetails>> {
  const c = await ctx(); if (!c) return { success: false, error: 'Unauthorized' };

  const { data: existing } = await c.admin.from('tasks').select('*').eq('id', taskId).single();
  if (!existing) return { success: false, error: 'Task not found' };

  const content = parseTaskContent(existing.description as string | null);
  const newDescription = serializeTaskContent('checklist', content.notes, items);
  const allDone = items.length > 0 && items.every(i => i.done);
  const newStatus = allDone ? 'done' : (existing.status === 'done' ? 'in_progress' : existing.status);

  const { data, error } = await c.admin.from('tasks')
    .update({ description: newDescription, status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', taskId).select(SEL).single();
  if (error) return { success: false, error: error.message };

  if (allDone && existing.created_by && existing.created_by !== c.user.id) {
    const name = [c.profile.first_name, c.profile.last_name].filter(Boolean).join(' ') || 'Someone';
    try {
      await c.admin.from('notifications').insert({
        user_id: existing.created_by, org_id: c.orgId,
        type: 'task_completed', title: 'Task Completed',
        body: `${name} completed all items in "${existing.title}"`,
        link: '/dashboard?section=tasks', is_read: false,
        metadata: { task_id: taskId },
      });
    } catch { /* non-fatal */ }
  }

  return { success: true, data: enrichTask(data as Record<string, unknown>) };
}

export async function completeTask(taskId: string): Promise<ActionResult<TaskWithDetails>> {
  const c = await ctx(); if (!c) return { success: false, error: 'Unauthorized' };

  const { data: existing } = await c.admin.from('tasks').select('*').eq('id', taskId).single();
  if (!existing) return { success: false, error: 'Task not found' };

  const { data, error } = await c.admin.from('tasks')
    .update({ status: 'done', updated_at: new Date().toISOString() })
    .eq('id', taskId).select(SEL).single();
  if (error) return { success: false, error: error.message };

  if (existing.created_by && existing.created_by !== c.user.id) {
    const name = [c.profile.first_name, c.profile.last_name].filter(Boolean).join(' ') || 'Someone';
    try {
      await c.admin.from('notifications').insert({
        user_id: existing.created_by, org_id: c.orgId,
        type: 'task_completed', title: 'Task Completed',
        body: `${name} marked "${existing.title}" as complete`,
        link: '/dashboard?section=tasks', is_read: false,
        metadata: { task_id: taskId },
      });
    } catch { /* non-fatal */ }
  }

  return { success: true, data: enrichTask(data as Record<string, unknown>) };
}

export async function reopenTask(taskId: string): Promise<ActionResult<TaskWithDetails>> {
  const c = await ctx(); if (!c) return { success: false, error: 'Unauthorized' };
  const { data, error } = await c.admin.from('tasks')
    .update({ status: 'in_progress', updated_at: new Date().toISOString() })
    .eq('id', taskId).select(SEL).single();
  if (error) return { success: false, error: error.message };
  return { success: true, data: enrichTask(data as Record<string, unknown>) };
}

export async function deleteTaskById(taskId: string): Promise<ActionResult<void>> {
  const c = await ctx(); if (!c) return { success: false, error: 'Unauthorized' };
  const { data: existing } = await c.admin.from('tasks').select('org_id,title').eq('id', taskId).single();
  const { error } = await c.admin.from('tasks').delete().eq('id', taskId);
  if (error) return { success: false, error: error.message };
  if (existing) await writeAuditLog({ org_id: existing.org_id, user_id: c.user.id, action: 'delete', resource_type: 'task', resource_id: taskId, old_data: existing as Record<string, unknown> });
  revalidatePath('/tasks');
  return { success: true, data: undefined };
}
