'use server';

import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/types/app';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface LMSCourse {
  id: string;
  org_id: string;
  hospital_id: string | null;
  title: string;
  description: string | null;
  category: string | null;
  thumbnail_url: string | null;
  is_required: boolean;
  due_days: number | null;
  is_published: boolean;
  level: string;
  estimated_hours: number;
  compliance_type: string | null;
  expires_after_days: number | null;
  pass_score: number;
  tags: string[];
  cover_color: string;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  modules?: LMSModule[];
  quiz?: QuizDefinition | null;
  enrollment?: CourseEnrollment | null;
  module_count?: number;
}

export interface LMSModule {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  content_type: 'article' | 'video' | 'pdf' | 'docx' | 'link' | 'photo';
  content_url: string | null;
  content: string | null;
  file_name: string | null;
  storage_path: string | null;
  file_size: number | null;
  duration_mins: number;
  sort_order: number;
  is_required: boolean;
  progress?: { completed_at: string | null; time_spent_secs: number } | null;
  view_count?: number;
}

export interface QuizDefinition {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  pass_score: number;
  max_attempts: number;
  time_limit: number | null;
  randomize: boolean;
  questions?: QuizQuestion[];
}

export interface QuizOption {
  id: string;
  text: string;
  is_correct: boolean;
}

export interface QuizQuestion {
  id: string;
  quiz_id: string;
  question_text: string;
  question_type: 'multiple_choice' | 'true_false' | 'fill_in_blank' | 'essay';
  options: QuizOption[];
  correct_answer: string | null;   // used by fill_in_blank
  explanation: string | null;
  points: number;
  sort_order: number;
}

export interface QuizAttempt {
  id: string;
  user_id: string;
  quiz_id: string;
  course_id: string;
  answers: Record<string, string>;
  score: number;
  passed: boolean;
  started_at: string;
  submitted_at: string | null;
}

export interface CourseEnrollment {
  id: string;
  user_id: string;
  course_id: string;
  enrolled_at: string;
  completed_at: string | null;
  due_date: string | null;
  progress_pct: number;
}

export interface LMSCertificate {
  id: string;
  user_id: string;
  course_id: string;
  issued_at: string;
  expires_at: string | null;
  cert_number: string | null;
  certificate_url: string | null;
  course?: LMSCourse | null;
  user_name?: string | null;
}

export interface LearningPath {
  id: string;
  org_id: string;
  hospital_id: string | null;
  title: string;
  description: string | null;
  role_target: string | null;
  is_auto_assign: boolean;
  cover_color: string;
  is_published: boolean;
  created_by: string | null;
  created_at: string;
  courses?: Array<LMSCourse & { path_sort_order: number }>;
  enrollment?: { id: string; progress_pct: number; completed_at: string | null; enrolled_at: string } | null;
  course_count?: number;
}

