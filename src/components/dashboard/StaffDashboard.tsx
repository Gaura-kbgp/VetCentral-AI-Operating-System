import { createSupabaseAdminClient } from '@/lib/supabase/server';
import Link from 'next/link';
import {
  Calendar, GraduationCap, BookOpen, Building2, FolderOpen,
  Users, Sparkles, FileText, ChevronRight,
  Clock, ArrowRight,
} from 'lucide-react';
import { DashboardSearchBar } from './DashboardSearchBar';
import type { AppRole } from '@/types/database';

interface Props {
  userId: string;
  orgId: string;
  firstName: string;
  hospitalId: string | null;
  role: AppRole | null;
}

const QUICK_ACTIONS = [
  { label: 'SOP Library',        href: '/knowledge-base', Icon: BookOpen,     color: '#1e3a5f', bg: '#eef2ff' },
  { label: 'Training Center',    href: '/training',       Icon: GraduationCap, color: '#ea580c', bg: '#fff7ed' },
  { label: 'Master Calendar',    href: '/calendar',       Icon: Calendar,     color: '#16a34a', bg: '#f0fdf4' },
  { label: 'Employee Directory', href: '/hr',             Icon: Users,        color: '#7c3aed', bg: '#f5f3ff' },
  { label: 'Hospital Resources', href: '/hospital-hub',   Icon: Building2,    color: '#1e3a5f', bg: '#eef2ff' },
  { label: 'Projects',           href: '/projects',       Icon: FolderOpen,   color: '#db2777', bg: '#fdf2f8' },
];

const ACTIVITY_ICON: Record<string, React.ElementType> = {
  sop:          BookOpen,
  employee:     Users,
  project:      FolderOpen,
  announcement: FileText,
  training:     GraduationCap,
};

