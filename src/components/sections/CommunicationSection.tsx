'use client';

import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { CommShell } from '@/components/communication/comm-shell';
import { getChannels, seedDefaultChannels } from '@/lib/actions/communication';
import { BannerListSkeleton } from './skeletons';
import type { SectionProps } from './types';

export function CommunicationSection({ userId }: SectionProps) {
  const { data } = useQuery({
    queryKey: ['communication-data', userId],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const profileRes = await supabase
        .from('profiles')
        .select('first_name, last_name, avatar_url')
        .eq('id', userId)
        .single();

      let channelsResult = await getChannels();
      if (channelsResult.success && channelsResult.data.length === 0) {
        channelsResult = await seedDefaultChannels();
      }

      return {
        channels: channelsResult.success ? channelsResult.data : [],
        displayName: [profileRes.data?.first_name, profileRes.data?.last_name].filter(Boolean).join(' ') || 'You',
      };
    },
  });

  return (
    <div className="flex h-full min-h-0 overflow-hidden p-1">
      {data ? (
        <CommShell
          initialChannels={data.channels as Parameters<typeof CommShell>[0]['initialChannels']}
          currentUserId={userId}
          currentUserName={data.displayName}
        />
      ) : <BannerListSkeleton />}
    </div>
  );
}
