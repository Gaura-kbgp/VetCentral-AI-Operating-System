'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  Search, UserPlus, Clock, CheckCircle2, Building2,
  ChevronDown, ChevronUp, Loader2, UserX, UserCheck,
} from 'lucide-react';
import { toggleEmployeeStatus } from '@/lib/actions/hr';
import type { OnboardingEmployeeRow } from '@/lib/actions/hr';
import { useTransition } from 'react';
import { cn } from '@/lib/utils';

interface Hospital { id: string; name: string; color: string | null; }

interface Props {
  employees: OnboardingEmployeeRow[];
  hospitals:  Hospital[];
}

const STATUS_CONFIG = {
  active:    { label: 'In Progress',  dot: 'bg-blue-500',   badge: 'text-blue-700 bg-blue-50 border-blue-200',    icon: Clock         },
  on_hold:   { label: 'On Hold',      dot: 'bg-amber-400',  badge: 'text-amber-700 bg-amber-50 border-amber-200', icon: Clock         },
  completed: { label: 'Completed',    dot: 'bg-green-500',  badge: 'text-green-700 bg-green-50 border-green-200', icon: CheckCircle2  },
  cancelled: { label: 'Cancelled',    dot: 'bg-gray-400',   badge: 'text-gray-600 bg-gray-50 border-gray-200',    icon: Clock         },
} as const;

function timeAgo(iso: string) {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7)  return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function getInitials(emp: OnboardingEmployeeRow) {
  return `${emp.first_name?.[0] ?? ''}${emp.last_name?.[0] ?? ''}`.toUpperCase();
}

