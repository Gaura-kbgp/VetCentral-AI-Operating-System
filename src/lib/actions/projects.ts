'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/types/app';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type ProjectStatus   = 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled';
export type ProjectPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus      = 'todo' | 'in_progress' | 'review' | 'done' | 'cancelled';
export type TaskPriority    = 'low' | 'medium' | 'high' | 'urgent';
export type MemberRole      = 'owner' | 'manager' | 'member' | 'viewer';

export interface Project {
  id: string;
  org_id: string;
  hospital_id: string | null;
  department_id: string | null;
  name: string;
  description: string | null;
  status: ProjectStatus;
  priority: ProjectPriority;
  owner_id: string | null;
  start_date: string | null;
  due_date: string | null;
  completed_at: string | null;
  progress_pct: number;
  color: string;
  is_cross_hospital: boolean;
  tags: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  hospitalName?: string | null;
  hospitalColor?: string | null;
  ownerName?: string | null;
  ownerAvatar?: string | null;
  taskCount?: number;
  completedCount?: number;
  memberCount?: number;
}

export interface ProjectTask {
  id: string;
  project_id: string;
  org_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigned_to: string | null;
  due_date: string | null;
  start_date: string | null;
  completed_at: string | null;
  position: number;
  section: string;
  tags: string[];
  estimated_hrs: number | null;
  actual_hrs: number | null;
  parent_task_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  assigneeName?: string | null;
  assigneeAvatar?: string | null;
  commentCount?: number;
}

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: MemberRole;
  joined_at: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  avatar_url?: string | null;
  jobTitle?: string | null;
}

export interface ProjectComment {
  id: string;
  project_id: string;
  task_id: string | null;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  authorName?: string;
  authorAvatar?: string | null;
}

export interface ProjectActivity {
  id: string;
  project_id: string;
  task_id: string | null;
  user_id: string | null;
  action: string;
  resource_type: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
  userName?: string | null;
  userAvatar?: string | null;
}

export interface ProjectFile {
  id: string;
  project_id: string;
  task_id: string | null;
  uploaded_by: string | null;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  storage_path: string;
  created_at: string;
  uploaderName?: string | null;
}

export interface ProjectStats {
  total: number;
  active: number;
  completed: number;
  overdue: number;
  dueSoon: number;
  myProjects: number;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  color: string;
  icon: string;
  default_sections: string[];
  default_tasks: Array<{ title: string; section: string; priority: string }>;
}

export interface CreateProjectInput {
  name: string;
  description?: string | null;
  hospital_id?: string | null;
  department_id?: string | null;
  priority?: ProjectPriority;
  start_date?: string | null;
  due_date?: string | null;
  color?: string;
  is_cross_hospital?: boolean;
  tags?: string[];
  template_id?: string | null;
  owner_id?: string | null;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
  hospital_id?: string | null;
  department_id?: string | null;
  priority?: ProjectPriority;
  status?: ProjectStatus;
  start_date?: string | null;
  due_date?: string | null;
  color?: string;
  is_cross_hospital?: boolean;
  tags?: string[];
  progress_pct?: number;
  owner_id?: string | null;
  completed_at?: string | null;
}

export interface CreateTaskInput {
  project_id: string;
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigned_to?: string | null;
  due_date?: string | null;
  start_date?: string | null;
  section?: string;
  tags?: string[];
  estimated_hrs?: number | null;
  parent_task_id?: string | null;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigned_to?: string | null;
  due_date?: string | null;
  start_date?: string | null;
  section?: string;
  tags?: string[];
  estimated_hrs?: number | null;
  actual_hrs?: number | null;
  position?: number;
  completed_at?: string | null;
}

// ─────────────────────────────────────────────────────────────
// Context helper
// ─────────────────────────────────────────────────────────────

async function getCtx() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, orgId: null };
  const { data: p } = await supabase.from('profiles').select('org_id').eq('id', user.id).single();
  return { supabase, user, orgId: p?.org_id ?? null };
}

// Activity logger — fire-and-forget, never throws
async function logActivity(
  supabase: Awaited<ReturnType<typeof getCtx>>['supabase'],
  projectId: string,
  userId: string,
  action: string,
  opts?: { taskId?: string; resourceType?: string; oldData?: unknown; newData?: unknown }
) {
  try {
    await supabase.from('project_activity').insert({
      project_id:    projectId,
      task_id:       opts?.taskId ?? null,
      user_id:       userId,
      action,
      resource_type: opts?.resourceType ?? 'project',
      old_data:      opts?.oldData ?? null,
      new_data:      opts?.newData ?? null,
    });
  } catch { /* ignore — audit log must never break the main flow */ }
}