export interface LMSAnalytics {
  totalCourses: number;
  totalEnrollments: number;
  completionRate: number;
  avgProgress: number;
  overdueCount: number;
  certificateCount: number;
  complianceRate: number;
  topCourses: Array<{ id: string; title: string; enrolled: number; completed: number }>;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

async function getUser() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

async function getUserAndOrg() {
  const { supabase, user } = await getUser();
  if (!user) return { supabase, admin: createSupabaseAdminClient(), user: null, orgId: null };

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single();

  return { supabase, admin: createSupabaseAdminClient(), user, orgId: profile?.org_id ?? null };
}

function generateCertNumber(): string {
  const year = new Date().getFullYear();
  const hex = Math.random().toString(16).slice(2, 8).toUpperCase();
  return `CERT-${year}-${hex}`;
}

// ─────────────────────────────────────────────────────────────
// USER: Enrollments & Dashboard
// ─────────────────────────────────────────────────────────────

export async function getMyEnrollments() {
  const { supabase, user } = await getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('user_course_enrollments')
    .select('*, course:course_id(*)')
    .eq('user_id', user.id)
    .order('enrolled_at', { ascending: false });

  return data ?? [];
}

export async function getMyEnrollmentsEnhanced(): Promise<ActionResult<CourseEnrollment[]>> {
  const { supabase, user } = await getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data, error } = await supabase
    .from('user_course_enrollments')
    .select('*')
    .eq('user_id', user.id)
    .order('enrolled_at', { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as CourseEnrollment[] };
}

export async function getMyLearningData(): Promise<ActionResult<{
  enrollments: CourseEnrollment[];
  courses: Record<string, LMSCourse>;
  certificates: LMSCertificate[];
  assignments: Array<{ id: string; course_id: string; due_date: string | null; assigned_at: string; course?: LMSCourse }>;
  learningPaths: LearningPath[];
}>> {
  const { supabase, user, orgId } = await getUserAndOrg();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const [enrollRes, certRes, assignRes, pathRes] = await Promise.all([
    supabase
      .from('user_course_enrollments')
      .select('*')
      .eq('user_id', user.id)
      .order('enrolled_at', { ascending: false }),
    supabase
      .from('training_certificates')
      .select('*, course:course_id(*)')
      .eq('user_id', user.id)
      .order('issued_at', { ascending: false }),
    supabase
      .from('course_assignments')
      .select('*, course:course_id(*)')
      .eq('assigned_to', user.id)
      .order('assigned_at', { ascending: false }),
    supabase
      .from('learning_paths')
      .select(`
        *,
        courses:learning_path_courses(sort_order, is_required, course:course_id(*))
      `)
      .eq('org_id', orgId)
      .eq('is_published', true)
      .order('title'),
  ]);

  const enrolledCourseIds = (enrollRes.data ?? []).map((e: any) => e.course_id);
  // fetch all published org courses (catalog) + any enrolled course (even if unpublished since)
  const [pubRes, enrolledRes] = await Promise.all([
    supabase
      .from('training_courses')
      .select('*, module_count:training_modules(count)')
      .eq('org_id', orgId)
      .eq('is_published', true),
    enrolledCourseIds.length
      ? supabase
          .from('training_courses')
          .select('*, module_count:training_modules(count)')
          .in('id', enrolledCourseIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const coursesMap: Record<string, LMSCourse> = {};
  for (const c of [...(pubRes.data ?? []), ...(enrolledRes.data ?? [])]) {
    coursesMap[c.id] = {
      ...c,
      module_count: Array.isArray(c.module_count) ? (c.module_count[0] as any)?.count ?? 0 : 0,
    };
  }

  const pathIds = (pathRes.data ?? []).map((p: any) => p.id);
  const { data: pathEnrollData } = pathIds.length
    ? await supabase
        .from('learning_path_enrollments')
        .select('*')
        .eq('user_id', user.id)
        .in('path_id', pathIds)
    : { data: [] };

  const pathEnrollMap: Record<string, any> = {};
  for (const pe of pathEnrollData ?? []) pathEnrollMap[pe.path_id] = pe;

  const paths: LearningPath[] = (pathRes.data ?? []).map((p: any) => ({
    ...p,
    courses: (p.courses ?? []).map((pc: any) => ({
      ...pc.course,
      path_sort_order: pc.sort_order,
    })).sort((a: any, b: any) => a.path_sort_order - b.path_sort_order),
    enrollment: pathEnrollMap[p.id] ?? null,
    course_count: (p.courses ?? []).length,
  }));

  const enrolledIds = new Set(enrolledCourseIds);
  const pendingAssignments = (assignRes.data ?? []).filter(
    (a: any) => !enrolledIds.has(a.course_id)
  );

  return {
    success: true,
    data: {
      enrollments: (enrollRes.data ?? []) as CourseEnrollment[],
      courses: coursesMap,
      certificates: (certRes.data ?? []).map((c: any) => ({
        ...c,
        course: Array.isArray(c.course) ? c.course[0] : c.course,
      })) as LMSCertificate[],
      assignments: pendingAssignments,
      learningPaths: paths,
    },
  };
}

export async function getCourseForViewing(courseId: string): Promise<ActionResult<LMSCourse>> {
  const { supabase, user } = await getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const [courseRes, enrollRes, moduleProgressRes, quizRes] = await Promise.all([
    supabase.from('training_courses').select('*').eq('id', courseId).single(),
    supabase.from('user_course_enrollments').select('*').eq('user_id', user.id).eq('course_id', courseId).maybeSingle(),
    supabase.from('user_module_progress').select('*').eq('user_id', user.id),
    supabase.from('quiz_definitions').select('*').eq('course_id', courseId).maybeSingle(),
  ]);

  if (courseRes.error) return { success: false, error: courseRes.error.message };

  const [modulesRes, questionsRes] = await Promise.all([
    supabase.from('training_modules').select('*').eq('course_id', courseId).order('sort_order', { ascending: true }),
    quizRes.data
      ? supabase.from('quiz_questions').select('*').eq('quiz_id', quizRes.data.id).order('sort_order', { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);

  const progressMap: Record<string, any> = {};
  for (const p of moduleProgressRes.data ?? []) progressMap[p.module_id] = p;

  const modules: LMSModule[] = (modulesRes.data ?? []).map(m => ({
    ...m,
    progress: progressMap[m.id] ?? null,
  }));

  // only attach quiz if it actually has questions
  const questions = questionsRes.data ?? [];
  const quiz = quizRes.data && questions.length > 0
    ? { ...quizRes.data, questions }
    : null;

  return {
    success: true,
    data: {
      ...courseRes.data,
      modules,
      quiz,
      enrollment: enrollRes.data ?? null,
    } as LMSCourse,
  };
}

export async function enrollInCourse(courseId: string): Promise<ActionResult<CourseEnrollment>> {
  const { supabase, user } = await getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data: assignment } = await supabase
    .from('course_assignments')
    .select('due_date')
    .eq('course_id', courseId)
    .eq('assigned_to', user.id)
    .maybeSingle();

  const { data: course } = await supabase
    .from('training_courses')
    .select('due_days')
    .eq('id', courseId)
    .single();

  let dueDate: string | null = assignment?.due_date ?? null;
  if (!dueDate && course?.due_days) {
    const d = new Date();
    d.setDate(d.getDate() + course.due_days);
    dueDate = d.toISOString();
  }

  const { data, error } = await supabase
    .from('user_course_enrollments')
    .upsert(
      { user_id: user.id, course_id: courseId, due_date: dueDate },
      { onConflict: 'user_id,course_id' }
    )
    .select('*')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as CourseEnrollment };
}

export async function updateModuleProgress(
  moduleId: string,
  courseId: string,
  timeSecs: number,
): Promise<ActionResult<{ pct: number }>> {
  const { supabase, user } = await getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  await supabase
    .from('user_module_progress')
    .upsert(
      { user_id: user.id, module_id: moduleId, completed_at: new Date().toISOString(), time_spent_secs: timeSecs },
      { onConflict: 'user_id,module_id' }
    );

  const { data: courseModules } = await supabase
    .from('training_modules')
    .select('id')
    .eq('course_id', courseId);
  const moduleIds = (courseModules ?? []).map(m => m.id);

  const [{ count: totalCount }, { count: doneCount }] = await Promise.all([
    supabase.from('training_modules').select('*', { count: 'exact', head: true }).eq('course_id', courseId),
    moduleIds.length > 0
      ? supabase.from('user_module_progress').select('*', { count: 'exact', head: true })
          .eq('user_id', user.id).not('completed_at', 'is', null)
          .in('module_id', moduleIds)
      : Promise.resolve({ count: 0, data: null, error: null }),
  ]);

  const total = totalCount ?? 0;
  const done  = doneCount  ?? 0;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;

  await supabase
    .from('user_course_enrollments')
    .update({
      progress_pct: pct,
      ...(pct === 100 ? { completed_at: new Date().toISOString() } : {}),
    })
    .eq('user_id', user.id)
    .eq('course_id', courseId);

  // auto-issue certificate if course has no quiz OR quiz has 0 questions
  if (pct === 100) {
    const { data: quizDef } = await supabase
      .from('quiz_definitions')
      .select('id')
      .eq('course_id', courseId)
      .maybeSingle();
    let hasRealQuiz = false;
    if (quizDef?.id) {
      const { count: qCount } = await supabase
        .from('quiz_questions')
        .select('*', { count: 'exact', head: true })
        .eq('quiz_id', quizDef.id);
      hasRealQuiz = (qCount ?? 0) > 0;
    }
    if (!hasRealQuiz) {
      await issueCertificate(courseId);
    }
  }

  return { success: true, data: { pct } };
}

// ─────────────────────────────────────────────────────────────
// USER: Quiz
// ─────────────────────────────────────────────────────────────

export async function getQuizForCourse(courseId: string): Promise<ActionResult<QuizDefinition>> {
  const { supabase, user } = await getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data: quiz, error } = await supabase
    .from('quiz_definitions')
    .select('*')
    .eq('course_id', courseId)
    .single();

  if (error) return { success: false, error: 'No quiz found for this course' };

  const { data: questions } = await supabase
    .from('quiz_questions')
    .select('*')
    .eq('quiz_id', quiz.id)
    .order('sort_order', { ascending: true });

  return {
    success: true,
    data: { ...quiz, questions: (questions ?? []) as QuizQuestion[] },
  };
}

export async function getMyQuizAttempts(quizId: string): Promise<ActionResult<QuizAttempt[]>> {
  const { supabase, user } = await getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data, error } = await supabase
    .from('quiz_attempts')
    .select('*')
    .eq('user_id', user.id)
    .eq('quiz_id', quizId)
    .order('started_at', { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as QuizAttempt[] };
}

export async function submitQuizAttempt(
  quizId: string,
  courseId: string,
  answers: Record<string, string>,
): Promise<ActionResult<{ score: number; passed: boolean; attemptId: string }>> {
  const { supabase, user } = await getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data: quiz } = await supabase
    .from('quiz_definitions')
    .select('pass_score, max_attempts')
    .eq('id', quizId)
    .single();

  if (!quiz) return { success: false, error: 'Quiz not found' };

  const { count: attemptCount } = await supabase
    .from('quiz_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('quiz_id', quizId);

  if ((attemptCount ?? 0) >= quiz.max_attempts) {
    return { success: false, error: `Maximum ${quiz.max_attempts} attempts reached` };
  }

  const { data: questions } = await supabase
    .from('quiz_questions')
    .select('id, question_type, options, correct_answer, points')
    .eq('quiz_id', quizId);

  let totalPoints = 0;
  let earnedPoints = 0;

  for (const q of questions ?? []) {
    totalPoints += q.points;
    const userAnswer = answers[q.id];

    if (q.question_type === 'essay') {
      // Essay always awards full points
      earnedPoints += q.points;
    } else if (q.question_type === 'fill_in_blank') {
      // Case-insensitive text match against correct_answer
      if (userAnswer && q.correct_answer &&
          userAnswer.trim().toLowerCase() === (q.correct_answer as string).trim().toLowerCase()) {
        earnedPoints += q.points;
      }
    } else {
      // multiple_choice / true_false — option ID match
      if (userAnswer) {
        const options = q.options as QuizOption[];
        const selected = options.find(o => o.id === userAnswer);
        if (selected?.is_correct) earnedPoints += q.points;
      }
    }
  }

  const score  = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
  const passed = score >= quiz.pass_score;

  const { data: attempt } = await supabase
    .from('quiz_attempts')
    .insert({
      user_id: user.id, quiz_id: quizId, course_id: courseId,
      answers, score, passed, submitted_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (passed) {
    await supabase
      .from('user_course_enrollments')
      .update({ progress_pct: 100, completed_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('course_id', courseId);

    await issueCertificate(courseId);
  }

  return { success: true, data: { score, passed, attemptId: attempt?.id ?? '' } };
}

// ─────────────────────────────────────────────────────────────
// USER: Certificates
// ─────────────────────────────────────────────────────────────

async function issueCertificate(courseId: string) {
  const { user } = await getUser();
  if (!user) return;
  const admin = createSupabaseAdminClient();

  const { data: existing } = await admin
    .from('training_certificates')
    .select('id')
    .eq('user_id', user.id)
    .eq('course_id', courseId)
    .maybeSingle();

  if (existing) return;

  const { data: course } = await admin
    .from('training_courses')
    .select('expires_after_days')
    .eq('id', courseId)
    .single();

  let expiresAt: string | null = null;
  if (course?.expires_after_days) {
    const d = new Date();
    d.setDate(d.getDate() + course.expires_after_days);
    expiresAt = d.toISOString();
  }

  await admin.from('training_certificates').upsert(
    {
      user_id: user.id,
      course_id: courseId,
      cert_number: generateCertNumber(),
      issued_at: new Date().toISOString(),
      expires_at: expiresAt,
    },
    { onConflict: 'user_id,course_id' }
  );
}

export async function generateCertificate(courseId: string): Promise<ActionResult<{ certId: string }>> {
  const { user } = await getUser();
  if (!user) return { success: false, error: 'Unauthorized' };
  const admin = createSupabaseAdminClient();

  const { data: enrollment } = await admin
    .from('user_course_enrollments')
    .select('completed_at, progress_pct')
    .eq('user_id', user.id)
    .eq('course_id', courseId)
    .maybeSingle();

  if (!enrollment?.completed_at && (enrollment?.progress_pct ?? 0) < 100) {
    return { success: false, error: 'Course not completed yet' };
  }

  await issueCertificate(courseId);

  const { data: cert } = await admin
    .from('training_certificates')
    .select('id')
    .eq('user_id', user.id)
    .eq('course_id', courseId)
    .single();

  if (!cert?.id) return { success: false, error: 'Certificate could not be generated' };

  return { success: true, data: { certId: cert.id } };
}

export async function getCertificate(certId: string): Promise<ActionResult<LMSCertificate & {
  holderName: string;
  holderJobTitle: string | null;
  hospitalName: string | null;
  orgName: string | null;
}>> {
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from('training_certificates')
    .select('*, course:course_id(*), holder:user_id(first_name, last_name, job_title, org_id)')
    .eq('id', certId)
    .single();

  if (error) return { success: false, error: error.message };

  const holder   = Array.isArray(data.holder) ? data.holder[0] : data.holder;
  const holderName = [holder?.first_name, holder?.last_name].filter(Boolean).join(' ') || 'Unknown';

  // fetch hospital name (first hospital assignment) and org name
  let hospitalName: string | null = null;
  let orgName: string | null = null;
  if (holder?.org_id) {
    const [hospRes, orgRes] = await Promise.all([
      admin
        .from('user_hospital_roles')
        .select('hospital:hospital_id(name)')
        .eq('user_id', data.user_id)
        .limit(1)
        .maybeSingle(),
      admin.from('organizations').select('name').eq('id', holder.org_id).maybeSingle(),
    ]);
    const hosp = hospRes.data?.hospital as any;
    hospitalName = Array.isArray(hosp) ? hosp[0]?.name : hosp?.name ?? null;
    orgName = orgRes.data?.name ?? null;
  }

  return {
    success: true,
    data: {
      ...data,
      course: Array.isArray(data.course) ? data.course[0] : data.course,
      holderName,
      holderJobTitle: holder?.job_title ?? null,
      hospitalName,
      orgName,
    },
  };
}

export async function getCertPreviewData(courseId: string): Promise<ActionResult<{
  displayName: string;
  jobTitle: string;
  hospitalName: string;
  orgName: string;
}>> {
  const { user } = await getUser();
  if (!user) return { success: false, error: 'Unauthorized' };
  const admin = createSupabaseAdminClient();

  const [profileRes, hospitalRes] = await Promise.all([
    admin.from('profiles').select('first_name, last_name, job_title, org_id').eq('id', user.id).maybeSingle(),
    admin.from('user_hospital_roles').select('hospital:hospital_id(name)').eq('user_id', user.id).limit(1).maybeSingle(),
  ]);

  const profile = profileRes.data;
  const displayName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Your Name';
  const hosp = hospitalRes.data?.hospital as any;
  const hospitalName = (Array.isArray(hosp) ? hosp[0]?.name : hosp?.name) ?? '';

  let orgName = '';
  if (profile?.org_id) {
    const { data: org } = await admin.from('organizations').select('name').eq('id', profile.org_id).maybeSingle();
    orgName = org?.name ?? '';
  }

  return {
    success: true,
    data: {
      displayName,
      jobTitle: profile?.job_title ?? '',
      hospitalName,
      orgName,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// USER: Learning Paths
// ─────────────────────────────────────────────────────────────

export async function enrollInLearningPath(pathId: string): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { error } = await supabase
    .from('learning_path_enrollments')
    .upsert({ user_id: user.id, path_id: pathId }, { onConflict: 'user_id,path_id' });

  if (error) return { success: false, error: error.message };
  return { success: true, data: undefined };
}

// ─────────────────────────────────────────────────────────────
// ADMIN: Courses
// ─────────────────────────────────────────────────────────────

export async function getAdminCourses(filters?: {
  search?: string;
  category?: string;
  status?: 'all' | 'published' | 'draft';
}): Promise<ActionResult<LMSCourse[]>> {
  const { admin, user, orgId } = await getUserAndOrg();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  let query = admin
    .from('training_courses')
    .select('*, module_count:training_modules(count)')
    .eq('org_id', orgId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (filters?.status === 'published') query = query.eq('is_published', true);
  if (filters?.status === 'draft') query = query.eq('is_published', false);
  if (filters?.search) query = query.ilike('title', `%${filters.search}%`);
  if (filters?.category) query = query.eq('category', filters.category);

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    data: (data ?? []).map((c: any) => ({
      ...c,
      module_count: Array.isArray(c.module_count) ? (c.module_count[0]?.count ?? 0) : 0,
    })) as LMSCourse[],
  };
}

export async function createCourse(input: {
  title: string;
  description?: string | null;
  category?: string | null;
  level?: string;
  is_required?: boolean;
  compliance_type?: string | null;
  expires_after_days?: number | null;
  pass_score?: number;
  estimated_hours?: number;
  due_days?: number | null;
  hospital_id?: string | null;
  cover_color?: string;
  tags?: string[];
}): Promise<ActionResult<LMSCourse>> {
  const { admin, user, orgId } = await getUserAndOrg();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const { data, error } = await admin
    .from('training_courses')
    .insert({
      ...input,
      org_id: orgId,
      created_by: user.id,
      is_published: false,
    })
    .select('*')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as LMSCourse };
}

export async function updateCourse(
  id: string,
  input: Partial<{
    title: string;
    description: string | null;
    category: string | null;
    level: string;
    is_required: boolean;
    is_published: boolean;
    compliance_type: string | null;
    expires_after_days: number | null;
    pass_score: number;
    estimated_hours: number;
    due_days: number | null;
    hospital_id: string | null;
    cover_color: string;
    tags: string[];
    thumbnail_url: string | null;
  }>
): Promise<ActionResult<LMSCourse>> {
  const { admin, user, orgId } = await getUserAndOrg();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const { data, error } = await admin
    .from('training_courses')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', orgId)
    .select('*')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as LMSCourse };
}

export async function deleteCourse(id: string): Promise<ActionResult> {
  const { admin, user, orgId } = await getUserAndOrg();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const { error } = await admin
    .from('training_courses')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId);

  if (error) return { success: false, error: error.message };
  return { success: true, data: undefined };
}

// ─────────────────────────────────────────────────────────────
// ADMIN: Modules
// ─────────────────────────────────────────────────────────────

export async function getModulesForCourse(courseId: string): Promise<ActionResult<LMSModule[]>> {
  const { supabase, user } = await getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data, error } = await supabase
    .from('training_modules')
    .select('*')
    .eq('course_id', courseId)
    .order('sort_order', { ascending: true });

  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as LMSModule[] };
}

export async function createModule(courseId: string, input: {
  title: string;
  description?: string | null;
  content_type: LMSModule['content_type'];
  content_url?: string | null;
  content?: string | null;
  file_name?: string | null;
  storage_path?: string | null;
  file_size?: number | null;
  duration_mins?: number;
  sort_order?: number;
  is_required?: boolean;
}): Promise<ActionResult<LMSModule>> {
  const { supabase, user } = await getUser();
  if (!user) return { success: false, error: 'Unauthorized' };
  const admin = createSupabaseAdminClient();

  const { data: maxOrder } = await supabase
    .from('training_modules')
    .select('sort_order')
    .eq('course_id', courseId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = (maxOrder?.sort_order ?? -1) + 1;

  const { data, error } = await admin
    .from('training_modules')
    .insert({ ...input, course_id: courseId, sort_order: input.sort_order ?? nextOrder })
    .select('*')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as LMSModule };
}

export async function updateModule(id: string, input: Partial<LMSModule>): Promise<ActionResult<LMSModule>> {
  const { user } = await getUser();
  if (!user) return { success: false, error: 'Unauthorized' };
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from('training_modules')
    .update(input)
    .eq('id', id)
    .select('*')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as LMSModule };
}

export async function deleteModule(id: string): Promise<ActionResult> {
  const { user } = await getUser();
  if (!user) return { success: false, error: 'Unauthorized' };
  const admin = createSupabaseAdminClient();

  const { error } = await admin.from('training_modules').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true, data: undefined };
}

export async function reorderModules(items: Array<{ id: string; sort_order: number }>): Promise<ActionResult> {
  const { user } = await getUser();
  if (!user) return { success: false, error: 'Unauthorized' };
  const admin = createSupabaseAdminClient();

  for (const item of items) {
    await admin
      .from('training_modules')
      .update({ sort_order: item.sort_order })
      .eq('id', item.id);
  }

  return { success: true, data: undefined };
}

// ─────────────────────────────────────────────────────────────
// ADMIN: Quiz
// ─────────────────────────────────────────────────────────────

export async function getQuizForAdmin(courseId: string): Promise<ActionResult<QuizDefinition | null>> {
  const { supabase, user } = await getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data: quiz } = await supabase
    .from('quiz_definitions')
    .select('*')
    .eq('course_id', courseId)
    .maybeSingle();

  if (!quiz) return { success: true, data: null };

  const { data: questions } = await supabase
    .from('quiz_questions')
    .select('*')
    .eq('quiz_id', quiz.id)
    .order('sort_order', { ascending: true });

  return {
    success: true,
    data: { ...quiz, questions: (questions ?? []) as QuizQuestion[] },
  };
}

export async function upsertQuiz(courseId: string, input: {
  title: string;
  description?: string | null;
  pass_score: number;
  max_attempts: number;
  time_limit?: number | null;
  randomize?: boolean;
}): Promise<ActionResult<QuizDefinition>> {
  const { user } = await getUser();
  if (!user) return { success: false, error: 'Unauthorized' };
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from('quiz_definitions')
    .upsert({ ...input, course_id: courseId }, { onConflict: 'course_id' })
    .select('*')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as QuizDefinition };
}

export async function createQuizQuestion(quizId: string, input: {
  question_text: string;
  question_type: QuizQuestion['question_type'];
  options: QuizOption[];
  correct_answer?: string | null;
  explanation?: string | null;
  points?: number;
  sort_order?: number;
}): Promise<ActionResult<QuizQuestion>> {
  const { supabase, user } = await getUser();
  if (!user) return { success: false, error: 'Unauthorized' };
  const admin = createSupabaseAdminClient();

  const { data: maxOrder } = await supabase
    .from('quiz_questions')
    .select('sort_order')
    .eq('quiz_id', quizId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = (maxOrder?.sort_order ?? -1) + 1;

  const { data, error } = await admin
    .from('quiz_questions')
    .insert({ ...input, quiz_id: quizId, sort_order: input.sort_order ?? nextOrder })
    .select('*')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as QuizQuestion };
}

export async function updateQuizQuestion(id: string, input: Partial<QuizQuestion>): Promise<ActionResult<QuizQuestion>> {
  const { user } = await getUser();
  if (!user) return { success: false, error: 'Unauthorized' };
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from('quiz_questions')
    .update(input)
    .eq('id', id)
    .select('*')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as QuizQuestion };
}

