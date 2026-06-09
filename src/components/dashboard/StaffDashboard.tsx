import { createSupabaseAdminClient } from '@/lib/supabase/server';
import Link from 'next/link';
import {
  Calendar, CheckSquare, GraduationCap, Award, BookOpen,
  Clock, AlertCircle, Bell, MessageSquare, Search,
  ChevronRight, ArrowRight, Play, FileText, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AppRole } from '@/types/database';

interface Props {
  userId: string;
  orgId: string;
  firstName: string;
  hospitalId: string | null;
  role: AppRole | null;
}

// Role-specific persona config
const ROLE_CONFIG: Record<string, { color: string; gradient: string; label: string; focus: string }> = {
  doctor:    { color: '#0d9488', gradient: 'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)', label: 'Veterinarian', focus: 'Clinical Operations' },
  va:        { color: '#0891b2', gradient: 'linear-gradient(135deg, #0e7490 0%, #0891b2 100%)', label: 'Vet Assistant',  focus: 'Daily Support' },
  csr:       { color: '#16a34a', gradient: 'linear-gradient(135deg, #15803d 0%, #16a34a 100%)', label: 'CSR',           focus: 'Front Desk Operations' },
  marketing: { color: '#ea580c', gradient: 'linear-gradient(135deg, #c2410c 0%, #ea580c 100%)', label: 'Marketing',     focus: 'Communications & Content' },
  viewer:    { color: '#64748b', gradient: 'linear-gradient(135deg, #475569 0%, #64748b 100%)', label: 'Viewer',        focus: 'Read-Only Access' },
};

const TASK_PRIORITY: Record<string, string> = {
  urgent: 'border-l-red-500', high: 'border-l-orange-500',
  medium: 'border-l-yellow-400', low: 'border-l-gray-300',
};

const ROLE_QUICK_ACTIONS: Record<string, Array<{ label: string; href: string; Icon: React.ElementType }>> = {
  doctor: [
    { label: 'Search SOP',       href: '/knowledge-base', Icon: Search },
    { label: 'View Protocols',   href: '/knowledge-base', Icon: BookOpen },
    { label: 'AI Assistant',     href: '/ai-assistant',   Icon: Sparkles },
    { label: 'My Calendar',      href: '/calendar',       Icon: Calendar },
    { label: 'Request Equipment',href: '/workflows',      Icon: FileText },
    { label: 'Training',         href: '/training',       Icon: GraduationCap },
  ],
  va: [
    { label: 'My Tasks',         href: '/tasks',          Icon: CheckSquare },
    { label: 'Calendar',         href: '/calendar',       Icon: Calendar },
    { label: 'Training',         href: '/training',       Icon: GraduationCap },
    { label: 'Knowledge Base',   href: '/knowledge-base', Icon: BookOpen },
    { label: 'AI Assistant',     href: '/ai-assistant',   Icon: Sparkles },
    { label: 'Submit Request',   href: '/workflows',      Icon: FileText },
  ],
  csr: [
    { label: 'Daily Schedule',   href: '/calendar',       Icon: Calendar },
    { label: 'SOPs',             href: '/knowledge-base', Icon: BookOpen },
    { label: 'My Tasks',         href: '/tasks',          Icon: CheckSquare },
    { label: 'Training',         href: '/training',       Icon: GraduationCap },
    { label: 'Messages',         href: '/communication',  Icon: MessageSquare },
    { label: 'Submit Request',   href: '/workflows',      Icon: FileText },
  ],
  marketing: [
    { label: 'My Projects',      href: '/projects',       Icon: BookOpen },
    { label: 'Knowledge Base',   href: '/knowledge-base', Icon: BookOpen },
    { label: 'AI Assistant',     href: '/ai-assistant',   Icon: Sparkles },
    { label: 'Calendar',         href: '/calendar',       Icon: Calendar },
    { label: 'Messages',         href: '/communication',  Icon: MessageSquare },
    { label: 'Training',         href: '/training',       Icon: GraduationCap },
  ],
};
const DEFAULT_QUICK_ACTIONS = [
  { label: 'Knowledge Base', href: '/knowledge-base', Icon: BookOpen },
  { label: 'Training',       href: '/training',       Icon: GraduationCap },
  { label: 'Calendar',       href: '/calendar',       Icon: Calendar },
  { label: 'AI Assistant',   href: '/ai-assistant',   Icon: Sparkles },
];

