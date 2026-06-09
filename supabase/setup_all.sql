-- ============================================================
-- VetOS — Full Database Setup Script
-- Run this ONCE in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ============================================================
-- MIGRATION 001: Core Tables
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

CREATE TABLE IF NOT EXISTS organizations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  logo_url    TEXT,
  settings    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hospitals (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  address     TEXT,
  phone       TEXT,
  timezone    TEXT DEFAULT 'America/New_York',
  color       TEXT DEFAULT '#2563EB',
  settings    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, slug)
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE app_role AS ENUM (
      'super_admin','org_admin','hospital_admin','practice_manager',
      'doctor','csr','va','marketing','hr','it_admin','viewer'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL REFERENCES organizations(id),
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  email         TEXT NOT NULL,
  avatar_url    TEXT,
  job_title     TEXT,
  department    TEXT,
  phone         TEXT,
  microsoft_id  TEXT UNIQUE,
  is_active     BOOLEAN DEFAULT TRUE,
  last_seen_at  TIMESTAMPTZ,
  settings      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_org   ON profiles(org_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

CREATE TABLE IF NOT EXISTS user_hospital_roles (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  role        app_role NOT NULL,
  granted_by  UUID REFERENCES profiles(id),
  granted_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, hospital_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user     ON user_hospital_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_hospital ON user_hospital_roles(hospital_id);

CREATE TABLE IF NOT EXISTS departments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_departments (
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, department_id)
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
    CREATE TYPE notification_type AS ENUM (
      'message_mention','channel_message','task_assigned','task_due',
      'workflow_update','calendar_reminder','training_assigned',
      'document_shared','system_announcement'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id      UUID NOT NULL REFERENCES organizations(id),
  type        notification_type NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT,
  action_url  TEXT,
  is_read     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID NOT NULL REFERENCES organizations(id),
  hospital_id   UUID REFERENCES hospitals(id),
  user_id       UUID REFERENCES profiles(id),
  action        TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id   UUID,
  old_data      JSONB,
  new_data      JSONB,
  ip_address    INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_org  ON audit_logs(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id, created_at DESC);

-- Helper functions
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- Custom JWT/role helpers in public schema (auth schema is restricted in Supabase)
CREATE OR REPLACE FUNCTION public.get_org_id() RETURNS UUID AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'org_id')::UUID;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_accessible_hospital_ids() RETURNS UUID[] AS $$
  SELECT ARRAY(SELECT hospital_id FROM user_hospital_roles WHERE user_id = auth.uid());
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.has_role(required_role app_role) RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM user_hospital_roles WHERE user_id = auth.uid() AND role = required_role);
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.has_hospital_role(h_id UUID, required_roles app_role[]) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_hospital_roles
    WHERE user_id = auth.uid() AND hospital_id = h_id AND role = ANY(required_roles)
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

DROP TRIGGER IF EXISTS update_organizations_updated_at ON organizations;
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_hospitals_updated_at ON hospitals;
CREATE TRIGGER update_hospitals_updated_at BEFORE UPDATE ON hospitals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- MIGRATION 002: Communication Tables
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'channel_type') THEN
    CREATE TYPE channel_type AS ENUM ('public','private','announcement','direct');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS channels (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID NOT NULL REFERENCES organizations(id),
  hospital_id   UUID REFERENCES hospitals(id),
  name          TEXT NOT NULL,
  description   TEXT,
  channel_type  channel_type DEFAULT 'public',
  created_by    UUID REFERENCES profiles(id),
  is_archived   BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_channels_org      ON channels(org_id);
CREATE INDEX IF NOT EXISTS idx_channels_hospital ON channels(hospital_id);

CREATE TABLE IF NOT EXISTS channel_members (
  channel_id    UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at     TIMESTAMPTZ DEFAULT NOW(),
  last_read_at  TIMESTAMPTZ DEFAULT NOW(),
  is_admin      BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (channel_id, user_id)
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_role') THEN
    CREATE TYPE message_role AS ENUM ('user','assistant','system');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id      UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(id),
  content         TEXT NOT NULL,
  content_type    TEXT DEFAULT 'text',
  parent_id       UUID REFERENCES messages(id),
  attachment_url  TEXT,
  attachment_name TEXT,
  is_edited       BOOLEAN DEFAULT FALSE,
  is_deleted      BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_parent  ON messages(parent_id);
CREATE INDEX IF NOT EXISTS idx_messages_user    ON messages(user_id);

CREATE TABLE IF NOT EXISTS message_reactions (
  message_id  UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji       TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id, emoji)
);

DROP TRIGGER IF EXISTS update_messages_updated_at ON messages;
CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- MIGRATION 003: Calendar Tables
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_type') THEN
    CREATE TYPE event_type AS ENUM (
      'meeting','training','pto','hospital_event','onboarding',
      'doctor_meeting','maintenance','other'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS calendar_events (
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

CREATE INDEX IF NOT EXISTS idx_events_hospital ON calendar_events(hospital_id);
CREATE INDEX IF NOT EXISTS idx_events_org      ON calendar_events(org_id);
CREATE INDEX IF NOT EXISTS idx_events_time     ON calendar_events(start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_events_type     ON calendar_events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_outlook  ON calendar_events(outlook_event_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attendance_status') THEN
    CREATE TYPE attendance_status AS ENUM ('invited','accepted','declined','tentative');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS calendar_event_attendees (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id      UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES profiles(id),
  email         TEXT,
  status        attendance_status DEFAULT 'invited',
  is_organizer  BOOLEAN DEFAULT FALSE,
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_attendees_event ON calendar_event_attendees(event_id);
CREATE INDEX IF NOT EXISTS idx_attendees_user  ON calendar_event_attendees(user_id);

CREATE TABLE IF NOT EXISTS calendar_conflicts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hospital_id     UUID NOT NULL REFERENCES hospitals(id),
  event_id_1      UUID NOT NULL REFERENCES calendar_events(id),
  event_id_2      UUID NOT NULL REFERENCES calendar_events(id),
  user_id         UUID REFERENCES profiles(id),
  detected_at     TIMESTAMPTZ DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ,
  resolution_note TEXT
);

CREATE TABLE IF NOT EXISTS outlook_sync_tokens (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                 UUID NOT NULL REFERENCES profiles(id),
  hospital_id             UUID REFERENCES hospitals(id),
  calendar_id             TEXT NOT NULL,
  delta_token             TEXT,
  webhook_subscription_id TEXT,
  webhook_expiry          TIMESTAMPTZ,
  access_token            TEXT,
  refresh_token           TEXT,
  token_expiry            TIMESTAMPTZ,
  synced_at               TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, calendar_id)
);

DROP TRIGGER IF EXISTS update_calendar_events_updated_at ON calendar_events;
CREATE TRIGGER update_calendar_events_updated_at BEFORE UPDATE ON calendar_events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- MIGRATION 004: AI / Vector Tables
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'article_status') THEN
    CREATE TYPE article_status AS ENUM ('draft','review','published','archived');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS kb_categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES organizations(id),
  hospital_id UUID REFERENCES hospitals(id),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  icon        TEXT,
  parent_id   UUID REFERENCES kb_categories(id),
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, slug)
);

CREATE TABLE IF NOT EXISTS kb_articles (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id            UUID NOT NULL REFERENCES organizations(id),
  hospital_id       UUID REFERENCES hospitals(id),
  category_id       UUID REFERENCES kb_categories(id),
  title             TEXT NOT NULL,
  slug              TEXT NOT NULL,
  content           TEXT NOT NULL,
  content_text      TEXT,
  status            article_status DEFAULT 'draft',
  author_id         UUID REFERENCES profiles(id),
  reviewer_id       UUID REFERENCES profiles(id),
  published_at      TIMESTAMPTZ,
  version           INTEGER DEFAULT 1,
  tags              TEXT[],
  view_count        INTEGER DEFAULT 0,
  helpful_count     INTEGER DEFAULT 0,
  not_helpful_count INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_kb_articles_org     ON kb_articles(org_id);
CREATE INDEX IF NOT EXISTS idx_kb_articles_status  ON kb_articles(status);

CREATE TABLE IF NOT EXISTS kb_article_versions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  article_id  UUID NOT NULL REFERENCES kb_articles(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  version     INTEGER NOT NULL,
  edited_by   UUID REFERENCES profiles(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_chunks (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES organizations(id),
  hospital_id UUID REFERENCES hospitals(id),
  source_type TEXT NOT NULL,
  source_id   UUID NOT NULL,
  chunk_index INTEGER NOT NULL,
  content     TEXT NOT NULL,
  token_count INTEGER,
  embedding   vector(1536),
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chunks_org    ON document_chunks(org_id);
CREATE INDEX IF NOT EXISTS idx_chunks_source ON document_chunks(source_type, source_id);

CREATE TABLE IF NOT EXISTS ai_conversations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  hospital_id UUID REFERENCES hospitals(id),
  title       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_user ON ai_conversations(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role            message_role NOT NULL,
  content         TEXT NOT NULL,
  source_chunks   JSONB,
  tokens_used     INTEGER,
  feedback        SMALLINT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_conv ON ai_messages(conversation_id, created_at);

DROP TRIGGER IF EXISTS update_kb_articles_updated_at ON kb_articles;
CREATE TRIGGER update_kb_articles_updated_at BEFORE UPDATE ON kb_articles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_ai_conversations_updated_at ON ai_conversations;
CREATE TRIGGER update_ai_conversations_updated_at BEFORE UPDATE ON ai_conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- MIGRATION 005: Enable RLS
-- ============================================================

ALTER TABLE organizations              ENABLE ROW LEVEL SECURITY;
ALTER TABLE hospitals                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_hospital_roles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments                ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_departments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications              ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_members            ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events            ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_event_attendees   ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_conflicts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlook_sync_tokens        ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_articles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_categories              ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_article_versions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages                ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orgs_select_members"            ON organizations;
DROP POLICY IF EXISTS "hospitals_select_accessible"    ON hospitals;
DROP POLICY IF EXISTS "profiles_select_org"            ON profiles;
DROP POLICY IF EXISTS "profiles_update_own"            ON profiles;
DROP POLICY IF EXISTS "profiles_insert_own"            ON profiles;
DROP POLICY IF EXISTS "roles_select_org"               ON user_hospital_roles;
DROP POLICY IF EXISTS "notifications_own"              ON notifications;
DROP POLICY IF EXISTS "audit_logs_select_admins"       ON audit_logs;
DROP POLICY IF EXISTS "channels_select_accessible"     ON channels;
DROP POLICY IF EXISTS "messages_select_channel_members" ON messages;
DROP POLICY IF EXISTS "messages_insert_channel_members" ON messages;
DROP POLICY IF EXISTS "messages_update_own"            ON messages;
DROP POLICY IF EXISTS "messages_delete_own"            ON messages;
DROP POLICY IF EXISTS "events_select_hospital"         ON calendar_events;
DROP POLICY IF EXISTS "events_insert_managers"         ON calendar_events;
DROP POLICY IF EXISTS "events_update_creator_or_manager" ON calendar_events;
DROP POLICY IF EXISTS "kb_select_published"            ON kb_articles;
DROP POLICY IF EXISTS "kb_insert_staff"                ON kb_articles;
DROP POLICY IF EXISTS "kb_update_author_or_admin"      ON kb_articles;
DROP POLICY IF EXISTS "ai_conversations_own"           ON ai_conversations;
DROP POLICY IF EXISTS "ai_messages_own"                ON ai_messages;
DROP POLICY IF EXISTS "chunks_select_org"              ON document_chunks;
DROP POLICY IF EXISTS "outlook_tokens_own"             ON outlook_sync_tokens;
DROP POLICY IF EXISTS "conflicts_select_hospital"      ON calendar_conflicts;

CREATE POLICY "orgs_select_members"         ON organizations FOR SELECT USING (id = public.get_org_id());
CREATE POLICY "hospitals_select_accessible" ON hospitals     FOR SELECT USING (org_id = public.get_org_id() AND id = ANY(public.get_accessible_hospital_ids()));
CREATE POLICY "profiles_select_org"         ON profiles      FOR SELECT USING (org_id = public.get_org_id());
CREATE POLICY "profiles_update_own"         ON profiles      FOR UPDATE USING (id = auth.uid());
CREATE POLICY "profiles_insert_own"         ON profiles      FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY "roles_select_org" ON user_hospital_roles FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND org_id = (SELECT org_id FROM profiles WHERE id = user_hospital_roles.user_id))
);

CREATE POLICY "notifications_own"        ON notifications FOR ALL USING (user_id = auth.uid());
CREATE POLICY "audit_logs_select_admins" ON audit_logs    FOR SELECT USING (
  org_id = public.get_org_id() AND (public.has_role('hospital_admin') OR public.has_role('org_admin') OR public.has_role('super_admin'))
);

CREATE POLICY "channels_select_accessible" ON channels FOR SELECT USING (
  org_id = public.get_org_id() AND (hospital_id = ANY(public.get_accessible_hospital_ids()) OR hospital_id IS NULL)
  AND (channel_type IN ('public','announcement') OR EXISTS (SELECT 1 FROM channel_members WHERE channel_id = channels.id AND user_id = auth.uid()))
);

CREATE POLICY "messages_select_channel_members" ON messages FOR SELECT USING (EXISTS (SELECT 1 FROM channel_members WHERE channel_id = messages.channel_id AND user_id = auth.uid()));
CREATE POLICY "messages_insert_channel_members" ON messages FOR INSERT WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM channel_members WHERE channel_id = messages.channel_id AND user_id = auth.uid()));
CREATE POLICY "messages_update_own" ON messages FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "messages_delete_own" ON messages FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "events_select_hospital" ON calendar_events FOR SELECT USING (org_id = public.get_org_id() AND (hospital_id = ANY(public.get_accessible_hospital_ids()) OR hospital_id IS NULL));
CREATE POLICY "events_insert_managers" ON calendar_events FOR INSERT WITH CHECK (
  org_id = public.get_org_id() AND created_by = auth.uid()
  AND (hospital_id IS NULL OR public.has_hospital_role(hospital_id, ARRAY['super_admin','org_admin','hospital_admin','practice_manager']::app_role[]))
);
CREATE POLICY "events_update_creator_or_manager" ON calendar_events FOR UPDATE USING (
  created_by = auth.uid() OR public.has_hospital_role(hospital_id, ARRAY['super_admin','org_admin','hospital_admin','practice_manager']::app_role[])
);

CREATE POLICY "kb_select_published" ON kb_articles FOR SELECT USING (
  org_id = public.get_org_id() AND (hospital_id = ANY(public.get_accessible_hospital_ids()) OR hospital_id IS NULL)
  AND (status = 'published' OR author_id = auth.uid() OR public.has_role('hospital_admin') OR public.has_role('org_admin') OR public.has_role('super_admin'))
);
CREATE POLICY "kb_insert_staff"          ON kb_articles FOR INSERT WITH CHECK (org_id = public.get_org_id() AND author_id = auth.uid());
CREATE POLICY "kb_update_author_or_admin" ON kb_articles FOR UPDATE USING (author_id = auth.uid() OR public.has_role('hospital_admin') OR public.has_role('org_admin') OR public.has_role('super_admin'));

CREATE POLICY "ai_conversations_own" ON ai_conversations FOR ALL USING (user_id = auth.uid());
CREATE POLICY "ai_messages_own"      ON ai_messages      FOR ALL USING (EXISTS (SELECT 1 FROM ai_conversations WHERE id = ai_messages.conversation_id AND user_id = auth.uid()));
CREATE POLICY "chunks_select_org"    ON document_chunks  FOR SELECT USING (org_id = public.get_org_id() AND (hospital_id = ANY(public.get_accessible_hospital_ids()) OR hospital_id IS NULL));
CREATE POLICY "outlook_tokens_own"   ON outlook_sync_tokens FOR ALL USING (user_id = auth.uid());
CREATE POLICY "conflicts_select_hospital" ON calendar_conflicts FOR SELECT USING (hospital_id = ANY(public.get_accessible_hospital_ids()));

-- ============================================================
-- MIGRATION 006: Feature Tables
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS display_name            TEXT,
  ADD COLUMN IF NOT EXISTS employee_id             TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_name  TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_employee_id ON profiles(org_id, employee_id) WHERE employee_id IS NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status') THEN
    CREATE TYPE task_status AS ENUM ('todo','in_progress','review','done','cancelled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_priority') THEN
    CREATE TYPE task_priority AS ENUM ('low','medium','high','urgent');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS tasks (
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

CREATE INDEX IF NOT EXISTS idx_tasks_org        ON tasks(org_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned   ON tasks(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by, status);
CREATE INDEX IF NOT EXISTS idx_tasks_due        ON tasks(due_date) WHERE due_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS task_comments (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_comments ON task_comments(task_id, created_at DESC);

CREATE TABLE IF NOT EXISTS task_attachments (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  file_url   TEXT NOT NULL,
  file_name  TEXT NOT NULL,
  file_size  INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_attachments ON task_attachments(task_id);

CREATE TABLE IF NOT EXISTS training_courses (
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

CREATE INDEX IF NOT EXISTS idx_training_courses_org ON training_courses(org_id, is_published);

CREATE TABLE IF NOT EXISTS training_modules (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id     UUID NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  content_type  TEXT NOT NULL DEFAULT 'article',
  content_url   TEXT,
  content       TEXT,
  duration_mins INTEGER DEFAULT 0,
  sort_order    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_modules ON training_modules(course_id, sort_order);

CREATE TABLE IF NOT EXISTS user_course_enrollments (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  course_id    UUID NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,
  enrolled_at  TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  due_date     TIMESTAMPTZ,
  progress_pct INTEGER DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  UNIQUE(user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_enrollments_user   ON user_course_enrollments(user_id, completed_at);
CREATE INDEX IF NOT EXISTS idx_enrollments_course ON user_course_enrollments(course_id);

CREATE TABLE IF NOT EXISTS user_module_progress (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  module_id       UUID NOT NULL REFERENCES training_modules(id) ON DELETE CASCADE,
  completed_at    TIMESTAMPTZ,
  score           INTEGER,
  time_spent_secs INTEGER DEFAULT 0,
  UNIQUE(user_id, module_id)
);

CREATE INDEX IF NOT EXISTS idx_module_progress ON user_module_progress(user_id, module_id);

CREATE TABLE IF NOT EXISTS training_certificates (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES profiles(id),
  course_id       UUID NOT NULL REFERENCES training_courses(id),
  issued_at       TIMESTAMPTZ DEFAULT NOW(),
  certificate_url TEXT,
  UNIQUE(user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_certificates_user ON training_certificates(user_id);

CREATE TABLE IF NOT EXISTS user_preferences (
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

CREATE TABLE IF NOT EXISTS ai_user_settings (
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

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_status') THEN
    CREATE TYPE ticket_status AS ENUM ('open','in_progress','resolved','closed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_priority') THEN
    CREATE TYPE ticket_priority AS ENUM ('low','medium','high','critical');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_category') THEN
    CREATE TYPE ticket_category AS ENUM ('technical','access','training','billing','bug','feature_request','other');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS support_tickets (
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

CREATE INDEX IF NOT EXISTS idx_support_tickets_org    ON support_tickets(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user   ON support_tickets(user_id, status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status, priority);

CREATE TABLE IF NOT EXISTS support_ticket_comments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id   UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_comments ON support_ticket_comments(ticket_id, created_at);

CREATE TABLE IF NOT EXISTS user_sessions (
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

CREATE INDEX        IF NOT EXISTS idx_user_sessions_user    ON user_sessions(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_session ON user_sessions(session_id);

DROP TRIGGER IF EXISTS update_tasks_updated_at              ON tasks;
DROP TRIGGER IF EXISTS update_training_courses_updated_at   ON training_courses;
DROP TRIGGER IF EXISTS update_user_preferences_updated_at   ON user_preferences;
DROP TRIGGER IF EXISTS update_ai_user_settings_updated_at   ON ai_user_settings;
DROP TRIGGER IF EXISTS update_support_tickets_updated_at    ON support_tickets;

CREATE TRIGGER update_tasks_updated_at            BEFORE UPDATE ON tasks            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_training_courses_updated_at BEFORE UPDATE ON training_courses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON user_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ai_user_settings_updated_at BEFORE UPDATE ON ai_user_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_support_tickets_updated_at  BEFORE UPDATE ON support_tickets  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- MIGRATION 007: RLS for Feature Tables
-- ============================================================

ALTER TABLE tasks                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_attachments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_courses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_modules        ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_course_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_module_progress    ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_certificates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_user_settings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions           ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tasks_select_org"              ON tasks;
DROP POLICY IF EXISTS "tasks_insert_org"              ON tasks;
DROP POLICY IF EXISTS "tasks_update_involved"         ON tasks;
DROP POLICY IF EXISTS "tasks_delete_creator_or_admin" ON tasks;
DROP POLICY IF EXISTS "task_comments_select"          ON task_comments;
DROP POLICY IF EXISTS "task_comments_insert"          ON task_comments;
DROP POLICY IF EXISTS "task_comments_delete_own"      ON task_comments;
DROP POLICY IF EXISTS "task_attachments_select"       ON task_attachments;
DROP POLICY IF EXISTS "task_attachments_insert"       ON task_attachments;
DROP POLICY IF EXISTS "task_attachments_delete_own"   ON task_attachments;
DROP POLICY IF EXISTS "training_courses_select"       ON training_courses;
DROP POLICY IF EXISTS "training_courses_manage_admin" ON training_courses;
DROP POLICY IF EXISTS "training_modules_select"       ON training_modules;
DROP POLICY IF EXISTS "enrollments_own"               ON user_course_enrollments;
DROP POLICY IF EXISTS "enrollments_admin_read"        ON user_course_enrollments;
DROP POLICY IF EXISTS "module_progress_own"           ON user_module_progress;
DROP POLICY IF EXISTS "certificates_own"              ON training_certificates;
DROP POLICY IF EXISTS "preferences_own"               ON user_preferences;
DROP POLICY IF EXISTS "ai_settings_own"               ON ai_user_settings;
DROP POLICY IF EXISTS "tickets_select"                ON support_tickets;
DROP POLICY IF EXISTS "tickets_insert"                ON support_tickets;
DROP POLICY IF EXISTS "tickets_update"                ON support_tickets;
DROP POLICY IF EXISTS "ticket_comments_select"        ON support_ticket_comments;
DROP POLICY IF EXISTS "ticket_comments_insert"        ON support_ticket_comments;
DROP POLICY IF EXISTS "sessions_own"                  ON user_sessions;

CREATE POLICY "tasks_select_org"  ON tasks FOR SELECT USING (org_id = public.get_org_id());
CREATE POLICY "tasks_insert_org"  ON tasks FOR INSERT WITH CHECK (org_id = public.get_org_id() AND created_by = auth.uid());
CREATE POLICY "tasks_update_involved" ON tasks FOR UPDATE USING (
  org_id = public.get_org_id() AND (created_by = auth.uid() OR assigned_to = auth.uid()
  OR public.has_role('hospital_admin') OR public.has_role('org_admin') OR public.has_role('super_admin') OR public.has_role('practice_manager'))
);
CREATE POLICY "tasks_delete_creator_or_admin" ON tasks FOR DELETE USING (
  created_by = auth.uid() OR public.has_role('hospital_admin') OR public.has_role('org_admin') OR public.has_role('super_admin')
);

CREATE POLICY "task_comments_select"     ON task_comments FOR SELECT USING (EXISTS (SELECT 1 FROM tasks WHERE id = task_comments.task_id AND org_id = public.get_org_id()));
CREATE POLICY "task_comments_insert"     ON task_comments FOR INSERT WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM tasks WHERE id = task_comments.task_id AND org_id = public.get_org_id()));
CREATE POLICY "task_comments_delete_own" ON task_comments FOR DELETE USING (user_id = auth.uid());
CREATE POLICY "task_attachments_select"     ON task_attachments FOR SELECT USING (EXISTS (SELECT 1 FROM tasks WHERE id = task_attachments.task_id AND org_id = public.get_org_id()));
CREATE POLICY "task_attachments_insert"     ON task_attachments FOR INSERT WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM tasks WHERE id = task_attachments.task_id AND org_id = public.get_org_id()));
CREATE POLICY "task_attachments_delete_own" ON task_attachments FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "training_courses_select" ON training_courses FOR SELECT USING (
  org_id = public.get_org_id() AND (is_published = TRUE OR created_by = auth.uid() OR public.has_role('hospital_admin') OR public.has_role('org_admin') OR public.has_role('super_admin') OR public.has_role('hr'))
);
CREATE POLICY "training_courses_manage_admin" ON training_courses FOR ALL USING (
  org_id = public.get_org_id() AND (public.has_role('hospital_admin') OR public.has_role('org_admin') OR public.has_role('super_admin') OR public.has_role('hr'))
);
CREATE POLICY "training_modules_select" ON training_modules FOR SELECT USING (
  EXISTS (SELECT 1 FROM training_courses WHERE id = training_modules.course_id AND org_id = public.get_org_id() AND (is_published = TRUE OR public.has_role('hospital_admin') OR public.has_role('org_admin') OR public.has_role('super_admin') OR public.has_role('hr')))
);

CREATE POLICY "enrollments_own"        ON user_course_enrollments FOR ALL USING (user_id = auth.uid());
CREATE POLICY "enrollments_admin_read" ON user_course_enrollments FOR SELECT USING (
  EXISTS (SELECT 1 FROM training_courses WHERE id = user_course_enrollments.course_id AND org_id = public.get_org_id())
  AND (public.has_role('hospital_admin') OR public.has_role('org_admin') OR public.has_role('super_admin') OR public.has_role('hr'))
);
CREATE POLICY "module_progress_own" ON user_module_progress   FOR ALL USING (user_id = auth.uid());
CREATE POLICY "certificates_own"    ON training_certificates  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "preferences_own"     ON user_preferences       FOR ALL USING (user_id = auth.uid());
CREATE POLICY "ai_settings_own"     ON ai_user_settings       FOR ALL USING (user_id = auth.uid());

CREATE POLICY "tickets_select" ON support_tickets FOR SELECT USING (
  user_id = auth.uid() OR (org_id = public.get_org_id() AND (public.has_role('hospital_admin') OR public.has_role('org_admin') OR public.has_role('super_admin') OR public.has_role('it_admin')))
);
CREATE POLICY "tickets_insert" ON support_tickets FOR INSERT WITH CHECK (org_id = public.get_org_id() AND user_id = auth.uid());
CREATE POLICY "tickets_update" ON support_tickets FOR UPDATE USING (
  user_id = auth.uid() OR (org_id = public.get_org_id() AND (public.has_role('hospital_admin') OR public.has_role('org_admin') OR public.has_role('super_admin') OR public.has_role('it_admin')))
);

CREATE POLICY "ticket_comments_select" ON support_ticket_comments FOR SELECT USING (
  EXISTS (SELECT 1 FROM support_tickets WHERE id = support_ticket_comments.ticket_id AND (user_id = auth.uid() OR org_id = public.get_org_id() AND (public.has_role('hospital_admin') OR public.has_role('org_admin') OR public.has_role('super_admin') OR public.has_role('it_admin'))))
  AND (is_internal = FALSE OR public.has_role('hospital_admin') OR public.has_role('org_admin') OR public.has_role('super_admin') OR public.has_role('it_admin'))
);
CREATE POLICY "ticket_comments_insert" ON support_ticket_comments FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "sessions_own"           ON user_sessions           FOR ALL USING (user_id = auth.uid());

-- ============================================================
-- SEED DATA — Creates your org, hospital, and admin profile
-- ============================================================

DO $$
DECLARE
  v_org_id      UUID;
  v_hospital_id UUID;
  v_user_id     UUID;
BEGIN
  -- Get the admin user's UUID from auth.users
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'admin@vetclinic.com' LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'User admin@vetclinic.com not found — skipping seed data';
    RETURN;
  END IF;

  -- Create organization (skip if exists)
  INSERT INTO organizations (name, slug)
  VALUES ('VetOS Clinic Group', 'vetclinic')
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO v_org_id FROM organizations WHERE slug = 'vetclinic';

  -- Create hospital (skip if exists)
  INSERT INTO hospitals (org_id, name, slug, address, phone, timezone, color)
  VALUES (v_org_id, 'Main Veterinary Hospital', 'main', '123 Vet Lane, New York, NY 10001', '+1 (555) 123-4567', 'America/New_York', '#2563EB')
  ON CONFLICT (org_id, slug) DO NOTHING;

  SELECT id INTO v_hospital_id FROM hospitals WHERE org_id = v_org_id AND slug = 'main';

  -- Create admin profile (skip if exists)
  INSERT INTO profiles (id, org_id, first_name, last_name, email, job_title, department, is_active)
  VALUES (v_user_id, v_org_id, 'Admin', 'User', 'admin@vetclinic.com', 'System Administrator', 'IT', TRUE)
  ON CONFLICT (id) DO NOTHING;

  -- Assign super_admin role (skip if exists)
  INSERT INTO user_hospital_roles (user_id, hospital_id, role)
  VALUES (v_user_id, v_hospital_id, 'super_admin')
  ON CONFLICT (user_id, hospital_id) DO NOTHING;

  -- Set org_id in auth user's app_metadata so RLS works
  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('org_id', v_org_id)
  WHERE id = v_user_id;

  RAISE NOTICE 'Seed complete — org_id: %, hospital_id: %, user_id: %', v_org_id, v_hospital_id, v_user_id;
END $$;
