'use server';

import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/types/app';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface Hospital {
  id: string;
  name: string;
  slug: string;
  color: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  timezone: string | null;
  description: string | null;
  is_active: boolean;
}

export interface HospitalCard extends Hospital {
  staffCount: number;
  departmentCount: number;
  eventsThisWeek: number;
  trainingDueCount: number;
  openRequests: number;
  complianceRate: number;
}

export interface OrgOverview {
  totalHospitals: number;
  totalEmployees: number;
  totalDepartments: number;
  openRequests: number;
  upcomingEvents: number;
  trainingDue: number;
  openTasks: number;
}

export interface HospitalEmployee {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  job_title: string | null;
  department: string | null;
  avatar_url: string | null;
  role: string;
  is_active: boolean;
  last_seen_at: string | null;
}

export interface HospitalDepartment {
  id: string;
  name: string;
  description: string | null;
  color: string;
  is_active: boolean;
  manager_id: string | null;
  managerName: string | null;
  memberCount: number;
}

export interface HospitalTrainingStats {
  totalEnrollments: number;
  completedCount: number;
  completionRate: number;
  dueCount: number;
  overdueCount: number;
  complianceRate: number;
  certCount: number;
  courseBreakdown: Array<{
    id: string;
    title: string;
    enrolled: number;
    completed: number;
    compliance_type: string | null;
    is_required: boolean;
  }>;
}

export interface HospitalAnalytics {
  staffCount: number;
  deptCount: number;
  eventsThisMonth: number;
  completedTraining: number;
  openRequests: number;
  openTasks: number;
  complianceRate: number;
  trainingCompletionRate: number;
  staffByRole: Array<{ role: string; count: number }>;
  eventsLastWeek: number;
}

export interface HospitalAnnouncement {
  id: string;
  title: string;
  content: string | null;
  priority: 'normal' | 'high' | 'urgent';
  created_at: string;
  expires_at: string | null;
  createdBy: string | null;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

async function getCtx() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, admin: createSupabaseAdminClient(), user: null, orgId: null };
  const admin = createSupabaseAdminClient();
  const { data: p } = await admin
    .from('profiles').select('org_id').eq('id', user.id).single();
  return { supabase, admin, user, orgId: p?.org_id ?? null };
}

function countBy<T>(arr: T[], key: (item: T) => string | null): Record<string, number> {
  const map: Record<string, number> = {};
  for (const item of arr) {
    const k = key(item);
    if (k) map[k] = (map[k] ?? 0) + 1;
  }
  return map;
}

// ─────────────────────────────────────────────────────────────
// Org Overview (top stats bar)
// ─────────────────────────────────────────────────────────────

