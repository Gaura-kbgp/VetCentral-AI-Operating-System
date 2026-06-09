'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { writeAuditLog } from '@/lib/audit';
import type { ActionResult, Profile } from '@/types/app';

const profileSchema = z.object({
  first_name:              z.string().min(1, 'First name is required').max(100),
  last_name:               z.string().min(1, 'Last name is required').max(100),
  display_name:            z.string().max(100).optional(),
  employee_id:             z.string().max(50).optional(),
  job_title:               z.string().max(150).optional(),
  department:              z.string().max(150).optional(),
  phone:                   z.string().max(30).optional(),
  emergency_contact_name:  z.string().max(150).optional(),
  emergency_contact_phone: z.string().max(30).optional(),
});

export type ProfileUpdateInput = z.infer<typeof profileSchema>;

export async function updateProfile(input: ProfileUpdateInput): Promise<ActionResult<Profile>> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid data' };

  const { data: existing } = await supabase
    .from('profiles').select('*').eq('id', user.id).single();

  // Core fields — guaranteed to exist from migration 001
  const coreFields = {
    first_name: parsed.data.first_name,
    last_name:  parsed.data.last_name,
    job_title:  parsed.data.job_title  ?? null,
    department: parsed.data.department ?? null,
    phone:      parsed.data.phone      ?? null,
    updated_at: new Date().toISOString(),
  };

  let profileData: Record<string, unknown>;

  if (existing) {
    const { data, error } = await supabase
      .from('profiles')
      .update(coreFields)
      .eq('id', user.id)
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    profileData = data as Record<string, unknown>;
  } else {
    // Profile row doesn't exist yet — create it
    const { data: firstOrg } = await supabase
      .from('organizations').select('id').limit(1).single();

    if (!firstOrg) return { success: false, error: 'No organization found. Contact your administrator.' };

    const { data, error } = await supabase
      .from('profiles')
      .insert({
        id:     user.id,
        org_id: firstOrg.id,
        email:  user.email ?? '',
        ...coreFields,
      })
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    profileData = data as Record<string, unknown>;
  }

  // Extended fields — added in migration 006 (may not exist yet)
  // We attempt this separately so core fields always save
  const extendedFields: Record<string, string | null> = {};
  if (parsed.data.display_name            !== undefined) extendedFields.display_name            = parsed.data.display_name || null;
  if (parsed.data.employee_id             !== undefined) extendedFields.employee_id             = parsed.data.employee_id || null;
  if (parsed.data.emergency_contact_name  !== undefined) extendedFields.emergency_contact_name  = parsed.data.emergency_contact_name || null;
  if (parsed.data.emergency_contact_phone !== undefined) extendedFields.emergency_contact_phone = parsed.data.emergency_contact_phone || null;

  if (Object.keys(extendedFields).length > 0) {
    const { error: extError } = await supabase
      .from('profiles')
      .update(extendedFields)
      .eq('id', user.id);

    // If extended columns don't exist yet (migration 006 not run), we still
    // succeed — core fields were saved above. The extended fields will save
    // once migration 006 is applied to the database.
    if (extError) {
      console.warn('[updateProfile] Extended fields not saved:', extError.message);
    } else {
      // Merge extended fields into response
      Object.assign(profileData, extendedFields);
    }
  }

  await writeAuditLog({
    org_id:        (profileData.org_id as string) ?? '',
    user_id:       user.id,
    action:        'update',
    resource_type: 'profile',
    resource_id:   user.id,
    old_data:      existing as Record<string, unknown>,
    new_data:      profileData,
  });

  revalidatePath('/profile');
  revalidatePath('/', 'layout');
  return { success: true, data: profileData as unknown as Profile };
}

export async function updateAvatar(avatarUrl: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', user.id);

  if (error) return { success: false, error: error.message };

  revalidatePath('/profile');
  revalidatePath('/', 'layout');
  return { success: true, data: undefined };
}

export async function getProfileActivityLog(limit = 20) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  return data ?? [];
}
