import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getMyRequests } from '@/lib/actions/requests';
import MyRequestsView from '@/components/requests/MyRequestsView';

export const metadata = {
  title: 'My Requests - VetOS',
  description: 'Submit and track your requests',
};

export default async function WorkflowsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const result = await getMyRequests();
  const requests = result.success ? result.data : [];

  return (
    <div className="max-w-3xl mx-auto">
      <MyRequestsView requests={requests} />
    </div>
  );
}
