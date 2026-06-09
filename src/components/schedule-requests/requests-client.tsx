'use client';

import { useState, useTransition } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import {
  CheckCircle2, XCircle, Clock, Calendar, MapPin, Users,
  Building2, AlertTriangle, ChevronDown, ChevronUp,
  User, MessageSquare, Loader2, CheckCheck, Ban,
  CalendarClock, SlidersHorizontal,
} from 'lucide-react';
import { Button }   from '@/components/ui/button';
import { Badge }    from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { approveScheduleRequest, rejectScheduleRequest } from '@/lib/actions/schedule-requests';
import type { ScheduleRequest } from '@/lib/actions/schedule-requests';

const PRIORITY_CONFIG = {
  low:    { label: 'Low',    className: 'bg-gray-100 text-gray-600 border-gray-200' },
  medium: { label: 'Medium', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  high:   { label: 'High',   className: 'bg-orange-50 text-orange-700 border-orange-200' },
  urgent: { label: 'Urgent', className: 'bg-red-50 text-red-700 border-red-200' },
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  meeting: 'Meeting', doctor_meeting: 'Doctor Meeting', leadership_meeting: 'Leadership Meeting',
  manager_meeting: 'Manager Meeting', department_meeting: 'Department Meeting',
  training: 'Training', cpr_training: 'CPR Training', osha_training: 'OSHA Training',
  compliance_training: 'Compliance Training', lms_session: 'LMS Session',
  onboarding: 'Onboarding', orientation: 'Orientation', performance_review: 'Performance Review',
  pto: 'PTO', vacation: 'Vacation', sick_leave: 'Sick Leave', personal_leave: 'Personal Leave',
  hospital_event: 'Hospital Event', town_hall: 'Town Hall', staff_event: 'Staff Event',
  announcement: 'Announcement', audit: 'Audit', inspection: 'Inspection',
  deadline: 'Deadline', project_milestone: 'Milestone', project_review: 'Project Review',
  maintenance: 'Maintenance', other: 'Other',
};

type FilterStatus = 'all' | 'pending' | 'approved' | 'rejected';

export default function ScheduleRequestsClient({
  initialRequests,
}: { initialRequests: ScheduleRequest[] }) {
  const [requests, setRequests]   = useState<ScheduleRequest[]>(initialRequests);
  const [filter, setFilter]       = useState<FilterStatus>('pending');
  const [expanded, setExpanded]   = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [actionId, setActionId]   = useState<string | null>(null);
  const [notes, setNotes]         = useState<Record<string, string>>({});
  const [errors, setErrors]       = useState<Record<string, string>>({});

  const filtered = requests.filter(r => filter === 'all' || r.status === filter);

  const pendingCount  = requests.filter(r => r.status === 'pending').length;
  const approvedCount = requests.filter(r => r.status === 'approved').length;
  const rejectedCount = requests.filter(r => r.status === 'rejected').length;

  function handleApprove(id: string) {
    setActionId(id);
    startTransition(async () => {
      const result = await approveScheduleRequest(id, notes[id] || undefined);
      if (result.success) {
        setRequests(prev => prev.map(r => r.id === id ? { ...r, ...result.data! } : r));
        setErrors(prev => ({ ...prev, [id]: '' }));
      } else {
        setErrors(prev => ({ ...prev, [id]: result.error ?? 'Failed to approve' }));
      }
      setActionId(null);
    });
  }

  function handleReject(id: string) {
    setActionId(id);
    startTransition(async () => {
      const result = await rejectScheduleRequest(id, notes[id] || undefined);
      if (result.success) {
        setRequests(prev => prev.map(r => r.id === id ? { ...r, ...result.data! } : r));
        setErrors(prev => ({ ...prev, [id]: '' }));
      } else {
        setErrors(prev => ({ ...prev, [id]: result.error ?? 'Failed to reject' }));
      }
      setActionId(null);
    });
  }

  return (
    <div className="flex-1 p-6 space-y-5 overflow-y-auto">

      {/* ── Stats row ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Pending Review', count: pendingCount, color: 'amber', icon: Clock },
          { label: 'Approved',       count: approvedCount, color: 'emerald', icon: CheckCircle2 },
          { label: 'Rejected',       count: rejectedCount, color: 'red', icon: XCircle },
        ].map(stat => (
          <div key={stat.label} className={`bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 shadow-sm`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0
              ${stat.color === 'amber'   ? 'bg-amber-50'   : ''}
              ${stat.color === 'emerald' ? 'bg-emerald-50' : ''}
              ${stat.color === 'red'     ? 'bg-red-50'     : ''}
            `}>
              <stat.icon className={`h-5 w-5
                ${stat.color === 'amber'   ? 'text-amber-600'   : ''}
                ${stat.color === 'emerald' ? 'text-emerald-600' : ''}
                ${stat.color === 'red'     ? 'text-red-500'     : ''}
              `} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 leading-none">{stat.count}</p>
              <p className="text-[12px] text-gray-500 mt-0.5">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filter tabs ────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-gray-400" />
        {(['pending', 'approved', 'rejected', 'all'] as FilterStatus[]).map(f => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-3.5 py-1.5 rounded-lg text-[12px] font-semibold capitalize transition-all border
              ${filter === f
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:text-gray-800'
              }`}
          >
            {f === 'all' ? 'All' : f}
            {f === 'pending' && pendingCount > 0 && (
              <span className={`ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full
                ${filter === f ? 'bg-white text-gray-900' : 'bg-amber-500 text-white'}`}>
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Request list ───────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
            <CalendarClock className="h-8 w-8 text-gray-400" />
          </div>
          <p className="text-[15px] font-semibold text-gray-600">No {filter !== 'all' ? filter : ''} requests</p>
          <p className="text-[13px] text-gray-400 mt-1">When staff submit schedule requests, they'll appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(req => {
            const isOpen    = expanded === req.id;
            const isActing  = isPending && actionId === req.id;
            const reqName   = req.requester
              ? `${req.requester.first_name ?? ''} ${req.requester.last_name ?? ''}`.trim() || req.requester.email || 'Unknown'
              : 'Unknown';
            const initials  = reqName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
            const priority  = PRIORITY_CONFIG[req.priority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.medium;

            return (
              <div
                key={req.id}
                className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all
                  ${req.status === 'pending'  ? 'border-amber-200' : ''}
                  ${req.status === 'approved' ? 'border-emerald-200' : ''}
                  ${req.status === 'rejected' ? 'border-red-200' : ''}
                `}
              >
                {/* ── Card header ─────────────────────────── */}
                <div
                  className="flex items-start gap-4 p-4 cursor-pointer"
                  onClick={() => setExpanded(isOpen ? null : req.id)}
                >
                  {/* Status stripe */}
                  <div className={`w-1 self-stretch rounded-full shrink-0
                    ${req.status === 'pending'  ? 'bg-amber-400' : ''}
                    ${req.status === 'approved' ? 'bg-emerald-500' : ''}
                    ${req.status === 'rejected' ? 'bg-red-400' : ''}
                  `} />

                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white text-[13px] font-bold shrink-0">
                    {initials}
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 flex-wrap">
                      <h3 className="text-[15px] font-bold text-gray-900 leading-tight">{req.title}</h3>
                      <StatusBadge status={req.status} />
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${priority.className}`}>
                        {priority.label}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                      <span className="text-[12px] text-gray-500 flex items-center gap-1">
                        <User className="h-3 w-3" />{reqName}
                        {req.requester?.job_title && <span className="text-gray-400">· {req.requester.job_title}</span>}
                      </span>
                      <span className="text-[12px] text-gray-500 flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(req.start_time), 'EEE, MMM d, yyyy')}
                      </span>
                      <span className="text-[12px] text-gray-500 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {format(new Date(req.start_time), 'h:mm aa')} – {format(new Date(req.end_time), 'h:mm aa')}
                      </span>
                      {req.location && (
                        <span className="text-[12px] text-gray-500 flex items-center gap-1">
                          <MapPin className="h-3 w-3" />{req.location}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">
                      Requested {formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}
                    </p>
                  </div>

                  {/* Chevron */}
                  <div className="text-gray-400 shrink-0 mt-0.5">
                    {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </div>

                {/* ── Expanded detail ────────────────────── */}
                {isOpen && (
                  <div className="border-t border-gray-100 px-5 py-4 bg-gray-50/50 space-y-4">
                    {/* Detail grid */}
                    <div className="grid grid-cols-2 gap-3">
                      <DetailItem icon={<CalendarClock className="h-3.5 w-3.5" />} label="Event Type">
                        {EVENT_TYPE_LABELS[req.event_type] ?? req.event_type}
                      </DetailItem>
                      {req.hospital && (
                        <DetailItem icon={<Building2 className="h-3.5 w-3.5" />} label="Hospital">
                          {req.hospital.name ?? '—'}
                        </DetailItem>
                      )}
                      {req.location && (
                        <DetailItem icon={<MapPin className="h-3.5 w-3.5" />} label="Room / Location">
                          {req.location}
                        </DetailItem>
                      )}
                      {req.attendee_emails && req.attendee_emails.length > 0 && (
                        <DetailItem icon={<Users className="h-3.5 w-3.5" />} label="Attendees">
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {req.attendee_emails.map(e => (
                              <span key={e} className="text-[11px] bg-white border border-gray-200 rounded-full px-2 py-0.5 text-gray-600">
                                {e}
                              </span>
                            ))}
                          </div>
                        </DetailItem>
                      )}
                    </div>

                    {req.description && (
                      <div className="bg-white rounded-xl border border-gray-200 p-3">
                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Description</p>
                        <p className="text-[13px] text-gray-700">{req.description}</p>
                      </div>
                    )}

                    {/* Admin verdict display (for non-pending) */}
                    {req.status !== 'pending' && (
                      <div className={`rounded-xl border p-3
                        ${req.status === 'approved' ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          {req.status === 'approved'
                            ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            : <XCircle className="h-4 w-4 text-red-500" />
                          }
                          <span className={`text-[12px] font-bold ${req.status === 'approved' ? 'text-emerald-700' : 'text-red-600'}`}>
                            {req.status === 'approved' ? 'Approved' : 'Rejected'} by {
                              req.approver
                                ? `${req.approver.first_name ?? ''} ${req.approver.last_name ?? ''}`.trim()
                                : 'Admin'
                            }
                          </span>
                          <span className="text-[11px] text-gray-400 ml-auto">
                            {format(new Date(req.approved_at ?? req.rejected_at ?? req.created_at), 'MMM d, h:mm aa')}
                          </span>
                        </div>
                        {req.admin_notes && (
                          <p className="text-[12px] text-gray-600 pl-6">{req.admin_notes}</p>
                        )}
                      </div>
                    )}

                    {/* Error */}
                    {errors[req.id] && (
                      <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                        <p className="text-[12px] text-red-700">{errors[req.id]}</p>
                      </div>
                    )}

                    {/* Admin action (pending only) */}
                    {req.status === 'pending' && (
                      <div className="space-y-3 pt-1">
                        <div>
                          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                            <MessageSquare className="h-3 w-3" />
                            Admin Note (optional)
                          </label>
                          <Textarea
                            value={notes[req.id] ?? ''}
                            onChange={e => setNotes(prev => ({ ...prev, [req.id]: e.target.value }))}
                            placeholder="Add a reason or feedback for the requester…"
                            rows={2}
                            className="text-[13px] resize-none"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            onClick={() => handleApprove(req.id)}
                            disabled={isActing}
                            className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[13px]"
                          >
                            {isActing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
                            Approve & Schedule
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleReject(req.id)}
                            disabled={isActing}
                            className="flex-1 gap-2 text-red-600 border-red-200 hover:bg-red-50 text-[13px]"
                          >
                            {isActing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                            Decline
                          </Button>
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

function StatusBadge({ status }: { status: string }) {
  if (status === 'pending') return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
      <Clock className="h-2.5 w-2.5" /> Pending
    </span>
  );
  if (status === 'approved') return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
      <CheckCircle2 className="h-2.5 w-2.5" /> Approved
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-600 border border-red-200 px-2 py-0.5 rounded-full">
      <XCircle className="h-2.5 w-2.5" /> Rejected
    </span>
  );
}

function DetailItem({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1 mb-0.5">
        {icon}{label}
      </p>
      <div className="text-[13px] text-gray-700 font-medium">{children}</div>
    </div>
  );
}