export async function deleteQuizQuestion(id: string): Promise<ActionResult> {
  const { user } = await getUser();
  if (!user) return { success: false, error: 'Unauthorized' };
  const admin = createSupabaseAdminClient();

  const { error } = await admin.from('quiz_questions').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true, data: undefined };
}

// ─────────────────────────────────────────────────────────────
// ADMIN: Assignments
// ─────────────────────────────────────────────────────────────

// shared helper: upsert course_assignments + user_course_enrollments for a list of user IDs
async function _upsertAssignAndEnroll(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  courseId: string,
  orgId: string,
  assignedBy: string,
  userIds: string[],
  dueDate: string | null,
): Promise<{ assigned: number; error?: string }> {
  if (!userIds.length) return { assigned: 0 };

  const assignRows = userIds.map(uid => ({
    course_id: courseId,
    org_id: orgId,
    assigned_to: uid,
    assigned_by: assignedBy,
    due_date: dueDate,
  }));

  const enrollRows = userIds.map(uid => ({
    user_id: uid,
    course_id: courseId,
    due_date: dueDate,
    progress_pct: 0,
  }));

  const [{ error: aErr }, { error: eErr }] = await Promise.all([
    admin.from('course_assignments').upsert(assignRows, { onConflict: 'course_id,assigned_to' }),
    admin.from('user_course_enrollments').upsert(enrollRows, { onConflict: 'user_id,course_id' }),
  ]);

  if (aErr) return { assigned: 0, error: aErr.message };
  if (eErr) return { assigned: 0, error: eErr.message };
  return { assigned: userIds.length };
}

