import React from 'react';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Settings, Building2, Globe, Mail, Shield, Bell, Cog, Database } from 'lucide-react';
import { SeedDemoButton } from '@/components/admin/seed-demo-button';
import { SeedHospitalsButton } from '@/components/admin/seed-hospitals-button';

export default async function SystemSettingsPage() {
  const supabase = await createSupabaseServerClient();
  const adminClient = createSupabaseAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Check org_user_roles too (super admin lives there)
  const [{ data: hospitalRoles }, { data: orgRoles }] = await Promise.all([
    adminClient.from('user_hospital_roles').select('role').eq('user_id', user.id),
    adminClient.from('org_user_roles').select('role').eq('user_id', user.id),
  ]);

  const allRoles = [
    ...(hospitalRoles ?? []).map(r => r.role),
    ...(orgRoles ?? []).map(r => r.role),
  ];
  if (!allRoles.some(r => ['super_admin', 'org_admin'].includes(r))) redirect('/dashboard');

  const { data: org } = await adminClient
    .from('organizations')
    .select('*')
    .single();

  // Counts for seed cards
  const [{ count: empCount }, { count: hospitalCount }, { count: deptCount }] = await Promise.all([
    adminClient.from('profiles').select('*', { count: 'exact', head: true }).eq('org_id', org?.id ?? ''),
    adminClient.from('hospitals').select('*', { count: 'exact', head: true }).eq('org_id', org?.id ?? ''),
    adminClient.from('departments').select('*', { count: 'exact', head: true }).eq('org_id', org?.id ?? ''),
  ]);

  type SectionItem = { label: string; value: string; badge?: string };
  const sections: Array<{ icon: React.ReactNode; title: string; items: SectionItem[] }> = [
    { icon: <Building2 className="h-4 w-4" />, title: 'Organization', items: [
      { label: 'Organization Name', value: org?.name ?? '—' },
      { label: 'Slug', value: org?.slug ?? '—' },
      { label: 'Hospitals', value: String(hospitalCount ?? 0) },
      { label: 'Departments', value: String(deptCount ?? 0) },
      { label: 'Created', value: org?.created_at ? new Date(org.created_at).toLocaleDateString('en-US') : '—' },
    ]},
    { icon: <Globe className="h-4 w-4" />, title: 'Localization', items: [
      { label: 'Default Timezone', value: 'America/New_York' },
      { label: 'Default Language', value: 'English (en)' },
      { label: 'Date Format', value: 'MM/DD/YYYY' },
    ]},
    { icon: <Mail className="h-4 w-4" />, title: 'Email', items: [
      { label: 'Email Provider', value: 'Resend' },
      { label: 'From Address', value: 'noreply@vetclinic.com' },
      { label: 'Status', value: 'Configured', badge: 'bg-green-100 text-green-700' },
    ]},
    { icon: <Shield className="h-4 w-4" />, title: 'Security', items: [
      { label: 'MFA Enforcement', value: 'Optional' },
      { label: 'Session Timeout', value: '7 days' },
      { label: 'Password Policy', value: 'Strong' },
    ]},
    { icon: <Bell className="h-4 w-4" />, title: 'Notifications', items: [
      { label: 'Email Notifications', value: 'Enabled', badge: 'bg-green-100 text-green-700' },
      { label: 'Push Notifications', value: 'Enabled', badge: 'bg-green-100 text-green-700' },
      { label: 'Realtime', value: 'Supabase Realtime', badge: 'bg-blue-100 text-blue-700' },
    ]},
  ];

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="System Settings"
        description="Organization-wide configuration and settings"
        color="slate"
        icon={<Cog className="h-7 w-7" />}
      />
      <div className="space-y-4">
        {sections.map(section => (
          <Card key={section.title} className="border-slate-100">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">{section.icon}</span>
                <CardTitle className="text-sm font-semibold text-slate-700">{section.title}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {section.items.map((item, i) => (
                <div key={item.label}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-600">{item.label}</p>
                    {item.badge ? (
                      <Badge className={`text-[10px] border-0 ${item.badge}`}>{item.value}</Badge>
                    ) : (
                      <p className="text-sm font-medium text-slate-800">{item.value}</p>
                    )}
                  </div>
                  {i < section.items.length - 1 && <Separator className="mt-3" />}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}

        {/* Demo Data — two-step setup */}
        <Card className="border-indigo-100 bg-indigo-50/30">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <span className="text-indigo-400"><Database className="h-4 w-4" /></span>
              <CardTitle className="text-sm font-semibold text-slate-700">Demo Data Setup</CardTitle>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Two-step process: seed hospitals first, then employees. Safe to run multiple times — existing records are skipped.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Step 1 */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white text-[10px] font-bold shrink-0">1</span>
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Hospitals &amp; Departments</p>
                <p className="text-xs text-slate-400">— {hospitalCount ?? 0}/3 hospitals · {deptCount ?? 0}/15 departments</p>
              </div>
              <SeedHospitalsButton hospitalCount={hospitalCount ?? 0} target={3} />
            </div>

            <Separator />

            {/* Step 2 */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-white text-[10px] font-bold shrink-0">2</span>
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Demo Employees</p>
                <p className="text-xs text-slate-400">— {(empCount ?? 1) - 1}/75 employees</p>
              </div>
              {(hospitalCount ?? 0) < 3 ? (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-xl px-4 py-3 border border-amber-200">
                  Complete Step 1 first — hospitals must exist before employees can be assigned.
                </p>
              ) : (
                <SeedDemoButton initialCount={empCount ?? 1} total={75} />
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
