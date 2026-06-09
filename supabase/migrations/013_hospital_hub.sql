-- ============================================================
-- Migration 013: Hospital Hub
-- Adds announcements and KPI snapshot tables for multi-hospital ops
-- ============================================================

-- ── Hospital Announcements ────────────────────────────────────
CREATE TABLE IF NOT EXISTS hospital_announcements (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  content     TEXT,
  priority    TEXT NOT NULL DEFAULT 'normal'
                CHECK (priority IN ('normal', 'high', 'urgent')),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_announcements_hospital
  ON hospital_announcements(hospital_id, is_active, created_at DESC);

ALTER TABLE hospital_announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "announcements_read"  ON hospital_announcements;
DROP POLICY IF EXISTS "announcements_write" ON hospital_announcements;

CREATE POLICY "announcements_read" ON hospital_announcements
  FOR SELECT USING (
    org_id = (auth.jwt() -> 'app_metadata' ->> 'org_id')::UUID
  );

CREATE POLICY "announcements_write" ON hospital_announcements
  FOR ALL USING (
    org_id = (auth.jwt() -> 'app_metadata' ->> 'org_id')::UUID
    AND EXISTS (
      SELECT 1 FROM user_hospital_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin','org_admin','hospital_admin','practice_manager')
    )
  );

-- ── Extend hospitals with email/website if not already done ───
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS email       TEXT;
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS website     TEXT;
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS is_active   BOOLEAN NOT NULL DEFAULT TRUE;
