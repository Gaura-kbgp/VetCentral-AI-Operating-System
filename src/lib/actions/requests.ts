'use server';

import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/types/app';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type RequestType =
  | 'meeting' | 'leave' | 'purchase'
  | 'training' | 'document_verification' | 'equipment';

export type RequestStatus =
  | 'pending' | 'approved' | 'rejected'
  | 'escalated' | 'cancelled' | 'completed';

export type RequestPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface RequestSummary {
  id: string;
  request_type: RequestType;
  status: RequestStatus;
  priority: RequestPriority;
  title: string;
  description: string | null;
  requested_by: string;
  created_at: string;
  updated_at: string;
  due_date: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  escalation_reason: string | null;
  requester?: { first_name: string; last_name: string; email: string } | null;
}

export interface DashboardMetrics {
  pending_count: number;
  overdue_count: number;
  escalated_count: number;
  completed_today: number;
  pending_by_type: Record<RequestType, number>;
}

const ADMIN_ROLES = ['super_admin', 'org_admin', 'hospital_admin', 'practice_manager', 'hr'] as const;

// ─────────────────────────────────────────────────────────────
// Context Helper
// ─────────────────────────────────────────────────────────────

async function getCtx() {
  const supabase = await createSupabaseServerClient();
  const admin    = createSupabaseAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, admin, user: null, orgId: null, isAdmin: false };

  const { data: p } = await admin
    .from('profiles')
    .select('org_id,first_name,last_name')
    .eq('id', user.id)
    .single();

  const [{ data: hospRoles }, { data: orgRoles }] = await Promise.all([
    admin.from('user_hospital_roles').select('role').eq('user_id', user.id),
    admin.from('org_user_roles').select('role').eq('user_id', user.id),
  ]);

  const allRoles = [
    ...(hospRoles ?? []).map(r => r.role),
    ...(orgRoles ?? []).map(r => r.role),
  ];
  const isAdmin = allRoles.some(r => (ADMIN_ROLES as readonly string[]).includes(r));

  return { supabase, admin, user, orgId: p?.org_id ?? null, isAdmin, profile: p };
}

// ─────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────

async function sendNotification(
  userId: string,
  orgId: string,
  title: string,
  body: string,
  actionUrl: string,
) {
  try {
    const admin = createSupabaseAdminClient();
    await admin.from('notifications').insert({
      user_id: userId,
      org_id: orgId,
      type: 'system_announcement',
      title,
      body,
      action_url: actionUrl,
    });
  } catch { /* non-fatal */ }
}

async function logRequestActivity(
  requestId: string,
  userId: string,
  activityType: string,
  details?: Record<string, unknown>,
) {
  try {
    const admin = createSupabaseAdminClient();
    await admin.from('request_activity').insert({
      request_id: requestId,
      activity_type: activityType,
      action_by: userId,
      details: details || {},
    });
  } catch { /* non-fatal */ }
}

// ─────────────────────────────────────────────────────────────
// Create: Meeting Request
// ─────────────────────────────────────────────────────────────

