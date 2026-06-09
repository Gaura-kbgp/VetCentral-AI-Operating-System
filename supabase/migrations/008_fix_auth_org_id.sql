-- ============================================================
-- Migration 008: Replace ALL auth.* helper functions with
-- public schema equivalents that only depend on auth.uid().
--
-- Root cause: auth.org_id(), auth.accessible_hospital_ids(),
-- auth.has_role() were defined in the auth schema which the
-- SQL editor cannot access. Policies using them always fail.
--
-- Fix: public.* helper functions + rebuild all policies.
-- ============================================================

-- ── Step 1: Public helper functions ──────────────────────────

-- Current user's org_id (reads from profiles table)
CREATE OR REPLACE FUNCTION public.user_org_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid();
$$;

-- All hospital IDs the current user has a role in
CREATE OR REPLACE FUNCTION public.user_hospital_ids()
RETURNS UUID[] LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT ARRAY(
    SELECT hospital_id
    FROM public.user_hospital_roles
    WHERE user_id = auth.uid()
      AND hospital_id IS NOT NULL
  );
$$;

-- Does current user have the given role (any hospital or org-wide)?
CREATE OR REPLACE FUNCTION public.user_has_role(p_role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_hospital_roles
    WHERE user_id = auth.uid()
      AND role = p_role
  );
$$;

-- Does current user have one of the given roles at a specific hospital?
CREATE OR REPLACE FUNCTION public.user_has_hospital_role(
  p_hospital_id UUID,
  p_roles       app_role[]
) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_hospital_roles
    WHERE user_id    = auth.uid()
      AND role       = ANY(p_roles)
      AND (hospital_id = p_hospital_id OR hospital_id IS NULL)
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_org_id()                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_hospital_ids()                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_role(app_role)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_hospital_role(UUID, app_role[]) TO authenticated;


-- ── Step 2: Rebuild ALL policies ─────────────────────────────

-- ── ORGANIZATIONS ──────────────────────────────────────────
DROP POLICY IF EXISTS "orgs_select_members" ON organizations;
CREATE POLICY "orgs_select_members" ON organizations
  FOR SELECT USING (id = public.user_org_id());

-- ── HOSPITALS ──────────────────────────────────────────────
DROP POLICY IF EXISTS "hospitals_select_accessible" ON hospitals;
CREATE POLICY "hospitals_select_accessible" ON hospitals
  FOR SELECT USING (
    org_id = public.user_org_id()
    AND (
      id = ANY(public.user_hospital_ids())
      OR public.user_has_role('super_admin')
      OR public.user_has_role('org_admin')
    )
  );

-- ── PROFILES ───────────────────────────────────────────────
DROP POLICY IF EXISTS "profiles_select_org" ON profiles;
CREATE POLICY "profiles_select_org" ON profiles
  FOR SELECT USING (org_id = public.user_org_id());

-- ── AUDIT LOGS ─────────────────────────────────────────────
DROP POLICY IF EXISTS "audit_logs_select_admins" ON audit_logs;
CREATE POLICY "audit_logs_select_admins" ON audit_logs
  FOR SELECT USING (
    org_id = public.user_org_id()
    AND (
      public.user_has_role('hospital_admin')
      OR public.user_has_role('org_admin')
      OR public.user_has_role('super_admin')
    )
  );

-- ── CHANNELS ───────────────────────────────────────────────
DROP POLICY IF EXISTS "channels_select_accessible" ON channels;
CREATE POLICY "channels_select_accessible" ON channels
  FOR SELECT USING (
    org_id = public.user_org_id()
    AND (
      hospital_id = ANY(public.user_hospital_ids())
      OR hospital_id IS NULL
    )
    AND (
      channel_type IN ('public', 'announcement')
      OR EXISTS (
        SELECT 1 FROM channel_members
        WHERE channel_id = channels.id AND user_id = auth.uid()
      )
    )
  );

-- ── CALENDAR EVENTS ────────────────────────────────────────
DROP POLICY IF EXISTS "events_select_hospital" ON calendar_events;
CREATE POLICY "events_select_hospital" ON calendar_events
  FOR SELECT USING (
    org_id = public.user_org_id()
    AND (
      hospital_id = ANY(public.user_hospital_ids())
      OR hospital_id IS NULL
    )
  );

