'use server';

import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { AppRole } from '@/types/database';
import { sendCredentialsEmail } from '@/lib/email';

// Roles that can use HR actions
const HR_ACCESS_ROLES: AppRole[] = [
  'super_admin', 'org_admin', 'hospital_admin', 'practice_manager', 'hr',
];

function generatePassword(): string {
  const upper   = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower   = 'abcdefghjkmnpqrstuvwxyz';
  const digits  = '23456789';
  const special = '@#$!';
  const all     = upper + lower + digits + special;
  const rand    = (set: string) => set[Math.floor(Math.random() * set.length)];
  const base    = Array.from({ length: 8 }, () => rand(all)).join('');
  // Guarantee at least one of each required char type
  return rand(upper) + rand(lower) + rand(digits) + rand(special) + base;
}

export interface CreateEmployeeInput {
  first_name:  string;
  last_name:   string;
  email:       string;
  job_title?:  string;
  department?: string;
  phone?:      string;
  hospital_id: string;
  role:        AppRole;
  password?:   string; // if omitted, auto-generated
}

export interface CreateEmployeeResult {
  success:   boolean;
  error?:    string;
  data?: {
    user_id:   string;
    email:     string;
    password:  string;   // temp password — show once, never stored
    full_name: string;
  };
}

export async function createEmployee(
  input: CreateEmployeeInput,
): Promise<CreateEmployeeResult> {
  try {
    const supabase      = await createSupabaseServerClient();
    const adminClient   = createSupabaseAdminClient();

    // Auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Unauthorized' };

    const { data: callerRoles } = await adminClient
      .from('user_hospital_roles')
      .select('role')
      .eq('user_id', user.id);

    const hasAccess = callerRoles?.some(r =>
      HR_ACCESS_ROLES.includes(r.role as AppRole)
    );
    if (!hasAccess) return { success: false, error: 'Access denied' };

    // Get caller's org
    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single();

    if (!callerProfile?.org_id) return { success: false, error: 'Organization not found' };

    const password = input.password?.trim() || generatePassword();

    // Create auth user (admin API, bypasses email confirmation)
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email:          input.email.trim().toLowerCase(),
      password,
      email_confirm:  true,
      user_metadata:  { first_name: input.first_name, last_name: input.last_name, org_id: callerProfile.org_id },
      app_metadata:   { org_id: callerProfile.org_id },
    });

    if (authError || !authData.user) {
      return { success: false, error: authError?.message ?? 'Failed to create auth user' };
    }

    const newUserId = authData.user.id;

    // Create profile
    const { error: profileError } = await adminClient.from('profiles').insert({
      id:         newUserId,
      org_id:     callerProfile.org_id,
      first_name: input.first_name.trim(),
      last_name:  input.last_name.trim(),
      email:      input.email.trim().toLowerCase(),
      job_title:  input.job_title?.trim() || null,
      department: input.department?.trim() || null,
      phone:      input.phone?.trim() || null,
      is_active:  true,
    });

    if (profileError) {
      // Rollback auth user
      await adminClient.auth.admin.deleteUser(newUserId);
      return { success: false, error: profileError.message };
    }

    // Assign role
    const { error: roleError } = await adminClient.from('user_hospital_roles').insert({
      user_id:     newUserId,
      hospital_id: input.hospital_id,
      role:        input.role,
      granted_by:  user.id,
    });

    if (roleError) {
      await adminClient.auth.admin.deleteUser(newUserId);
      return { success: false, error: roleError.message };
    }

    // Auto-create onboarding record so employee is gated to onboarding on first login
    try {
      await adminClient.from('onboarding_records').insert({
        org_id:       callerProfile.org_id,
        employee_id:  newUserId,
        hospital_id:  input.hospital_id,
        hr_manager_id: user.id,
        created_by:   user.id,
        start_date:   new Date().toISOString(),
      });
    } catch { /* non-blocking — onboarding can be started manually if insert fails */ }

    revalidatePath('/hr');
    revalidatePath('/admin/users');
    revalidatePath('/onboarding');

    return {
      success: true,
      data: {
        user_id:   newUserId,
        email:     input.email.trim().toLowerCase(),
        password,
        full_name: `${input.first_name} ${input.last_name}`.trim(),
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unexpected error' };
  }
}

// ── Bulk types ────────────────────────────────────────────────────────────────
export interface BulkEmployeeInput {
  first_name:  string;
  last_name:   string;
  email:       string;
  job_title?:  string;
  department?: string;
  phone?:      string;
  hospital_id: string;
  role:        AppRole;
  password:    string;
}

