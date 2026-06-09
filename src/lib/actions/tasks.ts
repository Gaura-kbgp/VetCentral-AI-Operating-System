'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { writeAuditLog } from '@/lib/audit';
import type { ActionResult, Task, TaskComment, CreateTaskInput, UpdateTaskInput } from '@/types/app';

const createTaskSchema = z.object({
  title:       z.string().min(1, 'Title is required').max(300),
  description: z.string().max(5000).nullable().optional(),
  priority:    z.enum(['low', 'medium', 'high', 'urgent']),
  status:      z.enum(['todo', 'in_progress', 'review', 'done', 'cancelled']).default('todo'),
  due_date:    z.string().nullable().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  hospital_id: z.string().uuid().nullable().optional(),
});

export async function createTask(input: CreateTaskInput): Promise<ActionResult<Task>> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const parsed = createTaskSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid data' };

  const { data: profile } = await supabase
    .from('profiles').select('org_id').eq('id', user.id).single();
  if (!profile) return { success: false, error: 'Profile not found' };

  const { data, error } = await supabase
    .from('tasks')
    .insert({ ...parsed.data, org_id: profile.org_id, created_by: user.id })
    .select(`*, assignee:assigned_to(id,first_name,last_name,avatar_url)`)
    .single();

  if (error) return { success: false, error: error.message };

  await writeAuditLog({
    org_id: profile.org_id, user_id: user.id,
    action: 'create', resource_type: 'task', resource_id: data.id,
    new_data: data as Record<string, unknown>,
  });

  revalidatePath('/tasks');
  return { success: true, data: data as Task };
}

export async function updateTask(id: string, input: UpdateTaskInput): Promise<ActionResult<Task>> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const schema = createTaskSchema.partial();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid data' };

  const { data: old } = await supabase.from('tasks').select('*').eq('id', id).single();

  const { data, error } = await supabase
    .from('tasks')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(`*, assignee:assigned_to(id,first_name,last_name,avatar_url), creator:created_by(id,first_name,last_name,avatar_url)`)
    .single();

  if (error) return { success: false, error: error.message };

  if (old) {
    await writeAuditLog({
      org_id: data.org_id, user_id: user.id,
      action: 'update', resource_type: 'task', resource_id: id,
      old_data: old as Record<string, unknown>, new_data: data as Record<string, unknown>,
    });
  }

  revalidatePath('/tasks');
  return { success: true, data: data as Task };
}

export async function deleteTask(id: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data: task } = await supabase.from('tasks').select('org_id, title').eq('id', id).single();

  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) return { success: false, error: error.message };

  if (task) {
    await writeAuditLog({
      org_id: task.org_id, user_id: user.id,
      action: 'delete', resource_type: 'task', resource_id: id,
      old_data: task as Record<string, unknown>,
    });
  }

  revalidatePath('/tasks');
  return { success: true, data: undefined };
}

export async function addTaskComment(taskId: string, content: string): Promise<ActionResult<TaskComment>> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  if (!content.trim()) return { success: false, error: 'Comment cannot be empty' };

  const { data, error } = await supabase
    .from('task_comments')
    .insert({ task_id: taskId, user_id: user.id, content: content.trim() })
    .select(`*, author:user_id(id,first_name,last_name,avatar_url)`)
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath('/tasks');
  return { success: true, data: data as TaskComment };
}

export async function deleteTaskComment(id: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { error } = await supabase.from('task_comments').delete().eq('id', id).eq('user_id', user.id);
  if (error) return { success: false, error: error.message };

  revalidatePath('/tasks');
  return { success: true, data: undefined };
}
