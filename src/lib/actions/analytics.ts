'use server';

import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/types/app';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface OrgKPIs {
  totalEmployees:       number;
  totalHospitals:       number;
  totalDepartments:     number;
  openRequests:         number;
  openTasks:            number;
  upcomingEvents:       number;
  trainingComplianceRate: number;
  avgHospitalHealthScore: number;
}

export interface TrainingAnalytics {
  totalEnrollments:   number;
  completedCount:     number;
  completionRate:     number;
  overdueCount:       number;
  certCount:          number;
  byHospital: Array<{
    hospitalId:   string;
    hospitalName: string;
    color:        string;
    enrolled:     number;
    completed:    number;
    rate:         number;
  }>;
  byMonth: Array<{ month: string; completed: number }>;
  requiredCourses: Array<{
    id: string; title: string;
    enrolled: number; completed: number; rate: number;
  }>;
}

export interface RequestAnalytics {
  total:    number;
  pending:  number;
  approved: number;
  denied:   number;
  byType:   Array<{ type: string; count: number }>;
  avgResolutionDays: number;
}

export interface HospitalHealthScore {
  hospitalId:   string;
  hospitalName: string;
  color:        string;
  score:        number;
  staffCount:   number;
  complianceRate: number;
  openRequests: number;
  eventsThisMonth: number;
  openTasks:    number;
}

export interface ProjectAnalytics {
  total:       number;
  todo:        number;
  inProgress:  number;
  completed:   number;
  overdue:     number;
  byPriority:  Array<{ priority: string; count: number }>;
  byHospital:  Array<{ hospitalName: string; count: number; color: string }>;
}

export interface EmployeeAnalytics {
  total:     number;
  active:    number;
  byRole:    Array<{ role: string; count: number }>;
  byHospital: Array<{ hospitalName: string; count: number; color: string }>;
  recentJoins: number;
}

// ─────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────

async function getCtx() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, orgId: null, admin: createSupabaseAdminClient() };
  const admin = createSupabaseAdminClient();
  const { data: p } = await admin.from('profiles').select('org_id').eq('id', user.id).single();
  return { user, orgId: p?.org_id ?? null, admin };
}

// ─────────────────────────────────────────────────────────────
// Org KPIs (summary bar)
// ─────────────────────────────────────────────────────────────

