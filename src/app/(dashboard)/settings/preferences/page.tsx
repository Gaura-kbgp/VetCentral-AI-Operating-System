import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { SlidersHorizontal } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { getOrCreatePreferences } from '@/lib/actions/preferences';
import PreferencesForm from '@/components/settings/preferences-form';

export default async function PreferencesPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const prefs = await getOrCreatePreferences();

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader
        title="Preferences"
        description="Customize your VetOS experience"
        color="navy"
        icon={<SlidersHorizontal className="h-7 w-7" />}
      />
      <PreferencesForm preferences={prefs} />
    </div>
  );
}