export async function assignCourse(
  courseId: string,
  userIds: string[],
  dueDate?: string | null,
): Promise<ActionResult<{ assigned: number }>> {
  const { admin, user, orgId } = await getUserAndOrg();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const result = await _upsertAssignAndEnroll(admin, courseId, orgId, user.id, userIds, dueDate ?? null);
  if (result.error) return { success: false, error: result.error };
  return { success: true, data: { assigned: result.assigned } };
}

export async function assignCourseToAll(
  courseId: string,
  dueDate?: string | null,
): Promise<ActionResult<{ assigned: number }>> {
  const { admin, user, orgId } = await getUserAndOrg();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const { data: staff, error: pErr } = await admin
    .from('profiles')
    .select('id')
    .eq('org_id', orgId)
    .eq('is_active', true);

  if (pErr || !staff) return { success: false, error: pErr?.message ?? 'Could not fetch users' };

  const result = await _upsertAssignAndEnroll(
    admin, courseId, orgId, user.id,
    staff.map(u => u.id),
    dueDate ?? null,
  );
  if (result.error) return { success: false, error: result.error };
  return { success: true, data: { assigned: result.assigned } };
}

export async function assignCourseByRoles(
  courseId: string,
  roles: string[],
  dueDate?: string | null,
): Promise<ActionResult<{ assigned: number }>> {
  const { admin, user, orgId } = await getUserAndOrg();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };
  if (!roles.length) return { success: true, data: { assigned: 0 } };

  const [hospRolesRes, orgRolesRes] = await Promise.all([
    admin.from('user_hospital_roles').select('user_id').in('role', roles),
    admin.from('org_user_roles').select('user_id').in('role', roles),
  ]);

  const allIds = Array.from(new Set([
    ...(hospRolesRes.data ?? []).map(r => r.user_id),
    ...(orgRolesRes.data ?? []).map(r => r.user_id),
  ]));

  if (!allIds.length) return { success: true, data: { assigned: 0 } };

  const { data: orgUsers } = await admin
    .from('profiles')
    .select('id')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .in('id', allIds);

  const userIds = (orgUsers ?? []).map(u => u.id);
  if (!userIds.length) return { success: true, data: { assigned: 0 } };

  const result = await _upsertAssignAndEnroll(admin, courseId, orgId, user.id, userIds, dueDate ?? null);
  if (result.error) return { success: false, error: result.error };
  return { success: true, data: { assigned: result.assigned } };
}

