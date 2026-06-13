'use client';

import { useState } from 'react';
import { Users, UserPlus, Clock, CheckCircle2 } from 'lucide-react';
import { EmployeeList }    from '@/components/hr/employee-list';
import { NewEmployeeList } from '@/components/hr/new-employee-list';
import type { EmployeeRow, OnboardingEmployeeRow } from '@/lib/actions/hr';

interface Hospital { id: string; name: string; color: string | null; }

type Tab = 'employees' | 'new-employees';

interface Props {
  employees:    EmployeeRow[];
  newEmployees: OnboardingEmployeeRow[];
  hospitals:    Hospital[];
}

export default function HRClient({ employees, newEmployees, hospitals }: Props) {
  const [tab, setTab] = useState<Tab>('new-employees');

  const active   = employees.filter(e => e.is_active).length;
  const roleSet  = new Set(employees.flatMap(e => e.roles.map(r => r.role)));

  const tabs = [
    { id: 'new-employees' as Tab, label: 'New Employees', icon: UserPlus,  count: newEmployees.length },
    { id: 'employees'     as Tab, label: 'All Employees', icon: Users,     count: employees.length    },
  ];

  return (
    <div className="flex-1 overflow-auto px-6 py-6 space-y-6">

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total Employees"  value={employees.length}  color="blue"    />
        <StatCard label="Active Accounts"  value={active}            color="emerald" />
        <StatCard label="In Onboarding"    value={newEmployees.length} color="amber" />
        <StatCard label="Roles in Use"     value={roleSet.size}      color="violet"  />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {tabs.map(t => {
          const Icon   = t.icon;
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all
                ${isActive
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
                }
              `}
            >
              <Icon className="h-4 w-4" />
              {t.label}
              {t.count != null && (
                <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                  isActive ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-500'
                }`}>
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {tab === 'new-employees' && (
        <NewEmployeeList employees={newEmployees} hospitals={hospitals} />
      )}
      {tab === 'employees' && (
        <EmployeeList initialEmployees={employees} hospitals={hospitals} />
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: 'blue' | 'emerald' | 'violet' | 'amber' }) {
  const colors = {
    blue:    { bg: 'bg-blue-50',   text: 'text-blue-700',   val: 'text-blue-900'   },
    emerald: { bg: 'bg-emerald-50',text: 'text-emerald-700',val: 'text-emerald-900' },
    violet:  { bg: 'bg-violet-50', text: 'text-violet-700', val: 'text-violet-900'  },
    amber:   { bg: 'bg-amber-50',  text: 'text-amber-700',  val: 'text-amber-900'   },
  };
  const c = colors[color];
  return (
    <div className={`${c.bg} rounded-xl p-4 border border-white`}>
      <p className={`text-2xl font-bold ${c.val}`}>{value}</p>
      <p className={`text-[12px] font-medium ${c.text} mt-0.5`}>{label}</p>
    </div>
  );
}