export default async function StaffDashboard({ userId, hospitalId }: Props) {
  const admin = createSupabaseAdminClient();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const in7        = new Date(now.getTime() + 7 * 86_400_000).toISOString();
  const in30       = new Date(now.getTime() + 30 * 86_400_000).toISOString();

  const [
    notifsRes,
    upcomingEventsRes,
    myRequestsRes,
    empCountRes,
    projCountRes,
    enrollmentsRes,
  ] = await Promise.all([
    // Recent activity (notifications)
    admin.from('notifications')
      .select('id, title, body, type, created_at, is_read')
      .order('created_at', { ascending: false })
      .limit(6),

    // Upcoming events (today + next 7 days)
    hospitalId
      ? admin.from('calendar_events')
          .select('id, title, start_time, location, event_type')
          .eq('hospital_id', hospitalId)
          .gte('start_time', todayStart)
          .lte('start_time', in7)
          .eq('is_cancelled', false)
          .order('start_time')
          .limit(4)
      : admin.from('calendar_events')
          .select('id, title, start_time, location, event_type')
          .gte('start_time', todayStart)
          .lte('start_time', in7)
          .eq('is_cancelled', false)
          .order('start_time')
          .limit(4),

    // My open requests
    admin.from('requests')
      .select('id', { count: 'exact', head: true })
      .eq('requested_by', userId)
      .not('status', 'in', '("completed","cancelled")'),

    // Total active employees
    hospitalId
      ? admin.from('user_hospital_roles')
          .select('id', { count: 'exact', head: true })
          .eq('hospital_id', hospitalId)
          .eq('is_active', true)
      : admin.from('profiles')
          .select('id', { count: 'exact', head: true }),

    // Open projects
    admin.from('projects')
      .select('id', { count: 'exact', head: true })
      .not('status', 'in', '("completed","cancelled")'),

    // My enrollments for training completion %
    admin.from('user_course_enrollments')
      .select('progress_pct, completed_at')
      .eq('user_id', userId)
      .limit(20),
  ]);

  const notifications  = notifsRes.data ?? [];
  const upcomingEvents = upcomingEventsRes.data ?? [];
  const outstandingRequests = myRequestsRes.count ?? 0;
  const activeEmployees = empCountRes.count ?? 0;
  const openProjects    = projCountRes.count ?? 0;
  const enrollments     = enrollmentsRes.data ?? [];

  const trainingCompletion = enrollments.length
    ? Math.round(enrollments.reduce((sum, e) => sum + (e.progress_pct ?? 0), 0) / enrollments.length)
    : 0;

  function timeAgo(iso: string) {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60)    return 'just now';
    if (s < 3600)  return `${Math.floor(s / 60)}h ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)} days ago`;
  }

  function fmtEventDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  function fmtEventTime(iso: string) {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  return (
    <div className="space-y-6 pb-8">

      {/* ── Hero: Ask VetCentral Anything ─────────────────────── */}
      <div
        className="-mx-6 -mt-6 px-8 py-14 text-center"
        style={{ background: '#1e3a5f' }}
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
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {QUICK_ACTIONS.map(({ label, href, Icon, color, bg }) => (
            <Link
              key={href + label}
              href={href}
              className="flex flex-col items-center gap-3 p-4 bg-white border border-slate-200/80 rounded-xl hover:shadow-md hover:border-blue-200 transition-all text-center group"
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: bg }}
              >
                <Icon className="h-6 w-6" style={{ color }} />
              </div>
              <span className="text-[12px] font-medium text-gray-700 group-hover:text-gray-900 leading-tight">
                {label}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Overview Stats ────────────────────────────────────── */}
      <div>
        <h2 className="text-[18px] font-bold text-gray-900 mb-4">Overview</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Active Employees',    value: activeEmployees,      valueClass: 'text-gray-900' },
            { label: 'Open Projects',       value: openProjects,         valueClass: 'text-gray-900' },
            { label: 'Upcoming Events',     value: upcomingEvents.length, valueClass: 'text-gray-900' },
            { label: 'Outstanding Requests',value: outstandingRequests,  valueClass: 'text-gray-900' },
            {
              label: 'Training Completion',
              value: `${trainingCompletion}%`,
              valueClass: trainingCompletion >= 70 ? 'text-green-600' : 'text-orange-500',
            },
          ].map(({ label, value, valueClass }) => (
            <div key={label} className="bg-white border border-slate-200/80 rounded-xl px-5 py-5">
              <p className={`text-[28px] font-bold leading-none ${valueClass}`}>{value}</p>
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
            <Link href="/notifications" className="text-[13px] font-medium text-[#1e3a5f] hover:underline">
              View All
            </Link>
          </div>
          {notifications.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              <Clock className="h-10 w-10 mx-auto mb-2 text-gray-200" />
              <p className="text-[14px]">No recent activity</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {notifications.map(n => {
                const Icon = ACTIVITY_ICON[n.type ?? ''] ?? FileText;
                return (
                  <div key={n.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors">
                    <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                      <Icon className="h-4 w-4 text-gray-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-gray-900 truncate">{n.title}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Clock className="h-3 w-3 text-gray-400" />
                        <span className="text-[11px] text-gray-400">{timeAgo(n.created_at)}</span>
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
            <Link href="/calendar" className="text-[13px] font-medium text-[#1e3a5f] hover:underline">
              View Calendar
            </Link>
          </div>
          {upcomingEvents.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              <Calendar className="h-10 w-10 mx-auto mb-2 text-gray-200" />
              <p className="text-[14px]">No upcoming events</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {upcomingEvents.map(ev => (
                <div key={ev.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: '#1e3a5f' }}
                  >
                    <Calendar className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-gray-900 truncate">{ev.title}</p>
                    <p className="text-[12px] text-gray-500 mt-0.5">
                      {fmtEventDate(ev.start_time)}, {fmtEventTime(ev.start_time)}
                    </p>
                    {ev.location && (
                      <p className="text-[11px] text-red-500 mt-0.5 flex items-center gap-1">
                        <span>📍</span> {ev.location}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Training Progress ─────────────────────────────────── */}
      <div className="bg-white border border-slate-200/80 rounded-xl px-6 py-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-[16px] font-bold text-gray-900">Training Progress</h3>
            <p className="text-[28px] font-bold text-gray-900 mt-1">{trainingCompletion}%</p>
            <p className="text-[12px] text-gray-500">Overall Completion</p>
          </div>
          <Link
            href="/training"
            className="px-5 py-2.5 rounded-lg text-[14px] font-semibold text-white transition-colors hover:opacity-90"
            style={{ backgroundColor: '#f97316' }}
          >
            View Training
          </Link>
        </div>
        <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${trainingCompletion}%`,
              backgroundColor: trainingCompletion >= 70 ? '#22c55e' : '#f97316',
            }}
          />
        </div>
      </div>

    </div>
  );
}
