// Pure types and helper functions for tasks — no 'use server' so they can be
// imported freely by both server actions and client components.

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus   = 'todo' | 'in_progress' | 'done' | 'cancelled';
export type TaskType     = 'general' | 'checklist';

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface TaskWithDetails {
  id: string;
  org_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  assigned_to: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  assignee: { id: string; first_name: string | null; last_name: string | null; avatar_url: string | null; job_title?: string | null } | null;
  creator:  { id: string; first_name: string | null; last_name: string | null; avatar_url: string | null } | null;
  taskType: TaskType;
  items: ChecklistItem[];
  notes: string;
  progress: number;
}

export interface AssignableMember {
  id: string;
  name: string;
  role: string;
  job_title: string | null;
  department: string | null;
  active_task_count: number;
}

export interface TaskStats {
  total: number;
  completed: number;
  in_progress: number;
  todo: number;
  overdue: number;
}

export interface AssignTaskInput {
  title: string;
  type: TaskType;
  notes: string;
  items: ChecklistItem[];
  priority: TaskPriority;
  due_date: string | null;
  assigned_to: string;
}

const CL_MARKER = '[[CL]]';

export function parseTaskContent(description: string | null): { type: TaskType; notes: string; items: ChecklistItem[] } {
  if (description?.startsWith(CL_MARKER)) {
    try {
      const p = JSON.parse(description.slice(CL_MARKER.length));
      return { type: 'checklist', notes: p.notes ?? '', items: Array.isArray(p.items) ? p.items : [] };
    } catch { /* fall through */ }
  }
  return { type: 'general', notes: description ?? '', items: [] };
}

export function serializeTaskContent(type: TaskType, notes: string, items: ChecklistItem[]): string {
  if (type === 'checklist') return CL_MARKER + JSON.stringify({ notes, items });
  return notes;
}

export function calcTaskProgress(items: ChecklistItem[], status: TaskStatus): number {
  if (items.length > 0) return Math.round(items.filter(i => i.done).length / items.length * 100);
  if (status === 'done') return 100;
  if (status === 'in_progress') return 50;
  return 0;
}

export function enrichTask(raw: Record<string, unknown>): TaskWithDetails {
  const { type, notes, items } = parseTaskContent(raw.description as string | null);
  const status = (raw.status ?? 'todo') as TaskStatus;
  return {
    ...(raw as unknown as TaskWithDetails),
    taskType: type,
    items,
    notes,
    progress: calcTaskProgress(items, status),
  };
}
