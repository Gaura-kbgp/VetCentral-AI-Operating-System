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
  // 'new_onboard' → onboarding record created, user gated to onboarding on first login
  // 'existing'    → skips onboarding entirely
  employee_type?: 'new_onboard' | 'existing';
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

    // Onboarding record only for new hires — existing employees skip onboarding
    if (input.employee_type !== 'existing') {
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
    }

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

// ── New Users (no onboarding record) ────────────────────────────────────────

export interface NewUserRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  job_title: string | null;
  department: string | null;
  avatar_url: string | null;
  created_at: string;
  primary_hospital_id: string | null;
  primary_hospital_name: string | null;
  primary_hospital_color: string | null;
}

export async function getUsersWithoutOnboarding(): Promise<{ users: NewUserRow[]; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient();
    const admin    = createSupabaseAdminClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { users: [], error: 'Unauthorized' };

    const { data: callerProfile } = await admin
      .from('profiles').select('org_id').eq('id', user.id).single();
    if (!callerProfile?.org_id) return { users: [], error: 'Organization not found' };

    const { data: callerRoles } = await admin
      .from('user_hospital_roles').select('role').eq('user_id', user.id);
    if (!callerRoles?.some(r => HR_ACCESS_ROLES.includes(r.role as AppRole)))
      return { users: [], error: 'Access denied' };

    // Employee IDs that already have an onboarding record
    const { data: existing } = await admin
      .from('onboarding_records')
      .select('employee_id')
      .eq('org_id', callerProfile.org_id);
    const onboardedSet = new Set((existing ?? []).map(r => r.employee_id));

    // Only consider users created within the last 30 days — established employees are not "new users"
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    const { data: profiles, error } = await admin
      .from('profiles')
      .select('id, first_name, last_name, email, job_title, department, avatar_url, created_at')
      .eq('org_id', callerProfile.org_id)
      .gte('created_at', cutoff.toISOString())
      .order('created_at', { ascending: false });
    if (error) return { users: [], error: error.message };

    const pending = (profiles ?? []).filter(p => !onboardedSet.has(p.id));
    if (pending.length === 0) return { users: [] };

    const pendingIds = pending.map(p => p.id);
    const { data: roles } = await admin
      .from('user_hospital_roles').select('user_id, hospital_id').in('user_id', pendingIds);

    const hospIds = [...new Set((roles ?? []).map(r => r.hospital_id))];
    const { data: hospList } = hospIds.length > 0
      ? await admin.from('hospitals').select('id, name, color').in('id', hospIds)
      : { data: [] };
    const hospMap = new Map((hospList ?? []).map(h => [h.id, h]));

    const primaryHospByUser = new Map<string, string>();
    for (const r of (roles ?? [])) {
      if (!primaryHospByUser.has(r.user_id)) primaryHospByUser.set(r.user_id, r.hospital_id);
    }

    const users: NewUserRow[] = pending.map(p => {
      const hid  = primaryHospByUser.get(p.id) ?? null;
      const hosp = hid ? hospMap.get(hid) : null;
      return {
        ...p,
        primary_hospital_id:    hid,
        primary_hospital_name:  hosp?.name  ?? null,
        primary_hospital_color: hosp?.color ?? null,
      };
    });

    return { users };
  } catch (err) {
    return { users: [], error: err instanceof Error ? err.message : 'Error' };
  }
}

