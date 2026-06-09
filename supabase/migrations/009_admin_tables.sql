-- 009_admin_tables.sql
-- Administration module tables: extends hospitals/departments, adds permissions,
-- role_permissions, org_settings, org_integrations. Idempotent.

-- ── Extend hospitals ──────────────────────────────────────────────
ALTER TABLE public.hospitals ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.hospitals ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE public.hospitals ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.hospitals ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- ── Extend departments ────────────────────────────────────────────
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES public.profiles(id);
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS color text DEFAULT '#6366F1';
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Backfill org_id on departments from their hospital
UPDATE public.departments d
SET    org_id = h.org_id
FROM   public.hospitals h
WHERE  h.id = d.hospital_id AND d.org_id IS NULL;

-- ── Permissions catalog ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.permissions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module     text NOT NULL,
  action     text NOT NULL,
  label      text NOT NULL,
  sort_order int DEFAULT 0,
  UNIQUE(module, action)
);

-- ── Role-permission mapping ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role          text NOT NULL,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  granted_by    uuid REFERENCES public.profiles(id),
  granted_at    timestamptz DEFAULT now(),
  PRIMARY KEY (role, permission_id)
);

-- ── Org settings (key/value per org per section) ──────────────────
CREATE TABLE IF NOT EXISTS public.org_settings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  section    text NOT NULL,
  key        text NOT NULL,
  value      text,
  updated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, section, key)
);

-- ── Integrations ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.org_integrations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider     text NOT NULL,
  display_name text NOT NULL,
  status       text NOT NULL DEFAULT 'disconnected',
  config       jsonb NOT NULL DEFAULT '{}',
  connected_at timestamptz,
  connected_by uuid REFERENCES public.profiles(id),
  last_sync_at timestamptz,
  error_msg    text,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  UNIQUE(org_id, provider)
);

-- ── RLS ───────────────────────────────────────────────────────────
ALTER TABLE public.permissions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_integrations  ENABLE ROW LEVEL SECURITY;

-- Postgres has no CREATE POLICY IF NOT EXISTS; drop-then-create for idempotency.
DROP POLICY IF EXISTS "permissions_read_all"      ON public.permissions;
CREATE POLICY "permissions_read_all"              ON public.permissions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "role_permissions_read_all" ON public.role_permissions;
CREATE POLICY "role_permissions_read_all"         ON public.role_permissions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "org_settings_org_only"     ON public.org_settings;
CREATE POLICY "org_settings_org_only"             ON public.org_settings
  FOR ALL USING (org_id = public.user_org_id());

DROP POLICY IF EXISTS "org_integrations_org_only" ON public.org_integrations;
CREATE POLICY "org_integrations_org_only"         ON public.org_integrations
  FOR ALL USING (org_id = public.user_org_id());

-- ── Seed permissions ──────────────────────────────────────────────
INSERT INTO public.permissions (module, action, label, sort_order) VALUES
  ('users','view','View Users',1),('users','create','Create Users',2),('users','edit','Edit Users',3),('users','delete','Delete Users',4),('users','export','Export Users',5),
  ('hospitals','view','View Hospitals',1),('hospitals','create','Add Hospitals',2),('hospitals','edit','Edit Hospitals',3),('hospitals','delete','Remove Hospitals',4),
  ('departments','view','View Departments',1),('departments','create','Add Departments',2),('departments','edit','Edit Departments',3),('departments','delete','Remove Departments',4),
  ('roles','view','View Roles',1),('roles','edit','Manage Permissions',2),
  ('audit_logs','view','View Audit Logs',1),('audit_logs','export','Export Logs',2),
  ('settings','view','View Settings',1),('settings','edit','Edit Settings',2),
  ('integrations','view','View Integrations',1),('integrations','edit','Manage Integrations',2),
  ('tasks','view','View Tasks',1),('tasks','create','Create Tasks',2),('tasks','edit','Edit Tasks',3),('tasks','delete','Delete Tasks',4),
  ('calendar','view','View Calendar',1),('calendar','create','Create Events',2),('calendar','edit','Edit Events',3),('calendar','delete','Delete Events',4),
  ('knowledge_base','view','View KB',1),('knowledge_base','create','Create Articles',2),('knowledge_base','edit','Edit Articles',3),('knowledge_base','delete','Delete Articles',4),
  ('training','view','View Training',1),('training','create','Create Courses',2),('training','edit','Edit Courses',3),('training','delete','Delete Courses',4)
ON CONFLICT (module, action) DO NOTHING;

-- ── Seed role_permissions ─────────────────────────────────────────
-- super_admin & org_admin: full access
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'super_admin', id FROM public.permissions ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'org_admin', id FROM public.permissions ON CONFLICT DO NOTHING;

-- hospital_admin: everything except settings/integrations edit
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'hospital_admin', id FROM public.permissions
WHERE NOT (module IN ('settings','integrations') AND action = 'edit') ON CONFLICT DO NOTHING;

-- practice_manager: operational modules
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'practice_manager', id FROM public.permissions
WHERE module IN ('tasks','calendar','users','departments','training') AND action IN ('view','create','edit') ON CONFLICT DO NOTHING;

-- doctor: clinical
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'doctor', id FROM public.permissions
WHERE module IN ('tasks','calendar','knowledge_base','training') AND action IN ('view','create','edit') ON CONFLICT DO NOTHING;

-- hr
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'hr', id FROM public.permissions
WHERE module IN ('users','training','departments') ON CONFLICT DO NOTHING;

-- it_admin
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'it_admin', id FROM public.permissions
WHERE module IN ('settings','integrations','audit_logs','users') ON CONFLICT DO NOTHING;

-- viewer: view-only everywhere
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'viewer', id FROM public.permissions
WHERE action = 'view' ON CONFLICT DO NOTHING;

-- csr, va, marketing: task/calendar
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'csr', id FROM public.permissions
WHERE module IN ('tasks','calendar') AND action IN ('view','create') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'va', id FROM public.permissions
WHERE module IN ('tasks','calendar') AND action IN ('view','create') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'marketing', id FROM public.permissions
WHERE module IN ('tasks','calendar') AND action IN ('view','create') ON CONFLICT DO NOTHING;
