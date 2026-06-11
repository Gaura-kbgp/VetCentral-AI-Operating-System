'use client';

import { Building2, LayoutGrid } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { BannerCardGridSkeleton } from './skeletons';
import type { SectionProps } from './types';

const ADMIN_ROLES = ['super_admin', 'org_admin', 'hospital_admin', 'practice_manager', 'it_admin'];

export function AdminDepartmentsSection({ userId }: SectionProps) {
  const { data } = useQuery({
    queryKey: ['admin-departments-data', userId],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data: myRoles } = await supabase
        .from('user_hospital_roles').select('role').eq('user_id', userId);

      if (!myRoles?.some(r => ADMIN_ROLES.includes(r.role))) {
        return { grouped: [], hasAccess: false };
      }

      const [{ data: departments }, { data: hospitals }] = await Promise.all([
        supabase
          .from('departments')
          .select('*, hospital:hospital_id(id,name,color), member_count:user_departments(count)')
          .order('name'),
        supabase.from('hospitals').select('id,name,color').order('name'),
      ]);

      const grouped = (hospitals ?? []).map(h => ({
        hospital: h,
        depts: (departments ?? []).filter(d => (d.hospital as { id: string })?.id === h.id),
      }));

      return { grouped, hasAccess: true };
    },
  });

  if (!data) return <BannerCardGridSkeleton />;
  if (!data.hasAccess) {
    return <div className="text-center py-16 text-slate-400">You don&apos;t have access to Departments.</div>;
  }

  return (
    <div>
      <PageHeader
        title="Departments"
        description="Manage departments across all hospital locations"
        color="navy"
        variant="banner"
        icon={<LayoutGrid className="h-7 w-7" />}
      />
      <div className="space-y-6">
        {data.grouped.map(({ hospital: h, depts }) => (
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
                {(depts as { id: string; name: string; description?: string; member_count?: unknown }[]).map(d => {
                  const memberCount = (d.member_count as { count: number }[])?.[0]?.count ?? 0;
                  return (
                    <Card key={d.id} className="border-slate-100 hover:shadow-sm transition-shadow">
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
        {data.grouped.every(g => g.depts.length === 0) && (
          <div className="text-center py-16">
            <Building2 className="h-12 w-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No departments yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
