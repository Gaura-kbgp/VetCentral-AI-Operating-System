'use server';

import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import { hasPermission, ALL_ROLES, type Permission } from '@/lib/permissions';
import type { AppRole } from '@/types/database';
import type { ActionResult } from '@/types/app';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface RoleAssignment {
  id: string;
  user_id: string;
  role: AppRole;
  scope: 'org' | 'hospital';
  hospital_id?: string | null;
  hospital_name?: string | null;
  hospital_color?: string | null;
  granted_by?: string | null;
  granted_at: string;
  expires_at?: string | null;
  is_active: boolean;
  notes?: string | null;
}

export interface UserWithRoles {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  avatar_url?: string | null;
  job_title?: string | null;
  is_active: boolean;
  roles: RoleAssignment[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth context helper
// ─────────────────────────────────────────────────────────────────────────────

async function getActorCtx() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createSupabaseAdminClient();
  const { data: roles } = await admin
    .from('user_hospital_roles')
    .select('role')
    .eq('user_id', user.id);

  const orgRoles = await admin
    .from('org_user_roles')
    .select('role')
    .eq('user_id', user.id);

  const allRoles = [
    ...(roles ?? []).map(r => r.role),
    ...(orgRoles.data ?? []).map(r => r.role),
  ] as AppRole[];

  const PRIORITY: AppRole[] = [
    'super_admin', 'org_admin', 'hospital_admin', 'practice_manager',
    'it_admin', 'doctor', 'hr', 'marketing', 'csr', 'va', 'viewer',
  ];
  const highestRole = PRIORITY.find(r => allRoles.includes(r)) ?? null;

  const { data: profile } = await admin
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single();

  return { userId: user.id, orgId: profile?.org_id ?? null, highestRole };
}

async function writeAuditLog(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  orgId: string,
  actorId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  oldData?: Record<string, unknown>,
  newData?: Record<string, unknown>,
  metadata?: Record<string, unknown>,
) {
  await admin.from('audit_logs').insert({
    org_id: orgId,
    user_id: actorId,
    action,
    resource_type: resourceType,
    resource_id: resourceId,
    old_data: oldData ?? null,
    new_data: newData ?? null,
    severity: 'warning',
    metadata: metadata ?? {},
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Assign role (hospital-scoped)
// ─────────────────────────────────────────────────────────────────────────────

export async function assignHospitalRole(input: {
  userId: string;
  hospitalId: string;
  role: AppRole;
  notes?: string;
  expiresAt?: string;
}): Promise<ActionResult<void>> {
  const ctx = await getActorCtx();
  if (!ctx || !ctx.orgId) return { success: false, error: 'Unauthorized' };
  if (!hasPermission(ctx.highestRole, 'users:assign_role')) {
    return { success: false, error: 'You do not have permission to assign roles' };
  }

  const admin = createSupabaseAdminClient();

  // Upsert — one role per user per hospital
  const { error } = await admin
    .from('user_hospital_roles')
    .upsert({
      user_id:    input.userId,
      hospital_id: input.hospitalId,
      role:       input.role,
      granted_by: ctx.userId,
      granted_at: new Date().toISOString(),
      is_active:  true,
      notes:      input.notes ?? null,
      expires_at: input.expiresAt ?? null,
    }, { onConflict: 'user_id,hospital_id' });

  if (error) return { success: false, error: error.message };

  // Audit (trigger also logs, this adds app context)
  await writeAuditLog(
    admin, ctx.orgId, ctx.userId,
    'role_assigned', 'user_hospital_roles', input.userId,
    undefined,
    { role: input.role, hospital_id: input.hospitalId, scope: 'hospital' },
    { source: 'admin_ui' },
  );

  return { success: true, data: undefined };
}

// ─────────────────────────────────────────────────────────────────────────────
// Assign role (org-scoped — super_admin, org_admin)
// ─────────────────────────────────────────────────────────────────────────────

export async function assignOrgRole(input: {
  userId: string;
  role: AppRole;
  notes?: string;
  expiresAt?: string;
}): Promise<ActionResult<void>> {
  const ctx = await getActorCtx();
  if (!ctx || !ctx.orgId) return { success: false, error: 'Unauthorized' };
  if (ctx.highestRole !== 'super_admin' && ctx.highestRole !== 'org_admin') {
    return { success: false, error: 'Only org admins can assign org-level roles' };
  }

  const admin = createSupabaseAdminClient();

  const { error } = await admin
    .from('org_user_roles')
    .upsert({
      user_id:    input.userId,
      org_id:     ctx.orgId,
      role:       input.role,
      granted_by: ctx.userId,
      granted_at: new Date().toISOString(),
      is_active:  true,
      notes:      input.notes ?? null,
      expires_at: input.expiresAt ?? null,
    }, { onConflict: 'user_id,org_id' });

  if (error) return { success: false, error: error.message };

  await writeAuditLog(
    admin, ctx.orgId, ctx.userId,
    'role_assigned', 'org_user_roles', input.userId,
    undefined,
    { role: input.role, scope: 'org' },
    { source: 'admin_ui' },
  );

  return { success: true, data: undefined };
}

// ─────────────────────────────────────────────────────────────────────────────
// Revoke role
// ─────────────────────────────────────────────────────────────────────────────

export async function revokeHospitalRole(
  userId: string,
  hospitalId: string,
): Promise<ActionResult<void>> {
  const ctx = await getActorCtx();
  if (!ctx || !ctx.orgId) return { success: false, error: 'Unauthorized' };
  if (!hasPermission(ctx.highestRole, 'users:assign_role')) {
    return { success: false, error: 'You do not have permission to revoke roles' };
  }

  // Guard: cannot revoke own super_admin
  if (userId === ctx.userId && ctx.highestRole === 'super_admin') {
    return { success: false, error: 'Cannot revoke your own super_admin role' };
  }

  const admin = createSupabaseAdminClient();

  const { data: existing } = await admin
    .from('user_hospital_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('hospital_id', hospitalId)
    .single();

  const { error } = await admin
    .from('user_hospital_roles')
    .delete()
    .eq('user_id', userId)
    .eq('hospital_id', hospitalId);

  if (error) return { success: false, error: error.message };

  await writeAuditLog(
    admin, ctx.orgId, ctx.userId,
    'role_revoked', 'user_hospital_roles', userId,
    { role: existing?.role, hospital_id: hospitalId },
    undefined,
    { source: 'admin_ui' },
  );

  return { success: true, data: undefined };
}

export async function revokeOrgRole(userId: string): Promise<ActionResult<void>> {
  const ctx = await getActorCtx();
  if (!ctx || !ctx.orgId) return { success: false, error: 'Unauthorized' };
  if (ctx.highestRole !== 'super_admin') {
    return { success: false, error: 'Only super admins can revoke org-level roles' };
  }
  if (userId === ctx.userId) {
    return { success: false, error: 'Cannot revoke your own org-level role' };
  }

  const admin = createSupabaseAdminClient();

  const { data: existing } = await admin
    .from('org_user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('org_id', ctx.orgId)
    .single();

  const { error } = await admin
    .from('org_user_roles')
    .delete()
    .eq('user_id', userId)
    .eq('org_id', ctx.orgId);

  if (error) return { success: false, error: error.message };

  await writeAuditLog(
    admin, ctx.orgId, ctx.userId,
    'role_revoked', 'org_user_roles', userId,
    { role: existing?.role, scope: 'org' },
    undefined,
    { source: 'admin_ui' },
  );

  return { success: true, data: undefined };
}

// ─────────────────────────────────────────────────────────────────────────────
// Get all role assignments for the org
// ─────────────────────────────────────────────────────────────────────────────

export async function getOrgRoleAssignments(): Promise<ActionResult<RoleAssignment[]>> {
  const ctx = await getActorCtx();
  if (!ctx || !ctx.orgId) return { success: false, error: 'Unauthorized' };
  if (!hasPermission(ctx.highestRole, 'roles:view')) {
    return { success: false, error: 'Insufficient permissions' };
  }

  const admin = createSupabaseAdminClient();

  const [hospRoles, orgRoles] = await Promise.all([
    admin
      .from('user_hospital_roles')
      .select(`
        id, user_id, role, hospital_id, granted_by, granted_at, expires_at, is_active, notes,
        hospital:hospital_id(id, name, color)
      `)
      .order('granted_at', { ascending: false }),
    admin
      .from('org_user_roles')
      .select('id, user_id, role, org_id, granted_by, granted_at, expires_at, is_active, notes')
      .eq('org_id', ctx.orgId)
      .order('granted_at', { ascending: false }),
  ]);

  const result: RoleAssignment[] = [
    ...(hospRoles.data ?? []).map(r => ({
      id:            r.id,
      user_id:       r.user_id,
      role:          r.role as AppRole,
      scope:         'hospital' as const,
      hospital_id:   r.hospital_id,
      hospital_name: Array.isArray(r.hospital) ? (r.hospital[0] as { name: string } | null)?.name : (r.hospital as { name: string } | null)?.name,
      hospital_color: Array.isArray(r.hospital) ? (r.hospital[0] as { color: string } | null)?.color : (r.hospital as { color: string } | null)?.color,
      granted_by:    r.granted_by,
      granted_at:    r.granted_at,
      expires_at:    r.expires_at,
      is_active:     r.is_active,
      notes:         r.notes,
    })),
    ...(orgRoles.data ?? []).map(r => ({
      id:         r.id,
      user_id:    r.user_id,
      role:       r.role as AppRole,
      scope:      'org' as const,
      granted_by: r.granted_by,
      granted_at: r.granted_at,
      expires_at: r.expires_at,
      is_active:  r.is_active,
      notes:      r.notes,
    })),
  ];

  return { success: true, data: result };
}

// ─────────────────────────────────────────────────────────────────────────────
// Get roles for a specific user
// ─────────────────────────────────────────────────────────────────────────────

export async function getUserRoleAssignments(userId: string): Promise<ActionResult<RoleAssignment[]>> {
  const ctx = await getActorCtx();
  if (!ctx) return { success: false, error: 'Unauthorized' };

  // Users can always read their own roles; admins can read anyone's
  if (userId !== ctx.userId && !hasPermission(ctx.highestRole, 'users:view')) {
    return { success: false, error: 'Insufficient permissions' };
  }

  const admin = createSupabaseAdminClient();

  const [hospRoles, orgRoles] = await Promise.all([
    admin
      .from('user_hospital_roles')
      .select(`
        id, user_id, role, hospital_id, granted_by, granted_at, expires_at, is_active, notes,
        hospital:hospital_id(id, name, color)
      `)
      .eq('user_id', userId),
    admin
      .from('org_user_roles')
      .select('id, user_id, role, org_id, granted_by, granted_at, expires_at, is_active, notes')
      .eq('user_id', userId),
  ]);

  const result: RoleAssignment[] = [
    ...(hospRoles.data ?? []).map(r => ({
      id:            r.id,
      user_id:       r.user_id,
      role:          r.role as AppRole,
      scope:         'hospital' as const,
      hospital_id:   r.hospital_id,
      hospital_name: Array.isArray(r.hospital) ? (r.hospital[0] as { name: string } | null)?.name : (r.hospital as { name: string } | null)?.name,
      hospital_color: Array.isArray(r.hospital) ? (r.hospital[0] as { color: string } | null)?.color : (r.hospital as { color: string } | null)?.color,
      granted_by:    r.granted_by,
      granted_at:    r.granted_at,
      expires_at:    r.expires_at,
      is_active:     r.is_active,
      notes:         r.notes,
    })),
    ...(orgRoles.data ?? []).map(r => ({
      id:         r.id,
      user_id:    r.user_id,
      role:       r.role as AppRole,
      scope:      'org' as const,
      granted_by: r.granted_by,
      granted_at: r.granted_at,
      expires_at: r.expires_at,
      is_active:  r.is_active,
      notes:      r.notes,
    })),
  ];

  return { success: true, data: result };
}

// ─────────────────────────────────────────────────────────────────────────────
// Deactivate / reactivate role (soft disable without delete)
// ─────────────────────────────────────────────────────────────────────────────

export async function setRoleActive(
  assignmentId: string,
  scope: 'hospital' | 'org',
  isActive: boolean,
): Promise<ActionResult<void>> {
  const ctx = await getActorCtx();
  if (!ctx || !ctx.orgId) return { success: false, error: 'Unauthorized' };
  if (!hasPermission(ctx.highestRole, 'users:assign_role')) {
    return { success: false, error: 'Insufficient permissions' };
  }

  const admin = createSupabaseAdminClient();
  const table = scope === 'org' ? 'org_user_roles' : 'user_hospital_roles';

  const { error } = await admin
    .from(table)
    .update({ is_active: isActive })
    .eq('id', assignmentId);

  if (error) return { success: false, error: error.message };

  await writeAuditLog(
    admin, ctx.orgId, ctx.userId,
    isActive ? 'role_activated' : 'role_deactivated',
    table, assignmentId,
    { is_active: !isActive }, { is_active: isActive },
    { source: 'admin_ui' },
  );

  return { success: true, data: undefined };
}

// ─────────────────────────────────────────────────────────────────────────────
// Get audit log entries for RBAC events
// ─────────────────────────────────────────────────────────────────────────────

export async function getRoleAuditLogs(limit = 100): Promise<ActionResult<unknown[]>> {
  const ctx = await getActorCtx();
  if (!ctx || !ctx.orgId) return { success: false, error: 'Unauthorized' };
  if (!hasPermission(ctx.highestRole, 'audit_logs:view')) {
    return { success: false, error: 'Insufficient permissions' };
  }

  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from('audit_logs')
    .select(`
      id, action, resource_type, resource_id,
      old_data, new_data, metadata, severity, created_at,
      actor:user_id(id, first_name, last_name, avatar_url, email)
    `)
    .eq('org_id', ctx.orgId)
    .in('action', ['role_granted', 'role_revoked', 'role_changed', 'role_assigned',
                   'role_activated', 'role_deactivated'])
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return { success: false, error: error.message };
  return { success: true, data: data ?? [] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Check if current user can perform a permission
// ─────────────────────────────────────────────────────────────────────────────

export async function checkPermission(permission: Permission): Promise<ActionResult<boolean>> {
  const ctx = await getActorCtx();
  if (!ctx) return { success: true, data: false };
  return { success: true, data: hasPermission(ctx.highestRole, permission) };
}