export async function getCourseAssignmentInfo(courseId: string): Promise<ActionResult<{ assignedCount: number; totalStaff: number }>> {
  const { admin, user, orgId } = await getUserAndOrg();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const [{ count: assignedCount }, { count: totalStaff }] = await Promise.all([
    admin.from('course_assignments').select('*', { count: 'exact', head: true }).eq('course_id', courseId),
    admin.from('profiles').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('is_active', true),
  ]);

  return { success: true, data: { assignedCount: assignedCount ?? 0, totalStaff: totalStaff ?? 0 } };
}

export async function getOrgUsers(): Promise<ActionResult<Array<{ id: string; name: string; job_title: string | null; department: string | null }>>> {
  const { supabase, user, orgId } = await getUserAndOrg();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const { data, error } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, job_title, department')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('first_name');

  if (error) return { success: false, error: error.message };

  return {
    success: true,
    data: (data ?? []).map(p => ({
      id: p.id,
      name: [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown',
      job_title: p.job_title,
      department: p.department,
    })),
  };
}

export async function getAdminEnrollments(): Promise<ActionResult<Array<{
  id: string;
  user_id: string;
  course_id: string;
  progress_pct: number;
  completed_at: string | null;
  due_date: string | null;
  enrolled_at: string;
  user_name: string;
  course_title: string;
}>>> {
  const { admin, user, orgId } = await getUserAndOrg();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const { data, error } = await admin
    .from('user_course_enrollments')
    .select(`
      *,
      user:user_id(first_name, last_name),
      course:course_id(title, org_id)
    `)
    .order('enrolled_at', { ascending: false })
    .limit(200);

  if (error) return { success: false, error: error.message };

  const filtered = (data ?? []).filter((e: any) => {
    const c = Array.isArray(e.course) ? e.course[0] : e.course;
    return c?.org_id === orgId;
  });

  return {
    success: true,
    data: filtered.map((e: any) => {
      const u = Array.isArray(e.user) ? e.user[0] : e.user;
      const c = Array.isArray(e.course) ? e.course[0] : e.course;
      return {
        id: e.id,
        user_id: e.user_id,
        course_id: e.course_id,
        progress_pct: e.progress_pct,
        completed_at: e.completed_at,
        due_date: e.due_date,
        enrolled_at: e.enrolled_at,
        user_name: [u?.first_name, u?.last_name].filter(Boolean).join(' ') || 'Unknown',
        course_title: c?.title ?? 'Unknown',
      };
    }),
  };
}

// ─────────────────────────────────────────────────────────────
// ADMIN: Detailed Enrollments (time + module tracking)
// ─────────────────────────────────────────────────────────────

export interface DetailedEnrollment {
  id: string;
  user_id: string;
  course_id: string;
  user_name: string;
  user_email: string | null;
  job_title: string | null;
  department: string | null;
  avatar_url: string | null;
  course_title: string;
  course_color: string;
  progress_pct: number;
  completed_at: string | null;
  enrolled_at: string;
  due_date: string | null;
  time_spent_secs: number;
  modules_total: number;
  modules_done: number;
  last_activity: string | null;
}

export async function getDetailedEnrollments(): Promise<ActionResult<DetailedEnrollment[]>> {
  const { admin, user, orgId } = await getUserAndOrg();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  // 1. fetch enrollments with user + course info
  const { data, error } = await admin
    .from('user_course_enrollments')
    .select(`
      *,
      user:user_id(first_name, last_name, email, job_title, department, avatar_url),
      course:course_id(id, title, cover_color, org_id)
    `)
    .order('enrolled_at', { ascending: false })
    .limit(500);

  if (error) return { success: false, error: error.message };

  const orgRows = (data ?? []).filter((e: any) => {
    const c = Array.isArray(e.course) ? e.course[0] : e.course;
    return c?.org_id === orgId;
  });

  if (!orgRows.length) return { success: true, data: [] };

  // 2. fetch module progress for time + completion counts
  const enrollmentIds = orgRows.map((e: any) => e.id);
  const courseIds = [...new Set(orgRows.map((e: any) => e.course_id))];

  const [progressRes, modulesRes] = await Promise.all([
    admin
      .from('user_module_progress')
      .select('user_id, module_id, completed_at, time_spent_secs, updated_at')
      .in('user_id', orgRows.map((e: any) => e.user_id)),
    admin
      .from('training_modules')
      .select('id, course_id')
      .in('course_id', courseIds),
  ]);

  // build lookup: courseId → total module count
  const modulesPerCourse: Record<string, string[]> = {};
  for (const m of modulesRes.data ?? []) {
    if (!modulesPerCourse[m.course_id]) modulesPerCourse[m.course_id] = [];
    modulesPerCourse[m.course_id].push(m.id);
  }

  // build lookup: userId+moduleId → progress row
  const progressMap: Record<string, any> = {};
  for (const p of progressRes.data ?? []) {
    progressMap[`${p.user_id}:${p.module_id}`] = p;
  }

  return {
    success: true,
    data: orgRows.map((e: any): DetailedEnrollment => {
      const u = Array.isArray(e.user) ? e.user[0] : e.user;
      const c = Array.isArray(e.course) ? e.course[0] : e.course;
      const mods = modulesPerCourse[e.course_id] ?? [];
      let timeSecs = 0;
      let done = 0;
      let lastActivity: string | null = null;
      for (const modId of mods) {
        const p = progressMap[`${e.user_id}:${modId}`];
        if (p) {
          timeSecs += p.time_spent_secs ?? 0;
          if (p.completed_at) done++;
          if (!lastActivity || (p.updated_at && p.updated_at > lastActivity)) lastActivity = p.updated_at;
        }
      }
      return {
        id: e.id,
        user_id: e.user_id,
        course_id: e.course_id,
        user_name: [u?.first_name, u?.last_name].filter(Boolean).join(' ') || 'Unknown',
        user_email: u?.email ?? null,
        job_title: u?.job_title ?? null,
        department: u?.department ?? null,
        avatar_url: u?.avatar_url ?? null,
        course_title: c?.title ?? 'Unknown',
        course_color: c?.cover_color ?? '#f97316',
        progress_pct: e.progress_pct ?? 0,
        completed_at: e.completed_at,
        enrolled_at: e.enrolled_at,
        due_date: e.due_date,
        time_spent_secs: timeSecs,
        modules_total: mods.length,
        modules_done: done,
        last_activity: lastActivity,
      };
    }),
  };
}

// ─────────────────────────────────────────────────────────────
// Seed default YouTube courses
// ─────────────────────────────────────────────────────────────

const DEFAULT_COURSES: Array<{
  title: string; description: string; category: string; level: string;
  cover_color: string; estimated_hours: number; tags: string[];
  is_required: boolean; compliance_type: string | null;
  videos: Array<{ title: string; url: string; youtubeId: string }>;
}> = [
  {
    title: 'CPR & First Aid Essentials',
    description: 'Life-saving CPR and first aid techniques every staff member must know.',
    category: 'cpr', level: 'beginner', cover_color: '#ef4444',
    estimated_hours: 1.5, is_required: true, compliance_type: 'CPR',
    tags: ['cpr', 'first-aid', 'required'],
    videos: [
      { title: 'CPR Step-by-Step Guide', url: 'https://www.youtube.com/watch?v=cosVBV96E2g', youtubeId: 'cosVBV96E2g' },
      { title: 'How to Use an AED', url: 'https://www.youtube.com/watch?v=WH9Vt4apCgg', youtubeId: 'WH9Vt4apCgg' },
    ],
  },
  {
    title: 'OSHA Workplace Safety',
    description: 'OSHA standards for veterinary clinics — hazard identification, PPE and incident reporting.',
    category: 'osha', level: 'beginner', cover_color: '#f59e0b',
    estimated_hours: 2, is_required: true, compliance_type: 'OSHA',
    tags: ['osha', 'safety', 'compliance', 'required'],
    videos: [
      { title: 'OSHA Safety Orientation', url: 'https://www.youtube.com/watch?v=uCJ1p7VIGbA', youtubeId: 'uCJ1p7VIGbA' },
      { title: 'PPE Usage & Selection', url: 'https://www.youtube.com/watch?v=qBj3PB_j3y0', youtubeId: 'qBj3PB_j3y0' },
    ],
  },
  {
    title: 'Animal Handling & Restraint',
    description: 'Safe handling techniques for dogs, cats and exotic animals in a clinical setting.',
    category: 'clinical', level: 'intermediate', cover_color: '#10b981',
    estimated_hours: 2.5, is_required: true, compliance_type: null,
    tags: ['animal-handling', 'clinical', 'safety'],
    videos: [
      { title: 'Dog Restraint Techniques', url: 'https://www.youtube.com/watch?v=K7IWgVL5GiM', youtubeId: 'K7IWgVL5GiM' },
      { title: 'Cat Handling in the Clinic', url: 'https://www.youtube.com/watch?v=T-PNxS5N7zI', youtubeId: 'T-PNxS5N7zI' },
    ],
  },
  {
    title: 'Client Communication Skills',
    description: 'Build trust with pet owners — empathy, active listening and delivering difficult news.',
    category: 'hr', level: 'beginner', cover_color: '#3b82f6',
    estimated_hours: 1, is_required: false, compliance_type: null,
    tags: ['communication', 'client-service', 'soft-skills'],
    videos: [
      { title: 'Effective Communication in Healthcare', url: 'https://www.youtube.com/watch?v=Z8I1UQi2QBE', youtubeId: 'Z8I1UQi2QBE' },
      { title: 'Delivering Difficult News to Pet Owners', url: 'https://www.youtube.com/watch?v=y8Ozg5UXHMo', youtubeId: 'y8Ozg5UXHMo' },
    ],
  },
  {
    title: 'Infection Control & Sterilisation',
    description: 'Hospital hygiene protocols, sterilisation procedures and infection prevention.',
    category: 'safety', level: 'intermediate', cover_color: '#6366f1',
    estimated_hours: 2, is_required: true, compliance_type: 'Hospital Compliance',
    tags: ['infection-control', 'hygiene', 'compliance'],
    videos: [
      { title: 'Surgical Instrument Sterilisation', url: 'https://www.youtube.com/watch?v=HlFLOq4Hmfw', youtubeId: 'HlFLOq4Hmfw' },
      { title: 'Hand Hygiene Best Practices', url: 'https://www.youtube.com/watch?v=IisgnbMfKvI', youtubeId: 'IisgnbMfKvI' },
    ],
  },
  {
    title: 'Veterinary Pharmacology Basics',
    description: 'Common medications, controlled substances, dosage calculation and safe administration.',
    category: 'clinical', level: 'intermediate', cover_color: '#8b5cf6',
    estimated_hours: 3, is_required: false, compliance_type: null,
    tags: ['pharmacology', 'medications', 'clinical'],
    videos: [
      { title: 'Introduction to Veterinary Drugs', url: 'https://www.youtube.com/watch?v=9b4vRBpHGko', youtubeId: '9b4vRBpHGko' },
      { title: 'Drug Dosage Calculations', url: 'https://www.youtube.com/watch?v=HGSjLkfC-bY', youtubeId: 'HGSjLkfC-bY' },
    ],
  },
];

export async function seedDefaultCourses(): Promise<ActionResult<{ seeded: number }>> {
  const { admin, user, orgId } = await getUserAndOrg();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  let seeded = 0;
  for (const c of DEFAULT_COURSES) {
    // skip if a course with same title already exists for this org
    const { data: existing } = await admin
      .from('training_courses')
      .select('id')
      .eq('org_id', orgId)
      .eq('title', c.title)
      .maybeSingle();
    if (existing) continue;

    const { data: course, error: cErr } = await admin
      .from('training_courses')
      .insert({
        org_id: orgId,
        title: c.title,
        description: c.description,
        category: c.category,
        level: c.level,
        cover_color: c.cover_color,
        estimated_hours: c.estimated_hours,
        is_required: c.is_required,
        compliance_type: c.compliance_type,
        tags: c.tags,
        is_published: true,
        pass_score: 80,
        created_by: user.id,
      })
      .select('id')
      .single();

    if (cErr || !course) continue;

    for (let i = 0; i < c.videos.length; i++) {
      const v = c.videos[i];
      await admin.from('training_modules').insert({
        course_id: course.id,
        title: v.title,
        content_type: 'video',
        content_url: v.url,
        sort_order: i + 1,
        duration_mins: 10,
        is_required: true,
      });
    }
    seeded++;
  }

  return { success: true, data: { seeded } };
}

// ─────────────────────────────────────────────────────────────
// ADMIN: Learning Paths
// ─────────────────────────────────────────────────────────────

export async function getModuleViewCounts(courseId: string): Promise<Record<string, number>> {
  const { admin, user } = await getUserAndOrg();
  if (!user) return {};

  const { data: mods } = await admin
    .from('training_modules')
    .select('id')
    .eq('course_id', courseId);
  const moduleIds = (mods ?? []).map(m => m.id);
  if (!moduleIds.length) return {};

  const { data } = await admin
    .from('user_module_progress')
    .select('module_id')
    .in('module_id', moduleIds);

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.module_id] = (counts[row.module_id] ?? 0) + 1;
  }
  return counts;
}

