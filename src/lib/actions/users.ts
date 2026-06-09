'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import type { AppRole } from '@/types/database';

const ADMIN_ROLES: AppRole[] = ['super_admin', 'org_admin', 'hospital_admin', 'it_admin'];

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
