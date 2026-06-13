import { createSupabaseAdminClient } from '@/lib/supabase/server';
import {
  Building2, Users, AlertCircle, UserPlus,
  Clock, CheckCircle2, ArrowRight, FileText, ChevronRight,
  Calendar,
} from 'lucide-react';
import { DashboardSearchBar } from './DashboardSearchBar';
import { QuickActions } from './QuickActions';
import { SPALink } from '@/components/ui/spa-link';

interface Props {
  userId: string;
  orgId: string;
  firstName: string;
  hospitalId: string | null;
  role: 'super_admin' | 'org_admin';
}


const EVENT_TYPE_COLOR: Record<string, string> = {
  meeting:  '#3b82f6',
  training: '#f97316',
  holiday:  '#10b981',
  deadline: '#ef4444',
  staff:    '#8b5cf6',
};

const PRIORITY_CHIP: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700',
  high:   'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low:    'bg-gray-100 text-gray-500',
};

export default async function ExecutiveDashboard({ firstName }: Props) {
  const admin = createSupabaseAdminClient();
  const now        = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const in7        = new Date(now.getTime() + 7 * 86_400_000).toISOString();
  const last30     = new Date(now.getTime() - 30 * 86_400_000).toISOString();

  const [
    hospitalsRes,
    allHospRolesRes,
    projectsRes,
    pendingReqRes,
    topRequestsRes,
    enrollmentsRes,
    eventsRes,
    auditRes,
    totalEmpRes,
    onboardingRes,
  ] = await Promise.all([
    admin.from('hospitals').select('id, name, color, slug').order('name'),
    admin.from('user_hospital_roles').select('hospital_id, user_id').eq('is_active', true),
    admin.from('projects').select('id, hospital_id, status, due_date').not('status', 'in', '("completed","cancelled")'),
    admin.from('requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('requests')
      .select('id, title, request_type, priority, created_at, requested_by')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(5),
    admin.from('user_course_enrollments').select('user_id, completed_at, progress_pct'),
    admin.from('calendar_events')
      .select('id, title, start_time, location, event_type, hospital_id')
      .gte('start_time', todayStart)
      .lte('start_time', in7)
      .eq('is_cancelled', false)
      .order('start_time')
      .limit(4),
    admin.from('audit_logs')
      .select('id, action, resource_type, new_data, user_id, created_at')
      .order('created_at', { ascending: false })
      .limit(6),
    admin.from('profiles').select('id', { count: 'exact', head: true }).eq('is_active', true),
    admin.from('onboarding_records').select('id').eq('status', 'active'),
  ]);

  // ── Computed values ──────────────────────────────────────────
  const totalEmployees = totalEmpRes.count ?? 0;
  const openProjects   = (projectsRes.data ?? []).length;
  const pendingRequests = pendingReqRes.count ?? 0;
  const upcomingEvents = eventsRes.data ?? [];
  const auditLogs      = auditRes.data ?? [];

  const enrollments    = enrollmentsRes.data ?? [];
  const totalEnrolled  = enrollments.length;
  const completed      = enrollments.filter(e => e.completed_at).length;
  const trainingPct    = totalEnrolled > 0 ? Math.round((completed / totalEnrolled) * 100) : 0;
  const avgProgress    = totalEnrolled > 0
    ? Math.round(enrollments.reduce((s, e) => s + (e.progress_pct ?? 0), 0) / totalEnrolled)
    : 0;

  // ── Actor name map ───────────────────────────────────────────
  const actorIds = [...new Set(auditLogs.map(l => l.user_id).filter(Boolean))];
  const requesterIds = [...new Set((topRequestsRes.data ?? []).map(r => r.requested_by).filter(Boolean))];
  const allIds = [...new Set([...actorIds, ...requesterIds])];
  const namesRes = allIds.length
    ? await admin.from('profiles').select('id, first_name, last_name').in('id', allIds)
    : { data: [] };
  const nameMap = Object.fromEntries(
    (namesRes.data ?? []).map(p => [p.id, `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()])
  );

  const hospitalMap = Object.fromEntries((hospitalsRes.data ?? []).map(h => [h.id, h]));

  // ── Helpers ──────────────────────────────────────────────────
  function timeAgo(iso: string) {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60)    return 'just now';
    if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }
  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  function fmtTime(iso: string) {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  return (
    <div className="space-y-6 pb-8">

      {/* ── Hero: Ask VetCentral Anything ─────────────────────── */}
      <div
        className="-mx-6 -mt-6 px-8 py-14 text-center"
        style={{ backgroundColor: '#1e3a5f' }}
      >
        <h1 className="text-[36px] font-bold text-white leading-tight mb-2">
          Ask VetCentral Anything
        </h1>
        <p className="text-white/70 text-[15px] mb-7">
          Search across all hospital knowledge, SOPs, training materials, and more
        </p>

        <DashboardSearchBar />
      </div>

      {/* ── Quick Actions ─────────────────────────────────────── */}
      <div>
        <h2 className="text-[18px] font-bold text-gray-900 mb-4">Quick Actions</h2>
        <QuickActions />
      </div>

      {/* ── Overview Stats ────────────────────────────────────── */}
      <div>
        <h2 className="text-[18px] font-bold text-gray-900 mb-4">Overview</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Active Employees',    value: totalEmployees,  cls: 'text-gray-900' },
            { label: 'Open Projects',       value: openProjects,    cls: 'text-gray-900' },
            { label: 'Upcoming Events',     value: upcomingEvents.length, cls: 'text-gray-900' },
            { label: 'Outstanding Requests',value: pendingRequests, cls: pendingRequests > 0 ? 'text-orange-500' : 'text-gray-900' },
            { label: 'Training Completion', value: `${trainingPct}%`, cls: trainingPct >= 70 ? 'text-green-600' : 'text-orange-500' },
          ].map(({ label, value, cls }) => (
            <div key={label} className="bg-white border border-slate-200/80 rounded-xl px-5 py-5">
              <p className={`text-[28px] font-bold leading-none ${cls}`}>{value}</p>
              <p className="text-[12px] text-gray-500 mt-2 leading-tight">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Recent Activity + Upcoming Events ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Recent Activity */}
        <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h3 className="text-[16px] font-bold text-gray-900">Recent Activity</h3>
            <SPALink section="admin-audit-logs" className="text-[13px] font-medium text-[#1e3a5f] hover:underline">
              View All
            </SPALink>
          </div>
          {auditLogs.length === 0 ? (
            <div className="py-12 text-center">
              <Clock className="h-10 w-10 mx-auto mb-2 text-gray-200" />
              <p className="text-[14px] text-gray-400">No recent activity</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {auditLogs.map(entry => {
                const data = (entry.new_data ?? {}) as Record<string, unknown>;
                const name = (data.name ?? data.title ?? data.first_name) as string | null;
                const action = `${entry.action} ${(entry.resource_type ?? '').replace(/_/g, ' ')}`;
                return (
                  <div key={entry.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors">
                    <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                      <FileText className="h-4 w-4 text-gray-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-gray-900 truncate capitalize">
                        {name ? `${name} · ${action}` : action}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Clock className="h-3 w-3 text-gray-400" />
                        <span className="text-[11px] text-gray-400">
                          {nameMap[entry.user_id] || 'System'} · {timeAgo(entry.created_at)}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Upcoming Events */}
        <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h3 className="text-[16px] font-bold text-gray-900">Upcoming Events</h3>
            <SPALink section="calendar" className="text-[13px] font-medium text-[#1e3a5f] hover:underline">
              View Calendar
            </SPALink>
          </div>
          {upcomingEvents.length === 0 ? (
            <div className="py-12 text-center">
              <Calendar className="h-10 w-10 mx-auto mb-2 text-gray-200" />
              <p className="text-[14px] text-gray-400">No upcoming events</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {upcomingEvents.map(ev => {
                const hosp = ev.hospital_id ? hospitalMap[ev.hospital_id] : null;
                return (
                  <div key={ev.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: EVENT_TYPE_COLOR[ev.event_type ?? ''] ?? '#1e3a5f' }}
                    >
                      <Calendar className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-gray-900 truncate">{ev.title}</p>
                      <p className="text-[12px] text-gray-500 mt-0.5">
                        {fmtDate(ev.start_time)}, {fmtTime(ev.start_time)}
                      </p>
                      {(ev.location || hosp) && (
                        <p className="text-[11px] text-red-500 mt-0.5">
                          📍 {ev.location ?? hosp?.name}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Hospital Health Cards ─────────────────────────────── */}
      {(hospitalsRes.data ?? []).length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[18px] font-bold text-gray-900">Hospitals</h2>
            <SPALink section="hospital-hub" className="text-[13px] font-medium text-[#1e3a5f] flex items-center gap-1 hover:underline">
              Hospital Hub <ArrowRight className="h-3.5 w-3.5" />
            </SPALink>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(hospitalsRes.data ?? []).map(h => {
              const staffCount = new Set(
                (allHospRolesRes.data ?? []).filter(r => r.hospital_id === h.id).map(r => r.user_id)
              ).size;
              const hospProjects = (projectsRes.data ?? []).filter(p => p.hospital_id === h.id).length;
              return (
                <SPALink
                  key={h.id}
                  section="hospital-hub"
                  subId={h.id}
                  className="bg-white border border-slate-200/80 rounded-xl p-5 hover:shadow-md hover:border-blue-200 transition-all group text-left w-full block"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${h.color ?? '#1e3a5f'}20` }}
                    >
                      <Building2 className="h-5 w-5" style={{ color: h.color ?? '#1e3a5f' }} />
                    </div>
                    <div>
                      <p className="text-[14px] font-semibold text-gray-900 group-hover:text-[#1e3a5f] transition-colors leading-tight">
                        {h.name}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="bg-slate-50 rounded-lg py-2.5">
                      <p className="text-[20px] font-bold text-gray-900">{staffCount}</p>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wide">Staff</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg py-2.5">
                      <p className="text-[20px] font-bold text-gray-900">{hospProjects}</p>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wide">Projects</p>
                    </div>
                  </div>
                </SPALink>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Pending Requests ──────────────────────────────────── */}
      {(topRequestsRes.data ?? []).length > 0 && (
        <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h3 className="text-[16px] font-bold text-gray-900">Pending Requests</h3>
            <span className="text-[12px] font-semibold bg-orange-50 text-orange-600 border border-orange-100 px-2.5 py-1 rounded-full">
              {pendingRequests} pending
            </span>
          </div>
          <div className="divide-y divide-gray-50">
            {(topRequestsRes.data ?? []).map(req => (
              <div key={req.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors">
                <span className={`shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${PRIORITY_CHIP[req.priority] ?? PRIORITY_CHIP.low}`}>
                  {req.priority}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-gray-900 truncate">{req.title}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {nameMap[req.requested_by] || 'Unknown'} · {req.request_type.replace(/_/g, ' ')} · {timeAgo(req.created_at)}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
              </div>
            ))}
          </div>
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50">
            <SPALink section="approvals" className="text-[13px] text-[#1e3a5f] font-medium flex items-center gap-1 hover:underline">
              Manage all requests <ArrowRight className="h-3.5 w-3.5" />
            </SPALink>
          </div>
        </div>
      )}

      {/* ── Training Progress ─────────────────────────────────── */}
      <div className="bg-white border border-slate-200/80 rounded-xl px-6 py-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-[16px] font-bold text-gray-900">Training Progress</h3>
            <p className="text-[28px] font-bold text-gray-900 mt-1">{trainingPct}%</p>
            <p className="text-[12px] text-gray-500">Overall Completion</p>
          </div>
          <SPALink
            section="training"
            className="px-5 py-2.5 rounded-lg text-[14px] font-semibold text-white transition-colors hover:opacity-90"
            style={{ backgroundColor: '#f97316' }}
          >
            View Training
          </SPALink>
        </div>
        <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden mb-4">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${trainingPct}%`,
              backgroundColor: trainingPct >= 70 ? '#22c55e' : '#f97316',
            }}
          />
        </div>
        {totalEnrolled > 0 && (
          <div className="grid grid-cols-3 gap-3 pt-1">
            {[
              { label: 'Enrolled',   value: totalEnrolled, cls: 'text-blue-600' },
              { label: 'Completed',  value: completed,     cls: 'text-green-600' },
              { label: 'Avg Progress', value: `${avgProgress}%`, cls: avgProgress >= 70 ? 'text-green-600' : 'text-orange-500' },
            ].map(s => (
              <div key={s.label} className="text-center p-3 rounded-lg bg-slate-50">
                <p className={`text-[18px] font-bold ${s.cls}`}>{s.value}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
