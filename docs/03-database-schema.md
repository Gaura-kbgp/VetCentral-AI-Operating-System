# Database Schema
# Vet AI Operating System
**Database:** Supabase PostgreSQL  
**Extensions Required:** `uuid-ossp`, `pgvector`, `pg_trgm`, `unaccent`

---

## Schema Overview

All tables include:
- `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
- `created_at TIMESTAMPTZ DEFAULT NOW()`
- `updated_at TIMESTAMPTZ DEFAULT NOW()`
- `org_id UUID REFERENCES organizations(id)` (where applicable)

---

## 1. CORE / IDENTITY TABLES

### organizations
```sql
CREATE TABLE organizations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  logo_url      TEXT,
  settings      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### hospitals
```sql
CREATE TABLE hospitals (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL,
  address       TEXT,
  phone         TEXT,
  timezone      TEXT DEFAULT 'America/New_York',
  color         TEXT,          -- brand color for calendar display
  settings      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, slug)
);
```

### profiles (extends Supabase auth.users)
```sql
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
  microsoft_id  TEXT UNIQUE,   -- for M365 SSO
  is_active     BOOLEAN DEFAULT TRUE,
  last_seen_at  TIMESTAMPTZ,
  settings      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### user_hospital_roles
```sql
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

CREATE TABLE user_hospital_roles (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  hospital_id   UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  role          app_role NOT NULL,
  granted_by    UUID REFERENCES profiles(id),
  granted_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, hospital_id)
);
```

### departments
```sql
CREATE TABLE departments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hospital_id   UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### user_departments
```sql
CREATE TABLE user_departments (
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, department_id)
);
```

---

## 2. KNOWLEDGE BASE TABLES

### kb_categories
```sql
CREATE TABLE kb_categories (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID NOT NULL REFERENCES organizations(id),
  hospital_id   UUID REFERENCES hospitals(id), -- NULL = org-wide
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL,
  icon          TEXT,
  parent_id     UUID REFERENCES kb_categories(id),
  sort_order    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### kb_articles
```sql
CREATE TYPE article_status AS ENUM ('draft', 'review', 'published', 'archived');

CREATE TABLE kb_articles (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  hospital_id     UUID REFERENCES hospitals(id), -- NULL = org-wide
  category_id     UUID REFERENCES kb_categories(id),
  title           TEXT NOT NULL,
  slug            TEXT NOT NULL,
  content         TEXT NOT NULL,         -- rich text (JSON/HTML)
  content_text    TEXT,                  -- plain text for search/indexing
  status          article_status DEFAULT 'draft',
  author_id       UUID REFERENCES profiles(id),
  reviewer_id     UUID REFERENCES profiles(id),
  published_at    TIMESTAMPTZ,
  version         INTEGER DEFAULT 1,
  tags            TEXT[],
  view_count      INTEGER DEFAULT 0,
  helpful_count   INTEGER DEFAULT 0,
  not_helpful_count INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, slug)
);

CREATE INDEX idx_kb_articles_org ON kb_articles(org_id);
CREATE INDEX idx_kb_articles_hospital ON kb_articles(hospital_id);
CREATE INDEX idx_kb_articles_status ON kb_articles(status);
CREATE INDEX idx_kb_articles_content_fts ON kb_articles 
  USING GIN (to_tsvector('english', title || ' ' || COALESCE(content_text, '')));
