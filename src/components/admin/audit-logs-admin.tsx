'use client';

import { useState, useMemo } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Search, Shield, User, FileText, Settings, Trash2, Plus, Edit,
  KeyRound, Download, ToggleRight, ToggleLeft, AlertTriangle, Info,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ─── Config ───────────────────────────────────────────────────────────────

interface ActionConfig {
  label: string;
  color: string;
  icon: React.ReactNode;
  severity: 'info' | 'warning' | 'critical';
}

const ACTION_CONFIG: Record<string, ActionConfig> = {
  create:              { label: 'Create',         color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',    icon: <Plus className="h-3 w-3" />,         severity: 'info' },
  update:              { label: 'Update',         color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',        icon: <Edit className="h-3 w-3" />,         severity: 'info' },
  delete:              { label: 'Delete',         color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',            icon: <Trash2 className="h-3 w-3" />,       severity: 'warning' },
  login:               { label: 'Login',          color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',        icon: <User className="h-3 w-3" />,         severity: 'info' },
  logout:              { label: 'Logout',         color: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',       icon: <User className="h-3 w-3" />,         severity: 'info' },
  change_password:     { label: 'Password',       color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',    icon: <Shield className="h-3 w-3" />,       severity: 'warning' },
  revoke_all_sessions: { label: 'Sessions',       color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', icon: <Shield className="h-3 w-3" />,      severity: 'warning' },
  // RBAC events
  role_granted:        { label: 'Role Granted',   color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', icon: <KeyRound className="h-3 w-3" />,    severity: 'warning' },
  role_revoked:        { label: 'Role Revoked',   color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',            icon: <KeyRound className="h-3 w-3" />,    severity: 'warning' },
  role_changed:        { label: 'Role Changed',   color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',    icon: <KeyRound className="h-3 w-3" />,    severity: 'warning' },
  role_assigned:       { label: 'Role Assigned',  color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', icon: <KeyRound className="h-3 w-3" />,   severity: 'warning' },
  role_activated:      { label: 'Role On',        color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',    icon: <ToggleRight className="h-3 w-3" />, severity: 'info' },
  role_deactivated:    { label: 'Role Off',       color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', icon: <ToggleLeft className="h-3 w-3" />, severity: 'warning' },
};

const SEVERITY_CONFIG = {
  info:     { icon: <Info className="h-3 w-3" />,          cls: 'text-blue-500' },
  warning:  { icon: <AlertTriangle className="h-3 w-3" />, cls: 'text-amber-500' },
  critical: { icon: <AlertTriangle className="h-3 w-3" />, cls: 'text-red-500' },
};

const RESOURCE_ICONS: Record<string, React.ReactNode> = {
  profile:    <User className="h-3.5 w-3.5" />,
  task:       <FileText className="h-3.5 w-3.5" />,
  auth:       <Shield className="h-3.5 w-3.5" />,
  user_role:  <KeyRound className="h-3.5 w-3.5" />,
  user_hospital_roles: <KeyRound className="h-3.5 w-3.5" />,
  org_user_roles: <KeyRound className="h-3.5 w-3.5" />,
};

// ─── Types ────────────────────────────────────────────────────────────────

interface Actor {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  email?: string | null;
}

interface Log {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  user_id: string | null;
  ip_address: string | null;
  created_at: string;
  severity?: string | null;
  old_data?: Record<string, unknown> | null;
  new_data?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  actor: Actor | null;
}

interface Props { logs: Log[]; }

// ─── Detail Drawer ────────────────────────────────────────────────────────

function LogDetail({ log, onClose }: { log: Log; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute right-0 top-0 bottom-0 w-96 bg-white dark:bg-gray-900 shadow-2xl flex flex-col z-10">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Log Detail</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded">
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-xs">
          <div>
            <p className="text-gray-400 mb-1 uppercase tracking-wide text-[10px] font-bold">Action</p>
            <p className="text-gray-800 dark:text-gray-200 font-medium capitalize">{log.action.replace(/_/g, ' ')}</p>
          </div>
          <div>
            <p className="text-gray-400 mb-1 uppercase tracking-wide text-[10px] font-bold">Resource</p>
            <p className="text-gray-800 dark:text-gray-200">{log.resource_type} {log.resource_id && <span className="text-gray-400 font-mono">{log.resource_id.slice(0, 8)}…</span>}</p>
          </div>
          <div>
            <p className="text-gray-400 mb-1 uppercase tracking-wide text-[10px] font-bold">Time</p>
            <p className="text-gray-800 dark:text-gray-200">{format(new Date(log.created_at), 'PPPpp')}</p>
          </div>
          {log.ip_address && (
            <div>
              <p className="text-gray-400 mb-1 uppercase tracking-wide text-[10px] font-bold">IP Address</p>
              <p className="font-mono text-gray-800 dark:text-gray-200">{log.ip_address}</p>
            </div>
          )}
          {log.old_data && (
            <div>
              <p className="text-gray-400 mb-1 uppercase tracking-wide text-[10px] font-bold">Before</p>
              <pre className="bg-gray-50 dark:bg-gray-800 rounded p-2 overflow-x-auto text-gray-700 dark:text-gray-300">
                {JSON.stringify(log.old_data, null, 2)}
              </pre>
            </div>
          )}
          {log.new_data && (
            <div>
              <p className="text-gray-400 mb-1 uppercase tracking-wide text-[10px] font-bold">After</p>
              <pre className="bg-gray-50 dark:bg-gray-800 rounded p-2 overflow-x-auto text-gray-700 dark:text-gray-300">
                {JSON.stringify(log.new_data, null, 2)}
              </pre>
            </div>
          )}
          {log.metadata && Object.keys(log.metadata).length > 0 && (
            <div>
              <p className="text-gray-400 mb-1 uppercase tracking-wide text-[10px] font-bold">Metadata</p>
              <pre className="bg-gray-50 dark:bg-gray-800 rounded p-2 overflow-x-auto text-gray-700 dark:text-gray-300">
                {JSON.stringify(log.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────

export default function AuditLogsAdmin({ logs }: Props) {
  const [search, setSearch]         = useState('');
  const [action, setAction]         = useState('all');
  const [resource, setResource]     = useState('all');
  const [severity, setSeverity]     = useState('all');
  const [selectedLog, setSelectedLog] = useState<Log | null>(null);

  const actions   = useMemo(() => [...new Set(logs.map(l => l.action))].sort(), [logs]);
  const resources = useMemo(() => [...new Set(logs.map(l => l.resource_type))].sort(), [logs]);

  const filtered = useMemo(() => logs.filter(l => {
    if (action !== 'all' && l.action !== action) return false;
    if (resource !== 'all' && l.resource_type !== resource) return false;
    if (severity !== 'all' && (l.severity ?? 'info') !== severity) return false;
    if (search) {
      const actorName = `${l.actor?.first_name ?? ''} ${l.actor?.last_name ?? ''} ${l.actor?.email ?? ''}`.toLowerCase();
      const text = `${actorName} ${l.action} ${l.resource_type} ${l.ip_address ?? ''}`.toLowerCase();
      if (!text.includes(search.toLowerCase())) return false;
    }
    return true;
  }), [logs, action, resource, severity, search]);

  // Stats
  const stats = useMemo(() => ({
    total:    logs.length,
    warning:  logs.filter(l => l.severity === 'warning').length,
    critical: logs.filter(l => l.severity === 'critical').length,
    roleEvents: logs.filter(l => l.action.startsWith('role_')).length,
  }), [logs]);

  function exportCsv() {
    const header = 'time,actor,action,resource,ip\n';
    const rows = filtered.map(l =>
      [
        l.created_at,
        `${l.actor?.first_name ?? ''} ${l.actor?.last_name ?? ''}`.trim(),
        l.action,
        l.resource_type,
        l.ip_address ?? '',
      ].join(',')
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'audit-logs.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Events', value: stats.total, cls: 'text-gray-900 dark:text-gray-100' },
          { label: 'Warnings',     value: stats.warning, cls: 'text-amber-600 dark:text-amber-400' },
          { label: 'Critical',     value: stats.critical, cls: 'text-red-600 dark:text-red-400' },
          { label: 'Role Events',  value: stats.roleEvents, cls: 'text-purple-600 dark:text-purple-400' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <p className={cn('text-2xl font-bold', s.cls)}>{s.value}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search actor, action, resource…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={action} onValueChange={v => setAction(v ?? 'all')}>
          <SelectTrigger className="w-44 h-9"><SelectValue placeholder="All actions" /></SelectTrigger>
          <SelectContent className="max-h-60">
            <SelectItem value="all">All Actions</SelectItem>
            {actions.map(a => (
              <SelectItem key={a} value={a} className="capitalize">
                {a.replace(/_/g, ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={resource} onValueChange={v => setResource(v ?? 'all')}>
          <SelectTrigger className="w-40 h-9"><SelectValue placeholder="All resources" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Resources</SelectItem>
            {resources.map(r => (
              <SelectItem key={r} value={r} className="capitalize">{r.replace(/_/g, ' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={severity} onValueChange={v => setSeverity(v ?? 'all')}>
          <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severity</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-slate-400 ml-auto">{filtered.length} entries</p>
        <Button variant="outline" size="sm" onClick={exportCsv}>
          <Download className="h-3.5 w-3.5 mr-1" />
          Export CSV
        </Button>
      </div>

      {/* Table */}
      <div className="border border-slate-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-gray-700 bg-slate-50 dark:bg-gray-800/80">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-gray-400">Actor</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-gray-400">Action</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-gray-400 hidden md:table-cell">Resource</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-gray-400 hidden lg:table-cell">IP</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-gray-400">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-gray-700">
            {filtered.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-12 text-slate-400 text-sm">No log entries found</td></tr>
            ) : (
              filtered.map(log => {
                const ac = ACTION_CONFIG[log.action];
                const sev = SEVERITY_CONFIG[log.severity as keyof typeof SEVERITY_CONFIG ?? 'info'] ?? SEVERITY_CONFIG.info;
                return (
                  <tr
                    key={log.id}
                    className="hover:bg-slate-50/60 dark:hover:bg-gray-800/30 cursor-pointer transition-colors"
                    onClick={() => setSelectedLog(log)}
                  >
                    <td className="px-4 py-2.5">
                      {log.actor ? (
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6 shrink-0">
                            <AvatarImage src={log.actor.avatar_url ?? undefined} />
                            <AvatarFallback className="text-[10px] bg-slate-100 dark:bg-gray-700">
                              {log.actor.first_name?.[0]}{log.actor.last_name?.[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <span className="text-xs text-slate-700 dark:text-gray-300 font-medium">
                              {log.actor.first_name} {log.actor.last_name}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Settings className="h-3 w-3" /> System
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className={cn('shrink-0', sev.cls)} title={log.severity ?? 'info'}>
                          {sev.icon}
                        </span>
                        {ac ? (
                          <Badge className={cn('text-[10px] border-0 gap-1', ac.color)}>
                            {ac.icon}{ac.label}
                          </Badge>
                        ) : (
                          <Badge className="text-[10px] border-0 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 capitalize">
                            {log.action.replace(/_/g, ' ')}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 hidden md:table-cell">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-gray-400">
                        {RESOURCE_ICONS[log.resource_type] ?? <Settings className="h-3.5 w-3.5" />}
                        <span className="capitalize">{log.resource_type.replace(/_/g, ' ')}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 hidden lg:table-cell">
                      <span className="text-xs text-slate-400 font-mono">{log.ip_address ?? '—'}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs text-slate-400" title={format(new Date(log.created_at), 'PPPpp')}>
                        {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selectedLog && <LogDetail log={selectedLog} onClose={() => setSelectedLog(null)} />}
    </div>
  );
}
