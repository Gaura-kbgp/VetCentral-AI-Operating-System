-- ============================================================
-- Migration 015: Employee Onboarding Module
-- Trainual/BambooHR-inspired onboarding system for VetOS
-- ============================================================

-- ── Onboarding Templates ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_templates (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id           UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  role_type        TEXT NOT NULL
                   CHECK (role_type IN ('doctor','csr','hr','manager','vet_assistant','custom')),
  description      TEXT,
  color            TEXT NOT NULL DEFAULT '#f97316',
  icon             TEXT DEFAULT 'user-plus',
  default_tasks    JSONB DEFAULT '[]',
  doc_requirements JSONB DEFAULT '[]',
  is_system        BOOLEAN NOT NULL DEFAULT FALSE,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── Onboarding Records ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_records (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id                 UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  hospital_id            UUID REFERENCES hospitals(id) ON DELETE SET NULL,
  employee_id            UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  template_id            UUID REFERENCES onboarding_templates(id) ON DELETE SET NULL,
  stage                  TEXT NOT NULL DEFAULT 'pre_hire'
                         CHECK (stage IN ('pre_hire','documents','orientation','training','manager_review','completed')),
  status                 TEXT NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active','on_hold','completed','cancelled')),
  manager_id             UUID REFERENCES profiles(id) ON DELETE SET NULL,
  hr_manager_id          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  start_date             DATE,
  target_completion_date DATE,
  completed_at           TIMESTAMPTZ,
  progress_pct           INTEGER NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  notes                  TEXT,
  created_by             UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (org_id, employee_id)
);

-- ── Onboarding Tasks (Checklist) ──────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_tasks (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  record_id     UUID NOT NULL REFERENCES onboarding_records(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT,
  category      TEXT NOT NULL DEFAULT 'required'
                CHECK (category IN ('required','optional')),
  task_type     TEXT NOT NULL DEFAULT 'action'
                CHECK (task_type IN ('document','training','meeting','action','hr','it','compliance')),
  stage         TEXT NOT NULL DEFAULT 'pre_hire'
                CHECK (stage IN ('pre_hire','documents','orientation','training','manager_review','completed')),
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','in_progress','completed','skipped','blocked')),
  due_date      DATE,
  assigned_to   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  completed_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  completed_at  TIMESTAMPTZ,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  reference_id  UUID,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Onboarding Documents ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_documents (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  record_id     UUID NOT NULL REFERENCES onboarding_records(id) ON DELETE CASCADE,
  employee_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  doc_type      TEXT NOT NULL DEFAULT 'other'
                CHECK (doc_type IN ('contract','certification','policy','id','tax_form','emergency_contact','other')),
  name          TEXT NOT NULL,
  storage_path  TEXT,
  file_size     INTEGER,
  file_type     TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','uploaded','verified','rejected')),
  notes         TEXT,
  uploaded_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  verified_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  verified_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Onboarding Meetings ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_meetings (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  record_id      UUID NOT NULL REFERENCES onboarding_records(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  meeting_type   TEXT NOT NULL DEFAULT 'orientation'
                 CHECK (meeting_type IN ('orientation','one_on_one','team_intro','manager_review','training','it_setup','hr_review')),
  scheduled_at   TIMESTAMPTZ,
  duration_mins  INTEGER DEFAULT 60,
  location       TEXT,
  meeting_url    TEXT,
  attendees      UUID[] DEFAULT '{}',
  notes          TEXT,
  status         TEXT NOT NULL DEFAULT 'scheduled'
                 CHECK (status IN ('scheduled','completed','cancelled','rescheduled')),
  created_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── Onboarding Activity Log ───────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_activity (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  record_id   UUID NOT NULL REFERENCES onboarding_records(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  details     JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── updated_at triggers ───────────────────────────────────────
DROP TRIGGER IF EXISTS trg_onboarding_records_updated ON onboarding_records;
DROP TRIGGER IF EXISTS trg_onboarding_tasks_updated   ON onboarding_tasks;

CREATE TRIGGER trg_onboarding_records_updated
  BEFORE UPDATE ON onboarding_records FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_onboarding_tasks_updated
  BEFORE UPDATE ON onboarding_tasks FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ob_records_org       ON onboarding_records(org_id);
CREATE INDEX IF NOT EXISTS idx_ob_records_employee  ON onboarding_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_ob_records_hospital  ON onboarding_records(hospital_id);
CREATE INDEX IF NOT EXISTS idx_ob_records_stage     ON onboarding_records(stage);
CREATE INDEX IF NOT EXISTS idx_ob_records_status    ON onboarding_records(status);
CREATE INDEX IF NOT EXISTS idx_ob_records_manager   ON onboarding_records(manager_id);

CREATE INDEX IF NOT EXISTS idx_ob_tasks_record      ON onboarding_tasks(record_id);
CREATE INDEX IF NOT EXISTS idx_ob_tasks_assigned    ON onboarding_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_ob_tasks_status      ON onboarding_tasks(status);
CREATE INDEX IF NOT EXISTS idx_ob_tasks_stage       ON onboarding_tasks(stage);

CREATE INDEX IF NOT EXISTS idx_ob_docs_record       ON onboarding_documents(record_id);
CREATE INDEX IF NOT EXISTS idx_ob_docs_employee     ON onboarding_documents(employee_id);

CREATE INDEX IF NOT EXISTS idx_ob_meetings_record   ON onboarding_meetings(record_id);
CREATE INDEX IF NOT EXISTS idx_ob_activity_record   ON onboarding_activity(record_id, created_at DESC);

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE onboarding_templates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_records    ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_tasks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_documents  ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_meetings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_activity   ENABLE ROW LEVEL SECURITY;

-- Templates: system or org-owned
DROP POLICY IF EXISTS "ob_tpl_select" ON onboarding_templates;
CREATE POLICY "ob_tpl_select" ON onboarding_templates FOR SELECT
  USING (is_system = TRUE OR org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- Records: org members read; HR/admins write
DROP POLICY IF EXISTS "ob_rec_select" ON onboarding_records;
DROP POLICY IF EXISTS "ob_rec_insert" ON onboarding_records;
DROP POLICY IF EXISTS "ob_rec_update" ON onboarding_records;
DROP POLICY IF EXISTS "ob_rec_delete" ON onboarding_records;

CREATE POLICY "ob_rec_select" ON onboarding_records FOR SELECT
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "ob_rec_insert" ON onboarding_records FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "ob_rec_update" ON onboarding_records FOR UPDATE
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "ob_rec_delete" ON onboarding_records FOR DELETE
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- Tasks, docs, meetings, activity: org-scoped via record
DROP POLICY IF EXISTS "ob_tasks_select" ON onboarding_tasks;
DROP POLICY IF EXISTS "ob_tasks_write"  ON onboarding_tasks;
CREATE POLICY "ob_tasks_select" ON onboarding_tasks FOR SELECT
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "ob_tasks_write" ON onboarding_tasks FOR ALL
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "ob_docs_select" ON onboarding_documents;
DROP POLICY IF EXISTS "ob_docs_write"  ON onboarding_documents;
CREATE POLICY "ob_docs_select" ON onboarding_documents FOR SELECT
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "ob_docs_write" ON onboarding_documents FOR ALL
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "ob_meetings_select" ON onboarding_meetings;
DROP POLICY IF EXISTS "ob_meetings_write"  ON onboarding_meetings;
CREATE POLICY "ob_meetings_select" ON onboarding_meetings FOR SELECT
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "ob_meetings_write" ON onboarding_meetings FOR ALL
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "ob_activity_select" ON onboarding_activity;
CREATE POLICY "ob_activity_select" ON onboarding_activity FOR SELECT
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- ── Seed: System Onboarding Templates ────────────────────────
INSERT INTO onboarding_templates (name, role_type, description, color, is_system, default_tasks, doc_requirements)
VALUES
  ('Doctor (DVM) Onboarding', 'doctor',
   'Complete onboarding workflow for new veterinarians.',
   '#3b82f6', TRUE,
   '[
     {"title":"Complete new hire paperwork","stage":"pre_hire","task_type":"hr","category":"required","sort_order":1},
     {"title":"Set up Cornerstone EMR access","stage":"pre_hire","task_type":"it","category":"required","sort_order":2},
     {"title":"Complete OSHA & safety training","stage":"orientation","task_type":"compliance","category":"required","sort_order":3},
     {"title":"Hospital orientation tour","stage":"orientation","task_type":"meeting","category":"required","sort_order":4},
     {"title":"Meet department team","stage":"orientation","task_type":"meeting","category":"required","sort_order":5},
     {"title":"Review hospital protocols","stage":"orientation","task_type":"document","category":"required","sort_order":6},
     {"title":"Complete DEA registration","stage":"documents","task_type":"compliance","category":"required","sort_order":7},
     {"title":"Submit state vet license copy","stage":"documents","task_type":"document","category":"required","sort_order":8},
     {"title":"Complete CE requirement review","stage":"training","task_type":"training","category":"required","sort_order":9},
     {"title":"30-day manager review","stage":"manager_review","task_type":"meeting","category":"required","sort_order":10}
   ]'::JSONB,
   '[
     {"doc_type":"id","name":"Government-issued photo ID","required":true},
     {"doc_type":"certification","name":"State Veterinary License","required":true},
     {"doc_type":"certification","name":"DEA Certificate","required":true},
     {"doc_type":"contract","name":"Employment Agreement","required":true},
     {"doc_type":"tax_form","name":"W-4 / I-9","required":true}
   ]'::JSONB),

  ('Client Service Rep (CSR) Onboarding', 'csr',
   'Onboarding workflow for front desk and client service staff.',
   '#22c55e', TRUE,
   '[
     {"title":"Complete new hire paperwork","stage":"pre_hire","task_type":"hr","category":"required","sort_order":1},
     {"title":"System access setup","stage":"pre_hire","task_type":"it","category":"required","sort_order":2},
     {"title":"OSHA training","stage":"orientation","task_type":"compliance","category":"required","sort_order":3},
     {"title":"Front desk orientation","stage":"orientation","task_type":"meeting","category":"required","sort_order":4},
     {"title":"Cornerstone scheduling training","stage":"training","task_type":"training","category":"required","sort_order":5},
     {"title":"Client communication protocol review","stage":"training","task_type":"document","category":"required","sort_order":6},
     {"title":"Phone system training","stage":"training","task_type":"training","category":"required","sort_order":7},
     {"title":"30-day manager review","stage":"manager_review","task_type":"meeting","category":"required","sort_order":8}
   ]'::JSONB,
   '[
     {"doc_type":"id","name":"Government-issued photo ID","required":true},
     {"doc_type":"contract","name":"Employment Agreement","required":true},
     {"doc_type":"tax_form","name":"W-4 / I-9","required":true}
   ]'::JSONB),

  ('HR Staff Onboarding', 'hr',
   'Onboarding workflow for HR team members.',
   '#8b5cf6', TRUE,
   '[
     {"title":"Complete new hire paperwork","stage":"pre_hire","task_type":"hr","category":"required","sort_order":1},
     {"title":"HRIS system access setup","stage":"pre_hire","task_type":"it","category":"required","sort_order":2},
     {"title":"OSHA training","stage":"orientation","task_type":"compliance","category":"required","sort_order":3},
     {"title":"HR policies and procedures review","stage":"orientation","task_type":"document","category":"required","sort_order":4},
     {"title":"ADP payroll system training","stage":"training","task_type":"training","category":"required","sort_order":5},
     {"title":"Benefits administration training","stage":"training","task_type":"training","category":"required","sort_order":6},
     {"title":"Compliance and labor law review","stage":"training","task_type":"compliance","category":"required","sort_order":7},
     {"title":"30-day manager review","stage":"manager_review","task_type":"meeting","category":"required","sort_order":8}
   ]'::JSONB,
   '[
     {"doc_type":"id","name":"Government-issued photo ID","required":true},
     {"doc_type":"contract","name":"Employment Agreement","required":true},
     {"doc_type":"tax_form","name":"W-4 / I-9","required":true}
   ]'::JSONB),

  ('Practice Manager Onboarding', 'manager',
   'Onboarding workflow for new practice managers.',
   '#f59e0b', TRUE,
   '[
     {"title":"Complete new hire paperwork","stage":"pre_hire","task_type":"hr","category":"required","sort_order":1},
     {"title":"Full system access setup","stage":"pre_hire","task_type":"it","category":"required","sort_order":2},
     {"title":"OSHA & safety certification","stage":"orientation","task_type":"compliance","category":"required","sort_order":3},
     {"title":"Meet department heads","stage":"orientation","task_type":"meeting","category":"required","sort_order":4},
     {"title":"Review hospital P&L and financials","stage":"orientation","task_type":"document","category":"required","sort_order":5},
     {"title":"Complete leadership training","stage":"training","task_type":"training","category":"required","sort_order":6},
     {"title":"Learn HR policies and procedures","stage":"training","task_type":"document","category":"required","sort_order":7},
     {"title":"Payroll and scheduling system training","stage":"training","task_type":"training","category":"required","sort_order":8},
     {"title":"Shadow current manager (if applicable)","stage":"training","task_type":"action","category":"optional","sort_order":9},
     {"title":"60-day executive review","stage":"manager_review","task_type":"meeting","category":"required","sort_order":10}
   ]'::JSONB,
   '[
     {"doc_type":"id","name":"Government-issued photo ID","required":true},
     {"doc_type":"contract","name":"Employment Agreement","required":true},
     {"doc_type":"tax_form","name":"W-4 / I-9","required":true},
     {"doc_type":"certification","name":"Management Certification (if any)","required":false}
   ]'::JSONB),

  ('Veterinary Assistant Onboarding', 'vet_assistant',
   'Onboarding workflow for veterinary assistants and technicians.',
   '#ec4899', TRUE,
   '[
     {"title":"Complete new hire paperwork","stage":"pre_hire","task_type":"hr","category":"required","sort_order":1},
     {"title":"System and locker access setup","stage":"pre_hire","task_type":"it","category":"required","sort_order":2},
     {"title":"OSHA & biosafety training","stage":"orientation","task_type":"compliance","category":"required","sort_order":3},
     {"title":"Clinical orientation tour","stage":"orientation","task_type":"meeting","category":"required","sort_order":4},
     {"title":"Meet clinical team","stage":"orientation","task_type":"meeting","category":"required","sort_order":5},
     {"title":"Medical equipment training","stage":"training","task_type":"training","category":"required","sort_order":6},
     {"title":"Cornerstone EMR basics","stage":"training","task_type":"training","category":"required","sort_order":7},
     {"title":"Submit CVT/RVT license copy","stage":"documents","task_type":"document","category":"optional","sort_order":8},
     {"title":"30-day manager review","stage":"manager_review","task_type":"meeting","category":"required","sort_order":9}
   ]'::JSONB,
   '[
     {"doc_type":"id","name":"Government-issued photo ID","required":true},
     {"doc_type":"contract","name":"Employment Agreement","required":true},
     {"doc_type":"tax_form","name":"W-4 / I-9","required":true},
     {"doc_type":"certification","name":"CVT/RVT License (if applicable)","required":false}
   ]'::JSONB)
ON CONFLICT DO NOTHING;
