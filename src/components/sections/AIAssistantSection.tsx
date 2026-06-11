'use client';

import { Sparkles } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { AIShell } from '@/components/ai-assistant/ai-shell';
import { ChatSkeleton } from './skeletons';
import type { SectionProps } from './types';

export function AIAssistantSection({ userId, orgId }: SectionProps) {
  const { data } = useQuery({
    queryKey: ['ai-assistant-data', userId],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const [profileRes, hospitalsRes] = await Promise.all([
        supabase.from('profiles').select('first_name, last_name').eq('id', userId).single(),
        supabase.from('hospitals').select('id, name, color').order('name'),
      ]);
      const first = profileRes.data?.first_name ?? '';
      const last  = profileRes.data?.last_name  ?? '';
      return {
        userName: `${first} ${last}`.trim() || 'there',
        hospitals: (hospitalsRes.data ?? []) as { id: string; name: string; color: string }[],
      };
    },
  });

  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader
        title="AI Assistant"
        description="Ask questions about procedures, policies, training, and more"
        color="navy"
        variant="banner"
        icon={<Sparkles className="h-7 w-7" />}
      />
      <div className="flex-1 min-h-0 flex flex-col">
        {data ? (
          <AIShell
            userId={userId}
            orgId={orgId}
            hospitals={data.hospitals}
            userName={data.userName}
          />
        ) : <ChatSkeleton />}
      </div>
    </div>
  );
}
