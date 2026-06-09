'use client';

import { useTransition, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import {
  HelpCircle, Plus, BookOpen, Tag, ExternalLink, MessageSquare,
  Clock, CheckCircle2, AlertCircle, Loader2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { createSupportTicket } from '@/lib/actions/support';
import type { SupportTicket, TicketCategory, TicketPriority, CreateTicketInput } from '@/types/app';

const STATUS_CONFIG = {
  open:        { label: 'Open',        color: 'bg-blue-100 text-blue-700',   icon: <AlertCircle className="h-3 w-3" /> },
  in_progress: { label: 'In Progress', color: 'bg-amber-100 text-amber-700', icon: <Loader2 className="h-3 w-3" /> },
  resolved:    { label: 'Resolved',    color: 'bg-green-100 text-green-700', icon: <CheckCircle2 className="h-3 w-3" /> },
  closed:      { label: 'Closed',      color: 'bg-slate-100 text-slate-600', icon: <CheckCircle2 className="h-3 w-3" /> },
};

interface Article {
  id: string;
  title: string;
  tags: string[] | null;
  view_count: number;
  updated_at: string;
  category_id: string | null;
}

interface Props {
  tickets: SupportTicket[];
  articles: Article[];
}

export default function HelpCenter({ tickets: initialTickets, articles }: Props) {
  const [tickets, setTickets]         = useState(initialTickets);
  const [tab, setTab]                 = useState<'overview' | 'tickets' | 'new'>('overview');
  const [isPending, startTransition]  = useTransition();

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<CreateTicketInput>({
    defaultValues: { category: 'other', priority: 'medium' },
  });

  function onSubmit(data: CreateTicketInput) {
    startTransition(async () => {
      const r = await createSupportTicket(data);
      if (r.success) {
        setTickets(prev => [r.data, ...prev]);
        toast.success('Ticket submitted successfully! We\'ll get back to you soon.');
        reset();
        setTab('tickets');
      } else {
        toast.error(r.error);
      }
    });
  }

  const open   = tickets.filter(t => t.status === 'open' || t.status === 'in_progress').length;
  const solved = tickets.filter(t => t.status === 'resolved' || t.status === 'closed').length;

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="h-8">
          <TabsTrigger value="overview" className="text-xs px-4">Overview</TabsTrigger>
          <TabsTrigger value="tickets"  className="text-xs px-4">
            My Tickets {open > 0 && <Badge className="ml-1.5 h-4 min-w-4 px-1 text-[10px] bg-blue-600 text-white border-0">{open}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="new"      className="text-xs px-4">
            <Plus className="h-3 w-3 mr-1" /> New Ticket
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* ── Overview ── */}
      {tab === 'overview' && (
        <div className="space-y-4">
          {/* Quick actions */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { title: 'Submit a Ticket',    desc: 'Report an issue or request help',      icon: <MessageSquare className="h-5 w-5 text-blue-500" />, bg: 'bg-blue-50',  action: () => setTab('new') },
              { title: 'Knowledge Base',     desc: 'Browse articles and guides',           icon: <BookOpen className="h-5 w-5 text-green-500" />,   bg: 'bg-green-50', action: () => {} },
              { title: 'Contact Admin',      desc: 'Reach out directly to your IT admin',  icon: <HelpCircle className="h-5 w-5 text-purple-500" />, bg: 'bg-purple-50', action: () => {} },
            ].map(item => (
              <button
                key={item.title}
                onClick={item.action}
                className="text-left p-4 rounded-xl border border-slate-100 bg-white hover:border-slate-200 hover:shadow-sm transition-all"
              >
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center mb-3 ${item.bg}`}>
                  {item.icon}
                </div>
                <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                <p className="text-xs text-slate-400 mt-0.5">{item.desc}</p>
              </button>
            ))}
          </div>

          {/* Ticket summary */}
          {tickets.length > 0 && (
            <Card className="border-slate-100">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-slate-700">Your Tickets</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setTab('tickets')} className="text-xs h-7">
                    View all →
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {tickets.slice(0, 3).map(t => <TicketRow key={t.id} ticket={t} />)}
              </CardContent>
            </Card>
          )}

          {/* KB Articles */}
          {articles.length > 0 && (
            <Card className="border-slate-100">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-slate-700">Popular Articles</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {articles.map(a => (
                  <div key={a.id} className="flex items-center gap-2 p-2 rounded hover:bg-slate-50 cursor-pointer group">
                    <BookOpen className="h-4 w-4 text-slate-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-700 truncate group-hover:text-blue-600 transition-colors">{a.title}</p>
                      <p className="text-xs text-slate-400">{a.view_count} views</p>
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-500 shrink-0" />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Tickets list ── */}
      {tab === 'tickets' && (
        <div className="space-y-3">
          {tickets.length === 0 ? (
            <div className="text-center py-16">
              <MessageSquare className="h-12 w-12 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">No tickets yet</p>
              <p className="text-xs text-slate-400 mt-1">Submit a ticket if you need assistance</p>
              <Button size="sm" onClick={() => setTab('new')} className="mt-4 gap-1.5">
                <Plus className="h-3.5 w-3.5" /> New Ticket
              </Button>
            </div>
          ) : (
            tickets.map(t => (
              <Card key={t.id} className="border-slate-100 hover:shadow-sm transition-shadow">
                <CardContent className="p-4">
                  <TicketRow ticket={t} expanded />
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ── New Ticket form ── */}
      {tab === 'new' && (
        <Card className="border-slate-100">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-slate-700">Submit a Support Ticket</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Title <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="Brief summary of your issue"
                  {...register('title', { required: 'Required', minLength: { value: 5, message: 'At least 5 characters' } })}
                />
                {errors.title && <p className="text-xs text-red-500">{errors.title.message}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select value={watch('category')} onValueChange={(v) => setValue('category', v as TicketCategory)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="technical">Technical Issue</SelectItem>
                      <SelectItem value="access">Access / Permissions</SelectItem>
                      <SelectItem value="training">Training</SelectItem>
                      <SelectItem value="bug">Bug Report</SelectItem>
                      <SelectItem value="feature_request">Feature Request</SelectItem>
                      <SelectItem value="billing">Billing</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Priority</Label>
                  <Select value={watch('priority')} onValueChange={(v) => setValue('priority', v as TicketPriority)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Description <span className="text-red-500">*</span></Label>
                <Textarea
                  placeholder="Please describe your issue in detail. Include steps to reproduce, screenshots if possible, and any error messages."
                  rows={5}
                  {...register('description', {
                    required: 'Required',
                    minLength: { value: 20, message: 'Please provide more detail (at least 20 characters)' },
                  })}
                />
                {errors.description && <p className="text-xs text-red-500">{errors.description.message}</p>}
              </div>

              <div className="flex gap-3 pt-1">
                <Button type="submit" disabled={isPending} className="gap-2">
                  {isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</> : 'Submit Ticket'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setTab('overview')}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function TicketRow({ ticket: t, expanded = false }: { ticket: SupportTicket; expanded?: boolean }) {
  const sc = STATUS_CONFIG[t.status];
  return (
    <div className={expanded ? '' : 'flex items-center gap-3'}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={`text-sm font-medium text-slate-800 ${expanded ? 'mb-1' : 'truncate max-w-xs'}`}>{t.title}</p>
          <Badge className={`text-[10px] border-0 gap-0.5 ${sc.color}`}>{sc.icon}{sc.label}</Badge>
          <Badge className="text-[10px] bg-slate-100 text-slate-600 border-0 capitalize">{t.category.replace('_', ' ')}</Badge>
        </div>
        {expanded && <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{t.description}</p>}
      </div>
      <p className="text-xs text-slate-400 shrink-0 flex items-center gap-1">
        <Clock className="h-3 w-3" />
        {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}
      </p>
    </div>
  );
}