export async function getOrgOverview(): Promise<ActionResult<OrgOverview>> {
  const { admin, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const now     = new Date().toISOString();
  const in7days = new Date(Date.now() + 7 * 86_400_000).toISOString();

  const [hospCount, empCount, deptCount, requestCount, eventCount, trainingCount, taskCount] =
    await Promise.all([
      admin.from('hospitals').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('is_active', true),
      admin.from('profiles').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('is_active', true),
      admin.from('departments').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('is_active', true),
      admin.from('schedule_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      admin.from('calendar_events')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('is_cancelled', false)
        .gte('start_time', now)
        .lte('start_time', in7days),
      admin.from('user_course_enrollments')
        .select('*', { count: 'exact', head: true })
        .lte('due_date', in7days)
        .gte('due_date', now)
        .is('completed_at', null),
      admin.from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .in('status', ['todo', 'in_progress', 'review']),
    ]);

  return {
    success: true,
    data: {
      totalHospitals:  hospCount.count  ?? 0,
      totalEmployees:  empCount.count   ?? 0,
      totalDepartments: deptCount.count ?? 0,
      openRequests:    requestCount.count ?? 0,
      upcomingEvents:  eventCount.count  ?? 0,
      trainingDue:     trainingCount.count ?? 0,
      openTasks:       taskCount.count   ?? 0,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Hospital Cards (hub grid)
// ─────────────────────────────────────────────────────────────

export async function getHospitalCards(): Promise<ActionResult<HospitalCard[]>> {
  const { admin, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const { data: hospitals, error } = await admin
    .from('hospitals')
    .select('id,name,slug,color,address,phone,email,website,timezone,description,is_active')
    .eq('org_id', orgId)
    .order('name');

  if (error)               return { success: false, error: error.message };
  if (!hospitals?.length)  return { success: true, data: [] };

  const ids     = hospitals.map(h => h.id);
  const now     = new Date().toISOString();
  const in7d    = new Date(Date.now() + 7  * 86_400_000).toISOString();
  const in30d   = new Date(Date.now() + 30 * 86_400_000).toISOString();
  const weekAgo = new Date(Date.now() - 7  * 86_400_000).toISOString();

  const [staffRes, deptRes, eventsRes, reqRes, dueEnrollRes, requiredEnrollRes] =
    await Promise.all([
      admin.from('user_hospital_roles').select('hospital_id').in('hospital_id', ids),
      admin.from('departments').select('hospital_id').in('hospital_id', ids).eq('is_active', true),
      admin.from('calendar_events')
        .select('hospital_id')
        .in('hospital_id', ids)
        .eq('is_cancelled', false)
        .gte('start_time', weekAgo)
        .lte('start_time', in7d),
      admin.from('schedule_requests')
        .select('hospital_id')
        .in('hospital_id', ids)
        .eq('status', 'pending'),
      // Training due in next 30 days (org-wide — we'll join to hospitals below)
      admin.from('user_course_enrollments')
        .select('user_id')
        .lte('due_date', in30d)
        .gte('due_date', now)
        .is('completed_at', null),
      // Required enrollments for compliance calculation
      admin.from('user_course_enrollments')
        .select('user_id, completed_at')
        .not('completed_at', 'is', null)
        .limit(500),
    ]);

  const staffMap  = countBy(staffRes.data  ?? [], r => r.hospital_id);
  const deptMap   = countBy(deptRes.data   ?? [], r => r.hospital_id);
  const eventsMap = countBy(eventsRes.data ?? [], r => r.hospital_id);
  const reqMap    = countBy(reqRes.data    ?? [], r => r.hospital_id);

  // Map users to hospitals for training due
  const dueUserIds = [...new Set((dueEnrollRes.data ?? []).map(e => e.user_id))];
  const trainingDueMap: Record<string, number> = {};

  if (dueUserIds.length > 0) {
    const { data: userRoles } = await admin
      .from('user_hospital_roles')
      .select('user_id, hospital_id')
      .in('user_id', dueUserIds)
      .in('hospital_id', ids);
    for (const r of userRoles ?? []) {
      trainingDueMap[r.hospital_id] = (trainingDueMap[r.hospital_id] ?? 0) + 1;
    }
  }

  // Simple compliance rate: completed certs / staff (capped at 100%)
  const certRes = await admin
    .from('training_certificates')
    .select('user_id')
    .limit(500);

  const certUserIds = new Set((certRes.data ?? []).map(c => c.user_id));
  const staffByHospital: Record<string, string[]> = {};
  for (const r of staffRes.data ?? []) {
    if (!staffByHospital[r.hospital_id]) staffByHospital[r.hospital_id] = [];
    staffByHospital[r.hospital_id].push((r as any).user_id ?? '');
  }

  const cards: HospitalCard[] = hospitals.map(h => {
    const total   = staffMap[h.id] ?? 0;
    const certified = total > 0
      ? Math.min(100, Math.round(
          ((staffByHospital[h.id] ?? []).filter(uid => certUserIds.has(uid)).length / total) * 100
        ))
      : 100;
    return {
      ...h,
      is_active:        h.is_active ?? true,
      staffCount:       staffMap[h.id]       ?? 0,
      departmentCount:  deptMap[h.id]        ?? 0,
      eventsThisWeek:   eventsMap[h.id]      ?? 0,
      trainingDueCount: trainingDueMap[h.id] ?? 0,
      openRequests:     reqMap[h.id]         ?? 0,
      complianceRate:   certified,
    };
  });

  return { success: true, data: cards };
}

// ─────────────────────────────────────────────────────────────
// Hospital Detail
// ─────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getHospitalDetail(idOrSlug: string): Promise<ActionResult<Hospital>> {
  const { admin, user } = await getCtx();
  if (!user) return { success: false, error: 'Unauthorized' };

  const isUUID = UUID_RE.test(idOrSlug);
  const q = admin
    .from('hospitals')
    .select('id,name,slug,color,address,phone,email,website,timezone,description,is_active');

  const { data, error } = await (isUUID ? q.eq('id', idOrSlug) : q.eq('slug', idOrSlug)).single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as Hospital };
}

// ─────────────────────────────────────────────────────────────
// Hospital Employees
// ─────────────────────────────────────────────────────────────

export async function getHospitalEmployees(
  hospitalId: string,
  opts?: { search?: string; role?: string }
): Promise<ActionResult<HospitalEmployee[]>> {
  const { admin, user } = await getCtx();
  if (!user) return { success: false, error: 'Unauthorized' };

  let q = admin
    .from('user_hospital_roles')
    .select(`
      role,
      profile:user_id(
        id, first_name, last_name, email,
        job_title, department, avatar_url, is_active, last_seen_at
      )
    `)
    .eq('hospital_id', hospitalId);

  if (opts?.role) q = q.eq('role', opts.role);

  const { data, error } = await q.order('role');
  if (error) return { success: false, error: error.message };

  let employees: HospitalEmployee[] = (data ?? []).map((r: any) => {
    const p = Array.isArray(r.profile) ? r.profile[0] : r.profile;
    return {
      id:           p?.id ?? '',
      first_name:   p?.first_name ?? '',
      last_name:    p?.last_name  ?? '',
      email:        p?.email ?? '',
      job_title:    p?.job_title ?? null,
      department:   p?.department ?? null,
      avatar_url:   p?.avatar_url ?? null,
      role:         r.role,
      is_active:    p?.is_active ?? true,
      last_seen_at: p?.last_seen_at ?? null,
    };
  }).filter(e => e.id);

  if (opts?.search) {
    const s = opts.search.toLowerCase();
    employees = employees.filter(e =>
      `${e.first_name} ${e.last_name}`.toLowerCase().includes(s) ||
      (e.email ?? '').toLowerCase().includes(s) ||
      (e.job_title ?? '').toLowerCase().includes(s)
    );
  }

  return { success: true, data: employees };
}

// ─────────────────────────────────────────────────────────────
// Hospital Departments
// ─────────────────────────────────────────────────────────────

export async function getHospitalDepartments(hospitalId: string): Promise<ActionResult<HospitalDepartment[]>> {
  const { admin, user } = await getCtx();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data, error } = await admin
    .from('departments')
    .select(`
      id, name, description, color, is_active, manager_id,
      manager:manager_id(first_name, last_name),
      members:user_departments(count)
    `)
    .eq('hospital_id', hospitalId)
    .order('name');

  if (error) return { success: false, error: error.message };

  const depts: HospitalDepartment[] = (data ?? []).map((d: any) => {
    const mgr = Array.isArray(d.manager) ? d.manager[0] : d.manager;
    return {
      id:          d.id,
      name:        d.name,
      description: d.description ?? null,
      color:       d.color ?? '#6366F1',
      is_active:   d.is_active ?? true,
      manager_id:  d.manager_id ?? null,
      managerName: mgr ? `${mgr.first_name} ${mgr.last_name}` : null,
      memberCount: Array.isArray(d.members) ? (d.members[0] as any)?.count ?? 0 : 0,
    };
  });

  return { success: true, data: depts };
}

// ─────────────────────────────────────────────────────────────
// Hospital Training Stats
// ─────────────────────────────────────────────────────────────

export async function getHospitalTrainingStats(hospitalId: string): Promise<ActionResult<HospitalTrainingStats>> {
  const { admin, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  // Get staff user IDs for this hospital
  const { data: roleData } = await admin
    .from('user_hospital_roles')
    .select('user_id')
    .eq('hospital_id', hospitalId);

  const staffIds = (roleData ?? []).map(r => r.user_id);
  if (!staffIds.length) {
    return {
      success: true,
      data: {
        totalEnrollments: 0, completedCount: 0, completionRate: 0,
        dueCount: 0, overdueCount: 0, complianceRate: 100,
        certCount: 0, courseBreakdown: [],
      },
    };
  }

  const now    = new Date().toISOString();
  const in30d  = new Date(Date.now() + 30 * 86_400_000).toISOString();

  const [enrollRes, certRes, courseRes] = await Promise.all([
    admin
      .from('user_course_enrollments')
      .select('user_id, course_id, completed_at, due_date, progress_pct')
      .in('user_id', staffIds),
    admin
      .from('training_certificates')
      .select('user_id, course_id')
      .in('user_id', staffIds),
    admin
      .from('training_courses')
      .select('id, title, is_required, compliance_type')
      .eq('org_id', orgId)
      .eq('is_published', true),
  ]);

  const enrollments = enrollRes.data ?? [];
  const total       = enrollments.length;
  const completed   = enrollments.filter(e => e.completed_at).length;
  const due         = enrollments.filter(e =>
    !e.completed_at && e.due_date && new Date(e.due_date) >= new Date() && new Date(e.due_date) <= new Date(in30d)
  ).length;
  const overdue     = enrollments.filter(e =>
    !e.completed_at && e.due_date && new Date(e.due_date) < new Date()
  ).length;

  // Compliance: required courses only
  const requiredEnrolls = enrollments.filter(e => {
    const course = (courseRes.data ?? []).find(c => c.id === e.course_id);
    return course?.is_required;
  });
  const requiredCompleted = requiredEnrolls.filter(e => e.completed_at).length;
  const complianceRate = requiredEnrolls.length > 0
    ? Math.round((requiredCompleted / requiredEnrolls.length) * 100)
    : 100;

  // Per-course breakdown
  const courseMap: Record<string, { enrolled: number; completed: number }> = {};
  for (const e of enrollments) {
    if (!courseMap[e.course_id]) courseMap[e.course_id] = { enrolled: 0, completed: 0 };
    courseMap[e.course_id].enrolled++;
    if (e.completed_at) courseMap[e.course_id].completed++;
  }

  const courseBreakdown = (courseRes.data ?? [])
    .filter(c => courseMap[c.id])
    .map(c => ({
      id: c.id,
      title: c.title,
      enrolled: courseMap[c.id]?.enrolled ?? 0,
      completed: courseMap[c.id]?.completed ?? 0,
      compliance_type: c.compliance_type,
      is_required: c.is_required,
    }))
    .sort((a, b) => b.enrolled - a.enrolled)
    .slice(0, 10);

  return {
    success: true,
    data: {
      totalEnrollments: total,
      completedCount:   completed,
      completionRate:   total > 0 ? Math.round((completed / total) * 100) : 0,
      dueCount:         due,
      overdueCount:     overdue,
      complianceRate,
      certCount:        (certRes.data ?? []).length,
      courseBreakdown,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Hospital Calendar Events
// ─────────────────────────────────────────────────────────────

export async function getHospitalEvents(
  hospitalId: string,
  limit = 20
): Promise<ActionResult<Array<{
  id: string; title: string; event_type: string;
  start_time: string; end_time: string; location: string | null;
  is_all_day: boolean; color: string | null;
}>>> {
  const { admin, user } = await getCtx();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data, error } = await admin
    .from('calendar_events')
    .select('id,title,event_type,start_time,end_time,location,is_all_day,color')
    .eq('hospital_id', hospitalId)
    .eq('is_cancelled', false)
    .gte('start_time', new Date().toISOString())
    .order('start_time', { ascending: true })
    .limit(limit);

  if (error) return { success: false, error: error.message };
  return { success: true, data: data ?? [] };
}

// ─────────────────────────────────────────────────────────────
// Hospital Documents (Knowledge Base)
// ─────────────────────────────────────────────────────────────

export async function getHospitalDocuments(hospitalId: string): Promise<ActionResult<Array<{
  id: string; title: string; status: string; category: string | null;
  created_at: string; view_count: number;
}>>> {
  const { admin, user } = await getCtx();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data, error } = await admin
    .from('knowledge_documents')
    .select(`
      id, title, status, view_count, created_at,
      category:category_id(name)
    `)
    .eq('hospital_id', hospitalId)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return { success: false, error: error.message };

  return {
    success: true,
    data: (data ?? []).map((d: any) => ({
      id:         d.id,
      title:      d.title,
      status:     d.status,
      view_count: d.view_count,
      created_at: d.created_at,
      category:   (Array.isArray(d.category) ? d.category[0] : d.category)?.name ?? null,
    })),
  };
}

// ─────────────────────────────────────────────────────────────
// Hospital Requests
// ─────────────────────────────────────────────────────────────

export async function getHospitalRequests(hospitalId: string): Promise<ActionResult<Array<{
  id: string; title: string; status: string; priority: string;
  start_time: string; requested_by: string; created_at: string;
}>>> {
  const { admin, user } = await getCtx();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data, error } = await admin
    .from('schedule_requests')
    .select(`
      id, title, status, priority, start_time, created_at,
      requester:requested_by(first_name, last_name)
    `)
    .eq('hospital_id', hospitalId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return { success: false, error: error.message };

  return {
    success: true,
    data: (data ?? []).map((r: any) => {
      const req = Array.isArray(r.requester) ? r.requester[0] : r.requester;
      return {
        id:           r.id,
        title:        r.title,
        status:       r.status,
        priority:     r.priority,
        start_time:   r.start_time,
        created_at:   r.created_at,
        requested_by: req ? `${req.first_name} ${req.last_name}` : 'Unknown',
      };
    }),
  };
}

// ─────────────────────────────────────────────────────────────
// Hospital Tasks
// ─────────────────────────────────────────────────────────────

export async function getHospitalTasks(hospitalId: string): Promise<ActionResult<Array<{
  id: string; title: string; status: string; priority: string;
  due_date: string | null; assignee: string | null;
}>>> {
  const { admin, user } = await getCtx();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data, error } = await admin
    .from('tasks')
    .select(`
      id, title, status, priority, due_date,
      assignee:assigned_to(first_name, last_name)
    `)
    .eq('hospital_id', hospitalId)
    .in('status', ['todo', 'in_progress', 'review'])
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(50);

  if (error) return { success: false, error: error.message };

  return {
    success: true,
    data: (data ?? []).map((t: any) => {
      const a = Array.isArray(t.assignee) ? t.assignee[0] : t.assignee;
      return {
        id:       t.id,
        title:    t.title,
        status:   t.status,
        priority: t.priority,
        due_date: t.due_date ?? null,
        assignee: a ? `${a.first_name} ${a.last_name}` : null,
      };
    }),
  };
}

// ─────────────────────────────────────────────────────────────
// Hospital Analytics
// ─────────────────────────────────────────────────────────────

export async function getHospitalAnalytics(hospitalId: string): Promise<ActionResult<HospitalAnalytics>> {
  const { admin, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const now        = new Date().toISOString();
  const monthStart = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const weekStart  = new Date(Date.now() - 7  * 86_400_000).toISOString();

  // Get staff ids
  const { data: roleRows } = await admin
    .from('user_hospital_roles')
    .select('user_id, role')
    .eq('hospital_id', hospitalId);

  const staffIds = (roleRows ?? []).map(r => r.user_id);

  // Role breakdown
  const roleCount: Record<string, number> = {};
  for (const r of roleRows ?? []) {
    roleCount[r.role] = (roleCount[r.role] ?? 0) + 1;
  }
  const staffByRole = Object.entries(roleCount).map(([role, count]) => ({ role, count }));

  const [deptCount, eventsMonth, eventsWeek, requestCount, taskCount, trainingRes, certRes] =
    await Promise.all([
      admin.from('departments').select('*', { count: 'exact', head: true }).eq('hospital_id', hospitalId).eq('is_active', true),
      admin.from('calendar_events').select('*', { count: 'exact', head: true }).eq('hospital_id', hospitalId).eq('is_cancelled', false).gte('start_time', monthStart),
      admin.from('calendar_events').select('*', { count: 'exact', head: true }).eq('hospital_id', hospitalId).eq('is_cancelled', false).gte('start_time', weekStart),
      admin.from('schedule_requests').select('*', { count: 'exact', head: true }).eq('hospital_id', hospitalId).eq('status', 'pending'),
      admin.from('tasks').select('*', { count: 'exact', head: true }).eq('hospital_id', hospitalId).in('status', ['todo', 'in_progress', 'review']),
      staffIds.length
        ? admin.from('user_course_enrollments').select('completed_at').in('user_id', staffIds)
        : { data: [], error: null },
      staffIds.length
        ? admin.from('training_certificates').select('user_id').in('user_id', staffIds)
        : { data: [], error: null },
    ]);

  const enrollments = trainingRes.data ?? [];
  const completed   = enrollments.filter((e: any) => e.completed_at).length;
  const completionRate = enrollments.length > 0
    ? Math.round((completed / enrollments.length) * 100)
    : 0;

  return {
    success: true,
    data: {
      staffCount:            staffIds.length,
      deptCount:             deptCount.count  ?? 0,
      eventsThisMonth:       eventsMonth.count ?? 0,
      eventsLastWeek:        eventsWeek.count  ?? 0,
      completedTraining:     completed,
      openRequests:          requestCount.count ?? 0,
      openTasks:             taskCount.count    ?? 0,
      complianceRate:        100, // computed in training stats
      trainingCompletionRate: completionRate,
      staffByRole,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Cross-Hospital Events (for Command Center timeline)
// ─────────────────────────────────────────────────────────────

export interface CrossHospitalEvent {
  id: string;
  title: string;
  event_type: string;
  start_time: string;
  end_time: string;
  location: string | null;
  is_all_day: boolean;
  color: string | null;
  hospitalId: string;
  hospitalName: string;
  hospitalColor: string;
}

export type ViewRole = 'executive' | 'manager' | 'staff';

export async function getUpcomingEventsAllHospitals(
  limit = 25
): Promise<ActionResult<CrossHospitalEvent[]>> {
  const { admin, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const now   = new Date().toISOString();
  const in14d = new Date(Date.now() + 14 * 86_400_000).toISOString();

  const { data: hospitals } = await admin
    .from('hospitals')
    .select('id, name, color')
    .eq('org_id', orgId)
    .eq('is_active', true);

  const hospMap = Object.fromEntries((hospitals ?? []).map(h => [h.id, h]));
  const ids = Object.keys(hospMap);
  if (!ids.length) return { success: true, data: [] };

  const { data, error } = await admin
    .from('calendar_events')
    .select('id, title, event_type, start_time, end_time, location, is_all_day, color, hospital_id')
    .in('hospital_id', ids)
    .eq('is_cancelled', false)
    .gte('start_time', now)
    .lte('start_time', in14d)
    .order('start_time', { ascending: true })
    .limit(limit);

  if (error) return { success: false, error: error.message };

  return {
    success: true,
    data: (data ?? []).map((e: any) => {
      const h = hospMap[e.hospital_id] ?? { name: 'Unknown', color: '#6b7280' };
      return {
        id:            e.id,
        title:         e.title,
        event_type:    e.event_type,
        start_time:    e.start_time,
        end_time:      e.end_time,
        location:      e.location,
        is_all_day:    e.is_all_day,
        color:         e.color,
        hospitalId:    e.hospital_id,
        hospitalName:  h.name,
        hospitalColor: h.color ?? '#6b7280',
      };
    }),
  };
}

// ─────────────────────────────────────────────────────────────
// Hospital Announcements
// ─────────────────────────────────────────────────────────────

export async function getHospitalAnnouncements(hospitalId: string): Promise<ActionResult<HospitalAnnouncement[]>> {
  const { admin, user } = await getCtx();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data, error } = await admin
    .from('hospital_announcements')
    .select('id,title,content,priority,created_at,expires_at,created_by(first_name,last_name)')
    .eq('hospital_id', hospitalId)
    .eq('is_active', true)
    .or(`expires_at.is.null,expires_at.gte.${new Date().toISOString()}`)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) return { success: false, error: error.message };

  return {
    success: true,
    data: (data ?? []).map((a: any) => {
      const cb = Array.isArray(a.created_by) ? a.created_by[0] : a.created_by;
      return {
        id: a.id, title: a.title, content: a.content,
        priority: a.priority, created_at: a.created_at, expires_at: a.expires_at,
        createdBy: cb ? `${cb.first_name} ${cb.last_name}` : null,
      };
    }),
  };
}

// ─────────────────────────────────────────────────────────────
// Create Announcement
// ─────────────────────────────────────────────────────────────

export async function createHospitalAnnouncement(
  hospitalId: string,
  input: { title: string; content: string; priority: 'normal' | 'high' | 'urgent'; expires_at?: string | null },
): Promise<ActionResult<{ id: string }>> {
  const { admin, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  if (!input.title?.trim()) return { success: false, error: 'Title is required' };

  const { data, error } = await admin
    .from('hospital_announcements')
    .insert({
      hospital_id: hospitalId,
      org_id:      orgId,
      title:       input.title.trim(),
      content:     input.content?.trim() ?? '',
      priority:    input.priority,
      is_active:   true,
      expires_at:  input.expires_at ?? null,
      created_by:  user.id,
    })
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: { id: data.id } };
}

// ─────────────────────────────────────────────────────────────
// Hospital Workspace (combined: snapshot + announcements + resources)
// ─────────────────────────────────────────────────────────────

export interface WorkspaceSnapshot {
  staffCount: number;
  documentCount: number;
  projectCount: number;
  departmentCount: number;
  openRequestCount: number;
  trainingDueCount: number;
}

export interface WorkspaceResource {
  id: string;
  title: string;
  description: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  categoryIcon: string | null;
}

export interface HospitalWorkspaceData {
  hospital: Hospital;
  snapshot: WorkspaceSnapshot;
  announcements: HospitalAnnouncement[];
  resources: WorkspaceResource[];
}

export async function getHospitalWorkspaceData(
  hospitalId: string,
): Promise<ActionResult<HospitalWorkspaceData>> {
  const { admin, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const now   = new Date().toISOString();
  const in30d = new Date(Date.now() + 30 * 86_400_000).toISOString();

  const [
    hospRes,
    staffRes,
    deptRes,
    projRes,
    docRes,
    reqRes,
    dueEnrollRes,
    announcementsRes,
    resourcesRes,
  ] = await Promise.all([
    // Hospital info
    admin.from('hospitals')
      .select('id,name,slug,color,address,phone,email,website,timezone,description,is_active')
      .eq('id', hospitalId)
      .single(),
    // Staff count
    admin.from('user_hospital_roles')
      .select('*', { count: 'exact', head: true })
      .eq('hospital_id', hospitalId),
    // Department count
    admin.from('departments')
      .select('*', { count: 'exact', head: true })
      .eq('hospital_id', hospitalId)
      .eq('is_active', true),
    // Active project count
    admin.from('projects')
      .select('*', { count: 'exact', head: true })
      .eq('hospital_id', hospitalId)
      .not('status', 'in', '("completed","cancelled")'),
    // Published KB document count
    admin.from('knowledge_documents')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'published')
      .or(`hospital_id.eq.${hospitalId},hospital_id.is.null`),
    // Open schedule requests
    admin.from('schedule_requests')
      .select('*', { count: 'exact', head: true })
      .eq('hospital_id', hospitalId)
      .eq('status', 'pending'),
    // Training due in next 30 days — per staff of this hospital
    admin.from('user_course_enrollments')
      .select('user_id', { count: 'exact', head: false })
      .lte('due_date', in30d)
      .gte('due_date', now)
      .is('completed_at', null),
    // Announcements
    admin.from('hospital_announcements')
      .select('id,title,content,priority,created_at,expires_at,created_by(first_name,last_name)')
      .eq('hospital_id', hospitalId)
      .eq('is_active', true)
      .or(`expires_at.is.null,expires_at.gte.${now}`)
      .order('created_at', { ascending: false })
      .limit(10),
    // Quick resources (KB docs)
    admin.from('knowledge_documents')
      .select(`
        id, title, description,
        category:category_id(name, color, icon)
      `)
      .eq('org_id', orgId)
      .eq('status', 'published')
      .or(`hospital_id.eq.${hospitalId},hospital_id.is.null`)
      .order('view_count', { ascending: false })
      .limit(8),
  ]);

  if (hospRes.error || !hospRes.data) {
    return { success: false, error: hospRes.error?.message ?? 'Hospital not found' };
  }

  // Map due enrollments to hospital staff
  const dueUserIds = [...new Set((dueEnrollRes.data ?? []).map((e: any) => e.user_id))];
  let trainingDueCount = 0;
  if (dueUserIds.length > 0) {
    const { count } = await admin
      .from('user_hospital_roles')
      .select('*', { count: 'exact', head: true })
      .eq('hospital_id', hospitalId)
      .in('user_id', dueUserIds);
    trainingDueCount = count ?? 0;
  }

  const announcements: HospitalAnnouncement[] = (announcementsRes.data ?? []).map((a: any) => {
    const cb = Array.isArray(a.created_by) ? a.created_by[0] : a.created_by;
    return {
      id: a.id, title: a.title, content: a.content,
      priority: a.priority, created_at: a.created_at, expires_at: a.expires_at,
      createdBy: cb ? `${cb.first_name} ${cb.last_name}` : null,
    };
  });

  const resources: WorkspaceResource[] = (resourcesRes.data ?? []).map((d: any) => {
    const cat = Array.isArray(d.category) ? d.category[0] : d.category;
    return {
      id:            d.id,
      title:         d.title,
      description:   d.description ?? null,
      categoryName:  cat?.name  ?? null,
      categoryColor: cat?.color ?? null,
      categoryIcon:  cat?.icon  ?? null,
    };
  });

  return {
    success: true,
    data: {
      hospital: hospRes.data as Hospital,
      snapshot: {
        staffCount:       staffRes.count    ?? 0,
        departmentCount:  deptRes.count     ?? 0,
        projectCount:     projRes.count     ?? 0,
        documentCount:    docRes.count      ?? 0,
        openRequestCount: reqRes.count      ?? 0,
        trainingDueCount,
      },
      announcements,
      resources,
    },
  };
}
