'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  detectConflicts,
  findAlternativeSlots,
  type Conflict,
  type AlternativeSlot,
  type ScannedEvent,
  type ProposedEvent,
} from '@/lib/scheduling/conflict-engine';

export interface ConflictCheckInput {
  start_time:        string;
  end_time:          string;
  is_all_day:        boolean;
  location:          string | null;
  hospital_id:       string | null;
  attendee_emails:   string[];
  exclude_event_id?: string;
}

export interface ConflictCheckResult {
  conflicts:          Conflict[];
  alternatives:       AlternativeSlot[];
  scanned_events:     number;
  resolved_attendees: number;
  error?:             string;
}

// ── Availability types ────────────────────────────────────────────────────────
export interface BusySlot {
  start:        string;
  end:          string;
  title:        string;
  event_type:   string;
  event_id:     string;
}

export interface PersonAvailability {
  email:      string;
  user_id:    string | null;
  name:       string;
  job_title:  string | null;
  avatar_url: string | null;
  busy_slots: BusySlot[];
}

// ── Helper: build ScannedEvent array from raw Supabase rows ──────────────────
function buildScannedEvents(
  rawEvents: any[],
  organizerMap: Map<string, { id: string; email: string | null }>,
): ScannedEvent[] {
  return rawEvents.map(ev => {
    const org = organizerMap.get(ev.created_by ?? '') ?? null;
    return {
      id:              ev.id,
      title:           ev.title,
      start_time:      ev.start_time,
      end_time:        ev.end_time,
      location:        ev.location ?? null,
      hospital_id:     ev.hospital_id ?? null,
      event_type:      ev.event_type,
      is_all_day:      ev.is_all_day,
      organizer_id:    org?.id ?? ev.created_by ?? null,
      organizer_email: org?.email ?? null,
      attendee_ids:    ((ev.attendees ?? []) as { user_id: string | null; email: string | null }[])
        .map(a => a.user_id).filter((id): id is string => Boolean(id)),
      attendee_emails: ((ev.attendees ?? []) as { user_id: string | null; email: string | null }[])
        .map(a => a.email).filter((e): e is string => Boolean(e)),
    };
  });
}

