-- ============================================================
-- Migration 003: Calendar Tables
-- Vet AI Operating System
-- ============================================================

CREATE TYPE event_type AS ENUM (
  'meeting',
  'training',
  'pto',
  'hospital_event',
  'onboarding',
  'doctor_meeting',
  'maintenance',
  'other'
);

CREATE TABLE calendar_events (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id                UUID NOT NULL REFERENCES organizations(id),
  hospital_id           UUID REFERENCES hospitals(id),
  title                 TEXT NOT NULL,
  description           TEXT,
  location              TEXT,
  meeting_link          TEXT,
  event_type            event_type NOT NULL DEFAULT 'meeting',
  start_time            TIMESTAMPTZ NOT NULL,
  end_time              TIMESTAMPTZ NOT NULL,
  is_all_day            BOOLEAN DEFAULT FALSE,
  is_recurring          BOOLEAN DEFAULT FALSE,
  recurrence_rule       TEXT,
  outlook_event_id      TEXT UNIQUE,
  outlook_calendar_id   TEXT,
  created_by            UUID REFERENCES profiles(id),
  is_cancelled          BOOLEAN DEFAULT FALSE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_events_hospital ON calendar_events(hospital_id);
CREATE INDEX idx_events_org ON calendar_events(org_id);
CREATE INDEX idx_events_time ON calendar_events(start_time, end_time);
CREATE INDEX idx_events_type ON calendar_events(event_type);
CREATE INDEX idx_events_outlook ON calendar_events(outlook_event_id);

CREATE TYPE attendance_status AS ENUM ('invited', 'accepted', 'declined', 'tentative');

CREATE TABLE calendar_event_attendees (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id      UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES profiles(id),
  email         TEXT,
  status        attendance_status DEFAULT 'invited',
  is_organizer  BOOLEAN DEFAULT FALSE,
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, user_id)
);

CREATE INDEX idx_attendees_event ON calendar_event_attendees(event_id);
CREATE INDEX idx_attendees_user ON calendar_event_attendees(user_id);

CREATE TABLE calendar_conflicts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hospital_id     UUID NOT NULL REFERENCES hospitals(id),
  event_id_1      UUID NOT NULL REFERENCES calendar_events(id),
  event_id_2      UUID NOT NULL REFERENCES calendar_events(id),
  user_id         UUID REFERENCES profiles(id),
  detected_at     TIMESTAMPTZ DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ,
  resolution_note TEXT
);

CREATE TABLE outlook_sync_tokens (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                   UUID NOT NULL REFERENCES profiles(id),
  hospital_id               UUID REFERENCES hospitals(id),
  calendar_id               TEXT NOT NULL,
  delta_token               TEXT,
  webhook_subscription_id   TEXT,
  webhook_expiry            TIMESTAMPTZ,
  access_token              TEXT,
  refresh_token             TEXT,
  token_expiry              TIMESTAMPTZ,
  synced_at                 TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, calendar_id)
);

-- Conflict detection trigger
CREATE OR REPLACE FUNCTION detect_calendar_conflicts()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO calendar_conflicts (hospital_id, event_id_1, event_id_2, user_id)
  SELECT
    COALESCE(NEW.hospital_id, OLD.hospital_id),
    NEW.id,
    e2.id,
    a1.user_id
  FROM calendar_event_attendees a1
  JOIN calendar_event_attendees a2 ON a2.user_id = a1.user_id AND a1.event_id = NEW.id
  JOIN calendar_events e2 ON e2.id = a2.event_id AND e2.id != NEW.id AND e2.is_cancelled = FALSE
  WHERE (NEW.start_time, NEW.end_time) OVERLAPS (e2.start_time, e2.end_time)
    AND NEW.is_cancelled = FALSE
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calendar_conflict_detection
  AFTER INSERT OR UPDATE ON calendar_events
  FOR EACH ROW EXECUTE FUNCTION detect_calendar_conflicts();

CREATE TRIGGER update_calendar_events_updated_at
  BEFORE UPDATE ON calendar_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
