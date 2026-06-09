'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import type { AppRole } from '@/types/database';

const ADMIN_ROLES: AppRole[] = ['super_admin', 'org_admin', 'hospital_admin'];

export type HospitalInput = {
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  timezone?: string;
  color?: string;
  description?: string | null;
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

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || `hospital-${Date.now()}`;
}

export async function createHospital(input: HospitalInput): Promise<ActionResult> {
  const ctx = await getAdminCtx();
  if (!ctx.ok) return { success: false, error: ctx.error };
  const { adminClient, orgId, user } = ctx;

  const name = input.name?.trim();
  if (!name) return { success: false, error: 'Name is required' };

  // Ensure unique slug within org
  let slug = slugify(name);
  const { data: existing } = await adminClient
    .from('hospitals').select('slug').eq('org_id', orgId).eq('slug', slug).maybeSingle();
  if (existing) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

  const { data, error } = await adminClient
    .from('hospitals')
    .insert({
      org_id:      orgId,
      name,
      slug,
      address:     input.address?.trim()     || null,
      phone:       input.phone?.trim()        || null,
      email:       input.email?.trim()        || null,
      website:     input.website?.trim()      || null,
      timezone:    input.timezone             || 'America/New_York',
      color:       input.color                || '#2563EB',
      description: input.description?.trim()  || null,
      is_active:   true,
    })
    .select('*')
    .single();

  if (error) return { success: false, error: error.message };

  await adminClient.from('audit_logs').insert({
    org_id:        orgId,
    hospital_id:   data.id,
    user_id:       user.id,
    action:        'create',
    resource_type: 'hospital',
    resource_id:   data.id,
    old_data:      null,
    new_data:      data,
  });

  revalidatePath('/admin/hospitals');
  return { success: true, data };
}

export async function updateHospital(id: string, input: HospitalInput): Promise<ActionResult> {
  const ctx = await getAdminCtx();
  if (!ctx.ok) return { success: false, error: ctx.error };
  const { adminClient, orgId, user } = ctx;

  const name = input.name?.trim();
  if (!name) return { success: false, error: 'Name is required' };

  const { data: oldData } = await adminClient
    .from('hospitals').select('*').eq('id', id).eq('org_id', orgId).single();
  if (!oldData) return { success: false, error: 'Hospital not found' };

  const { data, error } = await adminClient
    .from('hospitals')
    .update({
      name,
      address:     input.address?.trim()    || null,
      phone:       input.phone?.trim()       || null,
      email:       input.email?.trim()       || null,
      website:     input.website?.trim()     || null,
      timezone:    input.timezone            || oldData.timezone,
      color:       input.color               || oldData.color,
      description: input.description?.trim() || null,
      updated_at:  new Date().toISOString(),
    })
    .eq('id', id)
    .eq('org_id', orgId)
    .select('*')
    .single();

  if (error) return { success: false, error: error.message };

  await adminClient.from('audit_logs').insert({
    org_id:        orgId,
    hospital_id:   id,
    user_id:       user.id,
    action:        'update',
    resource_type: 'hospital',
    resource_id:   id,
    old_data:      oldData,
    new_data:      data,
  });

  revalidatePath('/admin/hospitals');
  return { success: true, data };
}

export async function toggleHospitalStatus(id: string, isActive: boolean): Promise<ActionResult> {
  const ctx = await getAdminCtx();
  if (!ctx.ok) return { success: false, error: ctx.error };
  const { adminClient, orgId, user } = ctx;

  const { data: oldData } = await adminClient
    .from('hospitals').select('*').eq('id', id).eq('org_id', orgId).single();
  if (!oldData) return { success: false, error: 'Hospital not found' };

  const { data, error } = await adminClient
    .from('hospitals')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', orgId)
    .select('*')
    .single();

  if (error) return { success: false, error: error.message };

  await adminClient.from('audit_logs').insert({
    org_id:        orgId,
    hospital_id:   id,
    user_id:       user.id,
    action:        isActive ? 'activate' : 'deactivate',
    resource_type: 'hospital',
    resource_id:   id,
    old_data:      oldData,
    new_data:      data,
  });

  revalidatePath('/admin/hospitals');
  return { success: true, data };
}
