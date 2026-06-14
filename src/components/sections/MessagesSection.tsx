'use client';

import { MessageSquare } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { housekeepChannels } from '@/lib/actions/communication';
import { MessagesShell } from '@/components/communication/messages-shell';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { SectionProps } from './types';

export function MessagesSection({ userId, role }: SectionProps) {
  const { data } = useQuery({
    queryKey: ['messages-init', userId],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const [profileRes] = await Promise.all([
        supabase.from('profiles').select('first_name, last_name').eq('id', userId).single(),
        housekeepChannels(),
      ]);
      const displayName = [profileRes.data?.first_name, profileRes.data?.last_name]
        .filter(Boolean).join(' ') || 'You';
      return { displayName };
    },
    staleTime: 60_000,
  });

  if (!data) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <MessageSquare className="h-10 w-10 animate-pulse" />
          <p className="text-sm">Loading messages…</p>
        </div>
      </div>
    );
  }

  return (
    <MessagesShell
      currentUserId={userId}
      currentUserName={data.displayName}
      role={role}
    />
  );
}