export async function getAdminLearningPaths(): Promise<ActionResult<LearningPath[]>> {
  const { admin, user, orgId } = await getUserAndOrg();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const { data, error } = await admin
    .from('learning_paths')
    .select('*, courses:learning_path_courses(sort_order, course:course_id(id, title))')
    .eq('org_id', orgId)
    .order('title');

  if (error) return { success: false, error: error.message };

  return {
    success: true,
    data: (data ?? []).map((p: any) => ({
      ...p,
      course_count: (p.courses ?? []).length,
      courses: (p.courses ?? []).map((pc: any) => ({
        ...(Array.isArray(pc.course) ? pc.course[0] : pc.course),
        path_sort_order: pc.sort_order,
      })).sort((a: any, b: any) => a.path_sort_order - b.path_sort_order),
    })) as LearningPath[],
  };
}

export async function createLearningPath(input: {
  title: string;
  description?: string | null;
  role_target?: string | null;
  is_auto_assign?: boolean;
  cover_color?: string;
  hospital_id?: string | null;
}): Promise<ActionResult<LearningPath>> {
  const { admin, user, orgId } = await getUserAndOrg();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const { data, error } = await admin
    .from('learning_paths')
    .insert({ ...input, org_id: orgId, created_by: user.id, is_published: true })
    .select('*')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: { ...data, courses: [], course_count: 0 } as LearningPath };
}

