'use client';

import { Building2, Users, MapPin, Phone } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BannerCardGridSkeleton } from './skeletons';
import type { SectionProps } from './types';

const ADMIN_ROLES = ['super_admin', 'org_admin', 'hospital_admin', 'practice_manager'];

type HospitalRow = {
  id: string; name: string; slug: string; color: string | null;
  address?: string | null; phone?: string | null; timezone?: string | null;
  staff_count?: { count: number }[];
};

export function AdminHospitalsSection({ userId }: SectionProps) {
  const { data } = useQuery({
    queryKey: ['admin-hospitals-data', userId],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data: myRoles } = await supabase
        .from('user_hospital_roles').select('role').eq('user_id', userId);

      if (!myRoles?.some(r => ADMIN_ROLES.includes(r.role))) {
        return { hospitals: [] as HospitalRow[], hasAccess: false };
      }

      const { data: hospitals } = await supabase
        .from('hospitals')
        .select('*, staff_count:user_hospital_roles(count)')
        .order('name');

      return { hospitals: (hospitals ?? []) as HospitalRow[], hasAccess: true };
    },
  });

  if (!data) return <BannerCardGridSkeleton />;
  if (!data.hasAccess) {
    return <div className="text-center py-16 text-slate-400">You don&apos;t have access to Hospital Management.</div>;
  }

  return (
    <div>
      <PageHeader
        title="Hospital Management"
        description="Manage hospital locations, settings, and staff"
        color="navy"
        variant="banner"
        icon={<Building2 className="h-7 w-7" />}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.hospitals.map(h => {
          const staffCount = (h.staff_count as { count: number }[])?.[0]?.count ?? 0;
          return (
            <Card key={h.id} className="border-slate-100 hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${h.color ?? '#2563EB'}20` }}>
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
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />{h.address}
                  </div>
                )}
                {h.phone && (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" />{h.phone}
                  </div>
                )}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <Users className="h-3.5 w-3.5 text-slate-400" />{staffCount} staff
                  </div>
                  {h.timezone && (
                    <Badge className="text-[10px] border-0 bg-slate-100 text-slate-600">{h.timezone}</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
