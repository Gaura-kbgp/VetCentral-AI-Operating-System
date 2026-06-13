'use client';

import { MessageSquare } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { housekeepChannels } from '@/lib/actions/communication';
import { MessagesShell } from '@/components/communication/messages-shell';
import { PageHeader } from '@/components/ui/page-header';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { SectionProps } from './types';

export function MessagesSection({ userId, role }: SectionProps) {
  const { data } = useQuery({
    queryKey: ['messages-init', userId],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const [profileRes] = await Promise.all([
        supabase.from('profiles').select('first_name, last_name').eq('id', userId).single(),
        housekeepChannels(), // one-time cleanup of duplicate/legacy channels
      ]);
      const displayName = [profileRes.data?.first_name, profileRes.data?.last_name]
        .filter(Boolean).join(' ') || 'You';
      return { displayName };
    },
    staleTime: 60_000,
  });

  return (
    // flex-1 min-h-0 lets this fill the SectionShell's flex column without overflow
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <PageHeader
        title="Messages"
        description="Team groups and direct communication"
        color="navy"
        variant="banner"
        icon={<MessageSquare className="h-7 w-7" />}
      />
      {/* flex-1 min-h-0 = takes remaining height, allows children to scroll */}
      <div className="flex-1 min-h-0 overflow-hidden flex">
        {data ? (
          <MessagesShell
            currentUserId={userId}
            currentUserName={data.displayName}
            role={role}
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-slate-400">
              <MessageSquare className="h-10 w-10 animate-pulse" />
              <p className="text-sm">Loading messages…</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
