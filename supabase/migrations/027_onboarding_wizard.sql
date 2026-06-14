-- ============================================================
-- Migration 027: Onboarding Wizard Enhancement
-- Adds wizard-step tracking, vet credentials, equipment &
-- policy-acknowledgement tables for the 10-step employee wizard
-- ============================================================

-- ── Extensions to onboarding_records ─────────────────────────

ALTER TABLE onboarding_records
  ADD COLUMN IF NOT EXISTS wizard_step       INT          NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wizard_data       JSONB        NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS completed_steps   TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS employment_type   TEXT
    CHECK (employment_type IN ('full_time','part_time','contractor','temporary'));

-- ── Vet credentials (doctors / vet techs) ────────────────────

CREATE TABLE IF NOT EXISTS vet_credentials (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  record_id           UUID        NOT NULL REFERENCES onboarding_records(id) ON DELETE CASCADE,
  employee_id         UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  license_number      TEXT,
  license_state       TEXT,
  license_expiry      DATE,
  dea_number          TEXT,
  dea_expiry          DATE,
  specializations     TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
  skill_matrix        JSONB       NOT NULL DEFAULT '{}',
  verification_status TEXT        NOT NULL DEFAULT 'pending'
                      CHECK (verification_status IN ('pending','approved','rejected','expired')),
  verified_by         UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  verified_at         TIMESTAMPTZ,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (record_id)
);

CREATE INDEX IF NOT EXISTS idx_vet_creds_record   ON vet_credentials(record_id);
CREATE INDEX IF NOT EXISTS idx_vet_creds_employee ON vet_credentials(employee_id);

-- ── Equipment assignments ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS equipment_assignments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  record_id       UUID        NOT NULL REFERENCES onboarding_records(id) ON DELETE CASCADE,
  employee_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  equipment_name  TEXT        NOT NULL,
  equipment_type  TEXT        CHECK (equipment_type IN ('laptop','badge','keys','locker','uniform','mobile','other')),
  serial_number   TEXT,
  assigned_by     UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_date   DATE,
  status          TEXT        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','assigned','returned','lost')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_equipment_record   ON equipment_assignments(record_id);
CREATE INDEX IF NOT EXISTS idx_equipment_employee ON equipment_assignments(employee_id);

-- ── Policy acknowledgements ───────────────────────────────────

CREATE TABLE IF NOT EXISTS policy_acknowledgements (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  record_id        UUID        NOT NULL REFERENCES onboarding_records(id) ON DELETE CASCADE,
  employee_id      UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  policy_key       TEXT        NOT NULL,
  policy_name      TEXT        NOT NULL,
  policy_content   TEXT,
  acknowledged     BOOLEAN     NOT NULL DEFAULT FALSE,
  acknowledged_at  TIMESTAMPTZ,
  signature_text   TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (record_id, policy_key)
);

CREATE INDEX IF NOT EXISTS idx_policy_ack_record ON policy_acknowledgements(record_id);

-- ── Seed default policies for all active onboarding records ──

INSERT INTO policy_acknowledgements
  (org_id, record_id, employee_id, policy_key, policy_name, policy_content)
SELECT
  r.org_id, r.id, r.employee_id,
  p.policy_key, p.policy_name, p.policy_content
FROM onboarding_records r
CROSS JOIN (VALUES
  ('employee_handbook',    'Employee Handbook',
   'This handbook outlines all company policies, benefits, and expectations. It covers workplace conduct, leave policies, benefits overview, and your rights as an employee. Please read carefully before acknowledging.'),
  ('attendance_policy',    'Attendance & Time Policy',
   'Our attendance policy defines expected work hours, procedures for reporting absences, tardiness guidelines, and time-off request processes. Consistent attendance is essential to our team and patient care.'),
  ('code_of_conduct',      'Code of Conduct',
   'Our code of conduct defines professional behavior standards for all employees. This includes respectful communication, patient confidentiality, conflict resolution, and ethical decision-making in all work situations.'),
  ('it_policy',            'IT & Security Policy',
   'This policy covers acceptable use of company technology, internet, email, and software systems. It includes data security requirements, password policies, and procedures for reporting security incidents.'),
  ('controlled_substance', 'Controlled Substance Policy',
   'This policy governs the handling, storage, administration, and documentation of controlled substances. All employees who work with controlled substances must understand and follow these procedures strictly.'),
  ('hipaa_privacy',        'Privacy & HIPAA Compliance',
   'Patient privacy is paramount. This policy details our HIPAA compliance requirements, including what constitutes protected health information (PHI), how it must be handled, and the consequences of unauthorized disclosure.')
) AS p(policy_key, policy_name, policy_content)
WHERE r.status IN ('active','on_hold')
ON CONFLICT (record_id, policy_key) DO NOTHING;