export async function updateLearningPath(id: string, input: Partial<LearningPath>): Promise<ActionResult<LearningPath>> {
  const { admin, user, orgId } = await getUserAndOrg();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const { data, error } = await admin
    .from('learning_paths')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', orgId)
    .select('*')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as LearningPath };
}

export async function addCourseToPath(pathId: string, courseId: string): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data: maxOrder } = await supabase
    .from('learning_path_courses')
    .select('sort_order')
    .eq('path_id', pathId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from('learning_path_courses')
    .upsert(
      { path_id: pathId, course_id: courseId, sort_order: (maxOrder?.sort_order ?? -1) + 1 },
      { onConflict: 'path_id,course_id' }
    );

  if (error) return { success: false, error: error.message };
  return { success: true, data: undefined };
}

export async function removeCourseFromPath(pathId: string, courseId: string): Promise<ActionResult> {
  const { user } = await getUser();
  if (!user) return { success: false, error: 'Unauthorized' };
  const admin = createSupabaseAdminClient();

  const { error } = await admin
    .from('learning_path_courses')
    .delete()
    .eq('path_id', pathId)
    .eq('course_id', courseId);

  if (error) return { success: false, error: error.message };
  return { success: true, data: undefined };
}

// ─────────────────────────────────────────────────────────────
// ADMIN: Analytics
// ─────────────────────────────────────────────────────────────

