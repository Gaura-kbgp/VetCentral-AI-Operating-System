import { createSupabaseAdminClient } from '@/lib/supabase/server';
import Link from 'next/link';
import {
  Shield, Users, Activity, AlertTriangle, CheckCircle2,
  Database, Globe, Lock, Settings, Key, Terminal,
  ChevronRight, RefreshCw, Eye, Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  userId: string;
  orgId: string;
  firstName: string;
  hospitalId: string | null;
}

const AUDIT_ACTION_ICONS: Record<string, React.ElementType> = {
  INSERT: CheckCircle2, UPDATE: RefreshCw, DELETE: AlertTriangle,
  SELECT: Eye, LOGIN: Key, LOGOUT: Key,
};
const AUDIT_ACTION_COLORS: Record<string, string> = {
  INSERT: 'text-green-600', UPDATE: 'text-blue-600', DELETE: 'text-red-600',
  SELECT: 'text-gray-500', LOGIN: 'text-indigo-600', LOGOUT: 'text-gray-400',
};

export default async function ITDashboard({ orgId, hospitalId, firstName }: Props) {
  const admin = createSupabaseAdminClient();
  const now = new Date();
  const ago24h = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const ago7d  = new Date(now.getTime() - 7 * 86_400_000).toISOString();

  const [
    auditLogsRes, totalUsersRes, activeUsersRes,
    hospitalsRes, recentLoginsRes, errorLogsRes,
  ] = await Promise.all([
    // Recent audit logs (security events)
    admin.from('audit_logs')
      .select('id, action, table_name, user_id, created_at, old_data, new_data')
      .gte('created_at', ago24h)
      .order('created_at', { ascending: false })
      .limit(20),

    // Total org users
    admin.from('org_user_roles')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId),

    // Active users (any audit action in last 7d)
    admin.from('audit_logs')
      .select('user_id', { count: 'exact', head: false })
      .gte('created_at', ago7d),

    // Hospitals info
    admin.from('hospitals')
      .select('id, name, is_active, created_at')
      .eq('org_id', orgId),

    // Recent login events from audit
    admin.from('audit_logs')
      .select('id, action, user_id, created_at, table_name')
      .eq('action', 'LOGIN')
      .gte('created_at', ago7d)
      .order('created_at', { ascending: false })
      .limit(8),

    // Error / delete / sensitive actions
    admin.from('audit_logs')
      .select('id, action, table_name, user_id, created_at')
      .in('action', ['DELETE', 'ADMIN_ACTION'])
      .gte('created_at', ago7d)
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const auditLogs    = auditLogsRes.data ?? [];
  const totalUsers   = totalUsersRes.count ?? 0;
  const rawActive    = activeUsersRes.data ?? [];
  const hospitals    = hospitalsRes.data ?? [];
  const recentLogins = recentLoginsRes.data ?? [];
  const errorLogs    = errorLogsRes.data ?? [];

  const activeUsers = new Set(rawActive.map((r: { user_id: string }) => r.user_id)).size;
  const activeHospitals = hospitals.filter(h => h.is_active).length;

  // Fetch user profiles for audit log entries
  const auditUserIds = [...new Set([...auditLogs, ...errorLogs].map(l => l.user_id).filter(Boolean))];
  const profilesRes = auditUserIds.length
    ? await admin.from('profiles').select('id, first_name, last_name, email').in('id', auditUserIds)
    : { data: [] };
  const profileMap = Object.fromEntries((profilesRes.data ?? []).map(p => [p.id, p]));

  // Action counts
  const actionCounts = auditLogs.reduce((acc, l) => { acc[l.action] = (acc[l.action] ?? 0) + 1; return acc; }, {} as Record<string, number>);

  function timeAgo(iso: string) {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }
  function userName(uid: string | null) {
    if (!uid) return 'System';
    const p = profileMap[uid];
    if (!p) return 'Unknown';
    return `${p.first_name} ${p.last_name}`.trim() || p.email || 'Unknown';
  }

  const securityEvents = errorLogs.length;
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-6 pb-8">

      {/* ── IT Control Header ────────────────────────────────── */}
      <div className="rounded-2xl p-6 text-white" style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)' }}>
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <p className="text-indigo-300 text-[13px] font-medium mb-1">{greeting} · IT Control Center</p>
            <h1 className="text-2xl font-bold">{firstName}</h1>
            <p className="text-indigo-300 text-[13px] mt-1">IT Administrator · System Operations</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/audit" className="flex items-center gap-2 px-3.5 py-2 bg-white/15 hover:bg-white/25 border border-white/20 rounded-lg text-[13px] font-medium text-white transition-colors">
              <Shield className="h-3.5 w-3.5" /> Audit Logs
            </Link>
            <Link href="/admin/users" className="flex items-center gap-2 px-3.5 py-2 bg-white/15 hover:bg-white/25 border border-white/20 rounded-lg text-[13px] font-medium text-white transition-colors">
              <Users className="h-3.5 w-3.5" /> User Management
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          {[
            { label: 'Total Users',     value: totalUsers,      Icon: Users,    note: 'Organization-wide' },
            { label: 'Active (7d)',     value: activeUsers,     Icon: Activity, note: 'Unique users' },
            { label: 'Hospitals',       value: activeHospitals, Icon: Globe,    note: `${hospitals.length} total` },
            { label: 'Security Events', value: securityEvents,  Icon: AlertTriangle, warn: securityEvents > 0, note: 'Last 7 days' },
          ].map(({ label, value, Icon, warn, note }) => (
            <div key={label} className={cn('border rounded-xl p-3.5', warn && value > 0 ? 'bg-red-500/20 border-red-400/30' : 'bg-white/10 border-white/15')}>
              <div className="flex items-start justify-between">
                <div>
                  <p className={cn('text-2xl font-bold leading-none', warn && value > 0 ? 'text-red-200' : 'text-white')}>{value}</p>
                  <p className="text-[11px] text-indigo-200 mt-1">{label}</p>
                  <p className="text-[10px] text-indigo-300/60 mt-0.5">{note}</p>
                </div>
                <Icon className={cn('h-4 w-4 opacity-50', warn && value > 0 ? 'text-red-200' : 'text-white')} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Security Event Alert ─────────────────────────────── */}
      {securityEvents > 0 && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-5 py-4">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-[14px] font-semibold text-red-800">{securityEvents} Sensitive Action{securityEvents > 1 ? 's' : ''} in Last 7 Days</p>
            <p className="text-[12px] text-red-600 mt-0.5">DELETE and admin actions detected — review audit log for details.</p>
          </div>
          <Link href="/admin/audit" className="shrink-0 text-[12px] font-semibold text-red-600 border border-red-300 rounded-lg px-3 py-1.5 hover:bg-red-100 transition-colors">
            Review
          </Link>
        </div>
      )}

      {/* ── 24h Activity Summary + Hospitals ────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* 24h Action Summary */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-indigo-600" />
              <h3 className="text-[14px] font-semibold text-gray-900">24h Activity Summary</h3>
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">{auditLogs.length} total events</p>
          </div>
          {Object.keys(actionCounts).length === 0 ? (
            <div className="py-8 text-center">
              <Activity className="h-8 w-8 text-gray-200 mx-auto mb-2" />
              <p className="text-[13px] text-gray-400">No activity in last 24h</p>
            </div>
          ) : (
            <div className="p-5 space-y-3">
              {Object.entries(actionCounts).sort((a, b) => b[1] - a[1]).map(([action, count]) => {
                const Icon = AUDIT_ACTION_ICONS[action] ?? Terminal;
                const pct = Math.round((count / auditLogs.length) * 100);
                return (
                  <div key={action}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Icon className={cn('h-3.5 w-3.5', AUDIT_ACTION_COLORS[action] ?? 'text-gray-500')} />
                        <span className="text-[12px] font-medium text-gray-700">{action}</span>
                      </div>
                      <span className="text-[12px] text-gray-500">{count}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Hospital Status */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-blue-500" />
              <h3 className="text-[14px] font-semibold text-gray-900">Hospital Status</h3>
            </div>
            <Link href="/admin/hospitals" className="text-[12px] text-blue-600 font-medium">Manage</Link>
          </div>
          {hospitals.length === 0 ? (
            <div className="py-8 text-center">
              <Globe className="h-8 w-8 text-gray-200 mx-auto mb-2" />
              <p className="text-[13px] text-gray-400">No hospitals found</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {hospitals.map(h => (
                <div key={h.id} className="flex items-center gap-3 px-5 py-3.5">
                  <div className={cn('w-2 h-2 rounded-full shrink-0', h.is_active ? 'bg-green-500' : 'bg-gray-300')} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-900 truncate">{h.name}</p>
                    <p className="text-[11px] text-gray-400">
                      {h.is_active ? 'Active' : 'Inactive'} · Added {new Date(h.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', h.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500')}>
                    {h.is_active ? 'Online' : 'Offline'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Security Events */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-red-500" />
              <h3 className="text-[14px] font-semibold text-gray-900">Sensitive Actions (7d)</h3>
            </div>
            <Link href="/admin/audit" className="text-[12px] text-blue-600 font-medium">Full Log</Link>
          </div>
          {errorLogs.length === 0 ? (
            <div className="py-8 text-center">
              <CheckCircle2 className="h-8 w-8 text-green-200 mx-auto mb-2" />
              <p className="text-[13px] font-medium text-green-600">All clear</p>
              <p className="text-[11px] text-gray-400 mt-0.5">No sensitive events</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {errorLogs.map(log => (
                <div key={log.id} className="flex items-start gap-3 px-5 py-3.5 hover:bg-gray-50">
                  <div className={cn('w-1.5 h-1.5 rounded-full mt-2 shrink-0',
                    log.action === 'DELETE' ? 'bg-red-500' : 'bg-orange-400')}>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-gray-900">{log.action} · {log.table_name}</p>
                    <p className="text-[11px] text-gray-500 truncate">{userName(log.user_id)}</p>
                    <p className="text-[10px] text-gray-300">{timeAgo(log.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Live Audit Feed ──────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-gray-500" />
            <h3 className="text-[14px] font-semibold text-gray-900">Recent Audit Events (24h)</h3>
          </div>
          <Link href="/admin/audit" className="text-[12px] text-blue-600 font-medium flex items-center gap-1">
            Full Audit Log <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {auditLogs.length === 0 ? (
          <div className="py-10 text-center">
            <Shield className="h-10 w-10 text-gray-200 mx-auto mb-2" />
            <p className="text-[14px] text-gray-400">No activity in last 24 hours</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Action', 'Table', 'User', 'Time'].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {auditLogs.slice(0, 15).map(log => {
                  const Icon = AUDIT_ACTION_ICONS[log.action] ?? Terminal;
                  return (
                    <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <Icon className={cn('h-3.5 w-3.5 shrink-0', AUDIT_ACTION_COLORS[log.action] ?? 'text-gray-500')} />
                          <span className={cn('font-semibold', AUDIT_ACTION_COLORS[log.action] ?? 'text-gray-700')}>{log.action}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-gray-700 font-mono">{log.table_name}</td>
                      <td className="px-5 py-3 text-gray-600 max-w-[160px] truncate">{userName(log.user_id)}</td>
                      <td className="px-5 py-3 text-gray-400 whitespace-nowrap">{timeAgo(log.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Quick Actions ────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">IT Controls</p>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {[
            { label: 'User Management', href: '/admin/users',        Icon: Users },
            { label: 'Audit Logs',      href: '/admin/audit',        Icon: Shield },
            { label: 'Roles',           href: '/admin/roles',        Icon: Lock },
            { label: 'Hospitals',       href: '/admin/hospitals',    Icon: Globe },
            { label: 'Departments',     href: '/admin/departments',  Icon: Database },
            { label: 'Settings',        href: '/admin/settings',     Icon: Settings },
          ].map(({ label, href, Icon }) => (
            <Link key={href} href={href}
              className="flex flex-col items-center gap-2 p-3 bg-white border border-gray-200 rounded-xl hover:shadow-md hover:border-indigo-200 transition-all text-center group">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                <Icon className="h-5 w-5 text-indigo-600" />
              </div>
              <span className="text-[11px] font-medium text-gray-600 group-hover:text-gray-900 leading-tight">{label}</span>
            </Link>
          ))}
        </div>
      </div>

    </div>
  );
}
