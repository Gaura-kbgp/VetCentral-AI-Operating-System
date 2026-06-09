-- ============================================================
-- 011_ai_uploads.sql
-- AI document upload tracking for RAG pipeline
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_uploads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  hospital_id   uuid REFERENCES public.hospitals(id),
  uploaded_by   uuid NOT NULL REFERENCES public.profiles(id),
  file_name     text NOT NULL,
  file_type     text NOT NULL,
  file_size     bigint NOT NULL DEFAULT 0,
  storage_path  text NOT NULL,
  status        text NOT NULL DEFAULT 'processing'
                  CHECK (status IN ('processing', 'indexed', 'failed')),
  chunk_count   int  NOT NULL DEFAULT 0,
  error_text    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  processed_at  timestamptz
);

ALTER TABLE public.ai_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_uploads_select" ON public.ai_uploads
  FOR SELECT USING (
    org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "ai_uploads_insert" ON public.ai_uploads
  FOR INSERT WITH CHECK (
    org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
    AND uploaded_by = auth.uid()
  );

CREATE POLICY "ai_uploads_update" ON public.ai_uploads
  FOR UPDATE USING (uploaded_by = auth.uid());

CREATE INDEX IF NOT EXISTS idx_ai_uploads_org  ON public.ai_uploads (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_uploads_user ON public.ai_uploads (uploaded_by);

-- Cleanup chunks when upload is deleted
CREATE OR REPLACE FUNCTION delete_upload_chunks()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM document_chunks
  WHERE source_type = 'ai_upload' AND source_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ai_uploads_cleanup_chunks
  AFTER DELETE ON public.ai_uploads
  FOR EACH ROW EXECUTE FUNCTION delete_upload_chunks();
