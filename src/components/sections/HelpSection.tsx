'use client';

import { HelpCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import HelpCenter from '@/components/help/help-center';
import { getMyTickets } from '@/lib/actions/support';
import { BannerListSkeleton } from './skeletons';
import type { SectionProps } from './types';

export function HelpSection(_: SectionProps) {
  const { data } = useQuery({
    queryKey: ['help-data'],
    queryFn: async () => {
      const supabase = createSupabaseBrowserClient();
      const [tickets, articlesRes] = await Promise.all([
        getMyTickets(),
        supabase
          .from('kb_articles')
          .select('id,title,tags,view_count,updated_at,category_id')
          .eq('status', 'published')
          .order('view_count', { ascending: false })
          .limit(6),
      ]);
      return { tickets, articles: articlesRes.data ?? [] };
    },
  });

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader
        title="Help & Support"
        description="Find answers, submit tickets, and get help from the team"
        color="navy"
        variant="banner"
        icon={<HelpCircle className="h-7 w-7" />}
      />
      {data ? (
        <HelpCenter
          tickets={data.tickets}
          articles={data.articles as Parameters<typeof HelpCenter>[0]['articles']}
        />
      ) : <BannerListSkeleton />}
    </div>
  );
}
