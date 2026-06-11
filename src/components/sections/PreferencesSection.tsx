'use client';

import { SlidersHorizontal } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/page-header';
import { getOrCreatePreferences } from '@/lib/actions/preferences';
import PreferencesForm from '@/components/settings/preferences-form';
import { BannerListSkeleton } from './skeletons';
import type { SectionProps } from './types';

export function PreferencesSection(_: SectionProps) {
  const { data } = useQuery({
    queryKey: ['preferences-data'],
    queryFn: () => getOrCreatePreferences(),
  });

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader
        title="Preferences"
        description="Customize your VetOS experience"
        color="navy"
        variant="banner"
        icon={<SlidersHorizontal className="h-7 w-7" />}
      />
      {data ? <PreferencesForm preferences={data} /> : <BannerListSkeleton />}
    </div>
  );
}
