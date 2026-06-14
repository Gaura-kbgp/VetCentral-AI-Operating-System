'use server';

import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface JobPosting {
  id: string;
  org_id: string;
  hospital_id: string | null;
  hospital_name: string | null;
  hospital_color: string | null;
  title: string;
  department: string | null;
  employment_type: string;
  description: string | null;
  requirements: string | null;
  responsibilities: string | null;
  salary_min: number | null;
  salary_max: number | null;
  location: string | null;
  status: string;
  posted_at: string | null;
  closes_at: string | null;
  created_at: string;
  applicant_count: number;
}

export interface HiringDocument {
  id: string;
  application_id: string;
  doc_type: 'id_proof' | 'qualification' | 'employment_proof' | 'offer_letter_signed' | 'nda_signed' | 'other';
  name: string;
  status: 'pending' | 'received' | 'verified' | 'rejected';
  storage_path: string | null;
  file_size: number | null;
  mime_type: string | null;
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface CandidateProfile {
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  dob?: string;
  availability?: string;
  notice_period?: string;
  current_employer?: string;
  expected_salary?: string;
  emergency_name?: string;
  emergency_phone?: string;
  emergency_relationship?: string;
}

export interface JobApplication {
  id: string;
  job_id: string;
  job_title: string;
  hospital_name: string | null;
  hospital_color: string | null;
  org_id: string;
  applicant_name: string;
  applicant_email: string;
  applicant_phone: string | null;
  cover_letter: string | null;
  resume_url: string | null;
  resume_filename: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  years_experience: number | null;
  education_level: string | null;
  qualifications: Array<{ name: string; issuer: string; year: number }>;
  status: string;
  rating: number | null;
  notes: string | null;
  applied_at: string;
  // Hiring lifecycle
  hiring_stage: string;
  candidate_profile: CandidateProfile;
  profile_submitted_at: string | null;
  offer_letter_sent_at: string | null;
  offer_letter_signed_at: string | null;
  offer_letter_salary: string | null;
  offer_letter_start: string | null;
  nda_sent_at: string | null;
  nda_signed_at: string | null;
  // Loaded separately
  hiring_documents: HiringDocument[];
}

export interface HiringEvent {
  id: string;
  org_id: string;
  hospital_id: string | null;
  hospital_name: string | null;
  hospital_color: string | null;
  title: string;
  description: string | null;
  event_type: string;
  event_date: string;
  end_date: string | null;
  location: string | null;
  virtual_link: string | null;
  max_attendees: number | null;
  status: string;
  linked_jobs: string[];
  created_at: string;
}

export interface Interview {
  id: string;
  application_id: string;
  applicant_name: string;
  job_title: string;
  hospital_name: string | null;
  interviewer_id: string | null;
  scheduled_at: string;
  duration_minutes: number;
  location: string | null;
  virtual_link: string | null;
  interview_type: string;
  status: string;
  notes: string | null;
  feedback: string | null;
}

// ── Fetch all hiring data ─────────────────────────────────────────────────────

export async function getHiringData(): Promise<{
  jobs: JobPosting[];
  applications: JobApplication[];
  events: HiringEvent[];
  interviews: Interview[];
  hospitals: Array<{ id: string; name: string; color: string | null }>;
  error?: string;
}> {
  const admin = createSupabaseAdminClient();
  const empty = { jobs: [], applications: [], events: [], interviews: [], hospitals: [] };

  try {
    const { data: hospData } = await admin.from('hospitals').select('id, name, color, org_id').order('name');
    if (!hospData?.length) return empty;

    const orgId = hospData[0].org_id;
    const hospitalMap = new Map(hospData.map(h => [h.id, h]));
    const hospitals = hospData.map(h => ({ id: h.id, name: h.name, color: h.color ?? null }));

    const [jobsRes, appsRes, eventsRes] = await Promise.all([
      admin.from('job_postings').select('*').eq('org_id', orgId).order('created_at', { ascending: false }),
      admin.from('job_applications').select('*').eq('org_id', orgId).order('applied_at', { ascending: false }),
      admin.from('hiring_events').select('*').eq('org_id', orgId).order('event_date'),
    ]);

    const appCountByJob = new Map<string, number>();
    for (const a of (appsRes.data ?? [])) {
      appCountByJob.set(a.job_id, (appCountByJob.get(a.job_id) ?? 0) + 1);
    }

    const jobMap = new Map((jobsRes.data ?? []).map(j => [j.id, j]));

    const jobs: JobPosting[] = (jobsRes.data ?? []).map(j => {
      const h = j.hospital_id ? hospitalMap.get(j.hospital_id) : null;
      return { ...j, hospital_name: h?.name ?? null, hospital_color: h?.color ?? null, applicant_count: appCountByJob.get(j.id) ?? 0 };
    });

    // Fetch hiring documents for all applications
    const appIds = (appsRes.data ?? []).map(a => a.id);
    let docsMap: Record<string, HiringDocument[]> = {};
    if (appIds.length > 0) {
      try {
        const { data: docsData } = await admin
          .from('hiring_documents')
          .select('*')
          .in('application_id', appIds)
          .order('created_at');
        for (const d of (docsData ?? [])) {
          if (!docsMap[d.application_id]) docsMap[d.application_id] = [];
          docsMap[d.application_id].push(d as HiringDocument);
        }
      } catch { /* table may not exist yet */ }
    }

    const applications: JobApplication[] = (appsRes.data ?? []).map(a => {
      const job = jobMap.get(a.job_id);
      const h   = job?.hospital_id ? hospitalMap.get(job.hospital_id) : null;
      return {
        ...a,
        job_title:      job?.title ?? 'Unknown Position',
        hospital_name:  h?.name  ?? null,
        hospital_color: h?.color ?? null,
        qualifications: Array.isArray(a.qualifications) ? a.qualifications : [],
        hiring_stage:   a.hiring_stage ?? 'applied',
        candidate_profile: (a.candidate_profile ?? {}) as CandidateProfile,
        profile_submitted_at:   a.profile_submitted_at ?? null,
        offer_letter_sent_at:   a.offer_letter_sent_at ?? null,
        offer_letter_signed_at: a.offer_letter_signed_at ?? null,
        offer_letter_salary:    a.offer_letter_salary ?? null,
        offer_letter_start:     a.offer_letter_start ?? null,
        nda_sent_at:            a.nda_sent_at ?? null,
        nda_signed_at:          a.nda_signed_at ?? null,
        hiring_documents:       docsMap[a.id] ?? [],
      };
    });

    const events: HiringEvent[] = (eventsRes.data ?? []).map(e => {
      const h = e.hospital_id ? hospitalMap.get(e.hospital_id) : null;
      return { ...e, hospital_name: h?.name ?? null, hospital_color: h?.color ?? null, linked_jobs: e.linked_jobs ?? [] };
    });

    // Interviews
    let interviews: Interview[] = [];
    if (appIds.length > 0) {
      const { data: intData } = await admin.from('interviews').select('*').in('application_id', appIds).order('scheduled_at');
      const appMap = new Map((appsRes.data ?? []).map(a => [a.id, a]));
      interviews = (intData ?? []).map(i => {
        const app = appMap.get(i.application_id);
        const job = app ? jobMap.get(app.job_id) : null;
        const h   = job?.hospital_id ? hospitalMap.get(job.hospital_id) : null;
        return { ...i, applicant_name: app?.applicant_name ?? 'Unknown', job_title: job?.title ?? 'Unknown', hospital_name: h?.name ?? null };
      });
    }

    return { jobs, applications, events, interviews, hospitals };
  } catch {
    return { ...empty, error: 'Hiring tables not found — run migration 030_hiring.sql' };
  }
}

// ── Create job posting ────────────────────────────────────────────────────────

export async function createJobPosting(input: {
  title: string;
  department?: string;
  hospital_id?: string;
  employment_type: string;
  description?: string;
  requirements?: string;
  responsibilities?: string;
  salary_min?: number | null;
  salary_max?: number | null;
  location?: string;
  closes_at?: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const admin = createSupabaseAdminClient();
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Unauthorized' };
    const { data: prof } = await admin.from('profiles').select('org_id').eq('id', user.id).single();
    if (!prof?.org_id) return { success: false, error: 'Organization not found' };

    const { data, error } = await admin.from('job_postings').insert({
      org_id: prof.org_id, posted_by: user.id, status: 'open', posted_at: new Date().toISOString(), ...input,
    }).select('id').single();

    if (error) return { success: false, error: error.message };
    revalidatePath('/dashboard');
    return { success: true, id: data.id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Error' };
  }
}

// ── Update job status ─────────────────────────────────────────────────────────

export async function updateJobStatus(jobId: string, status: string): Promise<{ success: boolean; error?: string }> {
  const admin = createSupabaseAdminClient();
  try {
    const { error } = await admin.from('job_postings').update({ status }).eq('id', jobId);
    if (error) return { success: false, error: error.message };
    revalidatePath('/dashboard');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Error' };
  }
}

// ── Update application ────────────────────────────────────────────────────────

export async function updateApplication(
  id: string,
  patch: { status?: string; rating?: number | null; notes?: string },
): Promise<{ success: boolean; error?: string }> {
  const admin = createSupabaseAdminClient();
  try {
    const { error } = await admin.from('job_applications').update(patch).eq('id', id);
    if (error) return { success: false, error: error.message };
    revalidatePath('/dashboard');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Error' };
  }
}

// ── Schedule interview ────────────────────────────────────────────────────────

export async function scheduleInterview(input: {
  application_id: string;
  scheduled_at: string;
  duration_minutes: number;
  interview_type: string;
  location?: string;
  virtual_link?: string;
  notes?: string;
}): Promise<{ success: boolean; error?: string }> {
  const admin = createSupabaseAdminClient();
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Unauthorized' };
    const { data: prof } = await admin.from('profiles').select('org_id').eq('id', user.id).single();
    if (!prof?.org_id) return { success: false, error: 'Organization not found' };

    const { error } = await admin.from('interviews').insert({ org_id: prof.org_id, interviewer_id: user.id, status: 'scheduled', ...input });
    if (error) return { success: false, error: error.message };
    await admin.from('job_applications').update({ status: 'interview_scheduled' }).eq('id', input.application_id);
    revalidatePath('/dashboard');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Error' };
  }
}

// ── Create hiring event ───────────────────────────────────────────────────────

export async function createHiringEvent(input: {
  title: string;
  description?: string;
  event_type: string;
  event_date: string;
  end_date?: string;
  location?: string;
  virtual_link?: string;
  max_attendees?: number | null;
  hospital_id?: string;
}): Promise<{ success: boolean; error?: string }> {
  const admin = createSupabaseAdminClient();
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Unauthorized' };
    const { data: prof } = await admin.from('profiles').select('org_id').eq('id', user.id).single();
    if (!prof?.org_id) return { success: false, error: 'Organization not found' };

    const { error } = await admin.from('hiring_events').insert({ org_id: prof.org_id, created_by: user.id, status: 'upcoming', ...input });
    if (error) return { success: false, error: error.message };
    revalidatePath('/dashboard');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Error' };
  }
}

