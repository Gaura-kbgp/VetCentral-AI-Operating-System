'use client';

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  Plus, ListTodo, LayoutGrid, Clock, Flag, CheckCircle2,
  Circle, ArrowRight, Trash2, MessageSquare, User
} from 'lucide-react';
import { format, isPast } from 'date-fns';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import TaskModal from './task-modal';
import { createTask, updateTask, deleteTask } from '@/lib/actions/tasks';
import type { Task, TaskStatus, TaskPriority, CreateTaskInput } from '@/types/app';

const STATUS_CONFIG: Record<TaskStatus, { label: string; icon: React.ReactNode; color: string }> = {
  todo:        { label: 'To Do',       icon: <Circle className="h-3.5 w-3.5" />,         color: 'bg-slate-100 text-slate-600' },
  in_progress: { label: 'In Progress', icon: <ArrowRight className="h-3.5 w-3.5" />,     color: 'bg-blue-100 text-blue-700' },
  review:      { label: 'In Review',   icon: <MessageSquare className="h-3.5 w-3.5" />,  color: 'bg-amber-100 text-amber-700' },
  done:        { label: 'Done',        icon: <CheckCircle2 className="h-3.5 w-3.5" />,   color: 'bg-green-100 text-green-700' },
  cancelled:   { label: 'Cancelled',   icon: <Trash2 className="h-3.5 w-3.5" />,         color: 'bg-red-100 text-red-600' },
};

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string }> = {
  low:    { label: 'Low',    color: 'bg-slate-100 text-slate-600' },
  medium: { label: 'Medium', color: 'bg-amber-100 text-amber-700' },
  high:   { label: 'High',   color: 'bg-orange-100 text-orange-700' },
  urgent: { label: 'Urgent', color: 'bg-red-100 text-red-700' },
};

interface Props {
  initialTasks: Task[];
  teamMembers: Array<{ id: string; first_name: string | null; last_name: string | null; avatar_url: string | null; job_title: string | null }>;
  currentUserId: string;
}

type Filter = 'all' | 'mine' | 'created';
type ViewMode = 'list' | 'board';

export default function TasksClient({ initialTasks, teamMembers, currentUserId }: Props) {
  const [tasks, setTasks]           = useState<Task[]>(initialTasks);
  const [view, setView]             = useState<ViewMode>('list');
  const [filter, setFilter]         = useState<Filter>('all');
  const [showModal, setShowModal]   = useState(false);
  const [editTask, setEditTask]     = useState<Task | null>(null);
  const [isPending, startTransition] = useTransition();
  const supabase = createSupabaseBrowserClient();

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('tasks-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setTasks(prev => [payload.new as Task, ...prev]);
        } else if (payload.eventType === 'UPDATE') {
          setTasks(prev => prev.map(t => t.id === (payload.new as Task).id ? { ...t, ...payload.new as Task } : t));
        } else if (payload.eventType === 'DELETE') {
          setTasks(prev => prev.filter(t => t.id !== (payload.old as { id: string }).id));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase]);

  const filteredTasks = tasks.filter(t => {
    if (filter === 'mine')    return t.assigned_to === currentUserId;
    if (filter === 'created') return t.created_by === currentUserId;
    return true;
  });

  function handleCreate(input: CreateTaskInput) {
    startTransition(async () => {
      const result = await createTask(input);
      if (result.success) {
        setTasks(prev => [result.data, ...prev]);
        toast.success('Task created');
        setShowModal(false);
      } else {
        toast.error(result.error ?? 'Failed to create task');
      }
    });
  }

  function handleUpdate(id: string, input: Partial<CreateTaskInput>) {
    startTransition(async () => {
      const result = await updateTask(id, input);
      if (result.success) {
        setTasks(prev => prev.map(t => t.id === id ? { ...t, ...result.data } : t));
        toast.success('Task updated');
        setEditTask(null);
      } else {
        toast.error(result.error ?? 'Failed to update task');
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteTask(id);
      if (result.success) {
        setTasks(prev => prev.filter(t => t.id !== id));
        toast.success('Task deleted');
      } else {
        toast.error(result.error ?? 'Failed to delete task');
      }
    });
  }

  function handleStatusChange(id: string, status: TaskStatus) {
    startTransition(async () => {
      const result = await updateTask(id, { status });
      if (result.success && result.data) {
        setTasks(prev => prev.map(t => t.id === id ? { ...t, ...result.data! } : t));
      } else if (!result.success) {
        toast.error(result.error ?? 'Failed to update status');
      }
    });
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <TabsList className="h-8">
              <TabsTrigger value="all"     className="text-xs px-3">All</TabsTrigger>
              <TabsTrigger value="mine"    className="text-xs px-3">Assigned to me</TabsTrigger>
              <TabsTrigger value="created" className="text-xs px-3">Created by me</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline" size="sm"
            onClick={() => setView(view === 'list' ? 'board' : 'list')}
            className="gap-1.5 h-8 text-xs"
          >
            {view === 'list' ? <LayoutGrid className="h-3.5 w-3.5" /> : <ListTodo className="h-3.5 w-3.5" />}
            {view === 'list' ? 'Board' : 'List'}
          </Button>
          <Button size="sm" onClick={() => setShowModal(true)} className="gap-1.5 h-8 text-xs">
            <Plus className="h-3.5 w-3.5" />
            New Task
          </Button>
        </div>
      </div>

      {/* Content */}
      {view === 'list' ? (
        <ListView
          tasks={filteredTasks}
          onEdit={setEditTask}
          onDelete={handleDelete}
          onStatusChange={handleStatusChange}
        />
      ) : (
        <BoardView
          tasks={filteredTasks}
          onEdit={setEditTask}
          onStatusChange={handleStatusChange}
        />
      )}

      {/* Modals */}
      {(showModal || editTask) && (
        <TaskModal
          task={editTask}
          teamMembers={teamMembers}
          onSubmit={editTask
            ? (data) => handleUpdate(editTask.id, data)
            : handleCreate
          }
          onClose={() => { setShowModal(false); setEditTask(null); }}
          isPending={isPending}
        />
      )}
    </div>
  );
}

