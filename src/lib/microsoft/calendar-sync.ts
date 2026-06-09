import { Client } from '@microsoft/microsoft-graph-client';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { decryptToken } from '@/lib/utils/crypto';

interface GraphEvent {
  id: string;
  subject: string;
  bodyPreview: string;
  location?: { displayName?: string };
  onlineMeeting?: { joinUrl?: string };
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  isAllDay: boolean;
  recurrence?: unknown;
  attendees?: Array<{ emailAddress: { address: string; name: string } }>;
  organizer?: { emailAddress: { address: string } };
  isCancelled?: boolean;
}

export async function getGraphClient(userId: string, calendarId: string): Promise<Client | null> {
  const supabase = createSupabaseAdminClient();

  const { data: tokenRecord } = await supabase
    .from('outlook_sync_tokens')
    .select('*')
    .eq('user_id', userId)
    .eq('calendar_id', calendarId)
    .single();

  if (!tokenRecord) return null;

  // Check if token needs refresh
  const tokenExpiry = new Date(tokenRecord.token_expiry);
  let accessToken = decryptToken(tokenRecord.access_token);

  if (tokenExpiry < new Date(Date.now() + 5 * 60 * 1000)) {
    accessToken = await refreshAccessToken(userId, calendarId, decryptToken(tokenRecord.refresh_token));
  }

  return Client.init({
    authProvider: (done) => done(null, accessToken),
  });
}

async function refreshAccessToken(userId: string, calendarId: string, refreshToken: string): Promise<string> {
  const response = await fetch(
    `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        scope: 'https://graph.microsoft.com/Calendars.ReadWrite offline_access',
      }),
    }
  );

  const tokens = await response.json();
  const { encryptToken } = await import('@/lib/utils/crypto');

  const supabase = createSupabaseAdminClient();
  await supabase
    .from('outlook_sync_tokens')
    .update({
      access_token: encryptToken(tokens.access_token),
      refresh_token: encryptToken(tokens.refresh_token),
      token_expiry: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      synced_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('calendar_id', calendarId);

  return tokens.access_token;
}

export async function syncOutlookCalendar(
  userId: string,
  hospitalId: string,
  orgId: string,
  calendarId: string
): Promise<{ synced: number; conflicts: number }> {
  const supabase = createSupabaseAdminClient();
  const client = await getGraphClient(userId, calendarId);
  if (!client) return { synced: 0, conflicts: 0 };

  // Get delta token for incremental sync
  const { data: tokenRecord } = await supabase
    .from('outlook_sync_tokens')
    .select('delta_token')
    .eq('user_id', userId)
    .eq('calendar_id', calendarId)
    .single();

  let endpoint: string;
  if (tokenRecord?.delta_token) {
    endpoint = tokenRecord.delta_token; // Graph delta link
  } else {
    // Initial sync: last 30 days and next 90 days
    const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const end = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    endpoint = `/me/calendarView/delta?startDateTime=${start}&endDateTime=${end}&$select=subject,start,end,location,bodyPreview,isAllDay,recurrence,attendees,organizer,onlineMeeting,isCancelled`;
  }

  const events: GraphEvent[] = [];
  let nextLink: string | null = endpoint;
  let deltaLink: string | null = null;

  // Paginate through all events
  while (nextLink) {
    const response = await client.api(nextLink).get();
    events.push(...(response.value || []));
    nextLink = response['@odata.nextLink'] || null;
    deltaLink = response['@odata.deltaLink'] || deltaLink;
  }

  // Save delta token for next sync
  if (deltaLink) {
    await supabase
      .from('outlook_sync_tokens')
      .update({ delta_token: deltaLink, synced_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('calendar_id', calendarId);
  }

  // Upsert events into VetOS calendar
  let synced = 0;
  for (const event of events) {
    if (event.isCancelled) {
      await supabase
        .from('calendar_events')
        .update({ is_cancelled: true })
        .eq('outlook_event_id', event.id);
    } else {
      await supabase
        .from('calendar_events')
        .upsert({
          org_id: orgId,
          hospital_id: hospitalId,
          title: event.subject || 'Untitled Event',
          description: event.bodyPreview,
          location: event.location?.displayName,
          meeting_link: event.onlineMeeting?.joinUrl,
          event_type: 'meeting',
          start_time: new Date(event.start.dateTime + (event.start.timeZone === 'UTC' ? 'Z' : '')).toISOString(),
          end_time: new Date(event.end.dateTime + (event.end.timeZone === 'UTC' ? 'Z' : '')).toISOString(),
          is_all_day: event.isAllDay,
          is_recurring: !!event.recurrence,
          outlook_event_id: event.id,
          outlook_calendar_id: calendarId,
          created_by: userId,
          is_cancelled: false,
        }, { onConflict: 'outlook_event_id' });
      synced++;
    }
  }

  return { synced, conflicts: 0 };
}

export async function syncAllHospitalCalendars(): Promise<void> {
  const supabase = createSupabaseAdminClient();

  // Get all active sync tokens
  const { data: tokens } = await supabase
    .from('outlook_sync_tokens')
    .select('user_id, hospital_id, calendar_id, user:profiles(org_id)')
    .not('access_token', 'is', null);

  if (!tokens) return;

  const results = await Promise.allSettled(
    tokens.map((token: typeof tokens[number]) =>
      syncOutlookCalendar(
        token.user_id,
        token.hospital_id!,
        ((token.user as unknown) as { org_id: string }).org_id,
        token.calendar_id
      )
    )
  );

  const successful = results.filter(r => r.status === 'fulfilled').length;
  console.log(`Outlook sync complete: ${successful}/${tokens.length} calendars synced`);
}
