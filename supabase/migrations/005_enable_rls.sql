-- ============================================================
-- Migration 005: Enable RLS + Core Policies
-- Vet AI Operating System
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE hospitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_hospital_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_event_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlook_sync_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_article_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- ORGANIZATIONS
-- ============================================================
CREATE POLICY "orgs_select_members" ON organizations
  FOR SELECT USING (
    id = auth.org_id()
  );

-- ============================================================
-- HOSPITALS
-- ============================================================
CREATE POLICY "hospitals_select_accessible" ON hospitals
  FOR SELECT USING (
    org_id = auth.org_id()
    AND id = ANY(auth.accessible_hospital_ids())
  );

-- ============================================================
-- PROFILES
-- ============================================================
CREATE POLICY "profiles_select_org" ON profiles
  FOR SELECT USING (org_id = auth.org_id());

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (id = auth.uid());

-- ============================================================
-- USER HOSPITAL ROLES
-- ============================================================
CREATE POLICY "roles_select_org" ON user_hospital_roles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND org_id = (
        SELECT org_id FROM profiles WHERE id = user_hospital_roles.user_id
      )
    )
  );

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE POLICY "notifications_own" ON notifications
  FOR ALL USING (user_id = auth.uid());

-- ============================================================
-- AUDIT LOGS — read-only for admins, no user modification
-- ============================================================
CREATE POLICY "audit_logs_select_admins" ON audit_logs
  FOR SELECT USING (
    org_id = auth.org_id()
    AND auth.has_role('hospital_admin')
    OR auth.has_role('org_admin')
    OR auth.has_role('super_admin')
  );

-- No INSERT/UPDATE/DELETE policies = only service role can write audit logs

-- ============================================================
-- CHANNELS
-- ============================================================
CREATE POLICY "channels_select_accessible" ON channels
  FOR SELECT USING (
    org_id = auth.org_id()
    AND (
      hospital_id = ANY(auth.accessible_hospital_ids())
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

-- ============================================================
-- MESSAGES
-- ============================================================
CREATE POLICY "messages_select_channel_members" ON messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM channel_members
      WHERE channel_id = messages.channel_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "messages_insert_channel_members" ON messages
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM channel_members
      WHERE channel_id = messages.channel_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "messages_update_own" ON messages
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "messages_delete_own" ON messages
  FOR DELETE USING (user_id = auth.uid());

-- ============================================================
-- CALENDAR EVENTS
-- ============================================================
CREATE POLICY "events_select_hospital" ON calendar_events
  FOR SELECT USING (
    org_id = auth.org_id()
    AND (
      hospital_id = ANY(auth.accessible_hospital_ids())
      OR hospital_id IS NULL
    )
  );

CREATE POLICY "events_insert_managers" ON calendar_events
  FOR INSERT WITH CHECK (
    org_id = auth.org_id()
    AND created_by = auth.uid()
    AND (
      hospital_id IS NULL
      OR auth.has_hospital_role(
        hospital_id,
        ARRAY['super_admin', 'org_admin', 'hospital_admin', 'practice_manager']::app_role[]
      )
    )
  );

CREATE POLICY "events_update_creator_or_manager" ON calendar_events
  FOR UPDATE USING (
    created_by = auth.uid()
    OR auth.has_hospital_role(
      hospital_id,
      ARRAY['super_admin', 'org_admin', 'hospital_admin', 'practice_manager']::app_role[]
    )
  );

-- ============================================================
-- KB ARTICLES
-- ============================================================
CREATE POLICY "kb_select_published" ON kb_articles
  FOR SELECT USING (
    org_id = auth.org_id()
    AND (
      hospital_id = ANY(auth.accessible_hospital_ids())
      OR hospital_id IS NULL
    )
    AND (
      status = 'published'
      OR author_id = auth.uid()
      OR auth.has_role('hospital_admin')
      OR auth.has_role('org_admin')
      OR auth.has_role('super_admin')
    )
  );

CREATE POLICY "kb_insert_staff" ON kb_articles
  FOR INSERT WITH CHECK (
    org_id = auth.org_id()
    AND author_id = auth.uid()
  );

CREATE POLICY "kb_update_author_or_admin" ON kb_articles
  FOR UPDATE USING (
    author_id = auth.uid()
    OR auth.has_role('hospital_admin')
    OR auth.has_role('org_admin')
    OR auth.has_role('super_admin')
  );

-- ============================================================
-- AI CONVERSATIONS
-- ============================================================
CREATE POLICY "ai_conversations_own" ON ai_conversations
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "ai_messages_own" ON ai_messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM ai_conversations
      WHERE id = ai_messages.conversation_id AND user_id = auth.uid()
    )
  );

-- ============================================================
-- DOCUMENT CHUNKS (service role only for write, all org members can read)
-- ============================================================
CREATE POLICY "chunks_select_org" ON document_chunks
  FOR SELECT USING (
    org_id = auth.org_id()
    AND (
      hospital_id = ANY(auth.accessible_hospital_ids())
      OR hospital_id IS NULL
    )
  );
-- Write: service role only (no policy = service role bypass)

-- ============================================================
-- OUTLOOK SYNC TOKENS (own only)
-- ============================================================
CREATE POLICY "outlook_tokens_own" ON outlook_sync_tokens
  FOR ALL USING (user_id = auth.uid());

-- ============================================================
-- CALENDAR CONFLICTS (hospital-scoped)
-- ============================================================
CREATE POLICY "conflicts_select_hospital" ON calendar_conflicts
  FOR SELECT USING (
    hospital_id = ANY(auth.accessible_hospital_ids())
  );
