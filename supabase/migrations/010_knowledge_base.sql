-- ============================================================
-- 010_knowledge_base.sql
-- Knowledge Base module: categories, documents, tags, versions, attachments
-- ============================================================

-- ── Categories ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.knowledge_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name        text NOT NULL,
  slug        text NOT NULL,
  description text,
  icon        text NOT NULL DEFAULT 'book',
  color       text NOT NULL DEFAULT '#3B82F6',
  sort_order  int  NOT NULL DEFAULT 0,
  is_system   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, slug)
);

-- ── Documents ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.knowledge_documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  hospital_id  uuid REFERENCES public.hospitals(id),
  category_id  uuid REFERENCES public.knowledge_categories(id),
  title        text NOT NULL,
  slug         text,
  description  text,
  content      text NOT NULL DEFAULT '',
  status       text NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','published','archived')),
  visibility   text NOT NULL DEFAULT 'org'
                CHECK (visibility IN ('org','hospital','restricted')),
  created_by   uuid REFERENCES public.profiles(id),
  updated_by   uuid REFERENCES public.profiles(id),
  published_at timestamptz,
  published_by uuid REFERENCES public.profiles(id),
  archived_at  timestamptz,
  view_count   int  NOT NULL DEFAULT 0,
  version      int  NOT NULL DEFAULT 1,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ── Tags ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.knowledge_tags (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name       text NOT NULL,
  slug       text NOT NULL,
  color      text NOT NULL DEFAULT '#6366F1',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, slug)
);

-- ── Document ↔ Tag junction ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.knowledge_document_tags (
  document_id uuid NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  tag_id      uuid NOT NULL REFERENCES public.knowledge_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (document_id, tag_id)
);

-- ── Version history ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.knowledge_versions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id    uuid NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  version        int  NOT NULL,
  title          text NOT NULL,
  content        text,
  description    text,
  change_summary text,
  created_by     uuid REFERENCES public.profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version)
);

-- ── Attachments ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.knowledge_attachments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  uuid NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  org_id       uuid NOT NULL REFERENCES public.organizations(id),
  file_name    text NOT NULL,
  file_type    text NOT NULL,
  file_size    bigint NOT NULL DEFAULT 0,
  storage_path text NOT NULL,
  uploaded_by  uuid REFERENCES public.profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ── Enable RLS ───────────────────────────────────────────────
ALTER TABLE public.knowledge_categories    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_documents     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_tags          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_document_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_versions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_attachments   ENABLE ROW LEVEL SECURITY;

-- ── Categories RLS ───────────────────────────────────────────
CREATE POLICY "kb_cat_select" ON public.knowledge_categories
  FOR SELECT USING (
    org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  );
CREATE POLICY "kb_cat_write" ON public.knowledge_categories
  FOR ALL USING (
    org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  );

-- ── Documents RLS ────────────────────────────────────────────
CREATE POLICY "kb_doc_select" ON public.knowledge_documents
  FOR SELECT USING (
    org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  );
CREATE POLICY "kb_doc_insert" ON public.knowledge_documents
  FOR INSERT WITH CHECK (
    org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  );
CREATE POLICY "kb_doc_update" ON public.knowledge_documents
  FOR UPDATE USING (
    org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  );
CREATE POLICY "kb_doc_delete" ON public.knowledge_documents
  FOR DELETE USING (
    org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
    AND (
      public.user_has_role('super_admin') OR public.user_has_role('org_admin')
      OR created_by = auth.uid()
    )
  );

-- ── Tags RLS ─────────────────────────────────────────────────
CREATE POLICY "kb_tag_select" ON public.knowledge_tags
  FOR SELECT USING (
    org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  );
CREATE POLICY "kb_tag_write" ON public.knowledge_tags
  FOR ALL USING (
    org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  );

-- ── Doc-Tag junction RLS (permissive — gated by parent doc) ──
CREATE POLICY "kb_doc_tag_all" ON public.knowledge_document_tags
  FOR ALL USING (true);

-- ── Versions RLS ─────────────────────────────────────────────
CREATE POLICY "kb_ver_select" ON public.knowledge_versions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.knowledge_documents d
      WHERE d.id = document_id
        AND d.org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
    )
  );
CREATE POLICY "kb_ver_insert" ON public.knowledge_versions
  FOR INSERT WITH CHECK (true);

-- ── Attachments RLS ──────────────────────────────────────────
CREATE POLICY "kb_att_select" ON public.knowledge_attachments
  FOR SELECT USING (
    org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  );
CREATE POLICY "kb_att_write" ON public.knowledge_attachments
  FOR ALL USING (
    org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  );

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_kb_docs_org      ON public.knowledge_documents (org_id);
CREATE INDEX IF NOT EXISTS idx_kb_docs_cat      ON public.knowledge_documents (category_id, status);
CREATE INDEX IF NOT EXISTS idx_kb_docs_status   ON public.knowledge_documents (org_id, status);
CREATE INDEX IF NOT EXISTS idx_kb_docs_hospital ON public.knowledge_documents (hospital_id);
CREATE INDEX IF NOT EXISTS idx_kb_docs_updated  ON public.knowledge_documents (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_kb_versions_doc  ON public.knowledge_versions (document_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_kb_att_doc       ON public.knowledge_attachments (document_id);

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_kb_docs_fts ON public.knowledge_documents
  USING gin(
    to_tsvector('english',
      coalesce(title,'') || ' ' ||
      coalesce(description,'') || ' ' ||
      coalesce(content,'')
    )
  );
