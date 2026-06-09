'use server';

import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import { Resend } from 'resend';
import type { ActionResult } from '@/types/app';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type OnboardingStage =
  | 'pre_hire' | 'documents' | 'orientation'
  | 'training' | 'manager_review' | 'completed';

export type OnboardingStatus = 'active' | 'on_hold' | 'completed' | 'cancelled';

export type TaskStatus   = 'pending' | 'in_progress' | 'completed' | 'skipped' | 'blocked';
export type TaskType     = 'document' | 'training' | 'meeting' | 'action' | 'hr' | 'it' | 'compliance';
export type TaskCategory = 'required' | 'optional';
export type DocStatus    = 'pending' | 'uploaded' | 'verified' | 'rejected';
export type DocType      = 'contract' | 'certification' | 'policy' | 'id' | 'tax_form' | 'emergency_contact' | 'other';
export type MeetingType  = 'orientation' | 'one_on_one' | 'team_intro' | 'manager_review' | 'training' | 'it_setup' | 'hr_review';
export type MeetingStatus= 'scheduled' | 'completed' | 'cancelled' | 'rescheduled';

export interface OnboardingTemplate {
  id: string;
  name: string;
  role_type: string;
  description: string | null;
  color: string;
  is_system: boolean;
  default_tasks: Array<{
    title: string; stage: OnboardingStage; task_type: TaskType;
    category: TaskCategory; sort_order: number;
  }>;
  doc_requirements: Array<{
    doc_type: DocType; name: string; required: boolean;
  }>;
}

export interface OnboardingRecord {
  id: string;
  org_id: string;
  hospital_id: string | null;
  employee_id: string;
  template_id: string | null;
  stage: OnboardingStage;
  status: OnboardingStatus;
  manager_id: string | null;
  hr_manager_id: string | null;
  start_date: string | null;
  target_completion_date: string | null;
  completed_at: string | null;
  progress_pct: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  employeeName?: string;
  employeeEmail?: string;
  employeeAvatar?: string | null;
  employeeJobTitle?: string | null;
  hospitalName?: string | null;
  hospitalColor?: string | null;
  managerName?: string | null;
  hrManagerName?: string | null;
  taskCount?: number;
  completedCount?: number;
}

export interface OnboardingTask {
  id: string;
  org_id: string;
  record_id: string;
  title: string;
  description: string | null;
  category: TaskCategory;
  task_type: TaskType;
  stage: OnboardingStage;
  status: TaskStatus;
  due_date: string | null;
  assigned_to: string | null;
  completed_by: string | null;
  completed_at: string | null;
  sort_order: number;
  reference_id: string | null;
  created_at: string;
  updated_at: string;
  assigneeName?: string | null;
  completedByName?: string | null;
}

export interface OnboardingDocument {
  id: string;
  org_id: string;
  record_id: string;
  employee_id: string;
  doc_type: DocType;
  name: string;
  storage_path: string | null;
  file_size: number | null;
  file_type: string | null;
  status: DocStatus;
  notes: string | null;
  uploaded_by: string | null;
  verified_by: string | null;
  verified_at: string | null;
  created_at: string;
  uploaderName?: string | null;
  verifierName?: string | null;
  ocr_text?: string | null;
  rejection_reason?: string | null;
  public_url?: string | null;
}

export interface OnboardingMeeting {
  id: string;
  org_id: string;
  record_id: string;
  title: string;
  meeting_type: MeetingType;
  scheduled_at: string | null;
  duration_mins: number;
  location: string | null;
  meeting_url: string | null;
  attendees: string[];
  notes: string | null;
  status: MeetingStatus;
  calendar_event_id: string | null;
  created_at: string;
}

export interface OnboardingActivity {
  id: string;
  record_id: string;
  user_id: string | null;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
  userName?: string | null;
}

export interface OnboardingStats {
  total: number;
  active: number;
  completed: number;
  pendingReview: number;
  overdue: number;
  byStage: Record<OnboardingStage, number>;
}

export interface CreateRecordInput {
  employee_id: string;
  hospital_id?: string | null;
  template_id?: string | null;
  manager_id?: string | null;
  hr_manager_id?: string | null;
  start_date?: string | null;
  target_completion_date?: string | null;
  notes?: string | null;
}

export interface UpdateRecordInput {
  stage?: OnboardingStage;
  status?: OnboardingStatus;
  manager_id?: string | null;
  hr_manager_id?: string | null;
  start_date?: string | null;
  target_completion_date?: string | null;
  notes?: string | null;
}

export interface CreateTaskInput {
  record_id: string;
  title: string;
  description?: string | null;
  category?: TaskCategory;
  task_type?: TaskType;
  stage?: OnboardingStage;
  due_date?: string | null;
  assigned_to?: string | null;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  due_date?: string | null;
  assigned_to?: string | null;
}

