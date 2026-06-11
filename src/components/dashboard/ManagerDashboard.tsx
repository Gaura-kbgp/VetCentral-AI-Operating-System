import { createSupabaseAdminClient } from '@/lib/supabase/server';
import Link from 'next/link';
import {
  FolderOpen, AlertCircle, Clock, CheckCircle2, ChevronRight,
  ArrowRight, Calendar, Users, TrendingUp, ClipboardList,
  BarChart3, MessageSquare,
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
const REQ_TYPE_LABEL: Record<string, string> = {
  leave: 'Leave', equipment: 'Equipment', purchase: 'Purchase',
  training: 'Training', meeting: 'Meeting', document_verification: 'Doc Verify',
};

export default async function ManagerDashboard({ firstName, hospitalId }: Props) {
  const admin = createSupabaseAdminClient();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const in14 = new Date(now.getTime() + 14 * 86_400_000).toISOString();

  const [
    pendingReqRes, pendingCountRes, projectsRes, eventsRes,
    teamRes, enrollmentsRes,
  ] = await Promise.all([
    admin.from('requests')
      .select('id, title, request_type, priority, created_at, requested_by')
      .eq('status', 'pending')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(6),
    admin.from('requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    hospitalId
      ? admin.from('projects').select('id, name, status, priority, due_date, progress_pct, color')
          .eq('hospital_id', hospitalId).not('status', 'in', '("completed","cancelled")')
          .order('priority', { ascending: false }).limit(5)
      : admin.from('projects').select('id, name, status, priority, due_date, progress_pct, color')
          .not('status', 'in', '("completed","cancelled")')
          .order('priority', { ascending: false }).limit(5),
    hospitalId
      ? admin.from('calendar_events')
          .select('id, title, start_time, event_type, location')
          .eq('hospital_id', hospitalId).gte('start_time', todayStart).lte('start_time', in14)
          .eq('is_cancelled', false).order('start_time').limit(6)
      : admin.from('calendar_events')
          .select('id, title, start_time, event_type, location')
          .gte('start_time', todayStart).lte('start_time', in14)
          .eq('is_cancelled', false).order('start_time').limit(6),
    hospitalId
      ? admin.from('user_hospital_roles').select('user_id, role').eq('hospital_id', hospitalId).eq('is_active', true)
      : Promise.resolve({ data: [] }),
    admin.from('course_enrollments').select('user_id, completed_at'),
  ]);

  const requests  = pendingReqRes.data ?? [];
  const projects  = projectsRes.data ?? [];
  const events    = eventsRes.data ?? [];
  const team      = teamRes.data ?? [];
  const teamSize  = new Set(team.map(t => t.user_id)).size;

  // Training compliance
  const enrollments  = enrollmentsRes.data ?? [];
  const enrolled     = new Set(enrollments.map(e => e.user_id)).size;
  const trained      = new Set(enrollments.filter(e => e.completed_at).map(e => e.user_id)).size;
  const trainingPct  = enrolled > 0 ? Math.round((trained / enrolled) * 100) : 0;

  // Overdue / at-risk projects
  const overdueProjects  = projects.filter(p => p.due_date && new Date(p.due_date) < now).length;
  const activeProjects   = projects.filter(p => p.status === 'active').length;

  // Name maps
  const requesterIds = [...new Set(requests.map(r => r.requested_by).filter(Boolean))];
  const namesRes = requesterIds.length
    ? await admin.from('profiles').select('id, first_name, last_name').in('id', requesterIds)
    : { data: [] };
  const nameMap = Object.fromEntries((namesRes.data ?? []).map(p => [p.id, `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()]));

  function timeAgo(iso: string) {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }
  function fmtDateTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      + ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-6 pb-8">

      {/* ── Manager Header ──────────────────────────────────── */}
      <div className="rounded-2xl p-6 text-white" style={{ background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)' }}>
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <p className="text-blue-200 text-[13px] font-medium mb-1">{greeting}, {firstName}</p>
            <h1 className="text-2xl font-bold">Operations Management</h1>
            <p className="text-blue-200 text-[13px] mt-1">Practice Manager · Departmental Oversight</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/approvals" className="flex items-center gap-2 px-3.5 py-2 bg-white/15 hover:bg-white/25 border border-white/20 rounded-lg text-[13px] font-medium text-white transition-colors">
              <ClipboardList className="h-3.5 w-3.5" /> Approvals
            </Link>
            <Link href="/projects" className="flex items-center gap-2 px-3.5 py-2 bg-white/15 hover:bg-white/25 border border-white/20 rounded-lg text-[13px] font-medium text-white transition-colors">
              <FolderOpen className="h-3.5 w-3.5" /> Projects
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          {[
            { label: 'Team Size',          value: teamSize || '—' },
            { label: 'Pending Approvals',  value: pendingCountRes.count ?? 0 },
            { label: 'Active Projects',    value: activeProjects },
            { label: 'Team Training',      value: `${trainingPct}%` },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white/15 border border-white/15 rounded-xl p-3.5">
              <p className="text-2xl font-bold text-white leading-none">{value}</p>
              <p className="text-[11px] text-blue-200 mt-1">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Risk strip ──────────────────────────────────────── */}
      {overdueProjects > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 flex items-center gap-3">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
          <p className="text-[13px] text-red-800 font-medium">
            {overdueProjects} project{overdueProjects > 1 ? 's' : ''} past due date
          </p>
          <Link href="/projects" className="ml-auto text-[12px] text-red-600 font-medium hover:text-red-700 flex items-center gap-1">
            Review <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}

      {/* ── Main Grid ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Pending Approvals */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              <h3 className="text-[14px] font-semibold text-gray-900">Pending Approvals</h3>
            </div>
            <span className="text-[11px] bg-amber-50 text-amber-700 border border-amber-100 font-semibold px-2 py-0.5 rounded-full">
              {pendingCountRes.count ?? 0}
            </span>
          </div>
          {requests.length === 0 ? (
            <div className="py-10 text-center">
              <CheckCircle2 className="h-10 w-10 text-green-300 mx-auto mb-2" />
              <p className="text-[13px] text-gray-400">No pending approvals</p>
            </div>
          ) : (
            <>
              {requests.map((req, i, arr) => (
                <div key={req.id} className={cn('flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50', i < arr.length - 1 && 'border-b border-gray-50')}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={cn('text-[10px] font-bold uppercase px-1.5 py-0.5 rounded', PRIORITY_BADGE[req.priority] ?? PRIORITY_BADGE.low)}>
                        {req.priority}
                      </span>
                      <span className="text-[10px] text-gray-400">{REQ_TYPE_LABEL[req.request_type] ?? req.request_type}</span>
                    </div>
                    <p className="text-[13px] font-medium text-gray-900 truncate">{req.title}</p>
                    <p className="text-[11px] text-gray-400">{nameMap[req.requested_by] || 'Unknown'} · {timeAgo(req.created_at)}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
                </div>
              ))}
              <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50">
                <Link href="/approvals" className="text-[13px] text-blue-600 font-medium flex items-center gap-1">
                  Go to Approval Center <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </>
          )}
        </div>

        {/* Active Projects */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-purple-500" />
              <h3 className="text-[14px] font-semibold text-gray-900">Active Projects</h3>
            </div>
            <Link href="/projects" className="text-[12px] text-blue-600 font-medium">View all</Link>
          </div>
          {projects.length === 0 ? (
            <div className="py-10 text-center"><FolderOpen className="h-10 w-10 text-gray-200 mx-auto mb-2" /><p className="text-[13px] text-gray-400">No active projects</p></div>
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
                      <p className="text-[12px] font-bold text-gray-700">{p.progress_pct}%</p>
                      <div className="w-14 h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${p.progress_pct}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Upcoming Events ─────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-blue-500" />
            <h3 className="text-[14px] font-semibold text-gray-900">Upcoming Events</h3>
          </div>
          <Link href="/calendar" className="text-[12px] text-blue-600 font-medium">View Calendar</Link>
        </div>
        {events.length === 0 ? (
          <div className="py-8 text-center"><Clock className="h-10 w-10 text-gray-200 mx-auto mb-2" /><p className="text-[13px] text-gray-400">No events in the next 2 weeks</p></div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
            {events.map(ev => (
              <div key={ev.id} className="px-5 py-3.5 hover:bg-gray-50">
                <p className="text-[13px] font-medium text-gray-900 truncate">{ev.title}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{fmtDateTime(ev.start_time)}</p>
                {ev.location && <p className="text-[11px] text-gray-400 truncate">{ev.location}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Quick Actions ────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm p-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Quick Actions</p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Approve Requests',  href: '/approvals',       Icon: ClipboardList, bg: 'bg-amber-600 hover:bg-amber-700' },
            { label: 'Create Project',    href: '/projects',        Icon: FolderOpen,    bg: 'bg-purple-600 hover:bg-purple-700' },
            { label: 'Schedule Meeting',  href: '/calendar',        Icon: Calendar,      bg: 'bg-blue-600 hover:bg-blue-700' },
            { label: 'Team Directory',    href: '/hr',              Icon: Users,         bg: 'bg-indigo-600 hover:bg-indigo-700' },
            { label: 'Analytics',         href: '/kpi',             Icon: BarChart3,     bg: 'bg-teal-600 hover:bg-teal-700' },
            { label: 'Communications',    href: '/communication',   Icon: MessageSquare, bg: 'bg-green-600 hover:bg-green-700' },
          ].map(({ label, href, Icon, bg }) => (
            <Link key={href + label} href={href} className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-white text-[13px] font-medium transition-colors', bg)}>
              <Icon className="h-3.5 w-3.5" /> {label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
