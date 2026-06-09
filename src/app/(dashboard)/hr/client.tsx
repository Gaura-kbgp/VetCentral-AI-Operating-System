'use client';

import { useState } from 'react';
import { Users, UserPlus, ShieldAlert } from 'lucide-react';
import { EmployeeList }    from '@/components/hr/employee-list';
import { NewEmployeeForm } from '@/components/hr/new-employee-form';
import type { EmployeeRow } from '@/lib/actions/hr';

interface Hospital { id: string; name: string; color: string | null; }

type Tab = 'employees' | 'add';

interface Props {
  employees: EmployeeRow[];
  hospitals: Hospital[];
}

export default function HRClient({ employees, hospitals }: Props) {
  const [tab, setTab] = useState<Tab>('employees');
  const [localEmployees, setLocalEmployees] = useState(employees);

  const tabs = [
    { id: 'employees' as Tab, label: 'All Employees', icon: Users,    count: employees.length },
    { id: 'add'       as Tab, label: 'Add Employee',  icon: UserPlus, count: null },
  ];

  // Stats
  const active   = employees.filter(e => e.is_active).length;
  const inactive = employees.filter(e => !e.is_active).length;
  const roleSet  = new Set(employees.flatMap(e => e.roles.map(r => r.role)));

  return (
    <div className="flex-1 overflow-auto px-6 py-6 space-y-6">

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Employees" value={employees.length} color="blue" />
        <StatCard label="Active Accounts" value={active}           color="emerald" />
        <StatCard label="Roles in Use"    value={roleSet.size}     color="violet" />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {tabs.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all
                ${active
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
                }
              `}
            >
              <Icon className="h-4 w-4" />
              {t.label}
              {t.count != null && (
                <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                  active ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-500'
                }`}>
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {tab === 'employees' && (
        <EmployeeList initialEmployees={localEmployees} hospitals={hospitals} />
      )}

      {tab === 'add' && (
        <div>
          <div className="mb-6">
            <h2 className="text-[16px] font-bold text-gray-900">New Employee Account</h2>
            <p className="text-[13px] text-gray-500 mt-0.5">
              Create a system account for a new staff member. Their login credentials will be shown once after creation.
            </p>
          </div>
          <NewEmployeeForm
            hospitals={hospitals}
            onCreated={() => setTab('employees')}
          />
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: 'blue' | 'emerald' | 'violet' }) {
  const styles = {
    blue:    { bg: 'bg-blue-50',    border: 'border-blue-100',    text: 'text-blue-700',    num: 'text-blue-900'    },
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-100', text: 'text-emerald-700', num: 'text-emerald-900' },
    violet:  { bg: 'bg-violet-50',  border: 'border-violet-100',  text: 'text-violet-700',  num: 'text-violet-900'  },
  }[color];

  return (
    <div className={`rounded-2xl border px-5 py-4 ${styles.bg} ${styles.border}`}>
      <p className={`text-[11px] font-bold uppercase tracking-wider ${styles.text}`}>{label}</p>
      <p className={`text-[28px] font-black mt-1 ${styles.num}`}>{value}</p>
    </div>
  );
}