// ─────────────────────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────────────────────

export async function getProjectDashboard(): Promise<ActionResult<{
  stats: ProjectStats;
  projects: Project[];
}>> {
  const { supabase, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const now     = new Date().toISOString().slice(0, 10);
  const in7days = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

  const { data: projects, error } = await supabase
    .from('projects')
    .select(`
      id,org_id,hospital_id,department_id,name,description,status,priority,
      owner_id,start_date,due_date,completed_at,progress_pct,color,is_cross_hospital,
      tags,created_by,created_at,updated_at,
      hospital:hospital_id(name,color),
      owner:owner_id(first_name,last_name,avatar_url)
    `)
    .eq('org_id', orgId)
    .order('updated_at', { ascending: false });

  if (error) return { success: false, error: error.message };

  const pids = (projects ?? []).map(p => p.id);

  // Task counts per project in one query
  const { data: taskRows } = pids.length
    ? await supabase
        .from('project_tasks')
        .select('project_id, status')
        .in('project_id', pids)
    : { data: [] };

  // Member counts per project
  const { data: memberRows } = pids.length
    ? await supabase
        .from('project_members')
        .select('project_id')
        .in('project_id', pids)
    : { data: [] };

  const taskMap: Record<string, { total: number; done: number }> = {};
  for (const t of taskRows ?? []) {
    if (!taskMap[t.project_id]) taskMap[t.project_id] = { total: 0, done: 0 };
    taskMap[t.project_id].total++;
    if (t.status === 'done') taskMap[t.project_id].done++;
  }
  const memberMap: Record<string, number> = {};
  for (const m of memberRows ?? []) {
    memberMap[m.project_id] = (memberMap[m.project_id] ?? 0) + 1;
  }

  const mapped: Project[] = (projects ?? []).map((p: any) => {
    const h   = Array.isArray(p.hospital) ? p.hospital[0] : p.hospital;
    const o   = Array.isArray(p.owner)    ? p.owner[0]    : p.owner;
    const tms = taskMap[p.id] ?? { total: 0, done: 0 };
    return {
      id: p.id, org_id: p.org_id, hospital_id: p.hospital_id,
      department_id: p.department_id, name: p.name, description: p.description,
      status: p.status, priority: p.priority, owner_id: p.owner_id,
      start_date: p.start_date, due_date: p.due_date, completed_at: p.completed_at,
      progress_pct: tms.total > 0
        ? Math.round((tms.done / tms.total) * 100)
        : p.progress_pct,
      color: p.color, is_cross_hospital: p.is_cross_hospital,
      tags: p.tags ?? [], created_by: p.created_by,
      created_at: p.created_at, updated_at: p.updated_at,
      hospitalName:   h?.name   ?? null,
      hospitalColor:  h?.color  ?? null,
      ownerName:      o ? `${o.first_name} ${o.last_name}` : null,
      ownerAvatar:    o?.avatar_url ?? null,
      taskCount:      tms.total,
      completedCount: tms.done,
      memberCount:    memberMap[p.id] ?? 0,
    };
  });

  const today = new Date().toISOString().slice(0, 10);
  const stats: ProjectStats = {
    total:      mapped.length,
    active:     mapped.filter(p => p.status === 'active').length,
    completed:  mapped.filter(p => p.status === 'completed').length,
    overdue:    mapped.filter(p => p.status !== 'completed' && p.status !== 'cancelled' && p.due_date && p.due_date < today).length,
    dueSoon:    mapped.filter(p => p.status === 'active' && p.due_date && p.due_date >= today && p.due_date <= in7days).length,
    myProjects: mapped.filter(p => p.owner_id === user.id || p.created_by === user.id).length,
  };

  return { success: true, data: { stats, projects: mapped } };
}

// ─────────────────────────────────────────────────────────────
// Project Detail
// ─────────────────────────────────────────────────────────────

export async function getProject(id: string): Promise<ActionResult<Project>> {
  const { supabase, user } = await getCtx();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data: p, error } = await supabase
    .from('projects')
    .select(`
      id,org_id,hospital_id,department_id,name,description,status,priority,
      owner_id,start_date,due_date,completed_at,progress_pct,color,is_cross_hospital,
      tags,created_by,created_at,updated_at,
      hospital:hospital_id(name,color),
      owner:owner_id(first_name,last_name,avatar_url)
    `)
    .eq('id', id)
    .single();

  if (error) return { success: false, error: error.message };

  const [taskCounts, memberCount] = await Promise.all([
    supabase.from('project_tasks').select('status').eq('project_id', id),
    supabase.from('project_members').select('*', { count: 'exact', head: true }).eq('project_id', id),
  ]);

  const tasks = taskCounts.data ?? [];
  const total = tasks.length;
  const done  = tasks.filter((t: any) => t.status === 'done').length;

  const h = Array.isArray((p as any).hospital) ? (p as any).hospital[0] : (p as any).hospital;
  const o = Array.isArray((p as any).owner)    ? (p as any).owner[0]    : (p as any).owner;

  return {
    success: true,
    data: {
      ...(p as any),
      tags:           (p as any).tags ?? [],
      hospitalName:   h?.name   ?? null,
      hospitalColor:  h?.color  ?? null,
      ownerName:      o ? `${o.first_name} ${o.last_name}` : null,
      ownerAvatar:    o?.avatar_url ?? null,
      taskCount:      total,
      completedCount: done,
      progress_pct:   total > 0 ? Math.round((done / total) * 100) : (p as any).progress_pct,
      memberCount:    memberCount.count ?? 0,
    } as Project,
  };
}

