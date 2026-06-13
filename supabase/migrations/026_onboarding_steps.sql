-- ============================================================
-- Migration 026: Onboarding Steps — simplified hiring checklist
-- ============================================================

CREATE TABLE IF NOT EXISTS onboarding_steps (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id     UUID NOT NULL REFERENCES onboarding_records(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL,
  step_key      TEXT NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  step_type     TEXT NOT NULL DEFAULT 'hr_action'
                CHECK (step_type IN ('hr_action','document_send','employee_upload','approval')),
  sort_order    INT NOT NULL DEFAULT 0,
  is_required   BOOLEAN NOT NULL DEFAULT TRUE,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','waiting','completed','verified','skipped')),
  document_url  TEXT,
  document_name TEXT,
  form_data     JSONB DEFAULT '{}',
  notes         TEXT,
  completed_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  completed_at  TIMESTAMPTZ,
  verified_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  verified_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_steps_record    ON onboarding_steps(record_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_steps_org       ON onboarding_steps(org_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_steps_status    ON onboarding_steps(record_id, status);
