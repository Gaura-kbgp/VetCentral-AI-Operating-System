'use client';

import { Megaphone } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getChannels, seedDefaultChannels } from '@/lib/actions/communication';
import { AnnouncementsShell } from '@/components/communication/announcements-shell';
import { PageHeader } from '@/components/ui/page-header';
import { BannerListSkeleton } from './skeletons';
import type { SectionProps } from './types';

export function AnnouncementsSection({ userId, role }: SectionProps) {
  const { data } = useQuery({
    queryKey: ['announcements-data', userId],
    queryFn: async () => {
      let channelsResult = await getChannels();
      if (channelsResult.success && channelsResult.data.length === 0) {
        channelsResult = await seedDefaultChannels();
      }
      return {
        channels: channelsResult.success ? channelsResult.data : [],
      };
    },
  });

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <PageHeader
        title="Announcements"
        description="Company-wide updates and notices for all staff"
        color="navy"
        variant="banner"
        icon={<Megaphone className="h-7 w-7" />}
      />
      <div className="flex-1 min-h-0 overflow-hidden flex px-4 pb-4">
        {data ? (
          <AnnouncementsShell
            initialChannels={data.channels}
            currentUserId={userId}
            role={role}
          />
        ) : <BannerListSkeleton />}
      </div>
    </div>
  );
}