export async function getTrainingAnalytics(): Promise<ActionResult<LMSAnalytics>> {
  const { supabase, user, orgId } = await getUserAndOrg();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const [courseCount, enrollmentData, certCount] = await Promise.all([
    supabase.from('training_courses').select('*', { count: 'exact', head: true }).eq('org_id', orgId),
    supabase
      .from('user_course_enrollments')
      .select(`
        progress_pct, completed_at, due_date,
        course:course_id(title, org_id, is_required)
      `)
      .order('enrolled_at', { ascending: false })
      .limit(500),
    supabase.from('training_certificates').select('*', { count: 'exact', head: true }),
  ]);

  const allEnrollments = (enrollmentData.data ?? []).filter((e: any) => {
    const c = Array.isArray(e.course) ? e.course[0] : e.course;
    return c?.org_id === orgId;
  });

  const totalEnrollments = allEnrollments.length;
  const completed        = allEnrollments.filter((e: any) => e.completed_at).length;
  const completionRate   = totalEnrollments > 0 ? Math.round((completed / totalEnrollments) * 100) : 0;
  const avgProgress      = totalEnrollments > 0
    ? Math.round(allEnrollments.reduce((s: number, e: any) => s + e.progress_pct, 0) / totalEnrollments)
    : 0;

  const now = new Date();
  const overdueCount = allEnrollments.filter((e: any) =>
    !e.completed_at && e.due_date && new Date(e.due_date) < now
  ).length;

  const courseEnrollCounts: Record<string, { title: string; enrolled: number; completed: number }> = {};
  for (const e of allEnrollments as any[]) {
    const c = Array.isArray(e.course) ? e.course[0] : e.course;
    if (!c) continue;
    const key = c.title;
    if (!courseEnrollCounts[key]) courseEnrollCounts[key] = { title: key, enrolled: 0, completed: 0 };
    courseEnrollCounts[key].enrolled++;
    if (e.completed_at) courseEnrollCounts[key].completed++;
  }
  const topCourses = Object.values(courseEnrollCounts)
    .sort((a, b) => b.enrolled - a.enrolled)
    .slice(0, 5)
    .map((c, i) => ({ ...c, id: String(i) }));

  const requiredEnrollments = allEnrollments.filter((e: any) => {
    const c = Array.isArray(e.course) ? e.course[0] : e.course;
    return c?.is_required;
  });
  const requiredCompleted = requiredEnrollments.filter((e: any) => e.completed_at).length;
  const complianceRate = requiredEnrollments.length > 0
    ? Math.round((requiredCompleted / requiredEnrollments.length) * 100)
    : 100;

  return {
    success: true,
    data: {
      totalCourses: courseCount.count ?? 0,
      totalEnrollments,
      completionRate,
      avgProgress,
      overdueCount,
      certificateCount: certCount.count ?? 0,
      complianceRate,
      topCourses,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// ADMIN: Seed default onboarding learning paths
// ─────────────────────────────────────────────────────────────

export async function seedDefaultPaths(): Promise<ActionResult> {
  const { supabase, user, orgId } = await getUserAndOrg();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const { count } = await supabase
    .from('learning_paths')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId);

  if ((count ?? 0) > 0) return { success: true, data: undefined };

  const admin = createSupabaseAdminClient();
  const defaultPaths = [
    { title: 'Doctor Onboarding',    role_target: 'doctor',   cover_color: '#3b82f6', description: 'Complete onboarding program for new veterinarians' },
    { title: 'HR Onboarding',        role_target: 'hr',       cover_color: '#8b5cf6', description: 'HR team onboarding and compliance training' },
    { title: 'Manager Onboarding',   role_target: 'manager',  cover_color: '#f59e0b', description: 'Leadership and management orientation' },
    { title: 'CSR Onboarding',       role_target: 'csr',      cover_color: '#10b981', description: 'Client service representative orientation' },
    { title: 'VA Onboarding',        role_target: 'va',       cover_color: '#f97316', description: 'Veterinary assistant onboarding program' },
    { title: 'OSHA Compliance',      role_target: null,       cover_color: '#ef4444', description: 'Annual OSHA safety compliance training' },
  ];

  for (const path of defaultPaths) {
    await admin
      .from('learning_paths')
      .insert({ ...path, org_id: orgId, created_by: user.id, is_published: true });
  }

  return { success: true, data: undefined };
}
