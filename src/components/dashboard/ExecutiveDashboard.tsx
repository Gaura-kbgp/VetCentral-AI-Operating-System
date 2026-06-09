import { createSupabaseAdminClient } from '@/lib/supabase/server';
import Link from 'next/link';
import {
  Building2, Users, FolderOpen, AlertCircle, TrendingUp, UserPlus,
  Clock, CheckCircle2, ArrowRight, Activity, ChevronRight, Plus,
  Globe, BarChart3, Shield, FileText, Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  userId: string;
  orgId: string;
  firstName: string;
  hospitalId: string | null;
  role: 'super_admin' | 'org_admin';
}

const PRIORITY_BADGE: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700 border-red-200',
  high:   'bg-orange-100 text-orange-700 border-orange-200',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  low:    'bg-gray-100 text-gray-600 border-gray-200',
};

const EVENT_DOT: Record<string, string> = {
  meeting: '#3b82f6', training: '#f97316', holiday: '#10b981',
  deadline: '#ef4444', staff: '#8b5cf6', announcement: '#db2777',
};

const STAGE_LABEL: Record<string, string> = {
  pre_hire: 'Pre-Hire', documents: 'Documents', orientation: 'Orientation',
  training: 'Training', manager_review: 'Manager Review',
};

export default async function ExecutiveDashboard({ firstName, orgId, role }: Props) {
  const admin = createSupabaseAdminClient();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const in7 = new Date(now.getTime() + 7 * 86_400_000).toISOString();
  const last30 = new Date(now.getTime() - 30 * 86_400_000).toISOString();

  const [
    hospitalsRes, allHospRolesRes, projectsRes,
    pendingReqRes, topRequestsRes, newHiresRes,
    enrollmentsRes, onboardingRes, eventsRes,
    auditRes, totalEmpRes,
  ] = await Promise.all([
    admin.from('hospitals').select('id, name, color, slug').order('name'),
    admin.from('user_hospital_roles').select('hospital_id, user_id').eq('is_active', true),
    admin.from('projects').select('id, hospital_id, status, name, priority, due_date').not('status', 'in', '("completed","cancelled")'),
    admin.from('requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('requests')
      .select('id, title, request_type, priority, created_at, requested_by')
      .eq('status', 'pending')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(5),
    admin.from('profiles')
      .select('id, first_name, last_name, created_at')
      .gte('created_at', last30)
      .order('created_at', { ascending: false })
      .limit(6),
    admin.from('course_enrollments').select('user_id, completed_at'),
    admin.from('onboarding_records').select('stage, status').eq('status', 'active'),
    admin.from('calendar_events')
      .select('id, title, start_time, event_type, hospital_id')
      .gte('start_time', todayStart).lte('start_time', in7)
      .eq('is_cancelled', false)
      .order('start_time').limit(6),
    admin.from('audit_logs')
      .select('id, action, resource_type, new_data, user_id, created_at')
      .order('created_at', { ascending: false }).limit(7),
    admin.from('profiles').select('id', { count: 'exact', head: true }).eq('is_active', true),
  ]);

  // ── Per-hospital metrics ────────────────────────────────────
  const hospitals = (hospitalsRes.data ?? []).map(h => {
    const staff = new Set(
      (allHospRolesRes.data ?? []).filter(r => r.hospital_id === h.id).map(r => r.user_id)
    ).size;
    const hospProjects = (projectsRes.data ?? []).filter(p => p.hospital_id === h.id);
    const overdue = hospProjects.filter(p => p.due_date && new Date(p.due_date) < now).length;
    const healthScore = Math.max(60, Math.min(99, 93 - overdue * 4));
    return { ...h, staff, openProjects: hospProjects.length, overdue, healthScore };
  });

  // ── Training compliance ─────────────────────────────────────
  const enrollments = enrollmentsRes.data ?? [];
  const enrolled = new Set(enrollments.map(e => e.user_id)).size;
  const trained  = new Set(enrollments.filter(e => e.completed_at).map(e => e.user_id)).size;
  const trainingPct = enrolled > 0 ? Math.round((trained / enrolled) * 100) : 0;

  // ── Onboarding pipeline counts ──────────────────────────────
  const pipeline = (onboardingRes.data ?? []).reduce((acc: Record<string, number>, r) => {
    acc[r.stage] = (acc[r.stage] ?? 0) + 1; return acc;
  }, {});

  // ── Actor + requester name maps ─────────────────────────────
  const actorIds = [...new Set((auditRes.data ?? []).map(l => l.user_id).filter(Boolean))];
  const requesterIds = [...new Set((topRequestsRes.data ?? []).map(r => r.requested_by).filter(Boolean))];
  const allIds = [...new Set([...actorIds, ...requesterIds])];
  const namesRes = allIds.length
    ? await admin.from('profiles').select('id, first_name, last_name').in('id', allIds)
    : { data: [] };
  const nameMap = Object.fromEntries(
    (namesRes.data ?? []).map(p => [p.id, `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()])
  );

  const hospitalMap = Object.fromEntries(hospitals.map(h => [h.id, h]));

  // ── Helpers ─────────────────────────────────────────────────
  function timeAgo(iso: string) {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }
  function fmtEvent(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      + ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="space-y-6 pb-8">

      {/* ── Command Header ──────────────────────────────────── */}
      <div className="rounded-2xl p-6 text-white" style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #1a4fa0 100%)' }}>
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <p className="text-blue-200 text-[13px] font-medium mb-1">{greeting} · {dateStr}</p>
            <h1 className="text-2xl font-bold leading-tight">{firstName}</h1>
            <p className="text-blue-200 text-[13px] mt-1">
              {role === 'super_admin' ? 'Super Admin · Full System Access' : 'Org Admin · Organization Management'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/users" className="flex items-center gap-2 px-3.5 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-[13px] font-medium text-white transition-colors">
              <Plus className="h-3.5 w-3.5" /> Add User
            </Link>
            <Link href="/hospital-hub" className="flex items-center gap-2 px-3.5 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-[13px] font-medium text-white transition-colors">
              <Globe className="h-3.5 w-3.5" /> Hospital Hub
            </Link>
            <Link href="/kpi" className="flex items-center gap-2 px-3.5 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-[13px] font-medium text-white transition-colors">
              <BarChart3 className="h-3.5 w-3.5" /> Analytics
            </Link>
          </div>
        </div>

        {/* Org stat strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-5">
          {[
            { label: 'Total Employees',    value: totalEmpRes.count ?? 0,       icon: Users,       color: 'text-blue-200' },
            { label: 'Open Projects',      value: (projectsRes.data ?? []).length, icon: FolderOpen, color: 'text-blue-200' },
            { label: 'Pending Requests',   value: pendingReqRes.count ?? 0,     icon: AlertCircle, color: (pendingReqRes.count ?? 0) > 5 ? 'text-amber-300' : 'text-blue-200' },
            { label: 'Training Compliance',value: `${trainingPct}%`,            icon: TrendingUp,  color: trainingPct >= 80 ? 'text-green-300' : 'text-amber-300' },
            { label: 'In Onboarding',      value: (onboardingRes.data ?? []).length, icon: UserPlus, color: 'text-blue-200' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-white/10 border border-white/10 rounded-xl p-3.5">
              <Icon className={cn('h-4 w-4 mb-2', color)} />
              <p className="text-2xl font-bold text-white leading-none">{value}</p>
              <p className="text-[11px] text-blue-200 mt-1 leading-tight">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Hospital Health Cards ───────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-bold text-gray-900">Hospital Health Scores</h2>
          <Link href="/hospital-hub" className="text-[13px] text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
            Hospital Hub <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {hospitals.map(h => (
            <Link key={h.id} href={`/hospital-hub/${h.slug}`}
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-gray-300 transition-all group">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: h.color }} />
                  <p className="text-[14px] font-semibold text-gray-900 group-hover:text-blue-600 transition-colors leading-tight">{h.name}</p>
                </div>
                <span className={cn('text-[13px] font-bold px-2.5 py-1 rounded-lg',
                  h.healthScore >= 90 ? 'bg-green-50 text-green-700' :
                  h.healthScore >= 75 ? 'bg-yellow-50 text-yellow-700' : 'bg-red-50 text-red-700'
                )}>{h.healthScore}/100</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
                <div className={cn('h-full rounded-full',
                  h.healthScore >= 90 ? 'bg-green-500' :
                  h.healthScore >= 75 ? 'bg-yellow-500' : 'bg-red-500'
                )} style={{ width: `${h.healthScore}%` }} />
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { n: h.staff,        label: 'Staff' },
                  { n: h.openProjects, label: 'Projects' },
                  { n: h.overdue,      label: 'Overdue', warn: h.overdue > 0 },
                ].map(({ n, label, warn }) => (
                  <div key={label}>
                    <p className={cn('text-[17px] font-bold', warn ? 'text-red-600' : 'text-gray-900')}>{n}</p>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
                  </div>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Main 3-col grid ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Pending Requests */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              <h3 className="text-[14px] font-semibold text-gray-900">Pending Requests</h3>
            </div>
            <span className="text-[11px] bg-amber-50 text-amber-700 border border-amber-100 font-semibold px-2 py-0.5 rounded-full">
              {pendingReqRes.count ?? 0} pending
            </span>
          </div>
          {(topRequestsRes.data ?? []).length === 0 ? (
            <div className="py-10 text-center">
              <CheckCircle2 className="h-10 w-10 text-green-300 mx-auto mb-2" />
              <p className="text-[14px] text-gray-400 font-medium">All clear — no pending requests</p>
            </div>
          ) : (
            <>
              {(topRequestsRes.data ?? []).map((req, i, arr) => (
                <div key={req.id} className={cn('flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors', i < arr.length - 1 && 'border-b border-gray-50')}>
                  <span className={cn('shrink-0 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border', PRIORITY_BADGE[req.priority] ?? PRIORITY_BADGE.low)}>
                    {req.priority}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-900 truncate">{req.title}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {nameMap[req.requested_by] || 'Unknown'} · {req.request_type.replace('_', ' ')} · {timeAgo(req.created_at)}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
                </div>
              ))}
              <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50">
                <Link href="/approvals" className="text-[13px] text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                  Manage all requests <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </>
          )}
        </div>

        {/* Upcoming Events */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-500" />
              <h3 className="text-[14px] font-semibold text-gray-900">Upcoming (7 days)</h3>
            </div>
            <Link href="/calendar" className="text-[12px] text-blue-600 font-medium">Calendar</Link>
          </div>
          {(eventsRes.data ?? []).length === 0 ? (
            <div className="py-10 text-center">
              <Clock className="h-10 w-10 text-gray-200 mx-auto mb-2" />
              <p className="text-[13px] text-gray-400">No upcoming events</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {(eventsRes.data ?? []).map(ev => {
                const color = EVENT_DOT[ev.event_type] ?? '#6b7280';
                const hosp = ev.hospital_id ? hospitalMap[ev.hospital_id] : null;
                return (
                  <div key={ev.id} className="px-5 py-3 flex items-start gap-2.5 hover:bg-gray-50">
                    <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-gray-900 truncate">{ev.title}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{fmtEvent(ev.start_time)}</p>
                      {hosp && (
                        <p className="text-[10px] font-medium mt-0.5" style={{ color: hosp.color }}>{hosp.name}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom Grid ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Recent Activity */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-gray-400" />
              <h3 className="text-[14px] font-semibold text-gray-900">Recent Activity</h3>
            </div>
            <Link href="/admin/audit-logs" className="text-[12px] text-blue-600 font-medium">Audit Logs</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {(auditRes.data ?? []).map(entry => {
              const data = (entry.new_data ?? {}) as Record<string, unknown>;
              const name = (data.name ?? data.title ?? data.first_name) as string | null;
              const label = `${entry.action} ${entry.resource_type?.replace(/_/g, ' ')}${name ? ` · ${name}` : ''}`;
              return (
                <div key={entry.id} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50">
                  <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                    <FileText className="h-3.5 w-3.5 text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-gray-800 truncate capitalize">{label}</p>
                    <p className="text-[11px] text-gray-400">{nameMap[entry.user_id] || 'System'} · {timeAgo(entry.created_at)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Workforce Insights */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-pink-500" />
              <h3 className="text-[14px] font-semibold text-gray-900">Workforce Insights</h3>
            </div>
            <Link href="/onboarding" className="text-[12px] text-blue-600 font-medium">Onboarding</Link>
          </div>
          <div className="p-5 space-y-5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2.5">Onboarding Pipeline</p>
              {Object.keys(pipeline).length === 0 ? (
                <p className="text-[13px] text-gray-400">No active onboarding records</p>
              ) : (
                <div className="space-y-1.5">
                  {(['pre_hire','documents','orientation','training','manager_review'] as const).map(stage => {
                    const count = pipeline[stage] ?? 0;
                    if (!count) return null;
                    return (
                      <div key={stage} className="flex items-center justify-between">
                        <span className="text-[12px] text-gray-600">{STAGE_LABEL[stage]}</span>
                        <span className="text-[11px] font-semibold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2.5">New Hires · Last 30 Days</p>
              {(newHiresRes.data ?? []).length === 0 ? (
                <p className="text-[13px] text-gray-400">No new hires this month</p>
              ) : (
                <div className="space-y-2">
                  {(newHiresRes.data ?? []).map(hire => (
                    <div key={hire.id} className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
                        <span className="text-[10px] font-bold text-indigo-700">
                          {(hire.first_name?.[0] ?? '') + (hire.last_name?.[0] ?? '')}
                        </span>
                      </div>
                      <div>
                        <p className="text-[12px] font-medium text-gray-800">{[hire.first_name, hire.last_name].filter(Boolean).join(' ')}</p>
                        <p className="text-[11px] text-gray-400">{timeAgo(hire.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Quick Actions ────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Quick Actions</p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Add User',       href: '/admin/users',      Icon: Users,    bg: 'bg-blue-600 hover:bg-blue-700' },
            { label: 'Roles & Perms',  href: '/admin/roles',      Icon: Shield,   bg: 'bg-indigo-600 hover:bg-indigo-700' },
            { label: 'Upload SOP',     href: '/knowledge-base',   Icon: FileText, bg: 'bg-teal-600 hover:bg-teal-700' },
            { label: 'Create Training',href: '/training',         Icon: Zap,      bg: 'bg-orange-600 hover:bg-orange-700' },
            { label: 'Analytics',      href: '/kpi',              Icon: BarChart3,bg: 'bg-purple-600 hover:bg-purple-700' },
            { label: 'Hospitals',      href: '/admin/hospitals',  Icon: Building2,bg: 'bg-gray-700 hover:bg-gray-800' },
          ].map(({ label, href, Icon, bg }) => (
            <Link key={href} href={href} className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-white text-[13px] font-medium transition-colors', bg)}>
              <Icon className="h-3.5 w-3.5" /> {label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
