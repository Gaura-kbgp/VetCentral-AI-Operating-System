'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import { writeAuditLog } from '@/lib/audit';
import type { ActionResult, CalendarEvent, EventType } from '@/types/app';

const eventSchema = z.object({
  title:            z.string().min(1, 'Title is required').max(300),
  description:      z.string().max(5000).nullable().optional(),
  event_type:       z.string().min(1, 'Event type is required'),
  start_time:       z.string().min(1, 'Start time is required'),
  end_time:         z.string().min(1, 'End time is required'),
  is_all_day:       z.boolean().default(false),
  location:         z.string().max(500).nullable().optional(),
  meeting_link:     z.string().url().nullable().optional().or(z.literal('')),
  hospital_id:      z.string().uuid().nullable().optional(),
  priority:         z.enum(['low','medium','high','urgent']).default('medium'),
  color:            z.string().nullable().optional(),
  is_recurring:     z.boolean().default(false),
  recurrence_rule:  z.string().nullable().optional(),
  // Attendee emails — resolved to user_id if profile found
  attendees:        z.array(z.string().email()).optional().default([]),
});

export type CreateEventInput = z.infer<typeof eventSchema>;

// ── Resolve emails → calendar_event_attendees rows ────────────────────────────
async function buildAttendeeRows(
  eventId: string,
  emails: string[],
  organizerUserId: string,
): Promise<Array<{ event_id: string; user_id: string | null; email: string; is_organizer: boolean; status: string }>> {
  if (emails.length === 0) return [];
  const admin = createSupabaseAdminClient();

  // Batch-lookup profiles by email to get user_ids
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, email')
    .in('email', emails);

  const profileByEmail = Object.fromEntries((profiles ?? []).map(p => [p.email, p.id]));

  return emails.map(email => ({
    event_id:     eventId,
    user_id:      profileByEmail[email] ?? null,
    email,
    is_organizer: profileByEmail[email] === organizerUserId,
    status:       'invited',
  }));
}

// ── Save attendees (upsert all for an event) ──────────────────────────────────
async function syncAttendees(eventId: string, emails: string[], organizerUserId: string) {
  const admin = createSupabaseAdminClient();
  // Delete existing attendees for this event (full replace)
  await admin.from('calendar_event_attendees').delete().eq('event_id', eventId);
  if (emails.length === 0) return;
  const rows = await buildAttendeeRows(eventId, emails, organizerUserId);
  await admin.from('calendar_event_attendees').insert(rows);
}

// ── Create ───────────────────────────────────────────────────────────────────
export async function createCalendarEvent(input: CreateEventInput): Promise<ActionResult<CalendarEvent>> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid data' };

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from('profiles').select('org_id').eq('id', user.id).single();
  if (!profile) return { success: false, error: 'Profile not found' };

  const { attendees, ...eventData } = parsed.data;

  const payload = {
    ...eventData,
    org_id:       profile.org_id,
    created_by:   user.id,
    meeting_link: eventData.meeting_link || null,
  };

  const { data, error } = await admin
    .from('calendar_events')
    .insert(payload)
    .select('*')
    .single();

  if (error) return { success: false, error: error.message };

  // Save attendees — always include organizer (creator)
  const allEmails = attendees ?? [];
  await syncAttendees(data.id, allEmails, user.id);

  // Re-fetch with attendees joined
  const { data: full } = await admin
    .from('calendar_events')
    .select('*, attendees:calendar_event_attendees(*)')
    .eq('id', data.id)
    .single();

  await writeAuditLog({
    org_id:        profile.org_id,
    user_id:       user.id,
    action:        'calendar.event.create',
    resource_type: 'calendar_event',
    resource_id:   data.id,
    hospital_id:   data.hospital_id,
    new_data:      { title: data.title, event_type: data.event_type },
  });

  revalidatePath('/calendar');
  revalidatePath('/dashboard');
  return { success: true, data: (full ?? data) as CalendarEvent };
}

