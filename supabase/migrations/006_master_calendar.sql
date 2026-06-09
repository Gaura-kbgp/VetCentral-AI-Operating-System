-- ============================================================
-- Migration 006: Master Operational Calendar
-- Vet AI Operating System
-- Expands event types and adds operational tables
-- ============================================================

-- Expand event_type enum with all operational categories
-- Note: ADD VALUE cannot run inside a transaction block; run statements individually
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'leadership_meeting';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'manager_meeting';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'department_meeting';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'cpr_training';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'osha_training';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'compliance_training';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'lms_session';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'orientation';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'performance_review';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'vacation';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'sick_leave';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'personal_leave';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'town_hall';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'staff_event';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'announcement';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'audit';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'inspection';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'deadline';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'project_milestone';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'project_review';

-- Add operational fields to calendar_events
ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS priority      TEXT CHECK (priority IN ('low','medium','high','urgent')) DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS color         TEXT,
  ADD COLUMN IF NOT EXISTS multi_hospital BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tags          TEXT[] DEFAULT '{}';

-- Multi-hospital events junction table
CREATE TABLE IF NOT EXISTS event_hospitals (
  event_id    UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, hospital_id)
);

CREATE INDEX IF NOT EXISTS idx_event_hospitals_hospital ON event_hospitals(hospital_id);

-- Leave requests (formal PTO tracking separate from calendar events)
CREATE TABLE IF NOT EXISTS leave_requests (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  user_id         UUID NOT NULL REFERENCES profiles(id),
  hospital_id     UUID REFERENCES hospitals(id),
  leave_type      TEXT NOT NULL CHECK (leave_type IN ('vacation','sick_leave','personal_leave','bereavement','unpaid','other')),
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  days_requested  NUMERIC(4,1) NOT NULL DEFAULT 1,
  reason          TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied','cancelled')),
  reviewed_by     UUID REFERENCES profiles(id),
  reviewed_at     TIMESTAMPTZ,
  review_note     TEXT,
  calendar_event_id UUID REFERENCES calendar_events(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_user     ON leave_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_hospital ON leave_requests(hospital_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates    ON leave_requests(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status   ON leave_requests(status);

CREATE TRIGGER update_leave_requests_updated_at
  BEFORE UPDATE ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Training sessions extended metadata
CREATE TABLE IF NOT EXISTS training_sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id        UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES organizations(id),
  instructor      TEXT,
  max_attendees   INT,
  is_mandatory    BOOLEAN DEFAULT FALSE,
  certification   TEXT,
  expiry_months   INT,
  pass_score      INT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_sessions_event ON training_sessions(event_id);
CREATE INDEX IF NOT EXISTS idx_training_sessions_org   ON training_sessions(org_id);

-- Enable RLS on new tables
ALTER TABLE event_hospitals   ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;

-- Helper: inline org_id from JWT so we don't depend on auth.org_id()
-- (auth.jwt() -> 'app_metadata' ->> 'org_id')::UUID

-- RLS: event_hospitals — visible to any member of the org
CREATE POLICY "event_hospitals_select" ON event_hospitals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM calendar_events ce
      WHERE ce.id = event_id
        AND ce.org_id = (auth.jwt() -> 'app_metadata' ->> 'org_id')::UUID
    )
  );

-- RLS: leave_requests — user sees their own; managers/HR/execs see their hospital's
CREATE POLICY "leave_requests_select" ON leave_requests
  FOR SELECT USING (
    org_id = (auth.jwt() -> 'app_metadata' ->> 'org_id')::UUID
    AND (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM user_hospital_roles uhr
        WHERE uhr.user_id    = auth.uid()
          AND uhr.hospital_id = leave_requests.hospital_id
          AND uhr.role::TEXT IN ('admin','manager','hr','executive')
      )
    )
  );

CREATE POLICY "leave_requests_insert" ON leave_requests
  FOR INSERT WITH CHECK (
    org_id  = (auth.jwt() -> 'app_metadata' ->> 'org_id')::UUID
    AND user_id = auth.uid()
  );

CREATE POLICY "leave_requests_update" ON leave_requests
  FOR UPDATE USING (
    org_id = (auth.jwt() -> 'app_metadata' ->> 'org_id')::UUID
    AND (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM user_hospital_roles uhr
        WHERE uhr.user_id    = auth.uid()
          AND uhr.hospital_id = leave_requests.hospital_id
          AND uhr.role::TEXT IN ('admin','manager','hr','executive')
      )
    )
  );

-- RLS: training_sessions — all org members can read; managers+ can insert
CREATE POLICY "training_sessions_select" ON training_sessions
  FOR SELECT USING (
    org_id = (auth.jwt() -> 'app_metadata' ->> 'org_id')::UUID
  );

CREATE POLICY "training_sessions_insert" ON training_sessions
  FOR INSERT WITH CHECK (
    org_id = (auth.jwt() -> 'app_metadata' ->> 'org_id')::UUID
    AND EXISTS (
      SELECT 1 FROM user_hospital_roles uhr
      WHERE uhr.user_id = auth.uid()
        AND uhr.role::TEXT IN ('admin','manager','hr','executive')
    )
  );
