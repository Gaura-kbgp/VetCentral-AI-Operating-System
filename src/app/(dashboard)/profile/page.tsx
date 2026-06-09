import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { User } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import ProfileForm from '@/components/profile/profile-form';
import { getProfileActivityLog } from '@/lib/actions/profile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';

export default async function ProfilePage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [profileResult, rolesResult, hospitalsResult, activityLog] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('user_hospital_roles').select('role, hospital:hospital_id(id,name,color)').eq('user_id', user.id),
    supabase.from('hospitals').select('id,name,color').order('name'),
    getProfileActivityLog(10),
  ]);

  const profile  = profileResult.data;
  const roles    = rolesResult.data ?? [];
  const hospitals = hospitalsResult.data ?? [];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="My Profile"
        description="Manage your personal information and account details"
        color="navy"
        icon={<User className="h-7 w-7" />}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main form */}
        <div className="lg:col-span-2">
          <ProfileForm profile={profile} email={user.email ?? ''} />
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Role badges */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">Hospital Roles</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {roles.length === 0 ? (
                <p className="text-xs text-slate-400">No roles assigned</p>
              ) : (
                roles.map((r) => {
                  const hospital = r.hospital as unknown as { id: string; name: string; color: string } | null;
                  return (
                    <div key={`${r.role}-${hospital?.id}`} className="flex items-center gap-2">
                      {hospital?.color && (
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: hospital.color }} />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-700 truncate">{hospital?.name ?? 'Unknown'}</p>
                        <Badge className="text-[10px] px-1.5 py-0 h-4 bg-blue-100 text-blue-700 border-0 mt-0.5">
                          {r.role.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Activity */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {activityLog.length === 0 ? (
                <p className="text-xs text-slate-400">No activity yet</p>
              ) : (
                <div className="space-y-3">
                  {activityLog.map((log) => (
                    <div key={log.id} className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                      <div>
                        <p className="text-xs text-slate-700 capitalize">
                          {log.action.replace(/_/g, ' ')} {log.resource_type}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                        </p>
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
