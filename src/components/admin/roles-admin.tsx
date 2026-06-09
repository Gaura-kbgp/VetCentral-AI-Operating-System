'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  Search, Shield, Plus, X, ChevronDown, CheckCircle,
  AlertCircle, Building2, Globe, KeyRound, User, ToggleLeft, ToggleRight,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { ROLE_META, ALL_ROLES } from '@/lib/permissions';
import {
  assignHospitalRole, assignOrgRole,
  revokeHospitalRole, revokeOrgRole, setRoleActive,
} from '@/lib/actions/rbac';
import type { AppRole } from '@/types/database';
import type { RoleAssignment } from '@/lib/actions/rbac';

// ─── Types ────────────────────────────────────────────────────────────────

interface Hospital { id: string; name: string; color: string | null; }
interface UserProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  avatar_url?: string | null;
  job_title?: string | null;
}

interface Props {
  assignments: RoleAssignment[];
  hospitals: Hospital[];
  users: UserProfile[];
  currentRole: AppRole | null;
}

// ─── Role badge ───────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: AppRole }) {
  const meta = ROLE_META[role];
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', meta.badgeClass)}>
      <Shield className="h-2.5 w-2.5" />
      {meta.label}
    </span>
  );
}

// ─── Assign Role Dialog ───────────────────────────────────────────────────

