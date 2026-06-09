-- ============================================================
-- Migration 012: LMS Extension
-- Extends training tables into a full enterprise LMS
-- ============================================================

-- ── Extend existing training_courses ────────────────────────

ALTER TABLE training_courses
  ADD COLUMN IF NOT EXISTS level              TEXT    NOT NULL DEFAULT 'beginner',
  ADD COLUMN IF NOT EXISTS estimated_hours    DECIMAL(4,1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS compliance_type    TEXT,
  ADD COLUMN IF NOT EXISTS expires_after_days INTEGER,
  ADD COLUMN IF NOT EXISTS pass_score         INTEGER DEFAULT 80,
  ADD COLUMN IF NOT EXISTS tags               TEXT[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cover_color        TEXT    DEFAULT '#f97316',
  ADD COLUMN IF NOT EXISTS sort_order         INTEGER DEFAULT 0;

-- ── Extend existing training_modules ────────────────────────

ALTER TABLE training_modules
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS is_required BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS file_name   TEXT;

-- ── Extend training_certificates ────────────────────────────

ALTER TABLE training_certificates
  ADD COLUMN IF NOT EXISTS expires_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cert_number TEXT,
  ADD COLUMN IF NOT EXISTS issued_by   UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cert_number
  ON training_certificates(cert_number)
  WHERE cert_number IS NOT NULL;

-- ── Quiz Definitions ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS quiz_definitions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id    UUID NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,
  title        TEXT NOT NULL DEFAULT 'Course Quiz',
  description  TEXT,
  pass_score   INTEGER NOT NULL DEFAULT 80,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  time_limit   INTEGER,
  randomize    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(course_id)
);

CREATE INDEX IF NOT EXISTS idx_quiz_course ON quiz_definitions(course_id);

-- ── Quiz Questions ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS quiz_questions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quiz_id       UUID NOT NULL REFERENCES quiz_definitions(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'multiple_choice',
  options       JSONB NOT NULL DEFAULT '[]',
  explanation   TEXT,
  points        INTEGER NOT NULL DEFAULT 1,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quiz_questions ON quiz_questions(quiz_id, sort_order);

-- ── Quiz Attempts ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  quiz_id      UUID NOT NULL REFERENCES quiz_definitions(id) ON DELETE CASCADE,
  course_id    UUID NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,
  answers      JSONB NOT NULL DEFAULT '{}',
  score        INTEGER NOT NULL DEFAULT 0,
  passed       BOOLEAN NOT NULL DEFAULT FALSE,
  started_at   TIMESTAMPTZ DEFAULT NOW(),
  submitted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user   ON quiz_attempts(user_id, quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_course ON quiz_attempts(user_id, course_id);

-- ── Learning Paths ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS learning_paths (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  hospital_id   UUID REFERENCES hospitals(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  role_target   TEXT,
  is_auto_assign BOOLEAN NOT NULL DEFAULT FALSE,
  cover_color   TEXT DEFAULT '#6366f1',
  is_published  BOOLEAN NOT NULL DEFAULT FALSE,
  created_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learning_paths_org ON learning_paths(org_id, is_published);

-- ── Learning Path Courses ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS learning_path_courses (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  path_id     UUID NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE,
  course_id   UUID NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE(path_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_path_courses ON learning_path_courses(path_id, sort_order);

-- ── Learning Path Enrollments ─────────────────────────────────

CREATE TABLE IF NOT EXISTS learning_path_enrollments (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  path_id      UUID NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE,
  enrolled_at  TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  progress_pct INTEGER NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  UNIQUE(user_id, path_id)
);

CREATE INDEX IF NOT EXISTS idx_path_enrollments ON learning_path_enrollments(user_id, path_id);

-- ── Course Assignments ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS course_assignments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id   UUID NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  due_date    TIMESTAMPTZ,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(course_id, assigned_to)
);

CREATE INDEX IF NOT EXISTS idx_assignments_user   ON course_assignments(assigned_to, course_id);
CREATE INDEX IF NOT EXISTS idx_assignments_course ON course_assignments(course_id);
CREATE INDEX IF NOT EXISTS idx_assignments_org    ON course_assignments(org_id);

-- ── RLS ──────────────────────────────────────────────────────

ALTER TABLE quiz_definitions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_questions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_attempts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_paths            ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_path_courses     ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_path_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_assignments        ENABLE ROW LEVEL SECURITY;

-- Quiz definitions
DROP POLICY IF EXISTS "quiz_def_select" ON quiz_definitions;
CREATE POLICY "quiz_def_select" ON quiz_definitions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM training_courses
      WHERE id = quiz_definitions.course_id AND org_id = public.user_org_id()
    )
  );

DROP POLICY IF EXISTS "quiz_def_admin" ON quiz_definitions;
CREATE POLICY "quiz_def_admin" ON quiz_definitions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM training_courses
      WHERE id = quiz_definitions.course_id AND org_id = public.user_org_id()
    )
    AND (
      public.user_has_role('super_admin'::app_role) OR public.user_has_role('org_admin'::app_role)
      OR public.user_has_role('hospital_admin'::app_role) OR public.user_has_role('practice_manager'::app_role)
      OR public.user_has_role('hr'::app_role)
    )
  );

-- Quiz questions
DROP POLICY IF EXISTS "quiz_q_select" ON quiz_questions;
CREATE POLICY "quiz_q_select" ON quiz_questions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM quiz_definitions qd
      JOIN training_courses tc ON tc.id = qd.course_id
      WHERE qd.id = quiz_questions.quiz_id AND tc.org_id = public.user_org_id()
    )
  );

