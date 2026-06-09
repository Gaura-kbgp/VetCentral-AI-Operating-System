'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Building2, Users, Layers, Calendar, GraduationCap, FileText,
  ClipboardList, BarChart3, ArrowLeft, MapPin, Phone, Globe,
  Mail, Clock, Loader2, Search, CheckCircle2, AlertCircle,
  Award, ChevronRight, Sparkles, ShieldCheck, Activity,
  User, Briefcase, BookOpen, FolderOpen, ExternalLink,
  Zap, ListChecks, TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  Hospital, HospitalAnalytics, HospitalEmployee, HospitalDepartment,
  HospitalTrainingStats,
} from '@/lib/actions/hospital-hub';
import {
  getHospitalEmployees, getHospitalDepartments, getHospitalTrainingStats,
  getHospitalEvents, getHospitalDocuments,
  getHospitalTasks, getHospitalAnnouncements,
} from '@/lib/actions/hospital-hub';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

type Tab = 'overview' | 'employees' | 'departments' | 'calendar'
         | 'training' | 'projects' | 'documents' | 'analytics';

const TABS: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
  { id: 'overview',     label: 'Overview',     icon: Activity      },
  { id: 'employees',    label: 'Employees',    icon: Users         },
  { id: 'departments',  label: 'Departments',  icon: Layers        },
  { id: 'calendar',     label: 'Calendar',     icon: Calendar      },
  { id: 'training',     label: 'Training',     icon: GraduationCap },
  { id: 'projects',     label: 'Projects',     icon: Zap           },
  { id: 'documents',    label: 'Documents',    icon: FileText      },
  { id: 'analytics',   label: 'Analytics',   icon: BarChart3     },
];

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin', org_admin: 'Org Admin',
  hospital_admin: 'Admin', practice_manager: 'Manager',
  doctor: 'Doctor', csr: 'CSR', va: 'Vet Assistant',
  hr: 'HR', marketing: 'Marketing', it_admin: 'IT', viewer: 'Viewer',
};

const ROLE_GROUPS = [
  { key: 'doctor',           label: 'Doctors'        },
  { key: 'practice_manager', label: 'Managers'        },
  { key: 'hr',               label: 'HR'              },
  { key: 'csr',              label: 'CSR'             },
  { key: 'va',               label: 'Vet Assistants'  },
  { key: 'hospital_admin',   label: 'Admins'          },
];

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function Badge({ children, color = 'gray' }: { children: React.ReactNode; color?: string }) {
  const cls: Record<string, string> = {
    green:  'bg-green-50 text-green-700 border-green-100',
    red:    'bg-red-50 text-red-700 border-red-100',
    amber:  'bg-amber-50 text-amber-700 border-amber-100',
    blue:   'bg-blue-50 text-blue-700 border-blue-100',
    gray:   'bg-gray-50 text-gray-600 border-gray-100',
    purple: 'bg-purple-50 text-purple-700 border-purple-100',
  };
  return (
    <span className={cn('inline-flex items-center text-[10px] font-bold border rounded-full px-2 py-0.5', cls[color] ?? cls.gray)}>
      {children}
    </span>
  );
}

function MiniStat({ icon: Icon, value, label, color = 'orange' }: {
  icon: React.ElementType; value: number | string; label: string; color?: string;
}) {
  const colors: Record<string, string> = {
    orange: 'bg-orange-50 text-orange-500',
    blue:   'bg-blue-50 text-blue-500',
    green:  'bg-green-50 text-green-500',
    red:    'bg-red-50 text-red-500',
    purple: 'bg-purple-50 text-purple-500',
    amber:  'bg-amber-50 text-amber-500',
  };
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center shrink-0', colors[color] ?? colors.orange)}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-[22px] font-bold text-gray-900 leading-none">{value}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{label}</p>
        </div>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-6 w-6 animate-spin text-orange-400" />
    </div>
  );
}

function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="text-center py-16">
      <Icon className="h-14 w-14 text-gray-200 mx-auto mb-3" />
      <p className="text-[14px] text-gray-500">{message}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Overview Tab
// ─────────────────────────────────────────────────────────────