// ── Check conflicts for a proposed event ─────────────────────────────────────
export async function checkEventConflicts(
  input: ConflictCheckInput,
): Promise<ConflictCheckResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { conflicts: [], alternatives: [], scanned_events: 0, resolved_attendees: 0, error: 'Unauthorized' };

    const scanFrom = new Date(input.start_time);
    scanFrom.setDate(scanFrom.getDate() - 1);
    const scanTo = new Date(input.start_time);
    scanTo.setDate(scanTo.getDate() + 15);

    let eventsQuery = supabase
      .from('calendar_events')
      .select(`
        id, title, start_time, end_time, location,
        hospital_id, event_type, is_all_day, created_by,
        attendees:calendar_event_attendees(user_id, email)
      `)
      .gte('start_time', scanFrom.toISOString())
      .lte('start_time', scanTo.toISOString())
      .eq('is_cancelled', false);

    if (input.hospital_id) {
      eventsQuery = eventsQuery.or(`hospital_id.eq.${input.hospital_id},hospital_id.is.null`);
    }

    const { data: rawEvents, error: eventsError } = await eventsQuery;
    if (eventsError) return { conflicts: [], alternatives: [], scanned_events: 0, resolved_attendees: 0, error: eventsError.message };

    // Resolve attendee emails → profile IDs
    const cleanEmails = input.attendee_emails
      .map(e => e.trim().toLowerCase()).filter(e => e.includes('@'));

    let resolvedProfiles: { id: string; email: string }[] = [];
    if (cleanEmails.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email')
        .in('email', cleanEmails);
      resolvedProfiles = profiles ?? [];
    }

    // Resolve organizer IDs in the fetched events → emails for richer matching
    const organizerIds = [...new Set((rawEvents ?? []).map(e => e.created_by).filter(Boolean))];
    const organizerMap = new Map<string, { id: string; email: string | null }>();
    if (organizerIds.length > 0) {
      const { data: orgProfiles } = await supabase
        .from('profiles')
        .select('id, email')
        .in('id', organizerIds);
      (orgProfiles ?? []).forEach(p => organizerMap.set(p.id, { id: p.id, email: p.email }));
    }

    const existing  = buildScannedEvents(rawEvents ?? [], organizerMap);
    const resolvedIds = resolvedProfiles.map(p => p.id);

    // Also include the current user as organizer of the proposed event
    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', user.id)
      .single();

    const proposed: ProposedEvent = {
      start_time:      input.start_time,
      end_time:        input.end_time,
      is_all_day:      input.is_all_day,
      location:        input.location,
      hospital_id:     input.hospital_id,
      attendee_ids:    resolvedIds,
      attendee_emails: cleanEmails,
      organizer_id:    user.id,
      organizer_email: currentProfile?.email ?? null,
    };

    const conflicts    = detectConflicts(proposed, existing, input.exclude_event_id);
    const alternatives = findAlternativeSlots(proposed, existing, input.exclude_event_id, 5);

    return { conflicts, alternatives, scanned_events: existing.length, resolved_attendees: resolvedIds.length };
  } catch (err) {
    return { conflicts: [], alternatives: [], scanned_events: 0, resolved_attendees: 0,
      error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ── Get per-person availability for a given date ──────────────────────────────
// Returns each person's busy slots for the day so the form can show an
// Outlook-style scheduling grid.
export async function getAttendeeAvailability(
  emails:      string[],
  date:        string,       // YYYY-MM-DD local date
  hospital_id: string | null,
): Promise<PersonAvailability[]> {
  if (emails.length === 0) return [];

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const cleanEmails = emails.map(e => e.trim().toLowerCase()).filter(e => e.includes('@'));
  if (cleanEmails.length === 0) return [];

  // Resolve emails → profiles
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name, job_title, avatar_url')
    .in('email', cleanEmails);

  const profileMap = new Map<string, typeof profiles extends (infer T)[] | null ? T : never>(
    (profiles ?? []).map(p => [p.email?.toLowerCase() ?? '', p] as any)
  );

  // Day boundaries (full UTC day around the local date)
  const dayStart = new Date(`${date}T00:00:00`);
  const dayEnd   = new Date(`${date}T23:59:59`);

  const profileIds = (profiles ?? []).map(p => p.id);

  // Fetch events where any of the resolved users are attendees or organizers
  let query = supabase
    .from('calendar_events')
    .select(`
      id, title, start_time, end_time, event_type, is_all_day, created_by,
      attendees:calendar_event_attendees(user_id, email)
    `)
    .gte('start_time', dayStart.toISOString())
    .lte('start_time', dayEnd.toISOString())
    .eq('is_cancelled', false);

  if (hospital_id) {
    query = query.or(`hospital_id.eq.${hospital_id},hospital_id.is.null`);
  }

  const { data: rawEvents } = await query;

  // Build per-person busy slots
  const busyMap = new Map<string, BusySlot[]>();
  cleanEmails.forEach(e => busyMap.set(e, []));

  for (const ev of (rawEvents ?? [])) {
    if (ev.is_all_day) continue;

    // Collect all participant emails for this event
    const participantEmails = new Set<string>();

    // From the attendees join
    for (const a of (ev.attendees ?? []) as { user_id: string | null; email: string | null }[]) {
      if (a.email) participantEmails.add(a.email.toLowerCase());
    }

    // From the organizer (created_by) — resolve their email
    if (ev.created_by && profileIds.includes(ev.created_by)) {
      const orgProfile = (profiles ?? []).find(p => p.id === ev.created_by);
      if (orgProfile?.email) participantEmails.add(orgProfile.email.toLowerCase());
    }

    const slot: BusySlot = {
      start:      ev.start_time,
      end:        ev.end_time,
      title:      ev.title,
      event_type: ev.event_type,
      event_id:   ev.id,
    };

    // Map to each requested attendee who is in this event
    for (const email of cleanEmails) {
      if (participantEmails.has(email)) {
        busyMap.get(email)!.push(slot);
      }
    }
  }

  // Shape result
  return cleanEmails.map(email => {
    const profile = profileMap.get(email) as any;
    const name = profile
      ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || email
      : email;
    return {
      email,
      user_id:    profile?.id ?? null,
      name,
      job_title:  profile?.job_title ?? null,
      avatar_url: profile?.avatar_url ?? null,
      busy_slots: busyMap.get(email) ?? [],
    };
  });
}
