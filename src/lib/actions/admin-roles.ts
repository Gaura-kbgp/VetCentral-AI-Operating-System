'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import type { AppRole } from '@/types/database';

const ADMIN_ROLES: AppRole[] = ['super_admin', 'org_admin'];

export type Permission = {
  id: string;
  module: string;
  action: string;
  label: string;
  sort_order?: number;
};

export type PermissionMatrix = {
  permissions: Permission[];
  rolePermissions: Record<string, string[]>;
};

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

export async function getRolePermissionMatrix(): Promise<
  { success: boolean; data?: PermissionMatrix; error?: string }
> {
  const ctx = await getAdminCtx();
  if (!ctx.ok) return { success: false, error: ctx.error };
  const { adminClient } = ctx;

  const { data: permissions, error: pErr } = await adminClient
    .from('permissions')
    .select('id, module, action, label, sort_order')
    .order('module', { ascending: true })
    .order('sort_order', { ascending: true });
  if (pErr) return { success: false, error: pErr.message };

  const { data: rolePerms, error: rErr } = await adminClient
    .from('role_permissions')
    .select('role, permission_id');
  if (rErr) return { success: false, error: rErr.message };

  const rolePermissions: Record<string, string[]> = {};
  for (const rp of rolePerms ?? []) {
    (rolePermissions[rp.role] ??= []).push(rp.permission_id);
  }

  return {
    success: true,
    data: { permissions: (permissions ?? []) as Permission[], rolePermissions },
  };
}

export async function updateRolePermissions(
  role: AppRole,
  permissionIds: string[],
): Promise<{ success: boolean; error?: string }> {
  const ctx = await getAdminCtx();
  if (!ctx.ok) return { success: false, error: ctx.error };
  const { adminClient, orgId, user } = ctx;

  const { data: oldRows } = await adminClient
    .from('role_permissions').select('permission_id').eq('role', role);
  const oldIds = (oldRows ?? []).map(r => r.permission_id);

  // Replace: delete all then insert the new set
  const { error: delErr } = await adminClient
    .from('role_permissions').delete().eq('role', role);
  if (delErr) return { success: false, error: delErr.message };

  if (permissionIds.length > 0) {
    const rows = permissionIds.map(pid => ({
      role,
      permission_id: pid,
      granted_by: user.id,
    }));
    const { error: insErr } = await adminClient
      .from('role_permissions').insert(rows);
    if (insErr) return { success: false, error: insErr.message };
  }

  await adminClient.from('audit_logs').insert({
    org_id:        orgId,
    user_id:       user.id,
    action:        'update',
    resource_type: 'role_permission',
    resource_id:   null,
    old_data:      { role, permission_ids: oldIds },
    new_data:      { role, permission_ids: permissionIds },
  });

  revalidatePath('/admin/roles');
  return { success: true };
}

export async function cloneRolePermissions(
  sourceRole: AppRole,
  targetRole: AppRole,
): Promise<{ success: boolean; error?: string }> {
  const ctx = await getAdminCtx();
  if (!ctx.ok) return { success: false, error: ctx.error };
  const { adminClient, orgId, user } = ctx;

  if (sourceRole === targetRole) {
    return { success: false, error: 'Source and target roles must differ' };
  }

  const { data: srcRows, error: srcErr } = await adminClient
    .from('role_permissions').select('permission_id').eq('role', sourceRole);
  if (srcErr) return { success: false, error: srcErr.message };

  const { data: oldRows } = await adminClient
    .from('role_permissions').select('permission_id').eq('role', targetRole);
  const oldIds = (oldRows ?? []).map(r => r.permission_id);

  const { error: delErr } = await adminClient
    .from('role_permissions').delete().eq('role', targetRole);
  if (delErr) return { success: false, error: delErr.message };

  const ids = (srcRows ?? []).map(r => r.permission_id);
  if (ids.length > 0) {
    const rows = ids.map(pid => ({
      role: targetRole,
      permission_id: pid,
      granted_by: user.id,
    }));
    const { error: insErr } = await adminClient
      .from('role_permissions').insert(rows);
    if (insErr) return { success: false, error: insErr.message };
  }

  await adminClient.from('audit_logs').insert({
    org_id:        orgId,
    user_id:       user.id,
    action:        'update',
    resource_type: 'role_permission',
    resource_id:   null,
    old_data:      { role: targetRole, permission_ids: oldIds },
    new_data:      { role: targetRole, permission_ids: ids, cloned_from: sourceRole },
  });

  revalidatePath('/admin/roles');
  return { success: true };
}
