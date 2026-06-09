'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import { writeAuditLog } from '@/lib/audit';
import type { ActionResult, UserSession } from '@/types/app';

const changePasswordSchema = z.object({
  current_password: z.string().min(1, 'Current password is required'),
  new_password:     z.string().min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain an uppercase letter')
    .regex(/[0-9]/, 'Must contain a number')
    .regex(/[^A-Za-z0-9]/, 'Must contain a special character'),
  confirm_password: z.string(),
}).refine(d => d.new_password === d.confirm_password, {
  message: 'Passwords do not match',
  path: ['confirm_password'],
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export async function changePassword(input: ChangePasswordInput): Promise<ActionResult> {
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid data' };

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  // Verify current password by re-signing in
  if (!user.email) return { success: false, error: 'No email on account' };
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.current_password,
  });
  if (signInError) return { success: false, error: 'Current password is incorrect' };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.new_password });
  if (error) return { success: false, error: error.message };

  const { data: profile } = await supabase
    .from('profiles').select('org_id').eq('id', user.id).single();

  if (profile) {
    await writeAuditLog({
      org_id: profile.org_id, user_id: user.id,
      action: 'change_password', resource_type: 'auth', resource_id: user.id,
    });
  }

  return { success: true, data: undefined };
}

export async function getSessions(): Promise<UserSession[]> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('user_sessions')
    .select('*')
    .eq('user_id', user.id)
    .is('revoked_at', null)
    .order('last_seen', { ascending: false })
    .limit(20);

  return (data as UserSession[]) ?? [];
}

export async function revokeSession(sessionId: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { error } = await supabase
    .from('user_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('user_id', user.id);

  if (error) return { success: false, error: error.message };
  revalidatePath('/settings/security');
  return { success: true, data: undefined };
}

export async function revokeAllOtherSessions(currentSessionId?: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  let query = supabase
    .from('user_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('revoked_at', null);

  if (currentSessionId) {
    query = query.neq('id', currentSessionId);
  }

  const { error } = await query;
  if (error) return { success: false, error: error.message };

  // Also sign out all sessions in Supabase Auth
  const admin = createSupabaseAdminClient();
  await admin.auth.admin.signOut(user.id, 'others');

  const { data: profile } = await supabase
    .from('profiles').select('org_id').eq('id', user.id).single();

  if (profile) {
    await writeAuditLog({
      org_id: profile.org_id, user_id: user.id,
      action: 'revoke_all_sessions', resource_type: 'auth', resource_id: user.id,
    });
  }

  revalidatePath('/settings/security');
  return { success: true, data: undefined };
}

export async function getLoginHistory(limit = 30) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('user_id', user.id)
    .in('action', ['login', 'logout', 'change_password', 'revoke_all_sessions'])
    .order('created_at', { ascending: false })
    .limit(limit);

  return data ?? [];
}