// ── Terminate employee ────────────────────────────────────────────────────────

export async function terminateEmployee(input: {
  employee_id: string;
  reason: string;
  termination_type: string;
  last_working_day: string;
  notes?: string;
  rehire_eligible: boolean;
}): Promise<{ success: boolean; error?: string }> {
  const admin = createSupabaseAdminClient();
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Unauthorized' };
    const { data: prof } = await admin.from('profiles').select('org_id').eq('id', user.id).single();
    if (!prof?.org_id) return { success: false, error: 'Organization not found' };

    const { data: hospRole } = await admin.from('user_hospital_roles').select('hospital_id').eq('user_id', input.employee_id).limit(1).single();

    // Create termination record
    const { error: termErr } = await admin.from('termination_records').insert({
      org_id:      prof.org_id,
      employee_id: input.employee_id,
      hospital_id: hospRole?.hospital_id ?? null,
      terminated_by: user.id,
      reason:      input.reason,
      termination_type: input.termination_type,
      last_working_day: input.last_working_day,
      notes:       input.notes ?? null,
      rehire_eligible: input.rehire_eligible,
    });
    if (termErr) return { success: false, error: termErr.message };

    // Deactivate profile
    await admin.from('profiles').update({ is_active: false }).eq('id', input.employee_id);

    // Cancel active onboarding
    await admin.from('onboarding_records')
      .update({ status: 'cancelled' })
      .eq('employee_id', input.employee_id)
      .in('status', ['active', 'on_hold']);

    revalidatePath('/dashboard');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Error' };
  }
}

