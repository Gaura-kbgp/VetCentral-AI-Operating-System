'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import type { AppRole } from '@/types/database';

const ADMIN_ROLES: AppRole[] = ['super_admin', 'org_admin'];

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

export async function getOrgSettings(): Promise<
  { success: boolean; data?: Record<string, Record<string, string>>; error?: string }
> {
  const ctx = await getAdminCtx();
  if (!ctx.ok) return { success: false, error: ctx.error };
  const { adminClient, orgId } = ctx;

  const { data, error } = await adminClient
    .from('org_settings').select('section, key, value').eq('org_id', orgId);
  if (error) return { success: false, error: error.message };

  const out: Record<string, Record<string, string>> = {};
  for (const row of data ?? []) {
    (out[row.section] ??= {})[row.key] = row.value ?? '';
  }
  return { success: true, data: out };
}

export async function upsertOrgSettings(
  section: string,
  settings: Record<string, string>,
): Promise<{ success: boolean; error?: string }> {
  const ctx = await getAdminCtx();
  if (!ctx.ok) return { success: false, error: ctx.error };
  const { adminClient, orgId, user } = ctx;

  if (!section) return { success: false, error: 'Section is required' };

  const now = new Date().toISOString();
  const rows = Object.entries(settings).map(([key, value]) => ({
    org_id:     orgId,
    section,
    key,
    value:      value ?? '',
    updated_by: user.id,
    updated_at: now,
  }));

  if (rows.length === 0) return { success: true };

  const { error } = await adminClient
    .from('org_settings')
    .upsert(rows, { onConflict: 'org_id,section,key' });
  if (error) return { success: false, error: error.message };

  await adminClient.from('audit_logs').insert({
    org_id:        orgId,
    user_id:       user.id,
    action:        'update',
    resource_type: 'setting',
    resource_id:   null,
    old_data:      null,
    new_data:      { section, settings },
  });

  revalidatePath('/admin/settings');
  return { success: true };
}
