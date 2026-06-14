-- ============================================================
-- Migration 034: Hiring documents, offer letter & NDA tracking
-- ============================================================

-- ── Extend job_applications with hiring lifecycle fields ─────
ALTER TABLE job_applications
  ADD COLUMN IF NOT EXISTS candidate_profile   JSONB    DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS offer_letter_sent_at  TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS offer_letter_signed_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS offer_letter_salary   TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS offer_letter_start    DATE    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS nda_sent_at          TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS nda_signed_at        TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS profile_submitted_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS hiring_stage         TEXT    DEFAULT 'applied'
    CHECK (hiring_stage IN ('applied','profile_submitted','docs_submitted','interview_scheduled','interview_done','offer_sent','offer_signed','nda_signed','hired','rejected'));

-- ── Hiring documents table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS hiring_documents (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL,
  doc_type      TEXT NOT NULL
    CHECK (doc_type IN ('id_proof','qualification','employment_proof','offer_letter_signed','nda_signed','other')),
  name          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('pending','received','verified','rejected')),
  storage_path  TEXT,
  file_size     BIGINT,
  mime_type     TEXT,
  notes         TEXT,
  uploaded_by   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hiring_documents_application ON hiring_documents(application_id);
CREATE INDEX IF NOT EXISTS idx_hiring_documents_org        ON hiring_documents(org_id);

-- RLS
ALTER TABLE hiring_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hiring_docs_org_read"  ON hiring_documents;
DROP POLICY IF EXISTS "hiring_docs_org_write" ON hiring_documents;

CREATE POLICY "hiring_docs_org_read" ON hiring_documents
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "hiring_docs_org_write" ON hiring_documents
  FOR ALL USING (
    org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
  );