export interface CreateMeetingInput {
  record_id: string;
  title: string;
  meeting_type: MeetingType;
  scheduled_at?: string | null;
  duration_mins?: number;
  location?: string | null;
  meeting_url?: string | null;
  attendees?: string[];
  notes?: string | null;
}

// ─────────────────────────────────────────────────────────────
// Context helper
// ─────────────────────────────────────────────────────────────

async function getCtx() {
  const supabase = await createSupabaseServerClient();
  const admin    = createSupabaseAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, admin, user: null, orgId: null };
  const { data: p } = await admin.from('profiles').select('org_id').eq('id', user.id).single();
  return { supabase, admin, user, orgId: p?.org_id ?? null };
}

// ─────────────────────────────────────────────────────────────
// Email helper
// ─────────────────────────────────────────────────────────────

interface EmailLog {
  org_id: string;
  user_id: string;
  recipient_email: string;
  event_type: string;
  subject: string;
  status: 'sent' | 'failed';
  error_message?: string;
  reference_id?: string;
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  orgId: string,
  userId: string,
  eventType: string,
  referenceId?: string,
) {
  const adminClient = createSupabaseAdminClient();
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.FROM_EMAIL || 'onboarding@vetOS.local';

  const logEntry: EmailLog = {
    org_id: orgId,
    user_id: userId,
    recipient_email: to,
    event_type: eventType,
    subject,
    status: 'sent',
    reference_id: referenceId,
  };

  if (!apiKey) {
    logEntry.status = 'failed';
    logEntry.error_message = 'RESEND_API_KEY not configured';
    try {
      await adminClient.from('email_logs').insert(logEntry);
    } catch { /* ignore log failure */ }
    return false;
  }

  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: fromEmail,
      to,
      subject,
      html,
    });

    try {
      await adminClient.from('email_logs').insert(logEntry);
    } catch { /* ignore log failure */ }
    return true;
  } catch (e) {
    logEntry.status = 'failed';
    logEntry.error_message = e instanceof Error ? e.message : 'Unknown error';
    try {
      await adminClient.from('email_logs').insert(logEntry);
    } catch { /* ignore log failure */ }
    console.warn(`Email send failed for ${eventType}:`, e);
    return false;
  }
}

async function logActivity(
  orgId: string,
  recordId: string,
  userId: string,
  action: string,
  details?: Record<string, unknown>,
) {
  try {
    const adminClient = createSupabaseAdminClient();
    await adminClient.from('onboarding_activity').insert({
      org_id: orgId, record_id: recordId, user_id: userId, action, details: details ?? {},
    });
  } catch { /* audit log must never break main flow */ }
}

// ─────────────────────────────────────────────────────────────
// Read: Dashboard
// ─────────────────────────────────────────────────────────────

