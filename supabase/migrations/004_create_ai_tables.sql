-- ============================================================
-- Migration 004: AI / Vector Tables
-- Vet AI Operating System
-- ============================================================

-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Knowledge base articles (also used by AI indexing)
CREATE TYPE article_status AS ENUM ('draft', 'review', 'published', 'archived');

CREATE TABLE kb_categories (
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

CREATE TABLE kb_articles (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id              UUID NOT NULL REFERENCES organizations(id),
  hospital_id         UUID REFERENCES hospitals(id),
  category_id         UUID REFERENCES kb_categories(id),
  title               TEXT NOT NULL,
  slug                TEXT NOT NULL,
  content             TEXT NOT NULL,
  content_text        TEXT,
  status              article_status DEFAULT 'draft',
  author_id           UUID REFERENCES profiles(id),
  reviewer_id         UUID REFERENCES profiles(id),
  published_at        TIMESTAMPTZ,
  version             INTEGER DEFAULT 1,
  tags                TEXT[],
  view_count          INTEGER DEFAULT 0,
  helpful_count       INTEGER DEFAULT 0,
  not_helpful_count   INTEGER DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, slug)
);

CREATE INDEX idx_kb_articles_org ON kb_articles(org_id);
CREATE INDEX idx_kb_articles_hospital ON kb_articles(hospital_id);
CREATE INDEX idx_kb_articles_status ON kb_articles(status);
CREATE INDEX idx_kb_articles_fts ON kb_articles
  USING GIN (to_tsvector('english', title || ' ' || COALESCE(content_text, '')));

CREATE TABLE kb_article_versions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  article_id  UUID NOT NULL REFERENCES kb_articles(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  version     INTEGER NOT NULL,
  edited_by   UUID REFERENCES profiles(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Vector storage for RAG
CREATE TABLE document_chunks (
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

CREATE INDEX idx_chunks_org ON document_chunks(org_id);
CREATE INDEX idx_chunks_source ON document_chunks(source_type, source_id);
-- IVFFlat index for approximate nearest neighbor search
CREATE INDEX idx_chunks_embedding ON document_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- AI chat conversations
CREATE TABLE ai_conversations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  hospital_id UUID REFERENCES hospitals(id),
  title       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conversations_user ON ai_conversations(user_id, created_at DESC);

CREATE TYPE message_role AS ENUM ('user', 'assistant', 'system');

CREATE TABLE ai_messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role            message_role NOT NULL,
  content         TEXT NOT NULL,
  source_chunks   JSONB,
  tokens_used     INTEGER,
  feedback        SMALLINT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_messages_conv ON ai_messages(conversation_id, created_at);

-- Vector search function
CREATE OR REPLACE FUNCTION search_document_chunks(
  query_embedding   vector(1536),
  org_id_param      UUID,
  hospital_id_param UUID DEFAULT NULL,
  match_threshold   FLOAT DEFAULT 0.75,
  match_count       INT DEFAULT 5
)
RETURNS TABLE (
  id          UUID,
  content     TEXT,
  source_type TEXT,
  source_id   UUID,
  metadata    JSONB,
  similarity  FLOAT
) AS $$
  SELECT
    id,
    content,
    source_type,
    source_id,
    metadata,
    1 - (embedding <=> query_embedding) AS similarity
  FROM document_chunks
  WHERE
    org_id = org_id_param
    AND (hospital_id_param IS NULL OR hospital_id = hospital_id_param OR hospital_id IS NULL)
    AND 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$ LANGUAGE SQL STABLE;

-- Full-text search function for KB
CREATE OR REPLACE FUNCTION search_kb_articles(
  query_text        TEXT,
  org_id_param      UUID,
  hospital_id_param UUID DEFAULT NULL
)
RETURNS TABLE (
  id          UUID,
  title       TEXT,
  content_text TEXT,
  tags        TEXT[],
  rank        FLOAT
) AS $$
  SELECT
    id,
    title,
    content_text,
    tags,
    ts_rank(
      to_tsvector('english', title || ' ' || COALESCE(content_text, '')),
      plainto_tsquery('english', query_text)
    ) AS rank
  FROM kb_articles
  WHERE
    org_id = org_id_param
    AND (hospital_id_param IS NULL OR hospital_id = hospital_id_param OR hospital_id IS NULL)
    AND status = 'published'
    AND to_tsvector('english', title || ' ' || COALESCE(content_text, ''))
        @@ plainto_tsquery('english', query_text)
  ORDER BY rank DESC
  LIMIT 10;
$$ LANGUAGE SQL STABLE;

-- Cleanup chunks when source deleted
CREATE OR REPLACE FUNCTION delete_source_chunks()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM document_chunks
  WHERE source_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER kb_articles_cleanup_chunks
  AFTER DELETE ON kb_articles
  FOR EACH ROW EXECUTE FUNCTION delete_source_chunks();

CREATE TRIGGER update_kb_articles_updated_at
  BEFORE UPDATE ON kb_articles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_conversations_updated_at
  BEFORE UPDATE ON ai_conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
