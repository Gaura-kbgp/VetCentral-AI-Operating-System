// Pure conflict-detection engine — zero framework dependencies.
// Import-safe from both server actions and client components.

export type ConflictSeverity = 'error' | 'warning';
export type ConflictType = 'room_conflict' | 'attendee_conflict' | 'pto_conflict';

export interface ScannedEvent {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  location: string | null;
  hospital_id: string | null;
  event_type: string;
  is_all_day: boolean;
  attendee_ids: string[];
  attendee_emails: string[];
  organizer_id: string | null;    // created_by — always treated as a participant
  organizer_email: string | null;
}

export interface AffectedPerson {
  id: string | null;
  email: string;
  name?: string;                  // resolved display name
}

export interface Conflict {
  type: ConflictType;
  severity: ConflictSeverity;
  message: string;
  detail: string;
  conflicting_event: {
    id: string;
    title: string;
    start_time: string;
    end_time: string;
    event_type: string;
  };
  affected: string[];             // emails for display
  affected_people: AffectedPerson[];
}

export interface AlternativeSlot {
  start: string;
  end: string;
  label: string;
  dayLabel: string;
  timeLabel: string;
  hasWarnings: boolean;
  score: number;
}

export interface ProposedEvent {
  start_time: string;
  end_time: string;
  is_all_day: boolean;
  location: string | null;
  hospital_id: string | null;
  attendee_ids: string[];
  attendee_emails: string[];
  organizer_id?: string | null;
  organizer_email?: string | null;
}

const PTO_TYPES = new Set(['pto', 'vacation', 'sick_leave', 'personal_leave']);

