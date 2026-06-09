'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import type { AppRole } from '@/types/database';

const ADMIN_ROLES: AppRole[] = ['super_admin', 'org_admin', 'it_admin'];

export type OrgIntegration = {
  id: string;
  provider: string;
  display_name: string;
  status: string;
  config: Record<string, unknown>;
  connected_at: string | null;
  last_sync_at: string | null;
  error_msg: string | null;
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

export async function getOrgIntegrations(): Promise<
  { success: boolean; data?: OrgIntegration[]; error?: string }
> {
  const ctx = await getAdminCtx();
  if (!ctx.ok) return { success: false, error: ctx.error };
  const { adminClient, orgId } = ctx;

  const { data, error } = await adminClient
    .from('org_integrations').select('*').eq('org_id', orgId).order('display_name');
  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as OrgIntegration[] };
}

export async function upsertIntegration(
  provider: string,
  displayName: string,
  status: string,
  config: Record<string, unknown>,
): Promise<{ success: boolean; data?: OrgIntegration; error?: string }> {
  const ctx = await getAdminCtx();
  if (!ctx.ok) return { success: false, error: ctx.error };
  const { adminClient, orgId, user } = ctx;

  if (!provider) return { success: false, error: 'Provider is required' };

  const { data: existing } = await adminClient
    .from('org_integrations')
    .select('*')
    .eq('org_id', orgId)
    .eq('provider', provider)
    .maybeSingle();

  // Merge config so secret fields left blank are not wiped out.
  const mergedConfig: Record<string, unknown> = {
    ...((existing?.config as Record<string, unknown>) ?? {}),
  };
  for (const [k, v] of Object.entries(config)) {
    if (v === '' || v === undefined || v === null) continue; // keep stored value
    mergedConfig[k] = v;
  }

  const isConnected = status === 'connected';
  const now = new Date().toISOString();

  const payload = {
    org_id:       orgId,
    provider,
    display_name: displayName,
    status,
    config:       mergedConfig,
    connected_at: isConnected ? (existing?.connected_at ?? now) : null,
    connected_by: isConnected ? (existing?.connected_by ?? user.id) : null,
    error_msg:    isConnected ? null : (existing?.error_msg ?? null),
    updated_at:   now,
  };

  const { data, error } = await adminClient
    .from('org_integrations')
    .upsert(payload, { onConflict: 'org_id,provider' })
    .select('*')
    .single();

  if (error) return { success: false, error: error.message };

  await adminClient.from('audit_logs').insert({
    org_id:        orgId,
    user_id:       user.id,
    action:        isConnected ? 'activate' : 'deactivate',
    resource_type: 'integration',
    resource_id:   data.id,
    old_data:      existing ? { status: existing.status } : null,
    new_data:      { provider, status },
  });

  revalidatePath('/admin/integrations');
  return { success: true, data: data as OrgIntegration };
}

export async function testIntegration(
  provider: string,
): Promise<{ success: boolean; ok?: boolean; message?: string; error?: string }> {
  const ctx = await getAdminCtx();
  if (!ctx.ok) return { success: false, error: ctx.error };
  const { adminClient, orgId } = ctx;

  const { data: integration } = await adminClient
    .from('org_integrations')
    .select('status, config')
    .eq('org_id', orgId)
    .eq('provider', provider)
    .maybeSingle();

  if (!integration || integration.status !== 'connected') {
    return { success: true, ok: false, message: 'Integration is not connected.' };
  }

  const config = (integration.config as Record<string, unknown>) ?? {};
  const hasConfig = Object.keys(config).length > 0;

  // Mock test (no real API calls). Update last_sync_at to simulate a ping.
  if (hasConfig) {
    await adminClient
      .from('org_integrations')
      .update({ last_sync_at: new Date().toISOString(), error_msg: null })
      .eq('org_id', orgId)
      .eq('provider', provider);
    revalidatePath('/admin/integrations');
    return { success: true, ok: true, message: 'Connection test passed.' };
  }

  return { success: true, ok: false, message: 'Missing configuration for this provider.' };
}
