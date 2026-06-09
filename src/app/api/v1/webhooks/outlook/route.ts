import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { syncOutlookCalendar } from '@/lib/microsoft/calendar-sync';

export async function POST(req: NextRequest) {
  // Handle Graph webhook validation (subscription creation)
  const validationToken = req.nextUrl.searchParams.get('validationToken');
  if (validationToken) {
    return new Response(validationToken, {
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // Verify client state secret
  const body = await req.json();
  const notifications = body.value || [];

  for (const notification of notifications) {
    if (notification.clientState !== process.env.OUTLOOK_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Invalid client state' }, { status: 401 });
    }
  }

  // Process each notification
  const supabase = createSupabaseAdminClient();

  for (const notification of notifications) {
    const subscriptionId = notification.subscriptionId;

    // Find which user/hospital this subscription belongs to
    const { data: tokenRecord } = await supabase
      .from('outlook_sync_tokens')
      .select('user_id, hospital_id, calendar_id, user:profiles(org_id)')
      .eq('webhook_subscription_id', subscriptionId)
      .single();

    if (!tokenRecord) continue;

    // Trigger incremental sync for this calendar
    try {
      await syncOutlookCalendar(
        tokenRecord.user_id,
        tokenRecord.hospital_id!,
        ((tokenRecord.user as unknown) as { org_id: string }).org_id,
        tokenRecord.calendar_id
      );

      // Broadcast calendar update via Supabase Realtime
      await supabase
        .channel(`hospital:${tokenRecord.hospital_id}:calendar`)
        .send({
          type: 'broadcast',
          event: 'calendar_updated',
          payload: { hospital_id: tokenRecord.hospital_id, source: 'outlook_webhook' },
        });
    } catch (error) {
      console.error(`Failed to sync calendar for user ${tokenRecord.user_id}:`, error);
    }
  }

  // Graph API requires 202 Accepted response within 3 seconds
  return NextResponse.json({ success: true }, { status: 202 });
}