// ─────────────────────────────────────────────────────────────
// Tasks
// ─────────────────────────────────────────────────────────────

export async function getProjectTasks(projectId: string): Promise<ActionResult<ProjectTask[]>> {
  const { supabase, user } = await getCtx();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data, error } = await supabase
    .from('project_tasks')
    .select(`
      id,project_id,org_id,title,description,status,priority,
      assigned_to,due_date,start_date,completed_at,position,section,
      tags,estimated_hrs,actual_hrs,parent_task_id,created_by,created_at,updated_at,
      assignee:assigned_to(first_name,last_name,avatar_url)
    `)
    .eq('project_id', projectId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) return { success: false, error: error.message };

  // Comment counts per task
  const ids = (data ?? []).map((t: any) => t.id);
  const { data: cRows } = ids.length
    ? await supabase.from('project_comments').select('task_id').in('task_id', ids)
    : { data: [] };
  const commentMap: Record<string, number> = {};
  for (const c of cRows ?? []) {
    commentMap[(c as any).task_id] = (commentMap[(c as any).task_id] ?? 0) + 1;
  }

  return {
    success: true,
    data: (data ?? []).map((t: any) => {
      const a = Array.isArray(t.assignee) ? t.assignee[0] : t.assignee;
      return {
        id: t.id, project_id: t.project_id, org_id: t.org_id,
        title: t.title, description: t.description, status: t.status, priority: t.priority,
        assigned_to: t.assigned_to, due_date: t.due_date, start_date: t.start_date,
        completed_at: t.completed_at, position: t.position, section: t.section,
        tags: t.tags ?? [], estimated_hrs: t.estimated_hrs, actual_hrs: t.actual_hrs,
        parent_task_id: t.parent_task_id, created_by: t.created_by,
        created_at: t.created_at, updated_at: t.updated_at,
        assigneeName:   a ? `${a.first_name} ${a.last_name}` : null,
        assigneeAvatar: a?.avatar_url ?? null,
        commentCount:   commentMap[t.id] ?? 0,
      } as ProjectTask;
    }),
  };
}

// ─────────────────────────────────────────────────────────────
// Members
// ─────────────────────────────────────────────────────────────

export async function getProjectMembers(projectId: string): Promise<ActionResult<ProjectMember[]>> {
  const { supabase, user } = await getCtx();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data, error } = await supabase
    .from('project_members')
    .select(`
      id,project_id,user_id,role,joined_at,
      profile:user_id(first_name,last_name,email,avatar_url,job_title)
    `)
    .eq('project_id', projectId)
    .order('joined_at', { ascending: true });

  if (error) return { success: false, error: error.message };

  return {
    success: true,
    data: (data ?? []).map((m: any) => {
      const p = Array.isArray(m.profile) ? m.profile[0] : m.profile;
      return {
        id: m.id, project_id: m.project_id, user_id: m.user_id,
        role: m.role, joined_at: m.joined_at,
        firstName:  p?.first_name ?? '',
        lastName:   p?.last_name  ?? '',
        email:      p?.email      ?? '',
        avatar_url: p?.avatar_url ?? null,
        jobTitle:   p?.job_title  ?? null,
      } as ProjectMember;
    }),
  };
}