export async function getOnboardingDashboard(): Promise<ActionResult<{
  stats: OnboardingStats;
  records: OnboardingRecord[];
}>> {
  const { admin, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const { data: records, error } = await admin
    .from('onboarding_records')
    .select(`
      id,org_id,hospital_id,employee_id,template_id,stage,status,
      manager_id,hr_manager_id,start_date,target_completion_date,
      completed_at,progress_pct,notes,created_at,updated_at,
      employee:employee_id(first_name,last_name,email,avatar_url,job_title),
      hospital:hospital_id(name,color),
      manager:manager_id(first_name,last_name),
      hr_manager:hr_manager_id(first_name,last_name)
    `)
    .eq('org_id', orgId)
    .order('updated_at', { ascending: false });

  if (error) return { success: false, error: error.message };

  // Task counts per record
  const rids = (records ?? []).map(r => r.id);
  const { data: taskRows } = rids.length
    ? await admin.from('onboarding_tasks').select('record_id,status').in('record_id', rids)
    : { data: [] };

  const taskMap = new Map<string, { total: number; done: number }>();
  (taskRows ?? []).forEach((t: any) => {
    const cur = taskMap.get(t.record_id) ?? { total: 0, done: 0 };
    cur.total += 1;
    if (t.status === 'completed') cur.done += 1;
    taskMap.set(t.record_id, cur);
  });

  const today = new Date().toISOString().slice(0, 10);

  const mapped: OnboardingRecord[] = (records ?? []).map((r: any) => {
    const tc = taskMap.get(r.id) ?? { total: 0, done: 0 };
    const pct = tc.total > 0 ? Math.round((tc.done / tc.total) * 100) : 0;
    return {
      ...r,
      employeeName:    `${r.employee?.first_name} ${r.employee?.last_name}`,
      employeeEmail:   r.employee?.email ?? null,
      employeeAvatar:  r.employee?.avatar_url ?? null,
      employeeJobTitle:r.employee?.job_title ?? null,
      hospitalName:    r.hospital?.name ?? null,
      hospitalColor:   r.hospital?.color ?? null,
      managerName:     r.manager   ? `${r.manager.first_name} ${r.manager.last_name}` : null,
      hrManagerName:   r.hr_manager? `${r.hr_manager.first_name} ${r.hr_manager.last_name}` : null,
      taskCount:       tc.total,
      completedCount:  tc.done,
      progress_pct:    pct,
    };
  });

  const stats: OnboardingStats = {
    total:        mapped.length,
    active:       mapped.filter(r => r.status === 'active' && r.stage !== 'completed').length,
    completed:    mapped.filter(r => r.status === 'completed' || r.stage === 'completed').length,
    pendingReview:mapped.filter(r => r.stage === 'manager_review').length,
    overdue:      mapped.filter(r =>
      r.status === 'active' &&
      r.target_completion_date &&
      r.target_completion_date < today &&
      r.stage !== 'completed'
    ).length,
    byStage: {
      pre_hire:       mapped.filter(r => r.stage === 'pre_hire').length,
      documents:      mapped.filter(r => r.stage === 'documents').length,
      orientation:    mapped.filter(r => r.stage === 'orientation').length,
      training:       mapped.filter(r => r.stage === 'training').length,
      manager_review: mapped.filter(r => r.stage === 'manager_review').length,
      completed:      mapped.filter(r => r.stage === 'completed').length,
    },
  };

  return { success: true, data: { stats, records: mapped } };
}

// ─────────────────────────────────────────────────────────────
// Read: Single record
// ─────────────────────────────────────────────────────────────

export async function getOnboardingRecord(employeeId: string): Promise<ActionResult<OnboardingRecord>> {
  const { admin, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const { data, error } = await admin
    .from('onboarding_records')
    .select(`
      id,org_id,hospital_id,employee_id,template_id,stage,status,
      manager_id,hr_manager_id,start_date,target_completion_date,
      completed_at,progress_pct,notes,created_at,updated_at,
      employee:employee_id(first_name,last_name,email,avatar_url,job_title),
      hospital:hospital_id(name,color),
      manager:manager_id(first_name,last_name),
      hr_manager:hr_manager_id(first_name,last_name)
    `)
    .eq('org_id', orgId)
    .eq('employee_id', employeeId)
    .single();

  if (error) return { success: false, error: error.message };

  const r: any = data;
  return {
    success: true,
    data: {
      ...r,
      employeeName:    `${r.employee?.first_name} ${r.employee?.last_name}`,
      employeeEmail:   r.employee?.email ?? null,
      employeeAvatar:  r.employee?.avatar_url ?? null,
      employeeJobTitle:r.employee?.job_title ?? null,
      hospitalName:    r.hospital?.name ?? null,
      hospitalColor:   r.hospital?.color ?? null,
      managerName:     r.manager   ? `${r.manager.first_name} ${r.manager.last_name}` : null,
      hrManagerName:   r.hr_manager? `${r.hr_manager.first_name} ${r.hr_manager.last_name}` : null,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Read: Tasks / Docs / Meetings / Activity
// ─────────────────────────────────────────────────────────────

export async function getOnboardingTasks(recordId: string): Promise<ActionResult<OnboardingTask[]>> {
  const { admin, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const { data, error } = await admin
    .from('onboarding_tasks')
    .select(`
      id,org_id,record_id,title,description,category,task_type,stage,status,
      due_date,assigned_to,completed_by,completed_at,sort_order,reference_id,
      created_at,updated_at,
      assignee:assigned_to(first_name,last_name),
      completer:completed_by(first_name,last_name)
    `)
    .eq('record_id', recordId)
    .order('sort_order');

  if (error) return { success: false, error: error.message };

  const mapped = (data ?? []).map((t: any) => ({
    ...t,
    assigneeName:    t.assignee  ? `${t.assignee.first_name} ${t.assignee.last_name}` : null,
    completedByName: t.completer ? `${t.completer.first_name} ${t.completer.last_name}` : null,
  }));

  return { success: true, data: mapped };
}

export async function getOnboardingDocuments(recordId: string): Promise<ActionResult<OnboardingDocument[]>> {
  const { admin, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const { data, error } = await admin
    .from('onboarding_documents')
    .select(`
      id,org_id,record_id,employee_id,doc_type,name,storage_path,
      file_size,file_type,status,notes,uploaded_by,verified_by,verified_at,created_at,
      uploader:uploaded_by(first_name,last_name),
      verifier:verified_by(first_name,last_name)
    `)
    .eq('record_id', recordId)
    .order('created_at');

  if (error) return { success: false, error: error.message };

  const mapped = (data ?? []).map((d: any) => ({
    ...d,
    uploaderName: d.uploader ? `${d.uploader.first_name} ${d.uploader.last_name}` : null,
    verifierName: d.verifier ? `${d.verifier.first_name} ${d.verifier.last_name}` : null,
  }));

  return { success: true, data: mapped };
}

export async function getOnboardingMeetings(recordId: string): Promise<ActionResult<OnboardingMeeting[]>> {
  const { admin, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const { data, error } = await admin
    .from('onboarding_meetings')
    .select('*')
    .eq('record_id', recordId)
    .order('scheduled_at', { ascending: true });

  if (error) return { success: false, error: error.message };
  return { success: true, data: data ?? [] };
}

export async function getOnboardingActivity(recordId: string): Promise<ActionResult<OnboardingActivity[]>> {
  const { admin, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const { data, error } = await admin
    .from('onboarding_activity')
    .select(`id,record_id,user_id,action,details,created_at, actor:user_id(first_name,last_name)`)
    .eq('record_id', recordId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return { success: false, error: error.message };

  const mapped = (data ?? []).map((a: any) => ({
    ...a,
    userName: a.actor ? `${a.actor.first_name} ${a.actor.last_name}` : null,
  }));

  return { success: true, data: mapped };
}

// ─────────────────────────────────────────────────────────────
// Read: Templates + Employees (for selects)
// ─────────────────────────────────────────────────────────────

export async function getOnboardingTemplates(): Promise<ActionResult<OnboardingTemplate[]>> {
  const { admin, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const { data, error } = await admin
    .from('onboarding_templates')
    .select('*')
    .or(`is_system.eq.true,org_id.eq.${orgId}`)
    .eq('is_active', true)
    .order('name');

  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []).map((t: any) => ({
    ...t,
    default_tasks:    Array.isArray(t.default_tasks)    ? t.default_tasks    : [],
    doc_requirements: Array.isArray(t.doc_requirements) ? t.doc_requirements : [],
  })) };
}

export async function getOrgEmployees(): Promise<ActionResult<Array<{
  id: string; name: string; email: string; jobTitle: string | null; avatar_url: string | null; hasRecord: boolean;
}>>> {
  const { admin, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const [{ data: profiles }, { data: existing }] = await Promise.all([
    admin.from('profiles').select('id,first_name,last_name,email,job_title,avatar_url').eq('org_id', orgId).eq('is_active', true).order('first_name'),
    admin.from('onboarding_records').select('employee_id').eq('org_id', orgId),
  ]);

  const existingSet = new Set((existing ?? []).map((r: any) => r.employee_id));

  return {
    success: true,
    data: (profiles ?? []).map((p: any) => ({
      id:        p.id,
      name:      `${p.first_name} ${p.last_name}`,
      email:     p.email,
      jobTitle:  p.job_title ?? null,
      avatar_url:p.avatar_url ?? null,
      hasRecord: existingSet.has(p.id),
    })),
  };
}

export async function getOrgProfiles(): Promise<ActionResult<Array<{ id: string; name: string }>>> {
  const { admin, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const { data, error } = await admin.from('profiles').select('id,first_name,last_name').eq('org_id', orgId).eq('is_active', true).order('first_name');
  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []).map((p: any) => ({ id: p.id, name: `${p.first_name} ${p.last_name}` })) };
}

// ─────────────────────────────────────────────────────────────
// Mutations — Records
// ─────────────────────────────────────────────────────────────

export async function createOnboardingRecord(input: CreateRecordInput): Promise<ActionResult<OnboardingRecord>> {
  const { admin, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const { data: record, error } = await admin
    .from('onboarding_records')
    .insert({
      org_id:                 orgId,
      employee_id:            input.employee_id,
      hospital_id:            input.hospital_id ?? null,
      template_id:            input.template_id ?? null,
      manager_id:             input.manager_id ?? null,
      hr_manager_id:          input.hr_manager_id ?? null,
      start_date:             input.start_date ?? null,
      target_completion_date: input.target_completion_date ?? null,
      notes:                  input.notes ?? null,
      created_by:             user.id,
    })
    .select('id,org_id')
    .single();

  if (error) return { success: false, error: error.message };

  // Bootstrap tasks from template
  if (input.template_id) {
    const { data: tpl } = await admin
      .from('onboarding_templates')
      .select('default_tasks,doc_requirements')
      .eq('id', input.template_id)
      .single();

    if (tpl?.default_tasks && Array.isArray(tpl.default_tasks)) {
      const taskRows = (tpl.default_tasks as any[]).map(t => ({
        org_id:     orgId,
        record_id:  record.id,
        title:      t.title,
        stage:      t.stage ?? 'pre_hire',
        task_type:  t.task_type ?? 'action',
        category:   t.category ?? 'required',
        sort_order: t.sort_order ?? 0,
        status:     'pending',
      }));
      try { await admin.from('onboarding_tasks').insert(taskRows); } catch { /* ignore */ }
    }

    if (tpl?.doc_requirements && Array.isArray(tpl.doc_requirements)) {
      const docRows = (tpl.doc_requirements as any[]).map(d => ({
        org_id:     orgId,
        record_id:  record.id,
        employee_id:input.employee_id,
        doc_type:   d.doc_type ?? 'other',
        name:       d.name,
        status:     'pending',
      }));
      try { await admin.from('onboarding_documents').insert(docRows); } catch { /* ignore */ }
    }
  }

  // Automatically send invitation
  try {
    await sendOnboardingInvitation(record.id);
  } catch (e) {
    console.warn('Invitation sending failed:', e);
  }

  await logActivity(orgId, record.id, user.id, 'created onboarding record');
  return getOnboardingRecord(input.employee_id);
}

export async function updateOnboardingRecord(id: string, input: UpdateRecordInput): Promise<ActionResult<OnboardingRecord>> {
  const { admin, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const update: Record<string, unknown> = { ...input };
  if (input.stage === 'completed') update.completed_at = new Date().toISOString();

  const { error } = await admin.from('onboarding_records').update(update).eq('id', id);
  if (error) return { success: false, error: error.message };

  // Fetch employee_id to return record
  const { data: rec } = await admin.from('onboarding_records').select('employee_id,org_id').eq('id', id).single();
  if (!rec) return { success: false, error: 'Record not found' };

  await logActivity(rec.org_id, id, user.id, `updated stage to ${input.stage ?? 'unknown'}`, input as Record<string, unknown>);
  return getOnboardingRecord(rec.employee_id);
}

export async function deleteOnboardingRecord(id: string): Promise<ActionResult<void>> {
  const { admin, user } = await getCtx();
  if (!user) return { success: false, error: 'Unauthorized' };
  const { error } = await admin.from('onboarding_records').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true, data: undefined };
}

// ─────────────────────────────────────────────────────────────
// Mutations — Tasks
// ─────────────────────────────────────────────────────────────

export async function createOnboardingTask(input: CreateTaskInput): Promise<ActionResult<OnboardingTask>> {
  const { admin, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const { data: last } = await admin
    .from('onboarding_tasks')
    .select('sort_order')
    .eq('record_id', input.record_id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single();

  const { data, error } = await admin
    .from('onboarding_tasks')
    .insert({
      org_id:      orgId,
      record_id:   input.record_id,
      title:       input.title,
      description: input.description ?? null,
      category:    input.category    ?? 'required',
      task_type:   input.task_type   ?? 'action',
      stage:       input.stage       ?? 'pre_hire',
      due_date:    input.due_date    ?? null,
      assigned_to: input.assigned_to ?? null,
      sort_order:  (last?.sort_order ?? 0) + 1,
      status:      'pending',
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as OnboardingTask };
}

export async function updateOnboardingTask(id: string, input: UpdateTaskInput): Promise<ActionResult<OnboardingTask>> {
  const { admin, user } = await getCtx();
  if (!user) return { success: false, error: 'Unauthorized' };

  const update: Record<string, unknown> = { ...input };
  if (input.status === 'completed') {
    update.completed_at = new Date().toISOString();
    update.completed_by = user.id;
  } else if (input.status) {
    update.completed_at = null;
    update.completed_by = null;
  }

  const { data, error } = await admin
    .from('onboarding_tasks')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  // Recalculate record progress
  const task = data as OnboardingTask;
  const { data: allTasks } = await admin
    .from('onboarding_tasks')
    .select('status')
    .eq('record_id', task.record_id);

  if (allTasks) {
    const total = allTasks.length;
    const done  = allTasks.filter((t: any) => t.status === 'completed').length;
    const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
    await admin.from('onboarding_records').update({ progress_pct: pct }).eq('id', task.record_id);
  }

  return { success: true, data: task };
}

export async function deleteOnboardingTask(id: string): Promise<ActionResult<void>> {
  const { admin, user } = await getCtx();
  if (!user) return { success: false, error: 'Unauthorized' };
  const { error } = await admin.from('onboarding_tasks').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true, data: undefined };
}

// ─────────────────────────────────────────────────────────────
// Mutations — Documents
// ─────────────────────────────────────────────────────────────

export async function updateDocumentStatus(id: string, status: DocStatus, notes?: string): Promise<ActionResult<void>> {
  const { admin, user } = await getCtx();
  if (!user) return { success: false, error: 'Unauthorized' };

  const update: Record<string, unknown> = { status };
  if (notes)                  update.notes = notes;
  if (status === 'verified') { update.verified_by = user.id; update.verified_at = new Date().toISOString(); }

  const { error } = await admin.from('onboarding_documents').update(update).eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true, data: undefined };
}

export async function addDocument(recordId: string, employeeId: string, input: {
  doc_type: DocType; name: string; notes?: string;
}): Promise<ActionResult<OnboardingDocument>> {
  const { admin, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const { data, error } = await admin
    .from('onboarding_documents')
    .insert({
      org_id:      orgId,
      record_id:   recordId,
      employee_id: employeeId,
      doc_type:    input.doc_type,
      name:        input.name,
      notes:       input.notes ?? null,
      status:      'pending',
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as OnboardingDocument };
}

// ─────────────────────────────────────────────────────────────
// Mutations — Meetings
// ─────────────────────────────────────────────────────────────

export async function createMeeting(input: CreateMeetingInput): Promise<ActionResult<OnboardingMeeting>> {
  const { admin, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const { data, error } = await admin
    .from('onboarding_meetings')
    .insert({
      org_id:        orgId,
      record_id:     input.record_id,
      title:         input.title,
      meeting_type:  input.meeting_type,
      scheduled_at:  input.scheduled_at ?? null,
      duration_mins: input.duration_mins ?? 60,
      location:      input.location   ?? null,
      meeting_url:   input.meeting_url ?? null,
      attendees:     input.attendees   ?? [],
      notes:         input.notes       ?? null,
      status:        'scheduled',
      created_by:    user.id,
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as OnboardingMeeting };
}

export async function updateMeetingStatus(id: string, status: MeetingStatus): Promise<ActionResult<void>> {
  const { admin, user } = await getCtx();
  if (!user) return { success: false, error: 'Unauthorized' };
  const { error } = await admin.from('onboarding_meetings').update({ status }).eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true, data: undefined };
}

// ─────────────────────────────────────────────────────────────
// Document Approval Workflow
// ─────────────────────────────────────────────────────────────

export async function approveDocument(docId: string): Promise<ActionResult<void>> {
  const { admin, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const { data: doc, error: docError } = await admin
    .from('onboarding_documents')
    .select('id,record_id,employee_id,name')
    .eq('id', docId)
    .single();

  if (docError || !doc) return { success: false, error: 'Document not found' };

  const { error: updateError } = await admin
    .from('onboarding_documents')
    .update({
      status: 'verified',
      verified_by: user.id,
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', docId);

  if (updateError) return { success: false, error: updateError.message };

  // Get employee email
  const { data: emp } = await admin
    .from('profiles')
    .select('email,first_name')
    .eq('id', doc.employee_id)
    .single();

  // Send in-app notification
  try {
    await admin.from('notifications').insert({
      user_id: doc.employee_id,
      org_id: orgId,
      type: 'document_shared',
      title: 'Document Approved',
      body: `Your ${doc.name} has been approved.`,
      action_url: `/onboarding/${doc.employee_id}?tab=documents`,
    });
  } catch (e) {
    console.warn('Notification failed:', e);
  }

  // Send email notification
  if (emp?.email) {
    const portalUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/onboarding/${doc.employee_id}?tab=documents`;
    await sendEmail(
      emp.email,
      `Document Approved: ${doc.name}`,
      `<p>Hi ${emp.first_name},</p>
        <p>Good news! Your <strong>${doc.name}</strong> has been approved.</p>
        <p><a href="${portalUrl}">View Your Onboarding Portal</a></p>`,
      orgId,
      user.id,
      'document_approved',
      docId,
    );
  }

  // Log activity
  await logActivity(orgId, doc.record_id, user.id, `approved document: ${doc.name}`);

  return { success: true, data: undefined };
}

export async function rejectDocument(docId: string, reason: string): Promise<ActionResult<void>> {
  const { admin, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const { data: doc, error: docError } = await admin
    .from('onboarding_documents')
    .select('id,record_id,employee_id,name')
    .eq('id', docId)
    .single();

  if (docError || !doc) return { success: false, error: 'Document not found' };

  const { error: updateError } = await admin
    .from('onboarding_documents')
    .update({
      status: 'rejected',
      rejection_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', docId);

  if (updateError) return { success: false, error: updateError.message };

  // Get employee email
  const { data: emp } = await admin
    .from('profiles')
    .select('email,first_name')
    .eq('id', doc.employee_id)
    .single();

  // Send in-app notification
  try {
    await admin.from('notifications').insert({
      user_id: doc.employee_id,
      org_id: orgId,
      type: 'system_announcement',
      title: 'Document Needs Revision',
      body: `${doc.name} was not approved. Reason: ${reason}`,
      action_url: `/onboarding/${doc.employee_id}?tab=documents`,
    });
  } catch (e) {
    console.warn('Notification failed:', e);
  }

  // Send email notification
  if (emp?.email) {
    const portalUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/onboarding/${doc.employee_id}?tab=documents`;
    await sendEmail(
      emp.email,
      `Document Revision Needed: ${doc.name}`,
      `<p>Hi ${emp.first_name},</p>
        <p>Your <strong>${doc.name}</strong> was not approved and needs revision.</p>
        <p><strong>Reason:</strong> ${reason}</p>
        <p>Please upload a revised version of this document.</p>
        <p><a href="${portalUrl}">Go to Your Onboarding Portal</a></p>`,
      orgId,
      user.id,
      'document_rejected',
      docId,
    );
  }

  // Log activity
  await logActivity(orgId, doc.record_id, user.id, `rejected document: ${doc.name}`, { reason });

  return { success: true, data: undefined };
}

// ─────────────────────────────────────────────────────────────
// Invitation & Notifications
// ─────────────────────────────────────────────────────────────

async function sendInvitationInternal(
  recordId: string,
  userId: string,
  orgId: string,
): Promise<ActionResult<void>> {
  const adminClient = createSupabaseAdminClient();
  const { data: record, error: recError } = await adminClient
    .from('onboarding_records')
    .select('id,employee_id,org_id')
    .eq('id', recordId)
    .single();

  if (recError || !record) return { success: false, error: 'Record not found' };

  // Get employee email
  const { data: emp } = await adminClient
    .from('profiles')
    .select('email,first_name')
    .eq('id', record.employee_id)
    .single();

  // Insert in-app notification
  try {
    await adminClient.from('notifications').insert({
      user_id: record.employee_id,
      org_id: orgId,
      type: 'system_announcement',
      title: 'Your Onboarding Has Started',
      body: 'Welcome! Please complete the onboarding steps in your portal.',
      action_url: `/onboarding/${record.employee_id}`,
    });
  } catch (e) {
    console.warn('Notification insert failed:', e);
  }

  // Send email invitation
  if (emp?.email) {
    const portalUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/onboarding/${record.employee_id}`;
    await sendEmail(
      emp.email,
      'Welcome to VetOS — Your Onboarding Portal',
      `<p>Hi ${emp.first_name},</p>
        <p>Your onboarding has started! Please log in to your VetOS portal and complete the onboarding steps.</p>
        <p><a href="${portalUrl}">Go to Your Onboarding Portal</a></p>`,
      orgId,
      userId,
      'invitation_sent',
      recordId,
    );
  }

  // Update record with invitation sent timestamp
  const { error: updateError } = await adminClient
    .from('onboarding_records')
    .update({ invitation_sent_at: new Date().toISOString() })
    .eq('id', recordId);

  if (updateError) return { success: false, error: updateError.message };

  // Log activity
  await logActivity(orgId, recordId, userId, 'sent onboarding invitation');

  return { success: true, data: undefined };
}

export async function sendOnboardingInvitation(recordId: string): Promise<ActionResult<void>> {
  const { user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };
  return sendInvitationInternal(recordId, user.id, orgId);
}

export async function resendOnboardingInvitation(recordId: string): Promise<ActionResult<void>> {
  const { user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };
  return sendInvitationInternal(recordId, user.id, orgId);
}

// ─────────────────────────────────────────────────────────────
// Training Integration
// ─────────────────────────────────────────────────────────────

export async function getOnboardingTraining(recordId: string): Promise<ActionResult<{
  trainingTasks: OnboardingTask[];
}>> {
  const { admin, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const { data: record } = await admin
    .from('onboarding_records')
    .select('employee_id')
    .eq('id', recordId)
    .single();

  if (!record) return { success: false, error: 'Record not found' };

  const { data: tasks, error } = await admin
    .from('onboarding_tasks')
    .select('*')
    .eq('record_id', recordId)
    .eq('task_type', 'training')
    .order('sort_order');

  if (error) return { success: false, error: error.message };

  return { success: true, data: { trainingTasks: (tasks ?? []) as OnboardingTask[] } };
}

// ─────────────────────────────────────────────────────────────
// Compliance Status
// ─────────────────────────────────────────────────────────────

export interface ComplianceStatus {
  totalDocs: number;
  verifiedDocs: number;
  requiredDocs: number;
  requiredVerified: number;
  totalTasks: number;
  completedTasks: number;
  requiredTasks: number;
  requiredCompleted: number;
  overallScore: number;
  status: 'complete' | 'in_progress' | 'at_risk';
}

export async function getComplianceStatus(recordId: string): Promise<ActionResult<ComplianceStatus>> {
  const { admin, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  // Get all docs
  const { data: docs, error: docError } = await admin
    .from('onboarding_documents')
    .select('*')
    .eq('record_id', recordId);

  if (docError) return { success: false, error: docError.message };

  // Get all tasks
  const { data: tasks, error: taskError } = await admin
    .from('onboarding_tasks')
    .select('*')
    .eq('record_id', recordId);

  if (taskError) return { success: false, error: taskError.message };

  const docList = docs ?? [];
  const taskList = tasks ?? [];

  const totalDocs = docList.length;
  const verifiedDocs = docList.filter(d => d.status === 'verified').length;
  const requiredDocs = docList.filter(d => d.status !== 'pending' || docList.length === 0 ? 0 : 1).length;
  const requiredVerified = docList.filter(d => d.status === 'verified').length;

  const totalTasks = taskList.length;
  const completedTasks = taskList.filter(t => t.status === 'completed').length;
  const requiredTasks = taskList.filter(t => t.category === 'required').length;
  const requiredCompleted = taskList.filter(t => t.category === 'required' && t.status === 'completed').length;

  // Calculate overall score: (docs verified + tasks completed) / (total docs + total tasks)
  const total = totalDocs + totalTasks;
  const done = verifiedDocs + completedTasks;
  const overallScore = total > 0 ? Math.round((done / total) * 100) : 100;

  const status: 'complete' | 'in_progress' | 'at_risk' =
    overallScore === 100 ? 'complete'
    : overallScore >= 70 ? 'in_progress'
    : 'at_risk';

  return {
    success: true,
    data: {
      totalDocs,
      verifiedDocs,
      requiredDocs,
      requiredVerified,
      totalTasks,
      completedTasks,
      requiredTasks,
      requiredCompleted,
      overallScore,
      status,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Template CRUD
// ─────────────────────────────────────────────────────────────

export interface CreateTemplateInput {
  name: string;
  role_type: string;
  description?: string | null;
  color?: string;
  default_tasks?: Array<{
    title: string;
    stage: OnboardingStage;
    task_type: TaskType;
    category: TaskCategory;
    sort_order: number;
  }>;
  doc_requirements?: Array<{
    doc_type: DocType;
    name: string;
    required?: boolean;
  }>;
}

export async function createOnboardingTemplate(input: CreateTemplateInput): Promise<ActionResult<OnboardingTemplate>> {
  const { admin, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const { data, error } = await admin
    .from('onboarding_templates')
    .insert({
      org_id: orgId,
      name: input.name,
      role_type: input.role_type,
      description: input.description ?? null,
      color: input.color ?? '#f97316',
      default_tasks: input.default_tasks ?? [],
      doc_requirements: input.doc_requirements ?? [],
      is_system: false,
      is_active: true,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as OnboardingTemplate };
}

export async function updateOnboardingTemplate(id: string, input: Partial<CreateTemplateInput>): Promise<ActionResult<OnboardingTemplate>> {
  const { admin, user } = await getCtx();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data, error } = await admin
    .from('onboarding_templates')
    .update(input)
    .eq('id', id)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as OnboardingTemplate };
}

export async function deleteOnboardingTemplate(id: string): Promise<ActionResult<void>> {
  const { admin, user } = await getCtx();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { error } = await admin.from('onboarding_templates').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true, data: undefined };
}

// ─────────────────────────────────────────────────────────────
// Meeting + Calendar Integration
// ─────────────────────────────────────────────────────────────

export async function createMeetingWithCalendarEvent(
  input: CreateMeetingInput & { addToCalendar?: boolean; hospitalId?: string },
): Promise<ActionResult<OnboardingMeeting>> {
  const meetingRes = await createMeeting(input);
  if (!meetingRes.success) return meetingRes;

  if (input.addToCalendar && input.scheduled_at) {
    try {
      const { createCalendarEvent } = await import('./calendar');
      const startTime = new Date(input.scheduled_at);
      const endTime   = new Date(startTime.getTime() + (input.duration_mins ?? 60) * 60_000);
      const calRes = await createCalendarEvent({
        title:        input.title,
        description:  input.notes ?? null,
        event_type:   'onboarding',
        start_time:   startTime.toISOString(),
        end_time:     endTime.toISOString(),
        is_all_day:   false,
        location:     input.location     ?? null,
        meeting_link: input.meeting_url  ?? null,
        hospital_id:  input.hospitalId   ?? null,
        priority:     'medium',
        color:        null,
        is_recurring: false,
        recurrence_rule: null,
      });
      if (calRes.success) {
        const adminClient = createSupabaseAdminClient();
        await adminClient.from('onboarding_meetings')
          .update({ calendar_event_id: calRes.data.id })
          .eq('id', meetingRes.data.id);
        return { success: true, data: { ...meetingRes.data, calendar_event_id: calRes.data.id } as OnboardingMeeting };
      }
    } catch {
      // calendar creation failed — meeting still saved
    }
  }

  return meetingRes;
}
