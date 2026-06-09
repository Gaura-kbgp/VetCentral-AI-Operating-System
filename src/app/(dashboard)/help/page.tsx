import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { HelpCircle } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import HelpCenter from '@/components/help/help-center';
import { getMyTickets } from '@/lib/actions/support';

export default async function HelpPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [tickets, articles] = await Promise.all([
    getMyTickets(),
    supabase
      .from('kb_articles')
      .select('id,title,tags,view_count,updated_at,category_id')
      .eq('status', 'published')
      .order('view_count', { ascending: false })
      .limit(6),
  ]);

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader
        title="Help & Support"
        description="Find answers, submit tickets, and get help from the team"
        color="navy"
        icon={<HelpCircle className="h-7 w-7" />}
      />
      <HelpCenter tickets={tickets} articles={articles.data ?? []} />
    </div>
  );
}
