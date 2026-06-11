import { createSupabaseAdminClient } from '@/lib/supabase/server';
import Link from 'next/link';
import {
  Users, FolderOpen, AlertCircle, TrendingUp, UserPlus,
  Clock, CheckCircle2, ArrowRight, ChevronRight, Plus,
  Calendar, Shield, FileText, ClipboardList,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  userId: string;
  orgId: string;
  firstName: string;
  hospitalId: string | null;
}

const PRIORITY_BADGE: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700', high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700', low: 'bg-gray-100 text-gray-600',
};

const STATUS_BADGE: Record<string, string> = {
  planning: 'bg-blue-50 text-blue-700', active: 'bg-green-50 text-green-700',
  on_hold: 'bg-amber-50 text-amber-700',
};

const STAGE_LABEL: Record<string, string> = {
  pre_hire: 'Pre-Hire', documents: 'Documents', orientation: 'Orientation',
  training: 'Training', manager_review: 'Manager Review',
};

export default async function HospitalAdminDashboard({ firstName, hospitalId }: Props) {
  const admin = createSupabaseAdminClient();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const in14 = new Date(now.getTime() + 14 * 86_400_000).toISOString();
  const in30 = new Date(now.getTime() + 30 * 86_400_000).toISOString();

  if (!hospitalId) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Shield className="h-12 w-12 text-gray-200 mb-4" />
        <p className="text-[16px] font-semibold text-gray-600">No hospital assigned</p>
        <p className="text-[13px] text-gray-400 mt-1">Contact your system administrator to assign you to a hospital.</p>
      </div>
    );
  }

  const [
    hospitalRes, staffRes, projectsRes, pendingReqRes, topRequestsRes,
    eventsRes, onboardingRes, enrollmentsRes, expiringCertsRes,
  ] = await Promise.all([
    admin.from('hospitals').select('id, name, color, slug').eq('id', hospitalId).single(),
    admin.from('user_hospital_roles').select('user_id, role').eq('hospital_id', hospitalId).eq('is_active', true),
    admin.from('projects').select('id, name, status, priority, due_date, progress_pct, color').eq('hospital_id', hospitalId).not('status', 'in', '("completed","cancelled")').order('priority', { ascending: false }).limit(5),
    admin.from('requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('requests').select('id, title, request_type, priority, created_at, requested_by').eq('status', 'pending').order('created_at', { ascending: false }).limit(5),
    admin.from('calendar_events').select('id, title, start_time, event_type, location').eq('hospital_id', hospitalId).gte('start_time', todayStart).lte('start_time', in14).eq('is_cancelled', false).order('start_time').limit(6),
    admin.from('onboarding_records').select('stage, status, progress_pct, created_at').eq('hospital_id', hospitalId).eq('status', 'active'),
    admin.from('course_enrollments').select('user_id, completed_at'),
    admin.from('lms_certificates').select('id, user_id, expires_at, course_id').lte('expires_at', in30).eq('is_revoked', false).not('expires_at', 'is', null).order('expires_at').limit(5),
  ]);

  const hospital = hospitalRes.data;
  const staff = staffRes.data ?? [];
  const uniqueStaff = new Set(staff.map(s => s.user_id)).size;
  const projects = projectsRes.data ?? [];
  const events = eventsRes.data ?? [];
  const onboarding = onboardingRes.data ?? [];
  const expiringCerts = expiringCertsRes.data ?? [];

  // Training compliance for hospital staff
  const staffIds = new Set(staff.map(s => s.user_id));
  const enrollments = (enrollmentsRes.data ?? []).filter(e => staffIds.has(e.user_id));
  const enrolledCount = new Set(enrollments.map(e => e.user_id)).size;
  const completedCount = new Set(enrollments.filter(e => e.completed_at).map(e => e.user_id)).size;
  const trainingPct = enrolledCount > 0 ? Math.round((completedCount / enrolledCount) * 100) : 0;

  // Onboarding pipeline
  const pipeline = onboarding.reduce((acc: Record<string, number>, r) => {
    acc[r.stage] = (acc[r.stage] ?? 0) + 1; return acc;
  }, {});

  // Overdue projects
  const overdueProjects = projects.filter(p => p.due_date && new Date(p.due_date) < now).length;
  const healthScore = Math.max(60, Math.min(99, 93 - overdueProjects * 4));

  // Name maps
  const requesterIds = [...new Set((topRequestsRes.data ?? []).map(r => r.requested_by).filter(Boolean))];
  const certUserIds = [...new Set(expiringCerts.map(c => c.user_id))];
  const certCourseIds = [...new Set(expiringCerts.map(c => c.course_id))];
  const allIds = [...new Set([...requesterIds, ...certUserIds])];

  const [namesRes, coursesRes] = await Promise.all([
    allIds.length ? admin.from('profiles').select('id, first_name, last_name').in('id', allIds) : Promise.resolve({ data: [] }),
    certCourseIds.length ? admin.from('lms_courses').select('id, title').in('id', certCourseIds) : Promise.resolve({ data: [] }),
  ]);
  const nameMap = Object.fromEntries((namesRes.data ?? []).map(p => [p.id, `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()]));
  const courseMap = Object.fromEntries((coursesRes.data ?? []).map(c => [c.id, c.title]));

  function timeAgo(iso: string) {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }
  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function fmtTime(iso: string) {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  function daysUntil(iso: string) {
    return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  }

  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const hospitalColor = hospital?.color ?? '#4f46e5';

  return (
    <div className="space-y-6 pb-8">

      {/* ── Hospital Command Header ──────────────────────────── */}
      <div className="rounded-2xl p-6 text-white" style={{ background: `linear-gradient(135deg, ${hospitalColor}dd 0%, ${hospitalColor}99 100%)` }}>
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <p className="text-white/70 text-[13px] font-medium mb-1">{greeting}, {firstName}</p>
            <h1 className="text-2xl font-bold">{hospital?.name ?? 'Your Hospital'}</h1>
            <p className="text-white/70 text-[13px] mt-1">Hospital Administrator · Operational Overview</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/hr" className="flex items-center gap-2 px-3.5 py-2 bg-white/15 hover:bg-white/25 border border-white/20 rounded-lg text-[13px] font-medium text-white transition-colors">
              <Plus className="h-3.5 w-3.5" /> Add Employee
            </Link>
            <Link href="/approvals" className="flex items-center gap-2 px-3.5 py-2 bg-white/15 hover:bg-white/25 border border-white/20 rounded-lg text-[13px] font-medium text-white transition-colors">
              <ClipboardList className="h-3.5 w-3.5" /> Approvals
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          {[
            { label: 'Total Staff',         value: uniqueStaff,                            },
            { label: 'Active Projects',      value: projects.length,                        },
            { label: 'Pending Requests',     value: pendingReqRes.count ?? 0,               },
            { label: 'Training Compliance',  value: `${trainingPct}%`,                      },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white/15 border border-white/15 rounded-xl p-3.5">
              <p className="text-2xl font-bold text-white leading-none">{value}</p>
              <p className="text-[11px] text-white/70 mt-1">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Health + Compliance Strip ────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Health Score */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-3">Hospital Health</p>
          <div className="flex items-end gap-3">
            <p className={cn('text-4xl font-bold', healthScore >= 90 ? 'text-green-600' : healthScore >= 75 ? 'text-yellow-600' : 'text-red-600')}>
              {healthScore}
            </p>
            <p className="text-gray-400 text-sm mb-1">/ 100</p>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden mt-2">
            <div className={cn('h-full rounded-full', healthScore >= 90 ? 'bg-green-500' : healthScore >= 75 ? 'bg-yellow-500' : 'bg-red-500')}
              style={{ width: `${healthScore}%` }} />
          </div>
          {overdueProjects > 0 && (
            <p className="text-[11px] text-red-500 mt-2 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> {overdueProjects} overdue project{overdueProjects > 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* Training Compliance */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-3">Training Compliance</p>
          <div className="flex items-end gap-3">
            <p className={cn('text-4xl font-bold', trainingPct >= 80 ? 'text-green-600' : trainingPct >= 60 ? 'text-yellow-600' : 'text-red-600')}>
              {trainingPct}%
            </p>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden mt-2">
            <div className={cn('h-full rounded-full', trainingPct >= 80 ? 'bg-green-500' : trainingPct >= 60 ? 'bg-yellow-500' : 'bg-red-500')}
              style={{ width: `${trainingPct}%` }} />
          </div>
          <p className="text-[11px] text-gray-400 mt-2">{completedCount} of {enrolledCount} staff trained</p>
        </div>

        {/* Onboarding snapshot */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Onboarding</p>
            <Link href="/onboarding" className="text-[11px] text-blue-600 font-medium">View all</Link>
          </div>
          {onboarding.length === 0 ? (
            <p className="text-[13px] text-gray-400">No active onboarding</p>
          ) : (
            <div className="space-y-1.5">
              {(['pre_hire','documents','orientation','training','manager_review'] as const).map(stage => {
                const count = pipeline[stage] ?? 0;
                if (!count) return null;
                return (
                  <div key={stage} className="flex items-center justify-between">
                    <span className="text-[12px] text-gray-600">{STAGE_LABEL[stage]}</span>
                    <span className="text-[11px] font-semibold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Main Grid ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Active Projects */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2"><FolderOpen className="h-4 w-4 text-purple-500" /><h3 className="text-[14px] font-semibold text-gray-900">Active Projects</h3></div>
            <Link href="/projects" className="text-[12px] text-blue-600 font-medium">View all</Link>
          </div>
          {projects.length === 0 ? (
            <div className="py-10 text-center"><FolderOpen className="h-10 w-10 text-gray-200 mx-auto mb-2" /><p className="text-[14px] text-gray-400">No active projects</p></div>
          ) : (
            <div className="divide-y divide-gray-50">
              {projects.map(p => {
                const isOverdue = p.due_date && new Date(p.due_date) < now;
                return (
                  <div key={p.id} className="px-5 py-3.5 flex items-center gap-3 hover:bg-gray-50">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: p.color ?? '#6b7280' }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-gray-900 truncate">{p.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded', STATUS_BADGE[p.status] ?? 'bg-gray-50 text-gray-600')}>{p.status}</span>
                        {isOverdue && <span className="text-[10px] text-red-500 font-medium">Overdue</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[13px] font-bold text-gray-700">{p.progress_pct}%</p>
                      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${p.progress_pct}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Upcoming Events */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-blue-500" /><h3 className="text-[14px] font-semibold text-gray-900">Upcoming Events</h3></div>
            <Link href="/calendar" className="text-[12px] text-blue-600 font-medium">Calendar</Link>
          </div>
          {events.length === 0 ? (
            <div className="py-10 text-center"><Clock className="h-10 w-10 text-gray-200 mx-auto mb-2" /><p className="text-[14px] text-gray-400">No upcoming events</p></div>
          ) : (
            <div className="divide-y divide-gray-50">
              {events.map(ev => (
                <div key={ev.id} className="px-5 py-3.5 flex items-start gap-3 hover:bg-gray-50">
                  <div className="text-center shrink-0 w-10">
                    <p className="text-[10px] font-bold uppercase text-gray-400">{fmtDate(ev.start_time).split(' ')[0]}</p>
                    <p className="text-[16px] font-bold text-gray-900 leading-tight">{new Date(ev.start_time).getDate()}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-900 truncate">{ev.title}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{fmtTime(ev.start_time)}{ev.location ? ` · ${ev.location}` : ''}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Pending Requests + Expiring Certs ───────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Pending Requests */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2"><AlertCircle className="h-4 w-4 text-amber-500" /><h3 className="text-[14px] font-semibold text-gray-900">Pending Requests</h3></div>
            <Link href="/approvals" className="text-[12px] text-blue-600 font-medium">Approve</Link>
          </div>
          {(topRequestsRes.data ?? []).length === 0 ? (
            <div className="py-10 text-center"><CheckCircle2 className="h-10 w-10 text-green-300 mx-auto mb-2" /><p className="text-[13px] text-gray-400 font-medium">All clear</p></div>
          ) : (
            <div className="divide-y divide-gray-50">
              {(topRequestsRes.data ?? []).map(req => (
                <div key={req.id} className="px-5 py-3.5 flex items-center gap-3 hover:bg-gray-50">
                  <span className={cn('shrink-0 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded', PRIORITY_BADGE[req.priority] ?? PRIORITY_BADGE.low)}>{req.priority}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-900 truncate">{req.title}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{nameMap[req.requested_by] || 'Unknown'} · {timeAgo(req.created_at)}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Expiring Certifications */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2"><Shield className="h-4 w-4 text-red-500" /><h3 className="text-[14px] font-semibold text-gray-900">Expiring Certifications</h3></div>
            <Link href="/training" className="text-[12px] text-blue-600 font-medium">Training</Link>
          </div>
          {expiringCerts.length === 0 ? (
            <div className="py-10 text-center"><CheckCircle2 className="h-10 w-10 text-green-300 mx-auto mb-2" /><p className="text-[13px] text-gray-400">No certifications expiring soon</p></div>
          ) : (
            <div className="divide-y divide-gray-50">
              {expiringCerts.map(cert => {
                const days = daysUntil(cert.expires_at!);
                return (
                  <div key={cert.id} className="px-5 py-3.5 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-gray-900 truncate">{courseMap[cert.course_id] ?? 'Certificate'}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{nameMap[cert.user_id] || 'Unknown'}</p>
                    </div>
                    <span className={cn('shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full',
                      days <= 7 ? 'bg-red-100 text-red-700' : 'bg-amber-50 text-amber-700'
                    )}>
                      {days <= 0 ? 'Expired' : `${days}d`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Quick Actions ────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm p-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Quick Actions</p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Add Employee',     href: '/hr',             Icon: Users },
            { label: 'Approve Requests', href: '/approvals',      Icon: ClipboardList },
            { label: 'Schedule Meeting', href: '/calendar',       Icon: Calendar },
            { label: 'Assign Training',  href: '/training',       Icon: TrendingUp },
            { label: 'View Projects',    href: '/projects',       Icon: FolderOpen },
            { label: 'Upload SOP',       href: '/knowledge-base', Icon: FileText },
          ].map(({ label, href, Icon }, i) => (
            <Link key={href} href={href} className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-white text-[13px] font-medium transition-colors',
              ['bg-indigo-600 hover:bg-indigo-700','bg-amber-600 hover:bg-amber-700','bg-blue-600 hover:bg-blue-700','bg-orange-600 hover:bg-orange-700','bg-purple-600 hover:bg-purple-700','bg-teal-600 hover:bg-teal-700'][i]
            )}>
              <Icon className="h-3.5 w-3.5" /> {label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
