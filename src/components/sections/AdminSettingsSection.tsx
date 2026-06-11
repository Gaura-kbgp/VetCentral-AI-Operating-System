'use client';

import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  Building2, Globe, Mail, Shield, Bell, Cog, Database,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { SeedDemoButton } from '@/components/admin/seed-demo-button';
import { SeedHospitalsButton } from '@/components/admin/seed-hospitals-button';
import { BannerListSkeleton } from './skeletons';
import type { SectionProps } from './types';

export function AdminSettingsSection({ userId }: SectionProps) {
  const { data } = useQuery({
    queryKey: ['admin-settings-data', userId],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const [hospRoles, orgRoles] = await Promise.all([
        supabase.from('user_hospital_roles').select('role').eq('user_id', userId),
        supabase.from('org_user_roles').select('role').eq('user_id', userId),
      ]);
      const allRoles = [
        ...(hospRoles.data ?? []).map(r => r.role),
        ...(orgRoles.data ?? []).map(r => r.role),
      ];
      if (!allRoles.some(r => ['super_admin', 'org_admin'].includes(r))) {
        return { org: null, empCount: 0, hospitalCount: 0, deptCount: 0, hasAccess: false };
      }

      const { data: org } = await supabase.from('organizations').select('name, slug, created_at, id').single();

      const [{ count: empCount }, { count: hospitalCount }, { count: deptCount }] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('org_id', org?.id ?? ''),
        supabase.from('hospitals').select('*', { count: 'exact', head: true }).eq('org_id', org?.id ?? ''),
        supabase.from('departments').select('*', { count: 'exact', head: true }).eq('org_id', org?.id ?? ''),
      ]);

      return {
        org: org ? { name: org.name, slug: org.slug, created_at: org.created_at } : null,
        empCount: empCount ?? 0,
        hospitalCount: hospitalCount ?? 0,
        deptCount: deptCount ?? 0,
        hasAccess: true,
      };
    },
  });

  if (!data) return <BannerListSkeleton />;
  if (!data.hasAccess) {
    return <div className="text-center py-16 text-slate-400">You don&apos;t have access to System Settings.</div>;
  }

  type SectionItem = { label: string; value: string; badge?: string };
  const sections: Array<{ icon: React.ReactNode; title: string; items: SectionItem[] }> = [
    { icon: <Building2 className="h-4 w-4" />, title: 'Organization', items: [
      { label: 'Organization Name', value: data.org?.name ?? '—' },
      { label: 'Slug', value: data.org?.slug ?? '—' },
      { label: 'Hospitals', value: String(data.hospitalCount) },
      { label: 'Departments', value: String(data.deptCount) },
      { label: 'Created', value: data.org?.created_at ? new Date(data.org.created_at).toLocaleDateString('en-US') : '—' },
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
        variant="banner"
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
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white text-[10px] font-bold shrink-0">1</span>
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Hospitals &amp; Departments</p>
                <p className="text-xs text-slate-400">— {data.hospitalCount}/3 hospitals · {data.deptCount}/15 departments</p>
              </div>
              <SeedHospitalsButton hospitalCount={data.hospitalCount} target={3} />
            </div>
            <Separator />
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-white text-[10px] font-bold shrink-0">2</span>
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Demo Employees</p>
                <p className="text-xs text-slate-400">— {(data.empCount ?? 1) - 1}/75 employees</p>
              </div>
              {data.hospitalCount < 3 ? (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-xl px-4 py-3 border border-amber-200">
                  Complete Step 1 first — hospitals must exist before employees can be assigned.
                </p>
              ) : (
                <SeedDemoButton initialCount={data.empCount ?? 1} total={75} />
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
