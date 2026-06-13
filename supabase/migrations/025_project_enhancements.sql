-- ============================================================
-- Migration 025: Project Enhancements
-- Adds review/approval workflow, per-project checklist,
-- and contributor contribution notes.
-- ============================================================

-- 1. Extend project status to include 'review' (awaiting approval)
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE projects ADD CONSTRAINT projects_status_check
  CHECK (status IN ('planning','active','on_hold','review','completed','cancelled'));

-- 2. Checklist stored as JSONB array [{id, text, checked, checked_at}]
ALTER TABLE projects ADD COLUMN IF NOT EXISTS checklist JSONB NOT NULL DEFAULT '[]';

-- 3. Review / approval tracking
ALTER TABLE projects ADD COLUMN IF NOT EXISTS review_requested_at TIMESTAMPTZ;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS review_requested_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS approved_by          UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS review_note          TEXT;

-- 4. What each member contributes to the project
ALTER TABLE project_members ADD COLUMN IF NOT EXISTS contribution TEXT DEFAULT '';

-- 5. Indexes for the new workflow columns
CREATE INDEX IF NOT EXISTS idx_projects_status_review ON projects(org_id, status);
