-- ============================================================
-- Migration 018: RBAC Enhancement
-- Org-level roles, expanded permissions, audit triggers
-- ============================================================

-- ── 1. Org-level role table ────────────────────────────────────────────────
-- user_hospital_roles is hospital-scoped (UNIQUE per user+hospital).
-- Org-wide roles (super_admin, org_admin) live here instead, so one row
-- covers the whole org without duplicating across every hospital.
CREATE TABLE IF NOT EXISTS org_user_roles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role       app_role NOT NULL,
  granted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  notes      TEXT,
  UNIQUE (user_id, org_id)
);

CREATE INDEX IF NOT EXISTS idx_org_roles_user    ON org_user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_org_roles_org     ON org_user_roles(org_id);
CREATE INDEX IF NOT EXISTS idx_org_roles_role    ON org_user_roles(role);

ALTER TABLE org_user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_roles_select_own_org" ON org_user_roles;
CREATE POLICY "org_roles_select_own_org" ON org_user_roles
  FOR SELECT USING (org_id = public.user_org_id());

DROP POLICY IF EXISTS "org_roles_manage_admin" ON org_user_roles;
CREATE POLICY "org_roles_manage_admin" ON org_user_roles
  FOR ALL USING (
    org_id = public.user_org_id()
    AND (
      public.user_has_role('super_admin'::app_role)
      OR public.user_has_role('org_admin'::app_role)
    )
  );

-- ── 2. Enhance user_hospital_roles ────────────────────────────────────────
ALTER TABLE user_hospital_roles
  ADD COLUMN IF NOT EXISTS is_active  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notes      TEXT;

-- ── 3. Update public.user_has_role() to check BOTH tables ─────────────────
CREATE OR REPLACE FUNCTION public.user_has_role(p_role app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_hospital_roles
    WHERE user_id = auth.uid()
      AND role    = p_role
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > now())
  )
  OR EXISTS (
    SELECT 1 FROM org_user_roles
    WHERE user_id = auth.uid()
      AND role    = p_role
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;

-- ── 4. Update public.user_hospital_ids() to include org-admins ────────────
-- Org-level admins implicitly have access to all hospitals in the org.
CREATE OR REPLACE FUNCTION public.user_hospital_ids()
RETURNS UUID[]
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM org_user_roles
      WHERE user_id  = auth.uid()
        AND is_active = true
        AND role IN ('super_admin'::app_role, 'org_admin'::app_role)
    )
    THEN (
      -- Org admins see all hospitals in their org
      SELECT ARRAY_AGG(h.id)
      FROM hospitals h
      JOIN org_user_roles our ON h.org_id = our.org_id
      WHERE our.user_id  = auth.uid()
        AND our.is_active = true
    )
    ELSE (
      SELECT ARRAY_AGG(hospital_id)
      FROM user_hospital_roles
      WHERE user_id   = auth.uid()
        AND is_active = true
        AND (expires_at IS NULL OR expires_at > now())
    )
  END;
$$;

-- ── 5. Add metadata to audit_logs ─────────────────────────────────────────
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS metadata  JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS severity  TEXT DEFAULT 'info'
    CHECK (severity IN ('info', 'warning', 'critical'));

CREATE INDEX IF NOT EXISTS idx_audit_action   ON audit_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_severity ON audit_logs(severity, created_at DESC);

-- ── 6. Audit trigger: log role grants/revocations automatically ────────────

CREATE OR REPLACE FUNCTION rbac_audit_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_action TEXT;
  v_actor  UUID;