DROP POLICY IF EXISTS "quiz_q_admin" ON quiz_questions;
CREATE POLICY "quiz_q_admin" ON quiz_questions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM quiz_definitions qd
      JOIN training_courses tc ON tc.id = qd.course_id
      WHERE qd.id = quiz_questions.quiz_id AND tc.org_id = public.user_org_id()
    )
    AND (
      public.user_has_role('super_admin'::app_role) OR public.user_has_role('org_admin'::app_role)
      OR public.user_has_role('hospital_admin'::app_role) OR public.user_has_role('practice_manager'::app_role)
      OR public.user_has_role('hr'::app_role)
    )
  );

-- Quiz attempts: users manage their own, admins see all
DROP POLICY IF EXISTS "quiz_attempts_own" ON quiz_attempts;
CREATE POLICY "quiz_attempts_own" ON quiz_attempts
  FOR ALL USING (user_id = auth.uid());

DROP POLICY IF EXISTS "quiz_attempts_admin_read" ON quiz_attempts;
CREATE POLICY "quiz_attempts_admin_read" ON quiz_attempts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM training_courses
      WHERE id = quiz_attempts.course_id AND org_id = public.user_org_id()
    )
    AND (
      public.user_has_role('super_admin'::app_role) OR public.user_has_role('org_admin'::app_role)
      OR public.user_has_role('hospital_admin'::app_role) OR public.user_has_role('practice_manager'::app_role)
      OR public.user_has_role('hr'::app_role)
    )
  );

-- Learning paths
DROP POLICY IF EXISTS "paths_select" ON learning_paths;
CREATE POLICY "paths_select" ON learning_paths
  FOR SELECT USING (org_id = public.user_org_id() AND is_published = TRUE);

DROP POLICY IF EXISTS "paths_admin" ON learning_paths;
CREATE POLICY "paths_admin" ON learning_paths
  FOR ALL USING (
    org_id = public.user_org_id()
    AND (
      public.user_has_role('super_admin'::app_role) OR public.user_has_role('org_admin'::app_role)
      OR public.user_has_role('hospital_admin'::app_role) OR public.user_has_role('practice_manager'::app_role)
      OR public.user_has_role('hr'::app_role)
    )
  );

-- Path courses
DROP POLICY IF EXISTS "path_courses_select" ON learning_path_courses;
CREATE POLICY "path_courses_select" ON learning_path_courses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM learning_paths
      WHERE id = learning_path_courses.path_id AND org_id = public.user_org_id()
    )
  );

DROP POLICY IF EXISTS "path_courses_admin" ON learning_path_courses;
CREATE POLICY "path_courses_admin" ON learning_path_courses
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM learning_paths
      WHERE id = learning_path_courses.path_id AND org_id = public.user_org_id()
    )
    AND (
      public.user_has_role('super_admin'::app_role) OR public.user_has_role('org_admin'::app_role)
      OR public.user_has_role('hospital_admin'::app_role) OR public.user_has_role('practice_manager'::app_role)
      OR public.user_has_role('hr'::app_role)
    )
  );

-- Path enrollments
DROP POLICY IF EXISTS "path_enrollments_own" ON learning_path_enrollments;
CREATE POLICY "path_enrollments_own" ON learning_path_enrollments
  FOR ALL USING (user_id = auth.uid());

DROP POLICY IF EXISTS "path_enrollments_admin" ON learning_path_enrollments;
CREATE POLICY "path_enrollments_admin" ON learning_path_enrollments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM learning_paths
      WHERE id = learning_path_enrollments.path_id AND org_id = public.user_org_id()
    )
    AND (
      public.user_has_role('super_admin'::app_role) OR public.user_has_role('org_admin'::app_role)
      OR public.user_has_role('hospital_admin'::app_role) OR public.user_has_role('practice_manager'::app_role)
      OR public.user_has_role('hr'::app_role)
    )
  );

-- Course assignments
DROP POLICY IF EXISTS "assignments_own" ON course_assignments;
CREATE POLICY "assignments_own" ON course_assignments
  FOR SELECT USING (assigned_to = auth.uid());

DROP POLICY IF EXISTS "assignments_admin" ON course_assignments;
CREATE POLICY "assignments_admin" ON course_assignments
  FOR ALL USING (
    org_id = public.user_org_id()
    AND (
      public.user_has_role('super_admin'::app_role) OR public.user_has_role('org_admin'::app_role)
      OR public.user_has_role('hospital_admin'::app_role) OR public.user_has_role('practice_manager'::app_role)
      OR public.user_has_role('hr'::app_role)
    )
  );

-- ── Seed default learning paths ───────────────────────────────
-- (Applied per-org when first admin visits — handled in application layer)
