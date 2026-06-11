'use client';

import { useQuery } from '@tanstack/react-query';
import { getChannels, seedDefaultChannels } from '@/lib/actions/communication';
import { AnnouncementsShell } from '@/components/communication/announcements-shell';
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
    <div className="flex h-full min-h-0 overflow-hidden p-1">
      {data ? (
        <AnnouncementsShell
          initialChannels={data.channels}
          currentUserId={userId}
          role={role}
        />
      ) : <BannerListSkeleton />}
    </div>
  );
}