// ── Update ───────────────────────────────────────────────────────────────────
export async function updateCalendarEvent(
  id: string,
  input: Partial<CreateEventInput>,
): Promise<ActionResult<CalendarEvent>> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const admin = createSupabaseAdminClient();

  const { data: existing } = await admin
    .from('calendar_events').select('org_id, created_by, hospital_id').eq('id', id).single();
  if (!existing) return { success: false, error: 'Event not found' };

  const { data: profile } = await admin
    .from('profiles').select('org_id').eq('id', user.id).single();
  if (!profile || profile.org_id !== existing.org_id) return { success: false, error: 'Unauthorized' };

  const { attendees, ...eventFields } = input;

  const { data, error } = await admin
    .from('calendar_events')
    .update({ ...eventFields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();

  if (error) return { success: false, error: error.message };

  // Sync attendees if provided (undefined = don't touch, [] = remove all)
  if (attendees !== undefined) {
    await syncAttendees(id, attendees, existing.created_by ?? user.id);
  }

  // Re-fetch with attendees joined
  const { data: full } = await admin
    .from('calendar_events')
    .select('*, attendees:calendar_event_attendees(*)')
    .eq('id', id)
    .single();

  await writeAuditLog({
    org_id:        profile.org_id,
    user_id:       user.id,
    action:        'calendar.event.update',
    resource_type: 'calendar_event',
    resource_id:   id,
    hospital_id:   existing.hospital_id,
    new_data:      eventFields as Record<string, unknown>,
  });

  revalidatePath('/calendar');
  revalidatePath('/dashboard');
  return { success: true, data: (full ?? data) as CalendarEvent };
}

// ── Delete ───────────────────────────────────────────────────────────────────
export async function deleteCalendarEvent(id: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin
    .from('calendar_events').select('org_id, hospital_id, title').eq('id', id).single();
  if (!existing) return { success: false, error: 'Event not found' };

  const { error } = await admin
    .from('calendar_events')
    .update({ is_cancelled: true, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return { success: false, error: error.message };

  await writeAuditLog({
    org_id:        existing.org_id,
    user_id:       user.id,
    action:        'calendar.event.delete',
    resource_type: 'calendar_event',
    resource_id:   id,
    hospital_id:   existing.hospital_id,
    old_data:      { title: existing.title },
  });

  revalidatePath('/calendar');
  revalidatePath('/dashboard');
  return { success: true, data: undefined };
}

// ── Staff Search (for attendee people-picker) ─────────────────────────────────
export interface StaffProfile {
  id:         string;
  first_name: string | null;
  last_name:  string | null;
  email:      string | null;
  role?:      string | null;
}

export async function searchStaffProfiles(query: string): Promise<ActionResult<StaffProfile[]>> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  if (!query || query.trim().length < 2) return { success: true, data: [] };

  const admin = createSupabaseAdminClient();
  const q = query.trim().toLowerCase();

  const { data, error } = await admin
    .from('profiles')
    .select('id, first_name, last_name, email')
    .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`)
    .eq('is_active', true)
    .limit(10);

  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as StaffProfile[] };
}

// ── Get events (existing helper) ──────────────────────────────────────────────
export interface GetEventsOptions {
  hospitalId?: string | null;
  eventTypes?: EventType[];
  from?: string;
  to?: string;
}

export async function getCalendarEvents(options: GetEventsOptions = {}): Promise<ActionResult<CalendarEvent[]>> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const admin = createSupabaseAdminClient();
  const now  = new Date();
  const from = options.from ?? new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const to   = options.to   ?? new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString();

  let query = admin
    .from('calendar_events')
    .select('*, attendees:calendar_event_attendees(*)')
    .gte('start_time', from)
    .lte('start_time', to)
    .eq('is_cancelled', false)
    .order('start_time');

  if (options.hospitalId) query = query.eq('hospital_id', options.hospitalId);
  if (options.eventTypes?.length) query = query.in('event_type', options.eventTypes);

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as CalendarEvent[] };
}