export interface BulkPersonResult {
  index:      number;
  input:      BulkEmployeeInput;
  success:    boolean;
  error?:     string;
  user_id?:   string;
  full_name?: string;
  email_sent?: boolean;
  email_error?: string;
}

// ── Bulk create + email ───────────────────────────────────────────────────────
export async function createEmployees(
  inputs: BulkEmployeeInput[],
  sendEmails: boolean,
): Promise<{ results: BulkPersonResult[]; successCount: number; failCount: number }> {
  const supabase    = await createSupabaseServerClient();
  const adminClient = createSupabaseAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return {
      results: inputs.map((input, index) => ({ index, input, success: false, error: 'Unauthorized' })),
      successCount: 0,
      failCount: inputs.length,
    };
  }

  const { data: callerProfile } = await adminClient
    .from('profiles')
    .select('org_id, first_name, last_name')
    .eq('id', user.id)
    .single();

  if (!callerProfile?.org_id) {
    return {
      results: inputs.map((input, index) => ({ index, input, success: false, error: 'Organization not found' })),
      successCount: 0,
      failCount: inputs.length,
    };
  }

  // Fetch hospital names for email
  const hospitalIds  = [...new Set(inputs.map(i => i.hospital_id))];
  const { data: hospitals } = await adminClient
    .from('hospitals')
    .select('id, name')
    .in('id', hospitalIds);
  const hospitalMap = new Map((hospitals ?? []).map(h => [h.id, h.name]));

  const senderName = [callerProfile.first_name, callerProfile.last_name].filter(Boolean).join(' ') || 'HR';

  const results: BulkPersonResult[] = [];

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    const full_name = `${input.first_name.trim()} ${input.last_name.trim()}`.trim();

    try {
      // Create auth user
      const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
        email:         input.email.trim().toLowerCase(),
        password:      input.password,
        email_confirm: true,
        user_metadata: { first_name: input.first_name, last_name: input.last_name, org_id: callerProfile.org_id },
        app_metadata:  { org_id: callerProfile.org_id },
      });

      if (authError || !authData.user) {
        results.push({ index: i, input, success: false, error: authError?.message ?? 'Failed to create auth user' });
        continue;
      }

      const newUserId = authData.user.id;

      // Create profile
      const { error: profileError } = await adminClient.from('profiles').insert({
        id:         newUserId,
        org_id:     callerProfile.org_id,
        first_name: input.first_name.trim(),
        last_name:  input.last_name.trim(),
        email:      input.email.trim().toLowerCase(),
        job_title:  input.job_title?.trim() || null,
        department: input.department?.trim() || null,
        phone:      input.phone?.trim() || null,
        is_active:  true,
      });

      if (profileError) {
        await adminClient.auth.admin.deleteUser(newUserId);
        results.push({ index: i, input, success: false, error: profileError.message });
        continue;
      }

      // Assign role
      const { error: roleError } = await adminClient.from('user_hospital_roles').insert({
        user_id:     newUserId,
        hospital_id: input.hospital_id,
        role:        input.role,
        granted_by:  user.id,
      });

      if (roleError) {
        await adminClient.auth.admin.deleteUser(newUserId);
        results.push({ index: i, input, success: false, error: roleError.message });
        continue;
      }

      // Auto-start onboarding
      try {
        await adminClient.from('onboarding_records').insert({
          org_id:        callerProfile.org_id,
          employee_id:   newUserId,
          hospital_id:   input.hospital_id,
          hr_manager_id: user.id,
          created_by:    user.id,
          start_date:    new Date().toISOString(),
        });
      } catch { /* non-blocking */ }

      // Send credentials email
      let email_sent   = false;
      let email_error: string | undefined;

      if (sendEmails) {
        const emailRes = await sendCredentialsEmail(input.email.trim().toLowerCase(), {
          fullName:     full_name,
          email:        input.email.trim().toLowerCase(),
          password:     input.password,
          role:         input.role.replace(/_/g, ' '),
          hospitalName: hospitalMap.get(input.hospital_id) ?? 'your hospital',
          senderName,
        });
        email_sent  = emailRes.success;
        email_error = emailRes.error;
      }

      results.push({ index: i, input, success: true, user_id: newUserId, full_name, email_sent, email_error });

    } catch (err) {
      results.push({ index: i, input, success: false, error: err instanceof Error ? err.message : 'Unexpected error' });
    }
  }

  revalidatePath('/hr');
  revalidatePath('/admin/users');
  revalidatePath('/onboarding');

  const successCount = results.filter(r => r.success).length;
  return { results, successCount, failCount: results.length - successCount };
}

