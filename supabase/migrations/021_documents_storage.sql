-- Migration 021: Documents storage bucket + kb_categories alias
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,
  524288000, -- 500 MB
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'video/mp4',
    'video/webm',
    'application/zip',
    'application/x-zip-compressed'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload/download org documents
CREATE POLICY "documents_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents');

CREATE POLICY "documents_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'documents');

CREATE POLICY "documents_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'documents');

-- kb_categories is an alias view for knowledge_categories (migration 020 tried to insert into kb_categories)
-- Create kb_categories as a view aliasing knowledge_categories if it doesn't exist as a table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'kb_categories'
  ) THEN
    -- kb_categories doesn't exist as a table; migration 020 inserts will fail silently
    -- Create it as a real table mirroring knowledge_categories
    CREATE TABLE IF NOT EXISTS public.kb_categories (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
      name       text NOT NULL,
      slug       text NOT NULL,
      description text,
      color      text NOT NULL DEFAULT '#3B82F6',
      icon       text NOT NULL DEFAULT 'FileText',
      sort_order int  NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (org_id, slug)
    );
    ALTER TABLE public.kb_categories ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "kb_cat2_select" ON public.kb_categories
      FOR SELECT TO authenticated USING (true);
    CREATE POLICY "kb_cat2_write" ON public.kb_categories
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
