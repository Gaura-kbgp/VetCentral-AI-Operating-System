-- ============================================================
-- Migration 001: Core Tables
-- Vet AI Operating System
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- ============================================================
-- ORGANIZATIONS
-- ============================================================
CREATE TABLE organizations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  logo_url    TEXT,
  settings    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- HOSPITALS
-- ============================================================
CREATE TABLE hospitals (
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

-- ============================================================
-- ROLE TYPE
-- ============================================================
CREATE TYPE app_role AS ENUM (
  'super_admin',
  'org_admin',
  'hospital_admin',
  'practice_manager',
  'doctor',
  'csr',
  'va',
  'marketing',
  'hr',
  'it_admin',
  'viewer'
);

-- ============================================================
-- PROFILES (extends auth.users)
-- ============================================================
CREATE TABLE profiles (
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

CREATE INDEX idx_profiles_org ON profiles(org_id);
CREATE INDEX idx_profiles_email ON profiles(email);

-- ============================================================
-- USER HOSPITAL ROLES
-- ============================================================
CREATE TABLE user_hospital_roles (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  role        app_role NOT NULL,
  granted_by  UUID REFERENCES profiles(id),
  granted_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, hospital_id)
);

CREATE INDEX idx_user_roles_user ON user_hospital_roles(user_id);
CREATE INDEX idx_user_roles_hospital ON user_hospital_roles(hospital_id);

-- ============================================================
-- DEPARTMENTS
-- ============================================================
CREATE TABLE departments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hospital_id UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_departments (
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, department_id)
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TYPE notification_type AS ENUM (
  'message_mention',
  'channel_message',
  'task_assigned',
  'task_due',
  'workflow_update',
  'calendar_reminder',
  'training_assigned',
  'document_shared',
  'system_announcement'
);

CREATE TABLE notifications (
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

CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at DESC);

-- ============================================================
-- AUDIT LOGS
-- ============================================================
CREATE TABLE audit_logs (
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

CREATE INDEX idx_audit_org ON audit_logs(org_id, created_at DESC);
CREATE INDEX idx_audit_user ON audit_logs(user_id, created_at DESC);

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- JWT helpers
CREATE OR REPLACE FUNCTION auth.org_id() RETURNS UUID AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'org_id')::UUID;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION auth.accessible_hospital_ids() RETURNS UUID[] AS $$
  SELECT ARRAY(
    SELECT hospital_id FROM user_hospital_roles WHERE user_id = auth.uid()
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auth.has_role(required_role app_role) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_hospital_roles
    WHERE user_id = auth.uid()
      AND role = required_role
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auth.has_hospital_role(h_id UUID, required_roles app_role[])
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_hospital_roles
    WHERE user_id = auth.uid()
      AND hospital_id = h_id
      AND role = ANY(required_roles)
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Triggers
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_hospitals_updated_at
  BEFORE UPDATE ON hospitals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-create profile when user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Profile is created explicitly via invite flow
  -- This function handles edge cases
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