export async function sendUsersToOnboarding(
  userIds: string[],
): Promise<{ success: boolean; created: number; error?: string }> {
  try {
    const supabase = await createSupabaseServerClient();
    const admin    = createSupabaseAdminClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, created: 0, error: 'Unauthorized' };

    const { data: callerRoles } = await admin
      .from('user_hospital_roles').select('role').eq('user_id', user.id);
    if (!callerRoles?.some(r => HR_ACCESS_ROLES.includes(r.role as AppRole)))
      return { success: false, created: 0, error: 'Access denied' };

    const { data: callerProfile } = await admin
      .from('profiles').select('org_id').eq('id', user.id).single();
    if (!callerProfile?.org_id) return { success: false, created: 0, error: 'Organization not found' };

    const { data: roles } = await admin
      .from('user_hospital_roles').select('user_id, hospital_id').in('user_id', userIds);
    const hospByUser = new Map<string, string>();
    for (const r of (roles ?? [])) {
      if (!hospByUser.has(r.user_id)) hospByUser.set(r.user_id, r.hospital_id);
    }

    const records = userIds.map(uid => ({
      org_id:        callerProfile.org_id,
      employee_id:   uid,
      hospital_id:   hospByUser.get(uid) ?? null,
      hr_manager_id: user.id,
      created_by:    user.id,
      start_date:    new Date().toISOString(),
    }));

    const { error } = await admin.from('onboarding_records').insert(records);
    if (error) return { success: false, created: 0, error: error.message };

    revalidatePath('/hr');
    revalidatePath('/admin/users');
    revalidatePath('/onboarding');
    return { success: true, created: records.length };
  } catch (err) {
    return { success: false, created: 0, error: err instanceof Error ? err.message : 'Error' };
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

// ── Employees currently in onboarding process ─────────────────────────────────

export type OnboardingStatus = 'active' | 'on_hold' | 'completed' | 'cancelled';

export interface OnboardingEmployeeRow extends EmployeeRow {
  onboarding_id:         string;
  onboarding_status:     OnboardingStatus;
  onboarding_started_at: string;
}

export async function getEmployeesInOnboarding(): Promise<{
  employees: OnboardingEmployeeRow[];
  error?: string;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const admin    = createSupabaseAdminClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { employees: [], error: 'Unauthorized' };

    const { data: callerProfile } = await admin
      .from('profiles').select('org_id').eq('id', user.id).single();
    if (!callerProfile?.org_id) return { employees: [], error: 'Organization not found' };

    const orgId = callerProfile.org_id;

    const { data: callerRoles } = await admin
      .from('user_hospital_roles').select('role').eq('user_id', user.id);
    if (!callerRoles?.some(r => HR_ACCESS_ROLES.includes(r.role as AppRole)))
      return { employees: [], error: 'Access denied' };

    // Fetch onboarding records with active status (not completed/cancelled)
    const { data: records, error: recErr } = await admin
      .from('onboarding_records')
      .select('id, employee_id, status, created_at')
      .eq('org_id', orgId)
      .in('status', ['active', 'on_hold'])
      .order('created_at', { ascending: false });

    if (recErr) return { employees: [], error: recErr.message };
    if (!records || records.length === 0) return { employees: [] };

    const employeeIds = records.map(r => r.employee_id as string);

    const [profilesRes, rolesRes, hospitalsRes] = await Promise.all([
      admin
        .from('profiles')
        .select('id, first_name, last_name, email, job_title, department, avatar_url, is_active, created_at, last_seen_at')
        .in('id', employeeIds),
      admin
        .from('user_hospital_roles').select('user_id, role, hospital_id').in('user_id', employeeIds),
      admin
        .from('hospitals').select('id, name, color').eq('org_id', orgId),
    ]);

    const profileMap  = new Map((profilesRes.data ?? []).map(p => [p.id, p]));
    const hospitalMap = new Map((hospitalsRes.data ?? []).map(h => [h.id, h]));
    const rolesByUser = new Map<string, EmployeeRow['roles']>();
    for (const r of (rolesRes.data ?? [])) {
      if (!rolesByUser.has(r.user_id)) rolesByUser.set(r.user_id, []);
      rolesByUser.get(r.user_id)!.push({ role: r.role as AppRole, hospital: hospitalMap.get(r.hospital_id) ?? null });
    }

    const employees: OnboardingEmployeeRow[] = records
      .map(rec => {
        const profile = profileMap.get(rec.employee_id as string);
        if (!profile) return null;
        return {
          ...profile,
          roles:                 rolesByUser.get(profile.id) ?? [],
          onboarding_id:         rec.id as string,
          onboarding_status:     rec.status as OnboardingStatus,
          onboarding_started_at: rec.created_at as string,
        };
      })
      .filter((e): e is OnboardingEmployeeRow => e !== null);

    return { employees };
  } catch (err) {
    return { employees: [], error: err instanceof Error ? err.message : 'Error' };
  }
}

// ── Real Attendance ───────────────────────────────────────────────────────────

export type AttendanceStatus = 'present' | 'late' | 'absent' | 'on_leave' | 'remote';

