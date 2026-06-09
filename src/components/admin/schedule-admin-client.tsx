'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Clock, CheckCircle2, XCircle, Calendar, MapPin,
  User, ChevronDown, ChevronUp, Loader2, CheckCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { approveScheduleRequest, rejectScheduleRequest } from '@/lib/actions/schedule-requests';

interface ScheduleRow {
  id:               string;
  title:            string;
  event_type:       string;
  start_time:       string;
  end_time:         string;
  is_all_day:       boolean;
  location:         string | null;
  priority:         string;
  description:      string | null;
  status:           'pending' | 'approved' | 'rejected';
  admin_notes:      string | null;
  created_at:       string;
  requester:        { first_name: string | null; last_name: string | null; email: string | null; job_title: string | null } | null;
  hospital:         { name: string | null; color: string | null } | null;
  approver:         { first_name: string | null; last_name: string | null } | null;
}

const STATUS_CLS = {
  pending:  'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-green-50 text-green-700 border-green-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
};

const PRIORITY_CLS: Record<string, string> = {
  low:    'bg-slate-100 text-slate-600',
  medium: 'bg-blue-50 text-blue-700',
  high:   'bg-orange-50 text-orange-700',
  urgent: 'bg-red-50 text-red-700',
};

type FilterTab = 'pending' | 'approved' | 'rejected' | 'all';

export function ScheduleAdminClient({ requests }: { requests: ScheduleRow[] }) {
  const router = useRouter();
  const [tab, setTab]           = useState<FilterTab>('pending');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [notes, setNotes]       = useState('');
  const [isPending, start]      = useTransition();
  const [actingId, setActingId] = useState<string | null>(null);

  const counts: Record<FilterTab, number> = {
    pending:  requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
    all:      requests.length,
  };

  const visible = tab === 'all' ? requests : requests.filter(r => r.status === tab);

  function handleApprove(id: string) {
    setActingId(id);
    start(async () => {
      const res = await approveScheduleRequest(id, notes || undefined);
      if (res.success) { toast.success('Request approved — calendar event created'); router.refresh(); }
      else             { toast.error(res.error); }
      setActingId(null); setNotes('');
    });
  }

  function handleReject(id: string) {
    setActingId(id);
    start(async () => {
      const res = await rejectScheduleRequest(id, notes || undefined);
      if (res.success) { toast.success('Request rejected'); setRejectId(null); setNotes(''); router.refresh(); }
      else             { toast.error(res.error); }
      setActingId(null);
    });
  }

  const TAB_LABELS: Record<FilterTab, string> = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected', all: 'All' };

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {(['pending', 'approved', 'rejected', 'all'] as FilterTab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn('px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700')}>
            {TAB_LABELS[t]}
            <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
              {counts[t]}
            </span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <CheckCircle2 className="h-12 w-12 mb-3" />
          <p className="text-sm font-medium">No {tab === 'all' ? '' : tab} requests</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(req => {
            const isExp  = expanded === req.id;
            const isAct  = actingId === req.id;
            const isRej  = rejectId === req.id;
            const canAct = req.status === 'pending';
            const name   = req.requester
              ? `${req.requester.first_name ?? ''} ${req.requester.last_name ?? ''}`.trim() || req.requester.email || '—'
              : '—';
            const start_ = new Date(req.start_time);
            const end_   = new Date(req.end_time);

            return (
              <div key={req.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="flex items-start gap-4 p-4 cursor-pointer hover:bg-slate-50"
                  onClick={() => setExpanded(isExp ? null : req.id)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase', STATUS_CLS[req.status])}>
                        {req.status}
                      </span>
                      <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', PRIORITY_CLS[req.priority] ?? 'bg-slate-100 text-slate-600')}>
                        {req.priority}
                      </span>
                      {req.hospital && (
                        <span className="text-[10px] text-slate-500">{req.hospital.name}</span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-slate-800 truncate">{req.title}</p>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <User className="h-3 w-3" />{name}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <Calendar className="h-3 w-3" />
                        {start_.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {' '}
                        {start_.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                        {' – '}
                        {end_.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                      </span>
                      {req.location && (
                        <span className="flex items-center gap-1 text-xs text-slate-500">
                          <MapPin className="h-3 w-3" />{req.location}
                        </span>
                      )}
                    </div>
                  </div>
                  {isExp ? <ChevronUp className="h-4 w-4 text-slate-400 shrink-0 mt-1" /> : <ChevronDown className="h-4 w-4 text-slate-400 shrink-0 mt-1" />}
                </div>

                {isExp && (
                  <div className="border-t border-slate-100 p-4 bg-slate-50/50 space-y-4">
                    {req.description && <p className="text-sm text-slate-600">{req.description}</p>}
                    {req.admin_notes  && <p className="text-xs text-slate-500 italic">Admin note: {req.admin_notes}</p>}

                    {canAct && (
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs font-medium text-slate-600 block mb-1">Admin notes (optional)</label>
                          <textarea
                            rows={2}
                            placeholder="Add a note to the requester…"
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-200 resize-none"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleApprove(req.id)}
                            disabled={isPending && isAct}
                            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
                          >
                            {isPending && isAct ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCheck className="h-3 w-3" />}
                            Approve & Add to Calendar
                          </button>
                          <button
                            onClick={() => handleReject(req.id)}
                            disabled={isPending && isAct}
                            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50"
                          >
                            <XCircle className="h-3 w-3" /> Decline
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
