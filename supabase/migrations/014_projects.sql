-- ============================================================
-- Migration 014: Project Management Module
-- Asana/ClickUp-inspired project & task tracking for VetOS
-- ============================================================

-- ── Projects ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  hospital_id     UUID REFERENCES hospitals(id) ON DELETE SET NULL,
  department_id   UUID REFERENCES departments(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('planning','active','on_hold','completed','cancelled')),
  priority        TEXT NOT NULL DEFAULT 'medium'
                  CHECK (priority IN ('low','medium','high','urgent')),
  owner_id        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  start_date      DATE,
  due_date        DATE,
  completed_at    TIMESTAMPTZ,
  progress_pct    INTEGER NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  color           TEXT NOT NULL DEFAULT '#f97316',
  is_cross_hospital BOOLEAN NOT NULL DEFAULT FALSE,
  tags            TEXT[] DEFAULT '{}',
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Project Tasks ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_tasks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'todo'
                  CHECK (status IN ('todo','in_progress','review','done','cancelled')),
  priority        TEXT NOT NULL DEFAULT 'medium'
                  CHECK (priority IN ('low','medium','high','urgent')),
  assigned_to     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  due_date        DATE,
  start_date      DATE,
  completed_at    TIMESTAMPTZ,
  position        INTEGER NOT NULL DEFAULT 0,
  section         TEXT NOT NULL DEFAULT 'To Do',
  tags            TEXT[] DEFAULT '{}',
  estimated_hrs   NUMERIC(6,2),
  actual_hrs      NUMERIC(6,2),
  parent_task_id  UUID REFERENCES project_tasks(id) ON DELETE SET NULL,
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Project Members ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_members (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member'
              CHECK (role IN ('owner','manager','member','viewer')),
  joined_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, user_id)
);

