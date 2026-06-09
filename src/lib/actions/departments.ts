'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import type { AppRole } from '@/types/database';

const ADMIN_ROLES: AppRole[] = ['super_admin', 'org_admin', 'hospital_admin', 'practice_manager', 'hr'];

export type DepartmentInput = {
  name: string;
  hospital_id: string;
  description?: string | null;
  manager_id?: string | null;
  color?: string;
};

type ActionResult = { success: boolean; data?: Record<string, unknown>; error?: string };

async function getAdminCtx() {
  const supabase = await createSupabaseServerClient();
  const adminClient = createSupabaseAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'Unauthorized' };
  const { data: roles } = await adminClient
    .from('user_hospital_roles').select('role').eq('user_id', user.id);
  if (!roles?.some(r => ADMIN_ROLES.includes(r.role as AppRole))) {
    return { ok: false as const, error: 'Forbidden' };
  }
  const { data: profile } = await adminClient
    .from('profiles').select('org_id').eq('id', user.id).single();
  if (!profile?.org_id) return { ok: false as const, error: 'No org' };
  return { ok: true as const, user, adminClient, orgId: profile.org_id as string };
}

// Verify a hospital belongs to the caller's org, returns org_id or null
async function hospitalOrg(
  adminClient: ReturnType<typeof createSupabaseAdminClient>,
  hospitalId: string,
  orgId: string,
): Promise<boolean> {
  const { data } = await adminClient
    .from('hospitals').select('id').eq('id', hospitalId).eq('org_id', orgId).maybeSingle();
  return !!data;
}

export async function createDepartment(input: DepartmentInput): Promise<ActionResult> {
  const ctx = await getAdminCtx();
  if (!ctx.ok) return { success: false, error: ctx.error };
  const { adminClient, orgId, user } = ctx;

  const name = input.name?.trim();
  if (!name) return { success: false, error: 'Name is required' };
  if (!input.hospital_id) return { success: false, error: 'Hospital is required' };
  if (!(await hospitalOrg(adminClient, input.hospital_id, orgId))) {
    return { success: false, error: 'Invalid hospital' };
  }

  const { data, error } = await adminClient
    .from('departments')
    .insert({
      name,
      hospital_id: input.hospital_id,
      org_id:      orgId,
      description: input.description?.trim() || null,
      manager_id:  input.manager_id || null,
      color:       input.color || '#6366F1',
      is_active:   true,
    })
    .select('*')
    .single();

  if (error) return { success: false, error: error.message };

  await adminClient.from('audit_logs').insert({
    org_id:        orgId,
    hospital_id:   input.hospital_id,
    user_id:       user.id,
    action:        'create',
    resource_type: 'department',
    resource_id:   data.id,
    old_data:      null,
    new_data:      data,
  });

  revalidatePath('/admin/departments');
  return { success: true, data };
}

export async function updateDepartment(id: string, input: DepartmentInput): Promise<ActionResult> {
  const ctx = await getAdminCtx();
  if (!ctx.ok) return { success: false, error: ctx.error };
  const { adminClient, orgId, user } = ctx;

  const name = input.name?.trim();
  if (!name) return { success: false, error: 'Name is required' };
  if (!input.hospital_id) return { success: false, error: 'Hospital is required' };
  if (!(await hospitalOrg(adminClient, input.hospital_id, orgId))) {
    return { success: false, error: 'Invalid hospital' };
  }

  const { data: oldData } = await adminClient
    .from('departments').select('*').eq('id', id).eq('org_id', orgId).single();
  if (!oldData) return { success: false, error: 'Department not found' };

  const { data, error } = await adminClient
    .from('departments')
    .update({
      name,
      hospital_id: input.hospital_id,
      description: input.description?.trim() || null,
      manager_id:  input.manager_id || null,
      color:       input.color || oldData.color,
      updated_at:  new Date().toISOString(),
    })
    .eq('id', id)
    .eq('org_id', orgId)
    .select('*')
    .single();

  if (error) return { success: false, error: error.message };

  await adminClient.from('audit_logs').insert({
    org_id:        orgId,
    hospital_id:   input.hospital_id,
    user_id:       user.id,
    action:        'update',
    resource_type: 'department',
    resource_id:   id,
    old_data:      oldData,
    new_data:      data,
  });

  revalidatePath('/admin/departments');
  return { success: true, data };
}

export async function deleteDepartment(id: string): Promise<ActionResult> {
  const ctx = await getAdminCtx();
  if (!ctx.ok) return { success: false, error: ctx.error };
  const { adminClient, orgId, user } = ctx;

  const { data: oldData } = await adminClient
    .from('departments').select('*').eq('id', id).eq('org_id', orgId).single();
  if (!oldData) return { success: false, error: 'Department not found' };

  // Detach members first to avoid orphan FK rows
  await adminClient.from('user_departments').delete().eq('department_id', id);

  const { error } = await adminClient
    .from('departments').delete().eq('id', id).eq('org_id', orgId);

  if (error) return { success: false, error: error.message };

  await adminClient.from('audit_logs').insert({
    org_id:        orgId,
    hospital_id:   oldData.hospital_id,
    user_id:       user.id,
    action:        'delete',
    resource_type: 'department',
    resource_id:   id,
    old_data:      oldData,
    new_data:      null,
  });

  revalidatePath('/admin/departments');
  return { success: true, data: oldData };
}

export async function toggleDepartmentStatus(id: string, isActive: boolean): Promise<ActionResult> {
  const ctx = await getAdminCtx();
  if (!ctx.ok) return { success: false, error: ctx.error };
  const { adminClient, orgId, user } = ctx;

  const { data: oldData } = await adminClient
    .from('departments').select('*').eq('id', id).eq('org_id', orgId).single();
  if (!oldData) return { success: false, error: 'Department not found' };

  const { data, error } = await adminClient
    .from('departments')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', orgId)
    .select('*')
    .single();

  if (error) return { success: false, error: error.message };

  await adminClient.from('audit_logs').insert({
    org_id:        orgId,
    hospital_id:   oldData.hospital_id,
    user_id:       user.id,
    action:        isActive ? 'activate' : 'deactivate',
    resource_type: 'department',
    resource_id:   id,
    old_data:      oldData,
    new_data:      data,
  });

  revalidatePath('/admin/departments');
  return { success: true, data };
}
