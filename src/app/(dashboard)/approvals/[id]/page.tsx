import { createSupabaseServerClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import RequestDetailView from '@/components/approvals/RequestDetailView';

export const metadata = {
  title: 'Request Details - VetOS',
  description: 'View and manage request details',
};

interface Params {
  id: string;
}

export default async function RequestDetailPage({ params }: { params: Params }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Fetch request with details
  const { data: request, error: reqError } = await supabase
    .from('requests')
    .select('*')
    .eq('id', params.id)
    .single();

  if (reqError || !request) notFound();

  // Check authorization
  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single();

  if (profile?.org_id !== request.org_id) {
    redirect('/approvals');
  }

  // Fetch request-specific details based on type
  let details = null;
  if (request.request_type === 'meeting') {
    const { data } = await supabase
      .from('meeting_requests')
      .select('*')
      .eq('request_id', params.id)
      .single();
    details = data;
  } else if (request.request_type === 'leave') {
    const { data } = await supabase
      .from('leave_requests')
      .select('*')
      .eq('request_id', params.id)
      .single();
    details = data;
  } else if (request.request_type === 'purchase') {
    const { data } = await supabase
      .from('purchase_requests')
      .select('*')
      .eq('request_id', params.id)
      .single();
    details = data;
  } else if (request.request_type === 'training') {
    const { data } = await supabase
      .from('training_requests')
      .select('*')
      .eq('request_id', params.id)
      .single();
    details = data;
  } else if (request.request_type === 'document_verification') {
    const { data } = await supabase
      .from('document_verification_requests')
      .select('*')
      .eq('request_id', params.id)
      .single();
    details = data;
  } else if (request.request_type === 'equipment') {
    const { data } = await supabase
      .from('equipment_requests')
      .select('*')
      .eq('request_id', params.id)
      .single();
    details = data;
  }

  // Fetch activity log
  const { data: activity } = await supabase
    .from('request_activity')
    .select('*')
    .eq('request_id', params.id)
    .order('created_at', { ascending: false });

  // Fetch approval chain
  const { data: approvals } = await supabase
    .from('request_approvals')
    .select('*')
    .eq('request_id', params.id)
    .order('step_number', { ascending: true });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{request.title}</h1>
        <p className="mt-1 text-gray-600 dark:text-gray-400">Review and manage this request</p>
      </div>

      <RequestDetailView
        request={request}
        details={details}
        activity={activity || []}
        approvals={approvals || []}
      />
    </div>
  );
}
