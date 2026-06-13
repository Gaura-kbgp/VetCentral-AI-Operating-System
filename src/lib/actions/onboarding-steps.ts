'use server';

import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

const HR_ROLES = ['super_admin', 'org_admin', 'hospital_admin', 'practice_manager', 'hr'];

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type StepType   = 'hr_action' | 'document_send' | 'employee_upload' | 'approval';
export type StepStatus = 'pending' | 'waiting' | 'completed' | 'verified' | 'skipped';

export interface OnboardingStep {
  id: string;
  record_id: string;
  step_key: string;
  title: string;
  description: string | null;
  step_type: StepType;
  sort_order: number;
  is_required: boolean;
  status: StepStatus;
  document_url: string | null;
  document_name: string | null;
  form_data: Record<string, string>;
  notes: string | null;
  completed_by: string | null;
  completed_at: string | null;
  verified_by: string | null;
  verified_at: string | null;
  completed_by_name?: string | null;
  verified_by_name?: string | null;
}

export interface ShellRecord {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_email: string | null;
  employee_avatar: string | null;
  employee_job_title: string | null;
  employee_department: string | null;
  hospital_id: string | null;
  hospital_name: string | null;
  hospital_color: string | null;
  start_date: string | null;
  status: 'active' | 'on_hold' | 'completed' | 'cancelled';
  progress_pct: number;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────
// Default steps for every new onboarding record
// ─────────────────────────────────────────────────────────────

const DEFAULT_ONBOARDING_STEPS: Array<{
  step_key: string; title: string; description: string;
  step_type: StepType; sort_order: number; is_required: boolean;
}> = [
  { step_key: 'offer_letter',        title: 'Offer Letter',          description: 'Prepare and send the offer letter to the new employee.',     step_type: 'document_send',   sort_order: 1, is_required: true  },
  { step_key: 'offer_letter_sign',   title: 'Offer Letter Signed',   description: 'Employee signs and returns the offer letter.',               step_type: 'employee_upload', sort_order: 2, is_required: true  },
  { step_key: 'joining_letter',      title: 'Joining Letter',        description: 'Prepare and send the joining letter.',                       step_type: 'document_send',   sort_order: 3, is_required: true  },
  { step_key: 'joining_letter_sign', title: 'Joining Letter Signed', description: 'Employee signs and returns the joining letter.',             step_type: 'employee_upload', sort_order: 4, is_required: true  },
  { step_key: 'id_card',             title: 'ID Card Issued',        description: 'Issue employee ID card.',                                    step_type: 'hr_action',       sort_order: 5, is_required: true  },
  { step_key: 'welcome_kit',         title: 'Welcome Kit Issued',    description: 'Issue welcome kit to new employee.',                         step_type: 'hr_action',       sort_order: 6, is_required: true  },
  { step_key: 'system_access',       title: 'System Access Setup',   description: 'Set up email, system accounts, and credentials.',            step_type: 'hr_action',       sort_order: 7, is_required: true  },
  { step_key: 'orientation',         title: 'Orientation Session',   description: 'Complete orientation session with the new employee.',        step_type: 'hr_action',       sort_order: 8, is_required: true  },
  { step_key: 'hr_approval',         title: 'HR Final Approval',     description: 'HR manager reviews and approves the complete onboarding.',   step_type: 'approval',        sort_order: 9, is_required: true  },
];

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

async function getCtx() {
  const supabase = await createSupabaseServerClient();
  const admin    = createSupabaseAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await admin.from('profiles').select('org_id').eq('id', user.id).single();
  if (!profile?.org_id) return null;
  const { data: roles } = await admin.from('user_hospital_roles').select('role').eq('user_id', user.id);
  if (!roles?.some(r => HR_ROLES.includes(r.role))) return null;
  return { user, admin, orgId: profile.org_id as string };
}

async function recomputeProgress(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  recordId: string,
) {
  const { data: steps } = await admin
    .from('onboarding_steps')
    .select('status, is_required')
    .eq('record_id', recordId);

  const required = (steps ?? []).filter(s => s.is_required);
  const done     = required.filter(s => ['completed', 'verified', 'skipped'].includes(s.status));
  const pct      = required.length > 0 ? Math.round((done.length / required.length) * 100) : 0;

  await admin
    .from('onboarding_records')
    .update({ progress_pct: pct, updated_at: new Date().toISOString() })
    .eq('id', recordId);

  return pct;
}

// ─────────────────────────────────────────────────────────────
// Server actions
// ─────────────────────────────────────────────────────────────

export async function getOnboardingShellData(): Promise<{
  ongoing: ShellRecord[];
  onboarded: ShellRecord[];
  error?: string;
}> {
  try {
    const ctx = await getCtx();
    if (!ctx) return { ongoing: [], onboarded: [], error: 'Unauthorized' };
    const { admin, orgId } = ctx;

    const { data: records, error } = await admin
      .from('onboarding_records')
      .select('id, employee_id, hospital_id, status, progress_pct, start_date, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });
    if (error || !records?.length) return { ongoing: [], onboarded: [] };

    const employeeIds = records.map(r => r.employee_id);
    const hospitalIds = [...new Set(records.map(r => r.hospital_id).filter(Boolean) as string[])];

    const [{ data: profiles }, { data: hospitals }] = await Promise.all([
      admin.from('profiles').select('id, first_name, last_name, email, avatar_url, job_title, department').in('id', employeeIds),
      hospitalIds.length > 0
        ? admin.from('hospitals').select('id, name, color').in('id', hospitalIds)
        : { data: [] },
    ]);

    // Step-based progress
    const recordIds = records.map(r => r.id);
    const { data: stepRows } = await admin
      .from('onboarding_steps')
      .select('record_id, status, is_required')
      .in('record_id', recordIds);

    const progressMap = new Map<string, number>();
    if (stepRows?.length) {
      const byRecord = new Map<string, { total: number; done: number }>();
      for (const s of stepRows) {
        if (!s.is_required) continue;
        if (!byRecord.has(s.record_id)) byRecord.set(s.record_id, { total: 0, done: 0 });
        const obj = byRecord.get(s.record_id)!;
        obj.total++;
        if (['completed', 'verified', 'skipped'].includes(s.status)) obj.done++;
      }
      for (const [rId, { total, done }] of byRecord) {
        progressMap.set(rId, total > 0 ? Math.round((done / total) * 100) : 0);
      }
    }

    const profileMap = new Map((profiles ?? []).map(p => [p.id, p]));
    const hospMap    = new Map((hospitals ?? []).map(h => [h.id, h]));

    const toShell = (r: (typeof records)[number]): ShellRecord => {
      const p = profileMap.get(r.employee_id);
      const h = r.hospital_id ? hospMap.get(r.hospital_id) : null;
      return {
        id:                  r.id,
        employee_id:         r.employee_id,
        employee_name:       p ? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() : 'Unknown',
        employee_email:      p?.email       ?? null,
        employee_avatar:     p?.avatar_url  ?? null,
        employee_job_title:  p?.job_title   ?? null,
        employee_department: p?.department  ?? null,
        hospital_id:         r.hospital_id  ?? null,
        hospital_name:       h?.name        ?? null,
        hospital_color:      h?.color       ?? null,
        start_date:          r.start_date   ?? null,
        status:              r.status as ShellRecord['status'],
        progress_pct:        progressMap.get(r.id) ?? r.progress_pct ?? 0,
        created_at:          r.created_at,
      };
    };

    return {
      ongoing:   records.filter(r => r.status === 'active' || r.status === 'on_hold').map(toShell),
      onboarded: records.filter(r => r.status === 'completed').map(toShell),
    };
  } catch (err) {
    return { ongoing: [], onboarded: [], error: err instanceof Error ? err.message : 'Error' };
  }
}

export async function getOnboardingDetail(recordId: string): Promise<{
  record: ShellRecord | null;
  steps: OnboardingStep[];
  error?: string;
}> {
  try {
    const ctx = await getCtx();
    if (!ctx) return { record: null, steps: [], error: 'Unauthorized' };
    const { admin } = ctx;

    const { data: rec } = await admin
      .from('onboarding_records')
      .select('id, org_id, employee_id, hospital_id, status, progress_pct, start_date, created_at')
      .eq('id', recordId)
      .single();
    if (!rec) return { record: null, steps: [], error: 'Not found' };

    const [{ data: profile }, { data: hospital }] = await Promise.all([
      admin.from('profiles').select('id, first_name, last_name, email, avatar_url, job_title, department').eq('id', rec.employee_id).single(),
      rec.hospital_id ? admin.from('hospitals').select('id, name, color').eq('id', rec.hospital_id).single() : { data: null },
    ]);

    const record: ShellRecord = {
      id:                  rec.id,
      employee_id:         rec.employee_id,
      employee_name:       profile ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() : 'Unknown',
      employee_email:      profile?.email      ?? null,
      employee_avatar:     profile?.avatar_url ?? null,
      employee_job_title:  profile?.job_title  ?? null,
      employee_department: profile?.department ?? null,
      hospital_id:         rec.hospital_id     ?? null,
      hospital_name:       hospital?.name      ?? null,
      hospital_color:      hospital?.color     ?? null,
      start_date:          rec.start_date       ?? null,
      status:              rec.status as ShellRecord['status'],
      progress_pct:        rec.progress_pct    ?? 0,
      created_at:          rec.created_at,
    };

    // Seed steps if none exist
    const { data: rawStepsInit, error: stepsSelectErr } = await admin
      .from('onboarding_steps')
      .select('*')
      .eq('record_id', recordId)
      .order('sort_order');

    if (stepsSelectErr) {
      return { record, steps: [], error: `Steps table not found — run migration 026. (${stepsSelectErr.message})` };
    }

    let rawSteps = rawStepsInit;

    if (!rawSteps?.length) {
      const { error: insertErr } = await admin.from('onboarding_steps').insert(
        DEFAULT_ONBOARDING_STEPS.map(s => ({ ...s, record_id: recordId, org_id: rec.org_id }))
      );
      if (insertErr) {
        return { record, steps: [], error: `Failed to seed steps — run migration 026. (${insertErr.message})` };
      }
      const { data: fresh } = await admin
        .from('onboarding_steps').select('*').eq('record_id', recordId).order('sort_order');
      rawSteps = fresh ?? [];
    }

    // Enrich with names
    const pids = [...new Set([
      ...rawSteps.map(s => s.completed_by).filter(Boolean),
      ...rawSteps.map(s => s.verified_by).filter(Boolean),
    ] as string[])];
    const nameMap = new Map<string, string>();
    if (pids.length) {
      const { data: pp } = await admin.from('profiles').select('id, first_name, last_name').in('id', pids);
      for (const p of pp ?? []) nameMap.set(p.id, `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim());
    }

    const steps: OnboardingStep[] = rawSteps.map(s => ({
      ...s,
      form_data:          (s.form_data as Record<string, string>) ?? {},
      completed_by_name:  s.completed_by ? (nameMap.get(s.completed_by) ?? null) : null,
      verified_by_name:   s.verified_by  ? (nameMap.get(s.verified_by)  ?? null) : null,
    }));

    // Update progress_pct on record
    const required = steps.filter(s => s.is_required);
    const done = required.filter(s => ['completed', 'verified', 'skipped'].includes(s.status));
    record.progress_pct = required.length > 0 ? Math.round((done.length / required.length) * 100) : 0;

    return { record, steps };
  } catch (err) {
    return { record: null, steps: [], error: err instanceof Error ? err.message : 'Error' };
  }
}

export async function updateOnboardingStep(
  stepId: string,
  data: {
    status?: StepStatus;
    notes?: string;
    document_url?: string;
    document_name?: string;
    form_data?: Record<string, string>;
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    const ctx = await getCtx();
    if (!ctx) return { success: false, error: 'Unauthorized' };
    const { user, admin } = ctx;

    const patch: Record<string, unknown> = { ...data, updated_at: new Date().toISOString() };

    if (data.status && ['completed', 'waiting', 'verified'].includes(data.status)) {
      patch.completed_by = user.id;
      patch.completed_at = new Date().toISOString();
    }
    if (data.status === 'verified') {
      patch.verified_by = user.id;
      patch.verified_at = new Date().toISOString();
    }

    const { error } = await admin.from('onboarding_steps').update(patch).eq('id', stepId);
    if (error) return { success: false, error: error.message };

    const { data: step } = await admin.from('onboarding_steps').select('record_id').eq('id', stepId).single();
    if (step?.record_id) await recomputeProgress(admin, step.record_id);

    revalidatePath('/dashboard');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Error' };
  }
}

export async function completeOnboarding(recordId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const ctx = await getCtx();
    if (!ctx) return { success: false, error: 'Unauthorized' };
    const { admin } = ctx;

    const { error } = await admin.from('onboarding_records').update({
      status:       'completed',
      stage:        'completed',
      completed_at: new Date().toISOString(),
      progress_pct: 100,
      updated_at:   new Date().toISOString(),
    }).eq('id', recordId);

    if (error) return { success: false, error: error.message };
    revalidatePath('/dashboard');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Error' };
  }
}
