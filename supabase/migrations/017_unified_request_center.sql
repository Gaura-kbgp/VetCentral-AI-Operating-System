-- ============================================================
-- Migration 017: Unified Request & Approval Center
-- Support for meeting, leave, purchase, training, document,
-- and equipment requests with approval workflows
-- ============================================================

-- ── Drop tables if partially created by a failed previous run ──
-- (cascade removes dependent policies and indexes automatically)
DROP TABLE IF EXISTS request_activity CASCADE;
DROP TABLE IF EXISTS request_approvals CASCADE;
DROP TABLE IF EXISTS equipment_requests CASCADE;
DROP TABLE IF EXISTS document_verification_requests CASCADE;
DROP TABLE IF EXISTS training_requests CASCADE;
DROP TABLE IF EXISTS purchase_requests CASCADE;
DROP TABLE IF EXISTS leave_requests CASCADE;
DROP TABLE IF EXISTS meeting_requests CASCADE;
DROP TABLE IF EXISTS requests CASCADE;

-- ── Master Requests Table ──────────────────────────────────
-- This table tracks all request types across the system
CREATE TABLE IF NOT EXISTS requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK (request_type IN (
    'meeting', 'leave', 'purchase', 'training', 'document_verification', 'equipment'
  )),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'approved', 'rejected', 'escalated', 'cancelled', 'completed'
  )),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN (
    'low', 'medium', 'high', 'urgent'
  )),

  -- Requester info
  requested_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  requested_for UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- Approval chain
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  due_date TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,

  -- Admin notes
  title TEXT NOT NULL,
  description TEXT,
  rejection_reason TEXT,

  -- For escalation tracking
  escalation_reason TEXT,
  escalated_at TIMESTAMPTZ,
  escalated_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

-- ── Meeting Requests ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS meeting_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL UNIQUE REFERENCES requests(id) ON DELETE CASCADE,

  -- Meeting details
  title TEXT NOT NULL,
  description TEXT,
  meeting_type TEXT NOT NULL CHECK (meeting_type IN (
    'orientation', 'one_on_one', 'team_intro', 'training', 'review', 'other'
  )),

  -- Scheduling
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  is_all_day BOOLEAN DEFAULT false,
  location TEXT,
  meeting_link TEXT,

  -- Participants
  required_attendees UUID[] DEFAULT '{}',
  optional_attendees UUID[] DEFAULT '{}',

  -- Calendar integration
  calendar_event_id UUID REFERENCES calendar_events(id) ON DELETE SET NULL,
  has_conflicts BOOLEAN DEFAULT false,
  conflict_details JSONB,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Leave Requests ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL UNIQUE REFERENCES requests(id) ON DELETE CASCADE,

  -- Leave details
  leave_type TEXT NOT NULL CHECK (leave_type IN (
    'vacation', 'sick', 'personal', 'bereavement', 'parental', 'unpaid', 'other'
  )),

  -- Duration
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  duration_days INTEGER NOT NULL,

  -- Coverage
  coverage_plan TEXT,
  coverage_by UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- Details
  reason TEXT,
  attachment_url TEXT,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Purchase Requests ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL UNIQUE REFERENCES requests(id) ON DELETE CASCADE,

  -- Item details
  item_description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(10, 2) NOT NULL,
  total_cost DECIMAL(10, 2) NOT NULL,
  currency TEXT DEFAULT 'USD',

  -- Procurement
  vendor_name TEXT,
  vendor_contact TEXT,
  estimated_delivery DATE,
  purchase_order_number TEXT,

  -- Budget
  department TEXT,
  cost_center TEXT,
  budget_code TEXT,

  -- Justification
  business_justification TEXT,
  expected_roi TEXT,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Training Requests ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS training_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL UNIQUE REFERENCES requests(id) ON DELETE CASCADE,

  -- Training details
  training_title TEXT NOT NULL,
  training_type TEXT NOT NULL CHECK (training_type IN (
    'certification', 'workshop', 'conference', 'online_course', 'mentoring', 'other'
  )),

  -- Provider
  provider_name TEXT,
  provider_url TEXT,

  -- Schedule
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  duration_hours DECIMAL(5, 2),
  delivery_method TEXT CHECK (delivery_method IN ('in_person', 'online', 'hybrid')),

  -- Cost
  cost DECIMAL(10, 2),
  currency TEXT DEFAULT 'USD',

  -- Learning objectives
  learning_objectives TEXT,
  expected_outcome TEXT,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Document Verification Requests ───────────────────────────
