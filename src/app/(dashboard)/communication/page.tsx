import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CommShell } from '@/components/communication/comm-shell';
import { getChannels, seedDefaultChannels } from '@/lib/actions/communication';

export const dynamic = 'force-dynamic';

export default async function CommunicationPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name, last_name, avatar_url')
    .eq('id', user.id)
    .single();

  let channelsResult = await getChannels();
  if (channelsResult.success && channelsResult.data.length === 0) {
    channelsResult = await seedDefaultChannels();
  }

  const channels    = channelsResult.success ? channelsResult.data : [];
  const displayName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'You';

  return (
    <div className="flex h-full min-h-0 overflow-hidden p-1">
      <CommShell
        initialChannels={channels}
        currentUserId={user.id}
        currentUserName={displayName}
      />
    </div>
  );
}