```

### kb_article_versions
```sql
CREATE TABLE kb_article_versions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  article_id  UUID NOT NULL REFERENCES kb_articles(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  version     INTEGER NOT NULL,
  edited_by   UUID REFERENCES profiles(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 3. DOCUMENT MANAGEMENT TABLES

### document_folders
```sql
CREATE TABLE document_folders (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID NOT NULL REFERENCES organizations(id),
  hospital_id   UUID REFERENCES hospitals(id),
  parent_id     UUID REFERENCES document_folders(id),
  name          TEXT NOT NULL,
  path          TEXT NOT NULL,
  created_by    UUID REFERENCES profiles(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### documents
```sql
CREATE TABLE documents (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  hospital_id     UUID REFERENCES hospitals(id),
  folder_id       UUID REFERENCES document_folders(id),
  name            TEXT NOT NULL,
  description     TEXT,
  storage_path    TEXT NOT NULL,       -- Supabase Storage path
  file_type       TEXT NOT NULL,       -- MIME type
  file_size       BIGINT NOT NULL,     -- bytes
  version         INTEGER DEFAULT 1,
  is_latest       BOOLEAN DEFAULT TRUE,
  parent_doc_id   UUID REFERENCES documents(id), -- for versioning
  uploaded_by     UUID REFERENCES profiles(id),
  tags            TEXT[],
  download_count  INTEGER DEFAULT 0,
  is_indexed      BOOLEAN DEFAULT FALSE,
  indexed_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_documents_org ON documents(org_id);
CREATE INDEX idx_documents_folder ON documents(folder_id);
```

### document_permissions
```sql
CREATE TYPE permission_level AS ENUM ('view', 'download', 'edit', 'manage');

CREATE TABLE document_permissions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id     UUID REFERENCES documents(id) ON DELETE CASCADE,
  folder_id       UUID REFERENCES document_folders(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role            app_role,           -- can grant to a role instead of user
  hospital_id     UUID REFERENCES hospitals(id),
  permission      permission_level NOT NULL,
  granted_by      UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  CHECK (document_id IS NOT NULL OR folder_id IS NOT NULL)
);
```

---

## 4. AI / VECTOR TABLES

### document_chunks
```sql
CREATE TABLE document_chunks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  hospital_id     UUID REFERENCES hospitals(id),
  source_type     TEXT NOT NULL,   -- 'document' | 'kb_article' | 'training_content'
  source_id       UUID NOT NULL,
  chunk_index     INTEGER NOT NULL,
  content         TEXT NOT NULL,
  token_count     INTEGER,
  embedding       vector(1536),    -- text-embedding-3-small dimension
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chunks_org ON document_chunks(org_id);
CREATE INDEX idx_chunks_source ON document_chunks(source_type, source_id);
CREATE INDEX idx_chunks_embedding ON document_chunks 
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

### ai_conversations
```sql
CREATE TABLE ai_conversations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  hospital_id UUID REFERENCES hospitals(id),
  title       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### ai_messages
```sql
CREATE TYPE message_role AS ENUM ('user', 'assistant', 'system');

CREATE TABLE ai_messages (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id   UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role              message_role NOT NULL,
  content           TEXT NOT NULL,
  source_chunks     JSONB,        -- cited document_chunk ids and snippets
  tokens_used       INTEGER,
  feedback          SMALLINT,     -- 1 (helpful) | -1 (not helpful) | NULL
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_messages_conv ON ai_messages(conversation_id);
```

---

## 5. CALENDAR TABLES

### calendar_events
```sql
CREATE TYPE event_type AS ENUM (
  'meeting', 'training', 'pto', 'hospital_event', 
  'onboarding', 'doctor_meeting', 'maintenance', 'other'
);

CREATE TABLE calendar_events (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id            UUID NOT NULL REFERENCES organizations(id),
  hospital_id       UUID REFERENCES hospitals(id), -- NULL = all hospitals
  title             TEXT NOT NULL,
  description       TEXT,
  location          TEXT,
  meeting_link      TEXT,
  event_type        event_type NOT NULL,
  start_time        TIMESTAMPTZ NOT NULL,
  end_time          TIMESTAMPTZ NOT NULL,
  is_all_day        BOOLEAN DEFAULT FALSE,
  is_recurring      BOOLEAN DEFAULT FALSE,
  recurrence_rule   TEXT,                  -- RRULE string
  outlook_event_id  TEXT UNIQUE,           -- MS Graph event ID
  outlook_calendar_id TEXT,
  created_by        UUID REFERENCES profiles(id),
  is_cancelled      BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_events_hospital ON calendar_events(hospital_id);
CREATE INDEX idx_events_time ON calendar_events(start_time, end_time);
CREATE INDEX idx_events_outlook ON calendar_events(outlook_event_id);
```

### calendar_event_attendees
```sql
CREATE TYPE attendance_status AS ENUM ('invited', 'accepted', 'declined', 'tentative');

CREATE TABLE calendar_event_attendees (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id    UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES profiles(id),
  email       TEXT,                        -- for external attendees
  status      attendance_status DEFAULT 'invited',
  is_organizer BOOLEAN DEFAULT FALSE,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, user_id)
);
```

### calendar_conflicts
```sql
CREATE TABLE calendar_conflicts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hospital_id     UUID NOT NULL REFERENCES hospitals(id),
  event_id_1      UUID NOT NULL REFERENCES calendar_events(id),
  event_id_2      UUID NOT NULL REFERENCES calendar_events(id),
  user_id         UUID REFERENCES profiles(id),
  detected_at     TIMESTAMPTZ DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ,
  resolution_note TEXT
);
```

### outlook_sync_tokens
```sql
CREATE TABLE outlook_sync_tokens (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES profiles(id),
  hospital_id     UUID REFERENCES hospitals(id),
  calendar_id     TEXT NOT NULL,
  delta_token     TEXT,                    -- MS Graph delta link
  webhook_subscription_id TEXT,
  webhook_expiry  TIMESTAMPTZ,
  access_token    TEXT,                    -- encrypted
  refresh_token   TEXT,                    -- encrypted
  token_expiry    TIMESTAMPTZ,
  synced_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, calendar_id)
);
```

---

## 6. COMMUNICATION TABLES

### channels
```sql
CREATE TYPE channel_type AS ENUM ('public', 'private', 'announcement', 'direct');

CREATE TABLE channels (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  hospital_id     UUID REFERENCES hospitals(id),
  name            TEXT NOT NULL,
  description     TEXT,
  channel_type    channel_type DEFAULT 'public',
  created_by      UUID REFERENCES profiles(id),
  is_archived     BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### channel_members
```sql
CREATE TABLE channel_members (
  channel_id    UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at     TIMESTAMPTZ DEFAULT NOW(),
  last_read_at  TIMESTAMPTZ DEFAULT NOW(),
  is_admin      BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (channel_id, user_id)
);
```

### messages
```sql
CREATE TABLE messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id      UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(id),
  content         TEXT NOT NULL,
  content_type    TEXT DEFAULT 'text',   -- 'text' | 'file' | 'image'
  parent_id       UUID REFERENCES messages(id),    -- for threads
  attachment_url  TEXT,
  attachment_name TEXT,
  is_edited       BOOLEAN DEFAULT FALSE,
  is_deleted      BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_channel ON messages(channel_id, created_at DESC);
CREATE INDEX idx_messages_parent ON messages(parent_id);
```

### message_reactions
```sql
CREATE TABLE message_reactions (
  message_id  UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji       TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id, emoji)
);
```

### notifications
```sql
CREATE TYPE notification_type AS ENUM (
  'message_mention', 'channel_message', 'task_assigned', 'task_due',
  'workflow_update', 'calendar_reminder', 'training_assigned',
  'document_shared', 'system_announcement'
);

CREATE TABLE notifications (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL REFERENCES organizations(id),
  type          notification_type NOT NULL,
  title         TEXT NOT NULL,
  body          TEXT,
  action_url    TEXT,
  is_read       BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at DESC);
```

---

## 7. TRAINING / LMS TABLES

### courses
```sql
CREATE TABLE courses (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  hospital_id     UUID REFERENCES hospitals(id),
  title           TEXT NOT NULL,
  description     TEXT,
  thumbnail_url   TEXT,
  passing_score   INTEGER DEFAULT 70,
  target_roles    app_role[],
  is_required     BOOLEAN DEFAULT FALSE,
  is_published    BOOLEAN DEFAULT FALSE,
  created_by      UUID REFERENCES profiles(id),
  estimated_minutes INTEGER,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### course_modules
```sql
CREATE TABLE course_modules (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id   UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  sort_order  INTEGER NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### lessons
```sql
CREATE TYPE lesson_type AS ENUM ('video', 'text', 'quiz', 'file', 'embed');

CREATE TABLE lessons (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  module_id     UUID NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  lesson_type   lesson_type NOT NULL,
  content       JSONB NOT NULL,      -- structured by lesson_type
  sort_order    INTEGER NOT NULL,
  duration_sec  INTEGER,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### quizzes
```sql
CREATE TABLE quiz_questions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lesson_id     UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  question      TEXT NOT NULL,
  question_type TEXT DEFAULT 'multiple_choice',
  options       JSONB,               -- [{text, is_correct}]
  sort_order    INTEGER NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### user_course_enrollments
```sql
CREATE TABLE user_course_enrollments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  course_id       UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  assigned_by     UUID REFERENCES profiles(id),
  assigned_at     TIMESTAMPTZ DEFAULT NOW(),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  score           INTEGER,
  passed          BOOLEAN,
  due_date        DATE,
  cert_url        TEXT,
  UNIQUE(user_id, course_id)
);
```

### user_lesson_progress
```sql
CREATE TABLE user_lesson_progress (
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lesson_id     UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  completed     BOOLEAN DEFAULT FALSE,
  completed_at  TIMESTAMPTZ,
  quiz_answers  JSONB,              -- stored answers for review
  time_spent_sec INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, lesson_id)
);
```

---

## 8. PROJECT MANAGEMENT TABLES

### projects
```sql
CREATE TYPE project_status AS ENUM ('planning', 'active', 'on_hold', 'completed', 'cancelled');

CREATE TABLE projects (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  hospital_id     UUID REFERENCES hospitals(id),
  name            TEXT NOT NULL,
  description     TEXT,
  status          project_status DEFAULT 'planning',
  owner_id        UUID REFERENCES profiles(id),
  start_date      DATE,
  due_date        DATE,
  color           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### project_members
```sql
CREATE TABLE project_members (
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role        TEXT DEFAULT 'member',   -- 'owner' | 'member' | 'viewer'
  joined_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (project_id, user_id)
);
```

### tasks
```sql
CREATE TYPE task_status AS ENUM ('backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled');
CREATE TYPE task_priority AS ENUM ('urgent', 'high', 'medium', 'low');

CREATE TABLE tasks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID REFERENCES projects(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES organizations(id),
  hospital_id     UUID REFERENCES hospitals(id),
  parent_id       UUID REFERENCES tasks(id),     -- for sub-tasks
  title           TEXT NOT NULL,
  description     TEXT,
  status          task_status DEFAULT 'todo',
  priority        task_priority DEFAULT 'medium',
  assignee_id     UUID REFERENCES profiles(id),
  created_by      UUID REFERENCES profiles(id),
  due_date        DATE,
  completed_at    TIMESTAMPTZ,
  position        FLOAT DEFAULT 0,               -- for drag-and-drop ordering
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tasks_project ON tasks(project_id, status);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
```

### task_comments
```sql
CREATE TABLE task_comments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id),
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 9. WORKFLOW / REQUEST TABLES

### workflow_forms
```sql
CREATE TABLE workflow_forms (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  hospital_id     UUID REFERENCES hospitals(id),
  name            TEXT NOT NULL,
  description     TEXT,
  form_schema     JSONB NOT NULL,        -- field definitions
  approval_config JSONB,                 -- routing rules
  is_active       BOOLEAN DEFAULT TRUE,
  created_by      UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### workflow_requests
```sql
CREATE TYPE request_status AS ENUM (
  'submitted', 'in_review', 'approved', 'rejected', 'completed', 'cancelled'
);

CREATE TABLE workflow_requests (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  form_id         UUID NOT NULL REFERENCES workflow_forms(id),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  hospital_id     UUID REFERENCES hospitals(id),
  requester_id    UUID NOT NULL REFERENCES profiles(id),
  title           TEXT NOT NULL,
  form_data       JSONB NOT NULL,         -- submitted field values
  status          request_status DEFAULT 'submitted',
  current_step    INTEGER DEFAULT 0,
  notes           TEXT,
  submitted_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### workflow_approvals
```sql
CREATE TABLE workflow_approvals (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id      UUID NOT NULL REFERENCES workflow_requests(id) ON DELETE CASCADE,
  approver_id     UUID NOT NULL REFERENCES profiles(id),
  step            INTEGER NOT NULL,
  decision        TEXT,                   -- 'approved' | 'rejected' | NULL
  comment         TEXT,
  decided_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 10. ONBOARDING TABLES

### onboarding_templates
```sql
CREATE TABLE onboarding_templates (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES organizations(id),
  hospital_id UUID REFERENCES hospitals(id),
  name        TEXT NOT NULL,
  target_role app_role NOT NULL,
  tasks       JSONB NOT NULL,    -- ordered task definitions
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### employee_onboardings
```sql
CREATE TABLE employee_onboardings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES profiles(id),
  hospital_id     UUID NOT NULL REFERENCES hospitals(id),
  template_id     UUID REFERENCES onboarding_templates(id),
  hr_owner_id     UUID REFERENCES profiles(id),
  start_date      DATE,
  target_end_date DATE,
  status          TEXT DEFAULT 'in_progress',
  progress        INTEGER DEFAULT 0,  -- 0-100
  tasks           JSONB NOT NULL,     -- instantiated task list with completion state
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 11. KPI / ANALYTICS TABLES

### kpi_snapshots
```sql
CREATE TABLE kpi_snapshots (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  hospital_id     UUID REFERENCES hospitals(id),
  metric_key      TEXT NOT NULL,
  metric_value    NUMERIC NOT NULL,
  dimension       JSONB,              -- e.g., {role: 'doctor', department: 'surgery'}
  snapshot_date   DATE NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kpi_hospital_metric ON kpi_snapshots(hospital_id, metric_key, snapshot_date);
```

---

## 12. AUDIT TABLES

### audit_logs
```sql
CREATE TABLE audit_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID NOT NULL REFERENCES organizations(id),
  hospital_id   UUID REFERENCES hospitals(id),
  user_id       UUID REFERENCES profiles(id),
  action        TEXT NOT NULL,         -- 'CREATE' | 'UPDATE' | 'DELETE' | 'VIEW'
  resource_type TEXT NOT NULL,         -- table/module name
  resource_id   UUID,
  old_data      JSONB,
  new_data      JSONB,
  ip_address    INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_org ON audit_logs(org_id, created_at DESC);
CREATE INDEX idx_audit_user ON audit_logs(user_id, created_at DESC);
```

---

## 13. ROW-LEVEL SECURITY POLICIES

### Enable RLS on all tables
```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE hospitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
-- ... (all tables)
```

### JWT Claim Helper Functions
```sql
-- Extract org_id from JWT
CREATE OR REPLACE FUNCTION auth.org_id() RETURNS UUID AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'org_id')::UUID;
$$ LANGUAGE SQL STABLE;

-- Check if user has role in hospital
CREATE OR REPLACE FUNCTION auth.has_hospital_role(h_id UUID, required_role app_role)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_hospital_roles
    WHERE user_id = auth.uid()
      AND hospital_id = h_id
      AND role::text = required_role::text
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Get all hospital IDs user can access
CREATE OR REPLACE FUNCTION auth.accessible_hospital_ids() RETURNS UUID[] AS $$
  SELECT ARRAY(
    SELECT hospital_id FROM user_hospital_roles WHERE user_id = auth.uid()
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;
```

### Example RLS Policies
```sql
-- profiles: users see their own org
CREATE POLICY "profiles_select_org" ON profiles
  FOR SELECT USING (org_id = auth.org_id());

-- messages: users see channels they're members of
CREATE POLICY "messages_select_members" ON messages
  FOR SELECT USING (
    channel_id IN (
      SELECT channel_id FROM channel_members WHERE user_id = auth.uid()
    )
  );

-- calendar_events: users see events for their hospitals
CREATE POLICY "events_select_hospital" ON calendar_events
  FOR SELECT USING (
    hospital_id = ANY(auth.accessible_hospital_ids())
    OR hospital_id IS NULL  -- org-wide events
  );

-- documents: users see docs where they have permission
CREATE POLICY "documents_select_permitted" ON documents
  FOR SELECT USING (
    hospital_id = ANY(auth.accessible_hospital_ids())
    AND (
      EXISTS (
        SELECT 1 FROM document_permissions dp
        WHERE dp.document_id = id
          AND (dp.user_id = auth.uid() OR dp.hospital_id = ANY(auth.accessible_hospital_ids()))
      )
    )
  );

-- ai_conversations: users see only their own
CREATE POLICY "ai_conversations_own" ON ai_conversations
  FOR ALL USING (user_id = auth.uid());

-- notifications: users see only their own
CREATE POLICY "notifications_own" ON notifications
  FOR ALL USING (user_id = auth.uid());

-- workflow_requests: requester or approver
CREATE POLICY "requests_select" ON workflow_requests
  FOR SELECT USING (
    requester_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM workflow_approvals wa
      WHERE wa.request_id = id AND wa.approver_id = auth.uid()
    )
    OR hospital_id = ANY(auth.accessible_hospital_ids())  -- managers see all
  );
```

---

## 14. DATABASE FUNCTIONS & TRIGGERS

### Auto-update updated_at
```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- (repeat for all tables)
```

### Auto-create audit log
```sql
CREATE OR REPLACE FUNCTION create_audit_log()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (org_id, user_id, action, resource_type, resource_id, old_data, new_data)
  VALUES (
    COALESCE(NEW.org_id, OLD.org_id),
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END,
    CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN row_to_json(NEW) ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Conflict Detection Trigger
```sql
CREATE OR REPLACE FUNCTION detect_calendar_conflicts()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO calendar_conflicts (hospital_id, event_id_1, event_id_2, user_id)
  SELECT 
    NEW.hospital_id,
    NEW.id,
    e2.id,
    a1.user_id
  FROM calendar_event_attendees a1
  JOIN calendar_event_attendees a2 ON a2.user_id = a1.user_id AND a1.event_id = NEW.id
  JOIN calendar_events e2 ON e2.id = a2.event_id AND e2.id != NEW.id
  WHERE (NEW.start_time, NEW.end_time) OVERLAPS (e2.start_time, e2.end_time)
    AND e2.is_cancelled = FALSE
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calendar_conflict_detection
  AFTER INSERT OR UPDATE ON calendar_events
  FOR EACH ROW EXECUTE FUNCTION detect_calendar_conflicts();
```

---

## 15. ER DIAGRAM (ASCII)

```
organizations (1)
    │
    ├── hospitals (N)
    │       │
    │       ├── departments (N)
    │       │       └── user_departments
    │       │
    │       ├── calendar_events (N)
    │       │       └── calendar_event_attendees
    │       │       └── calendar_conflicts
    │       │
    │       ├── channels (N)
    │       │       ├── channel_members
    │       │       └── messages ── message_reactions
    │       │
    │       ├── documents (N)
    │       │       ├── document_folders
    │       │       └── document_permissions
    │       │
    │       ├── projects (N)
    │       │       ├── project_members
    │       │       └── tasks ── task_comments
    │       │
    │       ├── workflow_forms (N)
    │       │       └── workflow_requests ── workflow_approvals
    │       │
    │       └── courses (N)
    │               ├── course_modules ── lessons ── quiz_questions
    │               ├── user_course_enrollments
    │               └── user_lesson_progress
    │
    ├── profiles (N) ── user_hospital_roles
    │
    ├── kb_articles (N) ── kb_categories
    │       └── kb_article_versions
    │
    ├── document_chunks (N) [vector]
    │
    ├── ai_conversations (N) ── ai_messages
    │
    ├── notifications (N)
    │
    ├── kpi_snapshots (N)
    │
    └── audit_logs (N)
```