function AssignRoleDialog({
  users, hospitals, currentRole, onClose, onSuccess,
}: {
  users: UserProfile[];
  hospitals: Hospital[];
  currentRole: AppRole | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<AppRole>('viewer');
  const [scope, setScope] = useState<'hospital' | 'org'>('hospital');
  const [hospitalId, setHospitalId] = useState('');
  const [notes, setNotes] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  const canAssignOrg = currentRole === 'super_admin' || currentRole === 'org_admin';
  const ORG_ROLES: AppRole[] = ['super_admin', 'org_admin'];

  async function handleSubmit() {
    if (!userId) { setError('Select a user'); return; }
    if (scope === 'hospital' && !hospitalId) { setError('Select a hospital'); return; }

    start(async () => {
      setError(null);
      const result = scope === 'org'
        ? await assignOrgRole({ userId, role, notes: notes || undefined, expiresAt: expiresAt || undefined })
        : await assignHospitalRole({ userId, hospitalId, role, notes: notes || undefined, expiresAt: expiresAt || undefined });

      if (result.success) { onSuccess(); onClose(); }
      else setError(result.error);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Assign Role</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded p-1">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* User */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">User *</label>
            <Select
              value={userId}
              onValueChange={v => setUserId(v ?? '')}
              items={users.map(u => ({
                value: u.id,
                label: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || u.id,
              }))}
            >
              <SelectTrigger><SelectValue placeholder="Select user…" /></SelectTrigger>
              <SelectContent className="max-h-60">
                {users.map(u => (
                  <SelectItem key={u.id} value={u.id}>
                    {[u.first_name, u.last_name].filter(Boolean).join(' ') || '(no name)'} — {u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Scope selector */}
          {canAssignOrg && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Scope</label>
              <div className="flex gap-2">
                {(['hospital', 'org'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setScope(s)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all',
                      scope === s
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400',
                    )}
                  >
                    {s === 'hospital' ? <Building2 className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
                    {s === 'hospital' ? 'Hospital' : 'Org-wide'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Hospital (if hospital scope) */}
          {scope === 'hospital' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Hospital *</label>
              <Select
                value={hospitalId}
                onValueChange={v => setHospitalId(v ?? '')}
                items={hospitals.map(h => ({ value: h.id, label: h.name }))}
              >
                <SelectTrigger><SelectValue placeholder="Select hospital…" /></SelectTrigger>
                <SelectContent>
                  {hospitals.map(h => (
                    <SelectItem key={h.id} value={h.id}>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: h.color ?? '#6366f1' }} />
                        {h.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Role */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role *</label>
            <Select
              value={role}
              onValueChange={v => setRole(v as AppRole)}
              items={(scope === 'org' ? ORG_ROLES : ALL_ROLES.filter(r => !ORG_ROLES.includes(r))).map(r => ({
                value: r,
                label: ROLE_META[r].label,
              }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(scope === 'org' ? ORG_ROLES : ALL_ROLES.filter(r => !ORG_ROLES.includes(r))).map(r => {
                  const meta = ROLE_META[r];
                  return (
                    <SelectItem key={r} value={r}>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: meta.color }} />
                        {meta.label}
                        <span className="text-xs text-gray-400 ml-1">— {meta.description.slice(0, 40)}…</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Expiry */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Expires (optional)
            </label>
            <input
              type="date"
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={expiresAt}
              onChange={e => setExpiresAt(e.target.value)}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Notes (optional)
            </label>
            <input
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Reason for assignment…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleSubmit} disabled={isPending}>
              {isPending ? 'Assigning…' : 'Assign Role'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Assignment Row ───────────────────────────────────────────────────────

function AssignmentRow({
  assignment,
  user,
  onRevoke,
  onToggleActive,
}: {
  assignment: RoleAssignment;
  user?: UserProfile;
  onRevoke: () => void;
  onToggleActive: () => void;
}) {
  const meta = ROLE_META[assignment.role];
  const isExpired = assignment.expires_at && assignment.expires_at < new Date().toISOString();

  return (
    <tr className="hover:bg-slate-50/60 dark:hover:bg-gray-800/30 transition-colors group">
      {/* User */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarImage src={user?.avatar_url ?? undefined} />
            <AvatarFallback className="text-[10px] bg-slate-100 dark:bg-gray-700">
              {user?.first_name?.[0]}{user?.last_name?.[0]}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium text-slate-800 dark:text-gray-200 text-xs">
              {user?.first_name} {user?.last_name}
            </p>
            <p className="text-[11px] text-slate-400 dark:text-gray-500">{user?.email}</p>
          </div>
        </div>
      </td>

      {/* Role */}
      <td className="px-4 py-3">
        <RoleBadge role={assignment.role} />
      </td>

      {/* Scope / hospital */}
      <td className="px-4 py-3 hidden md:table-cell">
        {assignment.scope === 'org' ? (
          <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <Globe className="h-3 w-3" /> Org-wide
          </span>
        ) : assignment.hospital_name ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: assignment.hospital_color ?? '#6366f1' }} />
            {assignment.hospital_name}
          </span>
        ) : <span className="text-xs text-gray-300">—</span>}
      </td>

      {/* Status */}
      <td className="px-4 py-3 hidden lg:table-cell">
        {isExpired ? (
          <span className="inline-flex items-center gap-1 text-xs text-red-500">
            <AlertCircle className="h-3 w-3" /> Expired
          </span>
        ) : !assignment.is_active ? (
          <span className="inline-flex items-center gap-1 text-xs text-gray-400">
            <ToggleLeft className="h-3 w-3" /> Inactive
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
            <CheckCircle className="h-3 w-3" /> Active
          </span>
        )}
      </td>

      {/* Granted */}
      <td className="px-4 py-3 hidden lg:table-cell">
        <span className="text-xs text-slate-400">
          {format(new Date(assignment.granted_at), 'MMM d, yyyy')}
        </span>
        {assignment.expires_at && (
          <p className="text-[10px] text-slate-300 dark:text-gray-600">
            Expires {format(new Date(assignment.expires_at), 'MMM d, yyyy')}
          </p>
        )}
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onToggleActive}
            title={assignment.is_active ? 'Deactivate' : 'Activate'}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            {assignment.is_active
              ? <ToggleRight className="h-4 w-4 text-green-500" />
              : <ToggleLeft className="h-4 w-4" />}
          </button>
          <button
            onClick={onRevoke}
            title="Revoke role"
            className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────

export default function RolesAdmin({ assignments, hospitals, users, currentRole }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'hospital' | 'org'>('all');
  const [showDialog, setShowDialog] = useState(false);
  const [isPending, start] = useTransition();

  // Build a user lookup map
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));

  // Role distribution for quick stats
  const roleCounts = ALL_ROLES.reduce<Record<string, number>>((acc, r) => {
    acc[r] = assignments.filter(a => a.role === r).length;
    return acc;
  }, {});

  const filtered = assignments.filter(a => {
    if (roleFilter !== 'all' && a.role !== roleFilter) return false;
    if (scopeFilter !== 'all' && a.scope !== scopeFilter) return false;
    if (search) {
      const u = userMap[a.user_id];
      const text = `${u?.first_name ?? ''} ${u?.last_name ?? ''} ${u?.email ?? ''}`.toLowerCase();
      if (!text.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  async function handleRevoke(assignment: RoleAssignment) {
    if (!confirm(`Revoke ${ROLE_META[assignment.role].label} from this user?`)) return;
    start(async () => {
      let result;
      if (assignment.scope === 'org') {
        result = await revokeOrgRole(assignment.user_id);
      } else {
        result = await revokeHospitalRole(assignment.user_id, assignment.hospital_id!);
      }
      if (result.success) router.refresh();
    });
  }

  async function handleToggleActive(assignment: RoleAssignment) {
    start(async () => {
      const result = await setRoleActive(assignment.id, assignment.scope, !assignment.is_active);
      if (result.success) router.refresh();
    });
  }

  const canManage = currentRole === 'super_admin' || currentRole === 'org_admin';

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {ALL_ROLES.slice(0, 6).map(r => {
          const meta = ROLE_META[r];
          const count = roleCounts[r] ?? 0;
          if (count === 0) return null;
          return (
            <button
              key={r}
              onClick={() => setRoleFilter(roleFilter === r ? 'all' : r)}
              className={cn(
                'flex flex-col items-start p-3 rounded-xl border transition-all text-left',
                roleFilter === r
                  ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-400'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300',
              )}
            >
              <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">{count}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{meta.label}</span>
            </button>
          );
        })}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search users…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <Select value={roleFilter} onValueChange={v => setRoleFilter(v ?? 'all')}>
          <SelectTrigger className="w-44 h-9"><SelectValue placeholder="All roles" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {ALL_ROLES.map(r => (
              <SelectItem key={r} value={r}>{ROLE_META[r].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={scopeFilter} onValueChange={v => setScopeFilter((v ?? 'all') as typeof scopeFilter)}>
          <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Scopes</SelectItem>
            <SelectItem value="hospital">Hospital</SelectItem>
            <SelectItem value="org">Org-wide</SelectItem>
          </SelectContent>
        </Select>

        <p className="text-xs text-slate-400 ml-auto">{filtered.length} assignments</p>

        {canManage && (
          <Button size="sm" onClick={() => setShowDialog(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Assign Role
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="border border-slate-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-gray-700 bg-slate-50 dark:bg-gray-800/80">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-gray-400">User</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-gray-400">Role</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-gray-400 hidden md:table-cell">Scope</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-gray-400 hidden lg:table-cell">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-gray-400 hidden lg:table-cell">Granted</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-gray-700">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-slate-400 text-sm">
                  No role assignments found
                </td>
              </tr>
            ) : (
              filtered.map(a => (
                <AssignmentRow
                  key={a.id}
                  assignment={a}
                  user={userMap[a.user_id]}
                  onRevoke={() => handleRevoke(a)}
                  onToggleActive={() => handleToggleActive(a)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Assign dialog */}
      {showDialog && (
        <AssignRoleDialog
          users={users}
          hospitals={hospitals}
          currentRole={currentRole}
          onClose={() => setShowDialog(false)}
          onSuccess={() => router.refresh()}
        />
      )}
    </div>
  );
}