BEGIN
  -- Determine org_id from profiles
  SELECT org_id INTO v_org_id FROM profiles WHERE id = COALESCE(NEW.user_id, OLD.user_id);

  IF TG_OP = 'INSERT' THEN
    v_action := 'role_granted';
    v_actor  := NEW.granted_by;
    INSERT INTO audit_logs (
      org_id, user_id, action, resource_type, resource_id,
      new_data, severity, metadata
    ) VALUES (
      v_org_id,
      v_actor,
      v_action,
      'user_role',
      NEW.id,
      jsonb_build_object(
        'target_user_id', NEW.user_id,
        'role', NEW.role,
        'hospital_id', CASE WHEN TG_TABLE_NAME = 'user_hospital_roles' THEN NEW.hospital_id ELSE NULL END,
        'scope', CASE WHEN TG_TABLE_NAME = 'org_user_roles' THEN 'org' ELSE 'hospital' END
      ),
      'warning',
      jsonb_build_object('table', TG_TABLE_NAME)
    );
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'role_revoked';
    v_actor  := auth.uid();
    INSERT INTO audit_logs (
      org_id, user_id, action, resource_type, resource_id,
      old_data, severity, metadata
    ) VALUES (
      v_org_id,
      v_actor,
      v_action,
      'user_role',
      OLD.id,
      jsonb_build_object(
        'target_user_id', OLD.user_id,
        'role', OLD.role,
        'hospital_id', CASE WHEN TG_TABLE_NAME = 'user_hospital_roles' THEN OLD.hospital_id ELSE NULL END,
        'scope', CASE WHEN TG_TABLE_NAME = 'org_user_roles' THEN 'org' ELSE 'hospital' END
      ),
      'warning',
      jsonb_build_object('table', TG_TABLE_NAME)
    );
    RETURN OLD;

  ELSIF TG_OP = 'UPDATE' AND OLD.role IS DISTINCT FROM NEW.role THEN
    v_action := 'role_changed';
    v_actor  := NEW.granted_by;
    INSERT INTO audit_logs (
      org_id, user_id, action, resource_type, resource_id,
      old_data, new_data, severity, metadata
    ) VALUES (
      v_org_id,
      v_actor,
      v_action,
      'user_role',
      NEW.id,
      jsonb_build_object('role', OLD.role),
      jsonb_build_object('role', NEW.role),
      'warning',
      jsonb_build_object('table', TG_TABLE_NAME)
    );
    RETURN NEW;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_hospital_role ON user_hospital_roles;
CREATE TRIGGER trg_audit_hospital_role
  AFTER INSERT OR UPDATE OR DELETE ON user_hospital_roles
  FOR EACH ROW EXECUTE FUNCTION rbac_audit_role_change();

DROP TRIGGER IF EXISTS trg_audit_org_role ON org_user_roles;
CREATE TRIGGER trg_audit_org_role
  AFTER INSERT OR UPDATE OR DELETE ON org_user_roles
  FOR EACH ROW EXECUTE FUNCTION rbac_audit_role_change();

-- ── 7. Expand permissions catalog with missing modules ─────────────────────
INSERT INTO public.permissions (module, action, label, sort_order) VALUES
  -- onboarding
  ('onboarding', 'view',      'View Onboarding Records',   1),
  ('onboarding', 'create',    'Create Onboarding Records', 2),
  ('onboarding', 'manage',    'Manage Onboarding',         3),
  ('onboarding', 'view_own',  'View Own Onboarding',       4),
  -- requests
  ('requests', 'view_own',    'View Own Requests',         1),
  ('requests', 'view_dept',   'View Department Requests',  2),
  ('requests', 'view_hosp',   'View Hospital Requests',    3),
  ('requests', 'view_all',    'View All Requests',         4),
  ('requests', 'create',      'Create Requests',           5),
  ('requests', 'approve',     'Approve Requests',          6),
  ('requests', 'escalate',    'Escalate Requests',         7),
  -- ai
  ('ai', 'query_own',         'AI Query Own Data',         1),
  ('ai', 'query_dept',        'AI Query Department Data',  2),
  ('ai', 'query_hosp',        'AI Query Hospital Data',    3),
  ('ai', 'query_all',         'AI Query All Data',         4),
  ('ai', 'configure',         'Configure AI Settings',     5),
  -- projects
  ('projects', 'view',        'View Projects',             1),
  ('projects', 'create',      'Create Projects',           2),
  ('projects', 'manage',      'Manage Projects',           3),
  -- communication
  ('communication', 'view',   'View Channels',             1),
  ('communication', 'create', 'Create Channels',           2),
  ('communication', 'manage', 'Manage Channels',           3),
  -- hospital_hub
  ('hospital_hub', 'view',    'View Hospital Hub',         1),
  ('hospital_hub', 'manage',  'Manage Hospital Hub',       2),
  -- analytics
  ('analytics', 'view_own',   'View Own Analytics',        1),
  ('analytics', 'view_hosp',  'View Hospital Analytics',   2),
  ('analytics', 'view_all',   'View All Analytics',        3),
  -- documents
  ('documents', 'view_own',   'View Own Documents',        1),
  ('documents', 'view_all',   'View All Documents',        2),
  ('documents', 'verify',     'Verify Documents',          3),
  -- hr_module
  ('hr', 'view',              'View HR Module',            1),
  ('hr', 'manage',            'Manage HR Records',         2)
ON CONFLICT (module, action) DO NOTHING;

-- ── 8. Seed new permissions into role_permissions ─────────────────────────

