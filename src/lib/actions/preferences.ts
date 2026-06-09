'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ActionResult, UserPreferences, UpsertPreferencesInput } from '@/types/app';

export async function upsertPreferences(input: UpsertPreferencesInput): Promise<ActionResult<UserPreferences>> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data, error } = await supabase
    .from('user_preferences')
    .upsert({ user_id: user.id, ...input, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  revalidatePath('/settings/preferences');
  return { success: true, data: data as UserPreferences };
}

export async function getOrCreatePreferences(): Promise<UserPreferences | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (data) return data as UserPreferences;

  // Auto-create defaults
  const { data: created } = await supabase
    .from('user_preferences')
    .insert({ user_id: user.id })
    .select()
    .single();

  return (created as UserPreferences) ?? null;
}
