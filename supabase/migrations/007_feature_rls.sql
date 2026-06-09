-- ============================================================
-- Migration 007: RLS Policies for Feature Tables
-- ============================================================

ALTER TABLE tasks                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_attachments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_courses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_modules        ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_course_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_module_progress    ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_certificates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_user_settings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions           ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TASKS
-- ============================================================
CREATE POLICY "tasks_select_org" ON tasks
  FOR SELECT USING (org_id = auth.org_id());

CREATE POLICY "tasks_insert_org" ON tasks
  FOR INSERT WITH CHECK (
    org_id = auth.org_id()
    AND created_by = auth.uid()
  );

CREATE POLICY "tasks_update_involved" ON tasks
  FOR UPDATE USING (
    org_id = auth.org_id()
    AND (
      created_by = auth.uid()
      OR assigned_to = auth.uid()
      OR auth.has_role('hospital_admin')
      OR auth.has_role('org_admin')
      OR auth.has_role('super_admin')
      OR auth.has_role('practice_manager')
    )
  );

CREATE POLICY "tasks_delete_creator_or_admin" ON tasks
  FOR DELETE USING (
    created_by = auth.uid()
    OR auth.has_role('hospital_admin')
    OR auth.has_role('org_admin')
    OR auth.has_role('super_admin')
  );

-- Task Comments
CREATE POLICY "task_comments_select" ON task_comments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM tasks WHERE id = task_comments.task_id AND org_id = auth.org_id())
  );

CREATE POLICY "task_comments_insert" ON task_comments
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM tasks WHERE id = task_comments.task_id AND org_id = auth.org_id())
  );

CREATE POLICY "task_comments_delete_own" ON task_comments
  FOR DELETE USING (user_id = auth.uid());

-- Task Attachments
CREATE POLICY "task_attachments_select" ON task_attachments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM tasks WHERE id = task_attachments.task_id AND org_id = auth.org_id())
  );

CREATE POLICY "task_attachments_insert" ON task_attachments
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM tasks WHERE id = task_attachments.task_id AND org_id = auth.org_id())
  );

CREATE POLICY "task_attachments_delete_own" ON task_attachments
  FOR DELETE USING (user_id = auth.uid());

-- ============================================================
-- TRAINING
-- ============================================================
CREATE POLICY "training_courses_select" ON training_courses
  FOR SELECT USING (
    org_id = auth.org_id()
    AND (
      is_published = TRUE
      OR created_by = auth.uid()
      OR auth.has_role('hospital_admin')
      OR auth.has_role('org_admin')
      OR auth.has_role('super_admin')
      OR auth.has_role('hr')
    )
  );

CREATE POLICY "training_courses_manage_admin" ON training_courses
  FOR ALL USING (
    org_id = auth.org_id()
    AND (
      auth.has_role('hospital_admin')
      OR auth.has_role('org_admin')
      OR auth.has_role('super_admin')
      OR auth.has_role('hr')
    )
  );

CREATE POLICY "training_modules_select" ON training_modules
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM training_courses
      WHERE id = training_modules.course_id
        AND org_id = auth.org_id()
        AND (is_published = TRUE OR auth.has_role('hospital_admin') OR auth.has_role('org_admin') OR auth.has_role('super_admin') OR auth.has_role('hr'))
    )
  );

-- Enrollments — own record only; admins/hr see all
CREATE POLICY "enrollments_own" ON user_course_enrollments
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "enrollments_admin_read" ON user_course_enrollments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM training_courses
      WHERE id = user_course_enrollments.course_id AND org_id = auth.org_id()
    )
    AND (
      auth.has_role('hospital_admin')
      OR auth.has_role('org_admin')
      OR auth.has_role('super_admin')
      OR auth.has_role('hr')
    )
  );

CREATE POLICY "module_progress_own" ON user_module_progress
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "certificates_own" ON training_certificates
  FOR SELECT USING (user_id = auth.uid());

-- ============================================================
-- USER PREFERENCES
-- ============================================================
CREATE POLICY "preferences_own" ON user_preferences
  FOR ALL USING (user_id = auth.uid());

-- ============================================================
-- AI USER SETTINGS
-- ============================================================
CREATE POLICY "ai_settings_own" ON ai_user_settings
  FOR ALL USING (user_id = auth.uid());

-- ============================================================
-- SUPPORT TICKETS
-- ============================================================
CREATE POLICY "tickets_select" ON support_tickets
  FOR SELECT USING (
    user_id = auth.uid()
    OR (
      org_id = auth.org_id()
      AND (
        auth.has_role('hospital_admin')
        OR auth.has_role('org_admin')
        OR auth.has_role('super_admin')
        OR auth.has_role('it_admin')
      )
    )
  );

CREATE POLICY "tickets_insert" ON support_tickets
  FOR INSERT WITH CHECK (
    org_id = auth.org_id()
    AND user_id = auth.uid()
  );

CREATE POLICY "tickets_update" ON support_tickets
  FOR UPDATE USING (
    user_id = auth.uid()
    OR (
      org_id = auth.org_id()
      AND (
        auth.has_role('hospital_admin')
        OR auth.has_role('org_admin')
        OR auth.has_role('super_admin')
        OR auth.has_role('it_admin')
      )
    )
  );

-- Ticket Comments
CREATE POLICY "ticket_comments_select" ON support_ticket_comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM support_tickets
      WHERE id = support_ticket_comments.ticket_id
        AND (
          user_id = auth.uid()
          OR org_id = auth.org_id() AND (
            auth.has_role('hospital_admin') OR auth.has_role('org_admin')
            OR auth.has_role('super_admin') OR auth.has_role('it_admin')
          )
        )
    )
    AND (
      is_internal = FALSE
      OR auth.has_role('hospital_admin')
      OR auth.has_role('org_admin')
      OR auth.has_role('super_admin')
      OR auth.has_role('it_admin')
    )
  );

CREATE POLICY "ticket_comments_insert" ON support_ticket_comments
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- ============================================================
-- USER SESSIONS
-- ============================================================
CREATE POLICY "sessions_own" ON user_sessions
  FOR ALL USING (user_id = auth.uid());
