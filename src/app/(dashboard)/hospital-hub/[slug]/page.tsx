import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { BackButton } from '@/components/ui/back-button';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import {
  getHospitalDetail,
  getHospitalEmployees,
  getHospitalDepartments,
  getHospitalTrainingStats,
} from '@/lib/actions/hospital-hub';
import {
  Building2, Users, Layers, GraduationCap, MapPin,
  Phone, Mail, Globe, CheckCircle2, AlertCircle, Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: `${slug} — Hospital Hub` };
}

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: string | number; icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
      <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center shrink-0', color)}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-[13px] text-gray-500">{label}</p>
      </div>
    </div>
  );
}

export default async function HospitalDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const hospitalRes = await getHospitalDetail(slug);
  if (!hospitalRes.success) notFound();
  const hospital = hospitalRes.data;

  const [employeesRes, deptsRes, trainingRes] = await Promise.all([
    getHospitalEmployees(hospital.id),
    getHospitalDepartments(hospital.id),
    getHospitalTrainingStats(hospital.id),
  ]);

  const employees = employeesRes.success ? employeesRes.data : [];
  const depts     = deptsRes.success     ? deptsRes.data     : [];
  const training  = trainingRes.success  ? trainingRes.data  : null;

  const activeStaff = employees.filter(e => e.is_active).length;

  return (
    <div className="h-full overflow-y-auto">
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

      {/* Back + Header */}
      <div>
        <BackButton label="Back" className="mb-4" />
        <div className="flex items-start gap-4">
          <div
            className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0 text-white font-bold text-lg"
            style={{ backgroundColor: hospital.color ?? '#6366F1' }}
          >
            {hospital.name.charAt(0)}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{hospital.name}</h1>
            {hospital.description && (
              <p className="text-[14px] text-gray-500 mt-0.5">{hospital.description}</p>
            )}
            <div className="flex flex-wrap gap-3 mt-2">
              {hospital.address && (
                <span className="flex items-center gap-1 text-[13px] text-gray-500">
                  <MapPin className="h-3.5 w-3.5" /> {hospital.address}
                </span>
              )}
              {hospital.phone && (
                <span className="flex items-center gap-1 text-[13px] text-gray-500">
                  <Phone className="h-3.5 w-3.5" /> {hospital.phone}
                </span>
              )}
              {hospital.email && (
                <span className="flex items-center gap-1 text-[13px] text-gray-500">
                  <Mail className="h-3.5 w-3.5" /> {hospital.email}
                </span>
              )}
              {hospital.website && (
                <a href={hospital.website} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[13px] text-blue-600 hover:underline">
                  <Globe className="h-3.5 w-3.5" /> Website
                </a>
              )}
            </div>
          </div>
          <span className={cn(
            'ml-auto shrink-0 px-3 py-1 rounded-full text-[12px] font-medium',
            hospital.is_active
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-500'
          )}>
            {hospital.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Staff"       value={employees.length} icon={Users}        color="bg-blue-500" />
        <StatCard label="Active Staff"      value={activeStaff}      icon={CheckCircle2} color="bg-green-500" />
        <StatCard label="Departments"       value={depts.length}     icon={Layers}       color="bg-purple-500" />
        <StatCard label="Training Compliance"
          value={training ? `${training.complianceRate}%` : '—'}
          icon={GraduationCap}
          color={training && training.complianceRate >= 80 ? 'bg-emerald-500' : 'bg-amber-500'}
        />
      </div>

      {/* Training Summary */}
      {training && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-[15px] font-bold text-gray-900 mb-4">Training Overview</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            {[
              { label: 'Enrolled',   value: training.totalEnrollments, color: 'text-blue-600' },
              { label: 'Completed',  value: training.completedCount,   color: 'text-green-600' },
              { label: 'Due Soon',   value: training.dueCount,         color: 'text-amber-600' },
              { label: 'Overdue',    value: training.overdueCount,     color: 'text-red-600' },
            ].map(s => (
              <div key={s.label} className="p-3 rounded-lg bg-gray-50">
                <p className={cn('text-2xl font-bold', s.color)}>{s.value}</p>
                <p className="text-[12px] text-gray-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Departments */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-[15px] font-bold text-gray-900 mb-4">
            Departments <span className="text-gray-400 font-normal">({depts.length})</span>
          </h2>
          {depts.length === 0 ? (
            <p className="text-[13px] text-gray-400 py-4 text-center">No departments yet</p>
          ) : (
            <div className="space-y-2">
              {depts.map(d => (
                <div key={d.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                    <span className="text-[13px] font-medium text-gray-800">{d.name}</span>
                    {d.managerName && (
                      <span className="text-[12px] text-gray-400">· {d.managerName}</span>
                    )}
                  </div>
                  <span className="text-[12px] text-gray-500">{d.memberCount} members</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Staff */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-[15px] font-bold text-gray-900 mb-4">
            Staff <span className="text-gray-400 font-normal">({employees.length})</span>
          </h2>
          {employees.length === 0 ? (
            <p className="text-[13px] text-gray-400 py-4 text-center">No staff assigned</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {employees.map(e => (
                <div key={e.id} className="flex items-center gap-3 py-1.5 border-b border-gray-100 last:border-0">
                  <div className="h-7 w-7 rounded-full bg-gray-200 flex items-center justify-center shrink-0 text-[11px] font-bold text-gray-600">
                    {e.first_name.charAt(0)}{e.last_name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-800 truncate">
                      {e.first_name} {e.last_name}
                    </p>
                    <p className="text-[11px] text-gray-400 truncate">{e.job_title ?? e.role}</p>
                  </div>
                  <span className={cn(
                    'shrink-0 h-1.5 w-1.5 rounded-full',
                    e.is_active ? 'bg-green-500' : 'bg-gray-300'
                  )} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
    </div>
  );
}
