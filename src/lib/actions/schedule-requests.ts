'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/types/app';

export interface ScheduleRequestInput {
  title:           string;
  event_type:      string;
  start_time:      string;
  end_time:        string;
  is_all_day:      boolean;
  location?:       string | null;
  meeting_link?:   string | null;
  hospital_id?:    string | null;
  priority:        string;
  description?:    string | null;
  attendee_emails: string[];
}

export interface ScheduleRequest {
  id:               string;
  title:            string;
  event_type:       string;
  start_time:       string;
  end_time:         string;
  is_all_day:       boolean;
  location:         string | null;
  meeting_link:     string | null;
  hospital_id:      string | null;
  priority:         string;
  description:      string | null;
  attendee_emails:  string[];
  requested_by:     string;
  status:           'pending' | 'approved' | 'rejected';
  admin_notes:      string | null;
  approved_by:      string | null;
  approved_at:      string | null;
  rejected_at:      string | null;
  calendar_event_id: string | null;
  created_at:       string;
  requester?: { first_name: string | null; last_name: string | null; email: string | null; job_title: string | null; avatar_url: string | null; };
  hospital?: { name: string | null; } | null;
  approver?: { first_name: string | null; last_name: string | null; } | null;
}

// ── Create a schedule request (non-admin users) ───────────────────────────────
export async function createScheduleRequest(
  input: ScheduleRequestInput,
): Promise<ActionResult<ScheduleRequest>> {
  const supabase = await createSupabaseServerClient();
  const admin    = createSupabaseAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data, error } = await admin
    .from('schedule_requests')
    .insert({
      title:           input.title.trim(),
      event_type:      input.event_type,
      start_time:      input.start_time,
      end_time:        input.end_time,
      is_all_day:      input.is_all_day,
      location:        input.location || null,
      meeting_link:    input.meeting_link || null,
      hospital_id:     input.hospital_id || null,
      priority:        input.priority,
      description:     input.description || null,
      attendee_emails: input.attendee_emails,
      requested_by:    user.id,
      status:          'pending',
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  // Notify all admins about the new request
  const [{ data: hospAdmins }, { data: orgAdmins }] = await Promise.all([
    admin.from('user_hospital_roles').select('user_id').in('role', ['super_admin', 'org_admin', 'hospital_admin', 'practice_manager']),
    admin.from('org_user_roles').select('user_id').in('role', ['super_admin', 'org_admin']),
  ]);
  const adminIds = [...new Set([
    ...(hospAdmins ?? []).map(r => r.user_id),
    ...(orgAdmins ?? []).map(r => r.user_id),
  ])].filter(id => id !== user.id);

  if (adminIds.length > 0) {
    const { data: requesterProfile } = await admin
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', user.id)
      .single();
    const name = requesterProfile
      ? `${requesterProfile.first_name ?? ''} ${requesterProfile.last_name ?? ''}`.trim() || 'Someone'
      : 'Someone';

    await admin.from('notifications').insert(
      adminIds.map(adminId => ({
        user_id:  adminId,
        type:     'schedule_request',
        title:    'New Schedule Request',
        body:     `${name} requested: "${input.title}"`,
        link:     '/schedule-requests',
        is_read:  false,
        metadata: { request_id: data.id },
      }))
    );
  }

  revalidatePath('/calendar');
  return { success: true, data: data as ScheduleRequest };
}

// ── List requests (admin) ─────────────────────────────────────────────────────
export async function getScheduleRequests(
  status?: 'pending' | 'approved' | 'rejected' | 'all',
): Promise<ActionResult<ScheduleRequest[]>> {
  const supabase = await createSupabaseServerClient();
  const admin    = createSupabaseAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  let query = admin
    .from('schedule_requests')
    .select(`
      *,
      requester:profiles!requested_by(first_name, last_name, email, job_title, avatar_url),
      hospital:hospitals(name),
      approver:profiles!approved_by(first_name, last_name)
    `)
    .order('created_at', { ascending: false });

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as ScheduleRequest[] };
}

