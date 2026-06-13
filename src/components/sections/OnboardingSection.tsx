'use client';

import { useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import OnboardingShell from '@/components/onboarding/onboarding-shell';
import { getOnboardingShellData } from '@/lib/actions/onboarding-steps';
import { BannerCardGridSkeleton } from './skeletons';
import type { ShellRecord } from '@/lib/actions/onboarding-steps';
import type { SectionProps } from './types';

export function OnboardingSection({ userId, role }: SectionProps) {
  const [data, setData] = useState<{ ongoing: ShellRecord[]; onboarded: ShellRecord[] } | null>(null);

  useEffect(() => {
    let alive = true;
    getOnboardingShellData().then(res => {
      if (!alive) return;
      setData({ ongoing: res.ongoing, onboarded: res.onboarded });
    });
    return () => { alive = false; };
  }, [userId]);

  return (
    <div className="flex flex-col h-full min-h-0 px-6 py-6">
      <PageHeader
        title="Employee Onboarding"
        description="Track and manage the onboarding process for new employees"
        color="green"
        variant="banner"
        icon={<UserPlus className="h-7 w-7" />}
      />
      {data ? (
        <OnboardingShell
          initialOngoing={data.ongoing}
          initialOnboarded={data.onboarded}
          currentUserRole={role}
        />
      ) : (
        <BannerCardGridSkeleton />
      )}
    </div>
  );
}