CREATE TABLE IF NOT EXISTS document_verification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL UNIQUE REFERENCES requests(id) ON DELETE CASCADE,

  -- Document details
  document_type TEXT NOT NULL CHECK (document_type IN (
    'license', 'certification', 'diploma', 'identity', 'background_check', 'reference', 'other'
  )),

  -- Document info
  document_name TEXT NOT NULL,
  document_url TEXT NOT NULL,
  issued_by TEXT,
  expiration_date DATE,

  -- Verification
  verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN (
    'pending', 'verified', 'rejected', 'expired'
  )),
  verified_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  verification_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Equipment Requests ────────────────────────────────────
CREATE TABLE IF NOT EXISTS equipment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL UNIQUE REFERENCES requests(id) ON DELETE CASCADE,

  -- Equipment details
  equipment_name TEXT NOT NULL,
  equipment_type TEXT NOT NULL CHECK (equipment_type IN (
    'computer', 'phone', 'software', 'furniture', 'medical_equipment', 'vehicle', 'other'
  )),

  -- Specifications
  specifications TEXT,
  quantity INTEGER DEFAULT 1,
  estimated_cost DECIMAL(10, 2),
  currency TEXT DEFAULT 'USD',

  -- Justification
  business_justification TEXT,
  intended_use TEXT,

  -- Allocation
  allocated_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  department TEXT,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Request Approvals (Approval Chain) ─────────────────────
CREATE TABLE IF NOT EXISTS request_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,

  -- Approval step
  step_number INTEGER NOT NULL,
  approver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  approver_role TEXT NOT NULL,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'approved', 'rejected', 'delegated'
  )),

  -- Notes
  comments TEXT,
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,

  -- Delegation
  delegated_to UUID REFERENCES profiles(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Request Activity Log ───────────────────────────────────
CREATE TABLE IF NOT EXISTS request_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,

  activity_type TEXT NOT NULL,
  action_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  details JSONB,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_requests_org ON requests(org_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_type ON requests(request_type);
CREATE INDEX IF NOT EXISTS idx_requests_created ON requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_requested_by ON requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_requests_assigned_to ON requests(assigned_to);
CREATE INDEX IF NOT EXISTS idx_requests_due_date ON requests(due_date);
CREATE INDEX IF NOT EXISTS idx_requests_org_status ON requests(org_id, status);

CREATE INDEX IF NOT EXISTS idx_meeting_requests_calendar ON meeting_requests(calendar_event_id);
CREATE INDEX IF NOT EXISTS idx_meeting_requests_start ON meeting_requests(start_time);

CREATE INDEX IF NOT EXISTS idx_leave_requests_dates ON leave_requests(start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_purchase_requests_cost ON purchase_requests(total_cost);

CREATE INDEX IF NOT EXISTS idx_training_requests_dates ON training_requests(start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_document_requests_status ON document_verification_requests(verification_status);

CREATE INDEX IF NOT EXISTS idx_equipment_requests_type ON equipment_requests(equipment_type);

CREATE INDEX IF NOT EXISTS idx_request_approvals_status ON request_approvals(status);
CREATE INDEX IF NOT EXISTS idx_request_approvals_approver ON request_approvals(approver_id);

CREATE INDEX IF NOT EXISTS idx_request_activity_request ON request_activity(request_id);

-- ── RLS Policies ──────────────────────────────────────────
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_verification_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_activity ENABLE ROW LEVEL SECURITY;

-- Requests: Users can see own requests, managers see team, admins see all
CREATE POLICY "requests_select_own" ON requests
  FOR SELECT USING (requested_by = auth.uid());

CREATE POLICY "requests_select_assigned" ON requests
  FOR SELECT USING (assigned_to = auth.uid());

CREATE POLICY "requests_select_org" ON requests
  FOR SELECT USING (
    org_id = public.user_org_id()
    AND (
      public.user_has_role('super_admin'::app_role)
      OR public.user_has_role('org_admin'::app_role)
      OR public.user_has_role('hospital_admin'::app_role)
      OR public.user_has_role('practice_manager'::app_role)
      OR public.user_has_role('hr'::app_role)
    )
  );

CREATE POLICY "requests_insert" ON requests
  FOR INSERT WITH CHECK (org_id = public.user_org_id());

-- Detail tables: same visibility as parent request
CREATE POLICY "meeting_requests_select" ON meeting_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM requests r
      WHERE r.id = meeting_requests.request_id
        AND (r.requested_by = auth.uid()
          OR r.assigned_to = auth.uid()
          OR (r.org_id = public.user_org_id()
            AND (
              public.user_has_role('super_admin'::app_role)
              OR public.user_has_role('org_admin'::app_role)
              OR public.user_has_role('hospital_admin'::app_role)
            )
          )
        )
    )
  );

CREATE POLICY "leave_requests_select" ON leave_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM requests r
      WHERE r.id = leave_requests.request_id
        AND (r.requested_by = auth.uid()
          OR r.assigned_to = auth.uid()
          OR (r.org_id = public.user_org_id()
            AND (
              public.user_has_role('super_admin'::app_role)
              OR public.user_has_role('org_admin'::app_role)
              OR public.user_has_role('hospital_admin'::app_role)
              OR public.user_has_role('hr'::app_role)
            )
          )
        )
    )
  );

