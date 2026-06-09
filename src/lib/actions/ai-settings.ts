'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ActionResult, AIUserSettings, SavedPrompt } from '@/types/app';

export async function getOrCreateAISettings(): Promise<AIUserSettings | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('ai_user_settings')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (data) return data as AIUserSettings;

  const { data: created } = await supabase
    .from('ai_user_settings')
    .insert({ user_id: user.id })
    .select()
    .single();

  return (created as AIUserSettings) ?? null;
}

export async function updateAISettings(
  input: Partial<Pick<AIUserSettings, 'preferred_model' | 'provider' | 'voice_enabled' | 'voice_id'>>
): Promise<ActionResult<AIUserSettings>> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data, error } = await supabase
    .from('ai_user_settings')
    .upsert({ user_id: user.id, ...input, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  revalidatePath('/settings/ai');
  return { success: true, data: data as AIUserSettings };
}

export async function savePrompt(name: string, content: string): Promise<ActionResult<SavedPrompt>> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  if (!name.trim() || !content.trim()) return { success: false, error: 'Name and content are required' };

  const { data: settings } = await supabase
    .from('ai_user_settings')
    .select('saved_prompts')
    .eq('user_id', user.id)
    .single();

  const existing: SavedPrompt[] = (settings?.saved_prompts as SavedPrompt[]) ?? [];
  const newPrompt: SavedPrompt = {
    id: crypto.randomUUID(),
    name: name.trim(),
    content: content.trim(),
    created_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('ai_user_settings')
    .upsert({
      user_id: user.id,
      saved_prompts: [...existing, newPrompt],
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

  if (error) return { success: false, error: error.message };
  revalidatePath('/settings/ai');
  return { success: true, data: newPrompt };
}

export async function deletePrompt(promptId: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data: settings } = await supabase
    .from('ai_user_settings')
    .select('saved_prompts')
    .eq('user_id', user.id)
    .single();

  const existing: SavedPrompt[] = (settings?.saved_prompts as SavedPrompt[]) ?? [];
  const filtered = existing.filter(p => p.id !== promptId);

  const { error } = await supabase
    .from('ai_user_settings')
    .update({ saved_prompts: filtered, updated_at: new Date().toISOString() })
    .eq('user_id', user.id);

  if (error) return { success: false, error: error.message };
  revalidatePath('/settings/ai');
  return { success: true, data: undefined };
}

export async function clearConversationHistory(): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { error } = await supabase
    .from('ai_conversations')
    .delete()
    .eq('user_id', user.id);

  if (error) return { success: false, error: error.message };
  revalidatePath('/settings/ai');
  return { success: true, data: undefined };
}