function OverviewTab({ hospitalId, analytics, color }: {
  hospitalId: string;
  analytics: HospitalAnalytics | null;
  color: string;
}) {
  const [events,  setEvents]  = useState<any[]>([]);
  const [tasks,   setTasks]   = useState<any[]>([]);
  const [notices, setNotices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getHospitalEvents(hospitalId, 5),
      getHospitalTasks(hospitalId),
      getHospitalAnnouncements(hospitalId),
    ]).then(([ev, tk, an]) => {
      setEvents(ev.success ? ev.data : []);
      setTasks(tk.success ? tk.data : []);
      setNotices(an.success ? an.data : []);
      setLoading(false);
    });
  }, [hospitalId]);

  if (!analytics || loading) return <LoadingState />;

  const a = analytics;

  return (
    <div className="space-y-6">
      {/* Announcements */}
      {notices.filter(n => n.priority !== 'normal').length > 0 && (
        <div className="space-y-2">
          {notices.filter(n => n.priority !== 'normal').map((n: any) => (
            <div key={n.id} className={cn(
              'flex items-start gap-3 p-4 rounded-xl border',
              n.priority === 'urgent' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200',
            )}>
              <AlertCircle className={cn('h-4 w-4 mt-0.5 shrink-0', n.priority === 'urgent' ? 'text-red-500' : 'text-amber-500')} />
              <div>
                <p className={cn('text-[13px] font-semibold', n.priority === 'urgent' ? 'text-red-700' : 'text-amber-700')}>
                  {n.title}
                </p>
                {n.content && <p className="text-[12px] text-gray-600 mt-0.5">{n.content}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Key metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MiniStat icon={Users}         value={a.staffCount}                  label="Total Staff"    color="blue"   />
        <MiniStat icon={Layers}        value={a.deptCount}                   label="Departments"    color="purple" />
        <MiniStat icon={Calendar}      value={a.eventsThisMonth}             label="Events (30d)"   color="orange" />
        <MiniStat icon={ClipboardList} value={a.openRequests}                label="Open Requests"  color={a.openRequests > 0 ? 'red' : 'green'} />
        <MiniStat icon={GraduationCap} value={`${a.trainingCompletionRate}%`} label="Training Rate" color="green"  />
        <MiniStat icon={FolderOpen}    value={a.openTasks}                   label="Open Tasks"     color={a.openTasks > 0 ? 'amber' : 'green'} />
        <MiniStat icon={Activity}      value={a.eventsLastWeek}              label="Events (7d)"    color="blue"   />
        <MiniStat icon={Award}         value={a.completedTraining}           label="Completions"    color="green"  />
      </div>

      {/* Staff by role */}
      {a.staffByRole.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <h3 className="text-[12px] font-bold uppercase tracking-widest text-gray-400 mb-4">Staff Breakdown by Role</h3>
          <div className="space-y-2.5">
            {a.staffByRole.sort((x, y) => y.count - x.count).map(r => (
              <div key={r.role} className="flex items-center gap-3">
                <p className="text-[12px] text-gray-600 w-28 shrink-0 capitalize">{ROLE_LABELS[r.role] ?? r.role}</p>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.round((r.count / a.staffCount) * 100)}%`,
                      backgroundColor: color,
                    }}
                  />
                </div>
                <p className="text-[12px] font-semibold text-gray-700 w-6 text-right">{r.count}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Upcoming events */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[12px] font-bold uppercase tracking-widest text-gray-400">Upcoming Events</h3>
            <Link href="/calendar" className="text-[11px] text-orange-500 hover:text-orange-600 flex items-center gap-1">
              View all <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
          {events.length === 0 ? (
            <p className="text-[12px] text-gray-400 py-4 text-center">No upcoming events</p>
          ) : (
            <div className="space-y-2">
              {events.map((e: any) => (
                <div key={e.id} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-gray-50">
                  <div className="h-9 w-9 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
                    <Calendar className="h-4 w-4 text-orange-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-900 truncate">{e.title}</p>
                    <p className="text-[11px] text-gray-400">
                      {fmtDate(e.start_time)} {!e.is_all_day && `· ${fmtTime(e.start_time)}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Open tasks */}
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[12px] font-bold uppercase tracking-widest text-gray-400">Open Tasks</h3>
            <Link href="/tasks" className="text-[11px] text-orange-500 hover:text-orange-600 flex items-center gap-1">
              View all <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
          {tasks.length === 0 ? (
            <p className="text-[12px] text-gray-400 py-4 text-center">No open tasks</p>
          ) : (
            <div className="space-y-2">
              {tasks.slice(0, 5).map((t: any) => (
                <div key={t.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50">
                  <div className={cn('h-2 w-2 rounded-full shrink-0', {
                    'bg-red-500':    t.priority === 'urgent',
                    'bg-orange-500': t.priority === 'high',
                    'bg-yellow-500': t.priority === 'medium',
                    'bg-gray-300':   t.priority === 'low',
                  })} />
                  <p className="flex-1 text-[13px] text-gray-800 truncate">{t.title}</p>
                  {t.due_date && (
                    <p className="text-[11px] text-gray-400 shrink-0">{fmtDate(t.due_date)}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Employees Tab
// ─────────────────────────────────────────────────────────────

function EmployeesTab({ hospitalId }: { hospitalId: string }) {
  const [employees,   setEmployees]   = useState<HospitalEmployee[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState('');
  const [roleFilter,  setRoleFilter]  = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getHospitalEmployees(hospitalId, { search, role: roleFilter || undefined });
    if (res.success) setEmployees(res.data);
    setLoading(false);
  }, [hospitalId, search, roleFilter]);

  useEffect(() => { load(); }, [load]);

  const grouped = ROLE_GROUPS.map(g => ({
    ...g,
    members: employees.filter(e => e.role === g.key),
  })).filter(g => g.members.length > 0);

  const ungrouped = employees.filter(e => !ROLE_GROUPS.some(g => g.key === e.role));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search employees…"
            className="w-full h-9 pl-9 pr-4 border border-gray-200 rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-300"
          />
        </div>
        <select
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
          className="h-9 px-3 border border-gray-200 rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-300"
        >
          <option value="">All Roles</option>
          {ROLE_GROUPS.map(g => <option key={g.key} value={g.key}>{g.label}</option>)}
        </select>
        <p className="text-[12px] text-gray-400 shrink-0">{employees.length} employees</p>
      </div>

      {loading ? <LoadingState /> : employees.length === 0 ? (
        <EmptyState icon={Users} message="No employees found" />
      ) : (
        <div className="space-y-6">
          {(roleFilter
            ? [{ key: roleFilter, label: ROLE_LABELS[roleFilter] ?? roleFilter, members: employees }]
            : grouped
          ).map(group => (
            <div key={group.key}>
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-3">
                {group.label} ({group.members.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {group.members.map(emp => (
                  <div key={emp.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0 overflow-hidden">
                      {emp.avatar_url
                        ? <img src={emp.avatar_url} alt="" className="h-full w-full object-cover" />
                        : <User className="h-5 w-5 text-gray-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-gray-900 truncate">
                        {emp.first_name} {emp.last_name}
                      </p>
                      <p className="text-[11px] text-gray-400 truncate">{emp.job_title ?? emp.email}</p>
                      {emp.department && (
                        <p className="text-[10px] text-gray-400">{emp.department}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge color={emp.is_active ? 'green' : 'red'}>
                        {ROLE_LABELS[emp.role] ?? emp.role}
                      </Badge>
                      {emp.last_seen_at && (
                        <p className="text-[10px] text-gray-400">
                          {new Date(emp.last_seen_at) > new Date(Date.now() - 86_400_000)
                            ? 'Today'
                            : fmtDate(emp.last_seen_at)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {ungrouped.length > 0 && !roleFilter && (
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-3">Other ({ungrouped.length})</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {ungrouped.map(emp => (
                  <div key={emp.id} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3 shadow-sm">
                    <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                      <User className="h-5 w-5 text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-gray-900">{emp.first_name} {emp.last_name}</p>
                      <p className="text-[11px] text-gray-400">{emp.job_title ?? emp.email}</p>
                    </div>
                    <Badge>{ROLE_LABELS[emp.role] ?? emp.role}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Departments Tab
// ─────────────────────────────────────────────────────────────

function DepartmentsTab({ hospitalId }: { hospitalId: string }) {
  const [depts,   setDepts]   = useState<HospitalDepartment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getHospitalDepartments(hospitalId).then(res => {
      if (res.success) setDepts(res.data);
      setLoading(false);
    });
  }, [hospitalId]);

  if (loading) return <LoadingState />;
  if (!depts.length) return <EmptyState icon={Layers} message="No departments configured yet" />;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {depts.map(d => (
        <div key={d.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
          <div className="h-1.5 w-full" style={{ backgroundColor: d.color }} />
          <div className="p-4 flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${d.color}20` }}>
                <Layers className="h-4.5 w-4.5" style={{ color: d.color }} />
              </div>
              <div>
                <p className="text-[14px] font-bold text-gray-900">{d.name}</p>
                {d.description && <p className="text-[11px] text-gray-400 mt-0.5">{d.description}</p>}
              </div>
            </div>
            <div className="flex items-center gap-4 text-[12px] text-gray-500">
              <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {d.memberCount} members</span>
              {d.managerName && <span className="flex items-center gap-1"><Briefcase className="h-3.5 w-3.5" /> {d.managerName}</span>}
            </div>
            {!d.is_active && <Badge color="red">Inactive</Badge>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Calendar Tab
// ─────────────────────────────────────────────────────────────

function CalendarTab({ hospitalId }: { hospitalId: string }) {
  const [events,  setEvents]  = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getHospitalEvents(hospitalId, 30).then(res => {
      if (res.success) setEvents(res.data);
      setLoading(false);
    });
  }, [hospitalId]);

  if (loading) return <LoadingState />;
  if (!events.length) return <EmptyState icon={Calendar} message="No upcoming events for this hospital" />;

  const EVENT_COLORS: Record<string, string> = {
    meeting: '#3b82f6', training: '#f97316', pto: '#10b981',
    hospital_event: '#8b5cf6', other: '#6b7280',
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-gray-500">{events.length} upcoming events</p>
        <Link href="/calendar" className="flex items-center gap-1 text-[12px] text-orange-500 hover:text-orange-600">
          Open full calendar <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      {events.map((e: any) => {
        const color = e.color ?? EVENT_COLORS[e.event_type] ?? '#6b7280';
        return (
          <div key={e.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-start gap-4">
            <div className="flex flex-col items-center justify-center h-12 w-12 rounded-xl shrink-0" style={{ backgroundColor: `${color}18` }}>
              <p className="text-[11px] font-bold leading-none" style={{ color }}>{new Date(e.start_time).toLocaleDateString('en-US', { month: 'short' })}</p>
              <p className="text-[18px] font-bold leading-none" style={{ color }}>{new Date(e.start_time).getDate()}</p>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-semibold text-gray-900">{e.title}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {e.is_all_day ? 'All day' : `${fmtTime(e.start_time)} – ${fmtTime(e.end_time)}`}
                {e.location && ` · ${e.location}`}
              </p>
            </div>
            <span className="inline-flex items-center text-[10px] font-semibold border rounded-full px-2 py-0.5 capitalize shrink-0" style={{ backgroundColor: `${color}18`, color, borderColor: `${color}30` }}>
              {e.event_type.replace('_', ' ')}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Training Tab
// ─────────────────────────────────────────────────────────────

function TrainingTab({ hospitalId }: { hospitalId: string }) {
  const [stats,   setStats]   = useState<HospitalTrainingStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getHospitalTrainingStats(hospitalId).then(res => {
      if (res.success) setStats(res.data);
      setLoading(false);
    });
  }, [hospitalId]);

  if (loading) return <LoadingState />;
  if (!stats)  return <EmptyState icon={GraduationCap} message="No training data available" />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MiniStat icon={BookOpen}     value={stats.totalEnrollments}       label="Total Enrollments"  color="blue"   />
        <MiniStat icon={CheckCircle2} value={`${stats.completionRate}%`}   label="Completion Rate"    color="green"  />
        <MiniStat icon={ShieldCheck}  value={`${stats.complianceRate}%`}   label="Compliance Rate"    color={stats.complianceRate < 80 ? 'red' : 'green'} />
        <MiniStat icon={Award}        value={stats.certCount}              label="Certificates"       color="amber"  />
      </div>

      {(stats.overdueCount > 0 || stats.dueCount > 0) && (
        <div className="flex gap-3 flex-wrap">
          {stats.overdueCount > 0 && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-[13px] text-red-700 font-medium">
              <AlertCircle className="h-4 w-4" /> {stats.overdueCount} overdue enrollment{stats.overdueCount !== 1 ? 's' : ''}
            </div>
          )}
          {stats.dueCount > 0 && (
            <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-[13px] text-amber-700 font-medium">
              <AlertCircle className="h-4 w-4" /> {stats.dueCount} due in 30 days
            </div>
          )}
        </div>
      )}

      {stats.courseBreakdown.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          <p className="px-5 py-3 text-[11px] font-bold uppercase tracking-widest text-gray-400 border-b border-gray-100">Course Breakdown</p>
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Course', 'Type', 'Enrolled', 'Completed', 'Rate'].map(h => (
                  <th key={h} className="text-left text-[10px] font-bold uppercase tracking-widest text-gray-400 px-5 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.courseBreakdown.map(c => {
                const rate = c.enrolled > 0 ? Math.round((c.completed / c.enrolled) * 100) : 0;
                return (
                  <tr key={c.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                    <td className="px-5 py-3">
                      <p className="text-[13px] font-medium text-gray-900">{c.title}</p>
                    </td>
                    <td className="px-5 py-3">
                      {c.is_required && <Badge color="red">Required</Badge>}
                      {c.compliance_type && <Badge color="amber">{c.compliance_type}</Badge>}
                      {!c.is_required && !c.compliance_type && <Badge>Optional</Badge>}
                    </td>
                    <td className="px-5 py-3 text-[13px] text-gray-600">{c.enrolled}</td>
                    <td className="px-5 py-3 text-[13px] text-gray-600">{c.completed}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full', rate >= 80 ? 'bg-green-400' : rate >= 50 ? 'bg-amber-400' : 'bg-red-400')} style={{ width: `${rate}%` }} />
                        </div>
                        <span className="text-[12px] font-semibold text-gray-700">{rate}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Projects Tab
// ─────────────────────────────────────────────────────────────

function ProjectsTab({ hospitalId }: { hospitalId: string }) {
  const [tasks,   setTasks]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState<'all' | 'todo' | 'in_progress' | 'review'>('all');

  useEffect(() => {
    getHospitalTasks(hospitalId).then(res => {
      if (res.success) setTasks(res.data);
      setLoading(false);
    });
  }, [hospitalId]);

  const filtered = filter === 'all' ? tasks : tasks.filter(t => t.status === filter);

  const counts = {
    all:        tasks.length,
    todo:       tasks.filter(t => t.status === 'todo').length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    review:     tasks.filter(t => t.status === 'review').length,
  };

  const statusConfig: Record<string, { label: string; cls: string; dot: string }> = {
    todo:        { label: 'To Do',      cls: 'bg-gray-100 text-gray-600',    dot: 'bg-gray-400' },
    in_progress: { label: 'In Progress', cls: 'bg-blue-50 text-blue-700',    dot: 'bg-blue-500' },
    review:      { label: 'Review',      cls: 'bg-purple-50 text-purple-700', dot: 'bg-purple-500' },
    done:        { label: 'Done',        cls: 'bg-green-50 text-green-700',   dot: 'bg-green-500' },
  };

  const priorityDot: Record<string, string> = {
    urgent: 'bg-red-500', high: 'bg-orange-500', medium: 'bg-yellow-500', low: 'bg-gray-300',
  };

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-5">
      {/* Summary + filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['all', 'todo', 'in_progress', 'review'] as const).map(key => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={cn(
              'flex items-center gap-1.5 h-8 px-3.5 rounded-xl text-[12px] font-medium border transition-colors',
              filter === key
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300',
            )}
          >
            {key === 'all' ? 'All' : statusConfig[key]?.label ?? key}
            <span className={cn('text-[11px] font-bold rounded-full px-1.5', filter === key ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500')}>
              {counts[key]}
            </span>
          </button>
        ))}
        <Link
          href={`/projects?hospital=${hospitalId}`}
          className="ml-auto flex items-center gap-1 text-[12px] text-orange-500 hover:text-orange-600"
        >
          Open Projects Board <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={ListChecks} message="No tasks in this status" />
      ) : (
        <div className="space-y-2">
          {filtered.map((t: any) => {
            const sc = statusConfig[t.status] ?? statusConfig.todo;
            return (
              <div key={t.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3 hover:border-gray-200 transition-colors">
                <div className={cn('h-2 w-2 rounded-full shrink-0', priorityDot[t.priority] ?? 'bg-gray-300')} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-gray-900 truncate">{t.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {t.assignee && (
                      <span className="text-[11px] text-gray-400 flex items-center gap-0.5">
                        <User className="h-3 w-3" /> {t.assignee}
                      </span>
                    )}
                    {t.due_date && (
                      <span className="text-[11px] text-gray-400 flex items-center gap-0.5">
                        <Calendar className="h-3 w-3" /> {fmtDate(t.due_date)}
                      </span>
                    )}
                  </div>
                </div>
                <span className={cn('text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0', sc.cls)}>
                  {sc.label}
                </span>
                <span className="text-[10px] font-semibold text-gray-400 capitalize shrink-0">{t.priority}</span>
              </div>
            );
          })}
        </div>
      )}

      {tasks.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center">
          <TrendingUp className="h-12 w-12 text-gray-200 mx-auto mb-3" />
          <p className="text-[14px] font-semibold text-gray-600 mb-1">No tasks assigned to this hospital</p>
          <p className="text-[12px] text-gray-400 mb-4">Create tasks in the Projects board and assign them here.</p>
          <Link
            href="/projects"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium transition-colors"
          >
            <Zap className="h-4 w-4" /> Open Projects
          </Link>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Documents Tab
// ─────────────────────────────────────────────────────────────

function DocumentsTab({ hospitalId }: { hospitalId: string }) {
  const [docs,    setDocs]    = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');

  useEffect(() => {
    getHospitalDocuments(hospitalId).then(res => {
      if (res.success) setDocs(res.data);
      setLoading(false);
    });
  }, [hospitalId]);

  const filtered = docs.filter(d =>
    !search || d.title.toLowerCase().includes(search.toLowerCase()) ||
    (d.category ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const categories = [...new Set(docs.map(d => d.category).filter(Boolean))];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search documents…"
            className="w-full h-9 pl-9 pr-4 border border-gray-200 rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-300"
          />
        </div>
        <Link href="/knowledge-base" className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium transition-colors">
          <BookOpen className="h-4 w-4" /> Knowledge Base
        </Link>
      </div>

      {loading ? <LoadingState /> : filtered.length === 0 ? (
        <EmptyState icon={FileText} message="No documents found for this hospital" />
      ) : (
        <div className="space-y-2">
          {categories.map(cat => {
            const catDocs = filtered.filter(d => d.category === cat);
            if (!catDocs.length) return null;
            return (
              <div key={cat}>
                <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-2">{cat}</p>
                {catDocs.map((d: any) => (
                  <Link key={d.id} href={`/knowledge-base/${d.id}`} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 shadow-sm hover:border-orange-200 hover:shadow-md transition-all mb-2">
                    <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                      <FileText className="h-4.5 w-4.5 text-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-gray-900 truncate">{d.title}</p>
                      <p className="text-[11px] text-gray-400">{fmtDate(d.created_at)} · {d.view_count} views</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-300" />
                  </Link>
                ))}
              </div>
            );
          })}
          {filtered.filter(d => !d.category).map((d: any) => (
            <Link key={d.id} href={`/knowledge-base/${d.id}`} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 shadow-sm hover:border-orange-200 mb-2">
              <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                <FileText className="h-4.5 w-4.5 text-blue-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-gray-900 truncate">{d.title}</p>
                <p className="text-[11px] text-gray-400">{fmtDate(d.created_at)}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-300" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Analytics Tab
// ─────────────────────────────────────────────────────────────

function AnalyticsTab({ hospitalId, analytics }: { hospitalId: string; analytics: HospitalAnalytics | null }) {
  const [training, setTraining] = useState<HospitalTrainingStats | null>(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    getHospitalTrainingStats(hospitalId).then(res => {
      if (res.success) setTraining(res.data);
      setLoading(false);
    });
  }, [hospitalId]);

  if (!analytics || loading) return <LoadingState />;
  const a = analytics;
  const t = training;

  const kpis = [
    { label: 'Total Staff',          value: a.staffCount,                     icon: Users,        color: 'blue'   },
    { label: 'Departments',          value: a.deptCount,                      icon: Layers,        color: 'purple' },
    { label: 'Events (30d)',         value: a.eventsThisMonth,                icon: Calendar,      color: 'orange' },
    { label: 'Open Tasks',           value: a.openTasks,                      icon: FolderOpen,    color: 'amber'  },
    { label: 'Open Requests',        value: a.openRequests,                   icon: ClipboardList, color: a.openRequests > 0 ? 'red' : 'green' },
    { label: 'Training Completion',  value: `${a.trainingCompletionRate}%`,   icon: GraduationCap, color: 'green'  },
    { label: 'Compliance Rate',      value: t ? `${t.complianceRate}%` : '—', icon: ShieldCheck,   color: t && t.complianceRate < 80 ? 'red' : 'green' },
    { label: 'Certificates Earned',  value: t?.certCount ?? 0,                icon: Award,         color: 'amber'  },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map(k => <MiniStat key={k.label} icon={k.icon} value={k.value} label={k.label} color={k.color} />)}
      </div>

      {a.staffByRole.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <h3 className="text-[12px] font-bold uppercase tracking-widest text-gray-400 mb-4">Staff Distribution</h3>
          <div className="space-y-2.5">
            {a.staffByRole.sort((x, y) => y.count - x.count).map(r => (
              <div key={r.role} className="flex items-center gap-3">
                <p className="text-[12px] text-gray-600 w-32 shrink-0 capitalize">{ROLE_LABELS[r.role] ?? r.role}</p>
                <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-linear-to-r from-orange-400 to-amber-400 transition-all"
                    style={{ width: `${a.staffCount > 0 ? Math.round((r.count / a.staffCount) * 100) : 0}%` }}
                  />
                </div>
                <p className="text-[12px] font-bold text-gray-700 w-8 text-right">{r.count}</p>
                <p className="text-[11px] text-gray-400 w-8 text-right">
                  {a.staffCount > 0 ? `${Math.round((r.count / a.staffCount) * 100)}%` : '0%'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {t && t.courseBreakdown.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          <p className="px-5 py-3 text-[11px] font-bold uppercase tracking-widest text-gray-400 border-b border-gray-100">Training Performance</p>
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Course', 'Required', 'Enrolled', 'Completed', 'Rate'].map(h => (
                  <th key={h} className="text-left text-[10px] font-bold uppercase tracking-widest text-gray-400 px-5 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.courseBreakdown.map(c => {
                const rate = c.enrolled > 0 ? Math.round((c.completed / c.enrolled) * 100) : 0;
                return (
                  <tr key={c.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                    <td className="px-5 py-3 text-[13px] font-medium text-gray-900 max-w-[180px] truncate">{c.title}</td>
                    <td className="px-5 py-3"><Badge color={c.is_required ? 'red' : 'gray'}>{c.is_required ? 'Yes' : 'No'}</Badge></td>
                    <td className="px-5 py-3 text-[13px] text-gray-600">{c.enrolled}</td>
                    <td className="px-5 py-3 text-[13px] text-gray-600">{c.completed}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full', rate >= 80 ? 'bg-green-400' : rate >= 50 ? 'bg-amber-400' : 'bg-red-400')} style={{ width: `${rate}%` }} />
                        </div>
                        <span className="text-[12px] font-semibold">{rate}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Hospital Detail Root
// ─────────────────────────────────────────────────────────────

const ROLE_LABELS_MAP: Record<string, string> = {
  super_admin: 'Super Admin', org_admin: 'Org Admin',
  hospital_admin: 'Admin', practice_manager: 'Manager',
  doctor: 'Doctor', csr: 'CSR', va: 'Vet Assistant',
  hr: 'HR', marketing: 'Marketing', it_admin: 'IT',
};

interface HospitalDetailProps {
  hospital: Hospital;
  analytics: HospitalAnalytics | null;
  myRole: string | null;
  isAdmin: boolean;
  userId: string;
  initialTab?: Tab;
}

export function HospitalDetail({ hospital, analytics, myRole, isAdmin, userId, initialTab }: HospitalDetailProps) {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab ?? 'overview');
  const color = hospital.color ?? '#2563EB';

  const aiPrompt = encodeURIComponent(
    `Tell me the status of ${hospital.name} hospital. Include staff count, training compliance, upcoming events, and any open requests.`
  );

  return (
    <div className="flex flex-col gap-0 -mx-6 -mt-6">
      {/* Hospital header */}
      <div className="px-6 pt-6 pb-5 bg-white border-b border-gray-100">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-[12px] text-gray-400 mb-4">
          <Link href="/hospital-hub" className="flex items-center gap-1 hover:text-gray-600 transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" /> Hospital Hub
          </Link>
          <span>/</span>
          <span className="text-gray-700 font-medium">{hospital.name}</span>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div
              className="h-14 w-14 rounded-2xl flex items-center justify-center shrink-0 shadow-sm"
              style={{ backgroundColor: `${color}18`, border: `2px solid ${color}30` }}
            >
              <Building2 className="h-7 w-7" style={{ color }} />
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-[22px] font-bold text-gray-900">{hospital.name}</h1>
                {myRole && (
                  <span className="text-[11px] font-bold text-white rounded-full px-2.5 py-0.5" style={{ backgroundColor: color }}>
                    {ROLE_LABELS_MAP[myRole] ?? myRole}
                  </span>
                )}
                <span className={cn(
                  'text-[11px] font-semibold border rounded-full px-2.5 py-0.5',
                  hospital.is_active
                    ? 'bg-green-50 text-green-600 border-green-100'
                    : 'bg-red-50 text-red-600 border-red-100',
                )}>
                  {hospital.is_active ? '● Active' : '○ Inactive'}
                </span>
              </div>
              <div className="flex items-center gap-4 mt-2 flex-wrap">
                {hospital.address && (
                  <span className="flex items-center gap-1 text-[12px] text-gray-400">
                    <MapPin className="h-3.5 w-3.5" />{hospital.address}
                  </span>
                )}
                {hospital.phone && (
                  <a href={`tel:${hospital.phone}`} className="flex items-center gap-1 text-[12px] text-gray-400 hover:text-gray-600">
                    <Phone className="h-3.5 w-3.5" />{hospital.phone}
                  </a>
                )}
                {hospital.email && (
                  <a href={`mailto:${hospital.email}`} className="flex items-center gap-1 text-[12px] text-gray-400 hover:text-gray-600">
                    <Mail className="h-3.5 w-3.5" />{hospital.email}
                  </a>
                )}
                {hospital.timezone && (
                  <span className="flex items-center gap-1 text-[12px] text-gray-400">
                    <Clock className="h-3.5 w-3.5" />{hospital.timezone}
                  </span>
                )}
                {hospital.website && (
                  <a href={hospital.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[12px] text-orange-500 hover:text-orange-600">
                    <Globe className="h-3.5 w-3.5" />{hospital.website}
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={`/ai-assistant?prompt=${aiPrompt}`}
              className="flex items-center gap-1.5 h-9 px-3 rounded-xl border border-gray-200 hover:border-orange-300 hover:bg-orange-50 text-gray-600 hover:text-orange-600 text-[12px] font-medium transition-all"
            >
              <Sparkles className="h-3.5 w-3.5" /> Ask AI
            </Link>
            {isAdmin && (
              <Link
                href="/admin/hospitals"
                className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-[12px] font-medium transition-colors"
              >
                Manage
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Color bar */}
      <div className="h-1" style={{ backgroundColor: color }} />

      {/* Tab nav */}
      <div className="flex items-center gap-0.5 px-6 border-b border-gray-200 bg-white overflow-x-auto shrink-0">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-3.5 text-[13px] font-medium whitespace-nowrap border-b-2 transition-colors',
              activeTab === tab.id
                ? 'border-current text-gray-900'
                : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-200',
            )}
            style={activeTab === tab.id ? { borderColor: color, color } : {}}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 px-6 py-6 overflow-y-auto">
        {activeTab === 'overview'     && <OverviewTab    hospitalId={hospital.id} analytics={analytics} color={color} />}
        {activeTab === 'employees'    && <EmployeesTab   hospitalId={hospital.id} />}
        {activeTab === 'departments'  && <DepartmentsTab hospitalId={hospital.id} />}
        {activeTab === 'calendar'     && <CalendarTab    hospitalId={hospital.id} />}
        {activeTab === 'training'     && <TrainingTab    hospitalId={hospital.id} />}
        {activeTab === 'projects'     && <ProjectsTab    hospitalId={hospital.id} />}
        {activeTab === 'documents'    && <DocumentsTab   hospitalId={hospital.id} />}
        {activeTab === 'analytics'    && <AnalyticsTab   hospitalId={hospital.id} analytics={analytics} />}
      </div>
    </div>
  );
}