// ─────────────────────────────────────────────────────────────
// Comments
// ─────────────────────────────────────────────────────────────

export async function getTaskComments(taskId: string): Promise<ActionResult<ProjectComment[]>> {
  const { supabase, user } = await getCtx();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data, error } = await supabase
    .from('project_comments')
    .select(`
      id,project_id,task_id,user_id,content,created_at,updated_at,
      author:user_id(first_name,last_name,avatar_url)
    `)
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });

  if (error) return { success: false, error: error.message };

  return {
    success: true,
    data: (data ?? []).map((c: any) => {
      const a = Array.isArray(c.author) ? c.author[0] : c.author;
      return {
        id: c.id, project_id: c.project_id, task_id: c.task_id,
        user_id: c.user_id, content: c.content,
        created_at: c.created_at, updated_at: c.updated_at,
        authorName:   a ? `${a.first_name} ${a.last_name}` : 'Unknown',
        authorAvatar: a?.avatar_url ?? null,
      } as ProjectComment;
    }),
  };
}

// ─────────────────────────────────────────────────────────────
// Activity
// ─────────────────────────────────────────────────────────────

export async function getProjectActivity(
  projectId: string,
  limit = 50
): Promise<ActionResult<ProjectActivity[]>> {
  const { supabase, user } = await getCtx();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data, error } = await supabase
    .from('project_activity')
    .select(`
      id,project_id,task_id,user_id,action,resource_type,old_data,new_data,created_at,
      actor:user_id(first_name,last_name,avatar_url)
    `)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return { success: false, error: error.message };

  return {
    success: true,
    data: (data ?? []).map((a: any) => {
      const u = Array.isArray(a.actor) ? a.actor[0] : a.actor;
      return {
        id: a.id, project_id: a.project_id, task_id: a.task_id,
        user_id: a.user_id, action: a.action, resource_type: a.resource_type,
        old_data: a.old_data, new_data: a.new_data, created_at: a.created_at,
        userName:   u ? `${u.first_name} ${u.last_name}` : null,
        userAvatar: u?.avatar_url ?? null,
      } as ProjectActivity;
    }),
  };
}

// ─────────────────────────────────────────────────────────────
// Files
// ─────────────────────────────────────────────────────────────

export async function getProjectFiles(projectId: string): Promise<ActionResult<ProjectFile[]>> {
  const { supabase, user } = await getCtx();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data, error } = await supabase
    .from('project_files')
    .select(`
      id,project_id,task_id,uploaded_by,file_name,file_type,file_size,storage_path,created_at,
      uploader:uploaded_by(first_name,last_name)
    `)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (error) return { success: false, error: error.message };

  return {
    success: true,
    data: (data ?? []).map((f: any) => {
      const u = Array.isArray(f.uploader) ? f.uploader[0] : f.uploader;
      return {
        id: f.id, project_id: f.project_id, task_id: f.task_id,
        uploaded_by: f.uploaded_by, file_name: f.file_name,
        file_type: f.file_type, file_size: f.file_size,
        storage_path: f.storage_path, created_at: f.created_at,
        uploaderName: u ? `${u.first_name} ${u.last_name}` : null,
      } as ProjectFile;
    }),
  };
}

// ─────────────────────────────────────────────────────────────
// Templates
// ─────────────────────────────────────────────────────────────

export async function getProjectTemplates(): Promise<ActionResult<ProjectTemplate[]>> {
  const { supabase, user } = await getCtx();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data, error } = await supabase
    .from('project_templates')
    .select('id,name,description,category,color,icon,default_sections,default_tasks')
    .or('is_system.eq.true')
    .order('name');

  if (error) return { success: false, error: error.message };

  // Deduplicate by name in case the DB has duplicate template rows
  const seen = new Set<string>();
  const unique = (data ?? []).filter((t: any) => {
    if (seen.has(t.name)) return false;
    seen.add(t.name);
    return true;
  });

  return { success: true, data: unique as ProjectTemplate[] };
}

// ─────────────────────────────────────────────────────────────
// Org helpers (for selects in forms)
// ─────────────────────────────────────────────────────────────