// ── Send / mark offer letter ──────────────────────────────────────────────────

export async function sendOfferLetter(input: {
  applicationId: string;
  salary: string;
  startDate: string;
}): Promise<{ success: boolean; error?: string }> {
  const admin = createSupabaseAdminClient();
  try {
    const { error } = await admin.from('job_applications').update({
      offer_letter_sent_at: new Date().toISOString(),
      offer_letter_salary:  input.salary,
      offer_letter_start:   input.startDate || null,
      status:               'offer_made',
      hiring_stage:         'offer_sent',
    }).eq('id', input.applicationId);
    if (error) return { success: false, error: error.message };
    revalidatePath('/dashboard');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Error' };
  }
}

export async function markOfferSigned(applicationId: string): Promise<{ success: boolean; error?: string }> {
  const admin = createSupabaseAdminClient();
  try {
    const { error } = await admin.from('job_applications').update({
      offer_letter_signed_at: new Date().toISOString(),
      hiring_stage:           'offer_signed',
    }).eq('id', applicationId);
    if (error) return { success: false, error: error.message };
    revalidatePath('/dashboard');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Error' };
  }
}

export async function sendNDA(applicationId: string): Promise<{ success: boolean; error?: string }> {
  const admin = createSupabaseAdminClient();
  try {
    const { error } = await admin.from('job_applications').update({
      nda_sent_at:  new Date().toISOString(),
      hiring_stage: 'offer_signed',
    }).eq('id', applicationId);
    if (error) return { success: false, error: error.message };
    revalidatePath('/dashboard');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Error' };
  }
}

