import { redirect } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui/page-header';
import { AIShell } from '@/components/ai-assistant/ai-shell';

export const dynamic = 'force-dynamic';

export default async function AIAssistantPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createSupabaseAdminClient();

  const [profileResult, hospitalsResult] = await Promise.all([
    admin
      .from('profiles')
      .select('org_id, first_name, last_name')
      .eq('id', user.id)
      .single(),
    admin
      .from('hospitals')
      .select('id, name, color')
      .order('name'),
  ]);

  const profile = profileResult.data;
  if (!profile?.org_id) redirect('/login');

  const firstName = profile.first_name ?? '';
  const lastName  = profile.last_name  ?? '';

  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader
        title="AI Assistant"
        description="Ask questions about procedures, policies, training, and more"
        color="navy"
        variant="banner"
        icon={<Sparkles className="h-7 w-7" />}
      />
      <AIShell
        userId={user.id}
        orgId={profile.org_id}
        hospitals={hospitalsResult.data ?? []}
        userName={`${firstName} ${lastName}`.trim() || 'there'}
      />
    </div>
  );
}