-- ── Task Comments ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_comments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id     UUID REFERENCES project_tasks(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Project Files ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_files (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id      UUID REFERENCES project_tasks(id) ON DELETE SET NULL,
  uploaded_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  file_name    TEXT NOT NULL,
  file_type    TEXT,
  file_size    INTEGER,
  storage_path TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── Project Activity Log ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_activity (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id       UUID REFERENCES project_tasks(id) ON DELETE SET NULL,
  user_id       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,
  resource_type TEXT,
  old_data      JSONB,
  new_data      JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Project Templates ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_templates (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id           UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT,
  category         TEXT,
  color            TEXT DEFAULT '#f97316',
  icon             TEXT DEFAULT 'folder',
  default_sections TEXT[] DEFAULT ARRAY['To Do','In Progress','Review','Done'],
  default_tasks    JSONB DEFAULT '[]',
  is_system        BOOLEAN NOT NULL DEFAULT FALSE,
  created_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── Seed: System Templates ────────────────────────────────────
INSERT INTO project_templates (name, description, category, color, icon, is_system, default_tasks)
VALUES
  ('Hospital Event Planning',
   'Coordinate staff events, town halls, and hospital gatherings.',
   'events', '#f97316', 'calendar', TRUE,
   '[
     {"title":"Define event goals","section":"To Do","priority":"high"},
     {"title":"Book venue / reserve space","section":"To Do","priority":"medium"},
     {"title":"Send invitations to staff","section":"To Do","priority":"medium"},
     {"title":"Arrange catering","section":"To Do","priority":"low"},
     {"title":"Prepare agenda","section":"To Do","priority":"high"},
     {"title":"Confirm attendance list","section":"To Do","priority":"medium"},
     {"title":"Post-event debrief","section":"To Do","priority":"low"}
   ]'::JSONB),

  ('Staff Onboarding',
   'Structured workflow for onboarding new veterinary staff members.',
   'hr', '#3b82f6', 'users', TRUE,
   '[
     {"title":"Prepare workstation and access","section":"To Do","priority":"urgent"},
     {"title":"Schedule orientation meeting","section":"To Do","priority":"high"},
     {"title":"Assign required training courses","section":"To Do","priority":"high"},
     {"title":"Introduce to team","section":"To Do","priority":"medium"},
     {"title":"Set up Cornerstone access","section":"To Do","priority":"high"},
     {"title":"Complete OSHA training","section":"To Do","priority":"urgent"},
     {"title":"30-day check-in","section":"To Do","priority":"medium"}
   ]'::JSONB),

  ('Compliance Audit',
   'Track regulatory compliance checks and corrective actions.',
   'compliance', '#ef4444', 'shield', TRUE,
   '[
     {"title":"Pull compliance reports","section":"To Do","priority":"urgent"},
     {"title":"Review overdue training","section":"To Do","priority":"high"},
     {"title":"Audit documentation","section":"To Do","priority":"high"},
     {"title":"Interview key staff","section":"To Do","priority":"medium"},
     {"title":"Document findings","section":"To Do","priority":"high"},
     {"title":"Create corrective action plan","section":"To Do","priority":"urgent"},
     {"title":"Schedule follow-up review","section":"To Do","priority":"medium"}
   ]'::JSONB),

  ('Department Training Program',
   'Plan and execute a department-wide training initiative.',
   'training', '#22c55e', 'graduation-cap', TRUE,
   '[
     {"title":"Identify training needs","section":"To Do","priority":"high"},
     {"title":"Select courses and content","section":"To Do","priority":"high"},
     {"title":"Enroll staff","section":"To Do","priority":"urgent"},
     {"title":"Schedule training sessions","section":"To Do","priority":"high"},
     {"title":"Monitor completion","section":"To Do","priority":"medium"},
     {"title":"Issue certificates","section":"To Do","priority":"medium"},
     {"title":"Report compliance status","section":"To Do","priority":"high"}
   ]'::JSONB)
ON CONFLICT DO NOTHING;

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_projects_org        ON projects(org_id);
CREATE INDEX IF NOT EXISTS idx_projects_hospital   ON projects(hospital_id);
CREATE INDEX IF NOT EXISTS idx_projects_owner      ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_status     ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_due        ON projects(due_date);

CREATE INDEX IF NOT EXISTS idx_ptasks_project      ON project_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_ptasks_assigned     ON project_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_ptasks_status       ON project_tasks(status);
CREATE INDEX IF NOT EXISTS idx_ptasks_due          ON project_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_ptasks_position     ON project_tasks(project_id, position);

CREATE INDEX IF NOT EXISTS idx_pmembers_project    ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_pmembers_user       ON project_members(user_id);

CREATE INDEX IF NOT EXISTS idx_pcomments_task      ON project_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_pcomments_project   ON project_comments(project_id);

CREATE INDEX IF NOT EXISTS idx_pactivity_project   ON project_activity(project_id, created_at DESC);

-- ── updated_at trigger ────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_projects_updated_at      ON projects;
DROP TRIGGER IF EXISTS trg_project_tasks_updated_at ON project_tasks;
DROP TRIGGER IF EXISTS trg_project_comments_updated ON project_comments;

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_project_tasks_updated_at
  BEFORE UPDATE ON project_tasks FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_project_comments_updated
  BEFORE UPDATE ON project_comments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE projects          ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_tasks     ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_comments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_files     ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_activity  ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_templates ENABLE ROW LEVEL SECURITY;

-- Projects: any org member can read; creators/admins can write
DROP POLICY IF EXISTS "projects_select" ON projects;
DROP POLICY IF EXISTS "projects_insert" ON projects;
DROP POLICY IF EXISTS "projects_update" ON projects;
DROP POLICY IF EXISTS "projects_delete" ON projects;

CREATE POLICY "projects_select" ON projects FOR SELECT
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "projects_insert" ON projects FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "projects_update" ON projects FOR UPDATE
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "projects_delete" ON projects FOR DELETE
  USING (created_by = auth.uid()
    OR org_id IN (
      SELECT p.org_id FROM profiles p
      JOIN user_hospital_roles r ON r.user_id = p.id
      WHERE p.id = auth.uid()
        AND r.role IN ('super_admin','org_admin','hospital_admin','practice_manager')
    ));

-- Tasks
DROP POLICY IF EXISTS "ptasks_select" ON project_tasks;
DROP POLICY IF EXISTS "ptasks_insert" ON project_tasks;
DROP POLICY IF EXISTS "ptasks_update" ON project_tasks;
DROP POLICY IF EXISTS "ptasks_delete" ON project_tasks;

CREATE POLICY "ptasks_select" ON project_tasks FOR SELECT
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "ptasks_insert" ON project_tasks FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "ptasks_update" ON project_tasks FOR UPDATE
  USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "ptasks_delete" ON project_tasks FOR DELETE
  USING (created_by = auth.uid()
    OR org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- Members, Comments, Files, Activity, Templates — org-scoped
DROP POLICY IF EXISTS "pmembers_select" ON project_members;
DROP POLICY IF EXISTS "pmembers_write"  ON project_members;
CREATE POLICY "pmembers_select" ON project_members FOR SELECT
  USING (project_id IN (SELECT id FROM projects WHERE org_id IN (
    SELECT org_id FROM profiles WHERE id = auth.uid())));
CREATE POLICY "pmembers_write" ON project_members FOR ALL
  USING (project_id IN (SELECT id FROM projects WHERE org_id IN (
    SELECT org_id FROM profiles WHERE id = auth.uid())));

DROP POLICY IF EXISTS "pcomments_select" ON project_comments;
DROP POLICY IF EXISTS "pcomments_insert" ON project_comments;
DROP POLICY IF EXISTS "pcomments_delete" ON project_comments;
CREATE POLICY "pcomments_select" ON project_comments FOR SELECT
  USING (project_id IN (SELECT id FROM projects WHERE org_id IN (
    SELECT org_id FROM profiles WHERE id = auth.uid())));
CREATE POLICY "pcomments_insert" ON project_comments FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "pcomments_delete" ON project_comments FOR DELETE
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "pfiles_select" ON project_files;
DROP POLICY IF EXISTS "pfiles_insert" ON project_files;
CREATE POLICY "pfiles_select" ON project_files FOR SELECT
  USING (project_id IN (SELECT id FROM projects WHERE org_id IN (
    SELECT org_id FROM profiles WHERE id = auth.uid())));
CREATE POLICY "pfiles_insert" ON project_files FOR INSERT
  WITH CHECK (uploaded_by = auth.uid());

DROP POLICY IF EXISTS "pactivity_select" ON project_activity;
CREATE POLICY "pactivity_select" ON project_activity FOR SELECT
  USING (project_id IN (SELECT id FROM projects WHERE org_id IN (
    SELECT org_id FROM profiles WHERE id = auth.uid())));

DROP POLICY IF EXISTS "ptemplates_select" ON project_templates;
CREATE POLICY "ptemplates_select" ON project_templates FOR SELECT
  USING (is_system = TRUE
    OR org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));