export async function markNDASigned(applicationId: string): Promise<{ success: boolean; error?: string }> {
  const admin = createSupabaseAdminClient();
  try {
    const { error } = await admin.from('job_applications').update({
      nda_signed_at: new Date().toISOString(),
      hiring_stage:  'nda_signed',
    }).eq('id', applicationId);
    if (error) return { success: false, error: error.message };
    revalidatePath('/dashboard');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Error' };
  }
}

export async function updateHiringStage(
  applicationId: string,
  stage: string,
): Promise<{ success: boolean; error?: string }> {
  const admin = createSupabaseAdminClient();
  try {
    const { error } = await admin.from('job_applications').update({ hiring_stage: stage }).eq('id', applicationId);
    if (error) return { success: false, error: error.message };
    revalidatePath('/dashboard');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Error' };
  }
}

export async function addHiringDocument(input: {
  applicationId: string;
  orgId: string;
  docType: HiringDocument['doc_type'];
  name: string;
  notes?: string;
}): Promise<{ success: boolean; error?: string }> {
  const admin = createSupabaseAdminClient();
  try {
    const { error } = await admin.from('hiring_documents').insert({
      application_id: input.applicationId,
      org_id:         input.orgId,
      doc_type:       input.docType,
      name:           input.name,
      status:         'received',
      notes:          input.notes ?? null,
    });
    if (error) return { success: false, error: error.message };
    revalidatePath('/dashboard');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Error' };
  }
}

export async function updateDocumentStatus(
  docId: string,
  status: HiringDocument['status'],
): Promise<{ success: boolean; error?: string }> {
  const admin = createSupabaseAdminClient();
  try {
    const { error } = await admin.from('hiring_documents').update({ status, updated_at: new Date().toISOString() }).eq('id', docId);
    if (error) return { success: false, error: error.message };
    revalidatePath('/dashboard');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Error' };
  }
}

// ── Update attendance check-in/out ────────────────────────────────────────────

export async function updateAttendanceTimes(
  employeeId: string,
  checkIn: string | null,
  checkOut: string | null,
): Promise<{ success: boolean; error?: string }> {
  const admin = createSupabaseAdminClient();
  const today = new Date().toISOString().split('T')[0];
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Unauthorized' };
    const { data: prof } = await admin.from('profiles').select('org_id').eq('id', user.id).single();
    if (!prof?.org_id) return { success: false, error: 'Organization not found' };
    const { data: hospRole } = await admin.from('user_hospital_roles').select('hospital_id').eq('user_id', employeeId).limit(1).single();

    const { error } = await admin.from('attendance_records').upsert({
      org_id:         prof.org_id,
      employee_id:    employeeId,
      hospital_id:    hospRole?.hospital_id ?? null,
      date:           today,
      check_in_time:  checkIn,
      check_out_time: checkOut,
      updated_at:     new Date().toISOString(),
    }, { onConflict: 'employee_id,date' });

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Error' };
  }
}
