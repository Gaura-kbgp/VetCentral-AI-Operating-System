'use client';

import { ShieldCheck } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import SecurityCenter from '@/components/settings/security-center';
import { getSessions, getLoginHistory } from '@/lib/actions/security';
import { BannerListSkeleton } from './skeletons';
import type { SectionProps } from './types';

export function SecuritySection(_: SectionProps) {
  const { data } = useQuery({
    queryKey: ['security-data'],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      const [sessions, loginHistory] = await Promise.all([getSessions(), getLoginHistory(20)]);
      return { sessions, loginHistory, email: user?.email ?? '' };
    },
  });

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader
        title="Security Settings"
        description="Manage your password, sessions, and account security"
        color="navy"
        variant="banner"
        icon={<ShieldCheck className="h-7 w-7" />}
      />
      {data ? (
        <SecurityCenter
          sessions={data.sessions}
          loginHistory={data.loginHistory}
          email={data.email}
        />
      ) : <BannerListSkeleton />}
    </div>
  );
}
