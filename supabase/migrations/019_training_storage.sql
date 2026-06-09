-- ============================================================
-- Migration 019: Training Content Storage
-- Creates training-content bucket and adds storage_path column
-- ============================================================

-- Add storage_path to training_modules so we can delete files
ALTER TABLE training_modules
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS file_size    BIGINT;

-- Update content_type to also allow 'photo'
-- (TEXT column, no enum constraint to update)

-- Storage bucket for training content (public for serving)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'training-content',
  'training-content',
  true,
  209715200,  -- 200 MB
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo',
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'text/plain', 'text/html'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: anyone authenticated can read (public bucket)
-- Uploads done via service role from API route only
