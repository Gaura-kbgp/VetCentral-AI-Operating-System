'use client';

import { useState, useTransition } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectGroup, SelectItem,
  SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Search, Building2, ShieldAlert, CheckCircle2, XCircle,
  ChevronDown, ChevronUp, UserCheck, UserX, Loader2, Filter,
} from 'lucide-react';
import { assignRoleToEmployee, toggleEmployeeStatus } from '@/lib/actions/hr';
import type { EmployeeRow } from '@/lib/actions/hr';
import type { AppRole } from '@/types/database';

const ROLE_OPTIONS: { value: AppRole; label: string; group: string }[] = [
  { value: 'hospital_admin',   label: 'Hospital Admin',   group: 'Management' },
  { value: 'practice_manager', label: 'Practice Manager', group: 'Management' },
  { value: 'doctor',           label: 'Doctor',           group: 'Clinical' },
  { value: 'hr',               label: 'HR',               group: 'Operations' },
  { value: 'csr',              label: 'CSR',              group: 'Operations' },
  { value: 'va',               label: 'VA',               group: 'Operations' },
  { value: 'marketing',        label: 'Marketing',        group: 'Operations' },
  { value: 'it_admin',         label: 'IT Admin',         group: 'Technical' },
  { value: 'viewer',           label: 'Viewer',           group: 'Other' },
];
const ROLE_GROUPS = ['Management', 'Clinical', 'Operations', 'Technical', 'Other'];

const ROLE_COLOR: Record<string, string> = {
  super_admin:     '#6366F1', org_admin: '#8B5CF6', hospital_admin: '#3B82F6',
  practice_manager:'#0EA5E9', doctor: '#10B981',    hr: '#F59E0B',
  csr: '#14B8A6', va: '#64748B', marketing: '#EC4899', it_admin: '#EF4444',
  viewer: '#94A3B8',
};

interface Hospital { id: string; name: string; color: string | null; }

interface Props {
  initialEmployees: EmployeeRow[];
  hospitals: Hospital[];
}

