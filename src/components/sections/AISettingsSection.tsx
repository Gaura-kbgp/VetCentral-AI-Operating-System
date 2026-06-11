'use client';

import { Sparkles } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { getOrCreateAISettings } from '@/lib/actions/ai-settings';
import AISettingsForm from '@/components/settings/ai-settings-form';
import { BannerListSkeleton } from './skeletons';
import type { SectionProps } from './types';

export function AISettingsSection({ userId }: SectionProps) {
  const { data } = useQuery({
    queryKey: ['ai-settings-data', userId],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const [settings, convRes] = await Promise.all([
        getOrCreateAISettings(),
        supabase.from('ai_conversations').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      ]);
      return { settings, conversationCount: convRes.count ?? 0 };
    },
  });

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader
        title="AI Assistant Settings"
        description="Configure your VetOS AI experience"
        color="violet"
        variant="banner"
        icon={<Sparkles className="h-7 w-7" />}
      />
      {data ? (
        <AISettingsForm settings={data.settings} conversationCount={data.conversationCount} />
      ) : <BannerListSkeleton />}
    </div>
  );
}
