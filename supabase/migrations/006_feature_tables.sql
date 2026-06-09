-- ============================================================
-- Migration 006: Feature Tables
-- Tasks · Training · Preferences · AI Settings · Support Tickets · Sessions
-- ============================================================

-- ============================================================
-- EXTEND PROFILES
-- ============================================================
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS display_name            TEXT,
  ADD COLUMN IF NOT EXISTS employee_id             TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_name  TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_employee_id
  ON profiles(org_id, employee_id)
  WHERE employee_id IS NOT NULL;

-- ============================================================
-- TASKS
-- ============================================================
CREATE TYPE task_status   AS ENUM ('todo', 'in_progress', 'review', 'done', 'cancelled');
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'urgent');

CREATE TABLE tasks (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  hospital_id  UUID REFERENCES hospitals(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  description  TEXT,
  status       task_status   NOT NULL DEFAULT 'todo',
  priority     task_priority NOT NULL DEFAULT 'medium',
  due_date     TIMESTAMPTZ,
  assigned_to  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_by   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tasks_org         ON tasks(org_id, status);
CREATE INDEX idx_tasks_assigned    ON tasks(assigned_to, status);
CREATE INDEX idx_tasks_created_by  ON tasks(created_by, status);
CREATE INDEX idx_tasks_due         ON tasks(due_date) WHERE due_date IS NOT NULL;

CREATE TABLE task_comments (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_task_comments ON task_comments(task_id, created_at DESC);

CREATE TABLE task_attachments (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  file_url   TEXT NOT NULL,
  file_name  TEXT NOT NULL,
  file_size  INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_task_attachments ON task_attachments(task_id);

-- ============================================================
-- TRAINING
-- ============================================================
CREATE TABLE training_courses (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  hospital_id   UUID REFERENCES hospitals(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  category      TEXT,
  thumbnail_url TEXT,
  is_required   BOOLEAN DEFAULT FALSE,
  due_days      INTEGER,
  created_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  is_published  BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_training_courses_org ON training_courses(org_id, is_published);

CREATE TABLE training_modules (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id    UUID NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'article',
  content_url  TEXT,
  content      TEXT,
  duration_mins INTEGER DEFAULT 0,
  sort_order   INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_training_modules ON training_modules(course_id, sort_order);

CREATE TABLE user_course_enrollments (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  course_id    UUID NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,
  enrolled_at  TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  due_date     TIMESTAMPTZ,
  progress_pct INTEGER DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  UNIQUE(user_id, course_id)
);

CREATE INDEX idx_enrollments_user   ON user_course_enrollments(user_id, completed_at);
CREATE INDEX idx_enrollments_course ON user_course_enrollments(course_id);

CREATE TABLE user_module_progress (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  module_id       UUID NOT NULL REFERENCES training_modules(id) ON DELETE CASCADE,
  completed_at    TIMESTAMPTZ,
  score           INTEGER,
  time_spent_secs INTEGER DEFAULT 0,
  UNIQUE(user_id, module_id)
);

CREATE INDEX idx_module_progress ON user_module_progress(user_id, module_id);

CREATE TABLE training_certificates (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES profiles(id),
  course_id       UUID NOT NULL REFERENCES training_courses(id),
  issued_at       TIMESTAMPTZ DEFAULT NOW(),
  certificate_url TEXT,
  UNIQUE(user_id, course_id)
);

CREATE INDEX idx_certificates_user ON training_certificates(user_id);

-- ============================================================
-- USER PREFERENCES
-- ============================================================
CREATE TABLE user_preferences (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id            UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  theme              TEXT NOT NULL DEFAULT 'system',
  language           TEXT NOT NULL DEFAULT 'en',
  timezone           TEXT NOT NULL DEFAULT 'America/New_York',
  date_format        TEXT NOT NULL DEFAULT 'MM/DD/YYYY',
  time_format        TEXT NOT NULL DEFAULT '12h',
  notification_prefs JSONB NOT NULL DEFAULT '{"email":true,"push":true,"tasks":true,"calendar":true,"messages":true,"training":true}',
  dashboard_layout   JSONB NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- AI USER SETTINGS
-- ============================================================
CREATE TABLE ai_user_settings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  preferred_model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  provider        TEXT NOT NULL DEFAULT 'anthropic',
  voice_enabled   BOOLEAN DEFAULT FALSE,
  voice_id        TEXT,
  saved_prompts   JSONB NOT NULL DEFAULT '[]',
  settings        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SUPPORT TICKETS
-- ============================================================
CREATE TYPE ticket_status   AS ENUM ('open', 'in_progress', 'resolved', 'closed');
CREATE TYPE ticket_priority AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE ticket_category AS ENUM (
  'technical', 'access', 'training', 'billing', 'bug', 'feature_request', 'other'
);

CREATE TABLE support_tickets (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  category    ticket_category NOT NULL DEFAULT 'other',
  priority    ticket_priority NOT NULL DEFAULT 'medium',
  status      ticket_status   NOT NULL DEFAULT 'open',
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolution  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_support_tickets_org    ON support_tickets(org_id, created_at DESC);
CREATE INDEX idx_support_tickets_user   ON support_tickets(user_id, status);
CREATE INDEX idx_support_tickets_status ON support_tickets(status, priority);

CREATE TABLE support_ticket_comments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id   UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ticket_comments ON support_ticket_comments(ticket_id, created_at);

-- ============================================================
-- USER SESSIONS (security center)
-- ============================================================
CREATE TABLE user_sessions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_id  TEXT NOT NULL,
  ip_address  TEXT,
  user_agent  TEXT,
  location    TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  last_seen   TIMESTAMPTZ DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ
);

CREATE INDEX        idx_user_sessions_user    ON user_sessions(user_id, created_at DESC);
CREATE UNIQUE INDEX idx_user_sessions_session ON user_sessions(session_id);

-- ============================================================
-- TRIGGERS
-- ============================================================
CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_training_courses_updated_at
  BEFORE UPDATE ON training_courses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_user_settings_updated_at
  BEFORE UPDATE ON ai_user_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_support_tickets_updated_at
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- NOTE: Enable Supabase Realtime for tasks and notifications
-- In Supabase dashboard → Database → Replication
-- Enable replication for: tasks, notifications, task_comments
-- ============================================================
