'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import type { AppRole } from '@/types/database';
import { canActorManageTarget } from '@/lib/role-utils';

const ADMIN_ROLES: AppRole[] = ['super_admin', 'org_admin', 'hospital_admin', 'it_admin'];

const HR_MANAGE_ROLES = ['super_admin', 'org_admin', 'hospital_admin', 'practice_manager', 'hr'];

async function getCallerAndCheck() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'Unauthorized' };

  const { data: callerRoles } = await supabase
    .from('user_hospital_roles').select('role').eq('user_id', user.id);

  const hasAccess = callerRoles?.some(r => ADMIN_ROLES.includes(r.role as AppRole));
  if (!hasAccess) return { ok: false as const, error: 'Access denied' };

  return { ok: true as const, user, supabase };
}

export async function updateUserProfile(
  targetUserId: string,
  data: {
    first_name:  string;
    last_name:   string;
    job_title?:  string | null;
    department?: string | null;
    phone?:      string | null;
  },
): Promise<{ success: boolean; error?: string }> {
  const ctx = await getCallerAndCheck();
  if (!ctx.ok) return { success: false, error: ctx.error };

  const adminClient = createSupabaseAdminClient();
  const { error } = await adminClient.from('profiles').update({
    first_name: data.first_name.trim(),
    last_name:  data.last_name.trim(),
    job_title:  data.job_title?.trim()  || null,
    department: data.department?.trim() || null,
    phone:      data.phone?.trim()      || null,
  }).eq('id', targetUserId);

  if (error) return { success: false, error: error.message };

  revalidatePath('/admin/users');
  return { success: true };
}

export async function assignRole(
  targetUserId: string,
  hospitalId:   string,
  role:         AppRole,
): Promise<{ success: boolean; error?: string }> {
  const ctx = await getCallerAndCheck();
  if (!ctx.ok) return { success: false, error: ctx.error };

  const adminClient = createSupabaseAdminClient();
  const { error } = await adminClient.from('user_hospital_roles').upsert(
    { user_id: targetUserId, hospital_id: hospitalId, role, assigned_by: ctx.user.id },
    { onConflict: 'user_id,hospital_id' },
  );

  if (error) return { success: false, error: error.message };

  revalidatePath('/admin/users');
  return { success: true };
}

export async function removeRole(
  targetUserId: string,
  hospitalId:   string,
): Promise<{ success: boolean; error?: string }> {
  const ctx = await getCallerAndCheck();
  if (!ctx.ok) return { success: false, error: ctx.error };

  const adminClient = createSupabaseAdminClient();
  const { error } = await adminClient.from('user_hospital_roles')
    .delete()
    .eq('user_id', targetUserId)
    .eq('hospital_id', hospitalId);

  if (error) return { success: false, error: error.message };

  revalidatePath('/admin/users');
  return { success: true };
}

export async function setUserActive(
  targetUserId: string,
  isActive:     boolean,
): Promise<{ success: boolean; error?: string }> {
  const ctx = await getCallerAndCheck();
  if (!ctx.ok) return { success: false, error: ctx.error };

  const adminClient = createSupabaseAdminClient();
  const { error } = await adminClient.from('profiles')
    .update({ is_active: isActive })
    .eq('id', targetUserId);

  if (error) return { success: false, error: error.message };

  revalidatePath('/admin/users');
  return { success: true };
}

// ── Permission-aware delete / activate ───────────────────────

async function getActorRoles(userId: string): Promise<string[]> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from('user_hospital_roles').select('role').eq('user_id', userId);
  return (data ?? []).map(r => r.role as string);
}

export async function deleteUserProfile(
  targetUserId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient();
    const admin    = createSupabaseAdminClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Unauthorized' };
    if (user.id === targetUserId) return { success: false, error: 'You cannot delete your own account' };

    const [actorRoles, targetRoles] = await Promise.all([
      getActorRoles(user.id),
      getActorRoles(targetUserId),
    ]);

    if (!actorRoles.some(r => HR_MANAGE_ROLES.includes(r)))
      return { success: false, error: 'Access denied' };
    if (!canActorManageTarget(actorRoles, targetRoles))
      return { success: false, error: 'Cannot delete a user with equal or higher permissions' };

    const { error } = await admin.auth.admin.deleteUser(targetUserId);
    if (error) return { success: false, error: error.message };

    revalidatePath('/admin/users');
    revalidatePath('/hr');
    revalidatePath('/onboarding');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Error' };
  }
}

export async function setUserActiveManaged(
  targetUserId: string,
  isActive:     boolean,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient();
    const admin    = createSupabaseAdminClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Unauthorized' };
    if (user.id === targetUserId) return { success: false, error: 'You cannot change your own status' };

    const [actorRoles, targetRoles] = await Promise.all([
      getActorRoles(user.id),
      getActorRoles(targetUserId),
    ]);

    if (!actorRoles.some(r => HR_MANAGE_ROLES.includes(r)))
      return { success: false, error: 'Access denied' };
    if (!canActorManageTarget(actorRoles, targetRoles))
      return { success: false, error: 'Insufficient permissions' };

    const { error } = await admin.from('profiles').update({ is_active: isActive }).eq('id', targetUserId);
    if (error) return { success: false, error: error.message };

    revalidatePath('/admin/users');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Error' };
  }
}