-- super_admin & org_admin: all new permissions
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'super_admin', id FROM public.permissions
WHERE module IN ('onboarding','requests','ai','projects','communication','hospital_hub','analytics','documents','hr')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission_id)
SELECT 'org_admin', id FROM public.permissions
WHERE module IN ('onboarding','requests','ai','projects','communication','hospital_hub','analytics','documents','hr')
ON CONFLICT DO NOTHING;

-- hospital_admin
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'hospital_admin', p.id FROM public.permissions p
WHERE (p.module = 'onboarding' AND p.action IN ('view','create','manage'))
   OR (p.module = 'requests'   AND p.action IN ('view_own','view_dept','view_hosp','create','approve','escalate'))
   OR (p.module = 'ai'         AND p.action IN ('query_own','query_dept','query_hosp'))
   OR (p.module = 'projects'   AND p.action IN ('view','create','manage'))
   OR (p.module = 'communication' AND p.action IN ('view','create','manage'))
   OR (p.module = 'hospital_hub'  AND p.action IN ('view','manage'))
   OR (p.module = 'analytics'    AND p.action IN ('view_own','view_hosp'))
   OR (p.module = 'documents'    AND p.action IN ('view_own','view_all','verify'))
   OR (p.module = 'hr'           AND p.action IN ('view','manage'))
ON CONFLICT DO NOTHING;

-- practice_manager / department manager
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'practice_manager', p.id FROM public.permissions p
WHERE (p.module = 'onboarding'   AND p.action IN ('view'))
   OR (p.module = 'requests'     AND p.action IN ('view_own','view_dept','create','approve'))
   OR (p.module = 'ai'           AND p.action IN ('query_own','query_dept'))
   OR (p.module = 'projects'     AND p.action IN ('view','create','manage'))
   OR (p.module = 'communication' AND p.action IN ('view','create'))
   OR (p.module = 'analytics'    AND p.action IN ('view_own'))
   OR (p.module = 'documents'    AND p.action IN ('view_own'))
   OR (p.module = 'hr'           AND p.action IN ('view'))
ON CONFLICT DO NOTHING;

-- hr
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'hr', p.id FROM public.permissions p
WHERE (p.module = 'onboarding'   AND p.action IN ('view','create','manage'))
   OR (p.module = 'requests'     AND p.action IN ('view_own','create','approve'))
   OR (p.module = 'ai'           AND p.action IN ('query_own'))
   OR (p.module = 'communication' AND p.action IN ('view','create'))
   OR (p.module = 'analytics'    AND p.action IN ('view_own'))
   OR (p.module = 'documents'    AND p.action IN ('view_own','view_all','verify'))
   OR (p.module = 'hr'           AND p.action IN ('view','manage'))
ON CONFLICT DO NOTHING;

-- doctor, csr, va, marketing, it_admin (employees)
DO $$
DECLARE
  r app_role;
BEGIN
  FOREACH r IN ARRAY ARRAY['doctor','csr','va','marketing','it_admin','viewer']::app_role[]
  LOOP
    INSERT INTO public.role_permissions (role, permission_id)
    SELECT r::text, p.id FROM public.permissions p
    WHERE (p.module = 'requests'      AND p.action IN ('view_own','create'))
       OR (p.module = 'ai'            AND p.action IN ('query_own'))
       OR (p.module = 'communication' AND p.action IN ('view','create'))
       OR (p.module = 'analytics'     AND p.action IN ('view_own'))
       OR (p.module = 'documents'     AND p.action IN ('view_own'))
       OR (p.module = 'onboarding'    AND p.action IN ('view_own'))
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- ── 9. Role-permission SELECT policy ──────────────────────────────────────
-- (Already exists in migration 009 as role_permissions_read_all, keep it)

-- ── 10. Function: get_user_effective_permissions(user_id) ─────────────────
CREATE OR REPLACE FUNCTION public.get_user_effective_permissions(p_user_id UUID DEFAULT auth.uid())
RETURNS TABLE (module TEXT, action TEXT, label TEXT)
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT p.module, p.action, p.label
  FROM role_permissions rp
  JOIN permissions p ON p.id = rp.permission_id
  WHERE rp.role IN (
    SELECT role::text FROM user_hospital_roles
    WHERE user_id = p_user_id AND is_active = true
      AND (expires_at IS NULL OR expires_at > now())
    UNION
    SELECT role::text FROM org_user_roles
    WHERE user_id = p_user_id AND is_active = true
      AND (expires_at IS NULL OR expires_at > now())
  )
  ORDER BY p.module, p.action;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_effective_permissions(UUID) TO authenticated;