// ── List View ─────────────────────────────────────────────
function ListView({ tasks, onEdit, onDelete, onStatusChange }: {
  tasks: Task[];
  onEdit: (t: Task) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, s: TaskStatus) => void;
}) {
  if (tasks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <CheckCircle2 className="h-12 w-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No tasks found</p>
          <p className="text-xs text-slate-400 mt-1">Create a new task to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {tasks.map(task => (
        <TaskRow
          key={task.id} task={task}
          onEdit={onEdit} onDelete={onDelete} onStatusChange={onStatusChange}
        />
      ))}
    </div>
  );
}

function TaskRow({ task, onEdit, onDelete, onStatusChange }: {
  task: Task;
  onEdit: (t: Task) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, s: TaskStatus) => void;
}) {
  const sc = STATUS_CONFIG[task.status];
  const pc = PRIORITY_CONFIG[task.priority];
  const assignee = task.assignee as { first_name: string | null; last_name: string | null; avatar_url: string | null } | null;
  const overdue = task.due_date && isPast(new Date(task.due_date)) && task.status !== 'done' && task.status !== 'cancelled';

  return (
    <Card
      className="cursor-pointer hover:shadow-sm transition-shadow border-slate-100"
      onClick={() => onEdit(task)}
    >
      <CardContent className="flex items-center gap-3 p-3">
        <DropdownMenu>
          <DropdownMenuTrigger
            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium shrink-0 border-0 cursor-pointer ${sc.color}`}
            onClick={e => e.stopPropagation()}
          >
            {sc.icon}
            {sc.label}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-40">
            {(Object.keys(STATUS_CONFIG) as TaskStatus[]).map(s => (
              <DropdownMenuItem
                key={s}
                onClick={e => { e.stopPropagation(); onStatusChange(task.id, s); }}
                className="gap-2 text-xs"
              >
                {STATUS_CONFIG[s].icon}
                {STATUS_CONFIG[s].label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${task.status === 'done' ? 'line-through text-slate-400' : 'text-slate-800'}`}>
            {task.title}
          </p>
          {task.due_date && (
            <div className={`flex items-center gap-1 mt-0.5 text-[11px] ${overdue ? 'text-red-500' : 'text-slate-400'}`}>
              <Clock className="h-3 w-3" />
              {overdue ? 'Overdue · ' : ''}{format(new Date(task.due_date), 'MMM d, yyyy')}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Badge className={`text-[10px] px-1.5 py-0 h-4 border-0 ${pc.color}`}>
            <Flag className="h-2.5 w-2.5 mr-0.5" />
            {pc.label}
          </Badge>

          {assignee ? (
            <Avatar className="h-6 w-6">
              <AvatarImage src={assignee.avatar_url ?? undefined} />
              <AvatarFallback className="text-[10px] bg-blue-100 text-blue-700">
                {assignee.first_name?.[0]}{assignee.last_name?.[0]}
              </AvatarFallback>
            </Avatar>
          ) : (
            <User className="h-4 w-4 text-slate-300" />
          )}

          <button
            onClick={e => { e.stopPropagation(); onDelete(task.id); }}
            className="h-6 w-6 flex items-center justify-center rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Board View ─────────────────────────────────────────────
function BoardView({ tasks, onEdit, onStatusChange }: {
  tasks: Task[];
  onEdit: (t: Task) => void;
  onStatusChange: (id: string, s: TaskStatus) => void;
}) {
  const columns: TaskStatus[] = ['todo', 'in_progress', 'review', 'done'];

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
      {columns.map(status => {
        const col = tasks.filter(t => t.status === status);
        const sc  = STATUS_CONFIG[status];
        return (
          <div key={status} className="w-72 shrink-0">
            <div className="flex items-center gap-2 mb-3">
              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${sc.color}`}>
                {sc.icon}{sc.label}
              </span>
              <span className="text-xs text-slate-400 font-medium">{col.length}</span>
            </div>
            <div className="space-y-2 min-h-50">
              {col.map(task => (
                <KanbanCard key={task.id} task={task} onEdit={onEdit} onStatusChange={onStatusChange} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KanbanCard({ task, onEdit, onStatusChange }: {
  task: Task;
  onEdit: (t: Task) => void;
  onStatusChange: (id: string, s: TaskStatus) => void;
}) {
  const pc = PRIORITY_CONFIG[task.priority];
  const assignee = task.assignee as { first_name: string | null; last_name: string | null; avatar_url: string | null } | null;
  const overdue = task.due_date && isPast(new Date(task.due_date)) && task.status !== 'done';

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow border-slate-100"
      onClick={() => onEdit(task)}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-slate-800 leading-snug">{task.title}</p>
          <Badge className={`text-[10px] px-1.5 py-0 h-4 border-0 shrink-0 ${pc.color}`}>
            {pc.label}
          </Badge>
        </div>
        {task.description && (
          <p className="text-xs text-slate-400 line-clamp-2">{task.description}</p>
        )}
        <div className="flex items-center justify-between pt-1">
          {task.due_date ? (
            <span className={`text-[11px] flex items-center gap-1 ${overdue ? 'text-red-500' : 'text-slate-400'}`}>
              <Clock className="h-3 w-3" />
              {format(new Date(task.due_date), 'MMM d')}
            </span>
          ) : <span />}

          <div className="flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger
                className="text-[10px] text-slate-400 hover:text-slate-600 px-1 border-0 bg-transparent cursor-pointer"
                onClick={e => e.stopPropagation()}
              >
                Move →
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                {(Object.keys(STATUS_CONFIG) as TaskStatus[]).filter(s => s !== task.status).map(s => (
                  <DropdownMenuItem
                    key={s}
                    onClick={e => { e.stopPropagation(); onStatusChange(task.id, s); }}
                    className="gap-2 text-xs"
                  >
                    {STATUS_CONFIG[s].icon}{STATUS_CONFIG[s].label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {assignee && (
              <Avatar className="h-5 w-5">
                <AvatarImage src={assignee.avatar_url ?? undefined} />
                <AvatarFallback className="text-[9px] bg-blue-100 text-blue-700">
                  {assignee.first_name?.[0]}{assignee.last_name?.[0]}
                </AvatarFallback>
              </Avatar>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