export async function getOrgHospitals(): Promise<ActionResult<Array<{ id: string; name: string; color: string }>>> {
  const { supabase, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const { data, error } = await supabase
    .from('hospitals')
    .select('id,name,color')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('name');

  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []).map((h: any) => ({ id: h.id, name: h.name, color: h.color ?? '#6b7280' })) };
}

export async function getOrgProfiles(): Promise<ActionResult<Array<{
  id: string; name: string; avatar_url: string | null; jobTitle: string | null;
}>>> {
  const { supabase, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const { data, error } = await supabase
    .from('profiles')
    .select('id,first_name,last_name,avatar_url,job_title')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('first_name');

  if (error) return { success: false, error: error.message };
  return {
    success: true,
    data: (data ?? []).map((p: any) => ({
      id:        p.id,
      name:      `${p.first_name} ${p.last_name}`,
      avatar_url: p.avatar_url ?? null,
      jobTitle:  p.job_title ?? null,
    })),
  };
}

// ─────────────────────────────────────────────────────────────
// Mutations — Projects
// ─────────────────────────────────────────────────────────────

export async function createProject(input: CreateProjectInput): Promise<ActionResult<Project>> {
  const { supabase, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  const { template_id, ...rest } = input;

  const { data: project, error } = await supabase
    .from('projects')
    .insert({
      ...rest,
      org_id:     orgId,
      owner_id:   input.owner_id ?? user.id,
      created_by: user.id,
      color:      input.color ?? '#f97316',
      priority:   input.priority ?? 'medium',
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  // Add creator as owner member
  try {
    await supabase.from('project_members').insert({ project_id: project.id, user_id: user.id, role: 'owner' });
  } catch { /* ignore */ }

  // If template chosen, create default tasks
  if (template_id) {
    const { data: tpl } = await supabase
      .from('project_templates')
      .select('default_tasks')
      .eq('id', template_id)
      .single();

    if (tpl?.default_tasks && Array.isArray(tpl.default_tasks)) {
      const taskRows = (tpl.default_tasks as any[]).map((t, i) => ({
        project_id:  project.id,
        org_id:      orgId,
        title:       t.title,
        section:     t.section ?? 'To Do',
        priority:    t.priority ?? 'medium',
        status:      'todo' as TaskStatus,
        position:    i,
        created_by:  user.id,
      }));
      try { await supabase.from('project_tasks').insert(taskRows); } catch { /* ignore */ }
    }
  }

  await logActivity(supabase, project.id, user.id, 'created project', { resourceType: 'project', newData: { name: project.name } });

  return getProject(project.id);
}

export async function updateProject(id: string, input: UpdateProjectInput): Promise<ActionResult<Project>> {
  const { supabase, user } = await getCtx();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data: old } = await supabase.from('projects').select('status,name').eq('id', id).single();

  const { error } = await supabase.from('projects').update(input).eq('id', id);
  if (error) return { success: false, error: error.message };

  await logActivity(supabase, id, user.id, 'updated project', {
    resourceType: 'project',
    oldData: old ?? undefined,
    newData: input,
  });

  return getProject(id);
}

export async function deleteProject(id: string): Promise<ActionResult<void>> {
  const { supabase, user } = await getCtx();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true, data: undefined };
}

// ─────────────────────────────────────────────────────────────
// Mutations — Tasks
// ─────────────────────────────────────────────────────────────

export async function createTask(input: CreateTaskInput): Promise<ActionResult<ProjectTask>> {
  const { supabase, user, orgId } = await getCtx();
  if (!user || !orgId) return { success: false, error: 'Unauthorized' };

  // Get next position in section
  const { data: last } = await supabase
    .from('project_tasks')
    .select('position')
    .eq('project_id', input.project_id)
    .eq('section', input.section ?? 'To Do')
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: task, error } = await supabase
    .from('project_tasks')
    .insert({
      ...input,
      org_id:     orgId,
      status:     input.status ?? 'todo',
      priority:   input.priority ?? 'medium',
      section:    input.section ?? 'To Do',
      position:   ((last as any)?.position ?? -1) + 1,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  await logActivity(supabase, input.project_id, user.id, 'created task', {
    taskId: task.id, resourceType: 'task', newData: { title: task.title },
  });

  return {
    success: true,
    data: { ...(task as any), tags: (task as any).tags ?? [], commentCount: 0 } as ProjectTask,
  };
}

export async function updateTask(id: string, input: UpdateTaskInput): Promise<ActionResult<ProjectTask>> {
  const { supabase, user } = await getCtx();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data: old } = await supabase.from('project_tasks').select('*').eq('id', id).single();

  // Auto set completed_at
  const patch: Record<string, unknown> = { ...input };
  if (input.status === 'done' && !(old as any)?.completed_at && !input.completed_at) {
    patch.completed_at = new Date().toISOString();
  }
  if (input.status && input.status !== 'done') {
    patch.completed_at = null;
  }

  const { data: task, error } = await supabase
    .from('project_tasks')
    .update(patch)
    .eq('id', id)
    .select(`
      *,
      assignee:assigned_to(first_name,last_name,avatar_url)
    `)
    .single();

  if (error) return { success: false, error: error.message };

  if (old) {
    await logActivity(supabase, (old as any).project_id, user.id, 'updated task', {
      taskId: id, resourceType: 'task',
      oldData: { status: (old as any).status, title: (old as any).title },
      newData: patch,
    });
  }

  const a = Array.isArray((task as any).assignee) ? (task as any).assignee[0] : (task as any).assignee;
  return {
    success: true,
    data: {
      ...(task as any),
      tags:           (task as any).tags ?? [],
      assigneeName:   a ? `${a.first_name} ${a.last_name}` : null,
      assigneeAvatar: a?.avatar_url ?? null,
    } as ProjectTask,
  };
}

export async function deleteTask(id: string): Promise<ActionResult<void>> {
  const { supabase, user } = await getCtx();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data: t } = await supabase.from('project_tasks').select('project_id,title').eq('id', id).single();
  const { error }   = await supabase.from('project_tasks').delete().eq('id', id);
  if (error) return { success: false, error: error.message };

  if (t) {
    await logActivity(supabase, (t as any).project_id, user.id, 'deleted task', {
      taskId: id, resourceType: 'task', oldData: { title: (t as any).title },
    });
  }

  return { success: true, data: undefined };
}

// ─────────────────────────────────────────────────────────────
// Mutations — Comments
// ─────────────────────────────────────────────────────────────

export async function addComment(
  projectId: string, taskId: string, content: string
): Promise<ActionResult<ProjectComment>> {
  const { supabase, user } = await getCtx();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { data, error } = await supabase
    .from('project_comments')
    .insert({ project_id: projectId, task_id: taskId, user_id: user.id, content })
    .select(`*, author:user_id(first_name,last_name,avatar_url)`)
    .single();

  if (error) return { success: false, error: error.message };

  await logActivity(supabase, projectId, user.id, 'commented on task', {
    taskId, resourceType: 'comment',
  });

  const a = Array.isArray((data as any).author) ? (data as any).author[0] : (data as any).author;
  return {
    success: true,
    data: {
      ...(data as any),
      authorName:   a ? `${a.first_name} ${a.last_name}` : 'You',
      authorAvatar: a?.avatar_url ?? null,
    } as ProjectComment,
  };
}

export async function deleteComment(id: string): Promise<ActionResult<void>> {
  const { supabase, user } = await getCtx();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { error } = await supabase.from('project_comments').delete().eq('id', id).eq('user_id', user.id);
  if (error) return { success: false, error: error.message };
  return { success: true, data: undefined };
}

// ─────────────────────────────────────────────────────────────
// Mutations — Members
// ─────────────────────────────────────────────────────────────

export async function addMember(
  projectId: string, userId: string, role: MemberRole = 'member'
): Promise<ActionResult<void>> {
  const { supabase, user } = await getCtx();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { error } = await supabase
    .from('project_members')
    .upsert({ project_id: projectId, user_id: userId, role }, { onConflict: 'project_id,user_id' });

  if (error) return { success: false, error: error.message };

  await logActivity(supabase, projectId, user.id, 'added member', {
    resourceType: 'member', newData: { userId, role },
  });

  return { success: true, data: undefined };
}

export async function removeMember(projectId: string, userId: string): Promise<ActionResult<void>> {
  const { supabase, user } = await getCtx();
  if (!user) return { success: false, error: 'Unauthorized' };

  const { error } = await supabase
    .from('project_members')
    .delete()
    .eq('project_id', projectId)
    .eq('user_id', userId);

  if (error) return { success: false, error: error.message };
  return { success: true, data: undefined };
}
