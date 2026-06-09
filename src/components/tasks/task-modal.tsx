'use client';

import { useForm } from 'react-hook-form';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { Task, TaskPriority, TaskStatus, CreateTaskInput } from '@/types/app';

interface TeamMember {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  job_title: string | null;
}

interface TaskModalProps {
  task:        Task | null;
  teamMembers: TeamMember[];
  onSubmit:    (data: CreateTaskInput) => void;
  onClose:     () => void;
  isPending:   boolean;
}

interface FormValues {
  title:       string;
  description: string;
  priority:    TaskPriority;
  status:      TaskStatus;
  due_date:    string;
  assigned_to: string;
}

export default function TaskModal({ task, teamMembers, onSubmit, onClose, isPending }: TaskModalProps) {
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      title:       task?.title ?? '',
      description: task?.description ?? '',
      priority:    task?.priority ?? 'medium',
      status:      task?.status ?? 'todo',
      due_date:    task?.due_date ? task.due_date.substring(0, 10) : '',
      assigned_to: task?.assigned_to ?? '',
    },
  });

  const assignedId     = watch('assigned_to');
  const selectedMember = teamMembers.find(m => m.id === assignedId);
  const assigneeName   = selectedMember
    ? `${selectedMember.first_name ?? ''} ${selectedMember.last_name ?? ''}`.trim()
    : null;

  function onFormSubmit(values: FormValues) {
    onSubmit({
      title:       values.title,
      description: values.description || null,
      priority:    values.priority,
      status:      values.status,
      due_date:    values.due_date ? new Date(values.due_date).toISOString() : null,
      assigned_to: values.assigned_to || null,
    });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{task ? 'Edit Task' : 'New Task'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4 mt-2">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="title">Title <span className="text-red-500">*</span></Label>
            <Input
              id="title"
              placeholder="What needs to be done?"
              {...register('title', { required: 'Title is required' })}
            />
            {errors.title && <p className="text-xs text-red-500">{errors.title.message}</p>}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Add more details…"
              rows={3}
              {...register('description')}
            />
          </div>

          {/* Priority + Status */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select
                value={watch('priority')}
                onValueChange={(v) => v && setValue('priority', v as TaskPriority)}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={watch('status')}
                onValueChange={(v) => v && setValue('status', v as TaskStatus)}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">To Do</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="review">In Review</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Due Date */}
          <div className="space-y-1.5">
            <Label htmlFor="due_date">Due Date</Label>
            <Input id="due_date" type="date" {...register('due_date')} />
          </div>

          {/* Assign To — custom trigger to avoid Base UI showing raw UUID */}
          <div className="space-y-1.5">
            <Label>Assign To</Label>
            <Select
              value={assignedId || '_none'}
              onValueChange={(v) => v && setValue('assigned_to', v === '_none' ? '' : v)}
            >
              <SelectTrigger className="w-full">
                {/* Render name manually — Base UI Select.Value shows raw value otherwise */}
                {assigneeName ? (
                  <span className="flex items-center gap-2 flex-1 min-w-0">
                    <Avatar className="h-5 w-5 shrink-0">
                      <AvatarImage src={selectedMember?.avatar_url ?? undefined} />
                      <AvatarFallback className="text-[9px] bg-blue-100 text-blue-700">
                        {selectedMember?.first_name?.[0]}{selectedMember?.last_name?.[0]}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate text-sm">{assigneeName}</span>
                    {selectedMember?.job_title && (
                      <span className="text-xs text-muted-foreground truncate">— {selectedMember.job_title}</span>
                    )}
                  </span>
                ) : (
                  <SelectValue placeholder="Unassigned" />
                )}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">
                  <span className="text-muted-foreground">Unassigned</span>
                </SelectItem>
                {teamMembers.map(m => {
                  const name = `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim();
                  return (
                    <SelectItem key={m.id} value={m.id}>
                      <span className="flex items-center gap-2">
                        <Avatar className="h-5 w-5 shrink-0">
                          <AvatarImage src={m.avatar_url ?? undefined} />
                          <AvatarFallback className="text-[9px] bg-blue-100 text-blue-700">
                            {m.first_name?.[0]}{m.last_name?.[0]}
                          </AvatarFallback>
                        </Avatar>
                        <span>{name}</span>
                        {m.job_title && (
                          <span className="text-xs text-muted-foreground">— {m.job_title}</span>
                        )}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : task ? 'Update Task' : 'Create Task'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
