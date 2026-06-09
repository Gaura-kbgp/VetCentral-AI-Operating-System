import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import SecurityCenter from '@/components/settings/security-center';
import { getSessions, getLoginHistory } from '@/lib/actions/security';

export default async function SecurityPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [sessions, loginHistory] = await Promise.all([
    getSessions(),
    getLoginHistory(20),
  ]);

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader
        title="Security Settings"
        description="Manage your password, sessions, and account security"
        color="navy"
        icon={<ShieldCheck className="h-7 w-7" />}
      />
      <SecurityCenter sessions={sessions} loginHistory={loginHistory} email={user.email ?? ''} />
    </div>
  );
}
