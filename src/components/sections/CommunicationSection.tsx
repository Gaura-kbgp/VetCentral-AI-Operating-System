'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { seedDefaultChannels } from '@/lib/actions/communication';
import { SlackShell } from '@/components/communication/slack-shell';
import { BannerListSkeleton } from './skeletons';
import type { SectionProps } from './types';

export function CommunicationSection({ userId, role }: SectionProps) {
  const [name, setName]     = useState<string | null>(null);
  const [ready, setReady]   = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = createSupabaseBrowserClient();
      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', userId)
        .single();

      const displayName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'You';

      // Seed default channels on first load (no-op if they already exist)
      await seedDefaultChannels();

      if (active) { setName(displayName); setReady(true); }
    })();
    return () => { active = false; };
  }, [userId]);

  if (!ready) return (
    <div className="flex-1 flex min-h-0 overflow-hidden p-4">
      <BannerListSkeleton />
    </div>
  );

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden">
      <SlackShell
        currentUserId={userId}
        currentUserName={name!}
        role={role}
      />
    </div>
  );
}