DROP POLICY IF EXISTS "events_insert_managers" ON calendar_events;
CREATE POLICY "events_insert_managers" ON calendar_events
  FOR INSERT WITH CHECK (
    org_id     = public.user_org_id()
    AND created_by = auth.uid()
    AND (
      hospital_id IS NULL
      OR public.user_has_hospital_role(
           hospital_id,
           ARRAY['super_admin','org_admin','hospital_admin','practice_manager']::app_role[]
         )
    )
  );

-- ── KB ARTICLES ────────────────────────────────────────────
DROP POLICY IF EXISTS "kb_select_published" ON kb_articles;
CREATE POLICY "kb_select_published" ON kb_articles
  FOR SELECT USING (
    org_id = public.user_org_id()
    AND (
      hospital_id = ANY(public.user_hospital_ids())
      OR hospital_id IS NULL
    )
    AND (
      status = 'published'
      OR author_id = auth.uid()
      OR public.user_has_role('hospital_admin')
      OR public.user_has_role('org_admin')
      OR public.user_has_role('super_admin')
    )
  );

DROP POLICY IF EXISTS "kb_insert_staff" ON kb_articles;
CREATE POLICY "kb_insert_staff" ON kb_articles
  FOR INSERT WITH CHECK (
    org_id    = public.user_org_id()
    AND author_id = auth.uid()
  );

-- ── DOCUMENT CHUNKS ────────────────────────────────────────
DROP POLICY IF EXISTS "chunks_select_org" ON document_chunks;
CREATE POLICY "chunks_select_org" ON document_chunks
  FOR SELECT USING (
    org_id = public.user_org_id()
    AND (
      hospital_id = ANY(public.user_hospital_ids())
      OR hospital_id IS NULL
    )
  );

-- ── TASKS ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "tasks_select_org" ON tasks;
CREATE POLICY "tasks_select_org" ON tasks
  FOR SELECT USING (org_id = public.user_org_id());

DROP POLICY IF EXISTS "tasks_insert_org" ON tasks;
CREATE POLICY "tasks_insert_org" ON tasks
  FOR INSERT WITH CHECK (
    org_id     = public.user_org_id()
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "tasks_update_involved" ON tasks;
CREATE POLICY "tasks_update_involved" ON tasks
  FOR UPDATE USING (
    org_id = public.user_org_id()
    AND (
      created_by  = auth.uid()
      OR assigned_to = auth.uid()
      OR public.user_has_role('hospital_admin')
      OR public.user_has_role('org_admin')
      OR public.user_has_role('super_admin')
      OR public.user_has_role('practice_manager')
    )
  );

DROP POLICY IF EXISTS "tasks_delete_creator_or_admin" ON tasks;
CREATE POLICY "tasks_delete_creator_or_admin" ON tasks
  FOR DELETE USING (
    created_by = auth.uid()
    OR public.user_has_role('hospital_admin')
    OR public.user_has_role('org_admin')
    OR public.user_has_role('super_admin')
  );

-- ── TASK COMMENTS ──────────────────────────────────────────
DROP POLICY IF EXISTS "task_comments_select" ON task_comments;
CREATE POLICY "task_comments_select" ON task_comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks
      WHERE id = task_comments.task_id
        AND org_id = public.user_org_id()
    )
  );

DROP POLICY IF EXISTS "task_comments_insert" ON task_comments;
CREATE POLICY "task_comments_insert" ON task_comments
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tasks
      WHERE id = task_comments.task_id
        AND org_id = public.user_org_id()
    )
  );

-- ── TASK ATTACHMENTS ───────────────────────────────────────
DROP POLICY IF EXISTS "task_attachments_select" ON task_attachments;
CREATE POLICY "task_attachments_select" ON task_attachments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tasks
      WHERE id = task_attachments.task_id
        AND org_id = public.user_org_id()
    )
  );

DROP POLICY IF EXISTS "task_attachments_insert" ON task_attachments;
CREATE POLICY "task_attachments_insert" ON task_attachments
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tasks
      WHERE id = task_attachments.task_id
        AND org_id = public.user_org_id()
    )
  );

-- ── TRAINING COURSES ───────────────────────────────────────
DROP POLICY IF EXISTS "training_courses_select" ON training_courses;
CREATE POLICY "training_courses_select" ON training_courses
  FOR SELECT USING (
    org_id = public.user_org_id()
    AND (
      is_published = TRUE
      OR created_by = auth.uid()
      OR public.user_has_role('hospital_admin')
      OR public.user_has_role('org_admin')
      OR public.user_has_role('super_admin')
      OR public.user_has_role('hr')
    )
  );