export async function createMeetingRequest(data: {
  title: string;
  description?: string;
  meeting_type: string;
  start_time: string;
  end_time: string;
  is_all_day?: boolean;
  location?: string;
  meeting_link?: string;
  required_attendees?: string[];
  optional_attendees?: string[];
  priority?: RequestPriority;
}): Promise<ActionResult<{ request_id: string }>> {
  const { admin, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  try {
    const { data: req, error: reqErr } = await admin
      .from('requests')
      .insert({
        org_id: orgId,
        request_type: 'meeting',
        requested_by: user.id,
        status: 'pending',
        priority: data.priority || 'medium',
        title: data.title,
        description: data.description,
      })
      .select('id')
      .single();

    if (reqErr || !req) return { success: false, error: reqErr?.message || 'Failed to create request' };

    const { error: detailErr } = await admin.from('meeting_requests').insert({
      request_id: req.id,
      title: data.title,
      description: data.description,
      meeting_type: data.meeting_type,
      start_time: new Date(data.start_time).toISOString(),
      end_time: new Date(data.end_time).toISOString(),
      is_all_day: data.is_all_day || false,
      location: data.location,
      meeting_link: data.meeting_link,
      required_attendees: data.required_attendees || [],
      optional_attendees: data.optional_attendees || [],
    });

    if (detailErr) {
      await admin.from('requests').delete().eq('id', req.id);
      return { success: false, error: detailErr.message };
    }

    await logRequestActivity(req.id, user.id, 'created', { type: 'meeting' });
    return { success: true, data: { request_id: req.id } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ─────────────────────────────────────────────────────────────
// Create: Leave Request
// ─────────────────────────────────────────────────────────────

export async function createLeaveRequest(data: {
  leave_type: string;
  start_date: string;
  end_date: string;
  reason?: string;
  coverage_plan?: string;
  priority?: RequestPriority;
}): Promise<ActionResult<{ request_id: string }>> {
  const { admin, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  try {
    const start = new Date(data.start_date);
    const end = new Date(data.end_date);
    const durationDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000) + 1);
    const leaveLabel = data.leave_type.charAt(0).toUpperCase() + data.leave_type.slice(1);

    const { data: req, error: reqErr } = await admin
      .from('requests')
      .insert({
        org_id: orgId,
        request_type: 'leave',
        requested_by: user.id,
        status: 'pending',
        priority: data.priority || 'medium',
        title: `${leaveLabel} Leave — ${data.start_date} to ${data.end_date}`,
        description: data.reason,
      })
      .select('id')
      .single();

    if (reqErr || !req) return { success: false, error: reqErr?.message };

    const { error: detailErr } = await admin.from('leave_requests').insert({
      request_id: req.id,
      leave_type: data.leave_type,
      start_date: start.toISOString().split('T')[0],
      end_date: end.toISOString().split('T')[0],
      duration_days: durationDays,
      reason: data.reason,
      coverage_plan: data.coverage_plan,
    });

    if (detailErr) {
      await admin.from('requests').delete().eq('id', req.id);
      return { success: false, error: detailErr.message };
    }

    await logRequestActivity(req.id, user.id, 'created', { type: 'leave' });
    return { success: true, data: { request_id: req.id } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ─────────────────────────────────────────────────────────────
// Create: Purchase Request
// ─────────────────────────────────────────────────────────────

export async function createPurchaseRequest(data: {
  item_description: string;
  quantity: number;
  unit_price: number;
  vendor_name?: string;
  vendor_contact?: string;
  business_justification?: string;
  department?: string;
  priority?: RequestPriority;
}): Promise<ActionResult<{ request_id: string }>> {
  const { admin, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  try {
    const totalCost = data.quantity * data.unit_price;

    const { data: req, error: reqErr } = await admin
      .from('requests')
      .insert({
        org_id: orgId,
        request_type: 'purchase',
        requested_by: user.id,
        status: 'pending',
        priority: data.priority || (totalCost > 5000 ? 'high' : 'medium'),
        title: `Purchase: ${data.item_description}`,
        description: data.business_justification,
      })
      .select('id')
      .single();

    if (reqErr || !req) return { success: false, error: reqErr?.message };

    const { error: detailErr } = await admin.from('purchase_requests').insert({
      request_id: req.id,
      item_description: data.item_description,
      quantity: data.quantity,
      unit_price: data.unit_price,
      total_cost: totalCost,
      vendor_name: data.vendor_name,
      vendor_contact: data.vendor_contact,
      department: data.department,
      business_justification: data.business_justification,
    });

    if (detailErr) {
      await admin.from('requests').delete().eq('id', req.id);
      return { success: false, error: detailErr.message };
    }

    await logRequestActivity(req.id, user.id, 'created', { type: 'purchase', total: totalCost });
    return { success: true, data: { request_id: req.id } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ─────────────────────────────────────────────────────────────
// Create: Training Request
// ─────────────────────────────────────────────────────────────

export async function createTrainingRequest(data: {
  training_title: string;
  training_type: string;
  provider_name?: string;
  provider_url?: string;
  start_date: string;
  end_date: string;
  duration_hours?: number;
  delivery_method?: string;
  cost?: number;
  learning_objectives?: string;
  expected_outcome?: string;
  priority?: RequestPriority;
}): Promise<ActionResult<{ request_id: string }>> {
  const { admin, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  try {
    const { data: req, error: reqErr } = await admin
      .from('requests')
      .insert({
        org_id: orgId,
        request_type: 'training',
        requested_by: user.id,
        status: 'pending',
        priority: data.priority || 'medium',
        title: `Training: ${data.training_title}`,
        description: data.learning_objectives,
      })
      .select('id')
      .single();

    if (reqErr || !req) return { success: false, error: reqErr?.message };

    const { error: detailErr } = await admin.from('training_requests').insert({
      request_id: req.id,
      training_title: data.training_title,
      training_type: data.training_type,
      provider_name: data.provider_name,
      provider_url: data.provider_url,
      start_date: data.start_date,
      end_date: data.end_date,
      duration_hours: data.duration_hours,
      delivery_method: data.delivery_method,
      cost: data.cost,
      learning_objectives: data.learning_objectives,
      expected_outcome: data.expected_outcome,
    });

    if (detailErr) {
      await admin.from('requests').delete().eq('id', req.id);
      return { success: false, error: detailErr.message };
    }

    await logRequestActivity(req.id, user.id, 'created', { type: 'training' });
    return { success: true, data: { request_id: req.id } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ─────────────────────────────────────────────────────────────
// Create: Document Verification Request
// ─────────────────────────────────────────────────────────────

export async function createDocumentRequest(data: {
  document_type: string;
  document_name: string;
  document_url: string;
  issued_by?: string;
  expiration_date?: string;
  priority?: RequestPriority;
}): Promise<ActionResult<{ request_id: string }>> {
  const { admin, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  try {
    const { data: req, error: reqErr } = await admin
      .from('requests')
      .insert({
        org_id: orgId,
        request_type: 'document_verification',
        requested_by: user.id,
        status: 'pending',
        priority: data.priority || 'medium',
        title: `Verify: ${data.document_name}`,
        description: `Document type: ${data.document_type}`,
      })
      .select('id')
      .single();

    if (reqErr || !req) return { success: false, error: reqErr?.message };

    const { error: detailErr } = await admin.from('document_verification_requests').insert({
      request_id: req.id,
      document_type: data.document_type,
      document_name: data.document_name,
      document_url: data.document_url,
      issued_by: data.issued_by,
      expiration_date: data.expiration_date || null,
    });

    if (detailErr) {
      await admin.from('requests').delete().eq('id', req.id);
      return { success: false, error: detailErr.message };
    }

    await logRequestActivity(req.id, user.id, 'created', { type: 'document_verification' });
    return { success: true, data: { request_id: req.id } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ─────────────────────────────────────────────────────────────
// Create: Equipment Request
// ─────────────────────────────────────────────────────────────

export async function createEquipmentRequest(data: {
  equipment_name: string;
  equipment_type: string;
  specifications?: string;
  quantity?: number;
  estimated_cost?: number;
  business_justification?: string;
  intended_use?: string;
  department?: string;
  priority?: RequestPriority;
}): Promise<ActionResult<{ request_id: string }>> {
  const { admin, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  try {
    const { data: req, error: reqErr } = await admin
      .from('requests')
      .insert({
        org_id: orgId,
        request_type: 'equipment',
        requested_by: user.id,
        status: 'pending',
        priority: data.priority || ((data.estimated_cost ?? 0) > 2000 ? 'high' : 'medium'),
        title: `Equipment: ${data.equipment_name}`,
        description: data.business_justification,
      })
      .select('id')
      .single();

    if (reqErr || !req) return { success: false, error: reqErr?.message };

    const { error: detailErr } = await admin.from('equipment_requests').insert({
      request_id: req.id,
      equipment_name: data.equipment_name,
      equipment_type: data.equipment_type,
      specifications: data.specifications,
      quantity: data.quantity || 1,
      estimated_cost: data.estimated_cost,
      business_justification: data.business_justification,
      intended_use: data.intended_use,
      department: data.department,
    });

    if (detailErr) {
      await admin.from('requests').delete().eq('id', req.id);
      return { success: false, error: detailErr.message };
    }

    await logRequestActivity(req.id, user.id, 'created', { type: 'equipment' });
    return { success: true, data: { request_id: req.id } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ─────────────────────────────────────────────────────────────
// Approval Workflow
// ─────────────────────────────────────────────────────────────

export async function approveRequest(
  requestId: string,
  comments?: string,
): Promise<ActionResult<void>> {
  const { admin, user, orgId, isAdmin } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };
  if (!isAdmin) return { success: false, error: 'Only admins can approve requests' };

  try {
    const { data: request, error: reqErr } = await admin
      .from('requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (reqErr || !request) return { success: false, error: 'Request not found' };
    if (request.status !== 'pending' && request.status !== 'escalated') {
      return { success: false, error: 'Request is not pending approval' };
    }

    const { error } = await admin
      .from('requests')
      .update({
        status: 'approved',
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    if (error) return { success: false, error: error.message };

    // For meeting requests: auto-create calendar event
    if (request.request_type === 'meeting') {
      const { data: meet } = await admin
        .from('meeting_requests')
        .select('*')
        .eq('request_id', requestId)
        .single();

      if (meet) {
        const { data: calEvent } = await admin
          .from('calendar_events')
          .insert({
            org_id: orgId,
            title: meet.title,
            description: meet.description,
            start_time: meet.start_time,
            end_time: meet.end_time,
            is_all_day: meet.is_all_day,
            location: meet.location,
            meeting_link: meet.meeting_link,
            event_type: 'meeting',
            created_by: user.id,
          })
          .select('id')
          .single();

        if (calEvent) {
          await admin
            .from('meeting_requests')
            .update({ calendar_event_id: calEvent.id })
            .eq('request_id', requestId);
        }
      }
    }

    await sendNotification(
      request.requested_by,
      orgId,
      'Request Approved',
      `Your request "${request.title}" has been approved.${comments ? ` Note: ${comments}` : ''}`,
      `/workflows`,
    );

    await logRequestActivity(requestId, user.id, 'approved', { comments });
    return { success: true, data: undefined };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

export async function rejectRequest(
  requestId: string,
  reason: string,
): Promise<ActionResult<void>> {
  const { admin, user, orgId, isAdmin } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };
  if (!isAdmin) return { success: false, error: 'Only admins can reject requests' };

  try {
    const { data: request } = await admin
      .from('requests')
      .select('requested_by,title')
      .eq('id', requestId)
      .single();

    const { error } = await admin
      .from('requests')
      .update({
        status: 'rejected',
        approved_by: user.id,
        rejected_at: new Date().toISOString(),
        rejection_reason: reason,
      })
      .eq('id', requestId);

    if (error) return { success: false, error: error.message };

    if (request) {
      await sendNotification(
        request.requested_by,
        orgId,
        'Request Rejected',
        `Your request "${request.title}" was not approved. Reason: ${reason}`,
        `/workflows`,
      );
    }

    await logRequestActivity(requestId, user.id, 'rejected', { reason });
    return { success: true, data: undefined };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

export async function escalateRequest(
  requestId: string,
  reason: string,
): Promise<ActionResult<void>> {
  const { admin, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  try {
    const { error } = await admin
      .from('requests')
      .update({
        status: 'escalated',
        escalation_reason: reason,
        escalated_by: user.id,
        escalated_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    if (error) return { success: false, error: error.message };

    await logRequestActivity(requestId, user.id, 'escalated', { reason });
    return { success: true, data: undefined };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

export async function cancelRequest(requestId: string): Promise<ActionResult<void>> {
  const { admin, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  try {
    const { data: request } = await admin
      .from('requests')
      .select('requested_by,status')
      .eq('id', requestId)
      .single();

    if (!request) return { success: false, error: 'Request not found' };
    if (request.requested_by !== user.id) return { success: false, error: 'Can only cancel your own requests' };
    if (request.status !== 'pending') return { success: false, error: 'Only pending requests can be cancelled' };

    const { error } = await admin
      .from('requests')
      .update({ status: 'cancelled' })
      .eq('id', requestId);

    if (error) return { success: false, error: error.message };

    await logRequestActivity(requestId, user.id, 'cancelled');
    return { success: true, data: undefined };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

export async function rescheduleRequest(
  requestId: string,
  newStartTime: string,
  newEndTime: string,
  reason?: string,
): Promise<ActionResult<void>> {
  const { admin, user, orgId, isAdmin } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };
  if (!isAdmin) return { success: false, error: 'Only admins can reschedule requests' };

  try {
    const { error } = await admin
      .from('meeting_requests')
      .update({
        start_time: new Date(newStartTime).toISOString(),
        end_time: new Date(newEndTime).toISOString(),
      })
      .eq('request_id', requestId);

    if (error) return { success: false, error: error.message };

    await admin.from('requests').update({ status: 'pending' }).eq('id', requestId);
    await logRequestActivity(requestId, user.id, 'rescheduled', { newStartTime, newEndTime, reason });
    return { success: true, data: undefined };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ─────────────────────────────────────────────────────────────
// My Requests (requester view)
// ─────────────────────────────────────────────────────────────

export async function getMyRequests(
  statusFilter?: RequestStatus | 'all',
  typeFilter?: RequestType | 'all',
): Promise<ActionResult<RequestSummary[]>> {
  const { admin, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  try {
    let query = admin
      .from('requests')
      .select('id,request_type,status,priority,title,description,requested_by,created_at,updated_at,due_date,approved_at,rejected_at,rejection_reason,escalation_reason')
      .eq('requested_by', user.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (statusFilter && statusFilter !== 'all') query = query.eq('status', statusFilter);
    if (typeFilter && typeFilter !== 'all') query = query.eq('request_type', typeFilter);

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };

    return { success: true, data: (data || []) as RequestSummary[] };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ─────────────────────────────────────────────────────────────
// Admin Dashboard Queries
// ─────────────────────────────────────────────────────────────

const REQUESTER_SELECT = 'id,request_type,status,priority,title,description,requested_by,created_at,updated_at,due_date,approved_at,rejected_at,rejection_reason,escalation_reason,requester:profiles!requested_by(first_name,last_name,email)';

export async function getDashboardMetrics(): Promise<ActionResult<DashboardMetrics>> {
  const { admin, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  try {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();

    const [pendingRes, overdueRes, escalatedRes, completedRes] = await Promise.all([
      admin.from('requests').select('request_type').eq('org_id', orgId).in('status', ['pending']),
      admin.from('requests').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'pending').not('due_date', 'is', null).lt('due_date', now),
      admin.from('requests').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'escalated'),
      admin.from('requests').select('id', { count: 'exact', head: true }).eq('org_id', orgId).in('status', ['approved', 'rejected']).gte('updated_at', today),
    ]);

    const pendingByType: Record<RequestType, number> = {
      meeting: 0, leave: 0, purchase: 0, training: 0, document_verification: 0, equipment: 0,
    };
    pendingRes.data?.forEach(r => { pendingByType[r.request_type as RequestType]++; });

    return {
      success: true,
      data: {
        pending_count: pendingRes.data?.length ?? 0,
        overdue_count: overdueRes.count ?? 0,
        escalated_count: escalatedRes.count ?? 0,
        completed_today: completedRes.count ?? 0,
        pending_by_type: pendingByType,
      },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

export async function getPendingRequests(
  requestType?: RequestType,
  limit = 50,
): Promise<ActionResult<RequestSummary[]>> {
  const { admin, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  try {
    let query = admin
      .from('requests')
      .select(REQUESTER_SELECT)
      .eq('org_id', orgId)
      .eq('status', 'pending')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(limit);

    if (requestType) query = query.eq('request_type', requestType);

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data || []) as unknown as RequestSummary[] };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

export async function getOverdueRequests(): Promise<ActionResult<RequestSummary[]>> {
  const { admin, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  try {
    const { data, error } = await admin
      .from('requests')
      .select(REQUESTER_SELECT)
      .eq('org_id', orgId)
      .eq('status', 'pending')
      .not('due_date', 'is', null)
      .lt('due_date', new Date().toISOString())
      .order('due_date', { ascending: true });

    if (error) return { success: false, error: error.message };
    return { success: true, data: (data || []) as unknown as RequestSummary[] };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

export async function getEscalatedRequests(): Promise<ActionResult<RequestSummary[]>> {
  const { admin, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  try {
    const { data, error } = await admin
      .from('requests')
      .select(REQUESTER_SELECT)
      .eq('org_id', orgId)
      .eq('status', 'escalated')
      .order('created_at', { ascending: false });

    if (error) return { success: false, error: error.message };
    return { success: true, data: (data || []) as unknown as RequestSummary[] };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

export async function getRecentlyCompleted(limit = 20): Promise<ActionResult<RequestSummary[]>> {
  const { admin, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  try {
    const { data, error } = await admin
      .from('requests')
      .select(REQUESTER_SELECT)
      .eq('org_id', orgId)
      .in('status', ['approved', 'rejected'])
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) return { success: false, error: error.message };
    return { success: true, data: (data || []) as unknown as RequestSummary[] };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ─────────────────────────────────────────────────────────────
// Conflict Detection
// ─────────────────────────────────────────────────────────────

export async function checkMeetingConflicts(
  startTime: string,
  endTime: string,
  requiredAttendees: string[],
): Promise<ActionResult<{ has_conflicts: boolean; conflicts: Array<{ user_id: string; event: string }> }>> {
  const { admin } = await getCtx();

  try {
    if (!requiredAttendees.length) return { success: true, data: { has_conflicts: false, conflicts: [] } };

    const { data, error } = await admin
      .from('calendar_events')
      .select('id,title,user_id,start_time,end_time')
      .in('user_id', requiredAttendees)
      .lt('start_time', endTime)
      .gt('end_time', startTime);

    if (error) return { success: false, error: error.message };

    const conflicts = data?.map(c => ({ user_id: c.user_id, event: c.title })) || [];
    return { success: true, data: { has_conflicts: conflicts.length > 0, conflicts } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}
