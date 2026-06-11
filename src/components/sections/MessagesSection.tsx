'use client';

import { MessageSquare } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { getChannels, seedDefaultChannels } from '@/lib/actions/communication';
import { MessagesShell } from '@/components/communication/messages-shell';
import { PageHeader } from '@/components/ui/page-header';
import { BannerListSkeleton } from './skeletons';
import type { SectionProps } from './types';

export function MessagesSection({ userId }: SectionProps) {
  const { data } = useQuery({
    queryKey: ['messages-data', userId],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const profileRes = await supabase
        .from('profiles')
        .select('first_name, last_name')
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
    <div className="flex flex-col h-full min-h-0 overflow-hidden px-6 py-5">
      <PageHeader
        title="Messages"
        description="Team channels and direct communication"
        color="navy"
        variant="banner"
        icon={<MessageSquare className="h-7 w-7" />}
      />
      <div className="flex-1 min-h-0 overflow-hidden">
        {data ? (
          <MessagesShell
            initialChannels={data.channels}
            currentUserId={userId}
            currentUserName={data.displayName}
          />
        ) : <BannerListSkeleton />}
      </div>
    </div>
  );
}
