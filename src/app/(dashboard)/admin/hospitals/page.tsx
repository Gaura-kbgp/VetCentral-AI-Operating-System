import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, Users, MapPin, Phone } from 'lucide-react';

const ADMIN_ROLES = ['super_admin', 'org_admin', 'hospital_admin', 'practice_manager'];

export default async function HospitalsAdminPage() {
  const supabase = await createSupabaseServerClient();
  const adminClient = createSupabaseAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: myRoles } = await adminClient
    .from('user_hospital_roles').select('role').eq('user_id', user.id);
  if (!myRoles?.some(r => ADMIN_ROLES.includes(r.role))) redirect('/dashboard');

  const { data: hospitals } = await adminClient
    .from('hospitals')
    .select(`
      *,
      staff_count:user_hospital_roles(count)
    `)
    .order('name');

  return (
    <div>
      <PageHeader
        title="Hospital Management"
        description="Manage hospital locations, settings, and staff"
        color="navy"
        icon={<Building2 className="h-7 w-7" />}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(hospitals ?? []).map(h => {
          const staffCount = (h.staff_count as unknown as { count: number }[])?.[0]?.count ?? 0;
          return (
            <Card key={h.id} className="border-slate-100 hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <div
                    className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${h.color ?? '#2563EB'}20` }}
                  >
                    <Building2 className="h-5 w-5" style={{ color: h.color ?? '#2563EB' }} />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-semibold text-slate-800">{h.name}</CardTitle>
                    <p className="text-xs text-slate-400">{h.slug}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {h.address && (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    {h.address}
                  </div>
                )}
                {h.phone && (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    {h.phone}
                  </div>
                )}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <Users className="h-3.5 w-3.5 text-slate-400" />
                    {staffCount} staff
                  </div>
                  <Badge className="text-[10px] border-0 bg-slate-100 text-slate-600">
                    {h.timezone}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
