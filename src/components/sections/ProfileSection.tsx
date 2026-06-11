'use client';

import { User } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import ProfileForm from '@/components/profile/profile-form';
import { getProfileActivityLog } from '@/lib/actions/profile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { BannerListSkeleton } from './skeletons';
import type { SectionProps } from './types';

export function ProfileSection({ userId }: SectionProps) {
  const { data } = useQuery({
    queryKey: ['profile-data', userId],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();

      const [profileResult, rolesResult, activityLog] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).single(),
        supabase.from('user_hospital_roles').select('role, hospital:hospital_id(id,name,color)').eq('user_id', userId),
        getProfileActivityLog(10),
      ]);

      return {
        profile: profileResult.data,
        email: user?.email ?? '',
        roles: rolesResult.data ?? [],
        activityLog,
      };
    },
  });

  if (!data) return <BannerListSkeleton />;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="My Profile"
        description="Manage your personal information and account details"
        color="navy"
        variant="banner"
        icon={<User className="h-7 w-7" />}
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ProfileForm
            profile={data.profile as Parameters<typeof ProfileForm>[0]['profile']}
            email={data.email}
          />
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">Hospital Roles</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(data.roles as unknown as { role: string; hospital: { id: string; name: string; color: string } | null }[]).length === 0 ? (
                <p className="text-xs text-slate-400">No roles assigned</p>
              ) : (
                (data.roles as unknown as { role: string; hospital: { id: string; name: string; color: string } | null }[]).map(r => (
                  <div key={`${r.role}-${r.hospital?.id}`} className="flex items-center gap-2">
                    {r.hospital?.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: r.hospital.color }} />}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700 truncate">{r.hospital?.name ?? 'Unknown'}</p>
                      <Badge className="text-[10px] px-1.5 py-0 h-4 bg-blue-100 text-blue-700 border-0 mt-0.5">
                        {r.role.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {data.activityLog.length === 0 ? (
                <p className="text-xs text-slate-400">No activity yet</p>
              ) : (
                <div className="space-y-3">
                  {data.activityLog.map(log => (
                    <div key={log.id} className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                      <div>
                        <p className="text-xs text-slate-700 capitalize">{log.action.replace(/_/g, ' ')} {log.resource_type}</p>
                        <p className="text-[10px] text-slate-400">{formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
