'use client';

import { useState, useTransition } from 'react';
import {
  Clock, AlertTriangle, TrendingUp, CheckCircle2,
  User, ChevronDown, ChevronUp, Loader2, CheckCheck, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { approveRequest, rejectRequest, escalateRequest } from '@/lib/actions/requests';

type RequestStatus   = 'pending' | 'approved' | 'rejected' | 'escalated' | 'cancelled' | 'completed';
type RequestPriority = 'low' | 'medium' | 'high' | 'urgent';
type RequestType     = 'meeting' | 'leave' | 'purchase' | 'training' | 'document_verification' | 'equipment';

interface Requester {
  first_name: string | null;
  last_name:  string | null;
  email:      string | null;
  avatar_url: string | null;
}

export interface RequestRow {
  id:                string;
  request_type:      RequestType;
  status:            RequestStatus;
  priority:          RequestPriority;
  title:             string;
  description:       string | null;
  requested_by:      string;
  created_at:        string;
  updated_at:        string;
  due_date:          string | null;
  approved_at:       string | null;
  rejected_at:       string | null;
  rejection_reason:  string | null;
  escalation_reason: string | null;
  requester:         Requester | null;
}

const PRIORITY_COLOR: Record<RequestPriority, string> = {
  low:    'bg-slate-100 text-slate-600',
  medium: 'bg-blue-50 text-blue-700',
  high:   'bg-orange-50 text-orange-700',
  urgent: 'bg-red-50 text-red-700',
};

const STATUS_COLOR: Record<RequestStatus, string> = {
  pending:   'bg-amber-50 text-amber-700',
  approved:  'bg-green-50 text-green-700',
  rejected:  'bg-red-50 text-red-700',
  escalated: 'bg-purple-50 text-purple-700',
  cancelled: 'bg-slate-100 text-slate-500',
  completed: 'bg-teal-50 text-teal-700',
};

const TYPE_LABELS: Record<RequestType, string> = {
  meeting:               'Meeting',
  leave:                 'Leave',
  purchase:              'Purchase',
  training:              'Training',
  document_verification: 'Document',
  equipment:             'Equipment',
};

type Tab = 'pending' | 'escalated' | 'all';

export function ApprovalsClient({ requests, currentUserId, onActionComplete }: { requests: RequestRow[]; currentUserId: string; onActionComplete?: () => void }) {
  const [tab, setTab]           = useState<Tab>('pending');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [reason, setReason]     = useState('');
  const [isPending, start]      = useTransition();
  const [actingId, setActingId] = useState<string | null>(null);

  const counts = {
    pending:   requests.filter(r => r.status === 'pending').length,
    escalated: requests.filter(r => r.status === 'escalated').length,
    all:       requests.length,
  };

  const visible = requests.filter(r => {
    if (tab === 'pending')   return r.status === 'pending';
    if (tab === 'escalated') return r.status === 'escalated';
    return true;
  });

  function handleApprove(id: string) {
    setActingId(id);
    start(async () => {
      const res = await approveRequest(id);
      if (res.success) { toast.success('Request approved'); onActionComplete?.(); }
      else             { toast.error(res.error); }
      setActingId(null);
    });
  }

  function handleReject(id: string) {
    if (!reason.trim()) { toast.error('Please enter a rejection reason'); return; }
    setActingId(id);
    start(async () => {
      const res = await rejectRequest(id, reason.trim());
      if (res.success) { toast.success('Request rejected'); setRejectId(null); setReason(''); onActionComplete?.(); }
      else             { toast.error(res.error); }
      setActingId(null);
    });
  }

  function handleEscalate(id: string) {
    setActingId(id);
    start(async () => {
      const res = await escalateRequest(id, 'Escalated by admin for senior review');
      if (res.success) { toast.success('Request escalated'); onActionComplete?.(); }
      else             { toast.error(res.error); }
      setActingId(null);
    });
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        {(['pending', 'escalated', 'all'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors',
              tab === t
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            )}
          >
            {t === 'all' ? 'All Requests' : t.charAt(0).toUpperCase() + t.slice(1)}
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
              {counts[t]}
            </span>
          </button>
        ))}
      </div>

      {/* List */}
      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <CheckCircle2 className="h-12 w-12 mb-3" />
          <p className="text-sm font-medium">No {tab === 'all' ? '' : tab} requests</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(req => {
            const isExp    = expanded === req.id;
            const isAct    = actingId === req.id;
            const isRej    = rejectId === req.id;
            const canAct   = req.status === 'pending' || req.status === 'escalated';
            const name     = req.requester
              ? `${req.requester.first_name ?? ''} ${req.requester.last_name ?? ''}`.trim() || req.requester.email || '—'
              : '—';

            return (
              <div key={req.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                {/* Header row */}
                <div
                  className="flex items-start gap-4 p-4 cursor-pointer hover:bg-slate-50"
                  onClick={() => setExpanded(isExp ? null : req.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase', STATUS_COLOR[req.status])}>
                        {req.status}
                      </span>
                      <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase', PRIORITY_COLOR[req.priority])}>
                        {req.priority}
                      </span>
                      <span className="text-[10px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">
                        {TYPE_LABELS[req.request_type]}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-800 truncate">{req.title}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <User className="h-3 w-3" />{name}
                      </span>
                      <span className="text-xs text-slate-400">
                        {new Date(req.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                  </div>
                  {isExp ? <ChevronUp className="h-4 w-4 text-slate-400 shrink-0 mt-1" /> : <ChevronDown className="h-4 w-4 text-slate-400 shrink-0 mt-1" />}
                </div>

                {/* Expanded */}
                {isExp && (
                  <div className="border-t border-slate-100 p-4 bg-slate-50/50 space-y-4">
                    {req.description && (
                      <p className="text-sm text-slate-600">{req.description}</p>
                    )}
                    {req.rejection_reason && (
                      <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                        Rejection reason: {req.rejection_reason}
                      </p>
                    )}

                    {canAct && (
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleApprove(req.id)}
                          disabled={isPending && isAct}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
                        >
                          {isPending && isAct ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCheck className="h-3 w-3" />}
                          Approve
                        </button>
                        {!isRej ? (
                          <button
                            onClick={() => setRejectId(req.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100"
                          >
                            <XCircle className="h-3 w-3" /> Reject
                          </button>
                        ) : (
                          <div className="flex items-center gap-2 w-full">
                            <input
                              autoFocus
                              placeholder="Rejection reason…"
                              value={reason}
                              onChange={e => setReason(e.target.value)}
                              className="flex-1 text-xs border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-red-200"
                            />
                            <button
                              onClick={() => handleReject(req.id)}
                              disabled={isPending && isAct}
                              className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => { setRejectId(null); setReason(''); }}
                              className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                        {req.status === 'pending' && (
                          <button
                            onClick={() => handleEscalate(req.id)}
                            disabled={isPending && isAct}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 disabled:opacity-50"
                          >
                            <AlertTriangle className="h-3 w-3" /> Escalate
                          </button>
                        )}
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