function overlaps(aS: Date, aE: Date, bS: Date, bE: Date): boolean {
  return aS < bE && aE > bS;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

// Returns all participant IDs for a scanned event (attendees + organizer)
function getParticipantIds(ev: ScannedEvent): Set<string> {
  const ids = new Set(ev.attendee_ids.filter(Boolean));
  if (ev.organizer_id) ids.add(ev.organizer_id);
  return ids;
}

// Returns all participant emails for a scanned event (attendees + organizer)
function getParticipantEmails(ev: ScannedEvent): Set<string> {
  const emails = new Set(ev.attendee_emails.map(e => e.trim().toLowerCase()));
  if (ev.organizer_email) emails.add(ev.organizer_email.trim().toLowerCase());
  return emails;
}

export function detectConflicts(
  proposed: ProposedEvent,
  existing: ScannedEvent[],
  excludeId?: string,
): Conflict[] {
  if (proposed.is_all_day) return [];

  const pS = new Date(proposed.start_time);
  const pE = new Date(proposed.end_time);
  if (pS >= pE) return [];

  const conflicts: Conflict[] = [];
  const seen = new Set<string>();

  const loc = proposed.location?.trim().toLowerCase() ?? null;

  // Build full set of proposed participants (attendees + organizer)
  const propEmails = new Set(proposed.attendee_emails.map(e => e.trim().toLowerCase()));
  if (proposed.organizer_email) propEmails.add(proposed.organizer_email.trim().toLowerCase());

  const propIds = new Set(proposed.attendee_ids.filter(Boolean));
  if (proposed.organizer_id) propIds.add(proposed.organizer_id);

  for (const ev of existing) {
    if (excludeId && ev.id === excludeId) continue;
    if (ev.is_all_day) continue;

    const eS = new Date(ev.start_time);
    const eE = new Date(ev.end_time);
    if (!overlaps(pS, pE, eS, eE)) continue;

    const isPTO = PTO_TYPES.has(ev.event_type);
    const evParticipantEmails = getParticipantEmails(ev);
    const evParticipantIds    = getParticipantIds(ev);

    // ── Room / Location Conflict ───────────────────────────────────────────
    if (!isPTO && loc && ev.location?.trim().toLowerCase() === loc) {
      const key = `room:${ev.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        conflicts.push({
          type:     'room_conflict',
          severity: 'error',
          message:  `"${proposed.location}" is already reserved`,
          detail:   `${fmtDate(ev.start_time)} · ${fmtTime(ev.start_time)}–${fmtTime(ev.end_time)}`,
          conflicting_event: {
            id: ev.id, title: ev.title,
            start_time: ev.start_time, end_time: ev.end_time, event_type: ev.event_type,
          },
          affected:        [proposed.location!],
          affected_people: [],
        });
      }
    }

    // ── Person Double-Booking (attendees + organizers) ─────────────────────
    if (!isPTO) {
      // Match by email first, then by ID
      const clashEmails = [...propEmails].filter(e => evParticipantEmails.has(e));
      const clashIdOnly = [...propIds].filter(id => evParticipantIds.has(id) &&
        // Only count ID matches not already covered by an email match
        !clashEmails.some(() => false) // always include, dedup by seen key
      );

      const totalClash = clashEmails.length || clashIdOnly.length;

      if (totalClash > 0) {
        const key = `attendee:${ev.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          conflicts.push({
            type:     'attendee_conflict',
            severity: 'error',
            message:  `${totalClash} person${totalClash !== 1 ? 's' : ''} already in another meeting`,
            detail:   `${fmtDate(ev.start_time)} · ${fmtTime(ev.start_time)}–${fmtTime(ev.end_time)}`,
            conflicting_event: {
              id: ev.id, title: ev.title,
              start_time: ev.start_time, end_time: ev.end_time, event_type: ev.event_type,
            },
            affected:        clashEmails,
            affected_people: clashEmails.map(email => ({ id: null, email })),
          });
        }
      }
    }

    // ── PTO / Leave Conflict ───────────────────────────────────────────────
    if (isPTO) {
      const onLeaveEmails = [...propEmails].filter(e => evParticipantEmails.has(e));
      const onLeaveIds    = [...propIds].filter(id => evParticipantIds.has(id));

      if (onLeaveEmails.length > 0 || onLeaveIds.length > 0) {
        const key = `pto:${ev.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          conflicts.push({
            type:     'pto_conflict',
            severity: 'warning',
            message:  `${onLeaveEmails.length || onLeaveIds.length} attendee${(onLeaveEmails.length || onLeaveIds.length) !== 1 ? 's' : ''} on approved leave`,
            detail:   `${ev.title} · ${fmtDate(ev.start_time)}`,
            conflicting_event: {
              id: ev.id, title: ev.title,
              start_time: ev.start_time, end_time: ev.end_time, event_type: ev.event_type,
            },
            affected:        onLeaveEmails,
            affected_people: onLeaveEmails.map(email => ({ id: null, email })),
          });
        }
      }
    }
  }

  return conflicts;
}

export function findAlternativeSlots(
  proposed: ProposedEvent,
  existing: ScannedEvent[],
  excludeId?: string,
  max = 5,
): AlternativeSlot[] {
  const durationMs =
    new Date(proposed.end_time).getTime() - new Date(proposed.start_time).getTime();
  const slots: AlternativeSlot[] = [];
  const originalStart = new Date(proposed.start_time);
  const now = new Date();

  const WORK_START  = 8;
  const WORK_END    = 18;
  const durationHrs = durationMs / 3600000;

  for (let dayOffset = 0; dayOffset <= 14 && slots.length < max; dayOffset++) {
    const base = new Date(originalStart);
    base.setDate(base.getDate() + dayOffset);

    const dow = base.getDay();
    if (dow === 0 || dow === 6) continue;

    for (let h = WORK_START; h + durationHrs <= WORK_END; h += 0.5) {
      if (slots.length >= max) break;

      const slotStart = new Date(base);
      slotStart.setHours(Math.floor(h), (h % 1) * 60, 0, 0);
      const slotEnd = new Date(slotStart.getTime() + durationMs);

      if (slotStart <= now) continue;
      if (slotStart.getTime() === originalStart.getTime()) continue;

      const testProposed: ProposedEvent = {
        ...proposed,
        start_time: slotStart.toISOString(),
        end_time:   slotEnd.toISOString(),
      };

      const c = detectConflicts(testProposed, existing, excludeId);
      if (c.some(x => x.severity === 'error')) continue;

      const hasWarnings = c.some(x => x.severity === 'warning');

      let score = 100 - dayOffset * 6;
      const hr = slotStart.getHours();
      if (hr >= 9 && hr <= 15) score += 10;
      if (hr === originalStart.getHours()) score += 5;
      if (hasWarnings) score -= 20;

      const timeLabel = slotStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      let dayLabel: string;
      if (dayOffset === 0)      dayLabel = 'Today';
      else if (dayOffset === 1) dayLabel = 'Tomorrow';
      else dayLabel = slotStart.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

      slots.push({
        start: slotStart.toISOString(),
        end:   slotEnd.toISOString(),
        label:    `${dayLabel} · ${timeLabel}`,
        dayLabel,
        timeLabel,
        hasWarnings,
        score,
      });
    }
  }

  return slots.sort((a, b) => b.score - a.score).slice(0, max);
}