CREATE POLICY "purchase_requests_select" ON purchase_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM requests r
      WHERE r.id = purchase_requests.request_id
        AND (r.requested_by = auth.uid()
          OR r.assigned_to = auth.uid()
          OR (r.org_id = public.user_org_id()
            AND (
              public.user_has_role('super_admin'::app_role)
              OR public.user_has_role('org_admin'::app_role)
              OR public.user_has_role('hospital_admin'::app_role)
            )
          )
        )
    )
  );

CREATE POLICY "training_requests_select" ON training_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM requests r
      WHERE r.id = training_requests.request_id
        AND (r.requested_by = auth.uid()
          OR r.assigned_to = auth.uid()
          OR (r.org_id = public.user_org_id()
            AND (
              public.user_has_role('super_admin'::app_role)
              OR public.user_has_role('org_admin'::app_role)
              OR public.user_has_role('hospital_admin'::app_role)
              OR public.user_has_role('hr'::app_role)
            )
          )
        )
    )
  );

CREATE POLICY "document_requests_select" ON document_verification_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM requests r
      WHERE r.id = document_verification_requests.request_id
        AND (r.requested_by = auth.uid()
          OR r.assigned_to = auth.uid()
          OR (r.org_id = public.user_org_id()
            AND (
              public.user_has_role('super_admin'::app_role)
              OR public.user_has_role('org_admin'::app_role)
              OR public.user_has_role('hospital_admin'::app_role)
            )
          )
        )
    )
  );

CREATE POLICY "equipment_requests_select" ON equipment_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM requests r
      WHERE r.id = equipment_requests.request_id
        AND (r.requested_by = auth.uid()
          OR r.assigned_to = auth.uid()
          OR (r.org_id = public.user_org_id()
            AND (
              public.user_has_role('super_admin'::app_role)
              OR public.user_has_role('org_admin'::app_role)
              OR public.user_has_role('hospital_admin'::app_role)
            )
          )
        )
    )
  );

-- Approvals: only approvers can see their assignments
CREATE POLICY "request_approvals_select" ON request_approvals
  FOR SELECT USING (
    approver_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM requests r
      WHERE r.id = request_approvals.request_id
        AND r.org_id = public.user_org_id()
        AND (
          public.user_has_role('super_admin'::app_role)
          OR public.user_has_role('org_admin'::app_role)
          OR public.user_has_role('hospital_admin'::app_role)
        )
    )
  );

CREATE POLICY "request_activity_select" ON request_activity
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM requests r
      WHERE r.id = request_activity.request_id
        AND (r.requested_by = auth.uid()
          OR r.assigned_to = auth.uid()
          OR (r.org_id = public.user_org_id()
            AND (
              public.user_has_role('super_admin'::app_role)
              OR public.user_has_role('org_admin'::app_role)
              OR public.user_has_role('hospital_admin'::app_role)
            )
          )
        )
    )
  );

-- ── Auto-update timestamps ────────────────────────────────
CREATE OR REPLACE FUNCTION update_requests_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_requests_updated_at
  BEFORE UPDATE ON requests
  FOR EACH ROW EXECUTE FUNCTION update_requests_updated_at();
