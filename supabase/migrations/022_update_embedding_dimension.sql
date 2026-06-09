-- ============================================================
-- Migration 022: Update embedding dimension 1536 → 768
-- Switching from OpenAI text-embedding-3-small (1536-dim)
-- to Replicate jina-embeddings-v2-base-en (768-dim).
-- All existing chunks must be deleted and re-indexed.
-- ============================================================

-- Drop the IVFFlat index that pins the old dimension
DROP INDEX IF EXISTS idx_chunks_embedding;

-- Remove all existing embeddings (they are 1536-dim and incompatible)
DELETE FROM document_chunks;

-- Alter the column to the new dimension
ALTER TABLE document_chunks
  ALTER COLUMN embedding TYPE vector(768);

-- Recreate the approximate-nearest-neighbour index for the new dimension
-- Lower list count (50) matches the smaller expected row count after re-indexing.
CREATE INDEX idx_chunks_embedding ON document_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- Recreate the search function with the updated vector dimension
DROP FUNCTION IF EXISTS search_document_chunks(vector(1536), uuid, uuid, float, int);

CREATE OR REPLACE FUNCTION search_document_chunks(
  query_embedding   vector(768),
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
