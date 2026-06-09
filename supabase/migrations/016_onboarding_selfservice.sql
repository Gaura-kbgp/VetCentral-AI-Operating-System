-- ============================================================
-- Migration 016: Self-Service Onboarding Enhancements
-- Employee document upload, OCR, HR approval workflow
-- ============================================================

-- ── Add columns to onboarding_documents ─────────────────────
ALTER TABLE onboarding_documents
  ADD COLUMN IF NOT EXISTS ocr_text TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS public_url TEXT;

-- ── Add columns to onboarding_meetings ──────────────────────
ALTER TABLE onboarding_meetings
  ADD COLUMN IF NOT EXISTS calendar_event_id UUID REFERENCES calendar_events(id) ON DELETE SET NULL;

-- ── Add columns to onboarding_records ──────────────────────
ALTER TABLE onboarding_records
  ADD COLUMN IF NOT EXISTS invitation_sent_at TIMESTAMPTZ;

-- ── Email delivery logging ────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  event_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  error_message TEXT,
  reference_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── RLS for email_logs ────────────────────────────────────────
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_logs_select_own_org" ON email_logs;
DROP POLICY IF EXISTS "email_logs_insert_system" ON email_logs;

CREATE POLICY "email_logs_select_own_org" ON email_logs
  FOR SELECT USING (
    org_id = public.user_org_id()
  );

CREATE POLICY "email_logs_insert_system" ON email_logs
  FOR INSERT WITH CHECK (
    org_id = public.user_org_id()
  );

-- ── Indexes ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ob_docs_status ON onboarding_documents(status);
CREATE INDEX IF NOT EXISTS idx_ob_docs_employee ON onboarding_documents(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_ob_meetings_calendar ON onboarding_meetings(calendar_event_id);
CREATE INDEX IF NOT EXISTS idx_ob_records_invitation ON onboarding_records(invitation_sent_at);
CREATE INDEX IF NOT EXISTS idx_email_logs_org ON email_logs(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status, created_at DESC);

-- ── Storage bucket RLS (onboarding-docs) ───────────────────
-- Employees can upload to their own path and download
-- HR/admins can read all; superadmins can delete

-- NOTE: Supabase RLS for storage buckets requires direct configuration
-- via console or S3-compatible SDK. This is enforced app-side via
-- src/app/api/v1/onboarding/documents/route.ts auth checks.
-- Storage policy would be applied separately:
-- 1. Employees: select+insert own files only
-- 2. HR roles: select all files in org
-- 3. Admins: select+delete all files