export interface AttendanceEmployeeWithStatus {
  id: string;
  name: string;
  role: string;
  department: string | null;
  avatar_url: string | null;
  hospital_id: string;
  hospital_name: string;
  hospital_color: string | null;
  attendance_id: string | null;
  status: AttendanceStatus;
  check_in_time: string | null;
  check_out_time: string | null;
  notes: string | null;
}

const MOCK_STATUSES: AttendanceStatus[] = [
  'present','present','present','late','present','remote','absent','on_leave','present','present',
];

function mockCheckIn(status: AttendanceStatus, idx: number): string | null {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  if (status === 'present') return new Date(base.getTime() + (8 * 60 + 15 + idx % 45) * 60000).toISOString();
  if (status === 'late')    return new Date(base.getTime() + (9 * 60 + 10 + idx % 45) * 60000).toISOString();
  if (status === 'remote')  return new Date(base.getTime() + (8 * 60 + 30 + idx % 20) * 60000).toISOString();
  return null;
}

export async function getAttendanceForToday(forDate?: string): Promise<{
  employees: AttendanceEmployeeWithStatus[];
  hospitals: Array<{ id: string; name: string; color: string | null }>;
  date: string;
  hasRealData: boolean;
  error?: string;
}> {
  const admin = createSupabaseAdminClient();
  const today = forDate ?? new Date().toISOString().split('T')[0];

  try {
    // user_hospital_roles has granted_at (not created_at) — no ordering needed
    const [hospRes, rolesRes] = await Promise.all([
      admin.from('hospitals').select('id,name,color').order('name'),
      admin.from('user_hospital_roles').select('user_id, role, hospital_id'),
    ]);

    const profileIds = [...new Set((rolesRes.data ?? []).map((r: { user_id: string }) => r.user_id))];

    const profilesRes = profileIds.length > 0
      ? await admin.from('profiles')
          .select('id, first_name, last_name, department, avatar_url, is_active')
          .in('id', profileIds)
          .neq('is_active', false)   // include NULL and true, exclude explicit false
      : { data: [] as { id: string; first_name: string | null; last_name: string | null; department: string | null; avatar_url: string | null; is_active: boolean | null }[] };

    // Attendance query — graceful fallback: Supabase returns error object (not throw) if table missing
    const { data: attData } = await admin
      .from('attendance_records')
      .select('id, employee_id, status, check_in_time, check_out_time, notes')
      .eq('date', today);

    const hasRealData = (attData ?? []).length > 0;
    const hospitals   = (hospRes.data ?? []).map(h => ({ id: h.id, name: h.name, color: h.color ?? null }));
    const hospitalMap = new Map(hospitals.map(h => [h.id, h]));
    const profileSet  = new Set((profilesRes.data ?? []).map(p => p.id));
    const profileMap  = new Map((profilesRes.data ?? []).map(p => [p.id, p]));
    const attMap      = new Map((attData ?? []).map(a => [a.employee_id as string, a]));

    const seen = new Set<string>();
    const employees: AttendanceEmployeeWithStatus[] = [];
    let mockIdx = 0;

    for (const r of (rolesRes.data ?? [])) {
      if (seen.has(r.user_id) || !profileSet.has(r.user_id)) continue;
      seen.add(r.user_id);
      const profile = profileMap.get(r.user_id);
      const hosp    = hospitalMap.get(r.hospital_id);
      if (!profile || !hosp) continue;

      const att    = attMap.get(r.user_id);
      const status: AttendanceStatus = att
        ? (att.status as AttendanceStatus)
        : hasRealData
          ? 'absent'
          : MOCK_STATUSES[mockIdx % MOCK_STATUSES.length];

      const check_in_time  = att ? (att.check_in_time as string | null)  : (!hasRealData ? mockCheckIn(status, mockIdx) : null);
      const check_out_time = att ? (att.check_out_time as string | null) : null;

      employees.push({
        id:             r.user_id,
        name:           [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Unknown',
        role:           r.role ?? 'staff',
        department:     profile.department ?? null,
        avatar_url:     profile.avatar_url ?? null,
        hospital_id:    r.hospital_id,
        hospital_name:  hosp.name,
        hospital_color: hosp.color ?? null,
        attendance_id:  att ? (att.id as string) : null,
        status,
        check_in_time,
        check_out_time,
        notes:          att ? ((att as { notes?: string | null }).notes ?? null) : null,
      });
      mockIdx++;
    }

    return { employees, hospitals, date: today, hasRealData };
  } catch (err) {
    return { employees: [], hospitals: [], date: today, hasRealData: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function upsertAttendanceRecord(
  employeeId: string,
  status: AttendanceStatus,
  checkInTime?: string | null,
): Promise<{ success: boolean; error?: string }> {
  const admin = createSupabaseAdminClient();
  const today = new Date().toISOString().split('T')[0];
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Unauthorized' };

    const { data: callerProfile } = await admin
      .from('profiles').select('org_id').eq('id', user.id).single();
    if (!callerProfile?.org_id) return { success: false, error: 'Organization not found' };

    const { data: hospRole } = await admin
      .from('user_hospital_roles').select('hospital_id').eq('user_id', employeeId).limit(1).single();

    const { error } = await admin.from('attendance_records').upsert({
      org_id:        callerProfile.org_id,
      employee_id:   employeeId,
      hospital_id:   hospRole?.hospital_id ?? null,
      date:          today,
      status,
      check_in_time: checkInTime ?? (status === 'present' ? new Date().toISOString() : null),
      recorded_by:   user.id,
      updated_at:    new Date().toISOString(),
    }, { onConflict: 'employee_id,date' });

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Error' };
  }
}

// ── Full attendance record update (status + times + notes + any date) ─────────

export async function updateAttendanceRecord(input: {
  employeeId: string;
  date: string;
  status: AttendanceStatus;
  checkInTime: string | null;
  checkOutTime: string | null;
  notes: string | null;
}): Promise<{ success: boolean; error?: string }> {
  const admin = createSupabaseAdminClient();
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Unauthorized' };

    const { data: callerProfile } = await admin.from('profiles').select('org_id').eq('id', user.id).single();
    if (!callerProfile?.org_id) return { success: false, error: 'Organization not found' };

    const { data: hospRole } = await admin.from('user_hospital_roles').select('hospital_id').eq('user_id', input.employeeId).limit(1).single();

    const { error } = await admin.from('attendance_records').upsert({
      org_id:         callerProfile.org_id,
      employee_id:    input.employeeId,
      hospital_id:    hospRole?.hospital_id ?? null,
      date:           input.date,
      status:         input.status,
      check_in_time:  input.checkInTime,
      check_out_time: input.checkOutTime,
      notes:          input.notes,
      recorded_by:    user.id,
      updated_at:     new Date().toISOString(),
    }, { onConflict: 'employee_id,date' });

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Error' };
  }
}

// ── Monthly attendance summary for one employee ────────────────────────────────

export interface MonthlyAttendanceSummary {
  employeeId: string;
  employeeName: string;
  role: string;
  hospitalName: string;
  hospitalColor: string | null;
  presentDays: number;
  lateDays: number;
  absentDays: number;
  leaveDays: number;
  remoteDays: number;
  totalDays: number;
  attendanceRate: number;
  records: Array<{ date: string; status: AttendanceStatus; check_in_time: string | null; check_out_time: string | null; notes: string | null }>;
}

export async function getMonthlyAttendance(year: number, month: number): Promise<{
  summaries: MonthlyAttendanceSummary[];
  hospitals: Array<{ id: string; name: string; color: string | null }>;
  error?: string;
}> {
  const admin = createSupabaseAdminClient();
  try {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate   = new Date(year, month, 0).toISOString().split('T')[0]; // last day of month

    const [hospRes, rolesRes] = await Promise.all([
      admin.from('hospitals').select('id,name,color').order('name'),
      admin.from('user_hospital_roles').select('user_id, role, hospital_id'),
    ]);

    const profileIds = [...new Set((rolesRes.data ?? []).map((r: { user_id: string }) => r.user_id))];
    const profilesRes = profileIds.length > 0
      ? await admin.from('profiles').select('id, first_name, last_name, is_active').in('id', profileIds).neq('is_active', false)
      : { data: [] as { id: string; first_name: string | null; last_name: string | null; is_active: boolean | null }[] };

    const { data: attData } = await admin
      .from('attendance_records')
      .select('employee_id, date, status, check_in_time, check_out_time, notes')
      .gte('date', startDate)
      .lte('date', endDate);

    const hospitals  = (hospRes.data ?? []).map(h => ({ id: h.id, name: h.name, color: h.color ?? null }));
    const hospMap    = new Map(hospitals.map(h => [h.id, h]));
    const profileMap = new Map((profilesRes.data ?? []).map(p => [p.id, p]));

    // Group records by employee
    const recsByEmp = new Map<string, typeof attData>();
    for (const rec of (attData ?? [])) {
      if (!recsByEmp.has(rec.employee_id)) recsByEmp.set(rec.employee_id, []);
      recsByEmp.get(rec.employee_id)!.push(rec);
    }

    const seen = new Set<string>();
    const summaries: MonthlyAttendanceSummary[] = [];
    for (const r of (rolesRes.data ?? [])) {
      if (seen.has(r.user_id) || !profileMap.has(r.user_id)) continue;
      seen.add(r.user_id);
      const profile = profileMap.get(r.user_id)!;
      const hosp    = hospMap.get(r.hospital_id);
      if (!hosp) continue;
      const records = (recsByEmp.get(r.user_id) ?? []).map(rec => ({
        date:           rec.date as string,
        status:         rec.status as AttendanceStatus,
        check_in_time:  rec.check_in_time as string | null,
        check_out_time: rec.check_out_time as string | null,
        notes:          (rec as { notes?: string | null }).notes ?? null,
      }));
      const counts = { present: 0, late: 0, absent: 0, on_leave: 0, remote: 0 };
      for (const rec of records) counts[rec.status] = (counts[rec.status] ?? 0) + 1;
      const totalDays = records.length;
      summaries.push({
        employeeId:     r.user_id,
        employeeName:   [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Unknown',
        role:           r.role ?? 'staff',
        hospitalName:   hosp.name,
        hospitalColor:  hosp.color ?? null,
        presentDays:    counts.present,
        lateDays:       counts.late,
        absentDays:     counts.absent,
        leaveDays:      counts.on_leave,
        remoteDays:     counts.remote,
        totalDays,
        attendanceRate: totalDays > 0 ? Math.round(((counts.present + counts.late + counts.remote) / totalDays) * 100) : 0,
        records,
      });
    }

    return { summaries, hospitals };
  } catch (err) {
    return { summaries: [], hospitals: [], error: err instanceof Error ? err.message : 'Error' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy: Get employees with hospital info for Attendance section (kept for compat)
// ─────────────────────────────────────────────────────────────────────────────

export interface AttendanceEmployee {
  id: string;
  name: string;
  role: string;
  department: string | null;
  avatar_url: string | null;
  hospital_id: string;
  hospital_name: string;
  hospital_color: string | null;
}

export async function getEmployeesForAttendance(): Promise<{ employees: AttendanceEmployee[]; hospitals: Array<{ id: string; name: string; color: string | null }>; error?: string }> {
  const admin = createSupabaseAdminClient();
  try {
    const [hospRes, rolesRes] = await Promise.all([
      admin.from('hospitals').select('id,name,color').order('name'),
      admin.from('user_hospital_roles')
        .select('user_id, role, hospital_id, profiles!inner(first_name, last_name, department, avatar_url), hospitals!inner(id, name, color)')
        .order('hospital_id'),
    ]);

    const hospitals = (hospRes.data ?? []).map(h => ({ id: h.id, name: h.name, color: h.color ?? null }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const employees: AttendanceEmployee[] = (rolesRes.data ?? []).map((r: any) => ({
      id:             r.user_id,
      name:           [r.profiles?.first_name, r.profiles?.last_name].filter(Boolean).join(' ') || 'Unknown',
      role:           r.role ?? 'staff',
      department:     r.profiles?.department ?? null,
      avatar_url:     r.profiles?.avatar_url ?? null,
      hospital_id:    r.hospital_id,
      hospital_name:  r.hospitals?.name ?? '—',
      hospital_color: r.hospitals?.color ?? null,
    }));

    // Deduplicate by user_id (take first role per user)
    const seen = new Set<string>();
    const unique = employees.filter(e => { if (seen.has(e.id)) return false; seen.add(e.id); return true; });

    return { employees: unique, hospitals };
  } catch (err) {
    return { employees: [], hospitals: [], error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
