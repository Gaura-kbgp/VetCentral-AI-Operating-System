import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { getOrCreateAISettings } from '@/lib/actions/ai-settings';
import AISettingsForm from '@/components/settings/ai-settings-form';

export default async function AISettingsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const settings = await getOrCreateAISettings();

  const { data: convCount } = await supabase
    .from('ai_conversations')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader
        title="AI Assistant Settings"
        description="Configure your VetOS AI experience"
        color="violet"
        icon={<Sparkles className="h-7 w-7" />}
      />
      <AISettingsForm
        settings={settings}
        conversationCount={(convCount as unknown as { count: number })?.count ?? 0}
      />
    </div>
  );
}