// ── Approve a request (admin) ─────────────────────────────────────────────────
export async function approveScheduleRequest(
  requestId: string,
  adminNotes?: string,
): Promise<ActionResult<ScheduleRequest>> {
  const supabase = await createSupabaseServerClient();
  const admin    = createSupabaseAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  // Fetch the request
  const { data: req, error: fetchError } = await admin
    .from('schedule_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (fetchError || !req) return { success: false, error: 'Request not found' };
  if (req.status !== 'pending') return { success: false, error: 'Request is no longer pending' };

  // Create the calendar event
  const { data: calEvent, error: calError } = await admin
    .from('calendar_events')
    .insert({
      title:        req.title,
      event_type:   req.event_type,
      start_time:   req.start_time,
      end_time:     req.end_time,
      is_all_day:   req.is_all_day,
      location:     req.location,
      meeting_link: req.meeting_link,
      hospital_id:  req.hospital_id,
      priority:     req.priority,
      description:  req.description,
      created_by:   req.requested_by,
      is_cancelled: false,
    })
    .select()
    .single();

  if (calError) return { success: false, error: calError.message };

  // Update the request status
  const { data: updated, error: updateError } = await admin
    .from('schedule_requests')
    .update({
      status:           'approved',
      admin_notes:      adminNotes ?? null,
      approved_by:      user.id,
      approved_at:      new Date().toISOString(),
      calendar_event_id: calEvent.id,
    })
    .eq('id', requestId)
    .select()
    .single();

  if (updateError) return { success: false, error: updateError.message };

  // Notify the requester
  const { data: adminProfile } = await admin
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', user.id)
    .single();
  const adminName = adminProfile
    ? `${adminProfile.first_name ?? ''} ${adminProfile.last_name ?? ''}`.trim() || 'Admin'
    : 'Admin';

  await admin.from('notifications').insert({
    user_id:  req.requested_by,
    type:     'schedule_approved',
    title:    'Schedule Request Approved',
    body:     `"${req.title}" was approved by ${adminName}. It's now on the calendar.`,
    link:     '/calendar',
    is_read:  false,
    metadata: { request_id: requestId, calendar_event_id: calEvent.id },
  });

  revalidatePath('/schedule-requests');
  revalidatePath('/calendar');
  return { success: true, data: updated as ScheduleRequest };
}

// ── Reject a request (admin) ──────────────────────────────────────────────────
export async function rejectScheduleRequest(
  requestId: string,
  adminNotes?: string,
): Promise<ActionResult<ScheduleRequest>> {
  const supabase = await createSupabaseServerClient();
  const admin    = createSupabaseAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data: req } = await admin
    .from('schedule_requests')
    .select('requested_by, title, status')
    .eq('id', requestId)
    .single();

  if (!req) return { success: false, error: 'Request not found' };
  if (req.status !== 'pending') return { success: false, error: 'Request is no longer pending' };

  const { data: updated, error } = await admin
    .from('schedule_requests')
    .update({
      status:      'rejected',
      admin_notes: adminNotes ?? null,
      approved_by: user.id,
      rejected_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  // Notify requester
  const { data: adminProfile } = await admin
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', user.id)
    .single();
  const adminName = adminProfile
    ? `${adminProfile.first_name ?? ''} ${adminProfile.last_name ?? ''}`.trim() || 'Admin'
    : 'Admin';

  await admin.from('notifications').insert({
    user_id:  req.requested_by,
    type:     'schedule_rejected',
    title:    'Schedule Request Declined',
    body:     `"${req.title}" was declined by ${adminName}${adminNotes ? `: ${adminNotes}` : '.'}`,
    link:     '/calendar',
    is_read:  false,
    metadata: { request_id: requestId },
  });

  revalidatePath('/schedule-requests');
  return { success: true, data: updated as ScheduleRequest };
}
