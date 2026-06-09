-- Schedule Requests: approval workflow before calendar events are confirmed
CREATE TABLE IF NOT EXISTS schedule_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  event_type      TEXT NOT NULL DEFAULT 'meeting',
  start_time      TIMESTAMPTZ NOT NULL,
  end_time        TIMESTAMPTZ NOT NULL,
  is_all_day      BOOLEAN NOT NULL DEFAULT false,
  location        TEXT,
  meeting_link    TEXT,
  hospital_id     UUID REFERENCES hospitals(id) ON DELETE SET NULL,
  priority        TEXT NOT NULL DEFAULT 'medium'
                    CHECK (priority IN ('low','medium','high','urgent')),
  description     TEXT,
  attendee_emails TEXT[] DEFAULT '{}',

  -- Who requested it
  requested_by    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Approval status
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected')),
  admin_notes     TEXT,
  approved_by     UUID REFERENCES profiles(id),
  approved_at     TIMESTAMPTZ,
  rejected_at     TIMESTAMPTZ,

  -- Created calendar event once approved
  calendar_event_id UUID REFERENCES calendar_events(id) ON DELETE SET NULL,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for admin listing (newest first)
CREATE INDEX IF NOT EXISTS idx_schedule_requests_status  ON schedule_requests(status);
CREATE INDEX IF NOT EXISTS idx_schedule_requests_req_by  ON schedule_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_schedule_requests_created ON schedule_requests(created_at DESC);

-- RLS
ALTER TABLE schedule_requests ENABLE ROW LEVEL SECURITY;

-- Owners can see and insert their own requests
CREATE POLICY "schedule_requests_owner_select" ON schedule_requests
  FOR SELECT USING (requested_by = auth.uid());

CREATE POLICY "schedule_requests_owner_insert" ON schedule_requests
  FOR INSERT WITH CHECK (requested_by = auth.uid());

-- Admins can see all
CREATE POLICY "schedule_requests_admin_select" ON schedule_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_hospital_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin','org_admin','hospital_admin','practice_manager')
    )
  );

-- Admins can update (approve/reject)
CREATE POLICY "schedule_requests_admin_update" ON schedule_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_hospital_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin','org_admin','hospital_admin','practice_manager')
    )
  );

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_schedule_requests_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_schedule_requests_updated_at
  BEFORE UPDATE ON schedule_requests
  FOR EACH ROW EXECUTE FUNCTION update_schedule_requests_updated_at();