export function EmployeeList({ initialEmployees, hospitals }: Props) {
  const [employees, setEmployees] = useState(initialEmployees);
  const [search, setSearch]       = useState('');
  const [filterHosp, setFilterHosp] = useState('all');
  const [filterRole, setFilterRole] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [actionId, setActionId]   = useState<string | null>(null);

  const hospitalMap = new Map(hospitals.map(h => [h.id, h]));

  const filtered = employees.filter(emp => {
    const name  = `${emp.first_name} ${emp.last_name} ${emp.email}`.toLowerCase();
    const matchSearch = !search || name.includes(search.toLowerCase());
    const matchHosp   = filterHosp === 'all' || emp.roles.some(r => r.hospital?.id === filterHosp);
    const matchRole   = filterRole === 'all' || emp.roles.some(r => r.role === filterRole);
    return matchSearch && matchHosp && matchRole;
  });

  function getInitials(emp: EmployeeRow) {
    return `${emp.first_name[0] ?? ''}${emp.last_name[0] ?? ''}`.toUpperCase();
  }

  function handleToggleStatus(emp: EmployeeRow) {
    setActionId(emp.id);
    startTransition(async () => {
      const result = await toggleEmployeeStatus(emp.id, !emp.is_active);
      if (result.success) {
        setEmployees(es => es.map(e => e.id === emp.id ? { ...e, is_active: !e.is_active } : e));
      }
      setActionId(null);
    });
  }

  // ── Role assignment state per employee ────────────────────────────────────
  const [roleAssign, setRoleAssign] = useState<Record<string, { hospital: string; role: AppRole | '' }>>({});

  function handleAssignRole(empId: string) {
    const assign = roleAssign[empId];
    if (!assign?.hospital || !assign?.role) return;
    setActionId(empId + '_role');
    startTransition(async () => {
      const result = await assignRoleToEmployee(empId, assign.hospital, assign.role as AppRole);
      if (result.success) {
        const hospital = hospitalMap.get(assign.hospital) ?? null;
        setEmployees(es => es.map(e => {
          if (e.id !== empId) return e;
          const existing = e.roles.filter(r => r.hospital?.id !== assign.hospital);
          return {
            ...e,
            roles: [...existing, {
              role: assign.role as AppRole,
              hospital: hospital ? { id: hospital.id, name: hospital.name, color: hospital.color } : null,
            }],
          };
        }));
        setRoleAssign(r => ({ ...r, [empId]: { hospital: '', role: '' } }));
      }
      setActionId(null);
    });
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name or email…"
            className="pl-9 h-10 text-[13px]" />
        </div>

        <Select value={filterHosp} onValueChange={v => v && setFilterHosp(v)}>
          <SelectTrigger className="h-10 text-[13px] w-48">
            <div className="flex items-center gap-2">
              <Building2 className="h-3.5 w-3.5 text-gray-400" />
              <SelectValue placeholder="All hospitals" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All hospitals</SelectItem>
            {hospitals.map(h => (
              <SelectItem key={h.id} value={h.id} className="text-[13px]">{h.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterRole} onValueChange={v => v && setFilterRole(v)}>
          <SelectTrigger className="h-10 text-[13px] w-44">
            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-gray-400" />
              <SelectValue placeholder="All roles" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {ROLE_OPTIONS.map(r => (
              <SelectItem key={r.value} value={r.value} className="text-[13px]">{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="text-[12px] text-gray-400 font-medium ml-auto">
          {filtered.length} employee{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Employee cards */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
            <Search className="h-6 w-6 text-gray-300" />
          </div>
          <p className="text-[14px] font-semibold text-gray-400">No employees found</p>
          <p className="text-[12px] text-gray-300 mt-1">Try adjusting your filters</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(emp => {
            const isExpanded = expandedId === emp.id;
            const assignState = roleAssign[emp.id] ?? { hospital: '', role: '' };

            return (
              <div key={emp.id}
                className={`bg-white rounded-2xl border transition-shadow ${
                  isExpanded ? 'border-blue-200 shadow-md' : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                }`}>
                {/* Row */}
                <div className="flex items-center gap-4 px-5 py-4">
                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white text-[12px] font-bold ${
                    emp.is_active ? 'bg-blue-600' : 'bg-gray-300'
                  }`}>
                    {getInitials(emp)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[14px] font-semibold text-gray-900">
                        {emp.first_name} {emp.last_name}
                      </span>
                      {!emp.is_active && (
                        <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                          Inactive
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="text-[12px] text-gray-500">{emp.email}</span>
                      {emp.job_title && (
                        <span className="text-[12px] text-gray-400">· {emp.job_title}</span>
                      )}
                    </div>
                  </div>

                  {/* Role chips */}
                  <div className="hidden lg:flex items-center gap-1.5 flex-wrap max-w-48">
                    {emp.roles.slice(0, 2).map((r, i) => (
                      <span key={i} className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg border"
                        style={{
                          backgroundColor: `${ROLE_COLOR[r.role] ?? '#94A3B8'}15`,
                          borderColor:     `${ROLE_COLOR[r.role] ?? '#94A3B8'}30`,
                          color:           ROLE_COLOR[r.role] ?? '#94A3B8',
                        }}>
                        {r.role.replace('_', ' ')}
                      </span>
                    ))}
                    {emp.roles.length > 2 && (
                      <span className="text-[10px] text-gray-400">+{emp.roles.length - 2}</span>
                    )}
                  </div>

                  {/* Expand */}
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : emp.id)}
                    className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-5 py-4 space-y-5 bg-gray-50/50 rounded-b-2xl">

                    {/* All roles */}
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">Current Roles & Hospitals</p>
                      {emp.roles.length === 0 ? (
                        <p className="text-[13px] text-gray-400">No roles assigned yet</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {emp.roles.map((r, i) => (
                            <div key={i} className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm">
                              <span className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: r.hospital?.color ?? ROLE_COLOR[r.role] ?? '#94A3B8' }} />
                              <div>
                                <p className="text-[12px] font-semibold text-gray-700">{r.role.replace(/_/g, ' ')}</p>
                                <p className="text-[10px] text-gray-400">{r.hospital?.name ?? 'No hospital'}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Assign new role */}
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">Assign / Update Role</p>
                      <div className="flex gap-2 flex-wrap">
                        <Select value={assignState.hospital}
                          onValueChange={v => v && setRoleAssign(r => ({ ...r, [emp.id]: { ...assignState, hospital: v } }))}>
                          <SelectTrigger className="h-9 text-[12px] w-44">
                            <span className={assignState.hospital ? 'text-gray-900 text-[12px]' : 'text-gray-400 text-[12px]'}>
                              {assignState.hospital
                                ? (hospitals.find(h => h.id === assignState.hospital)?.name ?? 'Hospital')
                                : 'Select hospital'}
                            </span>
                          </SelectTrigger>
                          <SelectContent>
                            {hospitals.map(h => (
                              <SelectItem key={h.id} value={h.id} className="text-[12px]">{h.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Select value={assignState.role}
                          onValueChange={v => v && setRoleAssign(r => ({ ...r, [emp.id]: { ...assignState, role: v as AppRole } }))}>
                          <SelectTrigger className="h-9 text-[12px] w-40">
                            <span className={assignState.role ? 'text-gray-900 text-[12px]' : 'text-gray-400 text-[12px]'}>
                              {assignState.role
                                ? (ROLE_OPTIONS.find(r => r.value === assignState.role)?.label ?? assignState.role)
                                : 'Select role'}
                            </span>
                          </SelectTrigger>
                          <SelectContent className="min-w-44">
                            {ROLE_GROUPS.map(group => (
                              <SelectGroup key={group}>
                                <SelectLabel className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-0.5">
                                  {group}
                                </SelectLabel>
                                {ROLE_OPTIONS.filter(r => r.group === group).map(r => (
                                  <SelectItem key={r.value} value={r.value} className="text-[12px]">{r.label}</SelectItem>
                                ))}
                              </SelectGroup>
                            ))}
                          </SelectContent>
                        </Select>

                        <Button
                          type="button"
                          size="sm"
                          disabled={!assignState.hospital || !assignState.role || actionId === emp.id + '_role'}
                          onClick={() => handleAssignRole(emp.id)}
                          className="h-9 text-[12px] gap-1.5"
                        >
                          {actionId === emp.id + '_role'
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <ShieldAlert className="h-3.5 w-3.5" />
                          }
                          Assign Role
                        </Button>
                      </div>
                    </div>

                    {/* Status toggle */}
                    <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                      <div>
                        <p className="text-[12px] font-semibold text-gray-600">Account Status</p>
                        <p className="text-[11px] text-gray-400">
                          {emp.is_active ? 'Employee can log in and use the system' : 'Account is deactivated — employee cannot log in'}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={actionId === emp.id}
                        onClick={() => handleToggleStatus(emp)}
                        className={`h-9 text-[12px] gap-1.5 ${
                          emp.is_active
                            ? 'border-red-200 text-red-600 hover:bg-red-50'
                            : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                        }`}
                      >
                        {actionId === emp.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : emp.is_active ? (
                          <><UserX className="h-3.5 w-3.5" />Deactivate</>
                        ) : (
                          <><UserCheck className="h-3.5 w-3.5" />Activate</>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