export interface EmployeeRow {
  id:          string;
  first_name:  string;
  last_name:   string;
  email:       string;
  job_title:   string | null;
  department:  string | null;
  avatar_url:  string | null;
  is_active:   boolean;
  created_at:  string;
  last_seen_at: string | null;
  roles: { role: AppRole; hospital: { id: string; name: string; color: string | null } | null }[];
}

export async function getEmployees(hospitalId?: string | null): Promise<{
  employees: EmployeeRow[];
  error?: string;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const admin    = createSupabaseAdminClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { employees: [], error: 'Unauthorized' };

    const { data: callerProfile } = await admin
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single();

    if (!callerProfile?.org_id) return { employees: [], error: 'Organization not found' };

    const orgId = callerProfile.org_id;

    const { data: callerRoles } = await admin
      .from('user_hospital_roles')
      .select('role')
      .eq('user_id', user.id);

    const hasAccess = callerRoles?.some(r => HR_ACCESS_ROLES.includes(r.role as AppRole));
    if (!hasAccess) return { employees: [], error: 'Access denied' };

    // Fetch profiles — scoped to org
    let profileQuery = admin
      .from('profiles')
      .select('id, first_name, last_name, email, job_title, department, avatar_url, is_active, created_at, last_seen_at')
      .eq('org_id', orgId)
      .order('first_name');

    if (hospitalId) {
      const { data: hospUsers } = await admin
        .from('user_hospital_roles')
        .select('user_id')
        .eq('hospital_id', hospitalId);
      const ids = (hospUsers ?? []).map(r => r.user_id);
      if (ids.length === 0) return { employees: [] };
      profileQuery = profileQuery.in('id', ids);
    }

    const { data: profiles, error } = await profileQuery;
    if (error) return { employees: [], error: error.message };

    const profileList = profiles ?? [];
    const userIds = profileList.map(p => p.id);

    // Fetch roles separately (no FK join)
    const { data: allRoles } = userIds.length > 0
      ? await admin.from('user_hospital_roles').select('user_id, role, hospital_id').in('user_id', userIds)
      : { data: [] };

    const { data: hospitals } = await admin.from('hospitals').select('id, name, color').eq('org_id', orgId);
    const hospitalMap = new Map((hospitals ?? []).map(h => [h.id, h]));

    const rolesByUser = new Map<string, EmployeeRow['roles']>();
    for (const r of (allRoles ?? [])) {
      if (!rolesByUser.has(r.user_id)) rolesByUser.set(r.user_id, []);
      rolesByUser.get(r.user_id)!.push({ role: r.role as AppRole, hospital: hospitalMap.get(r.hospital_id) ?? null });
    }

    const employees: EmployeeRow[] = profileList.map(p => ({
      ...p,
      roles: rolesByUser.get(p.id) ?? [],
    }));

    return { employees };
  } catch (err) {
    return { employees: [], error: err instanceof Error ? err.message : 'Error' };
  }
}

export async function assignRoleToEmployee(
  targetUserId: string,
  hospitalId:   string,
  role:         AppRole,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient();
    const adminClient = createSupabaseAdminClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Unauthorized' };

    const { data: callerRoles } = await adminClient
      .from('user_hospital_roles')
      .select('role')
      .eq('user_id', user.id);

    const hasAccess = callerRoles?.some(r => HR_ACCESS_ROLES.includes(r.role as AppRole));
    if (!hasAccess) return { success: false, error: 'Access denied' };

    // Upsert — if same user+hospital combo exists, update the role
    const { error } = await adminClient
      .from('user_hospital_roles')
      .upsert({ user_id: targetUserId, hospital_id: hospitalId, role, assigned_by: user.id },
               { onConflict: 'user_id,hospital_id' });

    if (error) return { success: false, error: error.message };

    revalidatePath('/hr');
    revalidatePath('/admin/users');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Error' };
  }
}

export async function toggleEmployeeStatus(
  targetUserId: string,
  isActive:     boolean,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase    = await createSupabaseServerClient();
    const adminClient = createSupabaseAdminClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Unauthorized' };

    const { data: callerRoles } = await adminClient
      .from('user_hospital_roles')
      .select('role')
      .eq('user_id', user.id);

    const hasAccess = callerRoles?.some(r => HR_ACCESS_ROLES.includes(r.role as AppRole));
    if (!hasAccess) return { success: false, error: 'Access denied' };

    const { error } = await adminClient
      .from('profiles')
      .update({ is_active: isActive })
      .eq('id', targetUserId);

    if (error) return { success: false, error: error.message };

    revalidatePath('/hr');
    revalidatePath('/admin/users');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Error' };
  }
}
