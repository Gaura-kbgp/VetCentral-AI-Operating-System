'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { formatDistanceToNow, format } from 'date-fns';
import {
  Search, Users, CheckCircle2, XCircle, MoreHorizontal,
  UserPen, Shield, PowerOff, Power, UserPlus, X, Building2,
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
import { updateUserProfile, assignRole, removeRole, setUserActive } from '@/lib/actions/users';
import { createEmployee } from '@/lib/actions/hr';
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
  users:         UserRow[];
  hospitals:     Hospital[];
  currentUserId: string;
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

export default function UsersAdmin({ users: initialUsers, hospitals, currentUserId }: Props) {
  const [users, setUsers]             = useState<UserRow[]>(initialUsers);
  const [search, setSearch]           = useState('');
  const [hospitalFilter, setHospital] = useState('all');
  const [statusFilter, setStatus]     = useState('all');
  const [editUser, setEditUser]       = useState<UserRow | null>(null);
  const [roleUser, setRoleUser]       = useState<UserRow | null>(null);
  const [showAdd, setShowAdd]         = useState(false);

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

      {/* Toolbar */}
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
                onEdit={() => setEditUser(u)}
                onAssignRole={() => setRoleUser(u)}
                onToggleStatus={async () => {
                  const res = await setUserActive(u.id, !u.is_active);
                  if (res.success) {
                    patchUser(u.id, { is_active: !u.is_active });
                    toast.success(u.is_active ? 'User deactivated' : 'User activated');
                  } else {
                    toast.error(res.error);
                  }
                }}
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

      {showAdd && (
        <AddUserModal
          hospitals={hospitals}
          onClose={() => setShowAdd(false)}
          onCreated={(newUser) => {
            setUsers(prev => [newUser, ...prev]);
            setShowAdd(false);
          }}
        />
      )}
    </div>
  );
}

// ── UserTableRow ──────────────────────────────────────────────

function UserTableRow({ user: u, isSelf, onEdit, onAssignRole, onToggleStatus }: {
  user:           UserRow;
  hospitals:      Hospital[];
  isSelf:         boolean;
  onEdit:         () => void;
  onAssignRole:   () => void;
  onToggleStatus: () => Promise<void>;
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
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={onEdit} className="gap-2 cursor-pointer">
              <UserPen className="h-4 w-4" /> Edit Details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onAssignRole} className="gap-2 cursor-pointer">
              <Shield className="h-4 w-4" /> Assign Role
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 cursor-pointer"
              onClick={() => startTransition(onToggleStatus)}
            >
              {u.is_active ? (
                <><PowerOff className="h-4 w-4 text-red-500" /><span className="text-red-600">Deactivate</span></>
              ) : (
                <><Power className="h-4 w-4 text-green-600" /><span className="text-green-700">Activate</span></>
              )}
            </DropdownMenuItem>
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

// ── AddUserModal ──────────────────────────────────────────────

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

function AddUserModal({ hospitals, onClose, onCreated }: {
  hospitals:  Hospital[];
  onClose:    () => void;
  onCreated:  (user: UserRow) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [createdCreds, setCreatedCreds] = useState<{ email: string; password: string } | null>(null);

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<AddForm>({
    defaultValues: {
      first_name: '', last_name: '', email: '',
      job_title: '', department: '', phone: '',
      hospital_id: '', role: '', password: '',
    },
  });

  function onSubmit(values: AddForm) {
    if (!values.hospital_id || !values.role) return;
    startTransition(async () => {
      const res = await createEmployee({
        first_name:  values.first_name,
        last_name:   values.last_name,
        email:       values.email,
        job_title:   values.job_title  || undefined,
        department:  values.department || undefined,
        phone:       values.phone      || undefined,
        hospital_id: values.hospital_id,
        role:        values.role as AppRole,
        password:    values.password   || undefined,
      });
      if (res.success && res.data) {
        setCreatedCreds({ email: res.data.email, password: res.data.password });
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

  if (createdCreds) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-700">
              <CheckCircle2 className="h-5 w-5" /> User Created
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-slate-600">Share these credentials with the new user. The password will not be shown again.</p>
            <div className="bg-slate-50 rounded-lg p-4 space-y-2 font-mono text-sm">
              <div><span className="text-slate-400">Email: </span><span className="font-semibold">{createdCreds.email}</span></div>
              <div><span className="text-slate-400">Pass:  </span><span className="font-semibold">{createdCreds.password}</span></div>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-slate-500" />
            Add New User
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-1">
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
            <Label>Email <span className="text-red-500">*</span></Label>
            <Input type="email" {...register('email', { required: true })} />
            {errors.email && <p className="text-xs text-red-500">Required</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Job Title</Label>
              <Input placeholder="e.g. Vet Tech" {...register('job_title')} />
            </div>
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Input placeholder="e.g. Surgery" {...register('department')} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input placeholder="+1 (555) 000-0000" {...register('phone')} />
          </div>

          <Separator />

          <div className="space-y-1.5">
            <Label>Hospital <span className="text-red-500">*</span></Label>
            <Select
              value={watch('hospital_id')}
              onValueChange={v => setValue('hospital_id', v ?? '')}
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
              value={watch('role')}
              onValueChange={v => setValue('role', v as AppRole)}
              items={ALL_ROLES.map(r => ({ value: r, label: ROLE_LABELS[r] }))}
            >
              <SelectTrigger><SelectValue placeholder="Select role…" /></SelectTrigger>
              <SelectContent>
                {ALL_ROLES.map(r => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Password <span className="text-xs text-slate-400">(leave blank to auto-generate)</span></Label>
            <Input type="text" placeholder="Auto-generated if empty" {...register('password')} />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              type="submit"
              disabled={isPending || !watch('hospital_id') || !watch('role')}
            >
              {isPending ? 'Creating…' : 'Create User'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