export async function getOrgKPIs(): Promise<ActionResult<OrgKPIs>> {
  const { user, orgId, admin } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const now    = new Date().toISOString();
  const in7d   = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const in30d  = new Date(Date.now() + 30 * 86_400_000).toISOString();

  const [empCount, hospCount, deptCount, reqCount, taskCount, eventCount, enrollRes, certRes] =
    await Promise.all([
      admin.from('profiles').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('is_active', true),
      admin.from('hospitals').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('is_active', true),
      admin.from('departments').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('is_active', true),
      admin.from('schedule_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      admin.from('tasks').select('*', { count: 'exact', head: true }).eq('org_id', orgId).in('status', ['todo', 'in_progress', 'review']),
      admin.from('calendar_events').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('is_cancelled', false).gte('start_time', now).lte('start_time', in7d),
      admin.from('user_course_enrollments').select('completed_at').limit(2000),
      admin.from('training_certificates').select('id', { count: 'exact', head: true }),
    ]);

  const enrollments = enrollRes.data ?? [];
  const total = enrollments.length;
  const completed = enrollments.filter(e => e.completed_at).length;
  const complianceRate = total > 0 ? Math.round((completed / total) * 100) : 100;

  return {
    success: true,
    data: {
      totalEmployees:          empCount.count   ?? 0,
      totalHospitals:          hospCount.count  ?? 0,
      totalDepartments:        deptCount.count  ?? 0,
      openRequests:            reqCount.count   ?? 0,
      openTasks:               taskCount.count  ?? 0,
      upcomingEvents:          eventCount.count ?? 0,
      trainingComplianceRate:  complianceRate,
      avgHospitalHealthScore:  75,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Training Analytics
// ─────────────────────────────────────────────────────────────

export async function getTrainingAnalytics(): Promise<ActionResult<TrainingAnalytics>> {
  const { user, orgId, admin } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const now   = new Date().toISOString();
  const start = new Date(Date.now() - 180 * 86_400_000).toISOString();

  const [hospRes, enrollRes, certRes, courseRes] = await Promise.all([
    admin.from('hospitals').select('id,name,color').eq('org_id', orgId).eq('is_active', true),
    admin.from('user_course_enrollments').select('user_id, course_id, completed_at, due_date').limit(5000),
    admin.from('training_certificates').select('id', { count: 'exact', head: true }),
    admin.from('training_courses').select('id,title,is_required').eq('org_id', orgId).eq('is_required', true).eq('is_published', true),
  ]);

  const hospitals  = hospRes.data ?? [];
  const enrollments = enrollRes.data ?? [];
  const total      = enrollments.length;
  const completed  = enrollments.filter(e => e.completed_at).length;
  const overdue    = enrollments.filter(e => !e.completed_at && e.due_date && new Date(e.due_date) < new Date()).length;

  // Get user→hospital mapping
  const hospUserRes = await admin.from('user_hospital_roles').select('user_id, hospital_id').in('hospital_id', hospitals.map(h => h.id));
  const userHospMap: Record<string, string[]> = {};
  for (const r of hospUserRes.data ?? []) {
    if (!userHospMap[r.user_id]) userHospMap[r.user_id] = [];
    userHospMap[r.user_id].push(r.hospital_id);
  }

  const byHospital = hospitals.map(h => {
    const hospEnrolls = enrollments.filter(e => (userHospMap[e.user_id] ?? []).includes(h.id));
    const done = hospEnrolls.filter(e => e.completed_at).length;
    return {
      hospitalId:   h.id,
      hospitalName: h.name,
      color:        h.color ?? '#6b7280',
      enrolled:     hospEnrolls.length,
      completed:    done,
      rate: hospEnrolls.length > 0 ? Math.round((done / hospEnrolls.length) * 100) : 0,
    };
  });

  // By month (last 6 months)
  const monthMap: Record<string, number> = {};
  const monthKeys: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = d.toLocaleString('default', { month: 'short', year: '2-digit' });
    monthMap[key] = 0;
    monthKeys.push(key);
  }
  for (const e of enrollments) {
    if (e.completed_at) {
      const d = new Date(e.completed_at);
      const key = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      if (key in monthMap) monthMap[key]++;
    }
  }
  const byMonth = monthKeys.map(month => ({ month, completed: monthMap[month] }));

  // Required courses breakdown
  const courseMap: Record<string, { enrolled: number; completed: number }> = {};
  for (const e of enrollments) {
    if (!courseMap[e.course_id]) courseMap[e.course_id] = { enrolled: 0, completed: 0 };
    courseMap[e.course_id].enrolled++;
    if (e.completed_at) courseMap[e.course_id].completed++;
  }
  const requiredCourses = (courseRes.data ?? []).map(c => ({
    id: c.id, title: c.title,
    enrolled:  courseMap[c.id]?.enrolled  ?? 0,
    completed: courseMap[c.id]?.completed ?? 0,
    rate: courseMap[c.id]?.enrolled
      ? Math.round((courseMap[c.id].completed / courseMap[c.id].enrolled) * 100)
      : 0,
  })).sort((a, b) => b.enrolled - a.enrolled);

  return {
    success: true,
    data: {
      totalEnrollments: total,
      completedCount:   completed,
      completionRate:   total > 0 ? Math.round((completed / total) * 100) : 0,
      overdueCount:     overdue,
      certCount:        certRes.count ?? 0,
      byHospital, byMonth, requiredCourses,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Request Analytics
// ─────────────────────────────────────────────────────────────

export async function getRequestAnalytics(): Promise<ActionResult<RequestAnalytics>> {
  const { user, orgId, admin } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const { data, error } = await admin
    .from('schedule_requests')
    .select('status, request_type, created_at, resolved_at')
    .limit(2000);

  if (error) return { success: false, error: error.message };
  const rows = data ?? [];

  const byType: Record<string, number> = {};
  for (const r of rows) {
    const t = r.request_type ?? 'other';
    byType[t] = (byType[t] ?? 0) + 1;
  }

  const resolved = rows.filter(r => r.resolved_at && r.created_at);
  const avgDays = resolved.length > 0
    ? Math.round(resolved.reduce((sum, r) => {
        const diff = new Date(r.resolved_at!).getTime() - new Date(r.created_at).getTime();
        return sum + diff / 86_400_000;
      }, 0) / resolved.length)
    : 0;

  return {
    success: true,
    data: {
      total:    rows.length,
      pending:  rows.filter(r => r.status === 'pending').length,
      approved: rows.filter(r => r.status === 'approved').length,
      denied:   rows.filter(r => r.status === 'denied').length,
      byType:   Object.entries(byType).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
      avgResolutionDays: avgDays,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Hospital Health Scores
// ─────────────────────────────────────────────────────────────

export async function getHospitalHealthScores(): Promise<ActionResult<HospitalHealthScore[]>> {
  const { user, orgId, admin } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const now       = new Date().toISOString();
  const monthAgo  = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const { data: hospitals } = await admin.from('hospitals').select('id,name,color').eq('org_id', orgId).eq('is_active', true);
  if (!hospitals?.length) return { success: true, data: [] };

  const ids = hospitals.map(h => h.id);

  const [staffRes, reqRes, taskRes, eventRes] = await Promise.all([
    admin.from('user_hospital_roles').select('user_id, hospital_id').in('hospital_id', ids),
    admin.from('schedule_requests').select('hospital_id, status').in('hospital_id', ids),
    admin.from('tasks').select('hospital_id, status').in('hospital_id', ids).in('status', ['todo', 'in_progress', 'review']),
    admin.from('calendar_events').select('hospital_id').in('hospital_id', ids).eq('is_cancelled', false).gte('start_time', monthAgo).lte('start_time', now),
  ]);

  const staffByHosp: Record<string, number> = {};
  const usersByHosp: Record<string, string[]> = {};
  for (const r of staffRes.data ?? []) {
    staffByHosp[r.hospital_id] = (staffByHosp[r.hospital_id] ?? 0) + 1;
    if (!usersByHosp[r.hospital_id]) usersByHosp[r.hospital_id] = [];
    usersByHosp[r.hospital_id].push(r.user_id);
  }

  const pendingReqByHosp: Record<string, number> = {};
  for (const r of reqRes.data ?? []) {
    if (r.status === 'pending') pendingReqByHosp[r.hospital_id] = (pendingReqByHosp[r.hospital_id] ?? 0) + 1;
  }

  const openTaskByHosp: Record<string, number> = {};
  for (const t of taskRes.data ?? []) {
    openTaskByHosp[t.hospital_id] = (openTaskByHosp[t.hospital_id] ?? 0) + 1;
  }

  const eventsByHosp: Record<string, number> = {};
  for (const e of eventRes.data ?? []) {
    eventsByHosp[e.hospital_id] = (eventsByHosp[e.hospital_id] ?? 0) + 1;
  }

  const scores: HospitalHealthScore[] = hospitals.map(h => {
    const staff      = staffByHosp[h.id]       ?? 0;
    const openReqs   = pendingReqByHosp[h.id]  ?? 0;
    const openTasks  = openTaskByHosp[h.id]    ?? 0;
    const events     = eventsByHosp[h.id]      ?? 0;

    // Score: 100 base, -5 per pending request (capped at -30), -3 per open task (capped at -20), +5 for activity
    const score = Math.max(20, Math.min(100,
      100
      - Math.min(30, openReqs * 5)
      - Math.min(20, openTasks * 3)
      + Math.min(10, events * 2)
    ));

    return {
      hospitalId:      h.id,
      hospitalName:    h.name,
      color:           h.color ?? '#6b7280',
      score,
      staffCount:      staff,
      complianceRate:  80,
      openRequests:    openReqs,
      eventsThisMonth: events,
      openTasks,
    };
  });

  return { success: true, data: scores };
}

// ─────────────────────────────────────────────────────────────
// Project Analytics
// ─────────────────────────────────────────────────────────────

export async function getProjectAnalytics(): Promise<ActionResult<ProjectAnalytics>> {
  const { user, orgId, admin } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const [projRes, hospRes] = await Promise.all([
    admin.from('projects').select('status, priority, hospital_id, due_date').eq('org_id', orgId).limit(500),
    admin.from('hospitals').select('id,name,color').eq('org_id', orgId),
  ]);

  const projects  = projRes.data ?? [];
  const hospitals = hospRes.data ?? [];
  const hospMap   = Object.fromEntries(hospitals.map(h => [h.id, h]));

  const now = new Date();
  const overdue = projects.filter(p => p.status !== 'done' && p.due_date && new Date(p.due_date) < now).length;

  const byPriority: Record<string, number> = {};
  const byHospital: Record<string, number> = {};
  for (const p of projects) {
    const pri = p.priority ?? 'medium';
    byPriority[pri] = (byPriority[pri] ?? 0) + 1;
    const hid = p.hospital_id ?? 'org';
    byHospital[hid] = (byHospital[hid] ?? 0) + 1;
  }

  return {
    success: true,
    data: {
      total:      projects.length,
      todo:       projects.filter(p => p.status === 'todo').length,
      inProgress: projects.filter(p => p.status === 'in_progress').length,
      completed:  projects.filter(p => p.status === 'done').length,
      overdue,
      byPriority: Object.entries(byPriority).map(([priority, count]) => ({ priority, count })),
      byHospital: Object.entries(byHospital).map(([id, count]) => {
        const h = hospMap[id];
        return { hospitalName: h?.name ?? 'Org-Wide', count, color: h?.color ?? '#6b7280' };
      }),
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Employee Analytics
// ─────────────────────────────────────────────────────────────

export async function getEmployeeAnalytics(): Promise<ActionResult<EmployeeAnalytics>> {
  const { user, orgId, admin } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [profileRes, roleRes, recentRes, hospRes] = await Promise.all([
    admin.from('profiles').select('id, is_active').eq('org_id', orgId),
    admin.from('user_hospital_roles').select('user_id, role, hospital_id'),
    admin.from('profiles').select('id', { count: 'exact', head: true }).eq('org_id', orgId).gte('created_at', thirtyDaysAgo),
    admin.from('hospitals').select('id,name,color').eq('org_id', orgId),
  ]);

  const profiles  = profileRes.data ?? [];
  const roles     = roleRes.data ?? [];
  const hospitals = hospRes.data ?? [];
  const hospMap   = Object.fromEntries(hospitals.map(h => [h.id, h]));

  const byRole: Record<string, number> = {};
  const byHospital: Record<string, number> = {};
  for (const r of roles) {
    byRole[r.role] = (byRole[r.role] ?? 0) + 1;
    byHospital[r.hospital_id] = (byHospital[r.hospital_id] ?? 0) + 1;
  }

  return {
    success: true,
    data: {
      total:   profiles.length,
      active:  profiles.filter(p => p.is_active).length,
      recentJoins: recentRes.count ?? 0,
      byRole: Object.entries(byRole)
        .map(([role, count]) => ({ role, count }))
        .sort((a, b) => b.count - a.count),
      byHospital: Object.entries(byHospital).map(([id, count]) => ({
        hospitalName: hospMap[id]?.name ?? 'Unknown',
        count,
        color: hospMap[id]?.color ?? '#6b7280',
      })),
    },
  };
}
