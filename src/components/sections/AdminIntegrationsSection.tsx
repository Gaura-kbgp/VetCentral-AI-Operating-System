'use client';

import { Mail, Calendar, MessageSquare, Cloud, Stethoscope, BarChart3, CheckCircle2, Circle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BannerCardGridSkeleton } from './skeletons';
import type { SectionProps } from './types';

const ADMIN_ROLES = ['super_admin', 'org_admin', 'it_admin'];

const INTEGRATIONS = [
  { id: 'microsoft365', name: 'Microsoft 365', description: 'Sync calendars, email, and Teams notifications with VetOS', category: 'Productivity', icon: <Mail className="h-5 w-5 text-blue-600" />, status: 'available' as 'connected' | 'available' | 'coming_soon', badge: 'OAuth 2.0' },
  { id: 'google_workspace', name: 'Google Workspace', description: 'Integrate Google Calendar, Gmail, and Drive', category: 'Productivity', icon: <Calendar className="h-5 w-5 text-green-600" />, status: 'available' as 'connected' | 'available' | 'coming_soon', badge: 'OAuth 2.0' },
  { id: 'slack', name: 'Slack', description: 'Send VetOS notifications and alerts to Slack channels', category: 'Communication', icon: <MessageSquare className="h-5 w-5 text-purple-600" />, status: 'coming_soon' as 'connected' | 'available' | 'coming_soon' },
  { id: 'aws_s3', name: 'AWS S3', description: 'Store medical records and documents in your own S3 bucket', category: 'Storage', icon: <Cloud className="h-5 w-5 text-orange-500" />, status: 'available' as 'connected' | 'available' | 'coming_soon', badge: 'AWS' },
  { id: 'ezyvet', name: 'ezyVet', description: 'Bi-directional sync with ezyVet practice management system', category: 'Veterinary', icon: <Stethoscope className="h-5 w-5 text-teal-600" />, status: 'coming_soon' as 'connected' | 'available' | 'coming_soon' },
  { id: 'cornerstone', name: 'IDEXX Cornerstone', description: 'Import patient and appointment data from Cornerstone', category: 'Veterinary', icon: <Stethoscope className="h-5 w-5 text-indigo-600" />, status: 'coming_soon' as 'connected' | 'available' | 'coming_soon' },
  { id: 'powerbi', name: 'Power BI', description: 'Export VetOS data to Power BI for custom dashboards', category: 'Analytics', icon: <BarChart3 className="h-5 w-5 text-yellow-600" />, status: 'available' as 'connected' | 'available' | 'coming_soon', badge: 'REST API' },
];

const STATUS_CONFIG = {
  connected:   { label: 'Connected',   class: 'bg-green-100 text-green-700' },
  available:   { label: 'Available',   class: 'bg-blue-100 text-blue-700'  },
  coming_soon: { label: 'Coming Soon', class: 'bg-slate-100 text-slate-500' },
};

const CATEGORIES = [...new Set(INTEGRATIONS.map(i => i.category))];

export function AdminIntegrationsSection({ userId }: SectionProps) {
  const { data: hasAccess } = useQuery({
    queryKey: ['admin-integrations-access', userId],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data: roles } = await supabase
        .from('user_hospital_roles').select('role').eq('user_id', userId);
      return roles?.some(r => ADMIN_ROLES.includes(r.role)) ?? false;
    },
  });

  if (hasAccess === undefined) return <BannerCardGridSkeleton />;
  if (!hasAccess) {
    return <div className="text-center py-16 text-slate-400">You don&apos;t have access to Integrations.</div>;
  }

  return (
    <div>
      <PageHeader
        title="Integrations"
        description="Connect VetOS with your existing tools and services"
        color="navy"
        variant="banner"
        icon={<BarChart3 className="h-7 w-7" />}
      />
      <div className="space-y-8">
        {CATEGORIES.map(category => (
          <div key={category}>
            <h3 className="text-sm font-semibold text-slate-600 mb-3">{category}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {INTEGRATIONS.filter(i => i.category === category).map(integration => {
                const statusCfg = STATUS_CONFIG[integration.status];
                return (
                  <Card key={integration.id} className={`border-slate-100 transition-shadow ${integration.status !== 'coming_soon' ? 'hover:shadow-md cursor-pointer' : 'opacity-70'}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                            {integration.icon}
                          </div>
                          <div>
                            <CardTitle className="text-sm font-semibold text-slate-800">{integration.name}</CardTitle>
                            {integration.badge && <span className="text-[10px] text-slate-400">{integration.badge}</span>}
                          </div>
                        </div>
                        <Badge className={`text-[10px] border-0 shrink-0 mt-0.5 ${statusCfg.class}`}>{statusCfg.label}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-slate-500 mb-3">{integration.description}</p>
                      <div className="flex items-center gap-1.5">
                        {integration.status === 'connected' ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <Circle className="h-3.5 w-3.5 text-slate-300" />}
                        <span className="text-[11px] text-slate-400">
                          {integration.status === 'connected' ? 'Active — configured' : integration.status === 'available' ? 'Click to configure' : 'Not yet available'}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