export default async function StaffDashboard({ userId, hospitalId, firstName, role }: Props) {
  const admin = createSupabaseAdminClient();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const todayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
  const in7        = new Date(now.getTime() + 7 * 86_400_000).toISOString();
  const in30       = new Date(now.getTime() + 30 * 86_400_000).toISOString();

  const [
    todayEventsRes, myTasksRes, myTrainingRes, myNotifsRes,
    myCertsRes, myRequestsRes,
  ] = await Promise.all([
    // Today's events for this hospital (or org-wide)
    hospitalId
      ? admin.from('calendar_events')
          .select('id, title, start_time, end_time, event_type, location, meeting_link')
          .eq('hospital_id', hospitalId).gte('start_time', todayStart).lte('start_time', todayEnd)
          .eq('is_cancelled', false).order('start_time').limit(8)
      : admin.from('calendar_events')
          .select('id, title, start_time, end_time, event_type, location, meeting_link')
          .gte('start_time', todayStart).lte('start_time', todayEnd)
          .eq('is_cancelled', false).order('start_time').limit(8),

    // My open tasks
    admin.from('project_tasks')
      .select('id, title, priority, status, due_date, project_id')
      .eq('assigned_to', userId)
      .not('status', 'in', '("done","cancelled")')
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(6),

    // My training due or overdue
    admin.from('course_enrollments')
      .select('id, course_id, progress_pct, due_date, completed_at')
      .eq('user_id', userId)
      .is('completed_at', null)
      .not('due_date', 'is', null)
      .order('due_date', { ascending: true })
      .limit(5),

    // Recent unread notifications
    admin.from('notifications')
      .select('id, title, body, type, created_at, is_read')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5),

    // My certifications
    admin.from('lms_certificates')
      .select('id, course_id, issued_at, expires_at')
      .eq('user_id', userId)
      .eq('is_revoked', false)
      .order('issued_at', { ascending: false })
      .limit(4),

    // My open requests
    admin.from('requests')
      .select('id, title, request_type, status, priority, created_at')
      .eq('requested_by', userId)
      .not('status', 'in', '("completed","cancelled")')
      .order('created_at', { ascending: false })
      .limit(4),
  ]);

  const todayEvents = todayEventsRes.data ?? [];
  const myTasks     = myTasksRes.data ?? [];
  const myTraining  = myTrainingRes.data ?? [];
  const myNotifs    = myNotifsRes.data ?? [];
  const myCerts     = myCertsRes.data ?? [];
  const myRequests  = myRequestsRes.data ?? [];

  // Fetch course titles
  const courseIds = [...new Set([...myTraining.map(e => e.course_id), ...myCerts.map(c => c.course_id)])];
  const coursesRes = courseIds.length
    ? await admin.from('lms_courses').select('id, title').in('id', courseIds)
    : { data: [] };
  const courseMap = Object.fromEntries((coursesRes.data ?? []).map(c => [c.id, c.title]));

  // Stats
  const overdueTasks     = myTasks.filter(t => t.due_date && new Date(t.due_date) < now).length;
  const overdueTraining  = myTraining.filter(e => e.due_date && new Date(e.due_date) < now).length;
  const expiringCerts    = myCerts.filter(c => c.expires_at && new Date(c.expires_at) < new Date(in30)).length;
  const unreadNotifs     = myNotifs.filter(n => !n.is_read).length;

  const persona = ROLE_CONFIG[role ?? 'viewer'] ?? ROLE_CONFIG.viewer;
  const quickActions = ROLE_QUICK_ACTIONS[role ?? 'viewer'] ?? DEFAULT_QUICK_ACTIONS;

  function timeAgo(iso: string) {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }
  function fmtTime(iso: string) {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  function fmtDate(iso: string | null) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  function daysUntil(iso: string) {
    return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  }

  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const todayStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="space-y-6 pb-8">

      {/* ── Personal Header ─────────────────────────────────── */}
      <div className="rounded-2xl p-6 text-white" style={{ background: persona.gradient }}>
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <p className="text-white/70 text-[13px] font-medium mb-1">{greeting} · {todayStr}</p>
            <h1 className="text-2xl font-bold">{firstName}</h1>
            <p className="text-white/70 text-[13px] mt-1">{persona.label} · {persona.focus}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/ai-assistant" className="flex items-center gap-2 px-3.5 py-2 bg-white/15 hover:bg-white/25 border border-white/20 rounded-lg text-[13px] font-medium text-white transition-colors">
              <Sparkles className="h-3.5 w-3.5" /> AI Assistant
            </Link>
            <Link href="/knowledge-base" className="flex items-center gap-2 px-3.5 py-2 bg-white/15 hover:bg-white/25 border border-white/20 rounded-lg text-[13px] font-medium text-white transition-colors">
              <Search className="h-3.5 w-3.5" /> Search SOPs
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          {[
            { label: "Today's Events",   value: todayEvents.length },
            { label: 'Open Tasks',       value: myTasks.length, warn: overdueTasks > 0 },
            { label: 'Training Due',     value: myTraining.length, warn: overdueTraining > 0 },
            { label: 'Notifications',    value: unreadNotifs, warn: unreadNotifs > 0 },
          ].map(({ label, value, warn }) => (
            <div key={label} className="bg-white/15 border border-white/15 rounded-xl p-3.5">
              <p className={cn('text-2xl font-bold leading-none', warn ? 'text-amber-300' : 'text-white')}>{value}</p>
              <p className="text-[11px] text-white/70 mt-1">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Urgent alerts ───────────────────────────────────── */}
      {(overdueTasks > 0 || overdueTraining > 0 || expiringCerts > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {overdueTasks > 0 && (
            <Link href="/tasks" className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 hover:bg-red-100 transition-colors">
              <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
              <div>
                <p className="text-[13px] font-semibold text-red-800">{overdueTasks} Overdue Task{overdueTasks > 1 ? 's' : ''}</p>
                <p className="text-[11px] text-red-600">Action required</p>
              </div>
            </Link>
          )}
          {overdueTraining > 0 && (
            <Link href="/training" className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 hover:bg-orange-100 transition-colors">
              <GraduationCap className="h-5 w-5 text-orange-500 shrink-0" />
              <div>
                <p className="text-[13px] font-semibold text-orange-800">{overdueTraining} Overdue Training</p>
                <p className="text-[11px] text-orange-600">Complete now</p>
              </div>
            </Link>
          )}
          {expiringCerts > 0 && (
            <Link href="/training" className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 hover:bg-amber-100 transition-colors">
              <Award className="h-5 w-5 text-amber-500 shrink-0" />
              <div>
                <p className="text-[13px] font-semibold text-amber-800">{expiringCerts} Cert{expiringCerts > 1 ? 's' : ''} Expiring</p>
                <p className="text-[11px] text-amber-600">Renew soon</p>
              </div>
            </Link>
          )}
        </div>
      )}

      {/* ── Today's Schedule + My Tasks ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Today's Schedule */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" style={{ color: persona.color }} />
              <h3 className="text-[14px] font-semibold text-gray-900">Today's Schedule</h3>
            </div>
            <Link href="/calendar" className="text-[12px] text-blue-600 font-medium">Full Calendar</Link>
          </div>
          {todayEvents.length === 0 ? (
            <div className="py-10 text-center">
              <Calendar className="h-10 w-10 text-gray-200 mx-auto mb-2" />
              <p className="text-[14px] font-medium text-gray-400">No events today</p>
              <p className="text-[12px] text-gray-300 mt-1">Your schedule is clear</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {todayEvents.map(ev => (
                <div key={ev.id} className="px-5 py-3.5 flex items-center gap-3 hover:bg-gray-50">
                  <div className="text-center shrink-0 w-14">
                    <p className="text-[13px] font-bold text-gray-900">{fmtTime(ev.start_time)}</p>
                    {ev.end_time && <p className="text-[10px] text-gray-400">{fmtTime(ev.end_time)}</p>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-900 truncate">{ev.title}</p>
                    {ev.location && <p className="text-[11px] text-gray-400 truncate">{ev.location}</p>}
                  </div>
                  {ev.meeting_link && (
                    <a href={ev.meeting_link} target="_blank" rel="noopener noreferrer"
                      className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-white transition-colors"
                      style={{ backgroundColor: persona.color }}>
                      <Play className="h-3 w-3" /> Join
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* My Tasks */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <CheckSquare className="h-4 w-4 text-gray-500" />
              <h3 className="text-[14px] font-semibold text-gray-900">My Tasks</h3>
            </div>
            <Link href="/tasks" className="text-[12px] text-blue-600 font-medium">All Tasks</Link>
          </div>
          {myTasks.length === 0 ? (
            <div className="py-10 text-center">
              <CheckSquare className="h-10 w-10 text-gray-200 mx-auto mb-2" />
              <p className="text-[14px] font-medium text-gray-400">No open tasks</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {myTasks.map(task => {
                const isOverdue = task.due_date && new Date(task.due_date) < now;
                return (
                  <div key={task.id} className={cn('px-5 py-3.5 flex items-center gap-3 hover:bg-gray-50 border-l-2', TASK_PRIORITY[task.priority] ?? 'border-l-gray-200')}>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-gray-900 truncate">{task.title}</p>
                      <p className={cn('text-[11px] mt-0.5', isOverdue ? 'text-red-500 font-medium' : 'text-gray-400')}>
                        {task.due_date ? (isOverdue ? `Overdue · Due ${fmtDate(task.due_date)}` : `Due ${fmtDate(task.due_date)}`) : 'No due date'}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Training + Notifications ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Training Due */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-orange-500" />
              <h3 className="text-[14px] font-semibold text-gray-900">Training Due</h3>
            </div>
            <Link href="/training" className="text-[12px] text-blue-600 font-medium">My Training</Link>
          </div>
          {myTraining.length === 0 ? (
            <div className="py-10 text-center">
              <GraduationCap className="h-10 w-10 text-gray-200 mx-auto mb-2" />
              <p className="text-[14px] font-medium text-gray-400">All caught up!</p>
              <p className="text-[12px] text-gray-300 mt-1">No pending training due</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {myTraining.map(enroll => {
                const isOverdue = enroll.due_date && new Date(enroll.due_date) < now;
                const days = enroll.due_date ? daysUntil(enroll.due_date) : null;
                return (
                  <Link key={enroll.id} href="/training" className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-gray-900 truncate">{courseMap[enroll.course_id] ?? 'Course'}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-orange-400 rounded-full" style={{ width: `${enroll.progress_pct}%` }} />
                        </div>
                        <span className="text-[10px] text-gray-400 shrink-0">{enroll.progress_pct}%</span>
                      </div>
                    </div>
                    <span className={cn('shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full',
                      isOverdue ? 'bg-red-100 text-red-700' : days !== null && days <= 7 ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600'
                    )}>
                      {isOverdue ? 'Overdue' : days !== null ? `${days}d` : '—'}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Notifications */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-blue-500" />
              <h3 className="text-[14px] font-semibold text-gray-900">Notifications</h3>
            </div>
            <Link href="/notifications" className="text-[12px] text-blue-600 font-medium">View all</Link>
          </div>
          {myNotifs.length === 0 ? (
            <div className="py-10 text-center">
              <Bell className="h-10 w-10 text-gray-200 mx-auto mb-2" />
              <p className="text-[14px] font-medium text-gray-400">No notifications</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {myNotifs.map(notif => (
                <div key={notif.id} className={cn('flex items-start gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors', !notif.is_read && 'bg-blue-50/30')}>
                  <div className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', notif.is_read ? 'bg-gray-200' : 'bg-blue-500')} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-900 truncate">{notif.title}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-1">{notif.body}</p>
                    <p className="text-[10px] text-gray-300 mt-0.5">{timeAgo(notif.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── My Certifications ────────────────────────────────── */}
      {myCerts.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-amber-500" />
              <h3 className="text-[14px] font-semibold text-gray-900">My Certifications</h3>
            </div>
            <Link href="/training" className="text-[12px] text-blue-600 font-medium flex items-center gap-1">
              Training <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
            {myCerts.map(cert => {
              const days = cert.expires_at ? daysUntil(cert.expires_at) : null;
              return (
                <div key={cert.id} className="px-5 py-4">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center mb-2">
                    <Award className="h-4 w-4 text-amber-500" />
                  </div>
                  <p className="text-[12px] font-semibold text-gray-800 leading-tight line-clamp-2">{courseMap[cert.course_id] ?? 'Certificate'}</p>
                  <p className="text-[11px] text-gray-400 mt-1">Issued {fmtDate(cert.issued_at)}</p>
                  {cert.expires_at && days !== null && (
                    <span className={cn('inline-block mt-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded',
                      days <= 30 ? 'bg-amber-100 text-amber-700' : 'bg-green-50 text-green-700'
                    )}>
                      {days <= 0 ? 'Expired' : `Expires in ${days}d`}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Quick Actions ────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Quick Access</p>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {quickActions.map(({ label, href, Icon }) => (
            <Link key={href + label} href={href}
              className="flex flex-col items-center gap-2 p-3 bg-white border border-gray-200 rounded-xl hover:shadow-md hover:border-gray-300 transition-all text-center group">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${persona.color}15` }}>
                <Icon className="h-5 w-5" style={{ color: persona.color }} />
              </div>
              <span className="text-[11px] font-medium text-gray-600 group-hover:text-gray-900 leading-tight">{label}</span>
            </Link>
          ))}
        </div>
      </div>

    </div>
  );
}
