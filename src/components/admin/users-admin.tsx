'use client';

import { useState, useEffect, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { formatDistanceToNow, format } from 'date-fns';
import {
  Search, Users, CheckCircle2, XCircle, MoreHorizontal,
  UserPen, Shield, PowerOff, Power, UserPlus, X, Building2,
  ArrowLeft, Sparkles, KeyRound, Briefcase, Copy, UserCheck,
  GraduationCap, Loader2, Mail, Phone, Eye, EyeOff, Wand2,
  Check, SendHorizonal, Trash2, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { updateUserProfile, assignRole, removeRole, setUserActive, deleteUserProfile, setUserActiveManaged } from '@/lib/actions/users';
import { canActorManageTarget, ROLE_LEVEL } from '@/lib/role-utils';
import { createEmployee, getUsersWithoutOnboarding, sendUsersToOnboarding } from '@/lib/actions/hr';
import type { NewUserRow } from '@/lib/actions/hr';
import type { AppRole } from '@/types/database';

// ── Types ────────────────────────────────────────────────────

export interface Hospital { id: string; name: string; color: string | null; }

export interface UserRole { role: string; hospital: Hospital | null; }

export interface UserRow {
  id:           string;
  first_name:   string | null;
  last_name:    string | null;
  email:        string | null;
  job_title:    string | null;
  department:   string | null;
  avatar_url:   string | null;
  is_active:    boolean;
  created_at:   string;
  last_seen_at: string | null;
  roles:        UserRole[];
}

interface Props {
  users:            UserRow[];
  hospitals:        Hospital[];
  currentUserId:    string;
  currentUserRole?: AppRole | null;
}

// ── Constants ────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  super_admin:      'bg-red-100 text-red-700',
  org_admin:        'bg-purple-100 text-purple-700',
  hospital_admin:   'bg-indigo-100 text-indigo-700',
  practice_manager: 'bg-blue-100 text-blue-700',
  doctor:           'bg-teal-100 text-teal-700',
  csr:              'bg-green-100 text-green-700',
  va:               'bg-cyan-100 text-cyan-700',
  marketing:        'bg-orange-100 text-orange-700',
  hr:               'bg-pink-100 text-pink-700',
  it_admin:         'bg-violet-100 text-violet-700',
  viewer:           'bg-slate-100 text-slate-600',
};

const ALL_ROLES: AppRole[] = [
  'super_admin', 'org_admin', 'hospital_admin', 'practice_manager',
  'doctor', 'csr', 'va', 'marketing', 'hr', 'it_admin', 'viewer',
];

const ROLE_LABELS: Record<AppRole, string> = {
  super_admin:      'Super Admin',
  org_admin:        'Org Admin',
  hospital_admin:   'Hospital Admin',
  practice_manager: 'Practice Manager',
  doctor:           'Doctor',
  csr:              'CSR',
  va:               'VA',
  marketing:        'Marketing',
  hr:               'HR',
  it_admin:         'IT Admin',
  viewer:           'Viewer',
};

// ── Main component ───────────────────────────────────────────

// Returns true if the current user (by role) can manage (delete/deactivate) the target user
function canManage(actorRole: AppRole | null | undefined, targetRoles: UserRole[]): boolean {
  if (!actorRole) return false;
  const actorRoles  = [actorRole];
  const targetNames = targetRoles.map(r => r.role);
  // If target has no roles, any HR+ can manage
  if (targetNames.length === 0) return ['super_admin','org_admin','hospital_admin','practice_manager','hr'].includes(actorRole);
  return canActorManageTarget(actorRoles, targetNames);
}

export default function UsersAdmin({ users: initialUsers, hospitals, currentUserId, currentUserRole }: Props) {
  const [users, setUsers]             = useState<UserRow[]>(initialUsers);
  const [search, setSearch]           = useState('');
  const [hospitalFilter, setHospital] = useState('all');
  const [statusFilter, setStatus]     = useState('all');
  const [editUser, setEditUser]       = useState<UserRow | null>(null);
  const [roleUser, setRoleUser]       = useState<UserRow | null>(null);
  const [showAdd, setShowAdd]         = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<UserRow | null>(null);
  const [viewTab, setViewTab]         = useState<'all' | 'new'>('all');
  const [newUsers, setNewUsers]       = useState<NewUserRow[] | null>(null);
  const [newUsersLoading, setNewUsersLoading] = useState(false);

  useEffect(() => {
    if (viewTab !== 'new' || newUsers !== null) return;
    setNewUsersLoading(true);
    getUsersWithoutOnboarding().then(r => {
      setNewUsers(r.users);
      setNewUsersLoading(false);
    });
  }, [viewTab, newUsers]);

  const filtered = users.filter(u => {
    const name = `${u.first_name ?? ''} ${u.last_name ?? ''} ${u.email ?? ''}`.toLowerCase();
    if (search && !name.includes(search.toLowerCase())) return false;
    if (statusFilter === 'active'   && !u.is_active) return false;
    if (statusFilter === 'inactive' && u.is_active)  return false;
    if (hospitalFilter !== 'all') {
      return u.roles.some(r => (r.hospital as Hospital | null)?.id === hospitalFilter);
    }
    return true;
  });

  const active   = users.filter(u => u.is_active).length;
  const inactive = users.length - active;

  function patchUser(id: string, patch: Partial<UserRow>) {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, ...patch } : u));
  }

  // Full-section Add User page replaces the list while open
  if (showAdd) {
    return (
      <AddUserView
        hospitals={hospitals}
        onBack={() => setShowAdd(false)}
        onCreated={(newUser) => {
          setUsers(prev => [newUser, ...prev]);
        }}
      />
    );
  }

  return (
    <div className="space-y-5 mt-6">

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Users', value: users.length, color: 'text-slate-900' },
          { label: 'Active',      value: active,       color: 'text-green-600' },
          { label: 'Inactive',    value: inactive,     color: 'text-slate-400' },
        ].map(s => (
          <Card key={s.label} className="border-slate-100">
            <CardContent className="flex items-center gap-3 p-4">
              <Users className="h-5 w-5 text-slate-400" />
              <div>
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tab switcher */}
      <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {([
          { id: 'all' as const, label: 'All Users',   count: users.length },
          { id: 'new' as const, label: 'New Users',   count: newUsers?.length ?? null, accent: true },
        ]).map(t => {
          const active = viewTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setViewTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all ${
                active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.id === 'all' ? <Users className="h-3.5 w-3.5" /> : <GraduationCap className="h-3.5 w-3.5" />}
              {t.label}
              {t.count != null && (
                <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                  active
                    ? t.accent && t.count > 0
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-blue-100 text-blue-700'
                    : 'bg-slate-200 text-slate-500'
                }`}>
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* New Users tab */}
      {viewTab === 'new' && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="h-9 w-9 rounded-xl bg-amber-50 flex items-center justify-center">
              <GraduationCap className="h-4.5 w-4.5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">Pending Onboarding</p>
              <p className="text-xs text-slate-400">Select users and send them to the onboarding process</p>
            </div>
          </div>
          {newUsersLoading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-slate-400 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            <NewUsersPanel
              users={newUsers ?? []}
              currentUserRole={currentUserRole}
              onSent={(sentIds) => {
                setNewUsers(prev => prev?.filter(u => !sentIds.includes(u.id)) ?? null);
              }}
              onDeleted={(id) => {
                setNewUsers(prev => prev?.filter(u => u.id !== id) ?? null);
                setUsers(prev => prev.filter(u => u.id !== id));
              }}
            />
          )}
        </div>
      )}

      {/* Toolbar (All Users only) */}
      {viewTab === 'all' && (<>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search users…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={hospitalFilter} onValueChange={v => setHospital(v ?? '')}>
          <SelectTrigger className="w-44 h-9"><SelectValue placeholder="All hospitals" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Hospitals</SelectItem>
            {hospitals.map(h => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={v => setStatus(v ?? '')}>
          <SelectTrigger className="w-32 h-9"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-slate-400">{filtered.length} of {users.length}</span>
        <Button size="sm" className="ml-auto gap-1.5 h-9" onClick={() => setShowAdd(true)}>
          <UserPlus className="h-4 w-4" />
          Add User
        </Button>
      </div>

      {/* Table */}
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">User</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 hidden md:table-cell">Roles</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 hidden lg:table-cell">Last Active</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Status</th>
              <th className="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-slate-400 text-sm">No users found</td>
              </tr>
            ) : filtered.map(u => (
              <UserTableRow
                key={u.id}
                user={u}
                hospitals={hospitals}
                isSelf={u.id === currentUserId}
                canManageThis={canManage(currentUserRole, u.roles)}
                onEdit={() => setEditUser(u)}
                onAssignRole={() => setRoleUser(u)}
                onToggleStatus={async () => {
                  const res = await setUserActiveManaged(u.id, !u.is_active);
                  if (res.success) {
                    patchUser(u.id, { is_active: !u.is_active });
                    toast.success(u.is_active ? 'User deactivated' : 'User activated');
                  } else {
                    toast.error(res.error);
                  }
                }}
                onDelete={() => setConfirmDelete(u)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      {editUser && (
        <EditUserModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onSaved={(patch) => {
            patchUser(editUser.id, patch);
            setEditUser(null);
          }}
        />
      )}

      {roleUser && (
        <AssignRoleModal
          user={roleUser}
          hospitals={hospitals}
          onClose={() => setRoleUser(null)}
          onSaved={(newRole) => {
            const exists = roleUser.roles.findIndex(
              r => (r.hospital as Hospital | null)?.id === newRole.hospital?.id
            );
            const updatedRoles = exists >= 0
              ? roleUser.roles.map((r, i) => i === exists ? newRole : r)
              : [...roleUser.roles, newRole];
            patchUser(roleUser.id, { roles: updatedRoles });
            setRoleUser(null);
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDeleteModal
          user={confirmDelete}
          onClose={() => setConfirmDelete(null)}
          onDeleted={() => {
            setUsers(prev => prev.filter(u => u.id !== confirmDelete.id));
            setConfirmDelete(null);
          }}
        />
      )}
      </>)}

    </div>
  );
}

// ── UserTableRow ──────────────────────────────────────────────

function UserTableRow({ user: u, isSelf, canManageThis, onEdit, onAssignRole, onToggleStatus, onDelete }: {
  user:           UserRow;
  hospitals:      Hospital[];
  isSelf:         boolean;
  canManageThis:  boolean;
  onEdit:         () => void;
  onAssignRole:   () => void;
  onToggleStatus: () => Promise<void>;
  onDelete:       () => void;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <tr className={`hover:bg-slate-50/60 transition-colors ${isSelf ? 'bg-blue-50/20' : ''}`}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarImage src={u.avatar_url ?? undefined} />
            <AvatarFallback className="text-xs bg-blue-100 text-blue-700 font-semibold">
              {u.first_name?.[0]}{u.last_name?.[0]}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium text-slate-800">
              {u.first_name} {u.last_name}
              {isSelf && <span className="text-[10px] text-slate-400 ml-1">(you)</span>}
            </p>
            <p className="text-xs text-slate-400">{u.email}</p>
            {u.job_title && <p className="text-[11px] text-slate-400">{u.job_title}</p>}
          </div>
        </div>
      </td>

      <td className="px-4 py-3 hidden md:table-cell">
        <div className="flex flex-wrap gap-1">
          {u.roles.slice(0, 2).map((r, i) => (
            <Badge key={i} className={`text-[10px] px-1.5 border-0 ${ROLE_COLORS[r.role] ?? 'bg-slate-100 text-slate-600'}`}>
              {r.role.replace(/_/g, ' ')}
            </Badge>
          ))}
          {u.roles.length > 2 && (
            <Badge className="text-[10px] px-1.5 border-0 bg-slate-100 text-slate-500">
              +{u.roles.length - 2}
            </Badge>
          )}
          {u.roles.length === 0 && <span className="text-xs text-slate-300">No roles</span>}
        </div>
      </td>

      <td className="px-4 py-3 hidden lg:table-cell">
        <p className="text-xs text-slate-500">
          {u.last_seen_at
            ? formatDistanceToNow(new Date(u.last_seen_at), { addSuffix: true })
            : `Joined ${format(new Date(u.created_at), 'MMM d, yyyy')}`}
        </p>
      </td>

      <td className="px-4 py-3">
        {u.is_active ? (
          <span className="inline-flex items-center gap-1 text-xs text-green-600">
            <CheckCircle2 className="h-3.5 w-3.5" /> Active
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-slate-400">
            <XCircle className="h-3.5 w-3.5" /> Inactive
          </span>
        )}
      </td>

      <td className="px-4 py-3">
        <DropdownMenu>
          <DropdownMenuTrigger
            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-slate-100 transition-colors border-0 bg-transparent cursor-pointer"
            disabled={pending}
          >
            <MoreHorizontal className="h-4 w-4 text-slate-500" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={onEdit} className="gap-2 cursor-pointer">
              <UserPen className="h-4 w-4" /> Edit Details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onAssignRole} className="gap-2 cursor-pointer">
              <Shield className="h-4 w-4" /> Assign Role
            </DropdownMenuItem>
            {canManageThis && !isSelf && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="gap-2 cursor-pointer"
                  onClick={() => startTransition(onToggleStatus)}
                >
                  {u.is_active ? (
                    <><PowerOff className="h-4 w-4 text-amber-500" /><span className="text-amber-600">Deactivate</span></>
                  ) : (
                    <><Power className="h-4 w-4 text-green-600" /><span className="text-green-700">Activate</span></>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2 cursor-pointer"
                  onClick={onDelete}
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                  <span className="text-red-600">Delete User</span>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

// ── EditUserModal ─────────────────────────────────────────────

interface EditForm {
  first_name:  string;
  last_name:   string;
  job_title:   string;
  department:  string;
  phone:       string;
}

function EditUserModal({ user, onClose, onSaved }: {
  user:    UserRow;
  onClose: () => void;
  onSaved: (patch: Partial<UserRow>) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const { register, handleSubmit, formState: { errors } } = useForm<EditForm>({
    defaultValues: {
      first_name:  user.first_name  ?? '',
      last_name:   user.last_name   ?? '',
      job_title:   user.job_title   ?? '',
      department:  user.department  ?? '',
      phone:       '',
    },
  });

  function onSubmit(values: EditForm) {
    startTransition(async () => {
      const res = await updateUserProfile(user.id, {
        first_name:  values.first_name,
        last_name:   values.last_name,
        job_title:   values.job_title  || null,
        department:  values.department || null,
        phone:       values.phone      || null,
      });
      if (res.success) {
        toast.success('User updated');
        onSaved({
          first_name:  values.first_name,
          last_name:   values.last_name,
          job_title:   values.job_title  || null,
          department:  values.department || null,
        });
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPen className="h-5 w-5 text-slate-500" />
            Edit User Details
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-3 py-1">
          <Avatar className="h-10 w-10">
            <AvatarImage src={user.avatar_url ?? undefined} />
            <AvatarFallback className="text-sm bg-blue-100 text-blue-700 font-semibold">
              {user.first_name?.[0]}{user.last_name?.[0]}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium text-slate-800">{user.first_name} {user.last_name}</p>
            <p className="text-xs text-slate-400">{user.email}</p>
          </div>
        </div>

        <Separator />

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>First Name <span className="text-red-500">*</span></Label>
              <Input {...register('first_name', { required: true })} />
              {errors.first_name && <p className="text-xs text-red-500">Required</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Last Name <span className="text-red-500">*</span></Label>
              <Input {...register('last_name', { required: true })} />
              {errors.last_name && <p className="text-xs text-red-500">Required</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Job Title</Label>
            <Input placeholder="e.g. Veterinary Technician" {...register('job_title')} />
          </div>
          <div className="space-y-1.5">
            <Label>Department</Label>
            <Input placeholder="e.g. Surgery" {...register('department')} />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input placeholder="+1 (555) 000-0000" {...register('phone')} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── AssignRoleModal ───────────────────────────────────────────

function AssignRoleModal({ user, hospitals, onClose, onSaved }: {
  user:      UserRow;
  hospitals: Hospital[];
  onClose:   () => void;
  onSaved:   (role: UserRole) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [selectedHospital, setSelectedHospital] = useState('');
  const [selectedRole, setSelectedRole]         = useState<AppRole | ''>('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedHospital || !selectedRole) return;
    startTransition(async () => {
      const res = await assignRole(user.id, selectedHospital, selectedRole as AppRole);
      if (res.success) {
        const hospital = hospitals.find(h => h.id === selectedHospital) ?? null;
        toast.success('Role assigned');
        onSaved({ role: selectedRole, hospital });
      } else {
        toast.error(res.error);
      }
    });
  }

  // Remove a role (delete the hospital_role row)
  function handleRemove(hospitalId: string) {
    startTransition(async () => {
      const res = await removeRole(user.id, hospitalId);
      if (res.success) {
        toast.success('Role removed');
        // Reflect in parent table
        onSaved({ role: '__removed__', hospital: hospitals.find(h => h.id === hospitalId) ?? null });
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-slate-500" />
            Assign Role
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-3 py-1">
          <Avatar className="h-10 w-10">
            <AvatarImage src={user.avatar_url ?? undefined} />
            <AvatarFallback className="text-sm bg-blue-100 text-blue-700 font-semibold">
              {user.first_name?.[0]}{user.last_name?.[0]}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium text-slate-800">{user.first_name} {user.last_name}</p>
            <p className="text-xs text-slate-400">{user.email}</p>
          </div>
        </div>

        {/* Existing roles */}
        {user.roles.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Current Roles</p>
            <div className="space-y-1.5">
              {user.roles.map((r, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5 text-slate-400" />
                    <span className="text-sm text-slate-700">{(r.hospital as Hospital | null)?.name ?? 'Org-wide'}</span>
                    <Badge className={`text-[10px] px-1.5 border-0 ${ROLE_COLORS[r.role] ?? 'bg-slate-100 text-slate-600'}`}>
                      {r.role.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <button
                    type="button"
                    className="h-5 w-5 flex items-center justify-center rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                    onClick={() => (r.hospital as Hospital | null)?.id && handleRemove((r.hospital as Hospital).id)}
                    disabled={isPending}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <Separator />

        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Add / Update Role</p>
          <div className="space-y-1.5">
            <Label>Hospital <span className="text-red-500">*</span></Label>
            <Select
              value={selectedHospital}
              onValueChange={v => setSelectedHospital(v ?? '')}
              items={hospitals.map(h => ({ value: h.id, label: h.name }))}
            >
              <SelectTrigger><SelectValue placeholder="Select hospital…" /></SelectTrigger>
              <SelectContent>
                {hospitals.map(h => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Role <span className="text-red-500">*</span></Label>
            <Select
              value={selectedRole}
              onValueChange={v => setSelectedRole(v as AppRole)}
              items={ALL_ROLES.map(r => ({ value: r, label: ROLE_LABELS[r] }))}
            >
              <SelectTrigger><SelectValue placeholder="Select role…" /></SelectTrigger>
              <SelectContent>
                {ALL_ROLES.map(r => (
                  <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isPending || !selectedHospital || !selectedRole}>
              {isPending ? 'Saving…' : 'Assign Role'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── AddUserView — full-section Add User page ─────────────────

type EmployeeType = 'new_onboard' | 'existing';

interface AddForm {
  first_name:  string;
  last_name:   string;
  email:       string;
  job_title:   string;
  department:  string;
  phone:       string;
  hospital_id: string;
  role:        AppRole | '';
  password:    string;
}

function SectionCard({ icon: Icon, title, subtitle, children }: {
  icon:     React.ElementType;
  title:    string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-50 flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
          <Icon className="h-4.5 w-4.5 text-[#1e3a5f]" />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-900">{title}</p>
          <p className="text-xs text-slate-400">{subtitle}</p>
        </div>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

function AddUserView({ hospitals, onBack, onCreated }: {
  hospitals: Hospital[];
  onBack:    () => void;
  onCreated: (user: UserRow) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [employeeType, setEmployeeType] = useState<EmployeeType | null>(null);
  const [createdCreds, setCreatedCreds] = useState<{ email: string; password: string; name: string } | null>(null);
  const [passwordMode, setPasswordMode] = useState<'auto' | 'custom'>('auto');
  const [showPassword, setShowPassword] = useState(false);

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<AddForm>({
    defaultValues: {
      first_name: '', last_name: '', email: '',
      job_title: '', department: '', phone: '',
      hospital_id: '', role: '', password: '',
    },
  });

  function onSubmit(values: AddForm) {
    if (!values.hospital_id || !values.role || !employeeType) return;
    startTransition(async () => {
      const res = await createEmployee({
        first_name:    values.first_name,
        last_name:     values.last_name,
        email:         values.email,
        job_title:     values.job_title  || undefined,
        department:    values.department || undefined,
        phone:         values.phone      || undefined,
        hospital_id:   values.hospital_id,
        role:          values.role as AppRole,
        password:      passwordMode === 'custom' ? (values.password || undefined) : undefined,
        employee_type: employeeType,
      });
      if (res.success && res.data) {
        setCreatedCreds({
          email:    res.data.email,
          password: res.data.password,
          name:     res.data.full_name,
        });
        const newUser: UserRow = {
          id:           res.data.user_id,
          first_name:   values.first_name,
          last_name:    values.last_name,
          email:        values.email,
          job_title:    values.job_title   || null,
          department:   values.department  || null,
          avatar_url:   null,
          is_active:    true,
          created_at:   new Date().toISOString(),
          last_seen_at: null,
          roles: [{
            role:     values.role,
            hospital: hospitals.find(h => h.id === values.hospital_id) ?? null,
          }],
        };
        onCreated(newUser);
      } else {
        toast.error(res.error);
      }
    });
  }

  function copyCreds() {
    if (!createdCreds) return;
    navigator.clipboard.writeText(`Email: ${createdCreds.email}\nPassword: ${createdCreds.password}`);
    toast.success('Credentials copied to clipboard');
  }

  // ── Success screen ──────────────────────────────────────────
  if (createdCreds) {
    return (
      <div className="mt-6 max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-8 pt-10 pb-8 text-center bg-gradient-to-b from-emerald-50/80 to-white">
            <div className="h-16 w-16 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Account Created</h2>
            <p className="text-sm text-slate-500 mt-1">
              {createdCreds.name}&apos;s account is ready.
              {employeeType === 'new_onboard'
                ? ' They will be guided through onboarding on first login.'
                : ' Onboarding has been skipped — they have full access immediately.'}
            </p>
          </div>

          <div className="px-8 pb-8 space-y-4">
            <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium ${
              employeeType === 'new_onboard'
                ? 'bg-blue-50 text-blue-700'
                : 'bg-slate-50 text-slate-600'
            }`}>
              {employeeType === 'new_onboard'
                ? <><GraduationCap className="h-4 w-4 shrink-0" /> New Onboard — onboarding journey starts at first login</>
                : <><UserCheck className="h-4 w-4 shrink-0" /> Existing Employee — no onboarding required</>}
            </div>

            <div className="bg-slate-900 rounded-xl p-5 space-y-3">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Login Credentials — shown once</p>
              <div className="font-mono text-sm space-y-1.5">
                <div className="flex items-center gap-2 text-slate-300">
                  <Mail className="h-3.5 w-3.5 text-slate-500" />
                  <span className="text-white font-semibold">{createdCreds.email}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <KeyRound className="h-3.5 w-3.5 text-slate-500" />
                  <span className="text-white font-semibold">{createdCreds.password}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={copyCreds}
                className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-medium rounded-lg transition-colors"
              >
                <Copy className="h-3.5 w-3.5" /> Copy Credentials
              </button>
            </div>

            <div className="flex justify-center gap-3 pt-2">
              <Button variant="outline" onClick={() => {
                setCreatedCreds(null);
                setEmployeeType(null);
              }}>
                <UserPlus className="h-4 w-4 mr-1.5" /> Add Another
              </Button>
              <Button onClick={onBack} className="bg-[#1e3a5f] hover:bg-[#162d4f]">
                Back to User List
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Form screen ─────────────────────────────────────────────
  return (
    <div className="mt-6">
      {/* Page header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors font-medium shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
          User Management
        </button>
        <div className="h-5 w-px bg-slate-200" />
        <div>
          <h2 className="text-lg font-bold text-slate-900 leading-tight">Add New User</h2>
          <p className="text-xs text-slate-400">Create a system account for a staff member</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 lg:grid-cols-3 gap-6 pb-10">
        {/* ── Left column: form sections ─────────────────────── */}
        <div className="lg:col-span-2 space-y-6">

          {/* Employee Type */}
          <SectionCard icon={Sparkles} title="Employee Type" subtitle="Determines whether this person goes through onboarding">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setEmployeeType('new_onboard')}
                className={`text-left rounded-2xl border-2 p-5 transition-all ${
                  employeeType === 'new_onboard'
                    ? 'border-[#1e3a5f] bg-blue-50/60 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center mb-3 ${
                  employeeType === 'new_onboard' ? 'bg-[#1e3a5f]' : 'bg-slate-100'
                }`}>
                  <GraduationCap className={`h-5 w-5 ${employeeType === 'new_onboard' ? 'text-white' : 'text-slate-400'}`} />
                </div>
                <p className="text-sm font-bold text-slate-900">New Onboard</p>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  New hire — guided through the onboarding journey on first login before accessing the dashboard.
                </p>
                {employeeType === 'new_onboard' && (
                  <span className="inline-flex items-center gap-1 mt-3 text-[11px] font-semibold text-[#1e3a5f]">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Selected
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setEmployeeType('existing')}
                className={`text-left rounded-2xl border-2 p-5 transition-all ${
                  employeeType === 'existing'
                    ? 'border-[#1e3a5f] bg-blue-50/60 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center mb-3 ${
                  employeeType === 'existing' ? 'bg-[#1e3a5f]' : 'bg-slate-100'
                }`}>
                  <UserCheck className={`h-5 w-5 ${employeeType === 'existing' ? 'text-white' : 'text-slate-400'}`} />
                </div>
                <p className="text-sm font-bold text-slate-900">Existing Employee</p>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Already part of the team — skips onboarding and gets full dashboard access immediately.
                </p>
                {employeeType === 'existing' && (
                  <span className="inline-flex items-center gap-1 mt-3 text-[11px] font-semibold text-[#1e3a5f]">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Selected
                  </span>
                )}
              </button>
            </div>
          </SectionCard>

          {/* Personal Information */}
          <SectionCard icon={UserPen} title="Personal Information" subtitle="Basic identity and contact details">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>First Name <span className="text-red-500">*</span></Label>
                  <Input placeholder="e.g. Sarah" {...register('first_name', { required: true })} />
                  {errors.first_name && <p className="text-xs text-red-500">First name is required</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Last Name <span className="text-red-500">*</span></Label>
                  <Input placeholder="e.g. Johnson" {...register('last_name', { required: true })} />
                  {errors.last_name && <p className="text-xs text-red-500">Last name is required</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-slate-400" /> Email <span className="text-red-500">*</span></Label>
                  <Input type="email" placeholder="name@hospital.com" {...register('email', { required: true })} />
                  {errors.email && <p className="text-xs text-red-500">Email is required</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-slate-400" /> Phone</Label>
                  <Input placeholder="+1 (555) 000-0000" {...register('phone')} />
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Work Details */}
          <SectionCard icon={Briefcase} title="Work Details" subtitle="Position and department within the hospital">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Job Title</Label>
                <Input placeholder="e.g. Veterinary Technician" {...register('job_title')} />
              </div>
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Input placeholder="e.g. Surgery" {...register('department')} />
              </div>
            </div>
          </SectionCard>

          {/* Access & Role */}
          <SectionCard icon={Shield} title="Access & Role" subtitle="Hospital assignment, system role, and login password">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5 min-w-0">
                  <Label>Hospital <span className="text-red-500">*</span></Label>
                  <Select
                    value={watch('hospital_id')}
                    onValueChange={v => setValue('hospital_id', v ?? '')}
                    items={hospitals.map(h => ({ value: h.id, label: h.name }))}
                  >
                    <SelectTrigger className="w-full max-w-full overflow-hidden [&>span]:truncate [&>span]:block">
                      <SelectValue placeholder="Select hospital…" />
                    </SelectTrigger>
                    <SelectContent>
                      {hospitals.map(h => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 min-w-0">
                  <Label>Role <span className="text-red-500">*</span></Label>
                  <Select
                    value={watch('role')}
                    onValueChange={v => setValue('role', v as AppRole)}
                    items={ALL_ROLES.map(r => ({ value: r, label: ROLE_LABELS[r] }))}
                  >
                    <SelectTrigger className="w-full max-w-full overflow-hidden [&>span]:truncate [&>span]:block">
                      <SelectValue placeholder="Select role…" />
                    </SelectTrigger>
                    <SelectContent>
                      {ALL_ROLES.map(r => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* Password mode */}
              <div className="space-y-3">
                <Label className="flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5 text-slate-400" /> Password
                </Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPasswordMode('auto')}
                    className={`text-left rounded-xl border-2 p-3.5 transition-all ${
                      passwordMode === 'auto'
                        ? 'border-[#1e3a5f] bg-blue-50/60 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center mb-2 ${
                      passwordMode === 'auto' ? 'bg-[#1e3a5f]' : 'bg-slate-100'
                    }`}>
                      <Wand2 className={`h-4 w-4 ${passwordMode === 'auto' ? 'text-white' : 'text-slate-400'}`} />
                    </div>
                    <p className="text-sm font-semibold text-slate-900">Auto-Generate</p>
                    <p className="text-xs text-slate-400 mt-0.5">Secure random password</p>
                    {passwordMode === 'auto' && (
                      <span className="inline-flex items-center gap-1 mt-2 text-[11px] font-semibold text-[#1e3a5f]">
                        <CheckCircle2 className="h-3 w-3" /> Selected
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPasswordMode('custom')}
                    className={`text-left rounded-xl border-2 p-3.5 transition-all ${
                      passwordMode === 'custom'
                        ? 'border-[#1e3a5f] bg-blue-50/60 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center mb-2 ${
                      passwordMode === 'custom' ? 'bg-[#1e3a5f]' : 'bg-slate-100'
                    }`}>
                      <KeyRound className={`h-4 w-4 ${passwordMode === 'custom' ? 'text-white' : 'text-slate-400'}`} />
                    </div>
                    <p className="text-sm font-semibold text-slate-900">Set Password</p>
                    <p className="text-xs text-slate-400 mt-0.5">Create your own password</p>
                    {passwordMode === 'custom' && (
                      <span className="inline-flex items-center gap-1 mt-2 text-[11px] font-semibold text-[#1e3a5f]">
                        <CheckCircle2 className="h-3 w-3" /> Selected
                      </span>
                    )}
                  </button>
                </div>

                {passwordMode === 'auto' ? (
                  <div className="flex items-center gap-2 px-3.5 py-2.5 bg-emerald-50 rounded-xl border border-emerald-100 text-xs text-emerald-700">
                    <Sparkles className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    A strong, unique password will be generated automatically and shown once after account creation.
                  </div>
                ) : (
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter a password…"
                      {...register('password')}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors"
                    >
                      {showPassword
                        ? <EyeOff className="h-4 w-4" />
                        : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </SectionCard>
        </div>

        {/* ── Right column: summary + submit ─────────────────── */}
        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-6 space-y-4">
            <div className="bg-gradient-to-br from-[#1e3a5f] to-[#2563eb] rounded-2xl p-6 text-white shadow-md">
              <div className="h-10 w-10 rounded-xl bg-white/15 flex items-center justify-center mb-4">
                <UserPlus className="h-5 w-5 text-white" />
              </div>
              <p className="text-sm font-bold">Account Summary</p>
              <div className="mt-4 space-y-2.5 text-[13px]">
                <div className="flex justify-between gap-2">
                  <span className="text-blue-200">Name</span>
                  <span className="font-medium text-right truncate">
                    {(watch('first_name') || watch('last_name'))
                      ? `${watch('first_name')} ${watch('last_name')}`.trim()
                      : '—'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-blue-200">Type</span>
                  <span className="font-medium text-right">
                    {employeeType === 'new_onboard' ? 'New Onboard' :
                     employeeType === 'existing'    ? 'Existing'    : '—'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-blue-200">Hospital</span>
                  <span className="font-medium text-right truncate">
                    {hospitals.find(h => h.id === watch('hospital_id'))?.name ?? '—'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-blue-200">Role</span>
                  <span className="font-medium text-right">
                    {watch('role') ? ROLE_LABELS[watch('role') as AppRole] : '—'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-blue-200">Onboarding</span>
                  <span className="font-medium text-right">
                    {employeeType === 'new_onboard' ? 'Required' :
                     employeeType === 'existing'    ? 'Skipped'  : '—'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-blue-200">Password</span>
                  <span className="font-medium text-right">
                    {passwordMode === 'auto' ? 'Auto-generate' : 'Custom'}
                  </span>
                </div>
              </div>
            </div>

            {!employeeType && (
              <div className="flex items-start gap-2.5 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
                <Sparkles className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 leading-relaxed">
                  Select an <strong>Employee Type</strong> first — it controls whether this person goes through onboarding.
                </p>
              </div>
            )}

            <Button
              type="submit"
              disabled={isPending || !employeeType || !watch('hospital_id') || !watch('role')}
              className="w-full h-11 bg-[#1e3a5f] hover:bg-[#162d4f] text-sm font-semibold rounded-xl"
            >
              {isPending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating Account…</>
                : <><UserPlus className="h-4 w-4 mr-2" /> Create User Account</>}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
              className="w-full h-10 rounded-xl"
            >
              Cancel
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

// ── ConfirmDeleteModal ────────────────────────────────────────

function ConfirmDeleteModal({ user, onClose, onDeleted }: {
  user:      UserRow;
  onClose:   () => void;
  onDeleted: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteUserProfile(user.id);
      if (res.success) {
        toast.success(`${user.first_name} ${user.last_name} deleted`);
        onDeleted();
      } else {
        toast.error(res.error ?? 'Failed to delete');
        onClose();
      }
    });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" /> Delete User
          </DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-3 py-2">
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarImage src={user.avatar_url ?? undefined} />
            <AvatarFallback className="text-sm bg-red-100 text-red-700 font-semibold">
              {user.first_name?.[0]}{user.last_name?.[0]}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold text-slate-900">{user.first_name} {user.last_name}</p>
            <p className="text-xs text-slate-400">{user.email}</p>
          </div>
        </div>
        <div className="px-4 py-3 bg-red-50 rounded-xl border border-red-100 text-sm text-red-700">
          This will <strong>permanently delete</strong> the user account, all roles, and associated data. This action cannot be undone.
        </div>
        <div className="flex justify-end gap-3 pt-1">
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button
            onClick={handleDelete}
            disabled={isPending}
            className="bg-red-600 hover:bg-red-700 gap-1.5"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete Permanently
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── NewUsersPanel ─────────────────────────────────────────────

function NewUsersPanel({ users, currentUserRole, onSent, onDeleted }: {
  users:            NewUserRow[];
  currentUserRole?: AppRole | null;
  onSent:           (sentIds: string[]) => void;
  onDeleted:        (id: string) => void;
}) {
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [isPending, startTransition]  = useTransition();
  const [deletingId, setDeletingId]   = useState<string | null>(null);

  const canHRManageNew = currentUserRole
    ? ['super_admin','org_admin','hospital_admin','practice_manager','hr'].includes(currentUserRole)
    : false;

  function handleDelete(userId: string) {
    if (!window.confirm('Permanently delete this user? This cannot be undone.')) return;
    setDeletingId(userId);
    startTransition(async () => {
      const res = await deleteUserProfile(userId);
      if (res.success) {
        toast.success('User deleted');
        onDeleted(userId);
      } else {
        toast.error(res.error ?? 'Failed to delete');
      }
      setDeletingId(null);
    });
  }

  const toggleOne = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const allSelected = users.length > 0 && selected.size === users.length;

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(users.map(u => u.id)));

  function handleSend() {
    if (selected.size === 0) return;
    const ids = [...selected];
    startTransition(async () => {
      const res = await sendUsersToOnboarding(ids);
      if (res.success) {
        toast.success(`${res.created} user${res.created !== 1 ? 's' : ''} sent to onboarding`);
        onSent(ids);
        setSelected(new Set());
      } else {
        toast.error(res.error ?? 'Failed to send to onboarding');
      }
    });
  }

  if (users.length === 0) {
    return (
      <div className="text-center py-14 space-y-3">
        <div className="h-14 w-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-7 w-7 text-emerald-500" />
        </div>
        <p className="text-slate-700 font-semibold">All users are in onboarding</p>
        <p className="text-sm text-slate-400">No pending users to send.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          type="button"
          onClick={toggleAll}
          className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 font-medium"
        >
          <div className={`h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
            allSelected
              ? 'bg-[#1e3a5f] border-[#1e3a5f]'
              : selected.size > 0
                ? 'border-[#1e3a5f] bg-blue-50'
                : 'border-slate-300 bg-white'
          }`}>
            {(allSelected || selected.size > 0) && (
              <Check className="h-3 w-3 text-[#1e3a5f]" style={{ color: allSelected ? 'white' : '#1e3a5f' }} />
            )}
          </div>
          {allSelected ? 'Deselect All' : 'Select All'}
          {selected.size > 0 && (
            <span className="ml-1 text-xs text-slate-400">({selected.size} selected)</span>
          )}
        </button>

        <Button
          size="sm"
          disabled={selected.size === 0 || isPending}
          onClick={handleSend}
          className="gap-1.5 bg-[#1e3a5f] hover:bg-[#162d4f] h-9"
        >
          {isPending ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
          ) : (
            <><SendHorizonal className="h-4 w-4" /> Send to Onboarding{selected.size > 0 ? ` (${selected.size})` : ''}</>
          )}
        </Button>
      </div>

      {/* User rows */}
      <div className="space-y-2">
        {users.map(u => {
          const isSel = selected.has(u.id);
          return (
            <div
              key={u.id}
              onClick={() => toggleOne(u.id)}
              className={`flex items-center gap-4 px-4 py-3.5 rounded-xl border-2 cursor-pointer transition-all select-none ${
                isSel
                  ? 'border-[#1e3a5f] bg-blue-50/50 shadow-sm'
                  : 'border-slate-100 bg-white hover:border-slate-200'
              }`}
            >
              {/* Checkbox */}
              <div className={`h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                isSel ? 'bg-[#1e3a5f] border-[#1e3a5f]' : 'border-slate-300 bg-white'
              }`}>
                {isSel && <Check className="h-3 w-3 text-white" />}
              </div>

              {/* Avatar */}
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarImage src={u.avatar_url ?? undefined} />
                <AvatarFallback className="text-xs bg-violet-100 text-violet-700 font-semibold">
                  {u.first_name?.[0]}{u.last_name?.[0]}
                </AvatarFallback>
              </Avatar>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900 text-sm">
                  {u.first_name} {u.last_name}
                </p>
                <p className="text-xs text-slate-400 truncate">{u.email}</p>
                {u.job_title && (
                  <p className="text-[11px] text-slate-400">{u.job_title}</p>
                )}
              </div>

              {/* Hospital badge */}
              {u.primary_hospital_name && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: u.primary_hospital_color ?? '#94a3b8' }}
                  />
                  <span className="text-xs text-slate-500">{u.primary_hospital_name}</span>
                </div>
              )}

              {/* Joined */}
              <p className="text-xs text-slate-400 shrink-0 hidden md:block">
                Joined {format(new Date(u.created_at), 'MMM d, yyyy')}
              </p>

              {/* Delete */}
              {canHRManageNew && (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); handleDelete(u.id); }}
                  disabled={deletingId === u.id}
                  className="shrink-0 p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                  title="Delete user"
                >
                  {deletingId === u.id
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Trash2 className="h-4 w-4" />}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer note */}
      <div className="flex items-start gap-2 px-4 py-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700">
        <GraduationCap className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>
          Sending users to onboarding will create an onboarding record. They will be guided through the
          onboarding journey on their next login.
        </span>
      </div>
    </div>
  );
}
