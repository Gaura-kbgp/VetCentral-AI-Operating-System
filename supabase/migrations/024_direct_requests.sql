-- Migration 024: Direct Person-to-Person Requests
-- Extends the requests table to support direct requests between any two people.

-- 1. Drop old request_type constraint and add 'direct'
ALTER TABLE requests DROP CONSTRAINT IF EXISTS requests_request_type_check;
ALTER TABLE requests ADD CONSTRAINT requests_request_type_check CHECK (request_type IN (
  'meeting', 'leave', 'purchase', 'training', 'document_verification', 'equipment', 'direct'
));

-- 2. Track when the recipient reads a direct request
ALTER TABLE requests ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

-- 3. Index for fast inbox queries
CREATE INDEX IF NOT EXISTS idx_requests_assigned_type ON requests(assigned_to, request_type);

-- 4. RLS: allow participants to insert replies into request_activity
-- (DROP first so the migration is re-runnable)
DROP POLICY IF EXISTS "request_activity_insert" ON request_activity;
CREATE POLICY "request_activity_insert" ON request_activity
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM requests r
      WHERE r.id = request_activity.request_id
        AND (r.requested_by = auth.uid() OR r.assigned_to = auth.uid())
    )
  );
