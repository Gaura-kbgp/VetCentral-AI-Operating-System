'use server';

import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { VET_ROLES } from './onboarding-wizard-types';
import type {
  WizardStepKey, WizardData, PersonalInfo, EmergencyContact,
  FirstWeekItem, PipelineEmployee,
} from './onboarding-wizard-types';

// ─────────────────────────────────────────────────────────────
// Load all wizard data for an employee
// ─────────────────────────────────────────────────────────────

export async function getWizardData(employeeId: string): Promise<{ data: WizardData | null; error?: string }> {
  const admin = createSupabaseAdminClient();

  const { data: record, error: recErr } = await admin
    .from('onboarding_records')
    .select('*')
    .eq('employee_id', employeeId)
    .in('status', ['active', 'on_hold'])
    .single();

  if (recErr || !record) return { data: null, error: 'No active onboarding record found.' };

  const [profileRes, hospRes, managerRes, docsRes, vetCredRes, trainingRes, policiesRes, equipmentRes, hospRoleRes] =
    await Promise.all([
      admin.from('profiles').select('id,first_name,last_name,email,job_title,department,avatar_url').eq('id', employeeId).single(),
      record.hospital_id
        ? admin.from('hospitals').select('id,name,color,address,phone').eq('id', record.hospital_id).single()
        : Promise.resolve({ data: null }),
      record.manager_id
        ? admin.from('profiles').select('id,first_name,last_name,email,job_title,avatar_url').eq('id', record.manager_id).single()
        : Promise.resolve({ data: null }),
      admin.from('onboarding_documents').select('*').eq('record_id', record.id).order('created_at'),
      admin.from('vet_credentials').select('*').eq('record_id', record.id).maybeSingle(),
      admin.from('onboarding_tasks').select('*').eq('record_id', record.id).eq('task_type', 'training').order('sort_order'),
      admin.from('policy_acknowledgements').select('*').eq('record_id', record.id).order('created_at'),
      admin.from('equipment_assignments').select('*').eq('record_id', record.id).order('created_at'),
      admin.from('user_hospital_roles').select('role').eq('user_id', employeeId).limit(1),
    ]);

  const employee = profileRes.data;
  if (!employee) return { data: null, error: 'Employee profile not found.' };

  const empRole = hospRoleRes.data?.[0]?.role ?? null;
  const requiresVetCredentials = empRole ? VET_ROLES.includes(empRole) : false;

  let policies = policiesRes.data ?? [];
  if (!policies.length) {
    await seedDefaultPolicies(record.id, record.org_id, employeeId, admin);
    const { data: fresh } = await admin
      .from('policy_acknowledgements')
      .select('*')
      .eq('record_id', record.id)
      .order('created_at');
    policies = fresh ?? [];
  }

  const wizardData = (record.wizard_data ?? {}) as WizardData['record']['wizard_data'];
  if (!wizardData.first_week_checklist?.length) {
    wizardData.first_week_checklist = buildDefaultChecklist(empRole);
  }

  return {
    data: {
      record: { ...record, wizard_data: wizardData },
      employee: { ...employee, role: empRole },
      hospital: hospRes.data ?? null,
      manager: managerRes.data ?? null,
      documents: (docsRes.data ?? []).map(d => ({
        id: d.id, doc_type: d.doc_type, name: d.name,
        status: d.status, storage_path: d.storage_path ?? null, notes: d.notes ?? null,
      })),
      vetCredentials: vetCredRes.data ? {
        license_number: vetCredRes.data.license_number,
        license_state: vetCredRes.data.license_state,
        license_expiry: vetCredRes.data.license_expiry,
        dea_number: vetCredRes.data.dea_number,
        dea_expiry: vetCredRes.data.dea_expiry,
        specializations: vetCredRes.data.specializations ?? [],
        skill_matrix: vetCredRes.data.skill_matrix ?? {},
        verification_status: vetCredRes.data.verification_status,
      } : null,
      trainingTasks: (trainingRes.data ?? []).map(t => ({
        id: t.id, title: t.title, description: t.description ?? null,
        status: t.status, due_date: t.due_date ?? null,
      })),
      policies: policies.map(p => ({
        id: p.id, policy_key: p.policy_key, policy_name: p.policy_name,
        policy_content: p.policy_content ?? null, acknowledged: p.acknowledged,
        acknowledged_at: p.acknowledged_at ?? null, signature_text: p.signature_text ?? null,
      })),
      equipment: (equipmentRes.data ?? []).map(e => ({
        id: e.id, equipment_name: e.equipment_name, equipment_type: e.equipment_type ?? null,
        serial_number: e.serial_number ?? null, status: e.status, assigned_date: e.assigned_date ?? null,
      })),
      requiresVetCredentials,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Private helpers (not exported — no server action boundary issue)
// ─────────────────────────────────────────────────────────────

const DEFAULT_POLICIES = [
  { policy_key: 'employee_handbook',   policy_name: 'Employee Handbook',          policy_content: 'This handbook outlines all company policies, benefits, and expectations. It covers workplace conduct, leave policies, benefits overview, and your rights as an employee.' },
  { policy_key: 'attendance_policy',   policy_name: 'Attendance & Time Policy',    policy_content: 'Our attendance policy defines expected work hours, procedures for reporting absences, tardiness guidelines, and time-off request processes.' },
  { policy_key: 'code_of_conduct',     policy_name: 'Code of Conduct',             policy_content: 'Our code of conduct defines professional behavior standards for all employees including respectful communication, patient confidentiality, and ethical decision-making.' },
  { policy_key: 'it_policy',           policy_name: 'IT & Security Policy',        policy_content: 'This policy covers acceptable use of company technology, internet, email, and software systems including data security requirements and password policies.' },
  { policy_key: 'controlled_substance',policy_name: 'Controlled Substance Policy', policy_content: 'This policy governs the handling, storage, administration, and documentation of controlled substances. All employees who work with controlled substances must follow these procedures strictly.' },
  { policy_key: 'hipaa_privacy',       policy_name: 'Privacy & HIPAA Compliance',  policy_content: 'Patient privacy is paramount. This policy details our HIPAA compliance requirements, including what constitutes protected health information and how it must be handled.' },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function seedDefaultPolicies(recordId: string, orgId: string, employeeId: string, admin: any) {
  await admin.from('policy_acknowledgements').insert(
    DEFAULT_POLICIES.map(p => ({ ...p, record_id: recordId, org_id: orgId, employee_id: employeeId }))
  );
}

function buildDefaultChecklist(role: string | null): FirstWeekItem[] {
  const base: FirstWeekItem[] = [
    { id: 'meet_team',        title: 'Meet your team members',                        completed: false, completed_at: null },
    { id: 'workspace',        title: 'Set up your workspace and computer',             completed: false, completed_at: null },
    { id: 'system_access',    title: 'Log in to all required systems',                completed: false, completed_at: null },
    { id: 'email_setup',      title: 'Set up email and calendar',                     completed: false, completed_at: null },
    { id: 'orientation_tour', title: 'Complete hospital orientation tour',             completed: false, completed_at: null },
    { id: 'manager_meet',     title: 'Meet with your manager 1-on-1',                 completed: false, completed_at: null },
    { id: 'first_patient',    title: 'Shadow a senior team member',                   completed: false, completed_at: null },
    { id: 'emergency_proc',   title: 'Review emergency procedures',                   completed: false, completed_at: null },
  ];
  if (role && VET_ROLES.includes(role)) {
    base.push(
      { id: 'vet_software', title: 'Learn veterinary practice management software', completed: false, completed_at: null },
      { id: 'drug_log',     title: 'Review controlled substance log procedures',    completed: false, completed_at: null },
    );
  }
  return base;
}

// ─────────────────────────────────────────────────────────────
// Save personal info + emergency contact (Step 2)
// ─────────────────────────────────────────────────────────────

export async function savePersonalInfo(
  recordId: string,
  personalInfo: PersonalInfo,
  emergencyContact?: EmergencyContact,
): Promise<{ success: boolean; error?: string }> {
  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin.from('onboarding_records').select('wizard_data').eq('id', recordId).single();
  const current = (existing?.wizard_data ?? {}) as Record<string, unknown>;
  const patch: Record<string, unknown> = { ...current, personal_info: personalInfo };
  if (emergencyContact) patch.emergency_contact = emergencyContact;
  const { error } = await admin.from('onboarding_records').update({
    wizard_data: patch,
    updated_at: new Date().toISOString(),
  }).eq('id', recordId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ─────────────────────────────────────────────────────────────
// Save emergency contacts (Step 3)
// ─────────────────────────────────────────────────────────────

export async function saveEmergencyContacts(
  recordId: string,
  contacts: EmergencyContact[],
): Promise<{ success: boolean; error?: string }> {
  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin.from('onboarding_records').select('wizard_data').eq('id', recordId).single();
  const current = (existing?.wizard_data ?? {}) as Record<string, unknown>;
  const { error } = await admin.from('onboarding_records').update({
    wizard_data: { ...current, emergency_contacts: contacts },
    updated_at: new Date().toISOString(),
  }).eq('id', recordId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ─────────────────────────────────────────────────────────────
// Save vet credentials (Step 4)
// ─────────────────────────────────────────────────────────────

export async function saveVetCredentials(
  recordId: string,
  orgId: string,
  employeeId: string,
  data: {
    license_number?: string;
    license_state?: string;
    license_expiry?: string;
    dea_number?: string;
    dea_expiry?: string;
    specializations?: string[];
    skill_matrix?: Record<string, boolean>;
  },
): Promise<{ success: boolean; error?: string }> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from('vet_credentials').upsert({
    record_id: recordId, org_id: orgId, employee_id: employeeId,
    ...data, updated_at: new Date().toISOString(),
  }, { onConflict: 'record_id' });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ─────────────────────────────────────────────────────────────
// Acknowledge a policy (Step 6)
// ─────────────────────────────────────────────────────────────

export async function acknowledgePolicy(
  recordId: string,
  policyKey: string,
  signatureText: string,
): Promise<{ success: boolean; error?: string }> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from('policy_acknowledgements').update({
    acknowledged: true,
    acknowledged_at: new Date().toISOString(),
    signature_text: signatureText,
  }).eq('record_id', recordId).eq('policy_key', policyKey);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ─────────────────────────────────────────────────────────────
// Save first-week checklist item (Step 9)
// ─────────────────────────────────────────────────────────────

export async function saveChecklistItem(
  recordId: string,
  itemId: string,
  completed: boolean,
): Promise<{ success: boolean; error?: string }> {
  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin.from('onboarding_records').select('wizard_data').eq('id', recordId).single();
  const current = (existing?.wizard_data ?? {}) as Record<string, unknown>;
  const checklist = (current.first_week_checklist as FirstWeekItem[] | undefined) ?? buildDefaultChecklist(null);
  const updated = checklist.map(item =>
    item.id === itemId
      ? { ...item, completed, completed_at: completed ? new Date().toISOString() : null }
      : item
  );
  const { error } = await admin.from('onboarding_records').update({
    wizard_data: { ...current, first_week_checklist: updated },
    updated_at: new Date().toISOString(),
  }).eq('id', recordId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ─────────────────────────────────────────────────────────────
// Mark a wizard step complete and advance
// ─────────────────────────────────────────────────────────────

export async function completeWizardStep(
  recordId: string,
  stepKey: WizardStepKey,
  nextStepIndex: number,
  requiresVetCredentials: boolean,
): Promise<{ success: boolean; error?: string }> {
  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin.from('onboarding_records')
    .select('completed_steps').eq('id', recordId).single();
  const completedSteps = Array.from(new Set([...(existing?.completed_steps ?? []), stepKey]));
  const totalSteps = 8;
  const progress = Math.min(Math.round((completedSteps.length / totalSteps) * 100), 99);
  const { error } = await admin.from('onboarding_records').update({
    completed_steps: completedSteps,
    wizard_step: nextStepIndex,
    progress_pct: progress,
    updated_at: new Date().toISOString(),
  }).eq('id', recordId);
  if (error) return { success: false, error: error.message };
  revalidatePath('/onboarding');
  return { success: true };
}

// ─────────────────────────────────────────────────────────────
// Complete onboarding entirely
// ─────────────────────────────────────────────────────────────

export async function completeOnboarding(recordId: string): Promise<{ success: boolean; error?: string }> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from('onboarding_records').update({
    status: 'completed', stage: 'completed', progress_pct: 100,
    completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq('id', recordId);
  if (error) return { success: false, error: error.message };
  revalidatePath('/onboarding');
  return { success: true };
}

// ─────────────────────────────────────────────────────────────
// HR Pipeline: get all onboarding employees with wizard status
// ─────────────────────────────────────────────────────────────

export async function getHRPipelineData(): Promise<{ employees: PipelineEmployee[]; hospitals: { name: string; color: string | null }[]; error?: string }> {
  const admin = createSupabaseAdminClient();

  const { data: records, error } = await admin
    .from('onboarding_records')
    .select(`
      id, employee_id, status, stage, progress_pct,
      wizard_step, completed_steps, employment_type, start_date, created_at, hospital_id, org_id,
      profiles!onboarding_records_employee_id_fkey(first_name, last_name, email, avatar_url, job_title, department),
      hospitals(name, color)
    `)
    .in('status', ['active', 'on_hold'])
    .order('created_at', { ascending: false });

  if (error) return { employees: [], hospitals: [], error: error.message };

  // Fetch all hospitals for the org so the dropdown always shows every hospital
  const orgId = (records ?? [])[0]?.org_id ?? null;
  const allHospitalsRes = orgId
    ? await admin.from('hospitals').select('name, color').eq('org_id', orgId).order('name')
    : { data: [] };
  const allHospitals = (allHospitalsRes.data ?? []).map(h => ({ name: h.name as string, color: h.color as string | null }));

  const recordIds = (records ?? []).map(r => r.id);
  const [docsRes, policiesRes] = await Promise.all([
    recordIds.length
      ? admin.from('onboarding_documents').select('record_id, status').in('record_id', recordIds)
      : Promise.resolve({ data: [] }),
    recordIds.length
      ? admin.from('policy_acknowledgements').select('record_id, acknowledged').in('record_id', recordIds)
      : Promise.resolve({ data: [] }),
  ]);

  const docsByRecord = new Map<string, { total: number; uploaded: number }>();
  for (const d of (docsRes.data ?? [])) {
    const cur = docsByRecord.get(d.record_id) ?? { total: 0, uploaded: 0 };
    cur.total++;
    if (d.status !== 'pending') cur.uploaded++;
    docsByRecord.set(d.record_id, cur);
  }

  const polByRecord = new Map<string, { total: number; acked: number }>();
  for (const p of (policiesRes.data ?? [])) {
    const cur = polByRecord.get(p.record_id) ?? { total: 0, acked: 0 };
    cur.total++;
    if (p.acknowledged) cur.acked++;
    polByRecord.set(p.record_id, cur);
  }

  const employees: PipelineEmployee[] = (records ?? []).map(r => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prof = (r as any).profiles ?? {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hosp = (r as any).hospitals ?? null;
    const docs = docsByRecord.get(r.id) ?? { total: 0, uploaded: 0 };
    const pols = polByRecord.get(r.id) ?? { total: 0, acked: 0 };
    return {
      record_id: r.id,
      employee_id: r.employee_id,
      employee_name: [prof.first_name, prof.last_name].filter(Boolean).join(' ') || 'Unknown',
      employee_email: prof.email ?? null,
      employee_avatar: prof.avatar_url ?? null,
      job_title: prof.job_title ?? null,
      department: prof.department ?? null,
      hospital_name: hosp?.name ?? null,
      hospital_color: hosp?.color ?? null,
      status: r.status,
      stage: r.stage,
      progress_pct: r.progress_pct ?? 0,
      wizard_step: r.wizard_step ?? 0,
      completed_steps: r.completed_steps ?? [],
      employment_type: r.employment_type ?? null,
      start_date: r.start_date ?? null,
      created_at: r.created_at,
      docs_uploaded: docs.uploaded,
      docs_total: docs.total,
      policies_acked: pols.acked,
      policies_total: pols.total,
    };
  });

  return { employees, hospitals: allHospitals };
}

// ─────────────────────────────────────────────────────────────
// HR: Add equipment assignment
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// HR: Update onboarding record (stage, status, notes, dates)
// ─────────────────────────────────────────────────────────────

export async function updateOnboardingRecord(
  recordId: string,
  patch: {
    stage?: string;
    status?: string;
    employment_type?: string | null;
    start_date?: string | null;
    notes?: string | null;
  },
): Promise<{ success: boolean; error?: string }> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from('onboarding_records')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', recordId);
  if (error) return { success: false, error: error.message };
  revalidatePath('/dashboard');
  return { success: true };
}

// ─────────────────────────────────────────────────────────────
// HR: Cancel / remove onboarding record
// ─────────────────────────────────────────────────────────────

export async function cancelOnboardingRecord(
  recordId: string,
): Promise<{ success: boolean; error?: string }> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from('onboarding_records')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', recordId);
  if (error) return { success: false, error: error.message };
  revalidatePath('/dashboard');
  return { success: true };
}

// ─────────────────────────────────────────────────────────────
// HR: Get full onboarding detail for slide panel
// ─────────────────────────────────────────────────────────────

export interface OnboardingDetail {
  record_id: string;
  employee_id: string;
  employee_name: string;
  employee_email: string | null;
  employee_avatar: string | null;
  job_title: string | null;
  department: string | null;
  hospital_name: string | null;
  hospital_color: string | null;
  hospital_address: string | null;
  hospital_phone: string | null;
  status: string;
  stage: string;
  progress_pct: number;
  wizard_step: number;
  completed_steps: string[];
  employment_type: string | null;
  start_date: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  docs: Array<{ id: string; name: string; doc_type: string; status: string }>;
  training: Array<{ id: string; title: string; status: string; due_date: string | null }>;
  policies: Array<{ id: string; policy_name: string; acknowledged: boolean }>;
  equipment: Array<{ id: string; equipment_name: string; equipment_type: string | null; status: string }>;
}

export async function getOnboardingDetail(
  recordId: string,
): Promise<{ data: OnboardingDetail | null; error?: string }> {
  const admin = createSupabaseAdminClient();

  const { data: rec, error } = await admin
    .from('onboarding_records')
    .select(`
      id, employee_id, status, stage, progress_pct, wizard_step, completed_steps,
      employment_type, start_date, completed_at, notes, created_at, hospital_id,
      profiles!onboarding_records_employee_id_fkey(first_name, last_name, email, avatar_url, job_title, department),
      hospitals(name, color, address, phone)
    `)
    .eq('id', recordId)
    .single();

  if (error || !rec) return { data: null, error: error?.message ?? 'Not found' };

  const [docsRes, trainingRes, policiesRes, equipmentRes] = await Promise.all([
    admin.from('onboarding_documents').select('id, name, doc_type, status').eq('record_id', recordId).order('created_at'),
    admin.from('onboarding_tasks').select('id, title, status, due_date').eq('record_id', recordId).eq('task_type', 'training').order('sort_order'),
    admin.from('policy_acknowledgements').select('id, policy_name, acknowledged').eq('record_id', recordId).order('created_at'),
    admin.from('equipment_assignments').select('id, equipment_name, equipment_type, status').eq('record_id', recordId).order('created_at'),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prof = (rec as any).profiles ?? {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hosp = (rec as any).hospitals ?? null;

  return {
    data: {
      record_id: rec.id,
      employee_id: rec.employee_id,
      employee_name: [prof.first_name, prof.last_name].filter(Boolean).join(' ') || 'Unknown',
      employee_email: prof.email ?? null,
      employee_avatar: prof.avatar_url ?? null,
      job_title: prof.job_title ?? null,
      department: prof.department ?? null,
      hospital_name: hosp?.name ?? null,
      hospital_color: hosp?.color ?? null,
      hospital_address: hosp?.address ?? null,
      hospital_phone: hosp?.phone ?? null,
      status: rec.status,
      stage: rec.stage,
      progress_pct: rec.progress_pct ?? 0,
      wizard_step: rec.wizard_step ?? 0,
      completed_steps: rec.completed_steps ?? [],
      employment_type: rec.employment_type ?? null,
      start_date: rec.start_date ?? null,
      completed_at: rec.completed_at ?? null,
      notes: rec.notes ?? null,
      created_at: rec.created_at,
      docs: (docsRes.data ?? []).map(d => ({ id: d.id, name: d.name, doc_type: d.doc_type, status: d.status })),
      training: (trainingRes.data ?? []).map(t => ({ id: t.id, title: t.title, status: t.status, due_date: t.due_date ?? null })),
      policies: (policiesRes.data ?? []).map(p => ({ id: p.id, policy_name: p.policy_name, acknowledged: p.acknowledged })),
      equipment: (equipmentRes.data ?? []).map(e => ({ id: e.id, equipment_name: e.equipment_name, equipment_type: e.equipment_type ?? null, status: e.status })),
    },
  };
}

export async function addEquipmentAssignment(
  recordId: string,
  orgId: string,
  employeeId: string,
  equipment: {
    equipment_name: string;
    equipment_type?: string;
    serial_number?: string;
    notes?: string;
  },
): Promise<{ success: boolean; error?: string }> {
  const admin = createSupabaseAdminClient();
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await admin.from('equipment_assignments').insert({
    record_id: recordId, org_id: orgId, employee_id: employeeId,
    assigned_by: user?.id ?? null,
    assigned_date: new Date().toISOString().split('T')[0],
    status: 'assigned',
    ...equipment,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}