export function NewEmployeeList({ employees: initial, hospitals }: Props) {
  const [employees, setEmployees] = useState(initial);
  const [search, setSearch]       = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionId, setActionId]   = useState<string | null>(null);
  const [, startTransition]       = useTransition();

  const hospitalMap = new Map(hospitals.map(h => [h.id, h]));

  const filtered = employees.filter(emp => {
    if (!search) return true;
    const q = search.toLowerCase();
    return `${emp.first_name} ${emp.last_name} ${emp.email ?? ''} ${emp.job_title ?? ''}`.toLowerCase().includes(q);
  });

  function handleToggleStatus(emp: OnboardingEmployeeRow) {
    setActionId(emp.id);
    startTransition(async () => {
      const result = await toggleEmployeeStatus(emp.id, !emp.is_active);
      if (result.success) {
        setEmployees(es => es.map(e => e.id === emp.id ? { ...e, is_active: !e.is_active } : e));
      }
      setActionId(null);
    });
  }

  if (employees.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center">
          <UserPlus className="h-8 w-8 text-blue-300" />
        </div>
        <div>
          <p className="text-[15px] font-semibold text-gray-600">No new employees in onboarding</p>
          <p className="text-[13px] text-gray-400 mt-1">
            Employees will appear here when they are created with the &ldquo;New Hire&rdquo; option and are actively going through onboarding.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search new employees…"
          className="pl-9 h-10 text-[13px]"
        />
      </div>

      {/* Count */}
      <p className="text-[12px] text-gray-400">
        Showing {filtered.length} of {employees.length} employee{employees.length !== 1 ? 's' : ''} in onboarding
      </p>

      {/* List */}
      <div className="space-y-2">
        {filtered.map(emp => {
          const expanded  = expandedId === emp.id;
          const isBusy    = actionId === emp.id;
          const cfg       = STATUS_CONFIG[emp.onboarding_status] ?? STATUS_CONFIG.active;
          const hospital  = emp.roles[0]?.hospital;

          return (
            <div key={emp.id}
              className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-[0_2px_6px_rgba(0,0,0,0.08)]">

              {/* Header row */}
              <div className="flex items-center gap-4 px-4 py-3.5">
                {/* Avatar */}
                <div className={cn(
                  'h-10 w-10 rounded-full flex items-center justify-center text-white text-[13px] font-bold shrink-0',
                  emp.is_active ? 'bg-blue-500' : 'bg-gray-300',
                )}>
                  {getInitials(emp)}
                </div>

                {/* Name + meta */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[14px] font-semibold text-gray-900 truncate">
                      {emp.first_name} {emp.last_name}
                    </span>
                    {/* Onboarding status badge */}
                    <span className={cn(
                      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold',
                      cfg.badge,
                    )}>
                      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', cfg.dot)} />
                      {cfg.label}
                    </span>
                    {/* Active/Inactive */}
                    <span className={cn(
                      'px-2 py-0.5 rounded-full text-[11px] font-semibold',
                      emp.is_active
                        ? 'bg-green-50 text-green-700 border border-green-200'
                        : 'bg-red-50 text-red-600 border border-red-200',
                    )}>
                      {emp.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className="text-[12px] text-gray-500 truncate">{emp.email}</span>
                    {emp.job_title && (
                      <span className="text-[11px] text-gray-400">· {emp.job_title}</span>
                    )}
                    {hospital && (
                      <span className="flex items-center gap-1 text-[11px] text-gray-400">
                        <Building2 className="h-3 w-3" />
                        {hospital.name}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-[11px] text-gray-400">
                      <Clock className="h-3 w-3" />
                      Started {timeAgo(emp.onboarding_started_at)}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggleStatus(emp)}
                    disabled={isBusy}
                    title={emp.is_active ? 'Deactivate' : 'Activate'}
                    className={cn(
                      'h-8 w-8 flex items-center justify-center rounded-lg border transition-all',
                      emp.is_active
                        ? 'text-red-400 border-red-200 hover:bg-red-50'
                        : 'text-green-600 border-green-200 hover:bg-green-50',
                      isBusy && 'opacity-40 pointer-events-none',
                    )}
                  >
                    {isBusy
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : emp.is_active
                        ? <UserX className="h-4 w-4" />
                        : <UserCheck className="h-4 w-4" />
                    }
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : emp.id)}
                    className="h-8 w-8 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-400 transition-colors"
                    aria-label={expanded ? 'Collapse' : 'Expand'}
                  >
                    {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Expanded detail */}
              {expanded && (
                <div className="border-t border-gray-100 px-4 py-4 bg-gray-50/60 space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-[12px]">
                    <div>
                      <p className="text-gray-400 uppercase tracking-wide text-[10px] font-semibold mb-0.5">Department</p>
                      <p className="text-gray-800 font-medium">{emp.department ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 uppercase tracking-wide text-[10px] font-semibold mb-0.5">Job Title</p>
                      <p className="text-gray-800 font-medium">{emp.job_title ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 uppercase tracking-wide text-[10px] font-semibold mb-0.5">Created</p>
                      <p className="text-gray-800 font-medium">{new Date(emp.created_at).toLocaleDateString()}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 uppercase tracking-wide text-[10px] font-semibold mb-0.5">Onboarding Started</p>
                      <p className="text-gray-800 font-medium">{new Date(emp.onboarding_started_at).toLocaleDateString()}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 uppercase tracking-wide text-[10px] font-semibold mb-0.5">Last Seen</p>
                      <p className="text-gray-800 font-medium">
                        {emp.last_seen_at ? new Date(emp.last_seen_at).toLocaleDateString() : 'Never'}
                      </p>
                    </div>
                  </div>

                  {/* Roles */}
                  {emp.roles.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Assigned Roles</p>
                      <div className="flex flex-wrap gap-2">
                        {emp.roles.map((r, i) => (
                          <span key={i}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-[12px] font-medium text-gray-700">
                            {r.hospital && (
                              <span className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: r.hospital.color ?? '#94a3b8' }} />
                            )}
                            {r.role.replace('_', ' ')}
                            {r.hospital && <span className="text-gray-400 font-normal">· {r.hospital.name}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && search && (
          <div className="text-center py-12">
            <Search className="h-8 w-8 text-gray-200 mx-auto mb-2" />
            <p className="text-[13px] text-gray-400">No employees match &ldquo;{search}&rdquo;</p>
          </div>
        )}
      </div>
    </div>
  );
}