DROP POLICY IF EXISTS "training_courses_manage_admin" ON training_courses;
CREATE POLICY "training_courses_manage_admin" ON training_courses
  FOR ALL USING (
    org_id = public.user_org_id()
    AND (
      public.user_has_role('hospital_admin')
      OR public.user_has_role('org_admin')
      OR public.user_has_role('super_admin')
      OR public.user_has_role('hr')
    )
  );

DROP POLICY IF EXISTS "training_modules_select" ON training_modules;
CREATE POLICY "training_modules_select" ON training_modules
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM training_courses
      WHERE id  = training_modules.course_id
        AND org_id = public.user_org_id()
        AND (
          is_published = TRUE
          OR public.user_has_role('hospital_admin')
          OR public.user_has_role('org_admin')
          OR public.user_has_role('super_admin')
          OR public.user_has_role('hr')
        )
    )
  );

DROP POLICY IF EXISTS "enrollments_admin_read" ON user_course_enrollments;
CREATE POLICY "enrollments_admin_read" ON user_course_enrollments
  FOR SELECT USING (
    (
      public.user_has_role('hospital_admin')
      OR public.user_has_role('org_admin')
      OR public.user_has_role('super_admin')
      OR public.user_has_role('hr')
    )
    AND EXISTS (
      SELECT 1 FROM training_courses
      WHERE id = user_course_enrollments.course_id
        AND org_id = public.user_org_id()
    )
  );

-- ── CALENDAR EVENTS UPDATE ─────────────────────────────────
DROP POLICY IF EXISTS "events_update_creator_or_manager" ON calendar_events;
CREATE POLICY "events_update_creator_or_manager" ON calendar_events
  FOR UPDATE USING (
    created_by = auth.uid()
    OR public.user_has_hospital_role(
         hospital_id,
         ARRAY['super_admin','org_admin','hospital_admin','practice_manager']::app_role[]
       )
  );

-- ── KB ARTICLES UPDATE ─────────────────────────────────────
DROP POLICY IF EXISTS "kb_update_author_or_admin" ON kb_articles;
CREATE POLICY "kb_update_author_or_admin" ON kb_articles
  FOR UPDATE USING (
    author_id = auth.uid()
    OR public.user_has_role('hospital_admin')
    OR public.user_has_role('org_admin')
    OR public.user_has_role('super_admin')
  );

-- ── CALENDAR CONFLICTS ─────────────────────────────────────
DROP POLICY IF EXISTS "conflicts_select_hospital" ON calendar_conflicts;
CREATE POLICY "conflicts_select_hospital" ON calendar_conflicts
  FOR SELECT USING (
    hospital_id = ANY(public.user_hospital_ids())
  );

-- ── SUPPORT TICKETS ────────────────────────────────────────
DROP POLICY IF EXISTS "tickets_select" ON support_tickets;
CREATE POLICY "tickets_select" ON support_tickets
  FOR SELECT USING (
    user_id = auth.uid()
    OR (
      org_id = public.user_org_id()
      AND (
        public.user_has_role('hospital_admin')
        OR public.user_has_role('org_admin')
        OR public.user_has_role('super_admin')
        OR public.user_has_role('it_admin')
      )
    )
  );

DROP POLICY IF EXISTS "tickets_insert" ON support_tickets;
CREATE POLICY "tickets_insert" ON support_tickets
  FOR INSERT WITH CHECK (
    org_id  = public.user_org_id()
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "tickets_update" ON support_tickets;
CREATE POLICY "tickets_update" ON support_tickets
  FOR UPDATE USING (
    user_id = auth.uid()
    OR (
      org_id = public.user_org_id()
      AND (
        public.user_has_role('hospital_admin')
        OR public.user_has_role('org_admin')
        OR public.user_has_role('super_admin')
        OR public.user_has_role('it_admin')
      )
    )
  );

DROP POLICY IF EXISTS "ticket_comments_select" ON support_ticket_comments;
CREATE POLICY "ticket_comments_select" ON support_ticket_comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM support_tickets
      WHERE id = support_ticket_comments.ticket_id
        AND (
          user_id = auth.uid()
          OR (
            org_id = public.user_org_id()
            AND (
              public.user_has_role('hospital_admin')
              OR public.user_has_role('org_admin')
              OR public.user_has_role('super_admin')
              OR public.user_has_role('it_admin')
            )
          )
        )
    )
    AND (
      is_internal = FALSE
      OR public.user_has_role('hospital_admin')
      OR public.user_has_role('org_admin')
      OR public.user_has_role('super_admin')
      OR public.user_has_role('it_admin')
    )
  );
