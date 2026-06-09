import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Building2, LayoutGrid } from 'lucide-react';

const ADMIN_ROLES = ['super_admin', 'org_admin', 'hospital_admin', 'practice_manager', 'it_admin'];

export default async function DepartmentsPage() {
  const supabase = await createSupabaseServerClient();
  const adminClient = createSupabaseAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Use cookie-scoped client for own-role check (RLS allows this, same pattern as layout)
  const { data: myRoles } = await supabase
    .from('user_hospital_roles').select('role').eq('user_id', user.id);
  if (!myRoles?.some(r => ADMIN_ROLES.includes(r.role))) redirect('/dashboard');

  const { data: departments } = await adminClient
    .from('departments')
    .select(`
      *,
      hospital:hospital_id(id,name,color),
      member_count:user_departments(count)
    `)
    .order('name');

  const { data: hospitals } = await adminClient
    .from('hospitals').select('id,name,color').order('name');

  const grouped = (hospitals ?? []).map(h => ({
    hospital: h,
    depts: (departments ?? []).filter(d => (d.hospital as { id: string })?.id === h.id),
  }));

  return (
    <div>
      <PageHeader
        title="Departments"
        description="Manage departments across all hospital locations"
        color="navy"
        icon={<LayoutGrid className="h-7 w-7" />}
      />
      <div className="space-y-6">
        {grouped.map(({ hospital: h, depts }) => (
          <div key={h.id}>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: h.color ?? '#2563EB' }} />
              <h3 className="text-sm font-semibold text-slate-700">{h.name}</h3>
              <span className="text-xs text-slate-400">({depts.length})</span>
            </div>
            {depts.length === 0 ? (
              <p className="text-sm text-slate-400 ml-5 mb-2">No departments yet</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {depts.map(d => {
                  const memberCount = (d.member_count as unknown as { count: number }[])?.[0]?.count ?? 0;
                  return (
                    <Card key={d.id} className="border-slate-100 hover:shadow-sm transition-shadow cursor-pointer">
                      <CardContent className="flex items-center gap-3 p-4">
                        <div className="h-9 w-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                          <LayoutGrid className="h-4 w-4 text-slate-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{d.name}</p>
                          {d.description && <p className="text-xs text-slate-400 truncate">{d.description}</p>}
                          <p className="text-xs text-slate-400">{memberCount} members</p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        ))}
        {(departments ?? []).length === 0 && (
          <div className="text-center py-16">
            <Building2 className="h-12 w-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No departments yet</p>
            <p className="text-xs text-slate-400 mt-1">Departments will appear here once created</p>
          </div>
        )}
      </div>
    </div>
  );
}
